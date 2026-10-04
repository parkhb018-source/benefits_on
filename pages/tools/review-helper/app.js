// 리뷰 대응도우미 — 화면 로직
// 분류·욕설·빈칸·정책 판단은 js/ 모듈에, 문구는 data/review-helper/*.json 에 있다.
// 이 파일은 상태(메모리만) · 해시 라우팅 · DOM 그리기 · GA 이벤트만 담당한다.
// 사용자 입력(리뷰 글·가게 이름·빈칸 값)은 어디에도 저장하거나 보내지 않는다(localStorage·이벤트·URL 포함).

import {
  TOOL_ID, HUB_URL, PLATFORM_CHIPS, DEFAULT_PLATFORM, DEFAULT_TONE, DESKTOP_MIN_WIDTH, OCR_ENABLED,
} from './js/config.js?v=20261004c';
import { loadData } from './js/data.js?v=20261004c';
import { createAbuseChecker } from './js/abuse.js?v=20261004c';
import { createClassifier } from './js/classify.js?v=20261004c';
import { listBlanks, splitTemplate, fillTemplate, countBlanksLeft } from './js/fill.js?v=20261004c';
import { policyFlags } from './js/policy.js?v=20261004c';
import { prepareOcr, recognizeImage, terminateOcr, isOcrBusy } from './js/ocr.js?v=20261004c';

const SAMPLE_REVIEW = '배달이 너무 늦게 와서 음식이 다 식었어요. 다시는 안 시킬 것 같아요.';
const MSG_CHECKING = '아직 확인 중인 정보예요. 공식 안내를 꼭 확인하세요.';
const MSG_STALE = '정책이 바뀌었을 수 있어요. 공식 안내를 확인하세요.';

const SCREENS = {
  home: 'scrHome', paste: 'scrPaste', capture: 'scrCapture', confirm: 'scrConfirm',
  result: 'scrResult', reply: 'scrReply', report: 'scrReport',
};

// ===== GA4 (assets/js/analytics.js 헬퍼만 사용) =====
// 매개변수에는 PRD §8 의 값(유형 ID·플랫폼 ID·별점·말투·숫자)만 넣는다. 리뷰 글·가게 이름·빈칸 값 금지.
function safe(fn) { try { fn(); } catch (e) { /* 조용히 무시 */ } }
const ev = (name, params) => safe(() => window.track && window.track(name, params || {}));
let toolStarted = false;
let desktopStartSent = false;
function markStart() {
  if (toolStarted) return;
  toolStarted = true;
  safe(() => window.trackToolStart && window.trackToolStart(TOOL_ID));
}

// ===== 상태 (메모리 객체 하나, PRD §7) =====
const initialState = () => ({
  platform: DEFAULT_PLATFORM, rating: null, text: '', shopName: '',
  type: null, manualType: false, tone: DEFAULT_TONE, blanks: {}, checks: {},
  result: null, analyzed: false, typesOpen: false,
});
let state = initialState();
let DATA = null;
let dataFailed = false;
let classify = null;

// ===== 요소 캐시 =====
// AdSense auto ads 가 로드 직후 빈/숨김 요소를 잠깐 떼어냈다 되돌리므로, 필요한 요소가 모두 보일 때까지
// init 을 재시도한 뒤 참조를 캐시한다. DOM 조회는 이 캐시($)를 쓴다.
const EL_IDS = [
  'rhDataError', 'rhToast', 'rhToastText', 'rhToastClose', 'tabHub', 'tabRecord', 'tabStats', 'goPaste', 'goCapture',
  ...Object.values(SCREENS),
  'pasteText', 'pasteClear', 'pasteSample', 'pasteHint', 'pasteNext',
  'capFrame', 'capPreview', 'capEmpty', 'capFile', 'capCamera', 'capSheet', 'capSheetTitle', 'capSheetSub', 'capConfirm', 'capToPaste', 'capPrep',
  'platformChips', 'ratingChips', 'confirmText', 'shopName', 'confirmHint', 'confirmNext', 'deskReset',
  'deskDrop', 'deskFile', 'deskDropStatus', 'deskDropToPaste', 'ocrCleanNote',
  'midEmpty', 'rightEmpty', 'deskOfficialCard', 'deskOfficial',
  'resTitle', 'resPills', 'resAdvice', 'resAdviceText', 'resStatus', 'resReason', 'resAbuseExtra', 'resSecondary',
  'resToggle', 'resTypeChips', 'resChecksCard', 'resChecks', 'resPolicyName', 'resPolicyLine', 'resPolicyFlag',
  'resNextCard', 'resStep2', 'resStep2Title', 'resStep2Desc', 'resToReply', 'resReset',
  'repList', 'repOfficial',
  'replyTypeChips', 'replyBanner', 'replyToneChips', 'replyBlankCount', 'replyPreview', 'replyBlanks', 'replyBlankWarn', 'replyCopy', 'replyReset',
];
const el = {};
const $ = (id) => el[id] || document.getElementById(id);

// ===== 작은 DOM 도우미 =====
function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}
const show = (id, on) => { $(id).hidden = !on; };

// ===== 데이터 조회 =====
const typeById = (id) => DATA.types.types.find((t) => t.id === id);
const platformById = (id) => DATA.platforms.platforms.find((p) => p.id === id);
const templateFor = (typeId, tone) => {
  const t = DATA.templates.templates.find((x) => x.typeId === typeId);
  return t ? t[tone] : '';
};

// 욕설·모욕이 감지되면 '신고대상은 아닙니다' 계열 문구를 쓰지 않는다(types.json displayRules 1, PRD §10-3).
function statusFor(type) {
  let key = type.reportStatus;
  if (state.result && state.result.abusive && (key === 'not_target' || key === 'principle_not_target')) key = 'may_review';
  return DATA.types.reportStatuses[key];
}

function policyLine(p, withVerified) {
  const pol = p.policy;
  if (!pol.effectiveDate) return `${pol.title} · ${pol.versionLabel}`;
  return `${pol.title} · ${pol.effectiveDate} 시행` + (withVerified && pol.verifiedDate ? ` · 확인일 ${pol.verifiedDate}` : '');
}
function policyFlagText(p) {
  const f = policyFlags(p, DATA.platforms.staleAfterDays);
  if (f.checking) return MSG_CHECKING;
  if (f.stale) return MSG_STALE;
  return '';
}

// ===== 화면 전환 (해시 라우팅) =====
const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
const isDesktop = () => mq.matches;
const routeStack = [];

function currentRoute() {
  const r = location.hash.replace(/^#/, '');
  return SCREENS[r] ? r : 'home';
}
function navigate(route) {
  if (currentRoute() === route && location.hash) applyRoute(true);
  else location.hash = '#' + route;
}
function replaceRoute(route) {
  history.replaceState(null, '', '#' + route);
  applyRoute(false);
}

function applyRoute(userNav) {
  const route = currentRoute();
  if (isDesktop()) {
    for (const r of ['home', 'paste', 'capture']) show(SCREENS[r], false);
    show('scrConfirm', true);
    for (const r of ['result', 'report', 'reply']) show(SCREENS[r], state.analyzed);
    show('midEmpty', !state.analyzed);
    show('rightEmpty', !state.analyzed);
    show('deskOfficialCard', state.analyzed);
    syncTextFields();
    return;
  }
  // 모바일: 결과 계열 화면은 분석한 뒤에만
  if (['result', 'report', 'reply'].includes(route) && !state.analyzed) return replaceRoute('home');
  if (route === 'reply' && !state.type) return replaceRoute('result');

  if (routeStack[routeStack.length - 2] === route) routeStack.pop();
  else if (routeStack[routeStack.length - 1] !== route) routeStack.push(route);

  for (const [r, id] of Object.entries(SCREENS)) show(id, r === route);
  show('midEmpty', false);
  show('rightEmpty', false);
  syncTextFields();
  // Tesseract 는 캡쳐 화면에 들어올 때만 준비하고, 화면을 떠나면 (작업 중이 아닐 때) 정리한다
  if (route === 'capture') prepareCapture();
  else if (!isOcrBusy()) terminateOcr();
  if (route === 'report') ev('review_helper_checklist_open', { platform: state.platform });
  if (userNav) {
    window.scrollTo(0, 0);
    const head = $(SCREENS[route]).querySelector('h2');
    if (head) head.focus({ preventScroll: true });
  }
}

function goBack(parent) {
  if (routeStack.length > 1) history.back();
  else navigate(parent);
}

function syncTextFields() {
  if ($('pasteText').value !== state.text) $('pasteText').value = state.text;
  if ($('confirmText').value !== state.text) $('confirmText').value = state.text;
  if ($('shopName').value !== state.shopName) $('shopName').value = state.shopName;
  show('pasteSample', state.text === '');
}

// ===== 확인 화면: 플랫폼·별점 칩 =====
function renderPlatformChips() {
  $('platformChips').replaceChildren(...PLATFORM_CHIPS.map((c) => h('button', {
    type: 'button', class: 'rh-chip', 'data-platform': c.id,
    'aria-pressed': String(state.platform === c.id), text: c.label,
  })));
}
function renderRatingChips() {
  $('ratingChips').replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('button', {
    type: 'button', class: 'rh-chip', 'data-rating': String(n), 'aria-label': `${n}점`,
    'aria-pressed': String(state.rating === n), text: String(n),
  })));
}

// ===== 분석 =====
function analyze() {
  show('confirmHint', false);
  if (!state.text.trim()) {
    show('confirmHint', true);
    $('confirmText').focus();
    return;
  }
  if (!DATA) {
    if (dataFailed) show('rhDataError', true);
    return;
  }
  const r = classify(state.text, state.rating);
  Object.assign(state, {
    result: r, type: r.main, manualType: false, typesOpen: r.main === null, analyzed: true,
  });
  const typeId = r.main || 'none';
  safe(() => window.trackToolRun && window.trackToolRun(TOOL_ID, { type_id: typeId, platform: state.platform }));
  ev('review_helper_analyze', { type_id: typeId, platform: state.platform, rating: state.rating === null ? 'none' : state.rating });
  renderAll();
  if (isDesktop()) applyRoute(false);
  else navigate('result');
}

function setType(id) {
  const from = state.type;
  state.typesOpen = false;
  if (from !== id) {
    state.type = id;
    state.manualType = true;
    ev('review_helper_type_change', { from: from || 'none', to: id });
  }
  renderResult();
  renderReply(true);
}

function renderAll() {
  renderResult();
  renderReport();
  renderReply(true);
}

// ===== 3. 분석 결과 =====
function renderResult() {
  if (!state.result) return;
  const type = state.type ? typeById(state.type) : null;
  const typed = !!type;

  $('resTitle').textContent = typed ? type.result.title : '유형을 골라 주세요';
  show('resPills', typed);
  show('resAdvice', typed);
  show('resChecksCard', typed);
  if (typed) {
    const pills = [...type.result.pills];
    if (state.result.vulgar) pills.push('거친 표현');
    $('resPills').replaceChildren(...pills.map((t) => h('li', { text: t })));
    const st = statusFor(type);
    $('resAdviceText').textContent = type.result.advice;
    $('resStatus').textContent = st.message;
    $('resStatus').classList.toggle('is-caution', st.tone === 'caution');
    $('resReason').textContent = type.result.reason ? `이유: ${type.result.reason}` : '';
    $('resChecks').replaceChildren(...type.result.checks.map((t) => h('li', { text: t })));
  }
  show('resReason', typed && !!type.result.reason);
  show('resAbuseExtra', typed && state.result.abusive && state.type !== 'T12');

  const others = state.result.secondary.filter((id) => id !== state.type).map((id) => typeById(id).shortLabel);
  $('resSecondary').textContent = others.length ? `함께 감지된 유형: ${others.join(', ')}` : '';
  show('resSecondary', others.length > 0);

  const open = state.typesOpen || !typed;
  show('resToggle', typed);
  $('resToggle').setAttribute('aria-expanded', String(open));
  $('resToggle').textContent = open ? '닫기' : '유형이 맞지 않나요? 바꾸기';
  show('resTypeChips', open);
  $('resTypeChips').replaceChildren(...DATA.types.types.map((t) => h('button', {
    type: 'button', class: 'rh-chip rh-chip--pill', 'data-type': t.id,
    'aria-pressed': String(state.type === t.id), text: t.shortLabel,
  })));

  const p = platformById(state.platform);
  $('resPolicyName').textContent = p.name;
  $('resPolicyLine').textContent = policyLine(p, false);
  const flag = policyFlagText(p);
  $('resPolicyFlag').textContent = flag;
  show('resPolicyFlag', !!flag);

  show('resNextCard', typed);
  if (typed) {
    const s2 = type.result.step2;
    show('resStep2', !!s2);
    if (s2) {
      $('resStep2Title').textContent = s2.title;
      $('resStep2Desc').textContent = s2.desc;
    }
  }
  $('resToReply').setAttribute('aria-disabled', String(!typed));
}

// ===== 5. 신고 전 체크리스트 + 공식 안내 =====
function renderReport() {
  if (!DATA) return;
  const items = [...DATA.checklist.items].sort((a, b) => a.order - b.order);
  $('repList').replaceChildren(...items.map((it) => {
    const b = it.basis.find((x) => x.platformId === state.platform);
    const unverified = !b || b.verified === false || !b.ref;
    const basisText = [b && b.ref ? `근거: ${b.ref}` : '', unverified ? '공식 원문으로 확인되지 않은 항목이에요' : '']
      .filter(Boolean).join(' · ');
    const id = `chk-${it.id}`;
    return h('li', { class: 'rh-check-row' }, [
      h('label', { for: id }, [
        h('input', { type: 'checkbox', id, 'data-check': it.id, checked: !!state.checks[it.id] }),
        h('span', { text: it.text }),
      ]),
      h('p', { class: 'rh-basis' + (unverified ? ' rh-basis-unverified' : ''), text: basisText }),
    ]);
  }));
  for (const listId of ['repOfficial', 'deskOfficial']) {
    $(listId).replaceChildren(...DATA.platforms.platforms.map((p) => {
      const flag = policyFlagText(p);
      const text = h('div', { class: 'rh-official-text' }, [
        h('strong', { text: p.name }),
        h('span', { text: policyLine(p, true) }),
        !p.policy.officialUrl && p.policy.officialUrlNote ? h('span', { text: p.policy.officialUrlNote }) : null,
        flag ? h('span', { class: 'rh-policy-flag', text: flag }) : null,
      ]);
      const link = p.policy.officialUrl ? h('a', {
        class: 'rh-more', href: p.policy.officialUrl, target: '_blank', rel: 'noopener noreferrer',
        'data-policy-link': p.id, 'aria-label': `${p.name} 공식 안내 열기 (새 탭)`, text: '열기',
      }) : null;
      return h('li', {}, [text, link]);
    }));
  }
}

// ===== 4. 답변 초안 =====
function blankValues() {
  const values = { ...state.blanks };
  for (const b of DATA.templates.blanks) if (b.autoFill === 'shopNameInput') values[b.token] = state.shopName;
  return values;
}

function renderReply(rebuildInputs) {
  if (!state.result) return;
  const type = state.type ? typeById(state.type) : null;
  $('replyTypeChips').replaceChildren(...DATA.types.types.map((t) => h('button', {
    type: 'button', class: 'rh-chip rh-chip--pill', 'data-type': t.id,
    'aria-pressed': String(state.type === t.id), text: t.shortLabel,
  })));
  $('replyToneChips').replaceChildren(...DATA.templates.tones.map((t) => h('button', {
    type: 'button', class: 'rh-chip', 'data-tone': t.id, 'aria-pressed': String(state.tone === t.id), text: t.label,
  })));
  $('replyBanner').textContent = type ? type.replyBanner : '가운데에서 리뷰 유형을 고르면 답변 초안이 나와요.';
  $('replyBanner').classList.toggle('is-caution', !!(type && type.caution));
  $('replyCopy').disabled = !type;
  if (rebuildInputs) buildBlankInputs();
  updatePreview();
}

function buildBlankInputs() {
  const tpl = state.type ? templateFor(state.type, state.tone) : '';
  const values = blankValues();
  $('replyBlanks').replaceChildren(...listBlanks(tpl).map((token, i) => {
    const meta = DATA.templates.blanks.find((b) => b.token === token) || { name: token, meaning: '', example: '' };
    const id = `blank-${i}`;
    const input = h('input', {
      type: 'text', id, class: 'rh-input', autocomplete: 'off', 'data-blank': token,
      'aria-describedby': meta.meaning ? `${id}-help` : null,
      placeholder: meta.autoFill ? meta.name : meta.example,
    });
    input.value = values[token] || '';
    return h('div', { class: 'rh-blank' }, [
      h('label', { for: id, text: meta.name }),
      meta.meaning ? h('p', { class: 'rh-help', id: `${id}-help`, text: meta.meaning }) : null,
      input,
    ]);
  }));
}

function updatePreview() {
  const tpl = state.type ? templateFor(state.type, state.tone) : '';
  const values = blankValues();
  $('replyPreview').replaceChildren(...splitTemplate(tpl, values).map((s) => (s.blank ? h('mark', { text: s.text }) : document.createTextNode(s.text))));
  const left = countBlanksLeft(tpl, values);
  $('replyBlankCount').textContent = tpl ? `빈칸 ${left}곳` : '';
  $('replyBlankWarn').textContent = `빈칸 ${left}곳이 비어 있어요`;
  show('replyBlankWarn', left > 0);
}

async function copyReply() {
  if (!state.type) return;
  const tpl = templateFor(state.type, state.tone);
  const values = blankValues();
  const text = fillTemplate(tpl, values);
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (e) {
    const ta = h('textarea', { 'aria-hidden': 'true' });
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
  }
  const btn = $('replyCopy');
  btn.textContent = ok ? '복사했어요' : '복사하지 못했어요. 미리보기 글을 직접 선택해 복사해 주세요.';
  setTimeout(() => { btn.textContent = '답변문 복사하기'; }, 2000);
  if (ok) ev('review_helper_reply_copy', { type_id: state.type, tone: state.tone, blanks_left: countBlanksLeft(tpl, values) });
}

// ===== 초기화 =====
function resetAll(screen) {
  ev('review_helper_reset', { screen });
  state = initialState();
  clearCapture();
  show('rhToast', false);
  show('pasteHint', false);
  show('confirmHint', false);
  renderPlatformChips();
  renderRatingChips();
  $('replyBlanks').replaceChildren();
  syncTextFields();
  if (isDesktop()) {
    applyRoute(false);
    $('confirmText').focus();
  } else {
    routeStack.length = 0;
    navigate('home');
  }
}

// ===== 1a. 캡쳐 / PC 끌어다 놓기 — 글자 읽기(js/ocr.js) =====
const OCR_FAIL = {
  load: ['글자 읽기 프로그램을 불러오지 못했어요.', '인터넷 연결을 확인하고 다시 시도하거나, 붙여넣기로 입력해 주세요.'],
  timeout: ['글자를 읽는 데 시간이 너무 오래 걸려요.', '다시 시도하거나 붙여넣기로 입력해 주세요.'],
  empty: ['이미지에서 글자를 찾지 못했어요.', '리뷰 글이 잘 보이게 다시 캡쳐하거나 붙여넣기로 입력해 주세요.'],
  image: ['이미지를 열지 못했어요.', '다른 이미지를 고르거나 붙여넣기로 입력해 주세요.'],
};
let previewUrl = null;
let ocrRun = 0; // 초기화·새 이미지 뒤에 끝난 이전 작업 결과는 버린다
let ocrText = '';
let ocrRemoved = 0;

// 깨진 줄을 뺐으면 확인 화면 입력창 위에 알린다(뺀 게 없으면 숨김)
function showCleanNote(removed) {
  $('ocrCleanNote').textContent = removed ? `읽다가 깨진 줄 ${removed}개를 뺐어요. 리뷰와 상관없는 줄이 남아 있다면 지워 주세요.` : '';
  show('ocrCleanNote', removed > 0);
}

function prepareCapture() {
  if (isOcrBusy()) return;
  $('capPrep').textContent = '글자 읽기 프로그램을 준비하고 있어요…';
  prepareOcr()
    .then(() => { if (currentRoute() === 'capture') $('capPrep').textContent = '글자 읽기 준비가 됐어요.'; })
    .catch(() => { $('capPrep').textContent = '글자 읽기 프로그램을 불러오지 못했어요. 붙여넣기로 입력할 수 있어요.'; });
}

function clearCapture() {
  ocrRun++;
  terminateOcr();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  ocrText = '';
  ocrRemoved = 0;
  showCleanNote(0);
  $('capPreview').removeAttribute('src');
  show('capPreview', false);
  show('capEmpty', true);
  show('capSheet', false);
  $('capFile').value = '';
  $('capCamera').value = '';
  $('deskFile').value = '';
  $('deskDropStatus').textContent = '';
  show('deskDropToPaste', false);
}

function setSheet(title, sub, done) {
  $('capSheetTitle').textContent = title;
  $('capSheetSub').textContent = sub;
  show('capConfirm', done === 'ok');
  show('capToPaste', done === 'fail');
}

function progressText(m) {
  if (m && m.status === 'recognizing text') return `잠시만 기다려 주세요. (${Math.round((m.progress || 0) * 100)}%)`;
  return '글자 읽기 프로그램을 내려받고 있어요. 잠시만 기다려 주세요.';
}

async function handleImage(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) return;
  markStart();
  const desktop = isDesktop();
  if (desktop && !desktopStartSent) {
    desktopStartSent = true;
    ev('review_helper_start', { method: 'capture' });
  }
  const run = ++ocrRun;
  showCleanNote(0);
  if (desktop) {
    $('deskDropStatus').textContent = '이미지에서 텍스트를 인식하고 있어요...';
    show('deskDropToPaste', false);
  } else {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file); // 브라우저 안에서만 쓰는 주소(업로드 없음)
    $('capPreview').src = previewUrl;
    show('capPreview', true);
    show('capEmpty', false);
    show('capSheet', true);
    setSheet('이미지에서 텍스트를 인식하고 있어요...', '잠시만 기다려 주세요.', null);
  }
  const r = await recognizeImage(file, (m) => {
    if (run !== ocrRun) return;
    if (desktop) $('deskDropStatus').textContent = `이미지에서 텍스트를 인식하고 있어요... ${progressText(m)}`;
    else $('capSheetSub').textContent = progressText(m);
  });
  if (run !== ocrRun) return;
  if (r.ok) {
    if (desktop) {
      state.text = r.text;
      syncTextFields();
      showCleanNote(r.removed);
      $('deskDropStatus').textContent = '글자를 읽었어요. 위 칸에서 확인하고 고쳐 주세요.';
    } else {
      ocrText = r.text;
      ocrRemoved = r.removed;
      setSheet('글자를 읽었어요.', '다음 화면에서 내용을 확인하고 고쳐 주세요.', 'ok');
    }
    return;
  }
  const [title, sub] = OCR_FAIL[r.reason] || OCR_FAIL.load;
  $('capPrep').textContent = ''; // 아래 안내 상자가 대신 설명한다
  if (desktop) {
    $('deskDropStatus').textContent = `${title} ${sub}`;
    show('deskDropToPaste', true);
  } else {
    setSheet(title, sub, 'fail');
  }
}

// ===== 안내 상자(기록·통계 준비중) =====
function showToast(msg) {
  $('rhToastText').textContent = msg;
  show('rhToast', true);
}

// ===== 이벤트 연결 =====
function bindEvents() {
  window.addEventListener('hashchange', () => applyRoute(true));
  mq.addEventListener('change', () => applyRoute(false));

  document.addEventListener('click', (e) => {
    const back = e.target.closest('[data-back]');
    if (back) { goBack(back.dataset.back); return; }
    const pf = e.target.closest('[data-platform]');
    if (pf) {
      state.platform = pf.dataset.platform;
      renderPlatformChips();
      if (state.analyzed) { renderResult(); renderReport(); }
      return;
    }
    const rt = e.target.closest('[data-rating]');
    if (rt) {
      const n = Number(rt.dataset.rating);
      state.rating = state.rating === n ? null : n;
      renderRatingChips();
      return;
    }
    const ty = e.target.closest('[data-type]');
    if (ty) { setType(ty.dataset.type); return; }
    const tn = e.target.closest('[data-tone]');
    if (tn) {
      state.tone = tn.dataset.tone;
      renderReply(true);
      return;
    }
    const pl = e.target.closest('[data-policy-link]');
    if (pl) ev('review_helper_policy_link_click', { platform: pl.dataset.policyLink });
  });

  $('goPaste').addEventListener('click', () => ev('review_helper_start', { method: 'paste' }));
  $('goCapture').addEventListener('click', () => ev('review_helper_start', { method: 'capture' }));
  $('tabHub').href = HUB_URL;
  $('tabHub').addEventListener('click', () => ev('review_helper_hub_click', {}));
  $('tabRecord').addEventListener('click', () => {
    showToast('기록 기능은 준비 중이에요. 곧 만나요.');
    ev('review_helper_tab_click', { tab: 'record' });
  });
  $('tabStats').addEventListener('click', () => {
    showToast('통계 기능은 준비 중이에요. 곧 만나요.');
    ev('review_helper_tab_click', { tab: 'stats' });
  });
  $('rhToastClose').addEventListener('click', () => show('rhToast', false));

  const onText = (src) => {
    state.text = src.value;
    markStart();
    if (isDesktop() && !desktopStartSent) { // PC 에는 처음 화면(붙여넣기·캡쳐 선택)이 없어 첫 입력 때 보낸다
      desktopStartSent = true;
      ev('review_helper_start', { method: 'paste' });
    }
    show('pasteHint', false);
    show('confirmHint', false);
    show('pasteSample', state.text === '');
  };
  $('pasteText').addEventListener('input', () => onText($('pasteText')));
  $('confirmText').addEventListener('input', () => onText($('confirmText')));
  $('pasteClear').addEventListener('click', () => {
    state.text = '';
    syncTextFields();
    $('pasteText').focus();
  });
  $('pasteSample').addEventListener('click', () => {
    state.text = SAMPLE_REVIEW;
    markStart();
    syncTextFields();
  });
  $('pasteNext').addEventListener('click', () => {
    if (!state.text.trim()) {
      show('pasteHint', true);
      $('pasteText').focus();
      return;
    }
    navigate('confirm');
  });

  $('shopName').addEventListener('input', () => {
    state.shopName = $('shopName').value;
    if (state.analyzed) {
      const autoInput = $('replyBlanks').querySelector('[data-blank="[가게 이름]"]');
      if (autoInput) autoInput.value = state.shopName;
      updatePreview();
    }
  });
  $('confirmNext').addEventListener('click', analyze);
  $('deskReset').addEventListener('click', () => resetAll('desktop'));
  $('resReset').addEventListener('click', () => resetAll('result'));
  $('replyReset').addEventListener('click', () => resetAll('reply'));
  $('resToggle').addEventListener('click', () => {
    state.typesOpen = !state.typesOpen;
    renderResult();
  });
  $('resToReply').addEventListener('click', (e) => {
    if (!state.type) {
      e.preventDefault();
      const first = $('resTypeChips').querySelector('button');
      if (first) first.focus();
    }
  });

  $('repList').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-check]');
    if (cb) state.checks[cb.dataset.check] = cb.checked;
  });

  $('replyBlanks').addEventListener('input', (e) => {
    const input = e.target.closest('[data-blank]');
    if (!input) return;
    const meta = DATA.templates.blanks.find((b) => b.token === input.dataset.blank);
    if (meta && meta.autoFill === 'shopNameInput') {
      state.shopName = input.value;
      $('shopName').value = input.value;
    } else {
      state.blanks[input.dataset.blank] = input.value;
    }
    updatePreview();
  });
  $('replyCopy').addEventListener('click', copyReply);

  // 캡쳐: 갤러리·카메라·끌어다 놓기·붙여넣기(Ctrl+V). PC 는 확인 칸 아래 끌어다 놓기 칸.
  if (!OCR_ENABLED) {
    for (const id of ['goCapture', 'deskDrop']) show(id, false);
    document.querySelector('#pasteToCapture').hidden = true;
    return;
  }
  $('capFile').addEventListener('change', () => handleImage($('capFile').files[0]));
  $('capCamera').addEventListener('change', () => handleImage($('capCamera').files[0]));
  $('deskFile').addEventListener('change', () => handleImage($('deskFile').files[0]));
  for (const zone of [$('capFrame'), $('deskDrop')]) {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-drag'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('is-drag');
      handleImage(e.dataTransfer.files[0]);
    });
  }
  document.addEventListener('paste', (e) => {
    if (!isDesktop() && currentRoute() !== 'capture') return;
    const item = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      handleImage(item.getAsFile());
    }
  });
  $('capConfirm').addEventListener('click', () => {
    state.text = ocrText;
    showCleanNote(ocrRemoved);
    navigate('confirm');
  });
  $('deskDropToPaste').addEventListener('click', (e) => {
    e.preventDefault();
    $('confirmText').focus();
  });
}

// ===== 시작 =====
let initTries = 0;
async function init() {
  if (EL_IDS.some((id) => !document.getElementById(id)) && initTries++ < 20) {
    setTimeout(init, 50);
    return;
  }
  EL_IDS.forEach((id) => { el[id] = document.getElementById(id); });

  renderPlatformChips();
  renderRatingChips();
  bindEvents();
  applyRoute(false);

  DATA = await loadData();
  if (!DATA) {
    dataFailed = true;
    show('rhDataError', true);
    return;
  }
  classify = createClassifier(DATA.types, createAbuseChecker(DATA.abuse));
  document.querySelectorAll('[data-disclaimer]').forEach((n) => { n.textContent = DATA.types.disclaimer; });
}

init();
