// 수수료 계산 보조 엔진 테스트
// 실행: node engine/fee-calc.test.js
// 외부 의존성 없음(Node 내장 assert만 사용).

import assert from 'node:assert/strict';
import { CARD_RATE_TIERS, DELIVERY_RATES, calcCardFee, calcDeliveryFee, sumFees } from './fee-calc.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// QA-FEE-01 3억 이하, 신용카드
test('QA-FEE-01 카드수수료 — 3억 이하, 월 4,500만원', () => {
  const r = calcCardFee({ tier: 'under3', cardSales: 45_000_000 });
  assert.equal(r.rate, 0.40);
  assert.equal(r.fee, 180_000);
  assert.equal(r.note, null);
});

// QA-FEE-02 3~5억
test('QA-FEE-02 카드수수료 — 3~5억, 월 1,000만원', () => {
  const r = calcCardFee({ tier: '3to5', cardSales: 10_000_000 });
  assert.equal(r.rate, 1.00);
  assert.equal(r.fee, 100_000);
});

// QA-FEE-03 30억 초과 — 계산하지 않고 안내만
test('QA-FEE-03 카드수수료 — 30억 초과는 계산하지 않음', () => {
  const r = calcCardFee({ tier: 'over30', cardSales: 500_000_000 });
  assert.equal(r.rate, null);
  assert.equal(r.fee, null);
  assert.match(r.note, /카드사와 협의한 요율/);
});

// QA-FEE-04 배달수수료 — 배민 단독
test('QA-FEE-04 배달수수료 — 배민 단독 300만원', () => {
  const r = calcDeliveryFee([{ platform: 'baemin', sales: 3_000_000 }]);
  assert.equal(r.perPlatform.length, 1);
  assert.equal(r.perPlatform[0].brokerage, 234_000);
  assert.equal(r.perPlatform[0].payment, 90_000);
  assert.equal(r.perPlatform[0].fee, 324_000);
  assert.equal(r.total, 324_000);
});

// QA-FEE-05 배달수수료 — 3사 합산
test('QA-FEE-05 배달수수료 — 배민·쿠팡이츠·요기요 합산', () => {
  const r = calcDeliveryFee([
    { platform: 'baemin', sales: 3_000_000 },
    { platform: 'coupangeats', sales: 2_000_000 },
    { platform: 'yogiyo', sales: 1_000_000 },
  ]);
  const baemin = r.perPlatform.find((p) => p.platform === 'baemin');
  const coupangeats = r.perPlatform.find((p) => p.platform === 'coupangeats');
  const yogiyo = r.perPlatform.find((p) => p.platform === 'yogiyo');
  assert.equal(baemin.fee, 324_000);
  assert.equal(coupangeats.fee, 216_000);
  assert.equal(yogiyo.fee, 127_000);
  assert.equal(r.total, 667_000);
});

// QA-FEE-06 카드 + 배달 합산 — 검증값: 배민 300만 + 요기요 100만 = 451,000
test('QA-FEE-06 카드+배달 합산', () => {
  const card = calcCardFee({ tier: 'under3', cardSales: 45_000_000 }); // 180,000
  const delivery = calcDeliveryFee([
    { platform: 'baemin', sales: 3_000_000 },
    { platform: 'yogiyo', sales: 1_000_000 },
  ]); // 451,000
  assert.equal(delivery.total, 451_000);
  assert.equal(sumFees({ card, delivery }), 631_000);
});

// QA-FEE-07 한쪽만 계산
test('QA-FEE-07 한쪽만 계산 — 배달만 / 카드만', () => {
  const delivery = calcDeliveryFee([{ platform: 'baemin', sales: 3_000_000 }]);
  assert.equal(sumFees({ card: null, delivery }), 324_000);

  const card = calcCardFee({ tier: 'under3', cardSales: 45_000_000 });
  assert.equal(sumFees({ card, delivery: null }), 180_000);
});

// QA-FEE-08 0원 입력
test('QA-FEE-08 0원 입력', () => {
  const card = calcCardFee({ tier: 'under3', cardSales: 0 });
  assert.equal(card.fee, 0);
  const delivery = calcDeliveryFee([{ platform: 'baemin', sales: 0 }]);
  assert.equal(delivery.perPlatform[0].fee, 0);
  assert.equal(delivery.total, 0);
  assert.equal(sumFees({ card, delivery }), 0);
  assert.equal(sumFees({}), 0);
});

// QA-FEE-09 30억 초과를 제외한 4개 구간 요율표가 요구사항과 일치하는지
test('QA-FEE-09 CARD_RATE_TIERS 요율표', () => {
  const byId = Object.fromEntries(CARD_RATE_TIERS.map((t) => [t.id, t]));
  assert.deepEqual([byId.under3.credit, byId.under3.check], [0.40, 0.15]);
  assert.deepEqual([byId['3to5'].credit, byId['3to5'].check], [1.00, 0.75]);
  assert.deepEqual([byId['5to10'].credit, byId['5to10'].check], [1.15, 0.90]);
  assert.deepEqual([byId['10to30'].credit, byId['10to30'].check], [1.45, 1.15]);
  assert.equal(byId.over30.credit, null);
});

// QA-FEE-10 DELIVERY_RATES 요율표
test('QA-FEE-10 DELIVERY_RATES 요율표', () => {
  assert.deepEqual([DELIVERY_RATES.baemin.brokerage, DELIVERY_RATES.baemin.payment], [7.8, 3.0]);
  assert.deepEqual([DELIVERY_RATES.coupangeats.brokerage, DELIVERY_RATES.coupangeats.payment], [7.8, 3.0]);
  assert.deepEqual([DELIVERY_RATES.yogiyo.brokerage, DELIVERY_RATES.yogiyo.payment], [9.7, 3.0]);
});

console.log(`\n${passed}개 통과`);
