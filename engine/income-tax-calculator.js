// 근로소득세·4대보험 계산기 — 순수 함수 계산 엔진
// 정책 숫자는 이 파일에 없다. 전부 ../data/income-tax-policy.json 에서 온다.
// 법/정책이 바뀌면 policy.json만 수정하면 된다.
//
// 계산 흐름: 4대보험(월) → 근로소득공제(한도 포함) → 종합소득세(초과누진세율)
//           → 근로소득세액공제 → 실수령액 전체 흐름(calcNetSalary)

/**
 * @typedef {Object} NetSalaryInput
 * @property {number} annualGross  연간 총급여 (원)
 * @property {number} dependents   부양가족 수 (본인 포함)
 */

function findBracket(brackets, amount) {
  for (const b of brackets) {
    if (b.max === null || amount <= b.max) return b;
  }
  throw new Error('구간을 찾을 수 없습니다');
}

/**
 * 4대보험(국민연금·건강보험·장기요양보험·고용보험) 월 공제액 계산.
 * @param {number} monthlyWage 월 급여(원)
 * @param {Object} policy data/income-tax-policy.json 의 내용
 * @returns {{ pension: number, health: number, ltCare: number, employment: number }}
 */
export function calcInsurance(monthlyWage, policy) {
  const p = policy.insurance;
  const pension = Math.round(Math.min(monthlyWage, p.pensionCap) * p.pensionRate);
  const health = Math.round(monthlyWage * p.healthRate);
  const ltCare = Math.round(health * p.ltCareRate);
  const employment = Math.round(monthlyWage * p.employmentRate);
  return { pension, health, ltCare, employment };
}

/**
 * 근로소득공제(연간) — 소득세법 제47조. 한도(cap) 적용까지 이 함수 안에서 처리한다.
 * @param {number} annualGross 연간 총급여(원)
 * @param {Object} policy
 * @returns {number}
 */
export function getWageDeduction(annualGross, policy) {
  const b = findBracket(policy.wageDeduction.brackets, annualGross);
  const raw = b.base + (annualGross - b.threshold) * b.rate;
  return Math.min(raw, policy.wageDeduction.cap);
}

/**
 * 종합소득세(8단계 초과누진세율) 산출.
 * @param {number} taxableIncome 과세표준(원)
 * @param {Object} policy
 * @returns {number}
 */
export function calcIncomeTax(taxableIncome, policy) {
  const b = findBracket(policy.incomeTaxBrackets, taxableIncome);
  return Math.round(taxableIncome * b.rate - b.progressiveDeduction);
}

/**
 * 근로소득세액공제 — 산출세액 130만원 이하분 55%, 초과분 30%, 총급여 구간별 한도 적용.
 * @param {number} calculatedTax 산출세액(원)
 * @param {number} annualGross 연간 총급여(원)
 * @param {Object} policy
 * @returns {number}
 */
export function calcWageIncomeTaxCredit(calculatedTax, annualGross, policy) {
  const c = policy.wageIncomeTaxCredit;
  const base = c.lowThreshold * c.lowRate;
  const credit = calculatedTax <= c.lowThreshold
    ? calculatedTax * c.lowRate
    : base + (calculatedTax - c.lowThreshold) * c.highRate;
  const capBracket = findBracket(c.capBrackets, annualGross);
  return Math.min(credit, capBracket.cap);
}

/**
 * 실수령액 전체 계산 파이프라인 — 4대보험 → 근로소득공제 → 과세표준 → 소득세 → 지방소득세.
 * @param {NetSalaryInput} input
 * @param {Object} policy
 * @returns {{
 *   insurance: { pension: number, health: number, ltCare: number, employment: number },
 *   incomeTax: number,
 *   localTax: number,
 *   totalDeduction: number,
 *   netMonthly: number,
 *   netAnnual: number
 * }}
 */
export function calcNetSalary(input, policy) {
  const { annualGross, dependents } = input;
  const monthly = annualGross / 12;

  const insurance = calcInsurance(monthly, policy);
  const monthlyInsuranceTotal = insurance.pension + insurance.health + insurance.ltCare + insurance.employment;
  const annualInsurance = monthlyInsuranceTotal * 12;

  const wageDeduction = getWageDeduction(annualGross, policy);
  const basicDeduction = dependents * policy.basicDeductionPerPerson;
  const taxableIncome = Math.max(0, annualGross - wageDeduction - basicDeduction - annualInsurance);

  const calculatedTax = Math.max(0, calcIncomeTax(taxableIncome, policy));
  const wageCredit = calcWageIncomeTaxCredit(calculatedTax, annualGross, policy);
  const annualTax = Math.max(0, calculatedTax - wageCredit);
  const incomeTax = Math.round(annualTax / 12);
  const localTax = Math.round(incomeTax * policy.localIncomeTax.rate);

  const totalDeduction = monthlyInsuranceTotal + incomeTax + localTax;
  const netMonthly = Math.round(monthly - totalDeduction);
  const netAnnual = netMonthly * 12;

  return { insurance, incomeTax, localTax, totalDeduction, netMonthly, netAnnual };
}
