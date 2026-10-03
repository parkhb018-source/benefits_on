// OCR 깨진 줄 정리 시험 — 실행: node --test tests/review-helper/ocr-clean.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBrokenLine, cleanOcrText } from '../../pages/tools/review-helper/js/ocr-clean.js';

// [가상 OCR 줄, 지워져야 하나]
export const CASES = [
  ['배달이 너무 늦게 와서 음식이 다 식었어요', false],
  ['※**그고고 ㆍ2026.10.01', false],   // 별점·날짜 줄처럼 보여도 문자 비율이 높으면 남김
  ['ㅠㅠ', false],                      // 자모 2개 — 감정 표현일 수 있어 남김
  ['굿', false],                        // 한 글자 리뷰 — 한글 음절이 있으면 (1)에서 제외
  ['5', true],                          // 숫자 한 글자(별점 숫자 등) — (1)
  ['ㅠ', true],                         // 자모 한 글자 — (1)
  ['👍👍', true],                       // 이모지만 — 의미 문자 0개 (1)
  ['※**ㆍ·|', true],                    // 기호만
  ['|| ~~ * 맛 *** ~~ ||', true],       // 의미 문자 1/13 — (2) 비율 40% 미만
  ['ㆍ★★★★☆ 4', true],                 // 의미 문자 1개 — (1)
  ['★★★☆☆ 3점', true],                 // 의미 문자 2/7 = 29% — (2). 한글 음절 보호는 (1)에만 적용
];

test('줄 판정', () => {
  assert.deepEqual(CASES.map(([l]) => [l, isBrokenLine(l)]), CASES);
});

test('여러 줄 정리 — 남은 줄 순서 유지, 지운 수', () => {
  const r = cleanOcrText('※**ㆍ·|\n배달이 늦었어요\n\n5\n다음엔 빨리 와 주세요\n👍👍');
  assert.deepEqual(r, { text: '배달이 늦었어요\n다음엔 빨리 와 주세요', removed: 3 });
  assert.deepEqual(cleanOcrText('맛있어요'), { text: '맛있어요', removed: 0 });
  assert.deepEqual(cleanOcrText(''), { text: '', removed: 0 });
});
