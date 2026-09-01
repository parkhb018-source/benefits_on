// 사업 생존기간 계산기 — 계산 엔진 테스트
// 실행: node engine/survival-calculator.test.js
// 외부 의존성 없음(Node 내장 assert만 사용).
// 기대값은 docs/03_QA_Test_Cases.md 의 시나리오를 그대로 따른다.

import assert from 'node:assert/strict';
import {
  monthlyCashFlow, survivalMonths, analyze, buildScenarios,
  evaluateStatus, monthsToText,
} from './survival-calculator.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

const base = (o) => ({ cash: 0, revenue: 0, variable: 0, fixed: 0, other: 0, minReserve: 0, ...o });

// QA-01 정상: 12.5개월 → 적자이므로 주의 (생존기간 24개월 미만)
test('QA-01 정상 케이스', () => {
  const input = base({ cash: 30_000_000, revenue: 10_000_000, variable: 4_000_000, fixed: 7_000_000, other: 1_000_000, minReserve: 5_000_000 });
  const a = analyze(input);
  assert.equal(a.monthlyCashFlow, -2_000_000);
  assert.equal(a.survival.months, 12.5);
  assert.equal(monthsToText(a.survival.months), '약 12개월 15일');
  assert.equal(evaluateStatus(a.survival).id, 'SURV-002');
});

// QA-02 주의: 7.5개월
test('QA-02 주의 케이스', () => {
  const a = analyze(base({ cash: 20_000_000, revenue: 10_000_000, variable: 4_000_000, fixed: 7_000_000, other: 1_000_000, minReserve: 5_000_000 }));
  assert.equal(a.survival.months, 7.5);
  assert.equal(evaluateStatus(a.survival).id, 'SURV-002');
});

// QA-03 흑자: 현금 감소 없음
test('QA-03 흑자 케이스', () => {
  const a = analyze(base({ cash: 10_000_000, revenue: 10_000_000, variable: 3_000_000, fixed: 3_000_000, other: 1_000_000 }));
  assert.equal(a.survival.infinite, true);
  assert.equal(evaluateStatus(a.survival).id, 'SURV-001');
});

// QA-04 최소 유지 현금 이하
test('QA-04 belowReserve', () => {
  const a = analyze(base({ cash: 3_000_000, revenue: 1_000_000, fixed: 2_000_000, minReserve: 5_000_000 }));
  assert.equal(a.survival.belowReserve, true);
  assert.equal(evaluateStatus(a.survival).id, 'SURV-005');
});

// QA-05 120개월 상한 — 적자이므로 상한에 걸려도 "주의"
test('QA-05 상한 절삭', () => {
  const a = analyze(base({ cash: 999_999_999_999, revenue: 1_000_000, fixed: 1_000_001, minReserve: 0 }));
  assert.equal(a.survival.capped, true);
  assert.equal(a.survival.months, 120);
  assert.equal(monthsToText(a.survival.months), '10년(120개월) 이상');
  assert.equal(evaluateStatus(a.survival).id, 'SURV-002');
});

// QA-06 상태 경계: 흑자 → 안정 / 적자는 생존기간과 무관하게 최대 "주의"
test('QA-06 적자면 최대 주의', () => {
  const s2 = analyze(base({ cash: 2_000_000, fixed: 1_000_000 })).survival;   // 2개월
  const s3 = analyze(base({ cash: 3_000_000, fixed: 1_000_000 })).survival;   // 3개월
  const s6 = analyze(base({ cash: 6_000_000, fixed: 1_000_000 })).survival;   // 6개월
  const sLong = analyze(base({ cash: 80_000_000, fixed: 1_000_000 })).survival; // 80개월(적자)
  const sProfit = analyze(base({ cash: 1_000_000, revenue: 2_000_000, fixed: 1_000_000 })).survival; // 흑자
  assert.equal(evaluateStatus(s2).id, 'SURV-004');     // 3개월 미만 → 위험
  assert.equal(evaluateStatus(s3).id, 'SURV-003');     // 3~6개월 → 경고
  assert.equal(evaluateStatus(s6).id, 'SURV-002');     // 6개월 이상 → 주의
  assert.equal(evaluateStatus(sLong).id, 'SURV-002');  // 80개월이어도 적자 → 주의
  assert.equal(evaluateStatus(sProfit).id, 'SURV-001');// 흑자 → 안정
});

// QA-07 시나리오: 6행, 변동비율 유지
test('QA-07 시나리오 생성', () => {
  const input = base({ cash: 30_000_000, revenue: 10_000_000, variable: 4_000_000, fixed: 7_000_000, other: 1_000_000 });
  const rows = buildScenarios(input);
  assert.equal(rows.length, 6);
  const rev10 = rows.find((r) => r.id === 'REV-10');
  assert.equal(rev10.input.revenue, 9_000_000);
  assert.equal(rev10.input.variable, 3_600_000); // 40% 비율 유지
  const fix20 = rows.find((r) => r.id === 'FIX-20');
  assert.equal(fix20.input.fixed, 5_600_000);
});

// QA-08 monthlyCashFlow 순수 산식
test('QA-08 월 현금흐름 산식', () => {
  assert.equal(monthlyCashFlow({ revenue: 100, variable: 10, fixed: 20, other: 5 }), 65);
});

console.log(`\n${passed} passed`);
