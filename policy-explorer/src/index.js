/**
 * index.js — 오케스트레이션
 * ─────────────────────────────────────────────────────────
 * 실행: node src/index.js   (policy-explorer 폴더에서)
 *   1) config.json 로드
 *   2) fetch  → 보조금24 API 수집
 *   3) transform → 혜택on import 스키마
 *   4) (옵션) 기존 policies.json의 제목과 중복 제외
 *   5) output/import-policies.json 저장 + 요약 출력
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { fetchPolicies } = require('./fetch');
const { transform } = require('./transform');
const { filterCurrent } = require('./filter');

const ROOT = path.join(__dirname, '..');

// .env 로드 (추가 설치 없이 KEY=VALUE 형식만 파싱). 이미 설정된 환경변수는 유지.
function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && line.trim()[0] !== '#' && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

function loadConfig() {
  const p = path.join(ROOT, 'config.json');
  if (!fs.existsSync(p)) {
    console.error('✗ config.json이 없습니다. config.example.json을 복사해 설정을 채우세요.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/** 기존 혜택on policies.json의 제목 집합(정규화) */
function loadExistingTitles(relPath) {
  if (!relPath) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf-8'));
    const list = (data && data.policies) || [];
    return new Set(list.map((p) => norm(p.title)));
  } catch (e) {
    console.warn('  (기존 policies.json을 못 읽어 중복 제외를 건너뜁니다)');
    return new Set();
  }
}

// 제목 정규화(중복 판정 키). ⚠️ admin/index.html 의 bulkNorm() 과 동일하게 유지할 것.
const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

async function main() {
  loadEnv(path.join(ROOT, '.env'));
  const config = loadConfig();
  config.serviceKey = process.env.SUBSIDY_SERVICE_KEY;

  if (!config.serviceKey || /여기에|PUT-YOUR/.test(config.serviceKey)) {
    console.error('✗ 인증키가 없습니다. .env 파일에 SUBSIDY_SERVICE_KEY=발급받은키 를 넣어주세요. (.env.example 참고)');
    process.exit(1);
  }

  console.log('▶ 보조금24 수집 시작…');
  const raw = await fetchPolicies(config);
  console.log(`▶ 수집 완료: 원시 ${raw.length}건`);

  let items = transform(raw, config.fieldMap);

  // 최신성 필터: 마감 지난 / 제목이 옛 연도인 정책 제외 (신호별 건수 로깅)
  const today = new Date().toISOString().slice(0, 10);
  if (config.filter && config.filter.dropPastDeadline) {
    const b = items.length;
    items = filterCurrent(items, { dropPastDeadline: true }, today);
    console.log(`  · 마감 지난 정책 ${b - items.length}건 제외`);
  }
  if (config.filter && config.filter.dropOldYearInTitle) {
    const b = items.length;
    items = filterCurrent(items, { dropOldYearInTitle: true }, today);
    console.log(`  · 제목의 옛 연도 정책 ${b - items.length}건 제외`);
  }

  // 무관 분야 필터: 혜택on 6분류에 안 맞는 항목(미분류) 제외
  if (config.excludeUnclassified) {
    const b = items.length;
    items = items.filter((it) => it.category !== '미분류');
    console.log(`  · 무관 분야(미분류) ${b - items.length}건 제외`);
  }

  const existing = loadExistingTitles(config.excludeExistingFrom);
  const beforeDedup = items.length;
  if (existing.size) items = items.filter((it) => !existing.has(norm(it.title)));

  const unclassified = items.filter((it) => it.category === '미분류').length;

  const outPath = path.join(ROOT, config.outputFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(items, null, 2), 'utf-8');

  console.log('─'.repeat(40));
  console.log(`✓ 저장: ${config.outputFile}`);
  console.log(`  변환 ${beforeDedup}건 → 신규 ${items.length}건 (기존 중복 ${beforeDedup - items.length} 제외)`);
  console.log(`  미분류 ${unclassified}건 (혜택on 가져오기에서 카테고리 보정 필요)`);
  console.log('다음: 이 파일을 혜택on 관리자 "일괄 가져오기"에 업로드하세요.');
}

main().catch((err) => {
  console.error('✗ 실행 오류:', err.message);
  process.exit(1);
});
