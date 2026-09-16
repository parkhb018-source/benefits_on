// 이익 변동 진단 — 화면 로직
// 계산·상태·결과 문구는 engine/profit-analyzer.js 에만 있다.
// 이 파일은 입력 검증 · 콤마 처리 · DOM 조립 · localStorage 저장만 담당한다.

import { analyze, formatWon } from './engine/profit-analyzer.js?v=20260916';

const INPUTS_KEY = 'profitDropDiagnosisInputs';

const FIELD_KEYS = ['sales', 'foodCost', 'laborCost', 'rent', 'platformFee', 'otherCost'];
const PERIODS = ['Prev', 'Curr'];
const MONEY_FIELDS = PERIODS.flatMap((p) => FIELD_KEYS.map((k) => `${k}${p}`));

// ===== GA4 맞춤 이벤트 (assets/js/analytics.js) =====
// gtag·analytics.js 미로딩(광고차단 등) 환경에서도 계산기가 정상 동작해야 하므로 항상 try/catch로 감싼다.
const TOOL_ID = 'profit-drop-diagnosis';
function safeTrack(fn) {
  try { fn(); } catch (e) { /* 조용히 무시 */ }
}
let startTracked = false;

const REPORT_ICONS = {
  status: '🚦', sales: '💰', foodCost: '🍖', laborCost: '👥',
  rent: '🏠', platformFee: '💳', otherCost: '📦',
};

// app.js가 다루는 모든 요소 id. init()에서 한 번 조회해 캐시한다.
// (AdSense auto ads가 로드 직후 빈/숨김 요소를 잠깐 떼어냈다 되돌리므로,
//  캐시해 두면 그 사이 getElementById가 null을 반환해도 안전하다.)
const EL_IDS = [
  ...MONEY_FIELDS,
  'hero-tier', 'headline-text', 'stat-prev', 'stat-curr', 'breakdown-list',
  'report-cards', 'action-hint-list', 'caveat-list',
  'result-empty', 'result-body', 'report-empty', 'report-body',
  'calc-btn', 'reset-btn',
];

const el = {};
const $ = (id) => el[id] || document.getElementById(id);

// ───────────────────────── 숫자 유틸 ─────────────────────────

const digitsOnly = (str) => String(str).replace(/[^0-9]/g, '');

function toNumber(str) {
  const cleaned = digitsOnly(str);
  return cleaned === '' ? null : parseInt(cleaned, 10);
}
function formatComma(str) {
  const cleaned = digitsOnly(str);
  return cleaned === '' ? '' : Number(cleaned).toLocaleString('ko-KR');
}
function signedWon(n) {
  return (n > 0 ? '+' : n < 0 ? '-' : '') + formatWon(Math.abs(n));
}

function bindCommaInput(input) {
  input.addEventListener('input', () => {
    const fromEnd = input.value.length - input.selectionStart;
    input.value = formatComma(input.value);
    const pos = Math.max(0, input.value.length - fromEnd);
    input.setSelectionRange(pos, pos);
  });
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

// ───────────────────────── 입력 읽기 · 검증 ─────────────────────────

function readValues() {
  const raw = {};
  MONEY_FIELDS.forEach((id) => { raw[id] = toNumber($(id).value); });
  return raw;
}

function toPeriodInput(raw, period) {
  const out = {};
  FIELD_KEYS.forEach((k) => { out[k] = raw[`${k}${period}`] ?? 0; });
  return out;
}

// ───────────────────────── 렌더링 ─────────────────────────

function reportCard({ id, tone, tag, title, text, meta }) {
  return `
    <li class="report-card tone-${tone}">
      <span class="report-icon">${REPORT_ICONS[id] || '•'}</span>
      <div class="report-body">
        <div class="report-row"><strong>${title}</strong><span class="report-tag">${tag}</span></div>
        <p class="report-text">${text}</p>
        ${meta ? `<p class="report-meta">${meta}</p>` : ''}
      </div>
    </li>`;
}

function render(prev, curr) {
  const a = analyze(prev, curr);
  const { status } = a;

  // 히어로
  $('hero-tier').textContent = status.label;
  $('hero-tier').className = 'hero-tier tone-' + status.tone;
  $('headline-text').textContent = a.headline;
  $('stat-prev').textContent = formatWon(a.profitPrev);
  $('stat-curr').textContent = formatWon(a.profitCurr);

  // 항목별 이익 영향
  $('breakdown-list').innerHTML = a.rankedImpacts.map((r) => `
    <li>
      <span>${r.label}</span>
      <span class="${r.impact < 0 ? 'negative' : r.impact > 0 ? 'positive' : ''}">
        ${signedWon(r.impact)}
        ${r.note ? `<span class="breakdown-note">${r.note}</span>` : ''}
      </span>
    </li>`).join('');

  // 리포트 카드: 상태 판정 + 영향 순위
  $('report-cards').innerHTML = [
    reportCard({
      id: 'status', tone: status.tone, tag: status.label, title: '진단 결과 · ' + status.label,
      text: a.headline, meta: `상태 ${status.id}`,
    }),
    ...a.rankedImpacts.filter((r) => r.impact !== 0).map((r) => reportCard({
      id: r.key, tone: r.impact < 0 ? 'warning' : 'success', tag: r.impact < 0 ? '감소 요인' : '증가 요인',
      title: r.label, text: `이익에 ${signedWon(r.impact)} 영향`, meta: r.note,
    })),
  ].join('');

  // 다음 확인
  $('action-hint-list').innerHTML = a.actionHints.map((h) => `
    <li class="action-hint-item">
      <strong>${h.label}</strong>
      ${h.hint}
      ${h.toolUrl ? ` — <a href="${h.toolUrl}">관련 도구 바로가기</a>` : ''}
    </li>`).join('') || '<li class="action-hint-item">이익 변동에 영향을 준 항목이 없습니다.</li>';

  // 캡션
  $('caveat-list').innerHTML = a.caveats.map((c) => `<li>⚠ ${c}</li>`).join('');

  setResultVisible(true);
  return a;
}

function setResultVisible(on) {
  $('result-empty').hidden = on;
  $('result-body').hidden = !on;
  $('report-empty').hidden = on;
  $('report-body').hidden = !on;
}

// ───────────────────────── 입력값 자동 저장 ─────────────────────────

function saveInputs() {
  const data = {};
  MONEY_FIELDS.forEach((id) => { data[id] = $(id).value; });
  safeSet(INPUTS_KEY, data);
}

function restoreInputs() {
  const data = safeParse(INPUTS_KEY);
  if (!data) return;
  MONEY_FIELDS.forEach((id) => { if (typeof data[id] === 'string') $(id).value = data[id]; });
}

// ───────────────────────── 이벤트 ─────────────────────────

function recalc() {
  const raw = readValues();
  saveInputs();
  const complete = MONEY_FIELDS.every((id) => raw[id] !== null);
  if (!complete) { setResultVisible(false); return null; }
  const prev = toPeriodInput(raw, 'Prev');
  const curr = toPeriodInput(raw, 'Curr');
  return render(prev, curr);
}

let initTries = 0;
function init() {
  // 필요한 요소가 아직 안 보이면(광고 스크립트가 DOM을 재배치 중) 잠시 후 재시도
  if (EL_IDS.some((id) => !document.getElementById(id)) && initTries++ < 20) {
    setTimeout(init, 50);
    return;
  }
  EL_IDS.forEach((id) => { el[id] = document.getElementById(id); });

  MONEY_FIELDS.forEach((id) => {
    bindCommaInput(el[id]);
    el[id].addEventListener('input', () => {
      if (!startTracked && MONEY_FIELDS.some((f) => toNumber(el[f].value) !== null)) {
        startTracked = true;
        safeTrack(() => window.trackToolStart && window.trackToolStart(TOOL_ID));
      }
      recalc();
    });
  });

  $('calc-btn').addEventListener('click', () => {
    const a = recalc();
    if (a) {
      safeTrack(() => window.trackToolRun && window.trackToolRun(TOOL_ID, { status: a.status.id }));
    }
  });

  $('reset-btn').addEventListener('click', () => {
    MONEY_FIELDS.forEach((id) => { $(id).value = ''; });
    safeRemove(INPUTS_KEY);
    setResultVisible(false);
    $(FIELD_KEYS[0] + 'Prev').focus();
    safeTrack(() => window.trackTool && window.trackTool('tool_reset', TOOL_ID, {}));
  });

  restoreInputs();
  recalc();
}

init();
