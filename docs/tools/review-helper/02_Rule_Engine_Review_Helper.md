# 리뷰 대응도우미 — 규칙 문서

규칙의 원본은 데이터 파일이다. 이 문서는 어디에 무엇이 있는지와 화면 쪽 보정 규칙만 적는다.

## 1. 유형 분류

- 원본: `data/review-helper/types.json` 의 `classification.steps`(9단계)·`generalNegative`·`positiveGuards`와 `types[].match`·`priority`.
- 참고 구현: `data/review-helper/classify_check.py` → JS 이식: `pages/tools/review-helper/js/classify.js`(정규화는 `js/normalize.js`).
- 입력: 리뷰 글, 별점(선택, 1~5 또는 없음). 출력: `{ main, secondary, abusive, vulgar }`.
- 1단계(짧은 글, 공백 제외 5자 미만): 욕설·모욕이 감지되면 T12. 아니면 키워드(위험·핵심 T06·T05·T13, 일반 불만 T01~T04·T07~T10,
  칭찬 T14, 일반 불만 표현 `generalNegative`)를 먼저 확인해 하나라도 걸리면 2~5단계를 그대로 적용(별점 조건 포함)하고,
  아무것도 걸리지 않을 때만 T11. 빈 글도 T11. 특정 유형이 없는 일반 불만 표현만 걸리면 미분류(null).
  (2026-10-04 변경: 이전에는 짧으면 키워드와 상관없이 T11 — "맛없어요"가 별점만으로 분류되던 문제. 1.5.0: "최악"·"실망" 같은 일반 불만 표현은 T11 대신 미분류)
- 3단계 보충: 불만 유형 없이 칭찬과 일반 불만 표현만 함께 걸리면 별점 ≤2 미분류, 5 T14, 그 밖 T15.

### 1-1. 표기 정규화 (1.5.0)

키워드 비교 전에 리뷰 글과 **모든 키워드**를 같은 함수(`normalizeForMatch` / `normalize_for_match`)로 바꾼 뒤 부분일치로 본다.
`types.json` 의 키워드 원문은 표준 표기로 두고, 정규화본은 저장하지 않는다.

| 순서 | 처리 | 예 |
|---|---|---|
| 1 | 유니코드 NFC + 소문자 | `JMT` → `jmt` |
| 2 | 모든 공백(스페이스·탭·줄바꿈·NBSP·전각 공백 등) 제거 | `맛 없어요`·`맛이없어요` → "맛없"·"맛이 없" 키워드에 걸림 |
| 3 | 한글 음절의 받침만 접기: ㅆ→ㅅ, ㄲ·ㄳ→ㄱ, ㅄ→ㅂ, ㄶ→ㄴ, ㅀ→ㄹ | 있→잇, 없→업, 했→햇, 않→안, 밖→박 |

- 하지 않는 것: ㅎ 받침 삭제("좋"→"조"가 "조금"에 걸림. 대신 "조아요" 같은 명시 변형 키워드), ㅐ/ㅔ 접기(미적용), 반복 글자 줄이기.
- 공백 목록은 Python·JS 의 `\s` 범위 차이를 피하려고 두 구현에 같은 문자 목록을 직접 적었다.
- **욕설 판정(abuse)·화면 표시·답변 초안·복사에는 적용하지 않는다.** 분류 매칭 전용.

### 1-2. 칭찬 키워드 보호 (`classification.positiveGuards`, 1.5.0)

칭찬(T14) 키워드가 부정 표현의 일부이면 칭찬으로 세지 않고, 그 자리에서 일반 불만 표현(`generalNegative`)이 걸린 것으로 본다.
비교는 정규화한 글자 기준.

| 구분 | 키워드 | 막는 조건 | 예 |
|---|---|---|---|
| 앞 글자 | 만족 | 바로 앞이 불·미 | 불만족, 미만족 |
| 앞 글자 | 추천 | 바로 앞이 비 | 비추천 |
| 앞 글자 | 맛있·좋아요·좋았·좋다·좋아·좋네·좋은·좋습 | 바로 앞이 안·못 | 안좋아요, 못 좋아요, 안 맛있어요 |
| 뒤 표현 | T14 키워드 전부 | 키워드 끝에서 6자 이내에 지않·진않·지안·지못·의사없·의향없·안할·안시·안먹·지는않·은못·못하겠·못할 이 시작 | 맛있지 않아요, 재주문 의사 없음 |
| 뒤 표현 | 재주문·또 시킬·추천 | 키워드 끝에서 3자 이내에 안해·안하·안함 이 시작 | 재주문 안 해요, 추천 안 해요 ("맛있어서 후회 안해요"는 막지 않음) |
| 뒤 표현 | 또 시킬·재주문 | 키워드 끝에서 3자 이내에 일없·일은없 이 시작 | 또 시킬 일 없을 듯 ("맛있어요 실패할 일 없음"은 막지 않음) |

- 위 표에 없는 키워드에는 앞 글자 보호를 걸지 않는다(예: "불맛있어요"의 "맛있"은 막지 않음).
- "맛있지 않·맛있진 않·안 맛있"은 T03 키워드이기도 해서 T03 으로 분류된다.
- "친절"은 칭찬 키워드로 넣지 않는다 — "불친절"(T09)에 "친절"이 들어 있어 혼합(T15)으로 잘못 분류된다.
- **규칙을 더 늘리기 전에 사용자 확인을 받는다.**

- 시험: `classify-fixtures.json` 97개, `normalize-fixtures.json` 41개. JS 와 Python 의 출력(대표·보조·욕설·거친 표현, 정규화 결과)이
  전 문장 동일해야 한다(`engine.test.mjs` 가 `classify_check.py --dump` 를 불러 비교).

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
| 미분류(`main = null`)면 유형 칩을 펼친 채 "유형을 골라 주세요" | classification.steps 1·3·6 |
| 신고 전 체크리스트 노출(1.6.0): 현재 선택된 유형의 `reportStatus` 가 `types.json` `reportCandidateStatuses`(may_review·check_first·verify_records → T12·T06·T13)에 있거나 `abusive` 이면 보여 주고, 그 밖(미분류 포함)은 숨긴다. 사장님이 유형을 바꾸면 즉시 다시 판단. 판단은 `js/report-gate.js` `shouldShowChecklist(typeId, abusive, typesData)` | `types.json` displayRules 4 |
| 체크리스트를 숨기면 모바일 결과의 다음 단계 ②(`step2`)·경로 안내 줄, PC 가운데 열의 체크리스트 화면을 `hidden` 으로 숨긴다(`step2` 데이터는 유지). 모바일 `#report` 로 직접 들어오면 화면은 그대로 동작하고(문항·공식 안내 표시) 경로 안내 줄만 숨김. "관련 플랫폼 정책 → 자세히 보기"(→ `#report`)는 그대로 둔다 | 1.6.0 |
| 체크리스트가 보일 때 "공식 신고 경로 안내 보기" 버튼: 정적 섹션(`#routeH` 의 `details`)을 열고 `scrollIntoView` + `summary` 포커스. 해시는 바꾸지 않는다(앵커 이동 금지 — 해시 라우터가 화면을 바꿈) | 1.6.0 |

## 4. 정책 표시 (js/policy.js)

- `checking` = `inScope:false` 또는 `confidence:low` 또는 `verifiedDate` 없음 → "아직 확인 중인 정보예요…"
- `stale` = 오늘 − `verifiedDate` > `staleAfterDays`(90) → "정책이 바뀌었을 수 있어요…"
- 체크리스트 근거: 선택 플랫폼의 `basis` 에 `ref` 가 있으면 `근거: {ref}`, `verified:false`·근거 없음이면
  "공식 원문으로 확인되지 않은 항목이에요".
