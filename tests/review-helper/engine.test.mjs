// 리뷰 대응도우미 JS 엔진 시험 — 실행: node --test tests/review-helper/
// abuse-tests.json(40개)·classify-fixtures.json(124개)·normalize-fixtures.json(41개)은 Python 참고 구현과 같은 기대값을 쓴다. 시험 문장은 고치지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAbuseChecker } from '../../pages/tools/review-helper/js/abuse.js';
import { createClassifier } from '../../pages/tools/review-helper/js/classify.js';
import { normalizeForMatch } from '../../pages/tools/review-helper/js/normalize.js';
import { listBlanks, splitTemplate, fillTemplate, countBlanksLeft } from '../../pages/tools/review-helper/js/fill.js';
import { policyFlags } from '../../pages/tools/review-helper/js/policy.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../../data/review-helper/${n}`, import.meta.url), 'utf8'));
const abuseCheck = createAbuseChecker(load('abuse-words.json'));
const classify = createClassifier(load('types.json'), abuseCheck);

test('욕설 사전 — abuse-tests.json 40개', () => {
  const { cases } = load('abuse-tests.json');
  assert.equal(cases.length, 40);
  const fails = [];
  for (const c of cases) {
    const r = abuseCheck(c.text);
    if (r.abusive !== c.expectAbusive) fails.push(`[${c.id}] abusive 기대 ${c.expectAbusive} / 결과 ${r.abusive}`);
    if ('expectVulgar' in c && r.vulgar !== c.expectVulgar) fails.push(`[${c.id}] vulgar 기대 ${c.expectVulgar} / 결과 ${r.vulgar}`);
  }
  assert.deepEqual(fails, []);
});

test('유형 분류 — classify-fixtures.json 124개', () => {
  const { cases } = load('classify-fixtures.json');
  assert.equal(cases.length, 124);
  const fails = [];
  for (const c of cases) {
    const r = classify(c.text, c.rating ?? null);
    if (r.main !== c.expectMain) fails.push(`[${c.id}] main 기대 ${c.expectMain} / 결과 ${r.main}`);
    for (const s of c.expectSecondaryContains || []) if (!r.secondary.includes(s)) fails.push(`[${c.id}] 보조 ${s} 없음`);
    if (c.expectSecondaryEmpty && r.secondary.length) fails.push(`[${c.id}] 보조 유형이 비어 있어야 함`);
    for (const s of c.expectSecondaryExcludes || []) if (r.secondary.includes(s)) fails.push(`[${c.id}] 보조 ${s} 잘못 붙음`);
    if ('expectAbusive' in c && r.abusive !== c.expectAbusive) fails.push(`[${c.id}] abusive 기대 ${c.expectAbusive}`);
  }
  assert.deepEqual(fails, []);
});

test('정규화 — normalize-fixtures.json 41개', () => {
  const { cases } = load('normalize-fixtures.json');
  assert.equal(cases.length, 41);
  const fails = cases.filter((c) => normalizeForMatch(c.input) !== c.expect)
    .map((c) => `[${c.id}] 기대 ${JSON.stringify(c.expect)} / 결과 ${JSON.stringify(normalizeForMatch(c.input))}`);
  assert.deepEqual(fails, []);
});

test('정규화 — 받침 6종·공백·한글 아닌 글자·이모지', () => {
  assert.deepEqual(['있', '밖', '넋', '값', '않', '앓'].map(normalizeForMatch), ['잇', '박', '넉', '갑', '안', '알']);
  assert.equal(normalizeForMatch('맛 없\t어\n요'), '맛업어요');
  assert.equal(normalizeForMatch('JMT 1시간!'), 'jmt1시간!');
  assert.equal(normalizeForMatch('👍 굿 😊'), '👍굿😊');
  assert.equal(normalizeForMatch('좋아요'), '좋아요', 'ㅎ 받침은 접지 않는다');
  assert.equal(normalizeForMatch('닭'), '닭', '목록에 없는 겹받침은 그대로');
  assert.equal(normalizeForMatch(null), '');
});

test('칭찬 보호(positiveGuards) — 막히는 것과 막히지 않는 것', () => {
  // 별점 없이 칭찬만 걸리면 T14, 칭찬이 막혀 일반 불만 표현만 남으면 미분류(null)
  const blocked = ['불만족', '미만족이에요', '비추천', '안좋아요', '안 좋았어요', '못 좋아요', '안 맛있어요',
    '맛있지 않아요', '맛있진 않네요', '맛있지 못해요', '재주문 의사 없음', '재주문할 의향 없어요', '추천 안할게요'];
  for (const t of blocked) assert.notEqual(classify(t, null).main, 'T14', t);
  for (const t of ['불만족', '비추천', '안좋아요', '재주문 의사 없음']) assert.equal(classify(t, null).main, null, t);
  for (const t of ['맛있지 않아요', '맛있진 않네요', '안 맛있어요']) assert.equal(classify(t, 2).main, 'T03', t);
  // 1.5.0 추가 뒤쪽 패턴 — 각 1건(칭찬만 있던 글이 미분류가 되는지)
  const afterCases = {
    안해: '재주문 안 해요', 안하: '추천 안하고 싶어요', 안함: '재주문 안함', 일없: '또 시킬 일 없을 듯',
    일은없: '또 시킬 일은 없어요', 지는않: '만족스럽지는 않네요', 은못: '맛있는 편은 못 돼요',
    못하겠: '만족 못하겠어요', 못할: '추천 못할 것 같아요',
  };
  for (const [pat, t] of Object.entries(afterCases)) assert.equal(classify(t, null).main, null, `${pat}: ${t}`);
  // 안해·안하·안함(재주문·또 시킬·추천)·일없·일은없(또 시킬·재주문)은 적용 대상 키워드 뒤 3자 이내에서만 막는다
  for (const [t, r] of [['재주문 안 해요', null], ['재주문 안해요', 1], ['또 시킬 일 없을 듯', 2], ['추천 안 해요', 1],
    ['추천은 못 하겠어요', 2], ['만족스럽지는 않네요', 2]]) assert.equal(classify(t, r).main, null, t);
  for (const t of ['맛있어서 후회 안해요', '추천합니다 후회 안함', '맛있어요 걱정 안하셔도 돼요', '양도 많고 맛있어요 실패할 일 없음']) {
    assert.equal(classify(t, 5).main, 'T14', t);
  }
  assert.equal(classify('추천해요 정말 안해본 맛', null).main, 'T14', '추천 뒤 4자 이상 떨어진 안해 → 안 막힘');
  // 앞 글자 보호가 없는 키워드·다른 앞 글자는 막지 않는다
  const kept = ['불맛있어요', '추천해요', '만족해요', '정말 좋아요', '좋은 재료', '또 시킬게요', '굿', '👍'];
  for (const t of kept) assert.equal(classify(t, null).main, 'T14', t);
  // 뒤 표현은 키워드 끝에서 6자 이내에 시작할 때만 막는다
  assert.equal(classify('맛있어요ㅎㅎㅎㅎ 지않', null).main, null, '6자 뒤(공백 제외) → 막힘');
  assert.equal(classify('맛있어요ㅎㅎㅎㅎㅎ지않', null).main, 'T14', '7자 뒤 → 안 막힘');
  // 1.6.1 짱 — 바로 뒤(withinChars 0)가 나요·나네·나서·났·난이면 막는다(짜증난다는 뜻)
  for (const t of ['짱나요', '짱나네', '짱나서 안 시켜요', '짱났어요', '짱난다', '짱 나요']) assert.equal(classify(t, null).main, null, t);
  for (const t of ['짱', '짱이에요', '짱맛', '짱짱하네요']) assert.equal(classify(t, null).main, 'T14', t);
  assert.equal(classify('짱 맛있어요 나요', null).main, 'T14', '짱 바로 뒤가 아니면 안 막힘');
  // 1.6.2 짱 — 나·남·개·깨 추가(짜증난다는 뜻 / 비하어) — 각 1건
  const zzangCases = { 나: '진짜 짱나', 남: '짱남', 개: '짱개', 깨: '짱깨' };
  for (const [pat, t] of Object.entries(zzangCases)) assert.equal(classify(t, null).main, null, `${pat}: ${t}`);
  assert.equal(classify('개짱나', null).main, null, '짱 앞의 개는 상관없이 뒤 나로 막힘');
});

test('JS·Python 결과 일치 — 정규화 41개 + 분류 fixture 124개 + 보호 규칙 문장', (t) => {
  const py = fileURLToPath(new URL('../../data/review-helper/classify_check.py', import.meta.url));
  const normalize = load('normalize-fixtures.json').cases.map((c) => c.input);
  const classifyIn = load('classify-fixtures.json').cases.map((c) => [c.text, c.rating ?? null])
    .concat(['불맛있어요', '추천 안할게요', '맛있어요ㅎㅎㅎㅎ 지않', '맛있어요ㅎㅎㅎㅎㅎㅎㅎ지않', '맛은 있는데 안 시킬 것 같아요',
      '짱나서 안 시켜요', '짱났어요', '짱난다', '짱 맛있어요 나요',
      '진짜 짱나', '짱남', '짱개', '짱깨', '개짱나', '배달 늦어서 짱남', '짱개집인데 늦었어요', '사장이 짱깨라서 그런지 불친절하네요']
      .flatMap((s) => [[s, null], [s, 1], [s, 5]]));
  const input = JSON.stringify({ normalize, classify: classifyIn });
  let out = null;
  for (const cmd of ['python', 'py', 'python3']) {
    const r = spawnSync(cmd, [py, '--dump'], { input, encoding: 'utf8' });
    if (r.status === 0) { out = JSON.parse(r.stdout); break; }
  }
  if (!out) { t.skip('python 실행 파일을 찾지 못함'); return; }
  assert.deepEqual(normalize.map(normalizeForMatch), out.normalize);
  assert.deepEqual(classifyIn.map(([s, r]) => classify(s, r)), out.classify);
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
