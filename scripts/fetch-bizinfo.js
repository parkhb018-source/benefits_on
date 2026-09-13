// scripts/fetch-bizinfo.js
// ─────────────────────────────────────────────────────
// 기업마당(bizinfo.go.kr) 지원사업 공고를 전량 수집해 data/biz-benefits.json 으로 저장한다.
// 사장님 자가진단(engine/matching-engine.js)이 읽는 조건 배열 형태로 가공한다.
//
// 실행: node scripts/fetch-bizinfo.js
// 키는 BIZINFO_CRTFC_KEY 환경변수(GitHub Actions) 또는 policy-explorer/.env(로컬)에서 읽는다.
// Node 표준 라이브러리만 사용(fetch는 Node 18+ 내장).

'use strict';

const fs = require('fs');
const path = require('path');
const { scoreItem, compareByScore } = require('../engine/biz-sort.js');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, 'policy-explorer', '.env');
const OUTPUT_PATH = path.join(ROOT, 'data', 'biz-benefits.json');
const API_ENDPOINT = 'https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do';

/** .env를 아주 단순하게 파싱한다(외부 dotenv 의존 없음). */
function readEnvKey(envPath, key) {
  const text = fs.readFileSync(envPath, 'utf-8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    if (k === key) return trimmed.slice(eq + 1).trim();
  }
  return null;
}

function getCrtfcKey() {
  if (process.env.BIZINFO_CRTFC_KEY) return process.env.BIZINFO_CRTFC_KEY;
  if (fs.existsSync(ENV_PATH)) {
    const key = readEnvKey(ENV_PATH, 'BIZINFO_CRTFC_KEY');
    if (key) return key;
  }
  throw new Error(
    'BIZINFO_CRTFC_KEY 를 찾을 수 없습니다. GitHub Actions 라면 Settings → Secrets and variables → ' +
    'Actions 에 BIZINFO_CRTFC_KEY 를 등록하세요. 로컬이라면 policy-explorer/.env 에 ' +
    'BIZINFO_CRTFC_KEY=... 를 추가하세요.'
  );
}

// ── 3장 지역 교정 규칙 ──────────────────────────────────
// hashtags 에 16개(=전체) 시·도 태그가 전부 붙어 있으면 다음 기준으로 교정한다.
//   소관기관이 지자체        → 그 지자체 전용으로 교정
//   소관기관이 중앙부처       → 진짜 전국(태그 그대로)
//   그 외                    → 태그 그대로(안전한 기본값)

const REGIONS = [
  '서울', '부산', '대구', '인천', '전남광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '경북', '경남', '제주',
];

// jrsdInsttNm(소관기관)에 그대로 등장하는 지자체 전체 명칭 → REGIONS 단축형.
const FULL_REGION_TO_SHORT = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천',
  '광주광역시': '전남광주', '전남광주통합특별시': '전남광주', '대전광역시': '대전',
  '울산광역시': '울산', '세종특별자치시': '세종', '경기도': '경기',
  '강원특별자치도': '강원', '충청북도': '충북', '충청남도': '충남',
  '전북특별자치도': '전북', '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주',
};
const FULL_REGION_NAMES = Object.keys(FULL_REGION_TO_SHORT);

/** 소관기관명이 지자체인지 판단한다. 이름에 '교육청'이 있거나 시·도 명칭으로 시작하면 지자체다.
 *  ('대전광역시교육청'처럼 '…청으로 끝남'만 보면 중앙부처로 오판되는 걸 막는다.) */
function isLocalAgency(agencyName) {
  if (!agencyName) return false;
  if (agencyName.includes('교육청')) return true;
  return FULL_REGION_NAMES.some((full) => agencyName.startsWith(full));
}

/** 소관기관명이 중앙부처(…부/청/처/위원회로 끝남)인지 판단한다. */
function isCentralAgency(agencyName) {
  return /(부|처|청|위원회)$/.test(agencyName || '');
}

/** hashtags 문자열에서 REGIONS 에 속하는 태그만 뽑는다. */
function extractRegionTags(hashtags) {
  const tags = (hashtags || '').split(',').map((s) => s.trim());
  return tags.filter((t) => REGIONS.includes(t));
}

/** 3장 규칙을 적용해 최종 region 배열과 교정 여부를 돌려준다. */
function resolveRegion(hashtags, agencyName) {
  const regionTags = extractRegionTags(hashtags);
  if (regionTags.length < REGIONS.length) {
    return { region: regionTags, regionFixed: false };
  }
  if (isLocalAgency(agencyName)) {
    const full = FULL_REGION_NAMES.find((f) => agencyName.startsWith(f));
    const short = FULL_REGION_TO_SHORT[full];
    return { region: [short], regionFixed: true };
  }
  if (isCentralAgency(agencyName)) {
    return { region: regionTags, regionFixed: false };
  }
  return { region: regionTags, regionFixed: false };
}

// ── 시·군·구 추출(표시 전용 — 조건 배열에는 넣지 않는다) ──────
const SIGUNGU_DENYLIST = new Set(['전시']);

function extractSigungu(hashtags) {
  const tags = (hashtags || '').split(',').map((s) => s.trim());
  for (const t of tags) {
    if (REGIONS.includes(t)) continue;
    if (FULL_REGION_NAMES.includes(t)) continue;
    if (SIGUNGU_DENYLIST.has(t)) continue;
    if (t.length >= 2 && t.length <= 6 && /(시|군|구)$/.test(t)) return t;
  }
  return null;
}

// ── 신청기간 파싱 ────────────────────────────────────
const DATE_RANGE_RE = /^(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})$/;

function parsePeriod(reqstBeginEndDe) {
  const raw = (reqstBeginEndDe || '').trim();
  const m = DATE_RANGE_RE.exec(raw);
  if (m) {
    return { raw, start: m[1], end: m[2], always: false };
  }
  return { raw, start: null, end: null, always: true };
}

// ── 사업개요 요약(HTML 제거 후 120자 이내) ──────────────
function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, maxLen) {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

/** API record → 엔진 조건 배열({type,op,value,required}).
 *  field(분야)는 뺐다 — engine/matching-engine.js 는 optional 이라도 "실질 제한" 조건이
 *  불일치하면 통째로 제외해버려서(89% 유실), 분야는 필터가 아니라 정렬 가중치(scoreItem)로만 쓴다. */
function buildConditions(record, region) {
  return [
    { type: 'region', op: 'in', value: region, required: true },
    { type: 'businessType', op: 'in', value: [record.trgetNm], required: true },
  ];
}

/** regionCount(=region 배열 길이) 기준 표시 라벨. 점수 계산에는 안 쓴다(표시 전용). */
function regionLabel(region) {
  if (region.length >= 12) return '전국';
  if (region.length === 1) return region[0];
  return `${region.length}개 지역`;
}

function buildItem(record) {
  const { region, regionFixed } = resolveRegion(record.hashtags, record.jrsdInsttNm);
  const summaryFull = stripHtml(record.bsnsSumryCn);
  return {
    id: record.pblancId,
    title: record.pblancNm,
    summary: truncate(summaryFull, 120),
    summaryLength: summaryFull.length,
    agency: record.jrsdInsttNm,
    fields: [record.pldirSportRealmLclasCodeNm],
    fieldMid: record.pldirSportRealmMlsfcCodeNm,
    sigungu: extractSigungu(record.hashtags),
    regionFixed,
    regionCount: region.length,
    regionLabel: regionLabel(region),
    conditions: buildConditions(record, region),
    period: parsePeriod(record.reqstBeginEndDe),
    applyUrl: record.pblancUrl,
    source: 'bizinfo',
  };
}

// 정렬 점수(scoreItem·compareByScore)는 engine/biz-sort.js 로 옮겼다 — 사장님 자가진단(main.js)이
// 같은 함수를 그대로 쓴다. 이 파일은 require 해서 그대로 재노출한다(module.exports, 아래).

async function fetchAll(crtfcKey) {
  const url = new URL(API_ENDPOINT);
  url.searchParams.set('crtfcKey', crtfcKey);
  url.searchParams.set('dataType', 'json');
  url.searchParams.set('searchCnt', '0');

  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  const items = Array.isArray(json.jsonArray) ? json.jsonArray : [];
  return items;
}

async function main() {
  const crtfcKey = getCrtfcKey();
  console.log('기업마당 API 조회 중…');
  const records = await fetchAll(crtfcKey);
  console.log(`수신 ${records.length}건`);

  const items = records.map(buildItem);

  const output = {
    updatedAt: new Date().toISOString().slice(0, 10),
    count: items.length,
    items,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`완료: ${items.length}건 저장 → ${path.relative(ROOT, OUTPUT_PATH)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('실패:', err.message);
    process.exit(1);
  });
}

module.exports = { scoreItem, compareByScore };
