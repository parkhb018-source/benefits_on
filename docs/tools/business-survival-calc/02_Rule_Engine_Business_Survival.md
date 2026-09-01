# Rule Engine 설계 — 사업 생존기간 계산기

기준 문서: `08_BenefitsON_Rule_Engine_Standard_v1.0`. 카테고리 접두어는 순수 산술·재무 판정이므로 **`CAL`(계산)** 을 사용하고, 생존기간 상태 판정은 **`SURV`** 를 신설한다.

이 문서는 `engine/survival-calculator.js` 의 `STATUS_RULES` / `analysisCards()` 와 **1:1로 대응**한다. 한쪽을 고치면 다른 쪽과 `CHANGELOG.md` 를 함께 갱신한다.

원칙: 동일 입력 → 동일 출력. 난수·시간·로케일 의존 금지. 모호한 표현 금지. 모든 결과는 근거(BECAUSE)와 권장 행동(ACTION)을 가진다.

## 표준 면책문구 (Rule Engine Standard 17번 준용)

> 본 계산은 매월 조건이 일정하다고 가정한 시뮬레이션입니다. 계절성, 세금, 미수금, 재고, 예상치 못한 지출 등 실제 사업 변수는 반영되지 않으며, 전문적인 재무·세무 자문이 아닙니다.

## 파생값

| 이름 | 정의 |
|---|---|
| `monthlyCashFlow` | 월평균 매출 − 변동비 − 고정비 − 기타 현금 유출 |
| `monthlyDecrease` | `monthlyCashFlow < 0` 이면 `|monthlyCashFlow|`, 아니면 0 |
| `usable` | 현재 보유 현금 − 최소 유지 현금 |
| `months` | `usable / monthlyDecrease` (상한 120) |
| `variableRatio` | 변동비 ÷ 매출 (매출 0이면 정의 안 됨) |
| `fixedRatio` | 고정비 ÷ 매출 (매출 0이면 정의 안 됨) |
| `gap` | 손익분기까지 부족액 = `−monthlyCashFlow` (> 0 이면 적자) |

---

## 상태 규칙 (SURV)

평가 순서: **SURV-005 → SURV-001 → SURV-002 → SURV-003 → SURV-004** (먼저 참이 되는 규칙 적용).
아래 `IF` 는 각 규칙의 **논리 조건**이다. 코드(`STATUS_RULES`)는 순서에 의존해 상한을 생략한다
(예: SURV-003 은 `months ≥ 3`, SURV-004 는 무조건 — 앞 규칙이 이미 6개월·infinite·belowReserve 를 걸러냄).
`tone` 은 혜택on report-card 톤: `success`(안정) / `info`(주의) / `warning`(경고·위험).

### SURV-005 — 최소 유지 현금 이하
```
IF   usable ≤ 0
THEN 현재 보유 현금이 이미 최소 유지 현금 이하입니다.
BECAUSE (현재 보유 현금 − 최소 유지 현금)이 0원 이하이므로 사용 가능한 여유 현금이 없습니다.
ACTION  지출 구조를 즉시 점검하고, 정책자금·긴급경영안정자금 등 자금 지원을 알아보세요.
```
Label: 위험 · Tone: warning · Priority: Critical

### SURV-001 — 안정
```
IF   monthlyCashFlow ≥ 0   (= 현금 감소 없음 / infinite)
THEN 월 현금흐름이 흑자라 현재 조건에서는 현금이 줄지 않습니다.
BECAUSE 월 현금흐름(매출 − 변동비 − 고정비 − 기타 유출)이 0원 이상입니다.
ACTION  현재 운영을 유지하되, 매출 10~30% 감소 시나리오의 결과를 함께 확인해 두세요.
```
Label: 안정 · Tone: success
비고: **"안정"은 흑자일 때만.** 월 현금흐름이 적자이면 현금 소진까지 아무리 오래 남아도
     최대 "주의"(SURV-002)로 표시한다. (v1.2 정책 — 최초 승인본 12개월 → v1.1 24개월 → v1.2 흑자한정)

### SURV-002 — 주의
```
IF   NOT infinite  AND  months ≥ 6
THEN 현재 적자 상태로, 유지되면 현금이 계속 줄어듭니다.
BECAUSE 월 현금흐름이 적자입니다. 현금 소진까지 6개월 이상 남았더라도, 적자 상태에서는 최소 "주의"로 표시합니다.
ACTION  고정비 절감 시나리오를 확인하고, 흑자 전환 계획(매출 확대 또는 비용 절감)을 세우세요.
```
Label: 주의 · Tone: info

### SURV-003 — 경고
```
IF   3 ≤ months < 6
THEN 3~6개월 안에 현금이 소진될 수 있습니다.
BECAUSE 생존기간이 3개월 이상 6개월 미만으로 계산됩니다.
ACTION  변동비·고정비를 항목별로 재검토하고, 소상공인 정책자금 상담을 권장합니다.
```
Label: 경고 · Tone: warning

### SURV-004 — 위험
```
IF   months < 3
THEN 3개월 이내에 현금이 소진될 수 있습니다.
BECAUSE 생존기간이 3개월 미만으로 계산됩니다.
ACTION  지출 축소와 자금 확보를 즉시 실행하고, 전문가(세무사·경영지도사) 상담을 권장합니다.
```
Label: 위험 · Tone: warning

---

## 분석 카드 규칙 (CAL)

`verdict` → `tone`: good→success, warn→warning, bad→warning, info→info. 태그: good=양호 / warn=주의 / bad=위험 / info=참고.

### CAL-001 — 월 현금흐름
| IF | THEN | verdict |
|---|---|---|
| `monthlyCashFlow > 0` | 매월 현금이 늘어납니다. 현재 조건에서는 현금 소진 위험이 없습니다. | good |
| `monthlyCashFlow = 0` | 매출과 지출이 정확히 같습니다. 작은 매출 감소에도 적자로 전환됩니다. | warn |
| `monthlyCashFlow < 0` | 매월 {감소액}씩 현금이 줄어듭니다. | bad |

### CAL-004 — 손익 상태 (월 현금흐름의 부호로 판정)
| IF | THEN | verdict |
|---|---|---|
| `monthlyCashFlow > 0` | 월 매출이 월 지출(변동비+고정비+기타)보다 큽니다. | good |
| `monthlyCashFlow = 0` | (동일 문구) | warn |
| `monthlyCashFlow < 0` | 월 지출이 월 매출보다 {−monthlyCashFlow} 많습니다. 보유 현금으로 버티는 상태입니다. | bad |

### CAL-002 — 변동비율 (변동비 ÷ 매출)
| IF | THEN | verdict |
|---|---|---|
| 매출 = 0 | 매출이 0원이라 변동비율을 계산할 수 없습니다. | info |
| `ratio ≤ 0.35` | 변동비율이 적정 범위입니다. | good |
| `0.35 < ratio ≤ 0.50` | 변동비율이 다소 높습니다. 원가·수수료 구조를 점검해 보세요. | warn |
| `ratio > 0.50` | 변동비율이 높습니다. 매출이 늘어도 남는 현금이 적습니다. | bad |

### CAL-003 — 고정비 부담 (고정비 ÷ 매출)
| IF | THEN | verdict |
|---|---|---|
| 매출 = 0 | 매출이 0원이라 고정비 부담을 계산할 수 없습니다. | info |
| `ratio ≤ 0.30` | 고정비 부담이 낮은 편입니다. | good |
| `0.30 < ratio ≤ 0.45` | 고정비 부담이 보통 수준입니다. 매출 감소 시 압박이 커질 수 있습니다. | warn |
| `ratio > 0.45` | 고정비 부담이 큽니다. 임대료·인건비 등 고정 지출 재검토가 필요합니다. | bad |

### CAL-005 — 개선 포인트
| IF | THEN | verdict |
|---|---|---|
| `gap ≤ 0` | 현재는 손익분기 이상입니다. 매출 감소 시나리오로 여유를 점검하세요. | good |
| `gap > 0` | `{항목}`(매출/고정비/변동비/기타 유출 중 `gap ÷ 현재값` 이 가장 작은, 현재값 > 0 항목): 약 {gap}(현재의 {비율}) 늘리면/줄이면 손익분기에 도달합니다. | warn |

---

## 시나리오 규칙

| ID | 변형 |
|---|---|
| BASE | 현재 조건 |
| REV-10 / REV-20 / REV-30 | 매출 −10/−20/−30%. 변동비율(변동비÷매출) 유지 → 변동비도 같은 비율로 감소 |
| FIX-10 / FIX-20 | 고정비 −10/−20%. 매출·변동비·기타 고정 |

각 시나리오는 SURV 규칙으로 상태를 재판정한다.

---

## 표시 규칙

헤드라인(`headline`)과 부연 설명(`note`)은 엔진의 `describeSurvival()` 이 만들어 `analyze()` 결과에 담는다.

| 상태 | headline | note |
|---|---|---|
| `infinite` (월 현금흐름 ≥ 0) | `현금 감소 없음` | 월 현금흐름이 0원 이상이라 현재 조건에서는 현금이 줄지 않습니다. |
| `belowReserve` (usable ≤ 0) | `이미 안전 현금 이하` | 현재 보유 현금이 최소 유지 현금({금액}) 이하입니다. |
| `capped` (months ≥ 120) | `10년(120개월) 이상` | 10년을 넘는 예측은 불확실성이 커 표시하지 않습니다. |
| 그 외 | `약 N개월 M일` | 현재 조건이 매월 그대로 유지된다고 가정한 결과입니다. |

- 생존기간 텍스트: `약 N개월 M일` (1개월 = 30일, 일수 = 소수부 × 30 반올림, 30일이면 개월로 올림).
