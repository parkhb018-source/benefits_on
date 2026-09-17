// 이익 변동 진단 — 계산 + 결과 문구 엔진
// DOM·localStorage·시간·난수에 의존하지 않는다(동일 입력 → 동일 출력). 로케일은 ko-KR 고정.
//
// 계산 흐름: 두 기간(지난달/이번 달) 정규화 → 이익 계산 → 이익 증감 → 항목별 영향 → 영향 순위 → 결과 문구
// "원인"이라는 단어는 쓰지 않는다 — "이익 변동에 영향을 준 항목"으로 표현한다.
//
// 기준 문서: docs/tools/profit-drop-diagnosis/02_Rule_Engine_Profit_Drop_Diagnosis.md 와 1:1 대응.
// 결과에 쓰이는 모든 문구(상태 헤드라인, 1등 항목 문장, "원인 아님" 문장, 행동 힌트)는 이 파일에만 있다.

export const FIELD_KEYS = ['sales', 'foodCost', 'laborCost', 'rent', 'platformFee', 'otherCost'];

const LABELS = {
  sales: '매출', foodCost: '식재료비', laborCost: '인건비',
  rent: '임대료', platformFee: '수수료', otherCost: '기타비용',
};

// 동점 타이브레이크 순서: 매출 → 식재료비 → 인건비 → 수수료 → 임대료 → 기타
const TIE_BREAK_ORDER = ['sales', 'foodCost', 'laborCost', 'platformFee', 'rent', 'otherCost'];

const ACTION_TABLE = {
  foodCost: { text: '주요 원재료 단가, 폐기·로스, 매입량 변화 확인', toolUrl: null },
  laborCost: { text: '근무시간, 인원, 영업일수, 추가수당 변화 확인', toolUrl: '/pages/calc-retirement-pay' },
  platformFee: { text: '배달·결제 수수료율과 주문 구성 변화 확인', toolUrl: '/pages/tools/delivery-fee-calc/' },
  sales: { text: '고객수와 객단가 변화를 구분해 확인', toolUrl: '/pages/tools/business-survival-calc/' },
  rent: { text: '월세 변경·관리비·추가비용 여부 확인', toolUrl: null },
  otherCost: { text: '큰 단일 비용부터 거래내역 확인', toolUrl: null },
};

const CAVEAT_TEXT = '숫자 변화 기준으로 확인할 항목을 보여드립니다. 실제 원인은 거래내역을 확인해야 합니다.';
const HERO_LABEL = '이익 변동';

export const STATUS = {
  NO_DATA: 'NO_DATA',
  PROFIT_DOWN: 'PROFIT_DOWN',
  PROFIT_UP: 'PROFIT_UP',
  PROFIT_SAME: 'PROFIT_SAME',
  PROFIT_SAME_BUT_ITEMS_CHANGED: 'PROFIT_SAME_BUT_ITEMS_CHANGED',
};

/** 정수(원)를 "12,300원"으로. 화면·문구에 쓰이는 유일한 금액 포매터. */
export function formatWon(n) {
  return Math.round(n).toLocaleString('ko-KR') + '원';
}

/** 콤마·원화기호 문자열 또는 숫자를 정수(원)로. 소수점은 반올림, 음수·안전정수 초과는 에러. */
function normalizeAmount(raw) {
  const n = typeof raw === 'string' ? Number(raw.replace(/[,원\s]/g, '') || 0) : Number(raw);
  if (!Number.isFinite(n)) throw new RangeError(`invalid amount: ${raw}`);
  const rounded = Math.round(n);
  if (!Number.isSafeInteger(rounded)) throw new RangeError(`amount exceeds safe integer range: ${raw}`);
  if (rounded < 0) throw new RangeError(`amount must be >= 0: ${raw}`);
  return rounded;
}

/**
 * @typedef {Object} PeriodInput
 * @property {number|string} sales        매출
 * @property {number|string} foodCost     식재료비(또는 상품매입비)
 * @property {number|string} laborCost    인건비
 * @property {number|string} rent         임대료
 * @property {number|string} platformFee  플랫폼·카드·결제 수수료
 * @property {number|string} otherCost    기타비용
 */

/** 한 기간(지난달 또는 이번 달) 입력을 정규화된 정수 오브젝트로. 누락 필드는 0. */
export function normalizeInput(period = {}) {
  const out = {};
  FIELD_KEYS.forEach((k) => { out[k] = normalizeAmount(period[k] ?? 0); });
  return out;
}

/** 정규화된 기간 → 이익(원). 이익 = 매출 − (식재료비+인건비+임대료+수수료+기타비용). */
export function calculateProfit(n) {
  return n.sales - (n.foodCost + n.laborCost + n.rent + n.platformFee + n.otherCost);
}

/** 정규화된 두 기간 → 항목별 원시 증감(이번 달 − 지난달). */
export function calculateDelta(prevN, currN) {
  const out = {};
  FIELD_KEYS.forEach((k) => { out[k] = currN[k] - prevN[k]; });
  return out;
}

/** 항목별 원시 증감 → 이익 영향(비용은 −증감, 매출은 +증감) + 신규발생/미발생 플래그. */
export function calculateImpacts(deltas, prevN, currN) {
  return FIELD_KEYS.map((id) => {
    const delta = deltas[id];
    const impact = id === 'sales' ? delta : -delta;
    let flag = null;
    if (prevN[id] === 0 && currN[id] > 0) flag = 'NEW_COST';
    else if (prevN[id] > 0 && currN[id] === 0) flag = 'COST_ENDED';
    return { id, name: LABELS[id], delta, impact, prev: prevN[id], curr: currN[id], flag };
  });
}

/** 영향 순위: 절대 영향액 내림차순. 동률이면 고정 타이브레이크 순서. */
export function rankImpacts(impacts) {
  return [...impacts].sort((a, b) => {
    const diff = Math.abs(b.impact) - Math.abs(a.impact);
    if (diff !== 0) return diff;
    return TIE_BREAK_ORDER.indexOf(a.id) - TIE_BREAK_ORDER.indexOf(b.id);
  });
}

function buildActionHints(rankedImpacts) {
  return rankedImpacts
    .filter((i) => i.impact !== 0)
    .map((i) => ({ id: i.id, name: i.name, impact: i.impact, text: ACTION_TABLE[i.id].text, toolUrl: ACTION_TABLE[i.id].toolUrl }));
}

function describeStatus({ profitChange, allZero, allItemsSame }) {
  if (allZero) return STATUS.NO_DATA;
  if (profitChange < 0) return STATUS.PROFIT_DOWN;
  if (profitChange > 0) return STATUS.PROFIT_UP;
  return allItemsSame ? STATUS.PROFIT_SAME : STATUS.PROFIT_SAME_BUT_ITEMS_CHANGED;
}

// status(PROFIT_UP/PROFIT_DOWN)는 이익 증감의 부호만 보고 판정하지만, headline 문구는
// 두 기간이 모두 적자인지(축소) / 흑자에서 적자로 넘어갔는지(전환)까지 반영한다.
// "이익이 늘었습니다"만 보여주면 여전히 적자인 상태를 흑자로 오해할 수 있기 때문이다.
function buildHeadline(status, { profitPrev, profitCurr, profitChange }) {
  switch (status) {
    case STATUS.NO_DATA:
      return '비교할 숫자가 없습니다.';
    case STATUS.PROFIT_DOWN:
      if (profitPrev >= 0 && profitCurr < 0) return '이번 달 적자로 전환되었습니다.';
      return `이번 달 이익이 지난달보다 ${formatWon(-profitChange)} 줄었습니다.`;
    case STATUS.PROFIT_UP:
      if (profitPrev < 0 && profitCurr < 0) return `적자 규모가 ${formatWon(profitChange)} 줄었습니다.`;
      return `이번 달 이익이 지난달보다 ${formatWon(profitChange)} 늘었습니다.`;
    case STATUS.PROFIT_SAME:
      return '지난달과 이번 달 이익이 같습니다.';
    case STATUS.PROFIT_SAME_BUT_ITEMS_CHANGED:
      return '이익은 지난달과 같지만, 항목별로는 변화가 있었습니다.';
    default:
      return '';
  }
}

/**
 * 두 기간을 비교해 이익 변동에 영향을 준 항목을 진단한다.
 * @param {PeriodInput} prev 지난달 입력
 * @param {PeriodInput} curr 이번 달 입력
 */
export function analyze(prev, curr) {
  const prevN = normalizeInput(prev);
  const currN = normalizeInput(curr);
  const profitPrev = calculateProfit(prevN);
  const profitCurr = calculateProfit(currN);
  const profitChange = profitCurr - profitPrev;

  const deltas = calculateDelta(prevN, currN);
  const impacts = calculateImpacts(deltas, prevN, currN);
  const rankedImpacts = rankImpacts(impacts);

  const allZero = FIELD_KEYS.every((k) => prevN[k] === 0 && currN[k] === 0);
  const allItemsSame = FIELD_KEYS.every((k) => deltas[k] === 0);

  const status = describeStatus({ profitChange, allZero, allItemsSame });
  const headline = buildHeadline(status, { profitPrev, profitCurr, profitChange });

  const top = rankedImpacts[0];
  const hasTopImpact = !allZero && !!top && top.impact !== 0;

  const topImpactLine = hasTopImpact
    ? `이익 변동에 가장 큰 영향을 준 항목은 ${formatWon(Math.abs(top.delta))} 변화한 ${top.name}입니다.`
    : '';

  const notCauseLine = allZero
    ? ''
    : hasTopImpact
      ? `다만 이것은 "${top.name}가 원인이다"라는 뜻이 아니라, 숫자상 영향이 가장 크다는 뜻입니다. 실제 원인은 거래내역을 확인해야 알 수 있습니다.`
      : '항목별 변화가 없어 순위를 매길 수 없습니다.';

  return {
    profitPrev, profitCurr, profitChange,
    status,
    heroLabel: HERO_LABEL,
    heroAmount: profitChange,
    headline,
    topImpactLine,
    notCauseLine,
    rankedImpacts,
    actionHints: buildActionHints(rankedImpacts),
    caveats: [CAVEAT_TEXT],
  };
}
