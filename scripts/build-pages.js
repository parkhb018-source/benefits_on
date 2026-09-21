#!/usr/bin/env node
/*
 * scripts/build-pages.js
 *
 * data/policies.json / data/home-cards.json 을 읽어
 * 카테고리 페이지(pages/*.html)와 홈(index.html)의
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
 *   index.html   : <!-- AUTOGEN:HOME_CARDS:START --> ... <!-- AUTOGEN:HOME_CARDS:END -->
 *                  <!-- AUTOGEN:SEASONAL:START --> ... <!-- AUTOGEN:SEASONAL:END -->
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PAGES_DIR = path.join(ROOT, 'pages');

/* category 값 → 카테고리 페이지 파일명 */
const CATEGORY_PAGES = {
  '청년정책': 'youth.html',
  '신혼·육아': 'newlywed.html',
  '중장년·노년': 'senior.html',
  '1인가구': 'single.html',
  '근로/소득': 'income.html',
  '세금/환급': 'tax.html',
};

/* 참고용 기대 카드 수 (2026-09 기준). 실제 검증은 "렌더된 수 === JSON 항목 수" 로 하고,
   이 값과 어긋나면 에러가 아니라 경고만 낸다 — 정책 추가 시 빌드가 막히면 안 되기 때문. */
const EXPECTED_COUNTS = {
  '청년정책': 38,
  '신혼·육아': 65,
  '중장년·노년': 29,
  '1인가구': 22,
  '근로/소득': 71,
  '세금/환급': 20,
};

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

/* ── 카테고리 카드 렌더 ──────────────────────────────────── */

/* detailUrl(pages/policy-XXX, pages/article-XXX)이 있으면 내부 링크, 없으면 sourceUrl 외부 링크.
   카테고리 페이지는 pages/ 안에 있으므로 앞의 "pages/"는 떼고 상대 경로로 쓴다. .html은 붙이지 않는다. */
function renderPolicyCard(p) {
  const cat = esc(p.category);
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

  return (
    '        <div class="pl-card">' +
    '<span class="pl-cat">' + cat + '</span>' +
    '<div class="pl-title">' + title + '</div>' +
    '<p class="pl-summary">' + summary + '</p>' +
    '<div class="pl-meta">' + tagHtml + '</div>' +
    deadlineHtml +
    '<a class="pl-link" href="' + href + '"' + linkAttrs + '>' + linkText + '</a>' +
    '</div>'
  );
}

function renderCategoryInner(category, policies) {
  const sorted = sortByLastUpdatedDesc(policies, (p) => p.lastUpdated);
  const cards = sorted.map(renderPolicyCard);
  return (
    '      <div class="pl-count" id="pl-count">총 ' + cards.length + '건</div>\n' +
    '      <div class="pl-grid" id="pl-grid" data-category="' + esc(category) + '">\n' +
    cards.join('\n') + '\n' +
    '      </div>'
  );
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
function validateCategoryCardLinks(byCategory) {
  let totalInternal = 0;
  let totalExternal = 0;
  const badExternalForDetail = [];
  const badInternalTarget = [];
  const badExternalNofollow = [];
  const missingInternalFiles = [];

  Object.keys(CATEGORY_PAGES).forEach((category) => {
    const file = path.join(PAGES_DIR, CATEGORY_PAGES[category]);
    if (!fs.existsSync(file)) return;
    const html = fs.readFileSync(file, 'utf8');
    const sorted = sortByLastUpdatedDesc(byCategory[category], (p) => p.lastUpdated);
    const tags = Array.from(html.matchAll(/<a class="pl-link"([^>]*)>/g)).map((m) => m[1]);

    if (tags.length !== sorted.length) {
      fail(CATEGORY_PAGES[category] + ' 의 pl-link 개수(' + tags.length + ')가 정책 수(' +
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
    fail('카테고리 페이지 6개 합계 내부 링크 수가 186이 아닙니다: ' + totalInternal);
  }
  if (totalExternal !== 59) {
    fail('카테고리 페이지 6개 합계 외부 링크 수가 59가 아닙니다: ' + totalExternal);
  }

  console.log('[build-pages] 카드 링크 검증 통과: 내부 ' + totalInternal + ' · 외부 ' + totalExternal);
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
   ★ 정책 JSON이 여러 개(constants/income-tax/youth-deposit/retirement-pay)라 별칭
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
    const html = fs.readFileSync(path.join(PAGES_DIR, f), 'utf8'); // 읽기만 함 — 여기서 절대 쓰지 않는다
    const m = html.match(/<!--\s*policy-deps:\s*(.+?)\s*-->/);
    if (!m) return;

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

  console.log('\n[build-pages] 파생값 불변식 검사 ②');
  console.log('  선언 ' + checkedCount + '건 — 통과 ' + (checkedCount - violations.length) + ' / 위반 ' + violations.length);
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
    const tokens = Array.from(new Set(head.match(HEAD_NUM_UNIT_RE) || []));

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

  // 카테고리별 분류
  const byCategory = {};
  Object.keys(CATEGORY_PAGES).forEach((c) => { byCategory[c] = []; });
  const unknownCategories = new Set();
  policies.forEach((p) => {
    if (Object.prototype.hasOwnProperty.call(byCategory, p.category)) {
      byCategory[p.category].push(p);
    } else {
      unknownCategories.add(p.category);
    }
  });

  // expired 경고 (지시 B)
  const expired = policies.filter((p) => p.status === 'expired');
  if (expired.length) {
    console.warn('\n[build-pages] 경고: status="expired" 정책 ' + expired.length + '건 (현재는 그대로 렌더됨):');
    expired.forEach((p) => console.warn('  - [' + p.category + '] ' + (p.benefit || p.title)));
  }

  if (unknownCategories.size) {
    console.warn('\n[build-pages] 경고: 매핑되지 않은 category 값 (어느 페이지에도 안 실림): ' +
      Array.from(unknownCategories).join(', '));
  }

  // ── 카테고리 페이지 ──
  Object.keys(CATEGORY_PAGES).forEach((category) => {
    const file = path.join(PAGES_DIR, CATEGORY_PAGES[category]);
    let html;
    try {
      html = fs.readFileSync(file, 'utf8');
    } catch (e) {
      console.warn('[build-pages] 경고: 파일 없음, 건너뜀 — ' + path.relative(ROOT, file));
      report.skipped.push(path.relative(ROOT, file));
      return;
    }

    const eol = detectEol(html);
    const list = byCategory[category];

    if (list.length === 0) {
      fail(category + ' 카테고리 정책이 0건입니다 — ' + CATEGORY_PAGES[category] +
        ' 을(를) 비우지 않고 종료합니다. (JSON 손상 방지)');
    }

    const inner = renderCategoryInner(category, list).split('\n').join(eol);
    const replaced = replaceBetweenMarkers(html.split('\r\n').join('\n'), 'POLICY_CARDS', inner.split('\r\n').join('\n'));

    if (replaced === null) {
      console.warn('[build-pages] 경고: AUTOGEN:POLICY_CARDS 마커 없음, 건너뜀 — ' + path.relative(ROOT, file));
      report.skipped.push(path.relative(ROOT, file));
      return;
    }

    const nextText = replaced.split('\n').join(eol);

    // 안전장치: canonical 태그 잔존 확인
    if (!/<link[^>]+rel=["']canonical["']/.test(nextText)) {
      fail('교체 후 ' + CATEGORY_PAGES[category] + ' 에 canonical 태그가 없습니다. 중단합니다.');
    }

    // 안전장치: 렌더된 카드 수 === JSON 항목 수 (지시 C)
    const renderedCards = (nextText.match(/<div class="pl-card">/g) || []).length;
    if (renderedCards !== list.length) {
      fail(CATEGORY_PAGES[category] + ' 카드 수 불일치: 렌더 ' + renderedCards +
        ' vs JSON ' + list.length + '. 중단합니다.');
    }
    report.counts[category] = renderedCards;

    // 참고: 문서상 기대값과 다르면 경고 (에러 아님)
    if (EXPECTED_COUNTS[category] !== list.length) {
      console.warn('[build-pages] 참고: ' + category + ' 항목 수가 ' + EXPECTED_COUNTS[category] +
        ' → ' + list.length + ' 로 바뀌었습니다. (정상적인 정책 추가/삭제일 수 있음)');
    }

    writeIfChanged(file, nextText, report);
  });

  // 카테고리 카드가 detailUrl 을 실제로 링크로 걸었는지 검증 (지시 2).
  // 디스크에 쓰여진 최종 파일을 다시 읽어서 확인한다.
  validateCategoryCardLinks(byCategory);

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
  console.log('  카드 수:');
  Object.keys(report.counts).forEach((k) => {
    console.log('    ' + k + ': ' + report.counts[k]);
  });
  const total = Object.keys(byCategory).reduce((n, c) => n + byCategory[c].length, 0);
  console.log('    (카테고리 합계: ' + total + ')');

  console.log('  변경된 파일: ' + (report.written.length ? report.written.join(', ') : '없음'));
  if (report.unchanged.length) console.log('  변경 없음: ' + report.unchanged.join(', '));
  if (report.skipped.length) console.log('  건너뜀: ' + report.skipped.join(', '));
  console.log('');
}

main();
