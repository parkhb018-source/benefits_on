// scripts/fetch-conditions.js
// ─────────────────────────────────────────────────────
// data/policies.json에 있는 서비스ID만 골라 보조금24 v3 supportConditions API를 호출하고
// data/benefit-conditions.json(엔진이 읽는 조건 데이터)으로 저장한다.
//
// 실행: node scripts/fetch-conditions.js
// 키는 policy-explorer/.env 의 SUBSIDY_SERVICE_KEY 에서 읽는다(화면에 출력하지 않는다).
// Node 표준 라이브러리만 사용(fetch는 Node 18+ 내장).

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, 'policy-explorer', '.env');
const POLICIES_PATH = path.join(ROOT, 'data', 'policies.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'benefit-conditions.json');
const API_ENDPOINT = 'https://api.odcloud.kr/api/gov24/v3/supportConditions';
const REQUEST_DELAY_MS = 200;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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
  throw new Error(`${key} 를 ${envPath} 에서 찾을 수 없습니다`);
}

/** policies.json의 sourceUrl(.../dtlEx/{12자리})에서 서비스ID를 뽑는다. */
function extractServiceIds(policies) {
  const map = new Map(); // serviceId -> policy.id
  for (const p of policies) {
    const m = /\/dtlEx\/(\d{12})/.exec(p.sourceUrl || '');
    if (m) map.set(m[1], p.id);
  }
  return map;
}

async function fetchConditionByServiceId(serviceKey, serviceId, tries = 3) {
  const url = new URL(API_ENDPOINT);
  url.searchParams.set('page', '1');
  url.searchParams.set('perPage', '5');
  url.searchParams.set('returnType', 'JSON');
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('cond[서비스ID::EQ]', serviceId);

  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const data = Array.isArray(json.data) ? json.data : [];
      return data[0] || null;
    } catch (err) {
      lastErr = err;
      await delay(400 * i);
    }
  }
  throw lastErr;
}

// 생애주기 코드(JA0301~JA0330) 중 농림어촌 코드 — 이것만 Y인 정책은 자가진단에서 제외한다.
const FISHERY_LIFECYCLE_CODES = ['JA0313', 'JA0314', 'JA0315', 'JA0316'];

/** record의 JA03xx 코드가 전부(하나 이상) 농림어촌 코드뿐인지 판단한다. */
function isFisheryOnlyLifecycle(record) {
  const lifeCycleKeys = Object.keys(record).filter((k) => /^JA03\d\d$/.test(k));
  const yesKeys = lifeCycleKeys.filter((k) => record[k] === 'Y');
  return yesKeys.length > 0 && yesKeys.every((k) => FISHERY_LIFECYCLE_CODES.includes(k));
}

const HOUSEHOLD_CODE_MAP = {
  JA0404: '1인가구',
  JA0411: '다자녀가구',
  JA0403: '한부모가정',
  JA0401: '다문화가족',
  JA0412: '무주택세대',
};

// employment 후보: JA0326→직장인, JA0327→취업준비중·무직·기타(같은 코드가 두 값에 대응)
const EMPLOYMENT_CODE_MAP = {
  JA0326: ['직장인'],
  JA0327: ['취업준비중', '무직·기타'],
};

const INCOME_CODE_MAP = {
  JA0201: '중위0-50',
  JA0202: '중위51-75',
  JA0203: '중위76-100',
  JA0204: '중위101-200',
  JA0205: '중위200초과',
};

// ★ 사업자 코드는 이번에 변환하지 않는다. 다음 단계(사장님 자가진단)에서 businessType 조건으로 변환할 매핑만 남겨둔다.
//   JA1101 예비창업자 / JA1102 영업중 / JA1103 폐업예정
//   JA2101 중소기업   / JA2102 중견기업 / JA2103 소상공인
//   → { type: 'businessType', op: 'in', value: [...], required: false } 형태로 변환 예정

/** supportConditions record → 엔진 조건 배열({type,op,value,required}). */
function buildConditions(record) {
  const conditions = [];

  // age — 91%가 채워져 있다. 없으면 조건 자체를 넣지 않는다.
  if (record.JA0110 !== null && record.JA0110 !== undefined && record.JA0111 !== null && record.JA0111 !== undefined) {
    conditions.push({ type: 'age', op: 'between', value: [record.JA0110, record.JA0111], required: true });
  }

  const household = Object.keys(HOUSEHOLD_CODE_MAP)
    .filter((code) => record[code] === 'Y')
    .map((code) => HOUSEHOLD_CODE_MAP[code]);
  if (household.length > 0) {
    conditions.push({ type: 'household', op: 'in', value: [...new Set(household)], required: false });
  }

  const employment = Object.keys(EMPLOYMENT_CODE_MAP)
    .filter((code) => record[code] === 'Y')
    .flatMap((code) => EMPLOYMENT_CODE_MAP[code]);
  if (employment.length > 0) {
    conditions.push({ type: 'employment', op: 'in', value: [...new Set(employment)], required: false });
  }

  const incomeLevel = Object.keys(INCOME_CODE_MAP)
    .filter((code) => record[code] === 'Y')
    .map((code) => INCOME_CODE_MAP[code]);
  if (incomeLevel.length > 0) {
    conditions.push({ type: 'incomeLevel', op: 'in', value: [...new Set(incomeLevel)], required: false });
  }

  return conditions;
}

/** policies.json의 deadline → 신청기간 객체. */
function buildPeriod(deadline) {
  if (!deadline) return { raw: '예산 소진시까지', start: null, end: null, always: true };
  return { raw: deadline, start: null, end: deadline, always: false };
}

async function main() {
  const serviceKey = readEnvKey(ENV_PATH, 'SUBSIDY_SERVICE_KEY');
  const policiesData = JSON.parse(fs.readFileSync(POLICIES_PATH, 'utf-8'));
  const policies = policiesData.policies || [];
  const serviceIdToPolicyId = extractServiceIds(policies);
  const policyById = new Map(policies.map((p) => [p.id, p]));

  console.log(`대상 서비스ID ${serviceIdToPolicyId.size}건 조회 시작`);

  const conditions = {};
  let excluded = 0;
  let notFound = 0;
  let i = 0;

  for (const [serviceId, policyId] of serviceIdToPolicyId) {
    i += 1;
    process.stdout.write(`  · [${i}/${serviceIdToPolicyId.size}] ${policyId} … `);
    let record;
    try {
      record = await fetchConditionByServiceId(serviceKey, serviceId);
    } catch (err) {
      console.log(`실패(${err.message})`);
      continue;
    }

    if (!record) {
      notFound += 1;
      console.log('API에 없음');
      await delay(REQUEST_DELAY_MS);
      continue;
    }

    if (isFisheryOnlyLifecycle(record)) {
      excluded += 1;
      console.log('제외(농림어축 생애주기뿐)');
      await delay(REQUEST_DELAY_MS);
      continue;
    }

    const builtConditions = buildConditions(record);
    // 조건이 하나도 없으면(사업자 대상 등 개인 조건 코드가 전부 비어있음) 판정 근거가 없다 —
    // "판정 불가"를 "누구나 가능"으로 잘못 읽으면 안 되므로 저장하지 않는다(자가진단 결과에서 제외).
    if (builtConditions.length === 0) {
      excluded += 1;
      console.log('제외(개인 조건 없음 — 사업자 대상 등)');
      await delay(REQUEST_DELAY_MS);
      continue;
    }

    const policy = policyById.get(policyId);
    conditions[policyId] = {
      serviceId,
      conditions: builtConditions,
      period: buildPeriod(policy && policy.deadline),
    };
    console.log('완료');
    await delay(REQUEST_DELAY_MS);
  }

  const output = {
    meta: {
      lastUpdated: new Date().toISOString().slice(0, 10),
      source: API_ENDPOINT,
    },
    conditions,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(
    `\n완료: ${Object.keys(conditions).length}건 저장, 제외 ${excluded}건, API 미존재 ${notFound}건 → ${path.relative(ROOT, OUTPUT_PATH)}`
  );
}

main().catch((err) => {
  console.error('실패:', err.message);
  process.exit(1);
});
