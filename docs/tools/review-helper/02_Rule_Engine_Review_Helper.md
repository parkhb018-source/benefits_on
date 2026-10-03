# 리뷰 대응도우미 — 규칙 문서

규칙의 원본은 데이터 파일이다. 이 문서는 어디에 무엇이 있는지와 화면 쪽 보정 규칙만 적는다.

## 1. 유형 분류

- 원본: `data/review-helper/types.json` 의 `classification.steps`(7단계)와 `types[].match`·`priority`.
- 참고 구현: `data/review-helper/classify_check.py` → JS 이식: `pages/tools/review-helper/js/classify.js`.
- 입력: 리뷰 글, 별점(선택, 1~5 또는 없음). 출력: `{ main, secondary, abusive, vulgar }`.
- 시험: `classify-fixtures.json` 31개. JS 와 Python 의 출력(대표·보조·욕설·거친 표현)이 전 문장 동일해야 한다.

## 2. 욕설·모욕 사전

- 원본: `data/review-helper/abuse-words.json` 의 `matchingRules` 9개.
- 참고 구현: `abuse_check.py` → JS 이식: `js/abuse.js`.
- 이식 시 차이 보정: Python `\d`(유니코드 숫자)는 JS `\p{Nd}`(u 플래그), 글자 수는 코드포인트 기준.
- 시험: `abuse-tests.json` 36개.

## 3. 화면 쪽 보정 규칙 (app.js)

| 규칙 | 근거 |
|---|---|
| 욕설·모욕이 감지(`abusive`)됐는데 선택된 유형의 `reportStatus` 가 `not_target`·`principle_not_target` 이면 `may_review` 문구를 쓴다 (사장님이 유형을 직접 바꾼 경우 포함) | `types.json` displayRules 1, PRD §10-3 |
| 대표 유형이 T12 가 아니고 `abusive` 이면 "욕설·비방 표현도 감지됐어요…" 한 줄 추가 | PRD §3-3 |
| `vulgar` 이면 태그에 "거친 표현" 추가 | PRD §4 |
| 미분류(`main = null`)면 유형 칩을 펼친 채 "유형을 골라 주세요" | classification.steps 6 |

## 4. 정책 표시 (js/policy.js)

- `checking` = `inScope:false` 또는 `confidence:low` 또는 `verifiedDate` 없음 → "아직 확인 중인 정보예요…"
- `stale` = 오늘 − `verifiedDate` > `staleAfterDays`(90) → "정책이 바뀌었을 수 있어요…"
- 체크리스트 근거: 선택 플랫폼의 `basis` 에 `ref` 가 있으면 `근거: {ref}`, `verified:false`·근거 없음이면
  "공식 원문으로 확인되지 않은 항목이에요".
