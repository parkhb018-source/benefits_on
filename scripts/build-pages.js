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
  '청년정책': 50,
  '신혼·육아': 60,
  '중장년·노년': 22,
  '1인가구': 22,
  '근로/소득': 70,
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

function loadPolicyNotes() {
  const file = path.join(DATA_DIR, 'policy-notes.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail('policy-notes.json 파싱 실패: ' + e.message);
  }
}

const ADSENSE_PATTERN = /adsbygoogle|google-adsense-account|pagead2\.googlesyndication\.com/;

function validatePolicyDetailPages() {
  const notes = loadPolicyNotes();
  if (!fs.existsSync(PAGES_DIR)) return;
  const files = fs.readdirSync(PAGES_DIR).filter((f) => /^policy-.+\.html$/.test(f));
  const badAds = [];
  const badIndex = [];
  files.forEach((f) => {
    const id = f.slice('policy-'.length, -'.html'.length);
    const isA = Object.prototype.hasOwnProperty.call(notes, id);
    const html = fs.readFileSync(path.join(PAGES_DIR, f), 'utf8');
    if (!isA && ADSENSE_PATTERN.test(html)) badAds.push(f);
    if (!isA && !/<meta name="robots" content="noindex/.test(html)) badIndex.push(f);
  });
  if (badAds.length) {
    fail('A등급이 아닌 정책 상세 페이지에 애드센스 블록/스크립트가 있습니다 (' + badAds.length + '건):\n  - ' +
      badAds.join('\n  - '));
  }
  if (badIndex.length) {
    fail('A등급이 아닌 정책 상세 페이지에 noindex 메타가 없습니다 (' + badIndex.length + '건):\n  - ' +
      badIndex.join('\n  - '));
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
  if (totalInternal !== 185) {
    fail('카테고리 페이지 6개 합계 내부 링크 수가 185가 아닙니다: ' + totalInternal);
  }
  if (totalExternal !== 59) {
    fail('카테고리 페이지 6개 합계 외부 링크 수가 59가 아닙니다: ' + totalExternal);
  }

  console.log('[build-pages] 카드 링크 검증 통과: 내부 ' + totalInternal + ' · 외부 ' + totalExternal);
}

/* ── 메인 ───────────────────────────────────────────────── */

function main() {
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

  // 정책 상세 페이지(pages/policy-*.html) 등급 검증.
  // A등급(=data/policy-notes.json 에 해설이 있는 서비스ID)이 아니면 noindex 여야 하고
  // 애드센스 블록/스크립트가 한 줄도 있으면 안 된다. (애드센스 3차 거절 방지 안전판)
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

  const report = { written: [], unchanged: [], skipped: [], counts: {} };

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
    let homeCardCount = 0;

    const sourceUrlToDetailUrl = {};
    policies.forEach((p) => {
      if (p.detailUrl && p.sourceUrl) sourceUrlToDetailUrl[p.sourceUrl] = p.detailUrl;
    });
    const homeInner = renderHomeCardsInner(homeData, sourceUrlToDetailUrl);
    const afterHome = replaceBetweenMarkers(work, 'HOME_CARDS', homeInner);
    if (afterHome === null) {
      console.warn('[build-pages] 경고: AUTOGEN:HOME_CARDS 마커 없음, 홈 카드 건너뜀');
    } else {
      work = afterHome;
      touchedIndex = true;
      homeCardCount = (homeInner.match(/class="article-card"/g) || []).length;
    }

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
      if (afterHome !== null && homeCardCount === 0) {
        fail('index.html 홈 카드가 0개입니다. (home-cards.json 손상 방지) 중단합니다.');
      }
      report.counts['홈(index.html)'] = homeCardCount;
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
