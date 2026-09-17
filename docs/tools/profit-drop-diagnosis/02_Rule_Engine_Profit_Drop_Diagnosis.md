# Rule Engine 설계 — 이익 변동 진단

기준 문서: `08_BenefitsON_Rule_Engine_Standard_v1.0`. 카테고리 접두어는 이익 변동 상태 판정이므로
**`PDD`**(Profit Drop Diagnosis) 를 신설한다.

이 문서는 `engine/profit-analyzer.js` 의 `STATUS` / `describeStatus()` / `buildHeadline()` /
`rankImpacts()` / `ACTION_TABLE` 과 **1:1로 대응**한다. 한쪽을 고치면 다른 쪽과 `CHANGELOG.md` 를
함께 갱신한다.

원칙: 동일 입력 → 동일 출력. 난수·시간·로케일 의존 금지. "원인"이라는 단어를 쓰지 않는다 —
항상 "이익 변동에 영향을 준 항목"으로 표현한다.

> **v1.1 변경**: `analyze()` 반환 형태를 `headline` 한 문장 조립에서
> `heroLabel`/`heroAmount`/`headline`/`topImpactLine`/`notCauseLine` 5개 필드로 분리했다.
> 동시에 상태를 `{id, tone, label}` 오브젝트에서 문자열 enum(`status`)으로 단순화하면서,
> 적자 전환·적자 축소 전용 상태(구 `DEFICIT_FLIP`/`DEFICIT_REDUCED`)를 없애고
> 이익 증감의 부호만으로 판정하도록 통합했다(`status` 는 흑자/적자 구분 없이 부호만 본다).
> 이 변경으로도 **금액·순위 계산 로직은 전혀 바뀌지 않았다** — 문구 조립 방식과 상태 분류만 바뀌었다.
>
> **주의(v1.1.1 수정)**: `status` 를 합친다고 해서 **문구까지 "줄었다/늘었다"로 뭉개면 안 된다.**
> 두 기간이 모두 적자인데 적자가 줄었을 뿐인 경우 `status='PROFIT_UP'` + "늘었습니다"만 보여주면
> 흑자로 착각할 수 있다. 그래서 `headline` 은 `status` 뿐 아니라 `profitPrev`/`profitCurr` 부호도
> 함께 보고, 적자 축소·적자 전환일 때는 구 `DEFICIT_REDUCED`/`DEFICIT_FLIP` 과 동일한 문구를 그대로
> 낸다(아래 PDD-DOWN/PDD-UP 참고). **`status` enum 은 5종으로 유지하되 `headline` 문장은 상황별로
> 분기한다** — 이것이 이 엔진의 실제 동작이다.

## 표준 면책문구

> 본 도구는 입력하신 숫자를 비교·계산하는 참고용 도구이며 세무·회계 자문이 아닙니다.
> 매출·비용 항목의 변화만으로 거래의 실제 원인이나 적정 원가율을 단정하지 않습니다.

## 파생값

| 이름 | 정의 |
|---|---|
| `profitPrev` | 지난달 매출 − (식재료비+인건비+임대료+수수료+기타비용) |
| `profitCurr` | 이번 달 매출 − (식재료비+인건비+임대료+수수료+기타비용) |
| `profitChange` | `profitCurr − profitPrev` (= `heroAmount`) |
| `deltas[id]` | 항목별 원시 증감 = 이번 달 값 − 지난달 값 (`rankedImpacts[].delta`) |
| `impact[id]` | 항목별 이익 영향. 비용 항목은 `−deltas[id]`, 매출은 `+deltas[id]` |
| `allZero` | 두 기간의 12개 값이 모두 0 |
| `allItemsSame` | 6개 항목의 `deltas` 가 모두 0 |

**항등식(불변)**: `Σ impact[id] === profitChange`. 항상 성립해야 하며 테스트로 검증한다.

---

## 상태 규칙 (PDD)

평가 순서: **PDD-NODATA → PDD-DOWN → PDD-UP → PDD-SAME → PDD-CHANGED** (먼저 참이 되는 규칙 적용).

### PDD-NODATA — 전부 0
```
IF   allZero
THEN status = NO_DATA
     headline = "비교할 숫자가 없습니다."
     topImpactLine = ""   notCauseLine = ""
```

### PDD-DOWN — 이익 감소 (적자 전환 포함)
```
IF   profitChange < 0
THEN status = PROFIT_DOWN
     IF   profitPrev ≥ 0  AND  profitCurr < 0
     THEN headline = "이번 달 적자로 전환되었습니다."          (구 DEFICIT_FLIP 과 동일 문구)
     ELSE headline = "이번 달 이익이 지난달보다 {−profitChange}원 줄었습니다."
```
`status` 는 흑자→적자 전환도 그냥 `PROFIT_DOWN` 이지만(별도 enum 없음), **`headline` 문구는
구 `DEFICIT_FLIP` 과 동일하게 "적자로 전환되었습니다"를 낸다.** 두 기간 모두 적자이면서 더
악화된 경우(예: −100만→−200만)는 이 분기에 해당하지 않아 일반 "줄었습니다" 문구를 쓴다.

### PDD-UP — 이익 증가 (적자 축소 포함)
```
IF   profitChange > 0
THEN status = PROFIT_UP
     IF   profitPrev < 0  AND  profitCurr < 0
     THEN headline = "적자 규모가 {profitChange}원 줄었습니다."   (구 DEFICIT_REDUCED 과 동일 문구)
     ELSE headline = "이번 달 이익이 지난달보다 {profitChange}원 늘었습니다."
```
`status` 는 적자 축소도 그냥 `PROFIT_UP` 이지만(별도 enum 없음), **두 기간이 모두 적자일 때는
`headline` 이 구 `DEFICIT_REDUCED` 와 동일하게 "적자 규모가 ~ 줄었습니다"를 낸다** — 여전히
적자인 상태를 "늘었습니다"라고만 표시해 흑자로 오해하게 만들지 않기 위함이다.

### PDD-SAME — 이익 동일, 항목도 전부 동일
```
IF   profitChange = 0  AND  allItemsSame
THEN status = PROFIT_SAME
     headline = "지난달과 이번 달 이익이 같습니다."
```

### PDD-CHANGED — 이익 동일, 항목은 변화
```
IF   profitChange = 0  AND  NOT allItemsSame
THEN status = PROFIT_SAME_BUT_ITEMS_CHANGED
     headline = "이익은 지난달과 같지만, 항목별로는 변화가 있었습니다."
```

### 1등 항목 문장 — `topImpactLine` / `notCauseLine`
```
IF   NOT allZero  AND  rankedImpacts[0].impact ≠ 0
THEN topImpactLine = "이익 변동에 가장 큰 영향을 준 항목은 {|rankedImpacts[0].delta|}원 변화한 {rankedImpacts[0].name}입니다."
     notCauseLine   = "다만 이것은 \"{rankedImpacts[0].name}가 원인이다\"라는 뜻이 아니라, 숫자상 영향이 가장 크다는 뜻입니다.
                        실제 원인은 거래내역을 확인해야 알 수 있습니다."
ELSE IF allZero
THEN topImpactLine = ""   notCauseLine = ""
ELSE  (항목 변화 없음 — impact 전부 0)
THEN topImpactLine = ""   notCauseLine = "항목별 변화가 없어 순위를 매길 수 없습니다."
```
`rankedImpacts[0]` 을 그대로 쓰며 별도로 최댓값을 다시 계산하지 않는다(동점 처리 일관성 보장).
`notCauseLine` 은 화면에서 워터폴 바로 아래(1등 바로 밑)에 노출한다 — 오해가 생기는 그 자리.

### 항목별 플래그 (`rankedImpacts[].flag`)
```
IF   prev[id] = 0  AND  curr[id] > 0   THEN flag = NEW_COST    (화면 배지: "신규 발생")
IF   prev[id] > 0  AND  curr[id] = 0   THEN flag = COST_ENDED  (화면 배지: "이번 달 없음")
ELSE                                        flag = null
```
배지 문구는 UI(`app.js`)가 `flag` 값으로부터 매핑한다. 엔진은 열거값(enum)만 반환한다.

---

## 영향 순위 규칙

절대 영향액(`|impact|`) 내림차순. 동률이면 다음 순서로 고정 타이브레이크:

```
매출 → 식재료비 → 인건비 → 수수료 → 임대료 → 기타비용
```

## 다음 확인 (행동 힌트, `actionHints[]`)

원인을 단정하지 않고 "1차 확인 순서"만 안내한다. `impact ≠ 0` 인 항목만, 영향 순위 순서로 제공.
각 원소: `{ id, name, impact, text, toolUrl|null }`.

| 항목 | 1차 확인 메시지 | 관련 도구 |
|---|---|---|
| 식재료비/상품매입비(`foodCost`) | 주요 원재료 단가, 폐기·로스, 매입량 변화 확인 | 없음 |
| 인건비(`laborCost`) | 근무시간, 인원, 영업일수, 추가수당 변화 확인 | `/pages/calc-retirement-pay` |
| 플랫폼·결제 수수료(`platformFee`) | 배달·결제 수수료율과 주문 구성 변화 확인 | `/pages/tools/delivery-fee-calc/` |
| 매출(`sales`) | 고객수와 객단가 변화를 구분해 확인 | `/pages/tools/business-survival-calc/` |
| 임대료(`rent`) | 월세 변경·관리비·추가비용 여부 확인 | 없음 |
| 기타비용(`otherCost`) | 큰 단일 비용부터 거래내역 확인 | 없음 |

## 상시 캡션 (`caveats[]`)

```
숫자 변화 기준으로 확인할 항목을 보여드립니다. 실제 원인은 거래내역을 확인해야 합니다.
```

## `analyze(prev, curr)` 반환 형태 (v1.1)

```
{
  profitPrev, profitCurr, profitChange,      // 숫자
  status,                                     // 'NO_DATA'|'PROFIT_DOWN'|'PROFIT_UP'|'PROFIT_SAME'|'PROFIT_SAME_BUT_ITEMS_CHANGED'
  heroLabel,                                  // "이익 변동" (고정)
  heroAmount,                                 // = profitChange. 포맷은 UI(formatWon)에서.
  headline,                                   // 1차 상태 문장
  topImpactLine,                              // 1등 항목 문장 (없으면 "")
  notCauseLine,                               // "원인 아님" 문장 (없으면 "")
  rankedImpacts,                              // [{ id, name, delta, impact, prev, curr, flag }]
  actionHints,                                // [{ id, name, impact, text, toolUrl }]
  caveats,                                    // [string]
}
```
