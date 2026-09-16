# QA Test Cases — 이익 변동 진단

`engine/profit-analyzer.test.js` 와 1:1 대응. 실행: `node engine/profit-analyzer.test.js`.

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| QA-01 | 이익 감소 (매출 동일, 식재료비만 증가) | `profitChange=-500,000`, status `DECREASE`, headline에 "500,000원 줄었습니다" 포함, 영향 합계=이익 증감 |
| QA-02 | 이익 증가 (식재료비 감소) | `profitChange=+500,000`, status `INCREASE`, headline에 "500,000원 늘었습니다" 포함 |
| QA-03 | 완전 동일 — 이익도 항목도 전부 동일 | `profitChange=0`, status `SAME`, headline "지난달과 이번 달 이익이 같습니다." |
| QA-04 | 이익 동일, 항목은 변화(식재료비↑ 인건비↓ 상쇄) | `profitChange=0`, status `SAME_ITEMS_CHANGED`, headline "이익은 지난달과 같지만, 항목별로는 변화가 있었습니다." 로 시작 |
| QA-05 | 전월 양수 → 이번 달 0 (수수료) | 해당 항목 `note` = "지난달 300,000원 → 이번 달 0원 (이번 달엔 발생하지 않음)" |
| QA-06 | 동점 타이브레이크(임대료·수수료 동일 절대 영향액) | 영향 순위 상위 2개 = `[platformFee, rent]` (수수료가 임대료보다 먼저) |
| QA-07 | 전월 0 → 이번 달 양수(기타비용 신규 발생) | 해당 항목 `note` = "지난달 0원 → 이번 달 200,000원 (신규 발생)" |
| QA-08 | 적자 축소(−1,000,000 → −500,000) | status `DEFICIT_REDUCED`, headline "적자 규모가 500,000원 줄었습니다." 로 시작 |
| QA-09 | 적자 전환(+500,000 → −500,000) | status `DEFICIT_FLIP`, headline "이번 달 적자로 전환되었습니다." 로 시작 |
| QA-10 | 전부 0 | status `ALL_ZERO`, headline = "비교할 숫자가 없습니다." |
| QA-11 | 쉼표·원화기호 입력 normalize | `"10,000,000원"` → `10000000`, `"3,000,000"` → `3000000` |
| QA-12 | 소수점 반올림 | `1000.4` → `1000`, `1000.5` → `1001` |
| QA-13 | 안전정수 초과 | `Number.MAX_SAFE_INTEGER + 10` 입력 시 `RangeError` |
| QA-14 | 영향 합계 == 이익 증감 항등식(임의 값) | `Σ rankedImpacts[].impact === profitChange` |
| QA-15 | 필수 검증 케이스(기획문서 예시) | `profitPrev=4,000,000` / `profitCurr=1,500,000` / `profitChange=-2,500,000` / 최대 영향 항목=`foodCost`(impact `-1,500,000`) / 영향 순위 상위 4개=`[foodCost, laborCost, platformFee, otherCost]` / 영향 합계=`-2,500,000` |

## 필수 검증 케이스 실측값 (QA-15)

입력:
- 지난달: 매출 30,000,000 / 식재료비 11,000,000 / 인건비 7,000,000 / 임대료 3,000,000 / 수수료 2,000,000 / 기타 3,000,000
- 이번 달: 매출 30,000,000 / 식재료비 12,500,000 / 인건비 7,800,000 / 임대료 3,000,000 / 수수료 2,100,000 / 기타 3,100,000

실제 출력(2026-09-16, `node`/브라우저 동일 확인):
```
headline: 이번 달 이익이 지난달보다 2,500,000원 줄었습니다. 이익 변동에 가장 큰 영향을 준 항목은 1,500,000원 변화한 식재료비입니다.
status: DECREASE (이익 감소)
profitPrev: 4,000,000원
profitCurr: 1,500,000원
profitChange: -2,500,000
rankedImpacts: 식재료비 -1,500,000 > 인건비 -800,000 > 수수료 -100,000 > 기타 -100,000 > 매출 0 > 임대료 0
영향 합계: -2,500,000 (profitChange와 일치)
```
