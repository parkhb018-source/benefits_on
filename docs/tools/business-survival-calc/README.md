# 사업 생존기간 계산기 — "지금 매출로 몇 개월 버틸까?"

혜택on 무료도구 (Business Calculators). 현재 보유 현금과 월 매출·비용을 입력하면
**현재 조건이 유지될 때 현금이 언제 소진되는지(생존 개월 수)**를 계산하는 현금흐름 시뮬레이터.

손익분기점 계산기가 "얼마를 팔아야 하나"에 답한다면, 이 도구는 **"언제 바닥나나"**에 답합니다.

## 배포 위치

혜택on 저장소의 `pages/tools/business-survival-calc/` 에 이 폴더 내용을 그대로 넣습니다.
(`index.html` / `style.css` / `app.js` / `engine/`). 문서는 `docs/tools/business-survival-calc/` 로.

## 로컬 실행

```bash
python -m http.server 8000
# → http://localhost:8000
```

`app.js` 가 ES 모듈이라 `file://` 직접 열기는 안 됩니다. 정적 서버가 필요합니다.

## 계산 엔진 테스트

```bash
node engine/survival-calculator.test.js
# → 8 passed
```

전체 검증 케이스: [`docs/03_QA_Test_Cases.md`](docs/03_QA_Test_Cases.md).

## 구조

```
index.html                        혜택on 공통 UI 구조 + SEO 메타 + JSON-LD
style.css                         혜택on 디자인 시스템(공통 토큰·클래스) + 이 도구 전용 스타일
app.js                            (ESM) 입력 검증 · 렌더링 · localStorage — 계산식 없음
engine/survival-calculator.js     (ESM) 순수 계산: 현금흐름 · 생존기간 · SURV · CAL · 시나리오
engine/survival-calculator.test.js  Node 내장 assert 회귀 테스트
docs/01_PRD_Business_Survival_v1.0.md
docs/02_Rule_Engine_Business_Survival.md   ← engine 의 규칙과 1:1
docs/03_QA_Test_Cases.md
CHANGELOG.md
```

## 핵심 로직

```
월 현금흐름 = 월평균 매출 − 변동비 − 고정비 − 기타 현금 유출
생존 개월수 = (현재 보유 현금 − 최소 유지 현금) ÷ |월 현금 감소액|   (월 현금흐름 < 0)
```

- 표시 상한 120개월(10년). 1개월 = 30일.
- 월 변동비 > 매출 → 입력 차단. 총비용 > 매출(적자) → 그대로 계산.
- 상태: 안정(흑자 = 현금 감소 없음) / 주의(적자 & 6개월+) / 경고(3~6개월) / 위험(3개월 미만 또는 여유 현금 ≤ 0).

## 프라이버시

입력값과 계산 기록은 서버로 전송되지 않고 내 브라우저(localStorage)에만 저장됩니다.
