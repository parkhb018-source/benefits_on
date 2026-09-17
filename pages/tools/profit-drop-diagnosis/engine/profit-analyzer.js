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

// 배지(heroTier)와 headline 문구를 같은 분기에서 함께 결정한다(둘이 어긋나면 오해를 부른다).
// status enum(PROFIT_UP/PROFIT_DOWN/...)과는 별개 함수 — status 는 이익 증감 부호만 보지만,
// 이 함수는 두 기간의 흑자/적자 여부(부호)까지 봐서 9가지 상황을 구분한다.
// 핵심 원칙: 아직 적자인데 success(초록)를 쓰지 않는다 — 적자 축소/유지는 warning(주황).
function describeOutcome({ profitPrev, profitCurr, profitChange, allZero, allItemsSame }) {
  if (allZero) {
    return { heroTier: { label: '데이터 없음', tone: '' }, headline: '비교할 숫자가 없습니다.' };
  }

  const prevNeg = profitPrev < 0;
  const currNeg = profitCurr < 0;

  if (!prevNeg && currNeg) {
    return { heroTier: { label: '적자 전환', tone: 'danger' }, headline: '이번 달 적자로 전환되었습니다.' };
  }
  if (prevNeg && !currNeg) {
    return { heroTier: { label: '흑자 전환', tone: 'success' }, headline: '이번 달 흑자로 전환되었습니다.' };
  }
  if (prevNeg && currNeg) {
    if (profitChange > 0) return { heroTier: { label: '적자 축소', tone: 'warning' }, headline: `적자 규모가 ${formatWon(profitChange)} 줄었습니다.` };
    if (profitChange < 0) return { heroTier: { label: '적자 확대', tone: 'danger' }, headline: `적자 규모가 ${formatWon(-profitChange)} 늘었습니다.` };
    return { heroTier: { label: '적자 유지', tone: 'warning' }, headline: '적자 규모가 지난달과 같습니다.' };
  }

  // 두 기간 모두 흑자(0 포함)
  if (profitChange < 0) return { heroTier: { label: '이익 감소', tone: 'danger' }, headline: `이번 달 이익이 지난달보다 ${formatWon(-profitChange)} 줄었습니다.` };
  if (profitChange > 0) return { heroTier: { label: '이익 증가', tone: 'success' }, headline: `이번 달 이익이 지난달보다 ${formatWon(profitChange)} 늘었습니다.` };
  return allItemsSame
    ? { heroTier: { label: '변화 없음', tone: '' }, headline: '지난달과 이번 달 이익이 같습니다.' }
    : { heroTier: { label: '이익 동일', tone: '' }, headline: '이익은 지난달과 같지만, 항목별로는 변화가 있었습니다.' };
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
  const { heroTier, headline } = describeOutcome({ profitPrev, profitCurr, profitChange, allZero, allItemsSame });

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
    heroTier,
    headline,
    topImpactLine,
    notCauseLine,
    rankedImpacts,
    actionHints: buildActionHints(rankedImpacts),
    caveats: [CAVEAT_TEXT],
  };
}

// ───────────────────────── 워터폴 좌표 계산 (그리기 전용, 문구 아님) ─────────────────────────
// 0 기준선이 있는 양방향 축. 지난달 이익 → 항목별 영향 → 이번 달 이익을 누적해 도메인을 잡는다.
// 순수 함수(DOM 의존 없음)라 app.js 는 이 좌표를 그대로 스타일(left/width %)에 꽂기만 한다.

/** @param {ReturnType<typeof analyze>} a */
export function computeWaterfallLayout(a) {
  const { profitPrev, profitCurr, rankedImpacts } = a;
  const moved = rankedImpacts.filter((i) => i.impact !== 0);

  const stops = [0, profitPrev, profitCurr];
  let run = profitPrev;
  moved.forEach((i) => { run += i.impact; stops.push(run); });

  const domainMin = Math.min(...stops);
  const domainMax = Math.max(...stops);
  const span = (domainMax - domainMin) || 1;
  const x = (v) => (v - domainMin) / span * 100;
  const zeroPct = x(0);

  const edgeGeometry = (value) => ({
    left: x(Math.min(0, value)),
    width: Math.max(0.8, Math.abs(x(value) - x(0))),
  });

  const rows = [];
  rows.push({ kind: 'prev', name: '지난달 이익', value: profitPrev, negative: profitPrev < 0, ...edgeGeometry(profitPrev) });

  run = profitPrev;
  moved.forEach((i) => {
    const from = run, to = run + i.impact; run = to;
    rows.push({
      kind: 'impact', id: i.id, name: i.name, impact: i.impact, delta: i.delta,
      left: x(Math.min(from, to)), width: Math.max(0.8, Math.abs(x(to) - x(from))),
    });
  });

  rows.push({ kind: 'curr', name: '이번 달 이익', value: profitCurr, negative: profitCurr < 0, ...edgeGeometry(profitCurr) });

  return { zeroPct, domainMin, domainMax, rows };
}
