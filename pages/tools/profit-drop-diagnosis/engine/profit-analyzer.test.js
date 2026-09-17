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
  assert.equal(a.status, 'PROFIT_DOWN');
  assert.equal(a.heroLabel, '이익 변동');
  assert.equal(a.heroAmount, -500_000);
  assert.equal(a.headline, '이번 달 이익이 지난달보다 500,000원 줄었습니다.');
  assert.equal(a.topImpactLine, '이익 변동에 가장 큰 영향을 준 항목은 500,000원 변화한 식재료비입니다.');
  assert.match(a.notCauseLine, /원인이다.*뜻이 아니라/);
  assert.equal(sumImpacts(a), a.profitChange);
});

// QA-02 이익 증가
test('QA-02 이익 증가', () => {
  const prev = period({ sales: 10_000_000, foodCost: 3_500_000, laborCost: 2_000_000 });
  const curr = period({ sales: 10_000_000, foodCost: 3_000_000, laborCost: 2_000_000 });
  const a = analyze(prev, curr);
  assert.equal(a.profitChange, 500_000);
  assert.equal(a.status, 'PROFIT_UP');
  assert.equal(a.headline, '이번 달 이익이 지난달보다 500,000원 늘었습니다.');
});

// QA-03 완전 동일: 이익도 항목도 전부 동일
test('QA-03 완전 동일', () => {
  const p = period({ sales: 10_000_000, foodCost: 3_000_000, laborCost: 2_000_000 });
  const a = analyze(p, { ...p });
  assert.equal(a.profitChange, 0);
  assert.equal(a.status, 'PROFIT_SAME');
  assert.equal(a.headline, '지난달과 이번 달 이익이 같습니다.');
  assert.equal(a.topImpactLine, '');
  assert.equal(a.notCauseLine, '항목별 변화가 없어 순위를 매길 수 없습니다.');
});

// QA-04 이익은 같지만 항목은 변화
test('QA-04 이익 동일, 항목 변화', () => {
  const prev = period({ sales: 10_000_000, foodCost: 3_000_000, laborCost: 2_000_000 });
  const curr = period({ sales: 10_000_000, foodCost: 3_200_000, laborCost: 1_800_000 });
  const a = analyze(prev, curr);
  assert.equal(a.profitChange, 0);
  assert.equal(a.status, 'PROFIT_SAME_BUT_ITEMS_CHANGED');
  assert.equal(a.headline, '이익은 지난달과 같지만, 항목별로는 변화가 있었습니다.');
  assert.notEqual(a.topImpactLine, '');
  assert.equal(a.rankedImpacts[0].id, 'foodCost'); // 동점(200,000) 타이브레이크상 식재료비 먼저
});

// QA-05 전월 양수 → 이번 달 0 (발생 안 함)
test('QA-05 전월 양수 → 이번 달 0', () => {
  const prev = period({ sales: 10_000_000, foodCost: 3_000_000, platformFee: 300_000 });
  const curr = period({ sales: 10_000_000, foodCost: 3_000_000, platformFee: 0 });
  const a = analyze(prev, curr);
  const feeImpact = a.rankedImpacts.find((i) => i.id === 'platformFee');
  assert.equal(feeImpact.flag, 'COST_ENDED');
  assert.equal(feeImpact.prev, 300_000);
  assert.equal(feeImpact.curr, 0);
});

// QA-06 두 항목이 정확히 같은 절대 영향액 → 타이브레이크
test('QA-06 동점 타이브레이크', () => {
  // platformFee, rent 모두 100,000원만큼 비용 증가(영향 -100,000으로 동점) → 타이브레이크상 수수료가 먼저
  const prev = period({ sales: 10_000_000, rent: 1_000_000, platformFee: 500_000 });
  const curr = period({ sales: 10_000_000, rent: 1_100_000, platformFee: 600_000 });
  const a = analyze(prev, curr);
  const top2 = a.rankedImpacts.slice(0, 2).map((i) => i.id);
  assert.deepEqual(top2, ['platformFee', 'rent']);
});

// QA-07 전월 0 → 이번 달 양수 (신규 발생)
test('QA-07 신규 발생', () => {
  const prev = period({ sales: 10_000_000, foodCost: 3_000_000 });
  const curr = period({ sales: 10_000_000, foodCost: 3_000_000, otherCost: 200_000 });
  const a = analyze(prev, curr);
  const otherImpact = a.rankedImpacts.find((i) => i.id === 'otherCost');
  assert.equal(otherImpact.flag, 'NEW_COST');
  assert.equal(otherImpact.prev, 0);
  assert.equal(otherImpact.curr, 200_000);
});

// QA-08 적자 축소: status enum 은 PROFIT_UP 으로 통합되지만, headline 은 여전히 적자라는
// 사실을 숨기지 않아야 한다(둘 다 음수 + 증가 → "적자 규모가 ~ 줄었습니다").
test('QA-08 적자 축소 → PROFIT_UP, 문구는 "적자 규모가 줄었습니다"', () => {
  const prev = period({ sales: 5_000_000, foodCost: 3_000_000, laborCost: 3_000_000 }); // profit -1,000,000
  const curr = period({ sales: 5_000_000, foodCost: 3_000_000, laborCost: 2_500_000 }); // profit -500,000
  const a = analyze(prev, curr);
  assert.equal(a.profitPrev, -1_000_000);
  assert.equal(a.profitCurr, -500_000);
  assert.equal(a.profitChange, 500_000);
  assert.equal(a.status, 'PROFIT_UP');
  assert.equal(a.headline, '적자 규모가 500,000원 줄었습니다.');
});

// QA-08b 사용자 제시 예시: 지난달 -300만 → 이번 달 -100만
test('QA-08b 적자 축소(사용자 예시, -300만→-100만)', () => {
  const prev = period({ sales: 2_000_000, foodCost: 5_000_000 }); // profit -3,000,000
  const curr = period({ sales: 2_000_000, foodCost: 3_000_000 }); // profit -1,000,000
  const a = analyze(prev, curr);
  assert.equal(a.profitPrev, -3_000_000);
  assert.equal(a.profitCurr, -1_000_000);
  assert.equal(a.profitChange, 2_000_000);
  assert.equal(a.status, 'PROFIT_UP');
  assert.equal(a.headline, '적자 규모가 2,000,000원 줄었습니다.');
});

// QA-09 적자 전환: status enum 은 PROFIT_DOWN 으로 통합되지만, headline 은 흑자였다가
// 적자로 넘어갔다는 사실을 알려야 한다("이번 달 적자로 전환되었습니다").
test('QA-09 적자 전환 → PROFIT_DOWN, 문구는 "적자로 전환되었습니다"', () => {
  const prev = period({ sales: 5_000_000, foodCost: 3_000_000, laborCost: 1_500_000 }); // profit +500,000
  const curr = period({ sales: 5_000_000, foodCost: 3_000_000, laborCost: 2_500_000 }); // profit -500,000
  const a = analyze(prev, curr);
  assert.equal(a.profitChange, -1_000_000);
  assert.equal(a.status, 'PROFIT_DOWN');
  assert.equal(a.headline, '이번 달 적자로 전환되었습니다.');
});

// QA-09b 사용자 제시 예시: 지난달 +100만 → 이번 달 -50만
test('QA-09b 적자 전환(사용자 예시, +100만→-50만)', () => {
  const prev = period({ sales: 5_000_000, foodCost: 4_000_000 }); // profit +1,000,000
  const curr = period({ sales: 5_000_000, foodCost: 5_500_000 }); // profit -500,000
  const a = analyze(prev, curr);
  assert.equal(a.profitPrev, 1_000_000);
  assert.equal(a.profitCurr, -500_000);
  assert.equal(a.profitChange, -1_500_000);
  assert.equal(a.status, 'PROFIT_DOWN');
  assert.equal(a.headline, '이번 달 적자로 전환되었습니다.');
});

// QA-09c 적자가 더 깊어지는 경우(전환도 축소도 아님)는 일반 감소 문구 그대로
test('QA-09c 적자 심화는 일반 감소 문구', () => {
  const prev = period({ sales: 2_000_000, foodCost: 3_000_000 }); // profit -1,000,000
  const curr = period({ sales: 2_000_000, foodCost: 4_000_000 }); // profit -2,000,000
  const a = analyze(prev, curr);
  assert.equal(a.status, 'PROFIT_DOWN');
  assert.equal(a.headline, '이번 달 이익이 지난달보다 1,000,000원 줄었습니다.');
});

// QA-10 전부 0
test('QA-10 전부 0', () => {
  const a = analyze(period({}), period({}));
  assert.equal(a.status, 'NO_DATA');
  assert.equal(a.headline, '비교할 숫자가 없습니다.');
  assert.equal(a.topImpactLine, '');
  assert.equal(a.notCauseLine, '');
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

// QA-15 필수 검증 케이스 (기획문서 예시) — 개편 전과 수치가 100% 동일해야 한다
test('QA-15 기획문서 검증 케이스', () => {
  const prev = period({ sales: 30_000_000, foodCost: 11_000_000, laborCost: 7_000_000, rent: 3_000_000, platformFee: 2_000_000, otherCost: 3_000_000 });
  const curr = period({ sales: 30_000_000, foodCost: 12_500_000, laborCost: 7_800_000, rent: 3_000_000, platformFee: 2_100_000, otherCost: 3_100_000 });
  const a = analyze(prev, curr);
  assert.equal(a.profitPrev, 4_000_000);
  assert.equal(a.profitCurr, 1_500_000);
  assert.equal(a.profitChange, -2_500_000);
  assert.equal(a.status, 'PROFIT_DOWN');
  const top = a.rankedImpacts[0];
  assert.equal(top.id, 'foodCost');
  assert.equal(top.impact, -1_500_000);
  const orderedIds = a.rankedImpacts.map((i) => i.id);
  assert.deepEqual(orderedIds.slice(0, 4), ['foodCost', 'laborCost', 'platformFee', 'otherCost']);
  assert.equal(sumImpacts(a), -2_500_000);
  assert.equal(a.topImpactLine, '이익 변동에 가장 큰 영향을 준 항목은 1,500,000원 변화한 식재료비입니다.');
});

console.log(`\n${passed} passed`);
