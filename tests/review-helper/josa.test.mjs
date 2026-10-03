// 조사 자동 보정 시험 — 실행: node --test tests/review-helper/josa.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveJosa } from '../../pages/tools/review-helper/js/josa.js';
import { splitTemplate, fillTemplate } from '../../pages/tools/review-helper/js/fill.js';

const T = (tok, rest) => `[${tok}]${rest}`;
const fix = (tpl, v) => resolveJosa(tpl, v);

test('(으)로 — 받침 있음 / 없음 / ㄹ받침', () => {
  const tpl = '[개선 내용]으로 바로잡겠습니다.';
  assert.equal(fix(tpl, { '[개선 내용]': '포장 확인 절차 추가' }), '[개선 내용]로 바로잡겠습니다.');
  assert.equal(fix(tpl, { '[개선 내용]': '보온 용기 교체' }), '[개선 내용]로 바로잡겠습니다.');
  assert.equal(fix(tpl, { '[개선 내용]': '출고 전 확인' }), '[개선 내용]으로 바로잡겠습니다.');
  assert.equal(fix(tpl, { '[개선 내용]': '포장 2중 봉인 실' }), '[개선 내용]로 바로잡겠습니다.', 'ㄹ받침은 로');
  assert.equal(fix('[연락 방법]로 연락', { '[연락 방법]': '가게 전화 상담' }), '[연락 방법]으로 연락', '로 → 으로');
  assert.equal(fix('[연락 방법]으로 연락', { '[연락 방법]': '카카오톡 채널' }), '[연락 방법]로 연락', 'ㄹ받침(널)은 로');
});

test('을/를 · 은/는 · 이/가', () => {
  assert.equal(fix('[개선 내용]을 하겠습니다', { '[개선 내용]': '직원 교육 강화' }), '[개선 내용]를 하겠습니다');
  assert.equal(fix('[확인 결과]를 바탕으로', { '[확인 결과]': '주문서 확인' }), '[확인 결과]을 바탕으로');
  assert.equal(fix('[메뉴명]은 [개선 내용]', { '[메뉴명]': '김치찌개' }), '[메뉴명]는 [개선 내용]');
  assert.equal(fix('[메뉴명]은 맛', { '[메뉴명]': '된장국' }), '[메뉴명]은 맛');
  assert.equal(fix('[메뉴명]이 빠지거나', { '[메뉴명]': '콜라' }), '[메뉴명]가 빠지거나');
  assert.equal(fix('[메뉴명]이 빠지거나', { '[메뉴명]': '치킨' }), '[메뉴명]이 빠지거나');
});

test('마지막 글자가 한글이 아니면 중립 표기, 오류 없음', () => {
  assert.equal(fix('[개선 내용]으로 ', { '[개선 내용]': 'A/S 2' }), '[개선 내용](으)로 ');
  assert.equal(fix('[메뉴명]을 ', { '[메뉴명]': 'Set B' }), '[메뉴명]을(를) ');
  assert.equal(fix('[메뉴명]은 ', { '[메뉴명]': '치킨!' }), '[메뉴명]은(는) ');
  assert.equal(fix('[메뉴명]이 ', { '[메뉴명]': '(소)' }), '[메뉴명]이(가) ');
  assert.equal(fix('[메뉴명]이 ', { '[메뉴명]': '치킨  ' }), '[메뉴명]이 ', '끝 공백은 무시하고 판단');
});

test('빈칸이 비어 있으면 원문 그대로', () => {
  const tpl = '[개선 내용]으로 [메뉴명]을 ';
  assert.equal(fix(tpl, {}), tpl);
  assert.equal(fix(tpl, { '[개선 내용]': '   ' }), tpl);
});

test('조사 뒤에 한글이 이어지면 바꾸지 않는다', () => {
  assert.equal(fix('[확인 결과]이고, ', { '[확인 결과]': '누락 확인' }), '[확인 결과]이고, ');
  assert.equal(fix('[확인 결과]이며, ', { '[확인 결과]': '사실' }), '[확인 결과]이며, ');
  assert.equal(fix('[개선 내용]이후 ', { '[개선 내용]': '교육' }), '[개선 내용]이후 ');
  assert.equal(fix('[가게 이름]입니다.', { '[가게 이름]': '행복분식' }), '[가게 이름]입니다.');
});

test('같은 빈칸이 여러 번 쓰여도 각각 보정', () => {
  const tpl = '[개선 내용]으로 보완하고 [개선 내용]을 하겠습니다.';
  assert.equal(fix(tpl, { '[개선 내용]': '직원 교육 강화' }), '[개선 내용]로 보완하고 [개선 내용]를 하겠습니다.');
  assert.equal(fix(tpl, { '[개선 내용]': '재교육' }), tpl, '받침 있는 값은 원문 그대로');
});

test('미리보기 조각과 복사 결과가 같고, 빈칸 남은 곳은 노란 칸 유지', () => {
  const tpl = '[개선 내용]으로 [메뉴명]을 살피겠습니다.';
  const v = { '[개선 내용]': '직원 교육 강화' };
  assert.equal(splitTemplate(tpl, v).map((s) => s.text).join(''), fillTemplate(tpl, v));
  assert.equal(fillTemplate(tpl, v), '직원 교육 강화로 [메뉴명]을 살피겠습니다.');
  assert.deepEqual(splitTemplate(tpl, v).filter((s) => s.blank).map((s) => s.text), ['[메뉴명]']);
});

test('서술격 "였" — 받침 있으면 이었, 없으면 였, 한글 아니면 (이)었', () => {
  assert.equal(fix('[확인 결과]였고, ', { '[확인 결과]': '포장 단계 누락' }), '[확인 결과]이었고, ');
  assert.equal(fix('[확인 결과]였습니다.', { '[확인 결과]': '주문서 기준 정상 출고' }), '[확인 결과]였습니다.');
  assert.equal(fix('[확인 결과]였습니다.', { '[확인 결과]': '배달 지연' }), '[확인 결과]이었습니다.', '연 = ㄴ받침');
  assert.equal(fix('[확인 결과]였고, ', { '[확인 결과]': '주문 누락 확인됨' }), '[확인 결과]이었고, ');
  assert.equal(fix('[확인 결과]였고, ', { '[확인 결과]': '오후 7시 30분 출고 (No.12)' }), '[확인 결과](이)었고, ');
  assert.equal(fix('[확인 결과]였고, ', {}), '[확인 결과]였고, ', '비어 있으면 원문 그대로');
  assert.equal(fix('[확인 결과]이고, ', { '[확인 결과]': '포장 누락' }), '[확인 결과]이고, ', '이고 는 변경 없음');
});

test('템플릿의 "였" 4곳 — 값에 맞게 바뀜', () => {
  const tpl = JSON.parse(readFileSync(new URL('../../data/review-helper/templates.json', import.meta.url), 'utf8'));
  const spots = [];
  for (const t of tpl.templates) for (const tone of ['polite', 'short', 'sincere']) if (/\[확인 결과\]였/.test(t[tone])) spots.push(t[tone]);
  assert.equal(spots.length, 4);
  for (const s of spots) {
    assert.match(fillTemplate(s, { '[확인 결과]': '포장 단계 누락' }), /포장 단계 누락이었/);
    assert.match(fillTemplate(s, { '[확인 결과]': '정상 출고 처리' }), /정상 출고 처리였/);
  }
});

test('45개 템플릿 × 대표 값 2종 — 예외 없음, 빈칸 수 그대로', () => {
  const tpl = JSON.parse(readFileSync(new URL('../../data/review-helper/templates.json', import.meta.url), 'utf8'));
  const sets = {
    받침있음: { '[가게 이름]': '행복식당', '[메뉴명]': '김치찌개 정식', '[지연 사유]': '주문이 몰린 시간', '[개선 내용]': '출고 전 확인', '[확인 결과]': '주문서 확인 결과 누락', '[조치 내용]': '재조리 후 재전송', '[연락 방법]': '가게 전화', '[아쉬운 점]': '국물 양' },
    받침없음: { '[가게 이름]': '엄마손분식', '[메뉴명]': '떡볶이', '[지연 사유]': '배차 지연', '[개선 내용]': '포장 확인 절차 추가', '[확인 결과]': '포장 단계 누락', '[조치 내용]': '부분 환불', '[연락 방법]': '플랫폼 고객센터', '[아쉬운 점]': '양이 적은 부분' },
  };
  let n = 0;
  for (const t of tpl.templates) for (const tone of ['polite', 'short', 'sincere']) for (const v of Object.values(sets)) {
    const raw = t[tone];
    const out = resolveJosa(raw, v);
    assert.equal((out.match(/\[[^\]]+\]/g) || []).length, (raw.match(/\[[^\]]+\]/g) || []).length);
    assert.ok(!/\[[^\]]+\]\((으\)로|를\)|는\)|가\))/.test(out), '한글 값에는 중립 표기가 나오지 않음');
    n++;
  }
  assert.equal(n, 90);
});
