// 신고 전 체크리스트 노출 규칙 시험 — 실행: node --test tests/review-helper/report-gate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldShowChecklist } from '../../pages/tools/review-helper/js/report-gate.js';

const types = JSON.parse(readFileSync(new URL('../../data/review-helper/types.json', import.meta.url), 'utf8'));
const SHOWN = ['T06', 'T12', 'T13'];
const HIDDEN = ['T01', 'T02', 'T03', 'T04', 'T05', 'T07', 'T08', 'T09', 'T10', 'T11', 'T14', 'T15'];

test('신고 검토 대상 유형(T06·T12·T13)은 보인다', () => {
  for (const id of SHOWN) assert.equal(shouldShowChecklist(id, false, types), true, id);
});

test('그 밖의 유형과 미분류는 숨긴다', () => {
  for (const id of HIDDEN) assert.equal(shouldShowChecklist(id, false, types), false, id);
  assert.equal(shouldShowChecklist(null, false, types), false, 'null');
  assert.equal(shouldShowChecklist('T99', false, types), false, '없는 유형');
});

test('욕설·비방이 감지되면 어떤 유형이든 보인다', () => {
  for (const id of [...SHOWN, ...HIDDEN, null]) assert.equal(shouldShowChecklist(id, true, types), true, String(id));
});

test('목록이 비어 있거나 키가 없으면 오류 없이 숨긴다', () => {
  const empty = { ...types, reportCandidateStatuses: [] };
  const { reportCandidateStatuses, ...noKey } = types;
  for (const data of [empty, noKey]) {
    for (const id of [...SHOWN, ...HIDDEN, null]) assert.equal(shouldShowChecklist(id, false, data), false, String(id));
  }
  assert.equal(shouldShowChecklist('T12', false, null), false, '데이터 없음');
});

test('규칙은 JSON 목록만 따른다(코드에 유형 ID 없음)', () => {
  const onlyNotTarget = { ...types, reportCandidateStatuses: ['not_target'] };
  assert.equal(shouldShowChecklist('T03', false, onlyNotTarget), true);
  assert.equal(shouldShowChecklist('T12', false, onlyNotTarget), false);
});
