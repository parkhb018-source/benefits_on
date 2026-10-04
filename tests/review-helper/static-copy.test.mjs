// 정적 문구 점검 — 실행: node --test tests/review-helper/static-copy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../pages/tools/review-helper/index.html', import.meta.url), 'utf8');
const pick = (re) => (html.match(re) || [])[1];
const meta = pick(/<meta name="description" content="([^"]*)"/);
const og = pick(/<meta property="og:description" content="([^"]*)"/);
const ld = pick(/"@type": "SoftwareApplication",[\s\S]*?"description": "([^"]*)"/);

test('검색 설명문 — meta·og 는 같고, 세 곳 모두 새 구절을 쓴다', () => {
  assert.ok(meta && og && ld);
  assert.equal(og, meta);
  // JSON-LD 는 1.6.1 이전부터 짧은 문장·가운뎃점 표기였다(meta 와 원래 다름). 같은 뜻의 구절만 확인한다.
  assert.ok(meta.includes('리뷰 유형, 확인할 점, 답변 초안과 (필요하면) 신고 전 체크리스트를 정리해 드려요'));
  assert.ok(ld.includes('리뷰 유형·확인할 점·답변 초안과 (필요하면) 신고 전 체크리스트를 정리해 드려요'));
});

test("본문에 \"'신고 전 체크리스트' 화면\" 구절이 남아 있지 않다", () => {
  assert.equal(html.includes("'신고 전 체크리스트' 화면"), false);
});

test('유형별 대응 요령 — 반복 신고 안내 문구가 없고, 서로 다른 신고 안내는 그대로이며, 첫 문단에 새 문장이 있다', () => {
  const sec = pick(/<section aria-labelledby="typesH">([\s\S]*?)<\/section>/);
  assert.ok(sec);
  assert.equal(sec.split('신고 안내: 신고대상은 아닙니다(욕설·비방이 없을 때).').length - 1, 0);
  for (const s of ['신고 안내: 원칙적으로 신고대상은 아닙니다.', '신고 안내: 신고 여부를 판단하기 전에 상황부터 확인하세요.',
    '신고 안내: 신고 검토가 가능할 수 있어요.', '신고 안내: 주문 기록을 확인한 뒤에 판단하세요.']) {
    assert.equal(sec.split(s).length - 1, 1, s);
  }
  assert.equal(sec.split('신고 안내:').length - 1, 4, '신고 안내는 서로 다른 4개만 남는다');
  assert.equal((sec.match(/<dt>/g) || []).length, 15, '유형 15개는 그대로');
  const intro = pick(/<section aria-labelledby="typesH">[\s\S]*?<p>([\s\S]*?)<\/p>/);
  assert.ok(intro.endsWith('신고 안내가 따로 적히지 않은 유형은 욕설·비방이 없는 한 신고대상이 아니에요.'));
});
