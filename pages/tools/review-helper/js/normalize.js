// 분류 키워드 매칭 전용 표기 정규화 — data/review-helper/classify_check.py 의 normalize_for_match 와 결과가 항상 같아야 한다.
// 리뷰 글과 types.json 키워드를 모두 이 함수로 바꾼 뒤 부분일치로 비교한다.
// 욕설 판정·화면 표시·답변 초안·복사에는 쓰지 않는다. DOM 의존 없음.

// 공백으로 지울 글자. Python 과 JS 의 \s 범위가 조금 달라서 직접 나열한다.
const SPACES = /[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/gu;

// 받침(종성) 번호 접기: ㄲ·ㄳ→ㄱ, ㄶ→ㄴ, ㅀ→ㄹ, ㅄ→ㅂ, ㅆ→ㅅ. 초성·중성은 그대로.
const JONG_FOLD = { 2: 1, 3: 1, 6: 4, 15: 8, 18: 17, 20: 19 };

export function normalizeForMatch(str) {
  const s = (str || '').normalize('NFC').toLowerCase().replace(SPACES, '');
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0) - 0xac00;
    const jong = code % 28;
    out += code >= 0 && code < 11172 && JONG_FOLD[jong] !== undefined
      ? String.fromCodePoint(0xac00 + code - jong + JONG_FOLD[jong])
      : ch;
  }
  return out;
}
