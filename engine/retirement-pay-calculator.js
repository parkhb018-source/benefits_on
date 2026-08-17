// 퇴직금 실수령액 계산기 — 순수 함수 계산 엔진
// 정책 숫자는 이 파일에 없다. 전부 ../data/retirement-pay-net-calculator-policy.json 에서 온다.
// 법/정책이 바뀌면 policy.json만 수정하면 된다.
//
// 계산 흐름: 근속기간 → 평균임금 → 퇴직금 → 퇴직소득공제(근속연수공제) → 환산급여
//           → 환산급여공제 → 과세표준 → 퇴직소득세(연분연승) → 지방소득세 → 예상 세후 금액

/**
 * @typedef {Object} RetirementPayInput
 * @property {string} hireDate     입사일 (YYYY-MM-DD)
 * @property {string} resignDate   퇴사일 (YYYY-MM-DD)
 * @property {number} monthlyWage  퇴직 전 3개월 평균 월급여 (원)
 * @property {number} [annualExtra] 연간 상여금·기타수당 총액 (원, 기본값 0)
 * @property {number} [age]        만 나이 (IRP 고지 판단용, 선택)
 */

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * 근속기간 계산. 계산과 완전히 분리된 함수 — 자격조건과 무관하게 항상 실행 가능.
 * @param {RetirementPayInput} input
 * @returns {{ serviceDays: number, taxServiceYears: number }}
 */
export function calculateServicePeriod(input) {
  const hire = new Date(input.hireDate);
  const resign = new Date(input.resignDate);
  const serviceDays = daysBetween(hire, resign);

  // 소득세법 시행령 제42조의2 — 근속연수=(총근속월수-중복월수)/12,
  // 1개월 미만은 1개월로, 1년 미만의 월수는 1년으로 본다.
  let months = (resign.getFullYear() - hire.getFullYear()) * 12 + (resign.getMonth() - hire.getMonth());
  if (resign.getDate() < hire.getDate()) months -= 1;
  const taxServiceYears = Math.max(Math.ceil(months / 12), 1);

  return { serviceDays, taxServiceYears };
}

/**
 * 자격조건(계속근로기간) 판정 — LAW-RET-01.
 * 소정근로시간(주 15시간) 요건은 5개 입력 제한으로 별도 입력받지 않으며, UI 안내문으로만 고지한다(LAW-RET-02).
 * @param {RetirementPayInput} input
 * @param {Object} policy data/retirement-pay-net-calculator-policy.json 의 내용
 * @returns {{ eligible: boolean, reasons: string[] }}
 */
export function checkEligibility(input, policy) {
  const { serviceDays } = calculateServicePeriod(input);
  const reasons = [];

  if (serviceDays < policy.eligibility.minServiceDays) {
    reasons.push('계속근로기간이 1년 미만이면 법정 퇴직금 지급 대상이 아닙니다.');
  }

  return { eligible: reasons.length === 0, serviceDays, reasons };
}

/**
 * 평균임금 산정 — CAL-RET-01 (3개월 평균 월급여 기반 간편 계산).
 * @param {RetirementPayInput} input
 * @param {Object} policy
 * @returns {{ periodDays: number, dailyAverageWage: number }}
 */
export function calculateAverageWage(input, policy) {
  const resign = new Date(input.resignDate);
  const periodStart = new Date(resign);
  periodStart.setMonth(periodStart.getMonth() - policy.severancePayFormula.averageWagePeriodMonths);
  const periodDays = daysBetween(periodStart, resign);

  const annualExtra = input.annualExtra || 0;
  const totalWage =
    input.monthlyWage * policy.severancePayFormula.averageWagePeriodMonths +
    (annualExtra * policy.severancePayFormula.averageWagePeriodMonths) / 12;

  return { periodDays, dailyAverageWage: totalWage / periodDays };
}

/**
 * 법정 퇴직금 산출(간편 계산) — CAL-RET-02.
 * @param {RetirementPayInput} input
 * @param {Object} policy
 * @returns {{ severancePay: number, serviceDays: number, dailyAverageWage: number }}
 */
export function calculateSeverancePay(input, policy) {
  const { serviceDays } = calculateServicePeriod(input);
  const { dailyAverageWage } = calculateAverageWage(input, policy);
  const raw =
    dailyAverageWage * policy.severancePayFormula.paidDaysPerYear * (serviceDays / policy.severancePayFormula.daysPerYear);
  const severancePay = Math.floor(raw);
  return { severancePay, serviceDays, dailyAverageWage };
}

function findBracket(brackets, amount) {
  for (const b of brackets) {
    if (b.max === null || amount <= b.max) return b;
  }
  throw new Error('구간을 찾을 수 없습니다');
}

function serviceYearDeduction(years, policy) {
  const b = findBracket(policy.retirementTax.serviceYearDeductionBrackets, years);
  return b.base + (years - b.threshold) * b.perYearRate;
}

function convertedSalaryDeduction(amount, policy) {
  if (amount < 0) return 0;
  const b = findBracket(policy.retirementTax.convertedSalaryDeductionBrackets, amount);
  return b.base + (amount - b.threshold) * b.rate;
}

function progressiveTax(taxBase, policy) {
  if (taxBase <= 0) return 0;
  const b = findBracket(policy.retirementTax.baseTaxRateBrackets, taxBase);
  return taxBase * b.rate - b.progressiveDeduction;
}

/**
 * 퇴직소득세·지방소득세 계산 — TAX-RET-01~06(근속연수공제 → 환산급여 → 환산급여공제 → 과세표준 → 연분연승법).
 * @param {number} severancePay 세전 예상 퇴직금(원)
 * @param {number} taxServiceYears 세금계산용 근속연수
 * @param {Object} policy
 * @returns {{
 *   serviceYearDeduction: number,
 *   convertedSalary: number,
 *   convertedSalaryDeduction: number,
 *   taxBase: number,
 *   retirementIncomeTax: number,
 *   localIncomeTax: number
 * }}
 */
export function calculateRetirementTax(severancePay, taxServiceYears, policy) {
  const svcDeduction = serviceYearDeduction(taxServiceYears, policy);
  const afterSvcDeduction = Math.max(severancePay - svcDeduction, 0);
  const convertedSalary = (afterSvcDeduction / taxServiceYears) * 12;
  const convDeduction = convertedSalaryDeduction(convertedSalary, policy);

  // 과세표준: 국고금 관리법 제47조제2항 — 1원 미만 절사(법적 근거 확정)
  const taxBaseRaw = Math.max(convertedSalary - convDeduction, 0);
  const taxBase = Math.floor(taxBaseRaw);

  const convertedTax = progressiveTax(taxBase, policy);
  // 최종 산출세액: 원 단위 미만 절사(실무 관행, 전용 법령 조항은 미확정 — 03_Policy_Sources.md SRC-11 참조)
  const retirementIncomeTax = Math.floor((convertedTax / 12) * taxServiceYears);
  const localIncomeTax = Math.floor(retirementIncomeTax * policy.localIncomeTax.rateOfRetirementTax);

  return {
    serviceYearDeduction: svcDeduction,
    convertedSalary,
    convertedSalaryDeduction: convDeduction,
    taxBase,
    retirementIncomeTax,
    localIncomeTax,
  };
}

/**
 * IRP 의무이전 대상 여부 — TAX-RET-07-IRP. 계산값에는 영향을 주지 않고 UI 고지 여부만 판단한다.
 * @param {RetirementPayInput} input
 * @param {number} severancePay
 * @param {Object} policy
 * @returns {boolean}
 */
export function isIrpMandatoryTransferTarget(input, severancePay, policy) {
  if (input.age === undefined || input.age === null) return false;
  return input.age < policy.irpMandatoryTransfer.ageThreshold && severancePay > policy.irpMandatoryTransfer.amountThreshold;
}

/**
 * 전체 계산 파이프라인. 자격조건 미충족이어도 계산값 자체는 반환한다(호출측에서 eligible로 분기).
 * @param {RetirementPayInput} input
 * @param {Object} policy
 * @returns {{
 *   eligibility: { eligible: boolean, serviceDays: number, reasons: string[] },
 *   taxServiceYears: number,
 *   severancePay: number,
 *   dailyAverageWage: number,
 *   tax: ReturnType<typeof calculateRetirementTax>,
 *   netPay: number,
 *   irpNoticeRequired: boolean
 * }}
 */
export function calculate(input, policy) {
  const eligibility = checkEligibility(input, policy);
  const { taxServiceYears } = calculateServicePeriod(input);
  const { severancePay, dailyAverageWage } = calculateSeverancePay(input, policy);
  const tax = calculateRetirementTax(severancePay, taxServiceYears, policy);
  const netPay = severancePay - tax.retirementIncomeTax - tax.localIncomeTax;
  const irpNoticeRequired = isIrpMandatoryTransferTarget(input, severancePay, policy);

  return { eligibility, taxServiceYears, severancePay, dailyAverageWage, tax, netPay, irpNoticeRequired };
}
