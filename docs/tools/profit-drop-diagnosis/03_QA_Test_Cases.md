# QA Test Cases — 이익 변동 진단

`engine/profit-analyzer.test.js` 와 1:1 대응. 실행: `node engine/profit-analyzer.test.js`.

> v1.2: `status` 는 문자열 enum(`NO_DATA`/`PROFIT_DOWN`/`PROFIT_UP`/`PROFIT_SAME`/
> `PROFIT_SAME_BUT_ITEMS_CHANGED`, 이익 증감 부호만 반영)이고, **배지(`heroTier`)와 `headline`
> 문구는 `profitPrev`/`profitCurr` 부호까지 함께 보는 9가지 상황(02번 문서 표)으로 나뉜다.**
> QA-09c는 v1.1.1에서 "적자 심화 → 일반 감소 문구"였으나, v1.2에서 "적자 확대" 전용 문구로
> 재분류되었다(두 기간 모두 적자인 케이스는 전부 "적자 축소/확대/유지" 3종으로 다룬다).
> 워터폴 좌표(`computeWaterfallLayout`)는 0 기준선이 있는 양방향 축으로 바뀌어 음수 구간도
> 표현된다(QA-18~20).

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| QA-01 | 이익 감소 (매출 동일, 식재료비만 증가) | `profitChange=-500,000`, `status='PROFIT_DOWN'`, `heroTier={이익 감소, danger}`, `headline`="이번 달 이익이 지난달보다 500,000원 줄었습니다.", `topImpactLine`="...500,000원 변화한 식재료비입니다.", 영향 합계=이익 증감 |
| QA-02 | 이익 증가 (식재료비 감소) | `profitChange=+500,000`, `status='PROFIT_UP'`, `heroTier={이익 증가, success}`, `headline`="이번 달 이익이 지난달보다 500,000원 늘었습니다." |
| QA-03 | 완전 동일 — 이익도 항목도 전부 동일 | `status='PROFIT_SAME'`, `heroTier={변화 없음, ''}`, `headline`="지난달과 이번 달 이익이 같습니다.", `topImpactLine=''`, `notCauseLine`="항목별 변화가 없어 순위를 매길 수 없습니다." |
| QA-04 | 이익 동일, 항목은 변화(식재료비↑ 인건비↓ 상쇄, 동점) | `status='PROFIT_SAME_BUT_ITEMS_CHANGED'`, `heroTier={이익 동일, ''}`, `headline`="이익은 지난달과 같지만, 항목별로는 변화가 있었습니다.", `rankedImpacts[0].id='foodCost'`(동점 타이브레이크) |
| QA-05 | 전월 양수 → 이번 달 0 (수수료) | 해당 항목 `flag='COST_ENDED'`, `prev=300,000`, `curr=0` |
| QA-06 | 동점 타이브레이크(임대료·수수료 동일 절대 영향액) | 영향 순위 상위 2개 id = `['platformFee','rent']` |
| QA-07 | 전월 0 → 이번 달 양수(기타비용 신규 발생) | 해당 항목 `flag='NEW_COST'`, `prev=0`, `curr=200,000` |
| QA-08 | 적자 축소(−1,000,000 → −500,000) | `status='PROFIT_UP'`, `heroTier={적자 축소, warning}`, `headline`="적자 규모가 500,000원 줄었습니다." |
| QA-08b | 적자 축소, 사용자 예시(−3,000,000 → −1,000,000) | `status='PROFIT_UP'`, `headline`="적자 규모가 2,000,000원 줄었습니다." |
| QA-09 | 적자 전환(+500,000 → −500,000) | `status='PROFIT_DOWN'`, `heroTier={적자 전환, danger}`, `headline`="이번 달 적자로 전환되었습니다." |
| QA-09b | 적자 전환, 사용자 예시(+1,000,000 → −500,000) | `status='PROFIT_DOWN'`, `profitChange=-1,500,000`, `headline`="이번 달 적자로 전환되었습니다." |
| QA-09c | 적자 확대(−1,000,000 → −2,000,000) | `status='PROFIT_DOWN'`, `heroTier={적자 확대, danger}`, `headline`="적자 규모가 1,000,000원 늘었습니다." |
| QA-16 | 적자 유지(−1,500,000 → −1,500,000, 항목만 상쇄 이동) | `profitChange=0`, `status='PROFIT_SAME_BUT_ITEMS_CHANGED'`, `heroTier={적자 유지, warning}`, `headline`="적자 규모가 지난달과 같습니다." |
| QA-17 | 흑자 전환(−500,000 → +1,000,000) | `status='PROFIT_UP'`, `heroTier={흑자 전환, success}`, `headline`="이번 달 흑자로 전환되었습니다." |
| QA-10 | 전부 0 | `status='NO_DATA'`, `heroTier={데이터 없음, ''}`, `headline`="비교할 숫자가 없습니다.", `topImpactLine=''`, `notCauseLine=''` |
| QA-11 | 쉼표·원화기호 입력 normalize | `"10,000,000원"` → `10000000`, `"3,000,000"` → `3000000` |
| QA-12 | 소수점 반올림 | `1000.4` → `1000`, `1000.5` → `1001` |
| QA-13 | 안전정수 초과 | `Number.MAX_SAFE_INTEGER + 10` 입력 시 `RangeError` |
| QA-14 | 영향 합계 == 이익 증감 항등식(임의 값) | `Σ rankedImpacts[].impact === profitChange` |
| QA-15 | 필수 검증 케이스(기획문서 예시) | `profitPrev=4,000,000` / `profitCurr=1,500,000` / `profitChange=-2,500,000` / `status='PROFIT_DOWN'` / 최대 영향 항목=`foodCost`(impact `-1,500,000`) / 영향 순위 상위 4개=`[foodCost, laborCost, platformFee, otherCost]` / 영향 합계=`-2,500,000` |
| QA-18 | 워터폴 좌표 A: 적자 축소(−3,000,000 → −1,000,000, 매출 +2,000,000) | `zeroPct=100`, 지난달(left 0/width 100), 매출(left 0/width 66.67), 이번 달(left 66.67/width 33.33) |
| QA-19 | 워터폴 좌표 B: 적자 전환(+1,000,000 → −500,000, 매출 −1,500,000) | `zeroPct=33.33`, 지난달(left 33.33/width 66.67), 매출(left 0/width 100), 이번 달(left 0/width 33.33) |
| QA-20 | 워터폴 좌표 C: 기획문서 검증 케이스(전부 양수) | `zeroPct=0`, 지난달(left 0/width 100), 식재료비(left 62.5/width 37.5), 이번 달(left 0/width 37.5) — v1.1과 좌표 동일 |

## 필수 검증 케이스 실측값 (QA-15 / QA-20)

입력:
- 지난달: 매출 30,000,000 / 식재료비 11,000,000 / 인건비 7,000,000 / 임대료 3,000,000 / 수수료 2,000,000 / 기타비용 3,000,000
- 이번 달: 매출 30,000,000 / 식재료비 12,500,000 / 인건비 7,800,000 / 임대료 3,000,000 / 수수료 2,100,000 / 기타비용 3,100,000

실제 출력(2026-09-17, 워터폴 버그 수정·배지 9분기 개편 후에도 개편 전과 수치 동일 확인):
```
status: PROFIT_DOWN
heroTier: { label: '이익 감소', tone: 'danger' }
profitPrev: 4,000,000원
profitCurr: 1,500,000원
profitChange / heroAmount: -2,500,000
headline: 이번 달 이익이 지난달보다 2,500,000원 줄었습니다.
topImpactLine: 이익 변동에 가장 큰 영향을 준 항목은 1,500,000원 변화한 식재료비입니다.
rankedImpacts: 식재료비 -1,500,000 > 인건비 -800,000 > 수수료 -100,000 > 기타비용 -100,000 > 매출 0 > 임대료 0
영향 합계: -2,500,000 (profitChange와 일치)
워터폴: 지난달(left 0%/width 100%) · 식재료비(left 62.5%/width 37.5%) · 이번 달(left 0%/width 37.5%) · zeroPct 0%
```
