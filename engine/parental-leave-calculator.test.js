// 육아휴직급여 계산기 — 계산/수급요건 테스트
// 실행: node engine/parental-leave-calculator.test.js
// 외부 의존성 없음(Node 내장 assert만 사용), 실제 data/parental-leave-policy.json을 그대로 로드한다.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { calcMonthlyBenefit, calcSchedule, checkEligibility } from './parental-leave-calculator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policy = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'data', 'parental-leave-policy.json'), 'utf-8')
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS: ' + name);
  } catch (err) {
    failed++;
    console.error('FAIL: ' + name);
    console.error('  ' + err.message);
  }
}

const MAN = 10000;
const amounts = (r) => r.schedule.map((row) => row.amount / MAN);

test('일반 12개월, 통상임금 300만원 → 250×3 + 200×3 + 160×6 = 2,310만원', () => {
  const r = calcSchedule({ ordinaryWage: 300 * MAN, months: 12, type: 'general' }, policy);
  assert.deepEqual(amounts(r), [250, 250, 250, 200, 200, 200, 160, 160, 160, 160, 160, 160]);
  assert.ok(r.schedule.every((row) => row.capApplied));
  assert.equal(r.total, 2310 * MAN);
});

test('6+6 6개월, 통상임금 300만원 → 250+250+300+300+300+300 = 1,700만원', () => {
  const r = calcSchedule({ ordinaryWage: 300 * MAN, months: 6, type: 'parents66' }, policy);
  assert.deepEqual(amounts(r), [250, 250, 300, 300, 300, 300]);
  assert.deepEqual(r.schedule.map((row) => row.capApplied), [true, true, false, false, false, false]);
  assert.equal(r.total, 1700 * MAN);
});

test('6+6 7개월차부터 일반 기준(80%, 상한 160만원)', () => {
  const row = calcMonthlyBenefit(7, 300 * MAN, 'parents66', policy);
  assert.equal(row.rate, 0.8);
  assert.equal(row.amount, 160 * MAN);
});

test('6+6 첫 6개월 최대치 합계 = 1인 최대 2,000만원 (월별 상한 합계와 일치)', () => {
  const r = calcSchedule({ ordinaryWage: 1000 * MAN, months: 6, type: 'parents66' }, policy);
  assert.equal(r.total, policy.parents66.perPersonMax);
  const capSum = policy.parents66.brackets.reduce((s, b) => s + b.cap, 0);
  assert.equal(capSum, policy.parents66.perPersonMax);
});

test('한부모 3개월, 통상임금 300만원 → 300×3 = 900만원 (상한 300만원 경계)', () => {
  const r = calcSchedule({ ordinaryWage: 300 * MAN, months: 3, type: 'singleParent' }, policy);
  assert.deepEqual(amounts(r), [300, 300, 300]);
  assert.ok(r.schedule.every((row) => !row.capApplied));
  assert.equal(r.total, 900 * MAN);
});

test('한부모 4개월차부터 일반 기준(상한 200만원)', () => {
  assert.equal(calcMonthlyBenefit(4, 300 * MAN, 'singleParent', policy).amount, 200 * MAN);
});

test('하한: 통상임금 50만원이어도 70만원 지급 (시행령 제95조 단서)', () => {
  const row = calcMonthlyBenefit(1, 50 * MAN, 'general', policy);
  assert.equal(row.amount, 70 * MAN);
  assert.equal(row.floorApplied, true);
});

test('하한: 7개월차 통상임금 80만원 × 80% = 64만원 → 70만원', () => {
  const row = calcMonthlyBenefit(7, 80 * MAN, 'general', policy);
  assert.equal(row.raw, 64 * MAN);
  assert.equal(row.amount, 70 * MAN);
});

test('개월 수 범위 밖(0, 19)은 예외', () => {
  assert.throws(() => calcSchedule({ ordinaryWage: 300 * MAN, months: 0, type: 'general' }, policy));
  assert.throws(() => calcSchedule({ ordinaryWage: 300 * MAN, months: 19, type: 'general' }, policy));
});

test('알 수 없는 유형은 예외', () => {
  assert.throws(() => calcMonthlyBenefit(1, 300 * MAN, 'unknown', policy));
});

test('수급요건: 180일·30일 충족', () => {
  assert.deepEqual(checkEligibility({ insuredDays: 180, leaveDays: 30 }, policy), { eligible: true, reasons: [] });
});

test('수급요건: 179일·29일 미충족 사유 2건', () => {
  const r = checkEligibility({ insuredDays: 179, leaveDays: 29 }, policy);
  assert.equal(r.eligible, false);
  assert.equal(r.reasons.length, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
