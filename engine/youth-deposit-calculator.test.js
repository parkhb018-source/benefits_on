// 서울시 청년 임차보증금 계산기 — 계산/자격조건 테스트
// 실행: node engine/youth-deposit-calculator.test.js
// 외부 의존성 없음(Node 내장 assert만 사용), 실제 data/youth-deposit-policy.json을 그대로 로드한다.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkEligibility, calculateLoan } from './youth-deposit-calculator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policy = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'data', 'youth-deposit-policy.json'), 'utf-8')
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

function baseInput(overrides = {}) {
  return {
    deposit: 200000000,
    age: 28,
    maritalStatus: 'single',
    income: 40000000,
    isHouseholder: true,
    monthlyRent: 0,
    ...overrides,
  };
}

// ── 계산: 대출한도 ──────────────────────────────────────

test('보증금의 90%가 2억원보다 작으면 90%가 한도', () => {
  const result = calculateLoan(baseInput({ deposit: 100000000 }), policy);
  assert.equal(result.estimatedMaxLoan, 90000000);
  assert.equal(result.requiredSelfFunds, 10000000);
});

test('보증금의 90%가 2억원을 넘으면 2억원으로 캡', () => {
  const result = calculateLoan(baseInput({ deposit: 300000000 }), policy);
  assert.equal(result.estimatedMaxLoan, 200000000);
  assert.equal(result.requiredSelfFunds, 100000000);
});

test('경계값: 보증금 × 90% = 정확히 2억원 (보증금 약 2.222억원)', () => {
  const deposit = 200000000 / 0.9; // 222,222,222.22...
  const result = calculateLoan(baseInput({ deposit }), policy);
  assert.equal(result.estimatedMaxLoan, 200000000);
});

test('경계값: 보증금 최소값(1원)에서도 계산 가능', () => {
  const result = calculateLoan(baseInput({ deposit: 1 }), policy);
  assert.ok(result.estimatedMaxLoan >= 0);
});

// ── 계산: 이자 ──────────────────────────────────────────

test('본인부담금리 = max(예시은행금리 - 서울시지원금리, 최저1%) = 1.94%', () => {
  const result = calculateLoan(baseInput(), policy);
  assert.ok(Math.abs(result.selfRate - 0.0194) < 1e-9);
});

test('예상 연간 이자 = 대출가능금액 × 본인부담금리', () => {
  const result = calculateLoan(baseInput({ deposit: 100000000 }), policy);
  // 대출가능금액 9천만원 × 1.94% = 1,746,000원
  assert.equal(result.annualInterest, 1746000);
});

test('예상 월 이자 = 연간이자 / 12', () => {
  const result = calculateLoan(baseInput({ deposit: 100000000 }), policy);
  assert.equal(result.monthlyInterest, Math.round(1746000 / 12));
});

// ── 자격조건: 나이 ──────────────────────────────────────

test('나이 경계값: 19세는 자격 충족', () => {
  const { eligible } = checkEligibility(baseInput({ age: 19 }), policy);
  assert.equal(eligible, true);
});

test('나이 경계값: 39세는 자격 충족', () => {
  const { eligible } = checkEligibility(baseInput({ age: 39 }), policy);
  assert.equal(eligible, true);
});

test('나이 경계값: 40세는 자격 미충족', () => {
  const { eligible, reasons } = checkEligibility(baseInput({ age: 40 }), policy);
  assert.equal(eligible, false);
  assert.ok(reasons.some((r) => r.includes('나이')));
});

test('나이 경계값: 18세는 자격 미충족', () => {
  const { eligible } = checkEligibility(baseInput({ age: 18 }), policy);
  assert.equal(eligible, false);
});

// ── 자격조건: 소득 ──────────────────────────────────────

test('미혼 소득 경계값: 정확히 5천만원은 자격 충족(이하 조건)', () => {
  const { eligible } = checkEligibility(baseInput({ income: 50000000 }), policy);
  assert.equal(eligible, true);
});

test('미혼 소득 경계값: 5천만원 초과는 자격 미충족', () => {
  const { eligible } = checkEligibility(baseInput({ income: 50000001 }), policy);
  assert.equal(eligible, false);
});

test('기혼 소득 경계값: 정확히 6천만원은 자격 충족(이하 조건)', () => {
  const { eligible } = checkEligibility(
    baseInput({ maritalStatus: 'married', income: 60000000 }),
    policy
  );
  assert.equal(eligible, true);
});

test('기혼 소득 경계값: 6천만원 초과는 자격 미충족', () => {
  const { eligible } = checkEligibility(
    baseInput({ maritalStatus: 'married', income: 60000001 }),
    policy
  );
  assert.equal(eligible, false);
});

// ── 자격조건: 보증금/월세/세대주 ────────────────────────

test('보증금 3억원은 자격 충족(이하 조건)', () => {
  const { eligible } = checkEligibility(baseInput({ deposit: 300000000 }), policy);
  assert.equal(eligible, true);
});

test('보증금 3억원 초과는 자격 미충족', () => {
  const { eligible } = checkEligibility(baseInput({ deposit: 300000001 }), policy);
  assert.equal(eligible, false);
});

test('월세 90만원은 자격 충족(이하 조건)', () => {
  const { eligible } = checkEligibility(baseInput({ monthlyRent: 900000 }), policy);
  assert.equal(eligible, true);
});

test('월세 90만원 초과는 자격 미충족', () => {
  const { eligible } = checkEligibility(baseInput({ monthlyRent: 900001 }), policy);
  assert.equal(eligible, false);
});

test('세대주가 아니면 자격 미충족', () => {
  const { eligible, reasons } = checkEligibility(baseInput({ isHouseholder: false }), policy);
  assert.equal(eligible, false);
  assert.ok(reasons.some((r) => r.includes('세대주')));
});

test('여러 조건 동시 미충족 시 모든 사유가 함께 반환됨', () => {
  const { eligible, reasons } = checkEligibility(
    baseInput({ age: 45, income: 99999999, isHouseholder: false }),
    policy
  );
  assert.equal(eligible, false);
  assert.equal(reasons.length, 3);
});

// ── 결과 요약 ────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
