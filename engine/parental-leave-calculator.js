// 육아휴직급여 계산기 — 순수 함수 계산 엔진
// 정책 숫자는 이 파일에 없다. 전부 ../data/parental-leave-policy.json 에서 온다.
// 법/정책이 바뀌면 policy.json만 수정하면 된다.
//
// 계산 흐름: 개월차별 구간 선택(유형별 → 없으면 일반) → 통상임금 × 지급률
//           → 상한·하한 적용(calcMonthlyBenefit) → 월별 배열 + 총액(calcSchedule)

/**
 * @typedef {'general'|'parents66'|'singleParent'} ParentalLeaveType
 */

/**
 * @typedef {Object} ParentalLeaveInput
 * @property {number} ordinaryWage  월 통상임금 (원)
 * @property {number} months        육아휴직 사용 개월 수
 * @property {ParentalLeaveType} type
 */

/**
 * @typedef {Object} EligibilityInput
 * @property {number} insuredDays   고용보험 피보험단위기간 (일)
 * @property {number} leaveDays     같은 자녀에 대한 육아휴직 사용 일수
 */

const TYPES = ['general', 'parents66', 'singleParent'];

function findBracket(brackets, monthIndex) {
  for (const b of brackets) {
    if (monthIndex >= b.fromMonth && (b.toMonth === null || monthIndex <= b.toMonth)) return b;
  }
  return null;
}

/**
 * 단월 육아휴직급여 — 고용보험법 시행령 제95조·제95조의3.
 * 유형별 구간에 해당 개월차가 없으면(예: 6+6의 7개월차) 일반 구간을 따른다.
 * 하한은 "통상임금 × 지급률"이 하한보다 적으면 하한액을 지급한다(시행령 제95조 제1항 각 호 단서).
 * @param {number} monthIndex 개월차 (1부터 시작)
 * @param {number} ordinaryWage 월 통상임금(원)
 * @param {ParentalLeaveType} type
 * @param {Object} policy data/parental-leave-policy.json 의 내용
 * @returns {{
 *   month: number, rate: number, cap: number, floor: number,
 *   raw: number, amount: number, capApplied: boolean, floorApplied: boolean
 * }}
 */
export function calcMonthlyBenefit(monthIndex, ordinaryWage, type, policy) {
  if (!TYPES.includes(type)) throw new Error('알 수 없는 유형입니다: ' + type);
  const b = findBracket(policy[type].brackets, monthIndex)
    || findBracket(policy.general.brackets, monthIndex);
  if (!b) throw new Error('구간을 찾을 수 없습니다');

  const floor = policy.benefitFloor;
  const raw = Math.round(ordinaryWage * b.rate);
  const amount = Math.min(Math.max(raw, floor), b.cap);
  return {
    month: monthIndex,
    rate: b.rate,
    cap: b.cap,
    floor,
    raw,
    amount,
    capApplied: raw > b.cap,
    floorApplied: raw < floor,
  };
}

/**
 * 사용 개월 수만큼 월별 지급액과 총액을 계산한다.
 * @param {ParentalLeaveInput} input
 * @param {Object} policy
 * @returns {{ schedule: ReturnType<typeof calcMonthlyBenefit>[], total: number }}
 */
export function calcSchedule(input, policy) {
  const { ordinaryWage, months, type } = input;
  const maxMonths = policy.eligibility.maxLeaveMonths;
  if (!Number.isInteger(months) || months < 1 || months > maxMonths) {
    throw new Error(`사용 개월 수는 1~${maxMonths} 사이여야 합니다`);
  }

  const schedule = [];
  for (let m = 1; m <= months; m++) {
    schedule.push(calcMonthlyBenefit(m, ordinaryWage, type, policy));
  }
  const total = schedule.reduce((sum, row) => sum + row.amount, 0);
  return { schedule, total };
}

/**
 * 수급 요건 판정. 계산과 완전히 분리된 함수 — 계산 가능 여부와 무관하게 항상 실행 가능.
 * @param {EligibilityInput} input
 * @param {Object} policy
 * @returns {{ eligible: boolean, reasons: string[] }}
 */
export function checkEligibility(input, policy) {
  const e = policy.eligibility;
  const reasons = [];

  if (!(input.insuredDays >= e.insuredDaysMin)) {
    reasons.push(`고용보험 피보험단위기간이 ${e.insuredDaysMin}일 이상이어야 합니다.`);
  }
  if (!(input.leaveDays >= e.leaveDaysMin)) {
    reasons.push(`같은 자녀에 대해 육아휴직을 ${e.leaveDaysMin}일 이상 사용해야 합니다.`);
  }

  return { eligible: reasons.length === 0, reasons };
}
