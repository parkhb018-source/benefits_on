# Rule Engine 설계 — 이익 변동 진단

기준 문서: `08_BenefitsON_Rule_Engine_Standard_v1.0`. 카테고리 접두어는 이익 변동 상태 판정이므로
**`PDD`**(Profit Drop Diagnosis) 를 신설한다.

이 문서는 `engine/profit-analyzer.js` 의 `STATUS` / `describeStatus()` / `rankImpacts()` /
`ACTION_TABLE` 과 **1:1로 대응**한다. 한쪽을 고치면 다른 쪽과 `CHANGELOG.md` 를 함께 갱신한다.

원칙: 동일 입력 → 동일 출력. 난수·시간·로케일 의존 금지. "원인"이라는 단어를 쓰지 않는다 —
항상 "이익 변동에 영향을 준 항목"으로 표현한다.

## 표준 면책문구

> 본 도구는 입력하신 숫자를 비교·계산하는 참고용 도구이며 세무·회계 자문이 아닙니다.
> 매출·비용 항목의 변화만으로 거래의 실제 원인이나 적정 원가율을 단정하지 않습니다.

## 파생값

| 이름 | 정의 |
|---|---|
| `profitPrev` | 지난달 매출 − (식재료비+인건비+임대료+수수료+기타) |
| `profitCurr` | 이번 달 매출 − (식재료비+인건비+임대료+수수료+기타) |
| `profitChange` | `profitCurr − profitPrev` |
| `deltas[key]` | 항목별 원시 증감 = 이번 달 값 − 지난달 값 |
| `impact[key]` | 항목별 이익 영향. 비용 항목은 `−deltas[key]`, 매출은 `+deltas[key]` |
| `allZero` | 두 기간의 12개 값이 모두 0 |
| `allItemsSame` | 6개 항목의 `deltas` 가 모두 0 |

**항등식(불변)**: `Σ impact[key] === profitChange`. 항상 성립해야 하며 테스트로 검증한다.

---

## 상태 규칙 (PDD)

평가 순서: **PDD-ALLZERO → PDD-FLIP → PDD-REDUCED → PDD-DECREASE → PDD-INCREASE → PDD-SAME → PDD-CHANGED**
(먼저 참이 되는 규칙 적용). `tone` 은 혜택on report-card 톤: `success`(개선) / `warning`(악화) / `info`(중립).

### PDD-ALLZERO — 전부 0
```
IF   allZero
THEN 비교할 숫자가 없습니다.
```
Status id: `ALL_ZERO` · Label: 데이터 없음 · Tone: info

### PDD-FLIP — 적자 전환
```
IF   profitPrev ≥ 0  AND  profitCurr < 0
THEN 이번 달 적자로 전환되었습니다.
```
Status id: `DEFICIT_FLIP` · Label: 적자 전환 · Tone: warning

### PDD-REDUCED — 적자 축소
```
IF   profitPrev < 0  AND  profitCurr < 0  AND  profitChange > 0
THEN 적자 규모가 {profitChange}원 줄었습니다.
```
Status id: `DEFICIT_REDUCED` · Label: 적자 축소 · Tone: success

### PDD-DECREASE — 이익 감소
```
IF   profitChange < 0   (위 규칙에 해당하지 않는 나머지 감소)
THEN 이번 달 이익이 지난달보다 {−profitChange}원 줄었습니다.
```
Status id: `DECREASE` · Label: 이익 감소 · Tone: warning

### PDD-INCREASE — 이익 증가
```
IF   profitChange > 0
THEN 이번 달 이익이 지난달보다 {profitChange}원 늘었습니다.
```
Status id: `INCREASE` · Label: 이익 증가 · Tone: success

### PDD-SAME — 이익 동일, 항목도 전부 동일
```
IF   profitChange = 0  AND  allItemsSame
THEN 지난달과 이번 달 이익이 같습니다.
```
Status id: `SAME` · Label: 변동 없음 · Tone: info

### PDD-CHANGED — 이익 동일, 항목은 변화
```
IF   profitChange = 0  AND  NOT allItemsSame
THEN 이익은 지난달과 같지만, 항목별로는 변화가 있었습니다.
```
Status id: `SAME_ITEMS_CHANGED` · Label: 항목 변화 · Tone: info

### 항상 덧붙는 문구 — 가장 큰 영향 항목
```
IF   NOT allZero  AND  rankedImpacts[0].impact ≠ 0
THEN 이익 변동에 가장 큰 영향을 준 항목은 {|rankedImpacts[0].delta|}원 변화한 {rankedImpacts[0].label}입니다.
```
위 상태 메시지 뒤에 이어 붙여 `headline` 을 구성한다. `rankedImpacts[0]` 을 그대로 쓰며
별도로 최댓값을 다시 계산하지 않는다(동점 처리 일관성 보장).

### 항목별 부가 안내 (전월 0/이번 달 0 전환)
```
IF   prev[key] = 0  AND  curr[key] > 0
THEN 지난달 0원 → 이번 달 {curr[key]}원 (신규 발생)

IF   prev[key] > 0  AND  curr[key] = 0
THEN 지난달 {prev[key]}원 → 이번 달 0원 (이번 달엔 발생하지 않음)
```
각 `rankedImpacts[]` 항목의 `note` 필드로 제공한다.

---

## 영향 순위 규칙

절대 영향액(`|impact|`) 내림차순. 동률이면 다음 순서로 고정 타이브레이크:

```
매출 → 식재료비 → 인건비 → 수수료 → 임대료 → 기타
```

## 다음 확인 (행동 힌트, ACTION_TABLE)

원인을 단정하지 않고 "1차 확인 순서"만 안내한다. `impact ≠ 0` 인 항목만, 영향 순위 순서로 제공.

| 항목 | 1차 확인 메시지 | 관련 도구 |
|---|---|---|
| 식재료비/상품매입비(`foodCost`) | 주요 원재료 단가, 폐기·로스, 매입량 변화 확인 | 없음 |
| 인건비(`laborCost`) | 근무시간, 인원, 영업일수, 추가수당 변화 확인 | `/pages/calc-retirement-pay` |
| 플랫폼·결제 수수료(`platformFee`) | 배달·결제 수수료율과 주문 구성 변화 확인 | `/pages/tools/delivery-fee-calc/` |
| 매출(`sales`) | 고객수와 객단가 변화를 구분해 확인 | `/pages/tools/business-survival-calc/` |
| 임대료(`rent`) | 월세 변경·관리비·추가비용 여부 확인 | 없음 |
| 기타비용(`otherCost`) | 큰 단일 비용부터 거래내역 확인 | 없음 |

## 상시 캡션 (caveats)

```
숫자 변화 기준으로 확인할 항목을 보여드립니다. 실제 원인은 거래내역을 확인해야 합니다.
```
