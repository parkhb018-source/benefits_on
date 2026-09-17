// 이익 변동 진단 — 화면 로직
// 계산·상태·결과 문구는 engine/profit-analyzer.js 에만 있다.
// 이 파일은 입력 검증 · 콤마 처리 · DOM 조립 · localStorage 저장만 담당한다.

import { analyze, formatWon, computeWaterfallLayout } from './engine/profit-analyzer.js?v=20260918a';
import { CARD_RATE_TIERS, DELIVERY_RATES, calcCardFee, calcDeliveryFee, sumFees } from './engine/fee-calc.js?v=20260918a';

const INPUTS_KEY = 'profitDropDiagnosisInputs';

// engine 의 LABELS(profit-analyzer.js) 와 id·이름이 반드시 일치해야 한다.
const FIELDS = [
  { id: 'sales', name: '매출', opt: '' },
  { id: 'foodCost', name: '식재료비', opt: '또는 상품매입비' },
  { id: 'laborCost', name: '인건비', opt: '' },
  { id: 'rent', name: '임대료', opt: '' },
  { id: 'platformFee', name: '수수료', opt: '플랫폼·카드·결제' },
  { id: 'otherCost', name: '기타비용', opt: '관리비·공과금·통신비·소모품 등' },
];

const DELIVERY_PLATFORM_ORDER = ['baemin', 'coupangeats', 'yogiyo'];

const SAMPLE = {
  prev: { sales: 30_000_000, foodCost: 11_000_000, laborCost: 7_000_000, rent: 3_000_000, platformFee: 2_000_000, otherCost: 3_000_000 },
  curr: { sales: 30_000_000, foodCost: 12_500_000, laborCost: 7_800_000, rent: 3_000_000, platformFee: 2_100_000, otherCost: 3_100_000 },
};

// ===== GA4 맞춤 이벤트 (assets/js/analytics.js) =====
// gtag·analytics.js 미로딩(광고차단 등) 환경에서도 계산기가 정상 동작해야 하므로 항상 try/catch로 감싼다.
const TOOL_ID = 'profit-drop-diagnosis';
function safeTrack(fn) {
  try { fn(); } catch (e) { /* 조용히 무시 */ }
}
let startTracked = false;

// app.js가 다루는 모든 요소 id. init()에서 한 번 조회해 캐시한다.
// (AdSense auto ads가 로드 직후 빈/숨김 요소를 잠깐 떼어냈다 되돌리므로,
//  캐시해 두면 그 사이 getElementById가 null을 반환해도 안전하다.)
const EL_IDS = [
  'sheet', 'totalPrev', 'totalCurr', 'totalDelta',
  'runBtn', 'copyMonthBtn', 'sampleBtn', 'clearBtn', 'hintLine',
  'resultEmpty', 'resultGrid',
  'heroTier', 'heroAmount', 'heroSent', 'statPrev', 'statCurr', 'waterfall', 'notCause',
  'checkList', 'copyResBtn', 'againBtn',
  'feeCardTierGroup', 'feeCardSales', 'feeCardAmount', 'feeCardCheckHint', 'feeCardOver30Note',
  'feeDeliveryPlatformGroup', 'feeDeliveryInputs', 'feeDeliveryResult',
  'feeSumCard', 'feeSumDelivery', 'feeSumTotal', 'feeApplyPrevBtn', 'feeApplyCurrBtn',
];

const el = {};
const $ = (id) => el[id] || document.getElementById(id);

// ───────────────────────── 숫자 유틸 ─────────────────────────

const parseNum = (s) => {
  const v = parseInt(String(s).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(v) ? v : 0;
};
const won = (n) => n.toLocaleString('ko-KR');
const signed = (n) => (n > 0 ? '+' : n < 0 ? '-' : '') + won(Math.abs(n));

// 원화 읽기 힌트: 12,500,000 → "1,250만원" (0을 몇 개 쳤는지 헷갈리는 문제 방지)
function readable(n) {
  n = Math.abs(n);
  if (!n) return '';
  if (n >= 100_000_000) {
    const eok = Math.floor(n / 100_000_000), man = Math.floor((n % 100_000_000) / 10_000);
    return eok + '억' + (man ? ' ' + won(man) + '만' : '') + '원';
  }
  if (n >= 10_000) {
    const man = Math.floor(n / 10_000), rest = n % 10_000;
    return won(man) + '만' + (rest ? ' ' + won(rest) : '') + '원';
  }
  return won(n) + '원';
}

// ───────────────────────── localStorage (실패는 조용히 무시) ─────────────────────────

function safeParse(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 공간 제한 등 */ }
}
function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* 무시 */ }
}

// ───────────────────────── 입력 표 DOM 조립 ─────────────────────────

function buildSheet() {
  $('sheet').innerHTML = FIELDS.map((f) => `
    <div class="sheet-row" data-f="${f.id}">
      <div class="row-top">
        <div class="row-label">${f.name}${f.opt ? `<span class="opt">${f.opt}</span>` : ''}</div>
        <div class="delta same" id="d-${f.id}">—</div>
      </div>
      <div class="row-inputs">
        <div>
          <span class="col-tag">지난달</span>
          <div class="money-input">
            <input class="num-input" id="prev-${f.id}" inputmode="numeric" type="text" placeholder="0" aria-label="${f.name} 지난달"><span class="unit">원</span>
          </div>
          <p class="read-hint" id="rh-prev-${f.id}"></p>
        </div>
        <div>
          <span class="col-tag">이번 달</span>
          <div class="money-input">
            <input class="num-input" id="curr-${f.id}" inputmode="numeric" type="text" placeholder="0" aria-label="${f.name} 이번 달"><span class="unit">원</span>
          </div>
          <p class="read-hint" id="rh-curr-${f.id}"></p>
        </div>
      </div>
    </div>`).join('');
}

// 수수료 행(.sheet-row[data-f="platformFee"]) 바로 뒤에 형제로 붙는 계산 보조 패널.
// #sheet 는 블록 컨테이너라 형제로 넣으면 전체 폭이 되고, 데스크톱 4열 grid(.sheet-row) 안에는 들어가지 않는다.
function buildFeePanel() {
  if (document.getElementById('feeCalcPanel')) return; // init() 재시도 중 중복 삽입 방지
  const platformRow = document.querySelector('.sheet-row[data-f="platformFee"]');
  if (!platformRow) return;

  const tierHtml = CARD_RATE_TIERS.map((t) => `
    <label class="fee-tier-btn">
      <input type="radio" name="feeCardTier" value="${t.id}"${t.id === 'under3' ? ' checked' : ''}>
      <span>${t.label}</span>
    </label>`).join('');

  const platformHtml = DELIVERY_PLATFORM_ORDER.map((p) => `
    <label class="fee-platform-chip">
      <input type="checkbox" class="fee-delivery-check" value="${p}">
      <span>${DELIVERY_RATES[p].name}</span>
    </label>`).join('');

  const deliveryRowsHtml = DELIVERY_PLATFORM_ORDER.map((p) => `
    <div class="fee-delivery-row" id="feeDeliveryRow-${p}" hidden>
      <span class="fee-delivery-row-label">${DELIVERY_RATES[p].name} 배달 매출액</span>
      <div class="money-input">
        <input class="num-input fee-num-input" id="feeDeliverySales-${p}" inputmode="numeric" type="text" placeholder="0" aria-label="${DELIVERY_RATES[p].name} 배달 매출액"><span class="unit">원</span>
      </div>
    </div>`).join('');

  const html = `
  <div class="fee-calc-panel" id="feeCalcPanel">
    <details class="fee-calc-acc">
      <summary class="fee-calc-summary">💳 카드수수료 계산하기</summary>
      <div class="fee-calc-body">
        <div class="fee-field">
          <span class="fee-label">연매출 구간</span>
          <div class="fee-tier-group" id="feeCardTierGroup">${tierHtml}</div>
        </div>
        <div class="fee-field">
          <label class="fee-label" for="feeCardSales">월 카드매출액 <span class="fee-hint-inline">(포스나 카드사 정산내역에서 확인)</span></label>
          <div class="money-input">
            <input class="num-input fee-num-input" id="feeCardSales" inputmode="numeric" type="text" placeholder="0" aria-label="월 카드매출액"><span class="unit">원</span>
          </div>
        </div>
        <div class="fee-result">
          <div class="fee-result-amount" id="feeCardAmount">0원</div>
          <p class="fee-result-sub" id="feeCardCheckHint">체크카드 비중이 높으면 실제 수수료는 이보다 낮습니다. (3억 이하 기준 체크카드는 0.15%로 신용카드의 절반 이하)</p>
          <p class="fee-result-sub fee-note-warning" id="feeCardOver30Note" hidden>우대수수료율 대상이 아니라 카드사와 협의한 요율이 적용됩니다.<br>카드사 정산내역에서 실제 수수료를 확인하세요.</p>
        </div>
      </div>
    </details>

    <details class="fee-calc-acc">
      <summary class="fee-calc-summary">🚚 배달수수료 계산하기 (선택)</summary>
      <div class="fee-calc-body">
        <div class="fee-field">
          <span class="fee-label">배달앱 선택 <span class="fee-hint-inline">(복수 선택 가능)</span></span>
          <div class="fee-platform-group" id="feeDeliveryPlatformGroup">${platformHtml}</div>
        </div>
        <div class="fee-delivery-inputs" id="feeDeliveryInputs">${deliveryRowsHtml}</div>
        <div class="fee-result" id="feeDeliveryResult"></div>
        <p class="fee-note">배민1플러스·쿠팡이츠 상생요금제는 매출 상위 비율에 따라 중개수수료가 2.0~7.8%로 차등 적용됩니다. 위 값은 상한이라 실제보다 높게 나올 수 있습니다.</p>
        <p class="fee-note">부가세 10%는 별도로 붙어 실제 청구액은 조금 더 높습니다.</p>
      </div>
    </details>

    <div class="fee-sum">
      <div class="fee-sum-row"><span>카드수수료</span><span id="feeSumCard">0원</span></div>
      <div class="fee-sum-row"><span>배달수수료</span><span id="feeSumDelivery">0원</span></div>
      <div class="fee-sum-row fee-sum-total"><span>합계</span><span id="feeSumTotal">0원</span></div>
      <div class="fee-sum-actions">
        <button type="button" class="ghost-btn" id="feeApplyPrevBtn">지난달 수수료에 넣기</button>
        <button type="button" class="ghost-btn accent" id="feeApplyCurrBtn">이번 달 수수료에 넣기</button>
      </div>
    </div>
  </div>`;

  platformRow.insertAdjacentHTML('afterend', html);
}

// 데스크톱(≥721px)에서는 row-top / row-inputs 를 grid 셀로 풀어 4열(항목|지난달|이번달|증감)로 만든다.
function relayout() {
  const wide = window.matchMedia('(min-width:721px)').matches;
  document.querySelectorAll('.sheet-row').forEach((row) => {
    const top = row.querySelector('.row-top'), ins = row.querySelector('.row-inputs');
    top.style.display = wide ? 'contents' : 'flex';
    ins.style.display = wide ? 'contents' : 'grid';
    row.querySelectorAll('.col-tag').forEach((t) => { t.hidden = wide; });
    if (wide) row.appendChild(row.querySelector('.delta'));
    else top.appendChild(row.querySelector('.delta'));
  });
}

// ───────────────────────── 값 읽기/쓰기 ─────────────────────────

function get(period) {
  const out = {};
  FIELDS.forEach((f) => { out[f.id] = parseNum(document.getElementById(`${period}-${f.id}`).value); });
  return out;
}
function set(period, data) {
  FIELDS.forEach((f) => {
    const input = document.getElementById(`${period}-${f.id}`);
    input.value = data[f.id] ? won(data[f.id]) : '';
  });
}

// ───────────────────────── 실시간 피드백 (행별 증감 + 합계) ─────────────────────────

const FLAG_BADGE = { NEW_COST: '신규 발생', COST_ENDED: '이번 달 없음' };

function refresh() {
  const prev = get('prev'), curr = get('curr');
  let a;
  try { a = analyze(prev, curr); } catch { return; } // 안전정수 초과 등 — 이번 입력은 반영하지 않고 대기

  FIELDS.forEach((f) => {
    ['prev', 'curr'].forEach((p) => {
      const v = (p === 'prev' ? prev : curr)[f.id];
      document.getElementById(`rh-${p}-${f.id}`).textContent = v ? readable(v) : '';
    });
    const item = a.rankedImpacts.find((i) => i.id === f.id);
    const d = item.delta;
    const dEl = document.getElementById(`d-${f.id}`);
    if (!item.prev && !item.curr) { dEl.className = 'delta same'; dEl.textContent = '—'; return; }
    if (d === 0) { dEl.className = 'delta same'; dEl.textContent = '변화 없음'; return; }
    if (item.flag === 'NEW_COST') { dEl.className = 'delta up'; dEl.innerHTML = signed(d) + `<span class="badge">${FLAG_BADGE.NEW_COST}</span>`; return; }
    if (item.flag === 'COST_ENDED') { dEl.className = 'delta down'; dEl.innerHTML = signed(d) + `<span class="badge">${FLAG_BADGE.COST_ENDED}</span>`; return; }
    dEl.className = 'delta ' + (d > 0 ? 'up' : 'down');
    dEl.textContent = (d > 0 ? '▲ ' : '▼ ') + signed(d);
  });

  const any = FIELDS.some((f) => prev[f.id] || curr[f.id]);
  $('totalPrev').textContent = any ? formatWon(a.profitPrev) : '—';
  $('totalCurr').textContent = any ? formatWon(a.profitCurr) : '—';
  const td = $('totalDelta');
  if (!any) { td.className = 'delta same'; td.textContent = '—'; }
  else if (a.profitChange === 0) { td.className = 'delta same'; td.textContent = '변화 없음'; }
  else { td.className = 'delta ' + (a.profitChange < 0 ? 'up' : 'down'); td.textContent = (a.profitChange < 0 ? '▼ ' : '▲ ') + signed(a.profitChange); }

  return a;
}

// ───────────────────────── 진단 (결과 패널 렌더 + 공개) ─────────────────────────

function renderWaterfall(a) {
  const layout = computeWaterfallLayout(a);
  const zeroLine = `<div class="wf-zero-line" style="left:${layout.zeroPct}%"></div>`;
  let sawTop = false;

  const rowHtml = (row) => {
    if (row.kind === 'prev' || row.kind === 'curr') {
      const toneClass = row.negative ? '' : (row.kind === 'prev' ? 'base' : 'final');
      return `<div class="wf-row is-edge"><div class="wf-name">${row.name}</div>
        <div class="wf-track">${zeroLine}<div class="wf-bar ${toneClass}" style="left:${row.left}%;width:${row.width}%"></div></div>
        <div class="wf-val muted">${signed(row.value)}원</div></div>`;
    }
    const isTop = !sawTop;
    sawTop = true;
    return `<div class="wf-row${isTop ? ' is-top' : ''}"><div class="wf-name">${row.name}</div>
      <div class="wf-track">${zeroLine}<div class="wf-bar ${row.impact > 0 ? 'pos' : ''}" style="left:${row.left}%;width:${row.width}%"></div></div>
      <div class="wf-val ${row.impact < 0 ? 'neg' : 'pos'}">${signed(row.impact)}</div></div>`;
  };

  $('waterfall').innerHTML = layout.rows.map(rowHtml).join('');
}

function renderCheckList(a) {
  const moved = a.rankedImpacts.filter((i) => i.impact !== 0);
  const rows = moved.length ? moved : a.rankedImpacts.slice(0, 3);
  $('checkList').innerHTML = rows.map((i, idx) => {
    const hint = a.actionHints.find((h) => h.id === i.id);
    return `
    <li class="check-item${idx === 0 && i.impact !== 0 ? ' rank1' : ''}">
      <input type="checkbox" id="ck-${i.id}">
      <label class="check-body" for="ck-${i.id}">
        <span class="check-head"><span class="check-name">${idx + 1}. ${i.name}</span>
          <span class="check-amt">이익 영향 ${signed(i.impact)}원</span></span>
        <p class="check-text">${hint ? hint.text : '이익 변동에 영향을 주지 않았습니다.'}</p>
        ${hint && hint.toolUrl ? `<a class="check-tool" href="${hint.toolUrl}">관련 도구 열기 →</a>` : ''}
      </label>
    </li>`;
  }).join('');
  document.querySelectorAll('.check-item input').forEach((cb) => {
    cb.addEventListener('change', () => cb.closest('.check-item').classList.toggle('done', cb.checked));
  });
}

function diagnose() {
  const a = refresh();
  if (!a) return null;

  $('heroTier').textContent = a.heroTier.label;
  $('heroTier').className = 'hero-tier' + (a.heroTier.tone ? ' tone-' + a.heroTier.tone : '');
  $('heroAmount').innerHTML = (a.heroAmount === 0 ? '0' : signed(a.heroAmount)) + '<span class="won">원</span>';
  $('heroSent').textContent = a.headline;
  $('statPrev').textContent = formatWon(a.profitPrev);
  $('statCurr').textContent = formatWon(a.profitCurr);

  renderWaterfall(a);

  $('notCause').innerHTML = a.topImpactLine
    ? `<b>${a.topImpactLine}</b><br>${a.notCauseLine}`
    : a.notCauseLine;

  renderCheckList(a);

  $('resultEmpty').hidden = true;
  $('resultGrid').hidden = false;
  $('resultGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });

  return a;
}

// ───────────────────────── 입력값 자동 저장 ─────────────────────────

function saveInputs() {
  const data = {};
  FIELDS.forEach((f) => {
    data[`prev-${f.id}`] = document.getElementById(`prev-${f.id}`).value;
    data[`curr-${f.id}`] = document.getElementById(`curr-${f.id}`).value;
  });
  safeSet(INPUTS_KEY, data);
}

function restoreInputs() {
  const data = safeParse(INPUTS_KEY);
  if (!data) return;
  FIELDS.forEach((f) => {
    ['prev', 'curr'].forEach((p) => {
      const key = `${p}-${f.id}`;
      const input = document.getElementById(key);
      if (typeof data[key] === 'string') input.value = data[key];
    });
  });
}

// ───────────────────────── 수수료 계산 보조 패널 ─────────────────────────
// 계산식은 전부 engine/fee-calc.js 에 있다. 여기서는 입력을 읽어 넘기고 결과를 그리기만 한다.

let feeCardResult = { rate: null, fee: 0, note: null };
let feeDeliveryResult = { perPlatform: [], total: 0 };

function recalcFeeCalc() {
  const tierInput = document.querySelector('input[name="feeCardTier"]:checked');
  const tier = tierInput ? tierInput.value : 'under3';
  const cardSales = parseNum($('feeCardSales').value);
  feeCardResult = calcCardFee({ tier, cardSales });

  const isOver30 = feeCardResult.rate === null;
  $('feeCardAmount').hidden = isOver30;
  $('feeCardCheckHint').hidden = isOver30;
  $('feeCardOver30Note').hidden = !isOver30;
  if (!isOver30) $('feeCardAmount').textContent = won(feeCardResult.fee) + '원';

  const platforms = DELIVERY_PLATFORM_ORDER.filter((p) => document.querySelector(`.fee-delivery-check[value="${p}"]`)?.checked);
  DELIVERY_PLATFORM_ORDER.forEach((p) => {
    document.getElementById(`feeDeliveryRow-${p}`).hidden = !platforms.includes(p);
  });

  const selections = platforms.map((p) => ({ platform: p, sales: parseNum(document.getElementById(`feeDeliverySales-${p}`).value) }));
  feeDeliveryResult = selections.length ? calcDeliveryFee(selections) : { perPlatform: [], total: 0 };

  $('feeDeliveryResult').innerHTML = feeDeliveryResult.perPlatform.length
    ? feeDeliveryResult.perPlatform.map((p) => {
        const rates = DELIVERY_RATES[p.platform];
        const rate = (rates.brokerage + rates.payment).toFixed(1);
        return `<p class="fee-result-line">${p.name} ${won(p.fee)}원 <span class="fee-result-detail">(매출×${rate}% · 중개 ${won(p.brokerage)}원 + 결제 ${won(p.payment)}원)</span></p>`;
      }).join('') + `<p class="fee-result-total">배달수수료 합계 ${won(feeDeliveryResult.total)}원</p>`
    : '<p class="fee-result-sub">배달앱을 선택하면 계산됩니다.</p>';

  const cardFeeForSum = isOver30 ? 0 : feeCardResult.fee;
  const total = sumFees({ card: feeCardResult, delivery: feeDeliveryResult });
  $('feeSumCard').textContent = won(cardFeeForSum) + '원';
  $('feeSumDelivery').textContent = won(feeDeliveryResult.total) + '원';
  $('feeSumTotal').textContent = won(total) + '원';
}

function applyFeeSum(period) {
  const total = sumFees({ card: feeCardResult, delivery: feeDeliveryResult });
  document.getElementById(`${period}-platformFee`).value = total ? won(total) : '';
  refresh();
  saveInputs();
}

// ───────────────────────── 이벤트 ─────────────────────────

let initTries = 0;
function init() {
  buildSheet();
  buildFeePanel();
  // 필요한 요소가 아직 안 보이면(광고 스크립트가 DOM을 재배치 중) 잠시 후 재시도
  if (EL_IDS.some((id) => !document.getElementById(id)) && initTries++ < 20) {
    setTimeout(init, 50);
    return;
  }
  EL_IDS.forEach((id) => { el[id] = document.getElementById(id); });

  relayout();
  window.addEventListener('resize', relayout);

  document.querySelectorAll('.num-input').forEach((input) => {
    input.addEventListener('input', () => {
      const pos = input.selectionStart, before = input.value.length;
      const n = parseNum(input.value);
      input.value = input.value.trim() === '' ? '' : won(n);
      const after = input.value.length;
      try { input.setSelectionRange(Math.max(0, pos + (after - before)), Math.max(0, pos + (after - before))); } catch (e) { /* 무시 */ }

      if (!startTracked) {
        startTracked = true;
        safeTrack(() => window.trackToolStart && window.trackToolStart(TOOL_ID));
      }
      refresh();
      saveInputs();
    });
  });

  $('runBtn').addEventListener('click', () => {
    const a = diagnose();
    if (a) safeTrack(() => window.trackToolRun && window.trackToolRun(TOOL_ID, { status: a.status }));
  });

  $('copyMonthBtn').addEventListener('click', () => {
    set('curr', get('prev'));
    refresh();
    saveInputs();
    $('hintLine').innerHTML = '지난달 숫자를 이번 달로 옮겼습니다. <b>바뀐 항목만 고치세요.</b>';
  });

  $('sampleBtn').addEventListener('click', () => {
    set('prev', SAMPLE.prev);
    set('curr', SAMPLE.curr);
    refresh();
    saveInputs();
  });

  $('clearBtn').addEventListener('click', () => {
    set('prev', {});
    set('curr', {});
    refresh();
    saveInputs();
    $('resultGrid').hidden = true;
    $('resultEmpty').hidden = false;
    safeTrack(() => window.trackTool && window.trackTool('tool_reset', TOOL_ID, {}));
  });

  $('againBtn').addEventListener('click', () => {
    document.querySelector('.panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('copyResBtn').addEventListener('click', (e) => {
    const prev = get('prev'), curr = get('curr');
    let a;
    try { a = analyze(prev, curr); } catch { return; }
    const text = `[이익 변동 진단]\n지난달 이익 ${formatWon(a.profitPrev)} → 이번 달 ${formatWon(a.profitCurr)} (${signed(a.profitChange)}원)\n`
      + FIELDS.map((f) => `${f.name} ${won(prev[f.id])} → ${won(curr[f.id])} (${signed(curr[f.id] - prev[f.id])})`).join('\n');
    const target = e.target;
    navigator.clipboard?.writeText(text)
      .then(() => { target.textContent = '복사됨 ✓'; setTimeout(() => { target.textContent = '결과 요약 복사'; }, 1600); })
      .catch(() => { target.textContent = '복사 실패'; setTimeout(() => { target.textContent = '결과 요약 복사'; }, 1600); });
  });

  document.querySelectorAll('input[name="feeCardTier"]').forEach((r) => r.addEventListener('change', recalcFeeCalc));
  document.querySelectorAll('.fee-delivery-check').forEach((cb) => cb.addEventListener('change', recalcFeeCalc));
  document.querySelectorAll('.fee-num-input').forEach((input) => input.addEventListener('input', recalcFeeCalc));
  $('feeApplyPrevBtn').addEventListener('click', () => applyFeeSum('prev'));
  $('feeApplyCurrBtn').addEventListener('click', () => applyFeeSum('curr'));
  recalcFeeCalc();

  restoreInputs();
  refresh();
}

init();
