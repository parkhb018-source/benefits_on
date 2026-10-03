// 리뷰 대응도우미 JS 엔진 시험 — 실행: node --test tests/review-helper/
// abuse-tests.json(36개)·classify-fixtures.json(31개)은 Python 참고 구현과 같은 기대값을 쓴다. 시험 문장은 고치지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAbuseChecker } from '../../pages/tools/review-helper/js/abuse.js';
import { createClassifier } from '../../pages/tools/review-helper/js/classify.js';
import { listBlanks, splitTemplate, fillTemplate, countBlanksLeft } from '../../pages/tools/review-helper/js/fill.js';
import { policyFlags } from '../../pages/tools/review-helper/js/policy.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../../data/review-helper/${n}`, import.meta.url), 'utf8'));
const abuseCheck = createAbuseChecker(load('abuse-words.json'));
const classify = createClassifier(load('types.json'), abuseCheck);

test('욕설 사전 — abuse-tests.json 36개', () => {
  const { cases } = load('abuse-tests.json');
  assert.equal(cases.length, 36);
  const fails = [];
  for (const c of cases) {
    const r = abuseCheck(c.text);
    if (r.abusive !== c.expectAbusive) fails.push(`[${c.id}] abusive 기대 ${c.expectAbusive} / 결과 ${r.abusive}`);
    if ('expectVulgar' in c && r.vulgar !== c.expectVulgar) fails.push(`[${c.id}] vulgar 기대 ${c.expectVulgar} / 결과 ${r.vulgar}`);
  }
  assert.deepEqual(fails, []);
});

test('유형 분류 — classify-fixtures.json 31개', () => {
  const { cases } = load('classify-fixtures.json');
  assert.equal(cases.length, 31);
  const fails = [];
  for (const c of cases) {
    const r = classify(c.text, c.rating ?? null);
    if (r.main !== c.expectMain) fails.push(`[${c.id}] main 기대 ${c.expectMain} / 결과 ${r.main}`);
    for (const s of c.expectSecondaryContains || []) if (!r.secondary.includes(s)) fails.push(`[${c.id}] 보조 ${s} 없음`);
    for (const s of c.expectSecondaryExcludes || []) if (r.secondary.includes(s)) fails.push(`[${c.id}] 보조 ${s} 잘못 붙음`);
    if ('expectAbusive' in c && r.abusive !== c.expectAbusive) fails.push(`[${c.id}] abusive 기대 ${c.expectAbusive}`);
  }
  assert.deepEqual(fails, []);
});

test('PRD §10-2 수용 기준 문장 4개', () => {
  assert.equal(classify('배달이 너무 늦게 와서 음식이 다 식었어요. 다시는 안 시킬 것 같아요.', 2).main, 'T01');
  assert.equal(classify('음식에서 머리카락이 나왔어요.', 1).main, 'T06');
  const ab = classify('씨발 배달이 한 시간이나 걸리네', 1);
  assert.equal(ab.main, 'T12');
  assert.equal(ab.abusive, true);
  assert.equal(classify('맛있어요 최고예요 또 시킬게요', 5).main, 'T14');
});

test('빈칸 — 찾기·채우기·남은 수', () => {
  const tpl = '안녕하세요, [가게 이름]입니다. [개선 내용]으로 [개선 내용] 하겠습니다.';
  assert.deepEqual(listBlanks(tpl), ['[가게 이름]', '[개선 내용]']);
  assert.equal(countBlanksLeft(tpl, {}), 3);
  assert.equal(countBlanksLeft(tpl, { '[가게 이름]': '행복분식' }), 2);
  assert.equal(countBlanksLeft(tpl, { '[가게 이름]': '   ' }), 3, '공백만 넣으면 안 채운 것');
  assert.equal(fillTemplate(tpl, { '[가게 이름]': '행복분식' }), '안녕하세요, 행복분식입니다. [개선 내용]으로 [개선 내용] 하겠습니다.');
  const segs = splitTemplate(tpl, { '[개선 내용]': '포장 확인' });
  assert.deepEqual(segs.filter((s) => s.blank).map((s) => s.text), ['[가게 이름]']);
});

test('모든 템플릿의 빈칸이 templates.json blanks 목록 안에 있다', () => {
  const tpl = load('templates.json');
  const known = new Set(tpl.blanks.map((b) => b.token));
  for (const t of tpl.templates) for (const tone of ['polite', 'short', 'sincere']) {
    for (const tok of listBlanks(t[tone])) assert.ok(known.has(tok), `${t.typeId}/${tone} ${tok}`);
  }
});

test('정책 표시 — 확인 중·확인일 경과', () => {
  const { platforms, staleAfterDays } = load('platforms.json');
  const byId = Object.fromEntries(platforms.map((p) => [p.id, p]));
  const day = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  assert.deepEqual(policyFlags(byId.baemin, staleAfterDays, day('2026-10-04')), { checking: false, stale: false });
  assert.equal(policyFlags(byId.baemin, 90, day('2026-12-31')).stale, false, '90일째는 아직 아님');
  assert.equal(policyFlags(byId.baemin, 90, day('2027-01-01')).stale, true, '91일째부터 경과');
  assert.deepEqual(policyFlags(byId.naver_place, staleAfterDays, day('2026-10-04')), { checking: true, stale: false });
});
