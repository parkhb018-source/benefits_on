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
