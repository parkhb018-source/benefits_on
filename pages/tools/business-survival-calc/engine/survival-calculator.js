// 사업 생존기간 계산기 — 계산 + 결과 문구 엔진
// DOM·localStorage·시간·난수에 의존하지 않는다(동일 입력 → 동일 출력). 로케일은 ko-KR 고정.
//
// 계산 흐름: 월 현금흐름 → 생존 개월수(120개월 상한) → 상태 판정(SURV) → 분석 카드(CAL)
// 시나리오: 매출 −10/−20/−30%(변동비율 유지), 고정비 −10/−20%
//
// 기준 문서: docs/02_Rule_Engine_Business_Survival.md 와 1:1 대응.
// 결과에 쓰이는 모든 문구(상태 메시지, 헤드라인, 안내, 분석 카드)는 이 파일에만 있다.

export const MONTH_CAP = 120;      // 표시 상한: 120개월(10년). 과잉 정밀도 방지.
export const DAYS_PER_MONTH = 30;  // 기획문서 기준: 1개월 = 30일 고정.

/**
 * @typedef {Object} SurvivalInput
 * @property {number} cash        현재 보유 현금 (원)
 * @property {number} revenue     월평균 매출 (원)
 * @property {number} variable    월 변동비 (원)
 * @property {number} fixed       월 고정비 (원)
 * @property {number} other       월 기타 현금 유출 (원)
 * @property {number} minReserve  최소 유지 현금 (원, 기본 0)
 */

/** 정수(원)를 "12,300원"으로. 화면·문구에 쓰이는 유일한 금액 포매터. */
export function formatWon(n) {
  return Math.round(n).toLocaleString('ko-KR') + '원';
}

/** 변동비율(변동비 ÷ 매출). 매출 0이면 0. 시나리오와 분석 카드가 공유. */
export function variableRatio({ revenue, variable }) {
  return revenue > 0 ? variable / revenue : 0;
}

/** 월 현금흐름(원). 음수면 매월 그만큼 현금이 줄어든다. */
export function monthlyCashFlow({ revenue, variable, fixed, other }) {
  return revenue - variable - fixed - other;
}

/**
 * 생존 개월수.
 * @param {{ cash:number, minReserve:number, monthlyCashFlow:number }} p
 * @returns {{
 *   infinite: boolean,       // 월 현금흐름 ≥ 0 → 현금이 줄지 않음
 *   belowReserve: boolean,   // (현재 현금 − 최소 유지 현금) ≤ 0
 *   capped: boolean,         // 120개월 상한 도달
 *   months: number,          // 생존 개월수 (infinite → Infinity, belowReserve → 0)
 *   monthlyDecrease: number  // 매월 감소액(양수). infinite → 0
 * }}
 */
export function survivalMonths({ cash, minReserve, monthlyCashFlow: flow }) {
  if (flow >= 0) {
    return { infinite: true, belowReserve: false, capped: false, months: Infinity, monthlyDecrease: 0 };
  }
  const monthlyDecrease = Math.abs(flow);
  const usable = cash - minReserve;
  if (usable <= 0) {
    return { infinite: false, belowReserve: true, capped: false, months: 0, monthlyDecrease };
  }
  const raw = usable / monthlyDecrease;
  const capped = raw >= MONTH_CAP;
  return { infinite: false, belowReserve: false, capped, months: capped ? MONTH_CAP : raw, monthlyDecrease };
}

/** 개월(소수) → "약 N개월 M일". 120개월 이상은 "10년(120개월) 이상". */
export function monthsToText(months) {
  if (typeof months !== 'number' || !isFinite(months) || months < 0) return '-';
  if (months >= MONTH_CAP) return '10년(120개월) 이상';
  let whole = Math.floor(months);
  let days = Math.round((months - whole) * DAYS_PER_MONTH);
  if (days >= DAYS_PER_MONTH) { whole += 1; days = 0; }
  if (whole === 0 && days === 0) return '1개월 미만';
  if (days === 0) return `약 ${whole}개월`;
  if (whole === 0) return `약 ${days}일`;
  return `약 ${whole}개월 ${days}일`;
}

/**
 * 생존 상태를 사람이 읽는 한 줄(headline)과 부연 설명(note)으로.
 * @param {ReturnType<typeof survivalMonths>} s
 * @param {SurvivalInput} input
 */
function describeSurvival(s, input) {
  if (s.infinite) {
    return { headline: '현금 감소 없음', note: '월 현금흐름이 0원 이상이라 현재 조건에서는 현금이 줄지 않습니다.' };
  }
  if (s.belowReserve) {
    return { headline: '이미 안전 현금 이하', note: `현재 보유 현금이 최소 유지 현금(${formatWon(input.minReserve)}) 이하입니다.` };
  }
  if (s.capped) {
    return { headline: monthsToText(s.months), note: '10년을 넘는 예측은 불확실성이 커 표시하지 않습니다.' };
  }
  return { headline: monthsToText(s.months), note: '현재 조건이 매월 그대로 유지된다고 가정한 결과입니다.' };
}

/**
 * 정규화된 입력 하나에 대한 전체 계산 결과 + 상태 + 문구.
 * @param {SurvivalInput} input
 */
export function analyze(input) {
  const flow = monthlyCashFlow(input);
  const survival = survivalMonths({ cash: input.cash, minReserve: input.minReserve, monthlyCashFlow: flow });
  return {
    input,
    monthlyCashFlow: flow,
    survival,
    variableRatio: variableRatio(input),
    fixedRatio: input.revenue > 0 ? input.fixed / input.revenue : 0,
    status: evaluateStatus(survival),
    ...describeSurvival(survival, input),
  };
}

// ───────────────────────── 시나리오 ─────────────────────────

export const SCENARIO_DEFS = [
  { id: 'BASE', label: '현재 조건', kind: 'base' },
  { id: 'REV-10', label: '매출 10% 감소', kind: 'revenue', rate: 0.10 },
  { id: 'REV-20', label: '매출 20% 감소', kind: 'revenue', rate: 0.20 },
  { id: 'REV-30', label: '매출 30% 감소', kind: 'revenue', rate: 0.30 },
  { id: 'FIX-10', label: '고정비 10% 절감', kind: 'fixed', rate: 0.10 },
  { id: 'FIX-20', label: '고정비 20% 절감', kind: 'fixed', rate: 0.20 },
];

function applyScenario(base, def) {
  const next = { ...base };
  if (def.kind === 'revenue') {
    const ratio = variableRatio(base); // 변동비율 유지
    next.revenue = Math.round(base.revenue * (1 - def.rate));
    next.variable = Math.round(next.revenue * ratio);
  } else if (def.kind === 'fixed') {
    next.fixed = Math.round(base.fixed * (1 - def.rate));
  }
  return next;
}

/**
 * @param {SurvivalInput} base
 * @returns {Array<{ id, label, kind, input: SurvivalInput, result: ReturnType<typeof analyze> }>}
 */
export function buildScenarios(base) {
  return SCENARIO_DEFS.map((def) => {
    const input = def.kind === 'base' ? base : applyScenario(base, def);
    return { id: def.id, label: def.label, kind: def.kind, input, result: analyze(input) };
  });
}

// ───────────────────────── Rule Engine: 상태 (SURV) ─────────────────────────
// tone: success | warning | info  (혜택on report-card 톤과 매핑)
// 평가는 배열 순서대로 첫 매치를 적용한다(SURV-005 → 001 → 002 → 003 → 004).

export const STATUS_RULES = [
  {
    id: 'SURV-005', tone: 'warning', label: '위험',
    test: (s) => s.belowReserve,
    message: '현재 보유 현금이 이미 최소 유지 현금 이하입니다.',
    reason: '(현재 보유 현금 − 최소 유지 현금)이 0원 이하이므로 사용 가능한 여유 현금이 없습니다.',
    action: '지출 구조를 즉시 점검하고, 정책자금·긴급경영안정자금 등 자금 지원을 알아보세요.',
  },
  {
    id: 'SURV-001', tone: 'success', label: '안정',
    test: (s) => s.infinite,
    message: '월 현금흐름이 흑자라 현재 조건에서는 현금이 줄지 않습니다.',
    reason: '월 현금흐름(매출 − 변동비 − 고정비 − 기타 유출)이 0원 이상입니다.',
    action: '현재 운영을 유지하되, 매출 10~30% 감소 시나리오의 결과를 함께 확인해 두세요.',
  },
  {
    id: 'SURV-002', tone: 'info', label: '주의',
    test: (s) => s.months >= 6,
    message: '현재 적자 상태로, 유지되면 현금이 계속 줄어듭니다.',
    reason: '월 현금흐름이 적자입니다. 현금 소진까지 6개월 이상 남았더라도, 적자 상태에서는 최소 "주의"로 표시합니다.',
    action: '고정비 절감 시나리오를 확인하고, 흑자 전환 계획(매출 확대 또는 비용 절감)을 세우세요.',
  },
  {
    id: 'SURV-003', tone: 'warning', label: '경고',
    test: (s) => s.months >= 3,
    message: '3~6개월 안에 현금이 소진될 수 있습니다.',
    reason: '생존기간이 3개월 이상 6개월 미만으로 계산됩니다.',
    action: '변동비·고정비를 항목별로 재검토하고, 소상공인 정책자금 상담을 권장합니다.',
  },
  {
    id: 'SURV-004', tone: 'warning', label: '위험',
    test: () => true, // 위 규칙에서 걸러지지 않은 나머지(적자 & 3개월 미만)
    message: '3개월 이내에 현금이 소진될 수 있습니다.',
    reason: '생존기간이 3개월 미만으로 계산됩니다.',
    action: '지출 축소와 자금 확보를 즉시 실행하고, 전문가(세무사·경영지도사) 상담을 권장합니다.',
  },
];

/** @param {ReturnType<typeof survivalMonths>} survival */
export function evaluateStatus(survival) {
  const { test, ...rule } = STATUS_RULES.find((r) => r.test(survival));
  return rule;
}

// ───────────────────────── Rule Engine: 분석 카드 (CAL) ─────────────────────────

function band(value, goodMax, warnMax) {
  if (value <= goodMax) return 'good';
  if (value <= warnMax) return 'warn';
  return 'bad';
}

const TONE_BY_VERDICT = { good: 'success', warn: 'warning', bad: 'warning', info: 'info' };
const TAG_BY_VERDICT = { good: '양호', warn: '주의', bad: '위험', info: '참고' };

/**
 * 분석 카드 배열.
 * @param {ReturnType<typeof analyze>} a
 * @returns {Array<{ id, title, tone, tag, text }>}
 */
export function analysisCards(a) {
  const cards = [];
  const push = (id, title, verdict, text) =>
    cards.push({ id, title, tone: TONE_BY_VERDICT[verdict], tag: TAG_BY_VERDICT[verdict], text });

  // 매출 대비 비율 카드 공통 형태 (CAL-002, CAL-003)
  const ratioCard = (id, title, ratio, goodMax, warnMax, texts) => {
    if (a.input.revenue === 0) return push(id, title, 'info', `매출이 0원이라 ${title}을 계산할 수 없습니다.`);
    const v = band(ratio, goodMax, warnMax);
    return push(id, title, v, texts[v]);
  };

  const flow = a.monthlyCashFlow;

  // CAL-001 · 월 현금흐름
  if (flow > 0) push('CAL-001', '월 현금흐름', 'good', '매월 현금이 늘어납니다. 현재 조건에서는 현금 소진 위험이 없습니다.');
  else if (flow === 0) push('CAL-001', '월 현금흐름', 'warn', '매출과 지출이 정확히 같습니다. 작은 매출 감소에도 적자로 전환됩니다.');
  else push('CAL-001', '월 현금흐름', 'bad', `매월 ${formatWon(-flow)}씩 현금이 줄어듭니다.`);

  // CAL-004 · 손익 상태 (매출 vs 총지출 = 월 현금흐름의 부호와 동일)
  if (flow >= 0) push('CAL-004', '손익 상태', flow === 0 ? 'warn' : 'good', '월 매출이 월 지출(변동비+고정비+기타)보다 큽니다.');
  else push('CAL-004', '손익 상태', 'bad', `월 지출이 월 매출보다 ${formatWon(-flow)} 많습니다. 보유 현금으로 버티는 상태입니다.`);

  // CAL-002 · 변동비율
  ratioCard('CAL-002', '변동비율', a.variableRatio, 0.35, 0.50, {
    good: '변동비율이 적정 범위입니다.',
    warn: '변동비율이 다소 높습니다. 원가·수수료 구조를 점검해 보세요.',
    bad: '변동비율이 높습니다. 매출이 늘어도 남는 현금이 적습니다.',
  });

  // CAL-003 · 고정비 부담
  ratioCard('CAL-003', '고정비 부담', a.fixedRatio, 0.30, 0.45, {
    good: '고정비 부담이 낮은 편입니다.',
    warn: '고정비 부담이 보통 수준입니다. 매출 감소 시 압박이 커질 수 있습니다.',
    bad: '고정비 부담이 큽니다. 임대료·인건비 등 고정 지출 재검토가 필요합니다.',
  });

  // CAL-005 · 개선 포인트 (gap = 손익분기까지 부족액 = 적자면 양수)
  const gap = -flow;
  if (gap <= 0) {
    push('CAL-005', '개선 포인트', 'good', '현재는 손익분기 이상입니다. 매출 감소 시나리오로 여유를 점검하세요.');
  } else {
    const best = [
      { label: '매출', base: a.input.revenue },
      { label: '고정비', base: a.input.fixed },
      { label: '변동비', base: a.input.variable },
      { label: '기타 유출', base: a.input.other },
    ].filter((o) => o.base > 0)
      .map((o) => ({ ...o, pct: gap / o.base }))
      .sort((x, y) => x.pct - y.pct)[0];
    const verb = best.label === '매출' ? '늘리면' : '줄이면';
    push('CAL-005', '개선 포인트', 'warn',
      `${best.label}: 약 ${formatWon(gap)}(현재의 ${(Math.round(best.pct * 1000) / 10).toFixed(1)}%) ${verb} 손익분기에 도달합니다.`);
  }

  return cards;
}
