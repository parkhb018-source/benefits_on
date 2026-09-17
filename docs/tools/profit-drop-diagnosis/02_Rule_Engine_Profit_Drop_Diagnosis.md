# Rule Engine 설계 — 이익 변동 진단

기준 문서: `08_BenefitsON_Rule_Engine_Standard_v1.0`. 카테고리 접두어는 이익 변동 상태 판정이므로
**`PDD`**(Profit Drop Diagnosis) 를 신설한다.

이 문서는 `engine/profit-analyzer.js` 의 `STATUS` / `describeStatus()` / `describeOutcome()` /
`rankImpacts()` / `ACTION_TABLE` / `computeWaterfallLayout()` 과 **1:1로 대응**한다. 한쪽을 고치면
다른 쪽과 `CHANGELOG.md` 를 함께 갱신한다.

원칙: 동일 입력 → 동일 출력. 난수·시간·로케일 의존 금지. "원인"이라는 단어를 쓰지 않는다 —
항상 "이익 변동에 영향을 준 항목"으로 표현한다.

> **v1.2 변경 요약**: `status` enum(`NO_DATA`/`PROFIT_DOWN`/`PROFIT_UP`/`PROFIT_SAME`/
> `PROFIT_SAME_BUT_ITEMS_CHANGED`, 5종)은 그대로 유지하되(`describeStatus()`, 이익 증감의
> 부호만 본다), **배지(`heroTier`)와 `headline` 문구는 별도 함수 `describeOutcome()`이
> `profitPrev`/`profitCurr`의 부호까지 함께 보고 9가지 상황으로 나눠 같은 분기에서 함께
> 결정**한다(핵심 원칙: 아직 적자인데 success 톤을 쓰지 않는다 — 아래 상태 규칙 표 참고).
> 또한 워터폴 그리기 좌표를 `computeWaterfallLayout()`으로 분리해 0 기준선이 있는 양방향
> 축으로 바꿨다(이전엔 `Math.max(0, ...)`로 음수 구간이 잘려 적자 구간이 전혀 표현되지
> 않던 버그 수정). **이 변경들로도 금액·순위·영향 합계 계산 로직은 전혀 바뀌지 않았다.**

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

`status`(enum, `describeStatus()`)와 `heroTier`+`headline`(`describeOutcome()`)은 **서로 다른
함수가 계산하지만 같은 입력을 본다.** `status` 는 이익 증감 부호만, `describeOutcome()` 은 거기에
더해 `profitPrev`/`profitCurr` 의 부호(흑자/적자 여부)까지 봐서 9가지 조합으로 나눈다.

평가 순서(`describeOutcome()`): **allZero → (흑자→적자 전환) → (적자→흑자 전환) →
(둘 다 적자: 축소/확대/유지) → (둘 다 흑자: 감소/증가/동일)** — 먼저 참이 되는 분기 적용.

| # | 조건 (prev/curr/change 부호) | `status` | `heroTier.label` | `heroTier.tone` | `headline` |
|---|---|---|---|---|---|
| 1 | prev≥0, curr≥0, change<0 | `PROFIT_DOWN` | 이익 감소 | `danger` | 이번 달 이익이 지난달보다 N원 줄었습니다. |
| 2 | prev≥0, curr≥0, change>0 | `PROFIT_UP` | 이익 증가 | `success` | 이번 달 이익이 지난달보다 N원 늘었습니다. |
| 3 | change=0, 항목 변화 있음 | `PROFIT_SAME_BUT_ITEMS_CHANGED` | 이익 동일 | *(기본)* | 이익은 지난달과 같지만, 항목별로는 변화가 있었습니다. |
| 4 | change=0, 항목 변화 없음 | `PROFIT_SAME` | 변화 없음 | *(기본)* | 지난달과 이번 달 이익이 같습니다. |
| 5 | prev<0, curr<0, change>0 | `PROFIT_UP` | 적자 축소 | `warning` | 적자 규모가 N원 줄었습니다. |
| 6 | prev<0, curr<0, change<0 | `PROFIT_DOWN` | 적자 확대 | `danger` | 적자 규모가 N원 늘었습니다. |
| 7 | prev<0, curr<0, change=0 | `PROFIT_SAME` 또는 `PROFIT_SAME_BUT_ITEMS_CHANGED`(항목 변화 여부에 따름) | 적자 유지 | `warning` | 적자 규모가 지난달과 같습니다. |
| 8 | prev≥0, curr<0 (자동으로 change<0) | `PROFIT_DOWN` | 적자 전환 | `danger` | 이번 달 적자로 전환되었습니다. |
| 9 | prev<0, curr≥0 (자동으로 change>0) | `PROFIT_UP` | 흑자 전환 | `success` | 이번 달 흑자로 전환되었습니다. |
| — | allZero | `NO_DATA` | 데이터 없음 | *(기본)* | 비교할 숫자가 없습니다. |

**핵심 원칙: 아직 적자인데 success(초록) 톤을 쓰지 않는다.** 행 5·7의 `tone` 이 `success` 가
아니라 `warning` 인 이유가 이것이다 — 적자 규모가 줄거나 그대로여도 여전히 적자이므로,
"좋아졌다"는 인상을 주는 초록보다 "아직 주의가 필요하다"는 주황을 쓴다. 반대로 행 6(적자 확대)은
`PROFIT_DOWN` 이지만 이미 danger 인 행 1과 톤이 같아 자연스럽게 구분되지 않는데, 이는 의도된
것이다(적자든 흑자든 "악화"는 danger 로 통일). 행 8·9(부호 자체가 바뀌는 전환)는 `profitChange`
의 부호가 항상 결정되어 있으므로(흑자→적자는 반드시 감소, 적자→흑자는 반드시 증가) 별도의
`profitChange` 조건 분기가 필요 없다.

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

## `analyze(prev, curr)` 반환 형태 (v1.2)

```
{
  profitPrev, profitCurr, profitChange,      // 숫자
  status,                                     // 'NO_DATA'|'PROFIT_DOWN'|'PROFIT_UP'|'PROFIT_SAME'|'PROFIT_SAME_BUT_ITEMS_CHANGED'
  heroLabel,                                  // "이익 변동" (고정)
  heroAmount,                                 // = profitChange. 포맷은 UI(formatWon)에서.
  heroTier,                                   // { label, tone } — tone: 'danger'|'success'|'warning'|'' (기본)
  headline,                                   // 1차 상태 문장 (heroTier 와 같은 분기에서 함께 결정)
  topImpactLine,                              // 1등 항목 문장 (없으면 "")
  notCauseLine,                               // "원인 아님" 문장 (없으면 "")
  rankedImpacts,                              // [{ id, name, delta, impact, prev, curr, flag }]
  actionHints,                                // [{ id, name, impact, text, toolUrl }]
  caveats,                                    // [string]
}
```

## `computeWaterfallLayout(a)` — 워터폴 그리기 좌표 (v1.2 신설)

`analyze()` 의 결과(`profitPrev`/`profitCurr`/`rankedImpacts`)를 받아 워터폴 막대의 `left`/`width`
좌표(0~100, %)를 계산하는 순수 함수. **"그리기 방식"이지 "문구"가 아니지만**, DOM 의존 없이
결정적이고 테스트가 필요해 이 파일에 함께 둔다. `app.js` 는 이 좌표를 그대로 스타일에 꽂기만 한다.

```
IF   0 기준선이 없는 기존 방식(Math.max(0,...))은 이익이 음수면 left 가 전부 0으로 잘려
     적자 구간이 전혀 표현되지 않았다 (v1.2 버그 수정 대상)
THEN 0 을 포함한 양방향 축으로 바꾼다:

  stops = [0, profitPrev, profitCurr, ...(rankedImpacts 중 impact≠0 인 항목을 누적한 중간값들)]
  domainMin = min(stops)   domainMax = max(stops)   span = (domainMax - domainMin) || 1
  x(v) = (v - domainMin) / span * 100                 // 0~100 스케일

  지난달 이익 막대: left = x(min(0, profitPrev))   width = |x(profitPrev) - x(0)|
  각 영향 막대(from→to 누적):  left = x(min(from, to))   width = |x(to) - x(from)|
  이번 달 이익 막대: left = x(min(0, profitCurr))   width = |x(profitCurr) - x(0)|
  모든 폭은 최소 0.8(%) 보장 — 폭이 0에 가까운 막대도 보이게.

  zeroPct = x(0)   // 트랙에 0 기준선을 그리는 위치. domainMin=0(전부 양수)이면 0%(왼쪽 끝)라
                    // 사실상 안 보여도 무방하지만, 조건 분기 없이 항상 그린다.
```

색상 규칙: 지난달/이번 달 이익 막대는 값이 음수면 danger(빨강), 0 이상이면 기존처럼
`.wf-bar.base`(지난달, 회색)/`.wf-bar.final`(이번 달, 파랑). 영향 막대는 기존과 동일하게
`impact>0` 이면 `.pos`(초록), 아니면 기본(빨강). 금액 텍스트는 항상 부호를 표기한다
(`-3,000,000` / `+2,000,000`) — 색만으로 증감을 구분하지 않는다(규약).

전부 양수인 도메인(모든 stops ≥ 0)에서는 `domainMin=0` 이 되어 **개편 전(v1.1)과 좌표값이
동일하다** — 기획문서 검증 케이스로 확인(QA-20).

---

## 수수료 계산 보조 엔진 (`engine/fee-calc.js`, v1.3 신설)

수수료 행(`platformFee`) 입력을 돕는 별도 계산창(카드수수료·배달수수료)의 계산식.
`analyze()`/`computeWaterfallLayout()`(진단 로직)과는 완전히 독립된 순수 함수이며,
결과는 오직 `platformFee` 입력칸에 값을 채워 넣는 데만 쓰인다 — 진단 계산·상태 판정에 관여하지 않는다.

### 카드수수료 — `CARD_RATE_TIERS` / `calcCardFee({ tier, cardSales })`

우대수수료율(금융위 고시) 기준. 기본은 신용카드 요율로 계산한다.

| 연매출 구간 (`id`) | 신용카드(`credit`) | 체크카드(`check`) |
|---|---|---|
| 3억 이하 (`under3`) | 0.40% | 0.15% |
| 3~5억 (`3to5`) | 1.00% | 0.75% |
| 5~10억 (`5to10`) | 1.15% | 0.90% |
| 10~30억 (`10to30`) | 1.45% | 1.15% |
| 30억 초과 (`over30`) | 우대 대상 아님 (계산 안 함) | 우대 대상 아님 |

```
IF   tier = 'over30'
THEN { rate: null, fee: null, note: CARD_OVER30_NOTE }   // 계산하지 않고 안내만
ELSE { rate: tier.credit, fee: round(cardSales × tier.credit / 100), note: null }
```
`note`(30억 초과 전용 안내)와 별개로, 계산이 된 경우 UI는 "체크카드 비중이 높으면 실제 수수료는
이보다 낮습니다" 안내를 항상 함께 보여준다(고정 문구, `app.js`).

### 배달수수료 — `DELIVERY_RATES` / `calcDeliveryFee(selections)`

> **이 값은 `pages/tools/delivery-fee-calc/script.js` 의 `PLATFORM_RATES` 와 반드시 일치해야
> 한다.** 두 파일 모두 `<script>` 로만 로드되는 무빌드 도구라 import 를 공유할 수 없어 값을
> 각자 갖고 있고, `scripts/build-pages.js` 가 빌드 시점에 두 값을 파싱·대조해 다르면 빌드를
> 실패시킨다(드리프트 가드).

| 배달앱 | 중개수수료(`brokerage`) | 결제수수료(`payment`) | 합계 |
|---|---|---|---|
| 배민 (`baemin`) | 7.8% | 3.0% | 10.8% |
| 쿠팡이츠 (`coupangeats`) | 7.8% | 3.0% | 10.8% |
| 요기요 (`yogiyo`) | 9.7% | 3.0% | 12.7% |

```
calcDeliveryFee([{ platform, sales }, ...]) →
  perPlatform: [{ platform, name, brokerage: round(sales×brokerage%), payment: round(sales×payment%), fee: brokerage+payment }, ...]
  total: Σ perPlatform[].fee
```
화면에는 중개·결제를 항상 나눠서 보여준다(합계만 보이면 왜 그 금액인지 알 수 없음). 배민1플러스·
쿠팡이츠 상생요금제(매출 상위 비율에 따라 중개수수료 2.0~7.8% 차등)와 부가세 10% 별도 안내는
고정 문구로 항상 노출한다(`app.js`).

### 합산 — `sumFees({ card, delivery })`

```
sumFees({ card, delivery }) = (card?.fee 가 숫자면 그 값, 아니면 0) + (delivery?.total 이 숫자면 그 값, 아니면 0)
```
`card.fee`는 30억 초과(`note` 있음)일 때 `null` — 이 경우 0으로 취급되어 배달수수료만 합산된다.
UI 는 이 합계를 "지난달 수수료에 넣기"/"이번 달 수수료에 넣기" 버튼으로 해당 `platformFee` 칸에
**덮어쓰기**(누적 아님)로 반영한다.
