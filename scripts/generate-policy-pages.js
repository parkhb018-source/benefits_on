#!/usr/bin/env node
/*
 * scripts/generate-policy-pages.js
 *
 * 상세페이지_생성목록_244.csv 의 "생성" 164건에 대해 pages/policy-{서비스ID}.html 을 생성하고,
 * data/policies.json 의 detailUrl 을 채우고, data/policy-notes.json 을 생성한다.
 *
 * 소스 데이터(로컬 절대경로, 저장소 밖):
 *   E:\사업\Pixel Vibe\수익화 웹사이트01\Claude outputs\상세페이지_생성목록_244.csv
 *   E:\사업\Pixel Vibe\수익화 웹사이트01\gov24\detail-*.json (serviceDetail, 서비스ID로 조인)
 *   E:\사업\Pixel Vibe\수익화 웹사이트01\gov24\cond-*.json   (supportConditions)
 *
 * 1회성 생성 스크립트. Node 표준 라이브러리만 사용.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES_DIR = path.join(ROOT, 'pages');
const DATA_DIR = path.join(ROOT, 'data');
const SITEMAP_FILE = path.join(ROOT, 'sitemap.xml');

const SRC_ROOT = 'E:/사업/Pixel Vibe/수익화 웹사이트01';
const CSV_PATH = SRC_ROOT + '/Claude outputs/상세페이지_생성목록_244.csv';
const GOV24_DIR = SRC_ROOT + '/gov24';

const SITE = 'https://benefitson.org';

/* A등급(=data/policy-notes.json 에 해설이 있는 서비스ID) 판정은 scripts/build-pages.js 와 동일 기준.
   해설은 문단 단위 문자열 배열 — h1 바로 아래, "어떤 지원인가요" 위에 문단으로 렌더한다. */
function loadNotes() {
  const file = path.join(DATA_DIR, 'policy-notes.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/* ── CSV 파서 (RFC4180 최소 구현: 따옴표 안 콤마 처리) ─────────── */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* 원문 줄바꿈을 <br> 로. 이스케이프 후 처리. */
function textToHtml(v) {
  if (v == null) return '';
  return esc(v).replace(/\r\n|\r|\n/g, '<br>');
}

function isBlankLike(v) {
  if (v == null) return true;
  const t = String(v).trim();
  return t === '' || t === '해당없음' || t === '-';
}

/* ── 소스 로드 ──────────────────────────────────────────────── */

function loadCsvRows() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '');
  const rows = parseCSV(raw).filter((r) => r.length > 1);
  const header = rows[0];
  const idx = {};
  header.forEach((h, i) => { idx[h.trim()] = i; });
  return rows.slice(1).map((r) => ({
    id: r[idx['서비스ID']],
    name: r[idx['서비스명']],
    category: r[idx['카테고리']],
    bodyLen: r[idx['본문자수']],
    searchVol: r[idx['검색량']],
    genFlag: r[idx['생성여부']],
    grade: r[idx['등급']],
    note: r[idx['비고/제외사유']],
    detailUrl: r[idx['detailUrl']],
    sourceUrl: r[idx['sourceUrl']],
  }));
}

function loadJoinedMaps() {
  const detailMap = new Map();
  const condMap = new Map();
  for (let i = 1; i <= 12; i++) {
    const df = path.join(GOV24_DIR, 'detail-' + i + '.json');
    if (fs.existsSync(df)) {
      const j = JSON.parse(fs.readFileSync(df, 'utf8'));
      (j.data || []).forEach((rec) => detailMap.set(rec['서비스ID'], rec));
    }
    const cf = path.join(GOV24_DIR, 'cond-' + i + '.json');
    if (fs.existsSync(cf)) {
      const j = JSON.parse(fs.readFileSync(cf, 'utf8'));
      (j.data || []).forEach((rec) => condMap.set(rec['서비스ID'], rec));
    }
  }
  return { detailMap, condMap };
}

/* ── 자격 요약 박스 ─────────────────────────────────────────── */

const HOUSEHOLD_LABELS = [
  ['JA0401', '다문화가구'],
  ['JA0403', '한부모가구'],
  ['JA0404', '1인가구'],
  ['JA0411', '다자녀가구'],
];

function buildEligibilitySummary(cond, detail) {
  const parts = [];

  if (cond) {
    const start = typeof cond.JA0110 === 'number' ? cond.JA0110 : null;
    const end = typeof cond.JA0111 === 'number' ? cond.JA0111 : null;
    const omitAge = (start == null || start === 0) && (end == null || end === 120);
    if (!omitAge) {
      if (start != null && start !== 0 && end != null && end !== 120) parts.push('만 ' + start + '세~' + end + '세');
      else if (start != null && start !== 0) parts.push('만 ' + start + '세 이상');
      else if (end != null && end !== 120) parts.push('만 ' + end + '세 이하');
    }

    const households = HOUSEHOLD_LABELS.filter(([code]) => cond[code] === 'Y').map(([, label]) => label);
    if (households.length) parts.push(households.join('·'));
  }

  const criteria = detail && detail['선정기준'] ? String(detail['선정기준']) : '';
  const incomeMatch = criteria.match(/중위소득\s*\d+%\s*(이하|이내|미만)?/);
  if (incomeMatch) parts.push(incomeMatch[0].replace(/\s+/g, ' ').trim());

  return parts;
}

/* ── 관련 도구 카드 매칭 ────────────────────────────────────── */

const TOOL_CARDS = {
  'calc-tax-refund': { href: 'calc-tax-refund', label: '연말정산 환급 계산기' },
  'calc-eitc': { href: 'calc-eitc', label: '근로장려금 계산기' },
  'calc-unemployment': { href: 'calc-unemployment', label: '실업급여 계산기' },
  'calc-net-salary': { href: 'calc-net-salary', label: '실수령액 계산기' },
  'calc-minimum-wage': { href: 'calc-minimum-wage', label: '최저임금 계산기' },
  'calc-retirement-pay': { href: 'calc-retirement-pay', label: '퇴직금 계산기' },
  'calc-youth-deposit': { href: 'calc-youth-deposit', label: '청년내일저축계좌 계산기' },
  'calculators': { href: 'calculators', label: '전체 계산기 모음' },
  'article-basic-pension': { href: 'article-basic-pension', label: '기초연금 신청 자격 안내' },
  'article-childcare': { href: 'article-childcare', label: '보육료 지원 안내' },
  'article-parental-leave': { href: 'article-parental-leave', label: '육아휴직급여 안내' },
  'article-newlywed-support': { href: 'article-newlywed-support', label: '신혼부부 지원 안내' },
  'article-housing-benefit': { href: 'article-housing-benefit', label: '주거급여 안내' },
  'article-energy-voucher': { href: 'article-energy-voucher', label: '에너지바우처 안내' },
  'article-child-edu': { href: 'article-child-edu', label: '교육비 지원 안내' },
  'article-tomorrow-learning': { href: 'article-tomorrow-learning', label: '내일배움카드 안내' },
  'article-national-pension': { href: 'article-national-pension', label: '국민연금 수령액 조회' },
  'article-severance': { href: 'article-severance', label: '퇴직금 안내' },
  'article-youth-rent': { href: 'article-youth-rent', label: '청년월세 지원 안내' },
  'article-youth-savings': { href: 'article-youth-savings', label: '청년내일저축계좌 안내' },
  'article-senior-jobs': { href: 'article-senior-jobs', label: '노인일자리 안내' },
  'article-unemployment-guide': { href: 'article-unemployment-guide', label: '실업급여 신청 안내' },
  'article-eitc': { href: 'article-eitc', label: '근로장려금 안내' },
  'article-youth-sme-tax': { href: 'article-youth-sme-tax', label: '중소기업 청년 소득세 감면 안내' },
};

/* 서비스명·지원대상 키워드 → 아티클. 계산기가 안 걸리거나 자리가 남을 때 채운다. */
const ARTICLE_KEYWORD_RULES = [
  [/보육|어린이집|유치원|돌봄/, 'article-childcare'],
  [/육아휴직|출산|육아기/, 'article-parental-leave'],
  [/신혼|혼인/, 'article-newlywed-support'],
  [/월세|전세|주거|임대/, 'article-housing-benefit'],
  [/에너지|난방|전기/, 'article-energy-voucher'],
  [/장학|학자금|교육비/, 'article-child-edu'],
  [/직업훈련|내일배움/, 'article-tomorrow-learning'],
  [/국민연금|노령/, 'article-national-pension'],
  [/퇴직/, 'article-severance'],
];

const ARTICLE_CATEGORY_DEFAULTS = {
  '신혼·육아': ['article-childcare', 'article-parental-leave'],
  '청년정책': ['article-youth-rent', 'article-youth-savings'],
  '1인가구': ['article-housing-benefit', 'article-energy-voucher'],
  '중장년·노년': ['article-basic-pension', 'article-senior-jobs'],
  '근로/소득': ['article-unemployment-guide', 'article-tomorrow-learning'],
  '세금/환급': ['article-eitc', 'article-youth-sme-tax'],
};

function matchArticleSlugs(row, detail) {
  const name = row.name || '';
  const target = (detail && detail['지원대상']) || '';
  const text = name + ' ' + target;
  const found = [];
  ARTICLE_KEYWORD_RULES.forEach(([re, slug]) => {
    if (re.test(text) && !found.includes(slug)) found.push(slug);
  });
  if (found.length) return found.slice(0, 2);
  return ARTICLE_CATEGORY_DEFAULTS[row.category] || [];
}

function matchToolCards(row, detail, cond) {
  const name = row.name || '';
  const category = row.category;
  const target = (detail && detail['지원대상']) || '';
  const supportType = (detail && detail['지원유형']) || '';
  const startAge = cond && typeof cond.JA0110 === 'number' ? cond.JA0110 : null;

  let keys;
  if (/저축|적금|통장|계좌/.test(name)) {
    keys = ['calc-youth-deposit'];
  } else if (/현금\(감면\)/.test(supportType) || category === '세금/환급') {
    keys = ['calc-tax-refund', 'calc-eitc'];
  } else if (/퇴직|퇴사/.test(name)) {
    keys = ['calc-retirement-pay'];
  } else if (category === '근로/소득' && /실업|구직|재취업/.test(name + target)) {
    keys = ['calc-unemployment'];
  } else if (category === '근로/소득') {
    keys = ['calc-net-salary', 'calc-minimum-wage'];
  } else if (category === '중장년·노년' || (startAge != null && startAge >= 55)) {
    keys = ['calc-retirement-pay', 'article-basic-pension'];
  } else {
    keys = [];
  }

  if (keys.length < 3) {
    const articleSlugs = matchArticleSlugs(row, detail).filter((s) => !keys.includes(s));
    for (const s of articleSlugs) {
      if (keys.length >= 3) break;
      keys.push(s);
    }
  }
  if (keys.length === 0) keys = ['calculators'];

  return keys.slice(0, 3).map((k) => TOOL_CARDS[k]);
}

/* ── 카테고리 → 허브 페이지 매핑 (build-pages.js 와 동일) ────── */
const CATEGORY_PAGES = {
  '청년정책': 'youth',
  '신혼·육아': 'newlywed',
  '중장년·노년': 'senior',
  '1인가구': 'single',
  '근로/소득': 'income',
  '세금/환급': 'tax',
};

/* ── 페이지 렌더 ────────────────────────────────────────────── */

function splitList(v) {
  if (!v) return [];
  return String(v).split('||').map((s) => s.trim()).filter(Boolean);
}

function renderPage(row, detail, cond, notes) {
  const id = row.id;
  const name = row.name;
  const category = row.category;
  const hubPage = CATEGORY_PAGES[category] || 'calculators';
  const isA = Object.prototype.hasOwnProperty.call(notes, id);

  const purpose = detail['서비스목적'] || '';
  const target = detail['지원대상'] || '';
  const criteria = detail['선정기준'] || '';
  const content = detail['지원내용'] || '';
  const supportType = detail['지원유형'] || '';
  const method = detail['신청방법'] || '';
  const deadline = detail['신청기한'] || '';
  const docs = detail['구비서류'] || '';
  const govDocs = detail['공무원확인구비서류'];
  const idDocs = detail['본인확인필요구비서류'];
  const contact = detail['문의처'] || '';
  const receiver = detail['접수기관명'];
  const laws = splitList(detail['법령']);
  const onlineUrl = detail['온라인신청사이트URL'];

  const finalUrl = !isBlankLike(onlineUrl) ? onlineUrl : row.sourceUrl;

  const eligibilityParts = buildEligibilitySummary(cond, detail);
  const eligibilityHtml = eligibilityParts.length
    ? '<div class="policy-data-badge">📋 ' + eligibilityParts.map(esc).join(' · ') + '</div>'
    : '';

  const toolCards = matchToolCards(row, detail, cond);
  const toolCardsHtml = toolCards.map((c) =>
    '            <a href="' + esc(c.href) + '" class="policy-tool-card">' + esc(c.label) + ' →</a>'
  ).join('\n');

  const lawsHtml = laws.length
    ? '<p>' + laws.map(esc).join('<br>') + '</p>'
    : '';

  const docsExtra = [];
  if (!isBlankLike(govDocs)) docsExtra.push('<p><strong>공무원 확인 구비서류:</strong> ' + textToHtml(govDocs) + '</p>');
  if (!isBlankLike(idDocs)) docsExtra.push('<p><strong>본인 확인 필요 구비서류:</strong> ' + textToHtml(idDocs) + '</p>');

  const contactParts = [];
  if (!isBlankLike(receiver)) contactParts.push('<p><strong>접수기관:</strong> ' + esc(receiver) + '</p>');
  if (!isBlankLike(contact)) {
    const contacts = splitList(contact);
    contactParts.push('<p><strong>문의처:</strong><br>' + contacts.map(esc).join('<br>') + '</p>');
  }

  const onlineAnswer = !isBlankLike(onlineUrl)
    ? '온라인 신청이 가능합니다. 아래 "정부24에서 신청하기" 버튼을 이용하세요.'
    : '온라인 신청 사이트가 별도로 없습니다. 신청 방법을 참고해 접수기관에 직접 신청하세요.';

  const whereAnswerParts = [];
  if (!isBlankLike(method)) whereAnswerParts.push(textToHtml(method));
  if (!isBlankLike(receiver)) whereAnswerParts.push('접수기관: ' + esc(receiver));
  const whereAnswer = whereAnswerParts.join('<br>') || '신청 방법을 참고하세요.';

  const canonical = SITE + '/pages/policy-' + id;
  const title = esc(name) + ' 신청 자격·지원금액·신청방법 — 혜택on';
  const description = esc((purpose || target || name).toString().slice(0, 90));

  const robotsContent = isA ? 'index,follow' : 'noindex,follow';

  const adsenseHeadScript = isA
    ? '\n  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4871058922328451" crossorigin="anonymous"></script>'
    : '';

  const noteParagraphs = isA ? (notes[id] || []) : [];
  const noteHtml = noteParagraphs.length
    ? '<div class="policy-note">' + noteParagraphs.map((p) => '<p>' + textToHtml(p) + '</p>').join('\n            ') + '</div>'
    : '';

  const adsenseInArticleHtml = isA
    ? '\n            <ins class="adsbygoogle"\n' +
      '                 style="display:block; text-align:center;"\n' +
      '                 data-ad-layout="in-article"\n' +
      '                 data-ad-format="fluid"\n' +
      '                 data-ad-client="ca-pub-4871058922328451"\n' +
      '                 data-ad-slot="2985171819"></ins>\n' +
      '            <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>\n'
    : '';

  const lastUpdated = detail['수정일시'] || '';
  const freshnessNote = lastUpdated
    ? '<p style="font-size:0.78rem;color:var(--text-muted);margin-top:16px;">이 내용은 정부24 ' +
      esc(lastUpdated) + ' 기준입니다. 최신 내용은 아래 공식 사이트에서 확인하세요.</p>'
    : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta name="naver-site-verification" content="7275bfd241a8eaef8de75ca865a8e2a6a6093555" />
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="stylesheet" href="../style.css?v=20260914">
  <link rel="stylesheet" href="pages.css?v=20260914b">
  <link rel="canonical" href="${canonical}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${SITE}/og-image.png">
  <meta property="og:site_name" content="혜택on">
  <meta name="robots" content="${robotsContent}">
  <link rel="sitemap" type="application/xml" href="/sitemap.xml">
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-K1YVTR39FF"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-K1YVTR39FF');
  </script>
<script src="/assets/js/analytics.js"></script>${adsenseHeadScript}
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      <a href="../" class="logo">혜택<span class="on">on</span></a>
      <nav class="nav-main" aria-label="주요 메뉴">
        <ul>
          <li><a href="youth">청년정책</a></li>
          <li><a href="newlywed">신혼·육아</a></li>
          <li><a href="senior">중장년·노년</a></li>
          <li><a href="single">1인가구</a></li>
          <li><a href="income">근로/소득</a></li>
          <li><a href="tax">세금/환급</a></li>
          <li><a href="calculators">계산기</a></li>
          <li><a href="resources">무료도구</a></li>
        </ul>
      </nav>
      <button class="hamburger" aria-label="메뉴 열기"><span></span><span></span><span></span></button>
    </div>
  </header>
  <nav class="mobile-menu" aria-label="모바일 메뉴">
    <a href="youth"><span class="m-icon">🎓</span>청년정책</a>
    <a href="newlywed"><span class="m-icon">👶</span>신혼·육아</a>
    <a href="senior"><span class="m-icon">👴</span>중장년·노년</a>
    <a href="single"><span class="m-icon">🏠</span>1인가구</a>
    <a href="income"><span class="m-icon">💼</span>근로/소득</a>
    <a href="tax"><span class="m-icon">🧾</span>세금/환급</a>
    <a href="calculators"><span class="m-icon">🧮</span>계산기</a>
    <a href="resources"><span class="m-icon">📂</span>무료도구</a>
  </nav>

  <div style="background: var(--bg-soft); border-bottom: 1px solid var(--border);">
    <div class="inner-wrap breadcrumb-bar">
      <a href="../">홈</a><span class="sep">›</span>
      <a href="${esc(hubPage)}">${esc(category)}</a><span class="sep">›</span>
      ${esc(name)}
    </div>
  </div>

  <main style="padding-bottom: 0;">
    <div class="inner-wrap">
      <div class="article-layout">
        <article class="article-main">
          <header class="article-header">
            <h1 class="article-h1">${esc(name)}</h1>
          </header>

          ${noteHtml}

          ${eligibilityHtml}

          <div class="article-body">
            <h2>어떤 지원인가요</h2>
            <p>${textToHtml(purpose)}</p>

            <h2>누가 받을 수 있나요</h2>
            <p>${textToHtml(target)}</p>
            ${criteria ? '<p>' + textToHtml(criteria) + '</p>' : ''}

            <h2>얼마를 받나요</h2>
            <p>${textToHtml(content)}</p>
            ${supportType ? '<p><strong>지원유형:</strong> ' + esc(supportType) + '</p>' : ''}

            <h2>어떻게 신청하나요</h2>
            <p>${textToHtml(method)}</p>
            ${deadline ? '<p><strong>신청기한:</strong> ' + textToHtml(deadline) + '</p>' : ''}

            <h2>필요한 서류</h2>
            <p>${textToHtml(docs)}</p>
            ${docsExtra.join('\n            ')}

            <h2>문의처</h2>
            ${contactParts.join('\n            ') || '<p>공식 사이트에서 확인하세요.</p>'}

            <h2>자주 묻는 질문</h2>
            <h3>Q. 어떤 서류가 필요한가요?</h3>
            <p>${textToHtml(docs)}</p>

            <h3>Q. 온라인으로 신청할 수 있나요?</h3>
            <p>${onlineAnswer}</p>

            <h3>Q. 어디에 신청하나요?</h3>
            <p>${whereAnswer}</p>

            <h3>Q. 언제까지 신청할 수 있나요?</h3>
            <p>${deadline ? textToHtml(deadline) : '신청기한 정보가 없습니다. 공식 사이트에서 확인하세요.'}</p>

            <div class="policy-tool-cards">
${toolCardsHtml}
            </div>

            ${laws.length ? '<h2>근거 법령</h2>' + lawsHtml : ''}
${adsenseInArticleHtml}
            ${freshnessNote}
            <p style="margin-top:8px;"><a href="${esc(finalUrl)}" class="cta-link" rel="nofollow noopener" target="_blank" style="font-size:0.85rem;">정부24에서 신청하기 →</a></p>
          </div>
        </article>
      </div>
    </div>
  </main>

  <footer class="footer-simple">
    <div class="container footer-simple-inner">
      <span class="footer-copy">혜택on은 트리플20(Pixel Vibe)이 운영하는 무료 정보 서비스입니다.<br>
      대표자:&nbsp;박현봉 | 사업자등록번호:&nbsp;342-29-01302 | 문의:&nbsp;<a href="mailto:parkhb018@gmail.com">parkhb018@gmail.com</a><br>
      © 2026 혜택on, 본 사이트의 정보는 참고용이며, 정확한 내용은 정부24·복지로 등 공식 사이트에서 확인하세요.</span>
      <div class="footer-simple-links">
        <a href="about">사이트 소개</a>
        <a href="privacy">개인정보처리방침</a>
        <a href="contact">광고문의</a>
      </div>
    </div>
  </footer>
  <script src="../data/policy-loader.js?v=20260816"></script>
  <script src="../main.js?v=20260626"></script>
</body>
</html>
`;
}

/* ── 메인 ───────────────────────────────────────────────────── */

function main() {
  const rows = loadCsvRows();
  const genRows = rows.filter((r) => r.genFlag === '생성');
  console.log('CSV 생성 대상:', genRows.length, '건 (기대값 164)');

  const { detailMap, condMap } = loadJoinedMaps();
  const notes = loadNotes();

  let written = 0;
  const missing = [];
  genRows.forEach((row) => {
    const detail = detailMap.get(row.id);
    if (!detail) { missing.push(row.id + ' ' + row.name); return; }
    const cond = condMap.get(row.id) || null;
    const html = renderPage(row, detail, cond, notes);
    fs.writeFileSync(path.join(PAGES_DIR, 'policy-' + row.id + '.html'), html);
    written++;
  });

  console.log('생성 완료:', written, '개 파일');
  if (missing.length) {
    console.log('⚠ detail 조인 실패:', missing.length, '건');
    missing.forEach((m) => console.log('  - ' + m));
  }

  // policies.json detailUrl 채우기
  const policiesFile = path.join(DATA_DIR, 'policies.json');
  const policiesData = JSON.parse(fs.readFileSync(policiesFile, 'utf8'));
  const genIdSet = new Set(genRows.map((r) => r.id));
  let updated = 0;
  policiesData.policies.forEach((p) => {
    if (genIdSet.has(p.id)) {
      p.detailUrl = 'pages/policy-' + p.id;
      updated++;
    }
  });
  fs.writeFileSync(policiesFile, JSON.stringify(policiesData, null, 2) + '\n');
  console.log('policies.json detailUrl 갱신:', updated, '건');

  // policy-notes.json 생성 (없을 때만)
  const notesFile = path.join(DATA_DIR, 'policy-notes.json');
  if (!fs.existsSync(notesFile)) {
    fs.writeFileSync(notesFile, '{}\n');
    console.log('data/policy-notes.json 생성 (빈 객체)');
  } else {
    console.log('data/policy-notes.json 이미 존재, 건드리지 않음');
  }

  // sitemap.xml 동기화 — A등급(policy-notes.json 에 해설이 있는) 정책 상세 페이지만 등록한다.
  syncSitemapPolicyEntries(genRows, notes);
}

function syncSitemapPolicyEntries(genRows, notes) {
  if (!fs.existsSync(SITEMAP_FILE)) return;
  const genIdSet = new Set(genRows.map((r) => r.id));
  const aIds = genRows
    .map((r) => r.id)
    .filter((id) => genIdSet.has(id) && Object.prototype.hasOwnProperty.call(notes, id));

  let xml = fs.readFileSync(SITEMAP_FILE, 'utf8');
  const eol = /\r\n/.test(xml) ? '\r\n' : '\n';

  // 기존 policy- URL 블록 전부 제거 후, A등급만 다시 추가한다(등급이 바뀌어도 항상 정합).
  xml = xml.replace(/ {2}<url><loc>https:\/\/benefitson\.org\/pages\/policy-[^<]+<\/loc>[^\n]*<\/url>\r?\n/g, '');

  const today = new Date().toISOString().slice(0, 10);
  const newEntries = aIds
    .map((id) => '  <url><loc>' + SITE + '/pages/policy-' + id + '</loc><lastmod>' + today +
      '</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>' + eol)
    .join('');

  xml = xml.replace('</urlset>', newEntries + '</urlset>');
  fs.writeFileSync(SITEMAP_FILE, xml);
  console.log('sitemap.xml 정책 상세 페이지 동기화: A등급 ' + aIds.length + '건');
}

main();
