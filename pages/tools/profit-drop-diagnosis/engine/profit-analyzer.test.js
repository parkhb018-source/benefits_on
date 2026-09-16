// 이익 변동 진단 — 계산 엔진 테스트
// 실행: node engine/profit-analyzer.test.js
// 외부 의존성 없음(Node 내장 assert만 사용).
// 기대값은 docs/03_QA_Test_Cases.md 의 시나리오를 그대로 따른다.

import assert from 'node:assert/strict';
import {
  normalizeInput, calculateProfit, calculateDelta, calculateImpacts, rankImpacts,
  analyze, formatWon,
} from './profit-analyzer.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

const period = (o) => ({ sales: 0, foodCost: 0, laborCost: 0, rent: 0, platformFee: 0, otherCost: 0, ...o });

function sumImpacts(a) {
  return a.rankedImpacts.reduce((s, i) => s + i.impact, 0);
}

// QA-01 이익 감소
test('QA-01 이익 감소', () => {
  const prev = period({ sales: 10_000_000, foodCost: 3_000_000, laborCost: 2_000_000, rent: 1_000_000, platformFee: 500_000, otherCost: 500_000 });
  const curr = period({ sales: 10_000_000, foodCost: 3_500_000, laborCost: 2_000_000, rent: 1_000_000, platformFee: 500_000, otherCost: 500_000 });
  const a = analyze(prev, curr);
  assert.equal(a.profitPrev, 3_000_000);
  assert.equal(a.profitCurr, 2_500_000);
  assert.equal(a.profitChange, -500_000);
  assert.equal(a.status.id, 'DECREASE');
  assert.match(a.headline, /이번 달 이익이 지난달보다 500,000원 줄었습니다/);
  assert.equal(sumImpacts(a), a.profitChange);
});

// QA-02 이익 증가
test('QA-02 이익 증가', () => {
  const prev = period({ sales: 10_000_000, foodCost: 3_500_000, laborCost: 2_000_000 });
  const curr = period({ sales: 10_000_000, foodCost: 3_000_000, laborCost: 2_000_000 });
  const a = analyze(prev, curr);
  assert.equal(a.profitChange, 500_000);
  assert.equal(a.status.id, 'INCREASE');
  assert.match(a.headline, /이번 달 이익이 지난달보다 500,000원 늘었습니다/);
});

// QA-03 완전 동일: 이익도 항목도 전부 동일
test('QA-03 완전 동일', () => {
  const p = period({ sales: 10_000_000, foodCost: 3_000_000, laborCost: 2_000_000 });
  const a = analyze(p, { ...p });
  assert.equal(a.profitChange, 0);
  assert.equal(a.status.id, 'SAME');
  assert.equal(a.headline, '지난달과 이번 달 이익이 같습니다.');
});

// QA-04 이익은 같지만 항목은 변화
test('QA-04 이익 동일, 항목 변화', () => {
  const prev = period({ sales: 10_000_000, foodCost: 3_000_000, laborCost: 2_000_000 });
  const curr = period({ sales: 10_000_000, foodCost: 3_200_000, laborCost: 1_800_000 });
  const a = analyze(prev, curr);
  assert.equal(a.profitChange, 0);
  assert.equal(a.status.id, 'SAME_ITEMS_CHANGED');
  assert.match(a.headline, /^이익은 지난달과 같지만, 항목별로는 변화가 있었습니다\./);
});

// QA-05 전월 양수 → 이번 달 0 (발생 안 함)
test('QA-05 전월 양수 → 이번 달 0', () => {
  const prev = period({ sales: 10_000_000, foodCost: 3_000_000, platformFee: 300_000 });
  const curr = period({ sales: 10_000_000, foodCost: 3_000_000, platformFee: 0 });
  const a = analyze(prev, curr);
  const feeImpact = a.rankedImpacts.find((i) => i.key === 'platformFee');
  assert.equal(feeImpact.note, '지난달 300,000원 → 이번 달 0원 (이번 달엔 발생하지 않음)');
});

// QA-06 두 항목이 정확히 같은 절대 영향액 → 타이브레이크
test('QA-06 동점 타이브레이크', () => {
  // platformFee, rent 모두 100,000원만큼 비용 증가(영향 -100,000으로 동점) → 타이브레이크상 수수료가 먼저
  const prev = period({ sales: 10_000_000, rent: 1_000_000, platformFee: 500_000 });
  const curr = period({ sales: 10_000_000, rent: 1_100_000, platformFee: 600_000 });
  const a = analyze(prev, curr);
  const top2 = a.rankedImpacts.slice(0, 2).map((i) => i.key);
  assert.deepEqual(top2, ['platformFee', 'rent']);
});

// QA-07 전월 0 → 이번 달 양수 (신규 발생)
test('QA-07 신규 발생', () => {
  const prev = period({ sales: 10_000_000, foodCost: 3_000_000 });
  const curr = period({ sales: 10_000_000, foodCost: 3_000_000, otherCost: 200_000 });
  const a = analyze(prev, curr);
  const otherImpact = a.rankedImpacts.find((i) => i.key === 'otherCost');
  assert.equal(otherImpact.note, '지난달 0원 → 이번 달 200,000원 (신규 발생)');
});

// QA-08 적자 축소
test('QA-08 적자 축소', () => {
  const prev = period({ sales: 5_000_000, foodCost: 3_000_000, laborCost: 3_000_000 }); // profit -1,000,000
  const curr = period({ sales: 5_000_000, foodCost: 3_000_000, laborCost: 2_500_000 }); // profit -500,000
  const a = analyze(prev, curr);
  assert.equal(a.profitPrev, -1_000_000);
  assert.equal(a.profitCurr, -500_000);
  assert.equal(a.status.id, 'DEFICIT_REDUCED');
  assert.match(a.headline, /^적자 규모가 500,000원 줄었습니다\./);
});

// QA-09 적자 전환
test('QA-09 적자 전환', () => {
  const prev = period({ sales: 5_000_000, foodCost: 3_000_000, laborCost: 1_500_000 }); // profit +500,000
  const curr = period({ sales: 5_000_000, foodCost: 3_000_000, laborCost: 2_500_000 }); // profit -500,000
  const a = analyze(prev, curr);
  assert.equal(a.status.id, 'DEFICIT_FLIP');
  assert.match(a.headline, /^이번 달 적자로 전환되었습니다\./);
});

// QA-10 전부 0
test('QA-10 전부 0', () => {
  const a = analyze(period({}), period({}));
  assert.equal(a.status.id, 'ALL_ZERO');
  assert.equal(a.headline, '비교할 숫자가 없습니다.');
});

// QA-11 쉼표·원화기호 입력 normalize
test('QA-11 쉼표·원화기호 normalize', () => {
  const n = normalizeInput({ sales: '10,000,000원', foodCost: '3,000,000' });
  assert.equal(n.sales, 10_000_000);
  assert.equal(n.foodCost, 3_000_000);
});

// QA-12 소수점 반올림
test('QA-12 소수점 반올림', () => {
  const n = normalizeInput({ sales: 1000.4, foodCost: 1000.5 });
  assert.equal(n.sales, 1000);
  assert.equal(n.foodCost, 1001);
});

// QA-13 안전정수 초과는 에러
test('QA-13 안전정수 초과 에러', () => {
  assert.throws(() => normalizeInput({ sales: Number.MAX_SAFE_INTEGER + 10 }), RangeError);
});

// QA-14 영향 합계 == 이익 증감 (항등식)
test('QA-14 영향 합계 항등식', () => {
  const prev = period({ sales: 12_345_000, foodCost: 4_321_000, laborCost: 2_000_000, rent: 1_000_000, platformFee: 300_000, otherCost: 100_000 });
  const curr = period({ sales: 11_000_000, foodCost: 4_500_000, laborCost: 2_100_000, rent: 1_000_000, platformFee: 250_000, otherCost: 150_000 });
  const a = analyze(prev, curr);
  assert.equal(sumImpacts(a), a.profitChange);
});

// QA-15 필수 검증 케이스 (기획문서 예시)
test('QA-15 기획문서 검증 케이스', () => {
  const prev = period({ sales: 30_000_000, foodCost: 11_000_000, laborCost: 7_000_000, rent: 3_000_000, platformFee: 2_000_000, otherCost: 3_000_000 });
  const curr = period({ sales: 30_000_000, foodCost: 12_500_000, laborCost: 7_800_000, rent: 3_000_000, platformFee: 2_100_000, otherCost: 3_100_000 });
  const a = analyze(prev, curr);
  assert.equal(a.profitPrev, 4_000_000);
  assert.equal(a.profitCurr, 1_500_000);
  assert.equal(a.profitChange, -2_500_000);
  const top = a.rankedImpacts[0];
  assert.equal(top.key, 'foodCost');
  assert.equal(top.impact, -1_500_000);
  const orderedKeys = a.rankedImpacts.map((i) => i.key);
  assert.deepEqual(orderedKeys.slice(0, 4), ['foodCost', 'laborCost', 'platformFee', 'otherCost']);
  assert.equal(sumImpacts(a), -2_500_000);
});

console.log(`\n${passed} passed`);
