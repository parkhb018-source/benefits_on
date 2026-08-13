// 서울시 청년 임차보증금 계산기 — 순수 함수 계산 엔진
// 정책 숫자는 이 파일에 없다. 전부 ../data/youth-deposit-policy.json 에서 온다.
// 법/정책이 바뀌면 policy.json만 수정하면 된다.

/**
 * @typedef {Object} YouthDepositInput
 * @property {number} deposit          임차보증금 (원)
 * @property {number} age              신청자 만 나이
 * @property {'single'|'married'} maritalStatus
 * @property {number} income           연소득 (미혼: 본인, 기혼: 부부합산, 원)
 * @property {boolean} isHouseholder   무주택 세대주 또는 세대주 예정자 여부
 * @property {number} [monthlyRent]    월세 (전세면 0)
 */

/**
 * 자격조건 판정. 계산과 완전히 분리된 함수 — 계산 가능 여부와 무관하게 항상 실행 가능.
 * @param {YouthDepositInput} input
 * @param {Object} policy data/youth-deposit-policy.json 의 내용
 * @returns {{ eligible: boolean, reasons: string[] }}
 */
export function checkEligibility(input, policy) {
  const e = policy.eligibility;
  const reasons = [];

  if (!(input.age >= e.ageMin && input.age <= e.ageMax)) {
    reasons.push(`나이가 지원 대상 범위(만 ${e.ageMin}~${e.ageMax}세)를 벗어났습니다.`);
  }

  const incomeMax = input.maritalStatus === 'married' ? e.incomeMarriedMax : e.incomeSingleMax;
  if (input.income > incomeMax) {
    reasons.push(
      input.maritalStatus === 'married'
        ? `부부합산 연소득이 기준(${formatWon(incomeMax)}) 이하이어야 합니다.`
        : `본인 연소득이 기준(${formatWon(incomeMax)}) 이하이어야 합니다.`
    );
  }

  if (!input.isHouseholder) {
    reasons.push('무주택 세대주(또는 대출 실행 후 1개월 이내 세대주 예정자)만 지원 가능합니다.');
  }

  if (input.deposit > e.depositMax) {
    reasons.push(`임차보증금이 기준(${formatWon(e.depositMax)}) 이하이어야 합니다.`);
  }

  const rent = input.monthlyRent || 0;
  if (rent > e.monthlyRentMax) {
    reasons.push(`월세가 기준(${formatWon(e.monthlyRentMax)}) 이하이어야 합니다.`);
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * 대출한도·자기자금·이자 계산. 자격조건 충족 여부와 무관하게 항상 계산값을 반환한다
 * (자격 미충족이어도 "만약 지원받는다면" 참고용 추정치를 보여주기 위함).
 * @param {YouthDepositInput} input
 * @param {Object} policy
 * @returns {{
 *   estimatedMaxLoan: number,
 *   requiredSelfFunds: number,
 *   sourceRate: number,
 *   selfRate: number,
 *   annualInterest: number,
 *   monthlyInterest: number
 * }}
 */
export function calculateLoan(input, policy) {
  const loan = policy.loan;
  const subsidy = policy.interestSubsidy;

  const estimatedMaxLoan = Math.min(
    input.deposit * loan.loanRatioOfDeposit,
    loan.loanAbsoluteMax
  );
  const requiredSelfFunds = input.deposit - estimatedMaxLoan;

  const selfRate = Math.max(subsidy.exampleBankRate - subsidy.baseRate, subsidy.minSelfRate);
  const annualInterest = estimatedMaxLoan * selfRate;
  const monthlyInterest = annualInterest / 12;

  return {
    estimatedMaxLoan: Math.round(estimatedMaxLoan),
    requiredSelfFunds: Math.round(requiredSelfFunds),
    sourceRate: subsidy.exampleBankRate,
    selfRate,
    annualInterest: Math.round(annualInterest),
    monthlyInterest: Math.round(monthlyInterest),
  };
}

function formatWon(amount) {
  return amount.toLocaleString('ko-KR') + '원';
}
