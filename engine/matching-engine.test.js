// 판정 엔진 단위 테스트
// 실행: node engine/matching-engine.test.js

import assert from 'node:assert/strict';
import { match } from './matching-engine.js';

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

const ALWAYS = { always: true };

test('required 불일치 → null(제외)', () => {
  const profile = { age: 30 };
  const conditions = [{ type: 'age', op: 'between', value: [65, 120], required: true }];
  assert.equal(match(profile, conditions, ALWAYS), null);
});

test('between 경계값 — 시작 경계 일치', () => {
  const profile = { age: 65 };
  const conditions = [{ type: 'age', op: 'between', value: [65, 120], required: true }];
  const result = match(profile, conditions, ALWAYS);
  // 나이(required)만 있고 그 외 실질 제한이 없으므로 배지는 yellow — 경계값 자체는 일치(제외되지 않음, score=1).
  assert.notEqual(result, null);
  assert.equal(result.score, 1);
  assert.equal(result.level, 'yellow');
});

test('between 경계값 — 종료 경계 일치', () => {
  const profile = { age: 120 };
  const conditions = [{ type: 'age', op: 'between', value: [65, 120], required: true }];
  const result = match(profile, conditions, ALWAYS);
  assert.notEqual(result, null);
  assert.equal(result.score, 1);
  assert.equal(result.level, 'yellow');
});

test('between 경계값 — 경계 밖은 불일치', () => {
  const profile = { age: 121 };
  const conditions = [{ type: 'age', op: 'between', value: [65, 120], required: true }];
  assert.equal(match(profile, conditions, ALWAYS), null);
});

test('신청기간 미도래 → blue', () => {
  const profile = { age: 30 };
  const conditions = [];
  const period = { start: '2099-01-01', end: null, always: false };
  const result = match(profile, conditions, period, { today: '2026-09-12' });
  assert.equal(result.level, 'blue');
});

test('신청기간 종료 → null(제외)', () => {
  const profile = { age: 30 };
  const conditions = [];
  const period = { start: '2020-01-01', end: '2020-12-31', always: false };
  const result = match(profile, conditions, period, { today: '2026-09-12' });
  assert.equal(result, null);
});

test('always:true — optional 전부 일치 → green', () => {
  const profile = { age: 30, household: '1인가구' };
  const conditions = [
    { type: 'age', op: 'between', value: [20, 39], required: true },
    { type: 'household', op: 'in', value: ['1인가구'], required: false },
  ];
  const result = match(profile, conditions, ALWAYS);
  assert.equal(result.level, 'green');
  assert.equal(result.failed.length, 0);
});

test('always:true — optional 조건을 물어봤는데 불일치 → yellow, failed에 type 기록', () => {
  const profile = { age: 30, household: '부모님과 동거' }; // household를 물어봤지만 조건과 다름
  const conditions = [
    { type: 'age', op: 'between', value: [20, 39], required: true },
    { type: 'household', op: 'in', value: ['1인가구'], required: false },
  ];
  const result = match(profile, conditions, ALWAYS);
  assert.equal(result.level, 'yellow');
  assert.deepEqual(result.failed, ['household']);
});

test('maxLevel:yellow — green도 yellow로 하향', () => {
  const profile = { region: '경기', businessType: '소상공인' };
  const conditions = [
    { type: 'region', op: 'in', value: ['경기'], required: false },
    { type: 'businessType', op: 'in', value: ['소상공인'], required: false },
  ];
  const result = match(profile, conditions, ALWAYS, { maxLevel: 'yellow' });
  assert.equal(result.level, 'yellow');
});

test('maxLevel:yellow — 이미 yellow/blue는 그대로', () => {
  const profile = { region: '경기' };
  const conditions = [
    { type: 'region', op: 'in', value: ['경기'], required: false },
    { type: 'field', op: 'in', value: ['금융'], required: false },
  ];
  const result = match(profile, conditions, ALWAYS, { maxLevel: 'yellow' });
  assert.equal(result.level, 'yellow');
});

test('프로필에 없는 키(=안 물어본/모르는 type) → skip, 에러 없이 처리(실질 제한 일치가 없어 yellow)', () => {
  const profile = { region: '경기' };
  const conditions = [{ type: 'ㅁㅕㅈㄷㅇ이런타입은몰라', op: 'eq', value: 'x', required: false }];
  const result = match(profile, conditions, ALWAYS);
  assert.notEqual(result, null); // skip은 불일치가 아니므로 제외되지 않는다
  assert.equal(result.level, 'yellow'); // 다만 실질 제한이 일치한 것도 없으므로 green은 아니다
  assert.deepEqual(result.failed, []); // skip은 failed에 안 들어간다
});

test('안 물어본 항목이 있어도 green이 나온다 (물어본 항목만 전부 일치하면 충분)', () => {
  // incomeLevel은 profile에 없음(=자가진단이 소득을 안 물어봄) → 판정에서 제외되어야 한다.
  const profile = { age: 30, household: '1인가구' };
  const conditions = [
    { type: 'age', op: 'between', value: [20, 39], required: true },
    { type: 'household', op: 'in', value: ['1인가구'], required: false },
    { type: 'incomeLevel', op: 'in', value: ['중위0-50'], required: false },
  ];
  const result = match(profile, conditions, ALWAYS);
  assert.equal(result.level, 'green');
  assert.deepEqual(result.failed, []);
});

test('required 조건인데 프로필에 그 키가 없으면(안 물어봄) skip — 제외되지 않는다(단, 실질 제한 매칭이 없어 yellow)', () => {
  const profile = { age: 30 };
  const conditions = [{ type: 'region', op: 'in', value: ['경기'], required: true }];
  const result = match(profile, conditions, ALWAYS);
  assert.notEqual(result, null);
  assert.equal(result.level, 'yellow'); // required는 green 판단(나이 외 실질 제한)에서 제외된다
});

test('사장님 타입(region/businessType/field)도 엔진이 그대로 처리한다', () => {
  const profile = { region: '경기', businessType: '소상공인', field: ['금융', '경영'] };
  const conditions = [
    { type: 'region', op: 'in', value: ['경기'], required: false },
    { type: 'businessType', op: 'in', value: ['소상공인'], required: false },
    { type: 'field', op: 'in', value: ['금융'], required: false },
  ];
  const result = match(profile, conditions, ALWAYS);
  assert.equal(result.level, 'green');
  assert.equal(result.score, 3);
});

test('전부선택 조건(실질 제한 없음)은 일치해도 green 근거가 되지 않는다', () => {
  // household 조건이 전체 5개 선택지를 다 나열 → 사실상 누구나 통과, 실질 제한이 아니다.
  const profile = { age: 30, household: '1인가구' };
  const conditions = [
    { type: 'age', op: 'between', value: [20, 39], required: true },
    {
      type: 'household', op: 'in',
      value: ['1인가구', '다자녀가구', '한부모가정', '다문화가족', '무주택세대'],
      required: false,
    },
  ];
  const totalOptions = { household: 5 };
  const result = match(profile, conditions, ALWAYS, { totalOptions });
  assert.equal(result.level, 'yellow'); // 일치(ok)는 했지만 실질 제한이 아니므로 green이 아니다
  assert.equal(result.effectiveMatches, 0);
});

test('실질 제한(전체보다 적은 선택지)이 일치하면 green, effectiveMatches에 반영된다', () => {
  const profile = { age: 30, household: '1인가구' };
  const conditions = [
    { type: 'age', op: 'between', value: [20, 39], required: true },
    { type: 'household', op: 'in', value: ['1인가구', '다자녀가구'], required: false }, // 5개 중 2개만
  ];
  const totalOptions = { household: 5 };
  const result = match(profile, conditions, ALWAYS, { totalOptions });
  assert.equal(result.level, 'green');
  assert.equal(result.effectiveMatches, 1);
});

test('score는 일치한 조건 수(required+optional 합)', () => {
  const profile = { age: 30, household: '1인가구', employment: '무직·기타' };
  const conditions = [
    { type: 'age', op: 'between', value: [20, 39], required: true },
    { type: 'household', op: 'in', value: ['1인가구'], required: false },
    { type: 'employment', op: 'in', value: ['직장인'], required: false },
  ];
  const result = match(profile, conditions, ALWAYS);
  assert.equal(result.score, 2);
  assert.deepEqual(result.failed, ['employment']);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
