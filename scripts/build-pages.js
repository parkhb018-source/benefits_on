#!/usr/bin/env node
/*
 * scripts/build-pages.js
 *
 * data/policies.json / data/menu-assignment.json / data/home-cards.json 을 읽어
 * 메뉴 페이지(pages/*.html — 메뉴 목록은 menu-assignment.json meta.menus)와 홈(index.html)의
 * AUTOGEN 마커 사이를 정적 카드 HTML 로 다시 생성한다.
 *
 * GitHub Actions(.github/workflows/build-pages.yml)가 data/*.json push 시 자동 실행하고,
 * GitHub UI 의 "Run workflow"(workflow_dispatch)로 수동 실행도 가능하다.
 *
 * - 빌드 시점에 HTML 로 구워낸다. 클라이언트 사이드 렌더링을 도입하지 않는다.
 * - 마커 바깥(canonical, 광고코드, 헤더/푸터 등)은 절대 건드리지 않는다.
 * - Node.js 표준 라이브러리만 사용.
 *
 * 마커:
 *   pages/*.html : <!-- AUTOGEN:POLICY_CARDS:START --> ... <!-- AUTOGEN:POLICY_CARDS:END -->
 *                  <!-- AUTOGEN:GUIDE_CARDS:START --> ... <!-- AUTOGEN:GUIDE_CARDS:END -->
 *   index.html   : <!-- AUTOGEN:HOME_CARDS:START --> ... <!-- AUTOGEN:HOME_CARDS:END -->
 *                  <!-- AUTOGEN:SEASONAL:START --> ... <!-- AUTOGEN:SEASONAL:END -->
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PAGES_DIR = path.join(ROOT, 'pages');

/* 정책·글 → 메뉴 배정은 data/menu-assignment.json 이 유일한 기준이다(policies.json 의 category 는 쓰지 않음).
   메뉴 페이지 파일명은 그 파일 meta.menus 의 slug + '.html'. kind="policy" 메뉴만 카드를 생성하고,
   kind="tool"(계산기·소상공인)은 도구 전용 탭이라 아래 TOOL_TAB_ALLOW 가드만 적용한다. */
const MENU_ASSIGNMENT_FILE = 'menu-assignment.json';

/* 메뉴 페이지 가이드(글) 카드 중 항상 보이는 개수. 나머지는 <details> "더 보기" 로 접힌다. */
const GUIDE_VISIBLE_COUNT = 3;

/* 참고용 기대 카드 수 (2026-10 메뉴 개편 기준). 실제 검증은 "렌더된 수 === 배정 항목 수" 로 하고,
   이 값과 어긋나면 에러가 아니라 경고만 낸다 — 정책 추가 시 빌드가 막히면 안 되기 때문. */
const EXPECTED_COUNTS = {
  '주거·금융': 24,
  '일자리·소득': 46,
  '육아·교육': 51,
  '생활·의료': 43,
  '노후·연금': 20,
  '장애·보훈·다문화': 61,
};

/* 도구 전용 탭 가드 — 이 페이지들의 본문(모바일 메뉴 끝 ~ footer 앞)에 허용 목록 밖 링크가 있으면 빌드 실패.
   소상공인은 data/resources.json 의 url/fileUrl(자료실 카드, 브라우저에서 렌더)도 같은 목록으로 검사한다.
   도구를 추가할 때 링크 형태가 다르면 여기 한 곳만 고친다. */
const TOOL_TAB_ALLOW = {
  'calculators.html': [/^calc-[a-z0-9-]+$/],
  'small-business.html': [
    /^tools\/[a-z0-9-]+\/$/,          // pages/tools/* 도구
    /^\.\.\/#diagnosis$/,             // 사장님 자가진단 진입(홈 자가진단)
    /^\.\.\/downloads\/[^/]+$/,       // 자료실 내려받기 파일
    /^https:\/\/disqus\.com\//,       // 자료실 댓글(Disqus) noscript 안내
  ],
};

/* A등급(index,follow) → C등급(noindex) 강등 허용 목록(서비스ID).
   policy-notes.json 에서 키가 빠지거나 이름이 바뀌어 A등급 페이지가 조용히 C등급이 되는 사고를 막는다.
   의도적으로 강등할 때만 여기에 ID 를 적는다. 강등이 끝나면 다음 빌드가 비우라고 알려준다
   (이미 C등급인 ID 가 남아 있으면 빌드 실패). */
const ALLOWED_DEMOTIONS = [];

/* ── 유틸 ────────────────────────────────────────────────── */

function fail(msg) {
  console.error('\n[build-pages] 오류: ' + msg + '\n');
  process.exit(1);
}

/* &, <, >, " 이스케이프. 텍스트·속성값 모두에 사용. (지시 A) */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readJson(name) {
  const file = path.join(DATA_DIR, name);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    fail('데이터 파일을 읽을 수 없습니다: ' + file + ' (' + e.message + ')');
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(name + ' 파싱 실패 (JSON 문법 오류): ' + e.message);
  }
}

/* 원본 파일의 개행 문자를 유지한다. */
function detectEol(text) {
  return /\r\n/.test(text) ? '\r\n' : '\n';
}

/* 마커 사이를 newInner 로 교체. 마커가 없으면 null 반환(호출부에서 skip 처리). */
function replaceBetweenMarkers(html, markerName, newInner) {
  const startTag = '<!-- AUTOGEN:' + markerName + ':START';
  const endTag = '<!-- AUTOGEN:' + markerName + ':END -->';

  const startIdx = html.indexOf(startTag);
  const endIdx = html.indexOf(endTag);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;

  // START 주석의 끝(--> 이후)부터 END 주석 시작 전까지를 교체
  const startClose = html.indexOf('-->', startIdx);
  if (startClose === -1 || startClose > endIdx) return null;

  // END 마커 줄의 기존 들여쓰기를 보존
  const lineStart = html.lastIndexOf('\n', endIdx) + 1;
  const endIndent = html.slice(lineStart, endIdx);

  const before = html.slice(0, startClose + 3);
  const after = html.slice(endIdx);
  return before + '\n' + newInner + '\n' + endIndent + after;
}

/* lastUpdated 내림차순, 동률/누락은 원본 인덱스 유지, 누락·null 은 맨 뒤 (지시 1) */
function sortByLastUpdatedDesc(items, getKey) {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ka = getKey(a.item);
      const kb = getKey(b.item);
      const va = ka ? String(ka) : '';
      const vb = kb ? String(kb) : '';
      if (va && !vb) return -1;
      if (!va && vb) return 1;
      if (va !== vb) return va < vb ? 1 : -1; // 내림차순
      return a.i - b.i;                        // 안정 정렬 tiebreaker
    })
    .map((x) => x.item);
}

/* 신규 항목 최상단 규칙: addedAt(YYYY-MM-DD)이 있는 항목은 기준선(addedAt=null)보다 항상 위,
   그들끼리는 최신 날짜가 위, 같은 날짜면 배정 파일에 나중에 적은 것이 위(만료 없음).
   기준선 항목의 순서는 baselineOrder 에 맡긴다 — 정책은 기존 sortByLastUpdatedDesc, 글은 배정 파일 순서.
   entries: [{ item, addedAt, fileIndex }] */
function orderNewOnTop(entries, baselineOrder) {
  const fresh = entries.filter((e) => e.addedAt)
    .sort((a, b) => (a.addedAt !== b.addedAt ? (a.addedAt < b.addedAt ? 1 : -1) : b.fileIndex - a.fileIndex));
  const baseline = baselineOrder(entries.filter((e) => !e.addedAt));
  return fresh.concat(baseline);
}

/* 메뉴 하나의 정책 카드 순서. 기준선은 policies.json 순서대로 넘겨 sortByLastUpdatedDesc 를 그대로 쓴다. */
function orderMenuPolicies(entries) {
  return orderNewOnTop(entries, (base) => sortByLastUpdatedDesc(base, (e) => e.item.lastUpdated));
}

/* ── 카테고리 카드 렌더 ──────────────────────────────────── */

/* detailUrl(pages/policy-XXX, pages/article-XXX)이 있으면 내부 링크, 없으면 sourceUrl 외부 링크.
   카테고리 페이지는 pages/ 안에 있으므로 앞의 "pages/"는 떼고 상대 경로로 쓴다. .html은 붙이지 않는다.
   카드 라벨(pl-cat)은 메뉴 이름. 신규 항목에는 data-added 를 단다. */
function renderPolicyCard(p, menu, addedAt) {
  const cat = esc(menu);
  const title = esc(p.title);
  const summary = esc(p.summary);
  const tags = Array.isArray(p.tags) ? p.tags : [];
  const tagHtml = tags.map((t) => '<span class="pl-tag">' + esc(t) + '</span>').join('');
  const deadlineHtml = p.deadline
    ? '<div class="pl-deadline">신청기한 ' + esc(p.deadline) + '</div>'
    : '';

  const isInternal = !!p.detailUrl;
  const href = isInternal ? esc(p.detailUrl.replace(/^pages\//, '')) : esc(p.sourceUrl);
  const linkAttrs = isInternal ? '' : ' target="_blank" rel="noopener nofollow"';
  const linkText = isInternal ? '자세히 보기 →' : '공식 사이트에서 확인 →';

  const addedAttr = addedAt ? ' data-added="' + esc(addedAt) + '"' : '';

  return (
    '        <div class="pl-card"' + addedAttr + '>' +
    '<span class="pl-cat">' + cat + '</span>' +
    '<div class="pl-title">' + title + '</div>' +
    '<p class="pl-summary">' + summary + '</p>' +
    '<div class="pl-meta">' + tagHtml + '</div>' +
    deadlineHtml +
    '<a class="pl-link" href="' + href + '"' + linkAttrs + '>' + linkText + '</a>' +
    '</div>'
  );
}

function renderCategoryInner(menu, entries) {
  const cards = orderMenuPolicies(entries).map((e) => renderPolicyCard(e.item, menu, e.addedAt));
  // 가이드 영역과의 구분선 + 정책 소제목(전체 정책 수, 9개씩 보기와 무관)
  return (
    '      <hr class="list-divider">\n' +
    '      <h2 class="section-title list-section-title">지원 정책 모음 (' + cards.length + ')</h2>\n' +
    '      <div class="pl-count" id="pl-count">총 ' + cards.length + '건</div>\n' +
    '      <div class="pl-grid" id="pl-grid" data-category="' + esc(menu) + '">\n' +
    cards.join('\n') + '\n' +
    '      </div>'
  );
}

/* ── 메뉴 페이지 글(가이드) 카드 ───────────────────────────── */

/* pages/article-*.html 에서 카드에 쓸 제목(h1)·업데이트 날짜를 읽는다. */
function readArticleMeta(slug) {
  const html = fs.readFileSync(path.join(PAGES_DIR, slug + '.html'), 'utf8');
  const h1 = html.match(/<h1 class="article-h1">([\s\S]*?)<\/h1>/);
  const title = h1
    ? h1[1].replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    : '';
  const upd = html.match(/업데이트 <strong>(\d{4}\.\d{2}\.\d{2})<\/strong>/);
  return { title, date: upd ? upd[1] : '' };
}

/* 글 카드 순서: 신규(addedAt) 최상단, 기준선은 배정 파일에 적은 순서 그대로. */
function orderMenuArticles(entries) {
  return orderNewOnTop(entries, (base) => base.slice().sort((a, b) => a.fileIndex - b.fileIndex));
}

function renderGuideInner(entries) {
  if (!entries.length) return '';
  const cards = orderMenuArticles(entries).map((e) => {
    const meta = readArticleMeta(e.item.slug);
    if (!meta.title) fail(e.item.slug + '.html 에서 <h1 class="article-h1"> 제목을 찾지 못했습니다.');
    const addedAttr = e.addedAt ? ' data-added="' + esc(e.addedAt) + '"' : '';
    return '          <a href="' + esc(e.item.slug) + '" class="article-card"' + addedAttr + '>' +
      '<span class="art-tag tag-guide">가이드</span>' +
      '<h3 class="art-title">' + esc(meta.title) + '</h3>' +
      (meta.date ? '<p class="art-date">' + esc(meta.date) + ' 업데이트</p>' : '') +
      '</a>';
  });
  // 처음 GUIDE_VISIBLE_COUNT 개(= 맨 위 = 최신)는 항상 보이고, 나머지는 <details> 로 접는다(JS 없음).
  const visible = cards.slice(0, GUIDE_VISIBLE_COUNT);
  const folded = cards.slice(GUIDE_VISIBLE_COUNT);
  const more = folded.length
    ? '      <details class="guide-more">\n' +
      '        <summary><span class="guide-more-label-closed">가이드 ' + folded.length + '개 더 보기</span>' +
      '<span class="guide-more-label-open">접기</span></summary>\n' +
      '        <div class="articles-grid">\n' +
      folded.map((c) => '  ' + c).join('\n') + '\n' +
      '        </div>\n' +
      '      </details>\n'
    : '';
  return (
    '    <div class="inner-wrap guide-cards">\n' +
    '      <h2 class="section-title">이 분야 가이드 (' + cards.length + ')</h2>\n' +
    '      <div class="articles-grid">\n' +
    visible.join('\n') + '\n' +
    '      </div>\n' +
    more +
    '    </div>'
  );
}

/* ── 메뉴 배정 로드·검증 ─────────────────────────────────── */

/* 오늘 날짜(KST, YYYY-MM-DD). addedAt 미래 날짜 가드에 쓴다. */
function todayKst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

/* data/menu-assignment.json 을 읽어 검증하고 { menus, policyMenus, byMenu, articlesByMenu } 를 돌려준다.
   ① policies.json 의 정책 id 가 배정표에 없으면 실패(엉뚱한 메뉴 자동 배정 방지)
   ② addedAt=null 은 meta.baselineIds 에 있는 초기 항목만 허용(신규 항목 날짜 누락 방지)
   ③ addedAt 형식 오류·미래 날짜는 실패
   ④ pages/article-*.html 은 모두 배정돼 있어야 하고, 배정된 글 파일은 실제로 있어야 한다 */
function loadMenuAssignment(policies) {
  const data = readJson(MENU_ASSIGNMENT_FILE);
  const meta = data.meta || {};
  const menus = Array.isArray(meta.menus) ? meta.menus : [];
  const policyMenus = menus.filter((m) => m.kind === 'policy');
  if (!policyMenus.length) fail(MENU_ASSIGNMENT_FILE + ' meta.menus 에 kind="policy" 메뉴가 없습니다.');
  const menuNames = new Set(policyMenus.map((m) => m.name));
  const base = meta.baselineIds || {};
  const basePolicies = new Set(Array.isArray(base.policies) ? base.policies : []);
  const baseArticles = new Set(Array.isArray(base.articles) ? base.articles : []);
  const today = todayKst();
  const errors = [];

  function checkAddedAt(kind, key, addedAt, baselineSet) {
    if (addedAt === null || addedAt === undefined) {
      if (!baselineSet.has(key)) {
        errors.push(kind + ' ' + key + ': addedAt 이 비어 있는데 meta.baselineIds 에 없는 신규 항목입니다 — 추가한 날짜(YYYY-MM-DD)를 넣으세요.');
      }
      return;
    }
    if (typeof addedAt !== 'string' || !isValidDate(addedAt)) {
      errors.push(kind + ' ' + key + ': addedAt 형식 오류 "' + addedAt + '" (YYYY-MM-DD 이어야 함)');
    } else if (addedAt > today) {
      errors.push(kind + ' ' + key + ': addedAt 이 미래 날짜입니다 "' + addedAt + '" (오늘 ' + today + ')');
    }
  }

  const assigned = new Map();
  (Array.isArray(data.policies) ? data.policies : []).forEach((a, i) => {
    if (assigned.has(a.id)) errors.push('정책 ' + a.id + ': 배정표에 중복');
    if (!menuNames.has(a.menu)) errors.push('정책 ' + a.id + ': 알 수 없는 메뉴 "' + a.menu + '"');
    checkAddedAt('정책', a.id, a.addedAt, basePolicies);
    assigned.set(a.id, { menu: a.menu, addedAt: a.addedAt || null, fileIndex: i });
  });

  const missing = policies.filter((p) => !assigned.has(p.id)).map((p) => p.id + ' ' + p.title);
  if (missing.length) {
    errors.push('배정표(' + MENU_ASSIGNMENT_FILE + ')에 없는 정책 ' + missing.length + '건 — 한 줄씩 추가하세요:\n    · ' + missing.join('\n    · '));
  }
  const policyIds = new Set(policies.map((p) => p.id));
  const stale = Array.from(assigned.keys()).filter((id) => !policyIds.has(id));
  if (stale.length) {
    console.warn('[build-pages] 경고: policies.json 에 없는 배정 항목 ' + stale.length + '건 (무시됨): ' + stale.join(', '));
  }

  const articleFiles = fs.readdirSync(PAGES_DIR).filter((f) => /^article-.+\.html$/.test(f)).map((f) => f.slice(0, -5));
  const assignedArticles = new Map();
  (Array.isArray(data.articles) ? data.articles : []).forEach((a, i) => {
    if (assignedArticles.has(a.slug)) errors.push('글 ' + a.slug + ': 배정표에 중복');
    if (!menuNames.has(a.menu)) errors.push('글 ' + a.slug + ': 알 수 없는 메뉴 "' + a.menu + '"');
    if (!fs.existsSync(path.join(PAGES_DIR, a.slug + '.html'))) errors.push('글 ' + a.slug + ': pages/' + a.slug + '.html 파일이 없음');
    checkAddedAt('글', a.slug, a.addedAt, baseArticles);
    assignedArticles.set(a.slug, { item: a, menu: a.menu, addedAt: a.addedAt || null, fileIndex: i });
  });
  const unassignedArticles = articleFiles.filter((s) => !assignedArticles.has(s));
  if (unassignedArticles.length) {
    errors.push('배정표에 없는 글 ' + unassignedArticles.length + '건 — articles 에 한 줄씩 추가하세요: ' + unassignedArticles.join(', '));
  }

  if (errors.length) fail('메뉴 배정 검증 실패 (' + errors.length + '건):\n  - ' + errors.join('\n  - '));

  const byMenu = {};
  const articlesByMenu = {};
  policyMenus.forEach((m) => { byMenu[m.name] = []; articlesByMenu[m.name] = []; });
  policies.forEach((p) => {
    const a = assigned.get(p.id);
    byMenu[a.menu].push({ item: p, addedAt: a.addedAt, fileIndex: a.fileIndex });
  });
  assignedArticles.forEach((e) => { articlesByMenu[e.menu].push(e); });

  return { menus, policyMenus, byMenu, articlesByMenu };
}

/* ── 홈 카드 렌더 ────────────────────────────────────────── */

/* home-cards.json 의 카드는 자체 link(주로 gov.kr) 를 갖는 큐레이션 카드다.
   다만 그 link 가 policies.json 의 sourceUrl 과 일치하고 그 정책에 detailUrl 이 있으면
   (=카테고리 카드와 동일한 정책을 가리키는 경우) 내부 링크로 바꿔준다. 그 외엔 link 그대로. */
function renderHomeCard(c, sourceUrlToDetailUrl) {
  const style = c.tagStyle ? String(c.tagStyle) : 'new';
  const href = sourceUrlToDetailUrl[c.link] || c.link;
  return (
    '            <a href="' + esc(href) + '" class="article-card">' +
    '<span class="art-tag tag-' + esc(style) + '">' + esc(c.tag) + '</span>' +
    '<h3 class="art-title">' + esc(c.title) + '</h3>' +
    '<p class="art-date">' + esc(c.date) + ' 업데이트</p>' +
    '</a>'
  );
}

function renderHomeSection(s, sourceUrlToDetailUrl) {
  const cards = (Array.isArray(s.cards) ? s.cards : []).slice();
  const sorted = cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const va = a.c.date ? String(a.c.date) : '';
      const vb = b.c.date ? String(b.c.date) : '';
      if (va && !vb) return -1;
      if (!va && vb) return 1;
      if (va !== vb) return va < vb ? 1 : -1;
      return a.i - b.i;
    })
    .map((x) => x.c);
  return (
    '    <section class="page-section articles-section">\n' +
    '      <div class="container">\n' +
    '        <div class="section-header-row">\n' +
    '          <h2 class="section-title">' + esc(s.title) + '</h2>\n' +
    '          <a href="' + esc(s.moreLink) + '" class="view-all-link">더보기 →</a>\n' +
    '        </div>\n' +
    '        <div class="articles-grid">\n' +
    sorted.map((c) => renderHomeCard(c, sourceUrlToDetailUrl)).join('\n') + '\n' +
    '        </div>\n' +
    '      </div>\n' +
    '    </section>'
  );
}

function renderHomeCardsInner(homeData, sourceUrlToDetailUrl) {
  const sections = (Array.isArray(homeData.sections) ? homeData.sections : [])
    .filter((s) => s.visible !== false);
  const blocks = sections.map((s) => renderHomeSection(s, sourceUrlToDetailUrl)).join('\n');
  return '  <div id="home-cards">\n' + blocks + '\n  </div>';
}

function renderSeasonalInner(homeData) {
  const s = homeData.seasonal;
  if (!s || s.visible === false) {
    // visible=false → 배너 영역을 비운다 (지시 3)
    return '  <div id="seasonal-banner"></div><!-- seasonal.visible=false -->';
  }
  return (
    '  <div id="seasonal-banner"><section class="seasonal-section"><div class="container">' +
    '<div class="seasonal-dark"><div class="seasonal-content">' +
    '<span class="seasonal-tag">' + esc(s.tag) + '</span>' +
    '<h3 class="seasonal-title">' + esc(s.title) + '</h3>' +
    '<p class="seasonal-desc">' + esc(s.desc) + '</p>' +
    '</div>' +
    '<a href="' + esc(s.link) + '" class="seasonal-cta">' + esc(s.linkText) + '</a>' +
    '</div></div></section></div>'
  );
}

/* ── 파일 쓰기 (변경 없으면 skip) ───────────────────────── */

function writeIfChanged(file, nextText, report) {
  let prev = null;
  try {
    prev = fs.readFileSync(file, 'utf8');
  } catch (e) {
    fail('대상 파일을 읽을 수 없습니다: ' + file);
  }
  if (prev === nextText) {
    report.unchanged.push(path.relative(ROOT, file));
    return false;
  }
  fs.writeFileSync(file, nextText);
  report.written.push(path.relative(ROOT, file));
  return true;
}

/* ── 정책 상세 페이지 등급 검증 ─────────────────────────────── */

const SITE_URL = 'https://benefitson.org';

function loadPolicyNotes() {
  const file = path.join(DATA_DIR, 'policy-notes.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail('policy-notes.json 파싱 실패: ' + e.message);
  }
}

/* &, <, >, " 이스케이프 후 줄바꿈을 <br>로. 정책 해설 문단(policy-notes.json)을
   .policy-note 블록으로 렌더할 때 쓴다. generate-policy-pages.js 의 textToHtml 과 동일 규칙. */
function textToHtml(v) {
  if (v == null) return '';
  return esc(v).replace(/\r\n|\r|\n/g, '<br>');
}

/* A등급 정책 해설 문단 배열 → .policy-note 블록. 비어 있으면 빈 문자열(C등급). */
function renderPolicyNoteBlock(paragraphs) {
  if (!Array.isArray(paragraphs) || !paragraphs.length) return '';
  return '<div class="policy-note">' +
    paragraphs.map((p) => '<p>' + textToHtml(p) + '</p>').join('\n            ') +
    '</div>';
}

/* A등급 정책 상세 페이지의 광고 블록: 기존 애드센스(in-article) + 신규 애드핏(동적 삽입).
   애드핏은 홈(index.html)·카테고리 페이지(pages/youth.html 등)와 동일하게
   .adfit-slot 빈 div + adfit.js 스크립트 태그 방식(하드코딩 <ins> 아님). */
const ADSENSE_IN_ARTICLE_BLOCK =
  '<ins class="adsbygoogle"\n' +
  '                 style="display:block; text-align:center;"\n' +
  '                 data-ad-layout="in-article"\n' +
  '                 data-ad-format="fluid"\n' +
  '                 data-ad-client="ca-pub-4871058922328451"\n' +
  '                 data-ad-slot="2985171819"></ins>\n' +
  '            <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>';
const ADFIT_SLOT_BLOCK =
  '<div class="adfit-slot"></div>\n' +
  '            <script src="/assets/js/adfit.js?v=20260914"></script>';

function renderPolicyAdBlock() {
  return ADSENSE_IN_ARTICLE_BLOCK + '\n            ' + ADFIT_SLOT_BLOCK;
}

/* <head> 의 애드센스 라이브러리 스크립트. POLICY_AD(본문 <ins>)와 짝을 이룬다 — 이게 없으면
   본문의 <ins class="adsbygoogle"> 가 렌더되지 않는다. */
const ADSENSE_HEAD_SCRIPT =
  '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4871058922328451" crossorigin="anonymous"></script>';

/* pages/policy-*.html 164개를 순회하며 POLICY_NOTE/POLICY_AD 마커 사이를 채우고
   robots 메타를 등급에 맞게 써넣는다. "쓰기"가 끝난 뒤 validatePolicyDetailPages() /
   validateSitemapGrades() 가 그대로 결과를 검증한다.
   ★ CSV/gov24 등 저장소 밖 소스에 의존하지 않는다 — 오직 policy-notes.json 과
   이미 존재하는 HTML 파일(마커)만 본다. generate-policy-pages.js 를 실행하지 않아도 된다. */
function renderPolicyPages(report) {
  const notes = loadPolicyNotes();
  if (!fs.existsSync(PAGES_DIR)) return [];
  const files = fs.readdirSync(PAGES_DIR).filter((f) => /^policy-.+\.html$/.test(f)).sort();
  const missingNote = [];
  const missingAd = [];
  const missingAdsenseHead = [];
  const pageIds = [];

  files.forEach((f) => {
    const id = f.slice('policy-'.length, -'.html'.length);
    pageIds.push(id);
    const isA = Object.prototype.hasOwnProperty.call(notes, id);
    const file = path.join(PAGES_DIR, f);
    const raw = fs.readFileSync(file, 'utf8');
    const eol = detectEol(raw);
    let work = raw.split('\r\n').join('\n');

    const noteInner = isA ? renderPolicyNoteBlock(notes[id]) : '';
    const afterNote = replaceBetweenMarkers(work, 'POLICY_NOTE', noteInner ? '          ' + noteInner : '');
    if (afterNote === null) { missingNote.push(f); return; }
    work = afterNote;

    const adInner = isA ? renderPolicyAdBlock() : '';
    const afterAd = replaceBetweenMarkers(work, 'POLICY_AD', adInner ? '            ' + adInner : '');
    if (afterAd === null) { missingAd.push(f); return; }
    work = afterAd;

    // <head> 의 애드센스 라이브러리 스크립트(adsbygoogle.js)도 등급에 따라 있어야/없어야 한다.
    // POLICY_AD 마커(본문 광고 단위)만 채우고 이 태그를 빼먹으면, 본문의 <ins class="adsbygoogle">
    // 가 라이브러리 없이 렌더돼 광고가 실제로는 뜨지 않는다.
    const adsenseHeadInner = isA ? ADSENSE_HEAD_SCRIPT : '';
    const afterAdsenseHead = replaceBetweenMarkers(work, 'POLICY_ADSENSE_HEAD', adsenseHeadInner ? '  ' + adsenseHeadInner : '');
    if (afterAdsenseHead === null) { missingAdsenseHead.push(f); return; }
    work = afterAdsenseHead;

    const robotsContent = isA ? 'index,follow' : 'noindex,follow';
    work = work.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="' + robotsContent + '">');

    const nextText = eol === '\r\n' ? work.split('\n').join('\r\n') : work;
    writeIfChanged(file, nextText, report);
  });

  if (missingNote.length || missingAd.length || missingAdsenseHead.length) {
    const parts = [];
    if (missingNote.length) parts.push('POLICY_NOTE 마커 없음 (' + missingNote.length + '건):\n  - ' + missingNote.join('\n  - '));
    if (missingAd.length) parts.push('POLICY_AD 마커 없음 (' + missingAd.length + '건):\n  - ' + missingAd.join('\n  - '));
    if (missingAdsenseHead.length) parts.push('POLICY_ADSENSE_HEAD 마커 없음 (' + missingAdsenseHead.length + '건):\n  - ' + missingAdsenseHead.join('\n  - '));
    fail(parts.join('\n'));
  }

  return pageIds;
}

/* 등급 가드 — renderPolicyPages() 가 쓰기 전에 실행한다.
   (1) 지금 robots 가 index,follow 인 페이지가 이번 빌드에서 C등급이 되면 위반(ALLOWED_DEMOTIONS 제외).
   (2) policy-notes.json 의 키마다 pages/policy-{키}.html 이 실제로 있어야 한다(오타 키 방지). */
function checkPolicyGradeGuard(report) {
  const notes = loadPolicyNotes();
  const violations = [];
  const files = fs.existsSync(PAGES_DIR)
    ? fs.readdirSync(PAGES_DIR).filter((f) => /^policy-.+\.html$/.test(f))
    : [];
  const pageIdSet = new Set(files.map((f) => f.slice('policy-'.length, -'.html'.length)));

  const demoted = [];
  files.forEach((f) => {
    const id = f.slice('policy-'.length, -'.html'.length);
    const raw = fs.readFileSync(path.join(PAGES_DIR, f), 'utf8');
    const m = raw.match(/<meta name="robots" content="([^"]*)">/);
    if (!m || m[1] !== 'index,follow') return;
    if (Object.prototype.hasOwnProperty.call(notes, id)) return;
    demoted.push(id);
    if (ALLOWED_DEMOTIONS.indexOf(id) === -1) {
      violations.push({ id, reason: id + ' 강등 — 현재 A등급(index,follow)인데 policy-notes.json 에 키가 없음. ' +
        '의도한 강등이면 ALLOWED_DEMOTIONS 에 추가' });
    }
  });

  const unusedAllowed = ALLOWED_DEMOTIONS.filter((id) => demoted.indexOf(id) === -1);
  if (unusedAllowed.length) {
    violations.push({ id: null, reason: 'ALLOWED_DEMOTIONS에 쓰이지 않는 ID가 남아 있습니다: ' + unusedAllowed.join(', ') +
      ' (이미 C등급이거나 policy-notes.json 에 키가 있음 — 목록에서 지우세요)' });
  }

  Object.keys(notes).forEach((id) => {
    if (!pageIdSet.has(id)) {
      violations.push({ id, reason: id + ' 키 무효 — pages/policy-' + id + '.html 이 없음 (키 오타?)' });
    }
  });

  console.log('\n[build-pages] 등급 가드 ④');
  console.log('  A등급 ' + Object.keys(notes).length + '건, 강등 ' + demoted.length + '건');
  report.gradeGuard = { aCount: Object.keys(notes).length, demoted, violated: violations.length };
  return violations;
}

/* sitemap.xml 의 policy- URL 을 A등급(policy-notes.json 에 해설이 있는 서비스ID)만 남도록 동기화.
   이미 등록돼 있던 항목은 원래 줄(= lastmod 포함)을 그대로 유지하고, 새로 A등급이 된 것만
   오늘 날짜로 추가한다 — 한 건 승격할 때마다 무관한 기존 항목들의 lastmod 가 같이 바뀌는
   잡음을 막기 위함(구 generate-policy-pages.js 의 syncSitemapPolicyEntries 는 매번 전체를 오늘 날짜로 재작성했다). */
function renderSitemapPolicyEntries(pageIds, report) {
  const sitemapFile = path.join(ROOT, 'sitemap.xml');
  if (!fs.existsSync(sitemapFile)) return;
  const notes = loadPolicyNotes();
  const raw = fs.readFileSync(sitemapFile, 'utf8');
  const eol = detectEol(raw);
  const work = raw.split('\r\n').join('\n');

  const urlLineRe = /  <url><loc>https:\/\/benefitson\.org\/pages\/policy-([^<]+)<\/loc>[^\n]*<\/url>\n/g;
  const existing = [];
  let m;
  while ((m = urlLineRe.exec(work)) !== null) {
    existing.push({ id: m[1], line: m[0] });
  }

  const aIdSet = new Set(pageIds.filter((id) => Object.prototype.hasOwnProperty.call(notes, id)));
  const keptIds = new Set();
  const keptLines = existing.filter((e) => aIdSet.has(e.id)).map((e) => { keptIds.add(e.id); return e.line; });

  const today = new Date().toISOString().slice(0, 10);
  const newLines = pageIds
    .filter((id) => aIdSet.has(id) && !keptIds.has(id))
    .map((id) => '  <url><loc>' + SITE_URL + '/pages/policy-' + id + '</loc><lastmod>' + today +
      '</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n');

  const allLines = keptLines.concat(newLines).join('');
  const stripped = work.replace(/  <url><loc>https:\/\/benefitson\.org\/pages\/policy-[^<]+<\/loc>[^\n]*<\/url>\n/g, '');
  const next = stripped.replace('</urlset>', allLines + '</urlset>');
  const nextText = eol === '\r\n' ? next.split('\n').join('\r\n') : next;
  writeIfChanged(sitemapFile, nextText, report);
}

const ADSENSE_PATTERN = /adsbygoogle|google-adsense-account|pagead2\.googlesyndication\.com/;
const ADFIT_PATTERN = /kakao_ad_area|ba\.min\.js|DAN-|adfit-slot|adfit\.js/;

function validatePolicyDetailPages() {
  const notes = loadPolicyNotes();
  if (!fs.existsSync(PAGES_DIR)) return;
  const files = fs.readdirSync(PAGES_DIR).filter((f) => /^policy-.+\.html$/.test(f));
  const badAds = [];
  const badIndex = [];
  const badAdfit = [];
  files.forEach((f) => {
    const id = f.slice('policy-'.length, -'.html'.length);
    const isA = Object.prototype.hasOwnProperty.call(notes, id);
    const html = fs.readFileSync(path.join(PAGES_DIR, f), 'utf8');
    if (!isA && ADSENSE_PATTERN.test(html)) badAds.push(f);
    if (!isA && !/<meta name="robots" content="noindex/.test(html)) badIndex.push(f);
    if (!isA && ADFIT_PATTERN.test(html)) badAdfit.push(f);
  });
  if (badAds.length) {
    fail('A등급이 아닌 정책 상세 페이지에 애드센스 블록/스크립트가 있습니다 (' + badAds.length + '건):\n  - ' +
      badAds.join('\n  - '));
  }
  if (badIndex.length) {
    fail('A등급이 아닌 정책 상세 페이지에 noindex 메타가 없습니다 (' + badIndex.length + '건):\n  - ' +
      badIndex.join('\n  - '));
  }
  if (badAdfit.length) {
    fail('A등급이 아닌 정책 상세 페이지에 애드핏(kakao_ad_area/ba.min.js/DAN-) 이 있습니다 (' + badAdfit.length + '건):\n  - ' +
      badAdfit.join('\n  - '));
  }
}

function validateSitemapGrades() {
  const sitemapFile = path.join(ROOT, 'sitemap.xml');
  if (!fs.existsSync(sitemapFile)) return;
  const notes = loadPolicyNotes();
  const xml = fs.readFileSync(sitemapFile, 'utf8');
  const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
  const bad = [];
  locs.forEach((loc) => {
    const m = loc.match(/\/pages\/policy-(.+)$/);
    if (!m) return;
    const id = m[1];
    if (!Object.prototype.hasOwnProperty.call(notes, id)) bad.push(loc);
  });
  if (bad.length) {
    fail('sitemap.xml 에 A등급이 아닌 정책 상세 페이지가 등록되어 있습니다 (' + bad.length + '건):\n  - ' +
      bad.join('\n  - '));
  }
}

/* detailUrl 이 있는 정책의 pl-card 가 실제로 내부 링크를 걸었는지 검증.
   카테고리 페이지 파일을 디스크에서 다시 읽어(re-read) 확인한다 — 코드 경로 재사용이 아니라
   최종 산출물을 독립적으로 다시 검사한다. */
function validateCategoryCardLinks(policyMenus, byMenu) {
  let totalInternal = 0;
  let totalExternal = 0;
  const badExternalForDetail = [];
  const badInternalTarget = [];
  const badExternalNofollow = [];
  const missingInternalFiles = [];

  policyMenus.forEach((m) => {
    const pageFile = m.slug + '.html';
    const file = path.join(PAGES_DIR, pageFile);
    if (!fs.existsSync(file)) return;
    const html = fs.readFileSync(file, 'utf8');
    const sorted = orderMenuPolicies(byMenu[m.name]).map((e) => e.item);
    const tags = Array.from(html.matchAll(/<a class="pl-link"([^>]*)>/g)).map((x) => x[1]);

    if (tags.length !== sorted.length) {
      fail(pageFile + ' 의 pl-link 개수(' + tags.length + ')가 정책 수(' +
        sorted.length + ')와 다릅니다.');
    }

    sorted.forEach((p, i) => {
      const attrs = tags[i] || '';
      const hrefM = attrs.match(/href="([^"]*)"/);
      const href = hrefM ? hrefM[1] : '';
      const isInternal = href !== '' && !/^https?:\/\//.test(href);

      if (isInternal) {
        totalInternal++;
        if (!p.detailUrl) badExternalForDetail.push(p.title + ' (detailUrl 없는데 내부 링크)');
        if (/target="_blank"/.test(attrs)) badInternalTarget.push(p.title);
        const detailFile = path.join(PAGES_DIR, href + '.html');
        if (!fs.existsSync(detailFile)) missingInternalFiles.push(p.title + ' → ' + href + '.html');
      } else {
        totalExternal++;
        if (p.detailUrl) badExternalForDetail.push(p.title + ' (detailUrl 있는데 외부 링크)');
        const relM = attrs.match(/rel="([^"]*)"/);
        const rel = relM ? relM[1] : '';
        if (!/nofollow/.test(rel)) badExternalNofollow.push(p.title);
      }
    });
  });

  if (badExternalForDetail.length) {
    fail('detailUrl 유무와 카드 링크 종류가 어긋나는 정책 ' + badExternalForDetail.length + '건:\n  - ' +
      badExternalForDetail.join('\n  - '));
  }
  if (missingInternalFiles.length) {
    fail('카테고리 카드 내부 링크가 가리키는 파일이 없습니다 (' + missingInternalFiles.length + '건):\n  - ' +
      missingInternalFiles.join('\n  - '));
  }
  if (badInternalTarget.length) {
    fail('내부 링크 카드에 target="_blank" 가 있습니다 (' + badInternalTarget.length + '건):\n  - ' +
      badInternalTarget.join('\n  - '));
  }
  if (badExternalNofollow.length) {
    fail('외부 링크 카드에 rel="nofollow" 가 없습니다 (' + badExternalNofollow.length + '건):\n  - ' +
      badExternalNofollow.join('\n  - '));
  }
  if (totalInternal !== 186) {
    fail('메뉴 페이지 6개 합계 내부 링크 수가 186이 아닙니다: ' + totalInternal);
  }
  if (totalExternal !== 59) {
    fail('메뉴 페이지 6개 합계 외부 링크 수가 59가 아닙니다: ' + totalExternal);
  }

  console.log('[build-pages] 카드 링크 검증 통과: 내부 ' + totalInternal + ' · 외부 ' + totalExternal);
}

/* 도구 전용 탭 가드 — TOOL_TAB_ALLOW 의 페이지 본문(모바일 메뉴 </nav> 이후 ~ <footer 앞)의 모든 href 와
   (소상공인) data/resources.json 의 url/fileUrl 이 허용 목록에 맞는지 본다. 위반이 있으면 빌드 실패. */
function validateToolTabs() {
  const violations = [];
  Object.keys(TOOL_TAB_ALLOW).forEach((pageFile) => {
    const allow = TOOL_TAB_ALLOW[pageFile];
    const ok = (href) => allow.some((re) => re.test(href));
    const file = path.join(PAGES_DIR, pageFile);
    if (!fs.existsSync(file)) { violations.push(pageFile + ': 파일 없음'); return; }
    const html = fs.readFileSync(file, 'utf8');
    const navEnd = html.indexOf('</nav>', html.indexOf('<nav class="mobile-menu"'));
    const footerStart = html.indexOf('<footer');
    if (navEnd === -1 || footerStart === -1) { violations.push(pageFile + ': 본문 범위(mobile-menu ~ footer)를 찾지 못함'); return; }
    const body = html.slice(navEnd, footerStart);
    Array.from(body.matchAll(/href="([^"]*)"/g)).forEach((x) => {
      if (!ok(x[1])) violations.push(pageFile + ' 본문 링크: ' + x[1]);
    });
    if (pageFile === 'small-business.html') {
      const res = readJson('resources.json');
      (Array.isArray(res.resources) ? res.resources : []).forEach((r) => {
        ['url', 'fileUrl'].forEach((k) => {
          if (r[k] && !ok(r[k])) violations.push('data/resources.json (' + (r.id || r.title) + ') ' + k + ': ' + r[k]);
        });
      });
    }
  });
  if (violations.length) {
    fail('도구 전용 탭(계산기·소상공인)에 허용되지 않은 링크가 있습니다 (' + violations.length + '건) — ' +
      '정책·일반 글은 넣지 않습니다. 새 도구라면 TOOL_TAB_ALLOW 를 고치세요:\n  - ' + violations.join('\n  - '));
  }
  console.log('[build-pages] 도구 전용 탭 가드 통과 (' + Object.keys(TOOL_TAB_ALLOW).join(', ') + ')');
}

/* pages/tools/delivery-fee-calc/script.js 의 PLATFORM_RATES 와
   pages/tools/profit-drop-diagnosis/engine/fee-calc.js 의 DELIVERY_RATES 는
   같은 배달앱 수수료율을 각자 들고 있다(둘 다 <script src> 로만 로드되는 무빌드 도구라 import 공유 불가).
   한쪽만 고쳤을 때 드리프트가 생기지 않도록, 두 파일에서 배민/쿠팡이츠/요기요의
   brokerage·payment 값을 파싱해 비교한다. */
function parseDeliveryRateBlock(text, blockRegex) {
  const m = text.match(blockRegex);
  if (!m) return null;
  const block = m[0];
  const out = {};
  const entryRe = /(\w+):\s*\{[^}]*?brokerage:\s*([\d.]+)[^}]*?payment:\s*([\d.]+)[^}]*?\}/g;
  let em;
  while ((em = entryRe.exec(block))) {
    out[em[1]] = { brokerage: Number(em[2]), payment: Number(em[3]) };
  }
  return out;
}

function validateDeliveryFeeRatesMatch() {
  const scriptFile = path.join(PAGES_DIR, 'tools', 'delivery-fee-calc', 'script.js');
  const feeCalcFile = path.join(PAGES_DIR, 'tools', 'profit-drop-diagnosis', 'engine', 'fee-calc.js');
  if (!fs.existsSync(scriptFile) || !fs.existsSync(feeCalcFile)) return;

  const scriptRates = parseDeliveryRateBlock(fs.readFileSync(scriptFile, 'utf8'), /const PLATFORM_RATES = \{[\s\S]*?\n\};/);
  const feeCalcRates = parseDeliveryRateBlock(fs.readFileSync(feeCalcFile, 'utf8'), /export const DELIVERY_RATES = \{[\s\S]*?\n\};/);

  if (!scriptRates || !feeCalcRates) {
    fail('배달 수수료율 드리프트 가드: PLATFORM_RATES 또는 DELIVERY_RATES 를 파싱하지 못했습니다. 두 파일의 상수 선언 형태가 바뀌었는지 확인하세요.');
  }

  const diffs = [];
  ['baemin', 'coupangeats', 'yogiyo'].forEach((key) => {
    const a = scriptRates[key];
    const b = feeCalcRates[key];
    if (!a || !b) { diffs.push(key + ': 한쪽 파일에만 존재합니다.'); return; }
    if (a.brokerage !== b.brokerage || a.payment !== b.payment) {
      diffs.push(key + ': delivery-fee-calc(중개 ' + a.brokerage + '% · 결제 ' + a.payment +
        '%) vs profit-drop-diagnosis(중개 ' + b.brokerage + '% · 결제 ' + b.payment + '%)');
    }
  });

  if (diffs.length) {
    fail('pages/tools/delivery-fee-calc/script.js 의 PLATFORM_RATES 와 ' +
      'pages/tools/profit-drop-diagnosis/engine/fee-calc.js 의 DELIVERY_RATES 가 다릅니다 (' + diffs.length + '건):\n  - ' +
      diffs.join('\n  - '));
  }

  console.log('[build-pages] 배달 수수료율 드리프트 가드 통과 (배민/쿠팡이츠/요기요)');
}

/* ── policy-deps 린트 (경고 전용 — 파일을 쓰지 않는 읽기 전용 검사) ──────
   pages/*.html 안의 <!-- policy-deps: alias:dot.path, ... --> 주석이 선언한 정책 값이
   실제로 그 페이지 본문 어딘가에 사람이 읽을 수 있는 표기로 남아있는지 검사한다.
   본문을 치환하지 않으므로(=값을 하나로 정하지 않으므로) "마커 바깥은 건드리지 않는다"
   불변식과 충돌하지 않는다. fs.writeFileSync/writeIfChanged를 호출하지 않는다 — 어떤
   파일도 이 함수로 인해 바뀌지 않는다. 위반이 있어도 fail()을 부르지 않고 console.warn만
   한다(하드 실패 전환은 이 경고 결과를 검토한 뒤 별도로 결정).
   ★ 정책 JSON이 여러 개(constants/income-tax/youth-deposit/retirement-pay/parental-leave)라 별칭
     접두사로 어느 파일인지 명시한다. income-tax-policy.json과
     retirement-pay-net-calculator-policy.json은 둘 다 최상위 키 "localIncomeTax"를
     쓰고, youth-deposit-policy.json과 retirement-pay 정책은 둘 다 "eligibility"를
     쓴다 — 파일 순서대로 탐색하는 방식이었다면 이런 이름 충돌에서 엉뚱한 파일의 값을
     조용히 골랐을 수 있어 접두사 방식을 택했다. */
const POLICY_FILE_ALIASES = {
  'constants': 'constants.json',
  'income-tax': 'income-tax-policy.json',
  'youth-deposit': 'youth-deposit-policy.json',
  'retirement-pay': 'retirement-pay-net-calculator-policy.json',
  'parental-leave': 'parental-leave-policy.json',
};

function getDeep(obj, dotPath) {
  if (!dotPath) return undefined;
  return dotPath.split('.').reduce((acc, key) => (acc != null && acc[key] !== undefined ? acc[key] : undefined), obj);
}

/* 통화성 숫자의 허용 표기 후보. 콤마 표기나 "만" 표기가 실제로 붙은 것만 반환한다 —
   맨 숫자(raw)와 동일한 문자열은 오탐 방지를 위해 절대 포함하지 않는다.
   정수가 아니면(예: 세율 0.0475) 통화 표기 자체가 의미 없으므로 후보를 내지 않는다 —
   toLocaleString이 소수점을 반올림한 값("0.048" 등)이 우연히 다른 문맥과 매칭되는
   오탐을 막기 위함. 그런 값은 percentCandidates 쪽에서만 판단한다. */
function currencyCandidates(num) {
  if (!Number.isInteger(num)) return [];
  const candidates = [];
  const raw = String(num);
  const comma = num.toLocaleString('ko-KR');
  if (comma !== raw) candidates.push(comma);
  if (num >= 100000000) {
    // 억 단위. "만" 자리 나머지만 다룬다 — 현재 정책 데이터에 억 단위 값 중
    // 만 단위 미만 자투리(원)가 있는 값이 없어, 그 경우는 다루지 않는다.
    const eok = Math.floor(num / 100000000);
    const manRest = Math.floor((num % 100000000) / 10000);
    const eokStr = eok.toLocaleString('ko-KR') + '억';
    if (manRest === 0) {
      candidates.push(eokStr, eokStr + '원');
    } else {
      const manStr = manRest.toLocaleString('ko-KR') + '만';
      candidates.push(eokStr + ' ' + manStr, eokStr + manStr);
    }
  } else if (num >= 10000) {
    const man = Math.floor(num / 10000);
    const rest = num % 10000;
    const manStr = man.toLocaleString('ko-KR') + '만';
    if (rest === 0) {
      candidates.push(manStr, manStr + '원');
    } else {
      const restStr = rest.toLocaleString('ko-KR');
      candidates.push(manStr + ' ' + restStr, manStr + restStr);
    }
  }
  return candidates;
}

/* 비율의 허용 표기 후보. % 기호가 붙은 것만 반환한다 — 맨 숫자 단독 매칭은 절대
   인정하지 않는다. 값이 이미 정수 비율(예: 32)인 경우와, 0~1 사이 소수 비율(예:
   0.0475)인 경우 둘 다 대응하기 위해 두 표기를 모두 후보로 낸다. */
function percentCandidates(num) {
  const candidates = [num + '%'];
  const scaled = Number((num * 100).toPrecision(12));
  if (scaled !== num) candidates.push(scaled + '%');
  return candidates;
}

/* 값 하나의 "허용 표기 후보" 전체를 생성한다. 문자열 값(예: "2.1%")은 이미 사람이
   포맷해 둔 것이므로 그대로 유일한 후보로 쓴다. */
function generateCandidates(value) {
  if (typeof value === 'string') return [value];
  if (typeof value !== 'number' || !isFinite(value)) return [];
  return Array.from(new Set([...currencyCandidates(value), ...percentCandidates(value)]));
}

/* 예기치 못하게 배포가 막히면 이 한 줄만 false로 바꿔 즉시 경고 모드로 되돌릴 수 있다.
   ①(policy-deps 선언 키 존재)·②(파생값 불변식) 검사에만 적용된다 — ③(head 드리프트 스캔)은
   아직 휴리스틱이 검증되지 않아 이 스위치와 무관하게 항상 경고만 낸다. */
const LINT_HARD_FAIL = true;

/* pages/*.html 안의 <!-- policy-deps: alias:dot.path, ... --> 주석이 선언한 정책 값이
   실제로 그 페이지 본문 어딘가에 사람이 읽을 수 있는 표기로 남아있는지 검사한다(①).
   본문을 치환하지 않으므로(=값을 하나로 정하지 않으므로) "마커 바깥은 건드리지 않는다"
   불변식과 충돌하지 않는다. fs.writeFileSync/writeIfChanged를 호출하지 않는다 — 어떤
   파일도 이 함수로 인해 바뀌지 않는다. 위반 목록만 반환하고, fail() 호출 여부는
   main()이 ②(불변식) 위반과 합쳐서 한 번에 결정한다(0단계 (가) 참고). */
function lintPolicyDeps(report) {
  if (!fs.existsSync(PAGES_DIR)) return [];
  const files = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html')).sort();
  const policyCache = {};
  function loadPolicyFile(alias) {
    if (Object.prototype.hasOwnProperty.call(policyCache, alias)) return policyCache[alias];
    const filename = POLICY_FILE_ALIASES[alias];
    if (!filename) { policyCache[alias] = null; return null; }
    try {
      policyCache[alias] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
    } catch (e) {
      policyCache[alias] = null;
    }
    return policyCache[alias];
  }

  const passes = [];
  const violations = [];

  files.forEach((f) => {
    const raw = fs.readFileSync(path.join(PAGES_DIR, f), 'utf8'); // 읽기만 함 — 여기서 절대 쓰지 않는다
    const m = raw.match(/<!--\s*policy-deps:\s*(.+?)\s*-->/);
    if (!m) return;
    // data-lint-exclude 가 붙은 요소(예: 미확정 개편안 박스) 안의 숫자로는 통과시키지 않는다.
    // 같은 태그가 안에 중첩되지 않는 요소에만 쓴다(첫 닫는 태그까지를 요소로 본다).
    const html = raw.replace(/<(\w+)\b[^>]*\bdata-lint-exclude\b[^>]*>[\s\S]*?<\/\1>/g, '');

    m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((keyExpr) => {
      const sep = keyExpr.indexOf(':');
      if (sep === -1) {
        violations.push({ file: f, key: keyExpr, reason: '별칭:경로 형식이 아님(예: constants:foo.bar)' });
        return;
      }
      const alias = keyExpr.slice(0, sep);
      const dotPath = keyExpr.slice(sep + 1);
      const policyData = loadPolicyFile(alias);
      if (!policyData) {
        violations.push({ file: f, key: keyExpr, reason: '알 수 없는 정책 파일 별칭: ' + alias });
        return;
      }
      const value = getDeep(policyData, dotPath);
      if (value === undefined) {
        violations.push({ file: f, key: keyExpr, reason: '정책 JSON에 해당 경로 없음' });
        return;
      }
      const candidates = generateCandidates(value);
      const matched = candidates.find((c) => html.includes(c));
      if (matched) {
        passes.push({ file: f, key: keyExpr, value, matched });
      } else {
        violations.push({ file: f, key: keyExpr, value, candidates, reason: '본문에서 허용 표기 후보를 찾지 못함' });
      }
    });
  });

  console.log('\n[build-pages] policy-deps 린트 ①(선언 키 존재)');
  console.log('  선언 ' + (passes.length + violations.length) + '건 — 통과 ' + passes.length + ' / 위반 ' + violations.length);
  report.policyDepsLint = { passed: passes.length, violated: violations.length, passes, violations };
  return violations;
}

/* 파생값 불변식 검사(②). 정책 JSON(constants.json 등) 최상위 "invariants" 배열에
   { key, fromKey, multiplier } 형태로 선언된 관계가 실제 데이터에서 성립하는지 확인한다.
   표현식 파서를 두지 않고 선언형(곱셈 하나)만 지원한다 — 2단계 곱셈(예: ×0.8×8)도
   승수를 미리 곱해(6.4) 하나의 multiplier로 표현할 수 있으면 그렇게 쓴다.
   페이지가 아니라 정책 JSON 자체를 보므로, policy-deps 선언 여부와 무관하게 항상 실행된다.
   이진 부동소수점 오차(예: 10320 * 6.4)를 피하기 위해 Math.round로 비교한다. */
/* 현재까지 확인된 invariants 총 개수(2026-09 기준 16건 — constants 15 + parental-leave 1).
   이 상수 자체를 늘리는 것은 invariants를 새로 등록했을 때만이고, 검사 목적은 이 값
   "밑으로" 떨어지는 것을 잡는 것이다. */
const MIN_INVARIANT_COUNT = 16;

function checkPolicyInvariants(report) {
  const violations = [];
  let checkedCount = 0;

  Object.keys(POLICY_FILE_ALIASES).forEach((alias) => {
    const filename = POLICY_FILE_ALIASES[alias];
    const file = path.join(DATA_DIR, filename);
    if (!fs.existsSync(file)) return;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return; // readJson()이 policies/home-cards 등 필수 파일의 파싱 실패는 이미 별도로 fail() 처리한다
    }
    const invariants = Array.isArray(data.invariants) ? data.invariants : [];
    invariants.forEach((inv) => {
      checkedCount++;
      const fromVal = getDeep(data, inv.fromKey);
      const actualVal = getDeep(data, inv.key);
      if (typeof fromVal !== 'number' || typeof actualVal !== 'number') {
        violations.push({ file: filename, key: inv.key, fromKey: inv.fromKey, reason: '값을 숫자로 찾을 수 없음' });
        return;
      }
      const expected = fromVal * inv.multiplier;
      if (Math.round(expected) !== Math.round(actualVal)) {
        violations.push({
          file: filename, key: inv.key, fromKey: inv.fromKey, multiplier: inv.multiplier,
          expected, actual: actualVal,
          reason: inv.fromKey + ' × ' + inv.multiplier + ' = ' + expected + ' 와 불일치',
        });
      }
    });
  });

  // invariants 선언 자체가 통째로 비어버리면(예: 편집 중 배열이 날아감) 검사 ②가
  // "검사할 게 없어 조용히 통과"하는 사고를 막는다 — 파일별로 있어야 할 개수를 강제하면
  // 파생 관계가 아예 없는 income-tax-policy.json 등에도 억지로 항목을 만들게 되므로,
  // 대신 전체 합계가 현재까지 확인된 최솟값(MIN_INVARIANT_COUNT) 밑으로 떨어지면 그 자체를 위반으로 취급한다.
  if (checkedCount < MIN_INVARIANT_COUNT) {
    violations.push({
      file: '(전체 정책 JSON)', key: '(invariants 총 개수)',
      reason: 'invariants 선언이 ' + checkedCount + '건 — 최소 ' + MIN_INVARIANT_COUNT + '건이어야 함 (배열이 비었거나 일부가 소실되었을 수 있음)',
    });
  }

  console.log('\n[build-pages] 파생값 불변식 검사 ②');
  console.log('  불변식 ' + checkedCount + '건 검사, ' + (violations.length === 0 ? '전부 통과' : '위반 ' + violations.length + '건'));
  report.invariantCheck = { checked: checkedCount, violated: violations.length, violations };
  return violations;
}

/* <head> 드리프트 스캔(③, 경고 전용 — 하드 실패로 만들지 않는다).
   policy-deps를 선언한 페이지의 <head> 블록(meta description/og/twitter/JSON-LD 포함)만 떼어내
   단위가 붙은 숫자(예: "349,700원", "247만원", "2.1%")를 추출하고, 그 페이지가 선언한 키들의
   현재 값의 허용 표기 후보 중 어느 것과도 일치하지 않으면 경고로 기록한다.
   "적어도 하나는 최신"만 보증하는 ①의 사각지대(meta/h1 등 head 안의 중복 리터럴이 갱신을
   놓쳐도 ①은 통과함)를 드러내기 위한 것으로, 아직 휴리스틱이 검증되지 않아 경고만 낸다. */
const HEAD_NUM_UNIT_RE = /\d{1,3}(?:,\d{3})*만원|\d{1,3}(?:,\d{3})+원|\d+(?:\.\d+)?%/g;

function scanHeadDrift(report) {
  if (!fs.existsSync(PAGES_DIR)) return [];
  const files = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html')).sort();
  const warnings = [];

  files.forEach((f) => {
    const html = fs.readFileSync(path.join(PAGES_DIR, f), 'utf8');
    const m = html.match(/<!--\s*policy-deps:\s*(.+?)\s*-->/);
    if (!m) return; // policy-deps를 선언하지 않은 페이지는 대응 키가 없어 스캔 대상이 아니다

    const declared = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const candidatePool = [];
    declared.forEach((keyExpr) => {
      const sep = keyExpr.indexOf(':');
      if (sep === -1) return;
      const alias = keyExpr.slice(0, sep);
      const dotPath = keyExpr.slice(sep + 1);
      const filename = POLICY_FILE_ALIASES[alias];
      if (!filename) return;
      let data;
      try {
        data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
      } catch (e) {
        return;
      }
      const value = getDeep(data, dotPath);
      if (value === undefined) return;
      candidatePool.push(...generateCandidates(value));
    });

    const headEndIdx = html.indexOf('</head>');
    const head = headEndIdx === -1 ? html : html.slice(0, headEndIdx);
    // <style> 내용(예: width:100% 같은 CSS 값)은 정책값이 아니므로 제거한다. <script>도 마찬가지로
    // 제거하되, application/ld+json 스크립트(JSON-LD)는 스캔 대상에 포함해야 하므로 남겨둔다.
    const headText = head
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, '');
    const tokens = Array.from(new Set(headText.match(HEAD_NUM_UNIT_RE) || []));

    tokens.forEach((token) => {
      const matched = candidatePool.some((c) => token.includes(c));
      if (!matched) warnings.push({ file: f, token });
    });
  });

  console.log('\n[build-pages] head 드리프트 스캔 ③ (경고 전용, 하드 실패 아님)');
  if (warnings.length) {
    console.warn('[build-pages] 경고: head 블록 숫자가 선언된 policy-deps 값과 매칭되지 않음 (' + warnings.length + '건):');
    warnings.forEach((w) => console.warn('  - ' + w.file + ' : "' + w.token + '"'));
  } else {
    console.log('  위반 없음');
  }
  report.headDriftScan = { violated: warnings.length, warnings };
  return warnings;
}

/* ── 메인 ───────────────────────────────────────────────── */

function main() {
  validateDeliveryFeeRatesMatch();

  const report = { written: [], unchanged: [], skipped: [], counts: {} };
  const depsViolations = lintPolicyDeps(report);         // ①
  const invariantViolations = checkPolicyInvariants(report); // ②
  scanHeadDrift(report);                                  // ③ (경고 전용)
  const gradeViolations = checkPolicyGradeGuard(report);  // ④ (정책 페이지 쓰기 전)

  // 0단계 (가): ①②의 위반을 각자 바로 fail() 하지 않고 모아서 마지막에 한 번만 부른다.
  const hardViolations = []
    .concat(depsViolations.map((v) => {
      const expected = v.value !== undefined ? ' (기대값 ' + JSON.stringify(v.value) + ', 후보 ' + JSON.stringify(v.candidates) + ')' : '';
      return '[policy-deps] ' + v.file + ' : ' + v.key + expected + ' — ' + v.reason;
    }))
    .concat(invariantViolations.map((v) => {
      return '[invariant] ' + v.file + ' : ' + v.key + ' — ' + v.reason;
    }));

  if (hardViolations.length) {
    const msg = 'policy-deps / 파생값 불변식 검증 실패 (' + hardViolations.length + '건):\n  - ' + hardViolations.join('\n  - ');
    if (LINT_HARD_FAIL) {
      fail(msg);
    } else {
      console.warn('\n[build-pages] 경고(LINT_HARD_FAIL=false — 하드 실패 비활성화 상태): ' + msg);
    }
  }

  // 등급 가드(④)는 LINT_HARD_FAIL 과 무관하게 항상 실패시킨다 — 정확한 비교라 오탐이 없고,
  // 의도적 강등은 ALLOWED_DEMOTIONS 로 처리한다. 정책 페이지 쓰기 전에 멈춘다.
  if (gradeViolations.length) {
    fail('등급 가드 검증 실패 (' + gradeViolations.length + '건):\n  - ' +
      gradeViolations.map((v) => '[grade-guard] ' + v.reason).join('\n  - '));
  }

  const policyData = readJson('policies.json');
  const homeData = readJson('home-cards.json');

  const policies = Array.isArray(policyData.policies) ? policyData.policies : null;
  if (!policies) fail('policies.json 에 policies 배열이 없습니다.');
  if (policies.length === 0) fail('policies.json 의 policies 배열이 비어 있습니다. (페이지를 비우는 사고 방지)');

  // detailUrl(pages/*) 검증 — 가리키는 파일이 실제로 없으면 빌드 중단.
  // articleUrl 177개가 전부 404였던 사고의 재발 방지(전부 모아서 한 번에 알려준다).
  const missingDetailPages = [];
  policies.forEach((p) => {
    if (!p.detailUrl) return;
    const file = path.join(ROOT, p.detailUrl + '.html');
    if (!fs.existsSync(file)) missingDetailPages.push(p.title + ' → ' + p.detailUrl + '.html');
  });
  if (missingDetailPages.length) {
    fail('detailUrl이 가리키는 파일이 없는 정책 ' + missingDetailPages.length + '건:\n  - ' +
      missingDetailPages.join('\n  - '));
  }

  // 정책 상세 페이지(pages/policy-*.html) 등급 반영 — "쓰기"가 먼저다.
  // A등급(=data/policy-notes.json 에 해설이 있는 서비스ID)이면 POLICY_NOTE/POLICY_AD 마커를
  // 채우고 robots 를 index,follow 로, 아니면 두 마커를 비우고 noindex,follow 로 쓴다.
  // CSV/gov24 등 저장소 밖 소스에 의존하지 않는다(generate-policy-pages.js 를 실행할 필요 없음).
  const policyPageIds = renderPolicyPages(report);

  // sitemap.xml 의 policy- URL 을 A등급만 남도록 동기화. 기존 항목의 lastmod 는 보존하고
  // 새로 A등급이 된 것만 오늘 날짜로 추가한다.
  renderSitemapPolicyEntries(policyPageIds, report);

  // 위 "쓰기" 결과를 독립적으로 재검증. A등급이 아니면 noindex 여야 하고
  // 애드센스/애드핏 블록/스크립트가 한 줄도 있으면 안 된다. (애드센스 3차 거절 방지 안전판)
  validatePolicyDetailPages();

  // sitemap 에는 A등급 정책 상세 페이지만 등록되어야 한다.
  validateSitemapGrades();

  // 메뉴별 분류 — data/menu-assignment.json 기준 (배정표에 없는 정책 id 는 여기서 빌드 실패)
  const { policyMenus, byMenu, articlesByMenu } = loadMenuAssignment(policies);

  // expired 경고 (지시 B)
  const expired = policies.filter((p) => p.status === 'expired');
  if (expired.length) {
    console.warn('\n[build-pages] 경고: status="expired" 정책 ' + expired.length + '건 (현재는 그대로 렌더됨):');
    expired.forEach((p) => console.warn('  - [' + p.category + '] ' + (p.benefit || p.title)));
  }

  // ── 메뉴 페이지 (정책 카드 + 글 카드) ──
  report.articleCounts = {};
  policyMenus.forEach((m) => {
    const menu = m.name;
    const pageFile = m.slug + '.html';
    const file = path.join(PAGES_DIR, pageFile);
    let html;
    try {
      html = fs.readFileSync(file, 'utf8');
    } catch (e) {
      fail('메뉴 페이지 파일이 없습니다: ' + path.relative(ROOT, file));
    }

    const eol = detectEol(html);
    const list = byMenu[menu];
    const articles = articlesByMenu[menu];

    if (list.length === 0) {
      fail(menu + ' 메뉴 정책이 0건입니다 — ' + pageFile +
        ' 을(를) 비우지 않고 종료합니다. (JSON 손상 방지)');
    }

    const inner = renderCategoryInner(menu, list);
    let replaced = replaceBetweenMarkers(html.split('\r\n').join('\n'), 'POLICY_CARDS', inner);
    if (replaced === null) fail('AUTOGEN:POLICY_CARDS 마커 없음 — ' + path.relative(ROOT, file));
    replaced = replaceBetweenMarkers(replaced, 'GUIDE_CARDS', renderGuideInner(articles));
    if (replaced === null) fail('AUTOGEN:GUIDE_CARDS 마커 없음 — ' + path.relative(ROOT, file));

    const nextText = replaced.split('\n').join(eol);

    // 안전장치: canonical 태그 잔존 확인
    if (!/<link[^>]+rel=["']canonical["']/.test(nextText)) {
      fail('교체 후 ' + pageFile + ' 에 canonical 태그가 없습니다. 중단합니다.');
    }

    // 안전장치: 렌더된 카드 수 === 배정 항목 수 (지시 C)
    const renderedCards = (nextText.match(/<div class="pl-card"[\s>]/g) || []).length;
    if (renderedCards !== list.length) {
      fail(pageFile + ' 카드 수 불일치: 렌더 ' + renderedCards +
        ' vs 배정 ' + list.length + '. 중단합니다.');
    }
    const renderedGuides = (nextText.match(/class="article-card"/g) || []).length;
    if (renderedGuides !== articles.length) {
      fail(pageFile + ' 글 카드 수 불일치: 렌더 ' + renderedGuides + ' vs 배정 ' + articles.length + '. 중단합니다.');
    }
    report.counts[menu] = renderedCards;
    report.articleCounts[menu] = renderedGuides;

    // 참고: 문서상 기대값과 다르면 경고 (에러 아님)
    if (EXPECTED_COUNTS[menu] !== list.length) {
      console.warn('[build-pages] 참고: ' + menu + ' 항목 수가 ' + EXPECTED_COUNTS[menu] +
        ' → ' + list.length + ' 로 바뀌었습니다. (정상적인 정책 추가/삭제일 수 있음)');
    }

    writeIfChanged(file, nextText, report);
  });

  // 메뉴 카드가 detailUrl 을 실제로 링크로 걸었는지 검증 (지시 2).
  // 디스크에 쓰여진 최종 파일을 다시 읽어서 확인한다.
  validateCategoryCardLinks(policyMenus, byMenu);

  // 계산기·소상공인(도구 전용 탭)에 정책·일반 글 링크가 섞이지 않았는지 검증.
  validateToolTabs();

  // ── index.html (HOME_CARDS + SEASONAL) ──
  const indexFile = path.join(ROOT, 'index.html');
  let indexHtml;
  try {
    indexHtml = fs.readFileSync(indexFile, 'utf8');
  } catch (e) {
    console.warn('[build-pages] 경고: index.html 없음, 건너뜀');
    report.skipped.push('index.html');
  }

  if (indexHtml != null) {
    const eol = detectEol(indexHtml);
    let work = indexHtml.split('\r\n').join('\n');
    let touchedIndex = false;

    // index.html에서 홈카드(청년정책/신혼육아/중장년노년) 섹션을 제거했으므로
    // AUTOGEN:HOME_CARDS 블록 생성은 건너뛴다. (data/home-cards.json 의 sections 는 참고용으로만 남김)

    const seasonalInner = renderSeasonalInner(homeData);
    const afterSeasonal = replaceBetweenMarkers(work, 'SEASONAL', seasonalInner);
    if (afterSeasonal === null) {
      console.warn('[build-pages] 경고: AUTOGEN:SEASONAL 마커 없음, 배너 건너뜀');
    } else {
      work = afterSeasonal;
      touchedIndex = true;
    }

    if (touchedIndex) {
      const nextText = work.split('\n').join(eol);
      if (!/<link[^>]+rel=["']canonical["']/.test(nextText)) {
        fail('교체 후 index.html 에 canonical 태그가 없습니다. 중단합니다.');
      }
      writeIfChanged(indexFile, nextText, report);
    }
  }

  // ── 결과 출력 ──
  console.log('\n[build-pages] 완료');
  console.log('  카드 수 (정책 / 글):');
  Object.keys(report.counts).forEach((k) => {
    console.log('    ' + k + ': ' + report.counts[k] + ' / ' + report.articleCounts[k]);
  });
  const total = Object.keys(byMenu).reduce((n, c) => n + byMenu[c].length, 0);
  const totalArticles = Object.keys(articlesByMenu).reduce((n, c) => n + articlesByMenu[c].length, 0);
  console.log('    (메뉴 합계: 정책 ' + total + ' / 글 ' + totalArticles + ')');

  console.log('  변경된 파일: ' + (report.written.length ? report.written.join(', ') : '없음'));
  if (report.unchanged.length) console.log('  변경 없음: ' + report.unchanged.join(', '));
  if (report.skipped.length) console.log('  건너뜀: ' + report.skipped.join(', '));
  console.log('');
}

main();
