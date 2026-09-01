// 사업 생존기간 계산기 — 화면 로직
// 계산·상태·결과 문구는 engine/survival-calculator.js 에만 있다.
// 이 파일은 입력 검증 · DOM 렌더링 · localStorage 저장만 담당한다.

import { analyze, buildScenarios, analysisCards, formatWon } from './engine/survival-calculator.js';

const INPUTS_KEY = 'survivalCalcInputs';
const HISTORY_KEY = 'survivalCalcHistory';
const HISTORY_LIMIT = 10;

const MONEY_FIELDS = ['cash', 'revenue', 'variable', 'fixed', 'other', 'minReserve'];
const REQUIRED_FIELDS = ['cash', 'revenue', 'variable', 'fixed', 'other'];

const RESERVE_TOGGLE = '.advanced-toggle[data-target="reserve-advanced"]';
const REPORT_ICONS = {
  status: '🚦', 'CAL-001': '💵', 'CAL-004': '⚖️', 'CAL-002': '📦', 'CAL-003': '🏠', 'CAL-005': '🎯',
};

const $ = (id) => document.getElementById(id);

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

function safeParse(key, fallback = []) {
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
  MONEY_FIELDS.forEach((k) => { raw[k] = toNumber($(k).value); });
  return raw;
}

function validate(raw) {
  const errors = {};
  const warnings = {};
  const values = {};
  MONEY_FIELDS.forEach((k) => { values[k] = raw[k] === null ? 0 : raw[k]; });

  const complete = REQUIRED_FIELDS.every((k) => raw[k] !== null);

  if (raw.variable !== null && raw.revenue !== null && values.variable > values.revenue) {
    errors.variable = '월 변동비가 월평균 매출보다 큽니다. 변동비는 매출에 비례하는 비용이라 매출을 초과할 수 없습니다.';
  }
  if (raw.other !== null && raw.revenue !== null && values.other > values.revenue) {
    warnings.other = '월 기타 현금 유출이 월평균 매출보다 큽니다. 입력값을 확인해 주세요. (계산은 그대로 진행됩니다)';
  }

  return { values, errors, warnings, complete, ok: Object.keys(errors).length === 0 };
}

function paintFieldFeedback({ errors = {}, warnings = {} }) {
  MONEY_FIELDS.forEach((k) => {
    const errEl = $(`${k}-error`);
    const box = $(k).closest('.money-input');
    errEl.textContent = errors[k] || warnings[k] || '';
    errEl.classList.toggle('is-warning', !errors[k] && !!warnings[k]);
    box.classList.toggle('has-error', !!errors[k]);
  });
}

// ───────────────────────── 렌더링 ─────────────────────────

function reportCard({ id, tone, tag, title, text, meta }) {
  return `
    <li class="report-card tone-${tone}">
      <span class="report-icon">${REPORT_ICONS[id] || '•'}</span>
      <div class="report-body">
        <div class="report-row"><strong>${title}</strong><span class="report-tag">${tag}</span></div>
        <p class="report-text">${text}</p>
        <p class="report-meta">${meta}</p>
      </div>
    </li>`;
}

function render(values) {
  const a = analyze(values);
  const { survival: s, status } = a;

  // 히어로
  $('survival-text').textContent = a.headline;
  $('hero-tier').textContent = status.label;
  $('hero-tier').className = 'hero-tier tone-' + status.tone;
  $('survival-note').textContent = a.note;

  const cashflowEl = $('stat-cashflow');
  cashflowEl.textContent = signedWon(a.monthlyCashFlow);
  cashflowEl.classList.toggle('is-negative', a.monthlyCashFlow < 0);
  $('stat-decrease').textContent = s.infinite ? '없음' : formatWon(s.monthlyDecrease);

  // 현금 흐름 내역
  const rows = [{ label: '현재 보유 현금', display: formatWon(values.cash) }];
  if (values.minReserve > 0) rows.push({ label: '최소 유지 현금', display: '− ' + formatWon(values.minReserve), neg: true });
  rows.push({ label: '월평균 매출', display: formatWon(values.revenue) });
  rows.push({ label: '월 변동비', display: '− ' + formatWon(values.variable), neg: true });
  rows.push({ label: '월 고정비', display: '− ' + formatWon(values.fixed), neg: true });
  rows.push({ label: '월 기타 현금 유출', display: '− ' + formatWon(values.other), neg: true });

  $('breakdown-list').innerHTML =
    rows.map((r) => `<li><span>${r.label}</span><span class="${r.neg ? 'negative' : ''}">${r.display}</span></li>`).join('') +
    `<li class="total"><span>월 현금흐름</span><span class="${a.monthlyCashFlow >= 0 ? 'positive' : 'negative'}">${signedWon(a.monthlyCashFlow)}</span></li>`;

  // 리포트 카드 (상태 판정 + 분석 카드)
  $('report-cards').innerHTML = [
    reportCard({
      id: 'status', tone: status.tone, tag: status.label, title: '상태 판정 · ' + status.label,
      text: status.message, meta: `근거: ${status.reason} · 권장: ${status.action} (${status.id})`,
    }),
    ...analysisCards(a).map((c) => reportCard({ ...c, meta: `적용 규칙 ${c.id}` })),
  ].join('');

  // 시나리오
  $('scenario-body').innerHTML = buildScenarios(values).map((row) => {
    const r = row.result;
    return `<tr class="${row.kind === 'base' ? 'is-base' : ''}">
      <td>${row.label}</td>
      <td>${formatWon(row.input.revenue)}</td>
      <td class="${r.monthlyCashFlow < 0 ? 'negative' : ''}">${signedWon(r.monthlyCashFlow)}</td>
      <td>${r.headline}</td>
      <td><span class="cell-badge tone-${r.status.tone}">${r.status.label}</span></td>
    </tr>`;
  }).join('');

  setResultVisible(true);
  return a;
}

function setResultVisible(on) {
  $('result-empty').hidden = on;
  $('result-body').hidden = !on;
  $('report-empty').hidden = on;
  $('report-cards').hidden = !on;
  $('scenario-wrap').hidden = !on;
}

// ───────────────────────── 계산 기록 (localStorage) ─────────────────────────

function renderHistory() {
  const list = safeParse(HISTORY_KEY);
  $('history-empty').hidden = list.length > 0;
  $('history-table').hidden = list.length === 0;
  $('history-body').innerHTML = list.map((row, i) => `
    <tr>
      <td>${row.time}</td>
      <td>${formatWon(row.cash)}</td>
      <td class="${row.flow < 0 ? 'negative' : ''}">${signedWon(row.flow)}</td>
      <td>${row.survival}</td>
      <td>${row.status}</td>
      <td><button type="button" class="history-row-delete" data-index="${i}" aria-label="기록 삭제">✕</button></td>
    </tr>`).join('');
}

function addHistory(a) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const entry = {
    time: `${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    cash: a.input.cash,
    flow: a.monthlyCashFlow,
    survival: a.headline,
    status: a.status.label,
  };
  safeSet(HISTORY_KEY, [entry, ...safeParse(HISTORY_KEY)].slice(0, HISTORY_LIMIT));
  renderHistory();
}

// ───────────────────────── 입력값 자동 저장 ─────────────────────────

function saveInputs() {
  const data = {};
  MONEY_FIELDS.forEach((k) => { data[k] = $(k).value; });
  safeSet(INPUTS_KEY, data);
}

function restoreInputs() {
  const data = safeParse(INPUTS_KEY, null);
  if (!data) return;
  MONEY_FIELDS.forEach((k) => { if (typeof data[k] === 'string') $(k).value = data[k]; });
  if (data.minReserve) setReservePanel(true);
}

// ───────────────────────── 이벤트 ─────────────────────────

function setReservePanel(open) {
  $('reserve-advanced').hidden = !open;
  const toggle = document.querySelector(RESERVE_TOGGLE);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = `최소 유지 현금 설정 (선택) ${open ? '▴' : '▾'}`;
}

function recalc() {
  const v = validate(readValues());
  paintFieldFeedback(v);
  saveInputs();
  if (!v.complete || !v.ok) { setResultVisible(false); return null; }
  return render(v.values);
}

function init() {
  MONEY_FIELDS.forEach((k) => {
    bindCommaInput($(k));
    $(k).addEventListener('input', recalc);
  });

  document.querySelector(RESERVE_TOGGLE).addEventListener('click', () => {
    setReservePanel($('reserve-advanced').hidden);
  });

  $('calc-btn').addEventListener('click', () => {
    const a = recalc();
    if (a) addHistory(a);
  });

  $('reset-btn').addEventListener('click', () => {
    MONEY_FIELDS.forEach((k) => { $(k).value = ''; });
    safeRemove(INPUTS_KEY);
    paintFieldFeedback({});
    setResultVisible(false);
    $('cash').focus();
  });

  $('history-clear-btn').addEventListener('click', () => {
    safeRemove(HISTORY_KEY);
    renderHistory();
  });

  $('history-body').addEventListener('click', (e) => {
    const btn = e.target.closest('.history-row-delete');
    if (!btn) return;
    const list = safeParse(HISTORY_KEY);
    list.splice(Number(btn.dataset.index), 1);
    safeSet(HISTORY_KEY, list);
    renderHistory();
  });

  restoreInputs();
  renderHistory();
  recalc();
}

init();
