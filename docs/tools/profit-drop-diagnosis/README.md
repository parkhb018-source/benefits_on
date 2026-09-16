# 이익 변동 진단 — "왜 이번 달에 돈이 덜 남았지?"

혜택on 무료도구 (Business Calculators). "지난달보다 돈이 덜 남았는데 왜 그런지 모르겠다"는
순간에, 두 달의 숫자를 비교해 **이익 변동에 영향을 준 항목**을 보여주는 두 기간 비교 진단 도구.

회계 프로그램이 아닙니다. 장부 입력을 요구하지 않고, "원인"이라는 단어도 쓰지 않습니다.

## 배포 위치

혜택on 저장소의 `pages/tools/profit-drop-diagnosis/` 에 이 폴더 내용을 그대로 넣습니다.
(`index.html` / `style.css` / `app.js` / `engine/`). 문서는 `docs/tools/profit-drop-diagnosis/` 로.

## 로컬 실행

```bash
python -m http.server 8000
# → http://localhost:8000
```

`app.js` 가 ES 모듈이라 `file://` 직접 열기는 안 됩니다. 정적 서버가 필요합니다.

## 계산 엔진 테스트

```bash
node engine/profit-analyzer.test.js
# → 15 passed
```

전체 검증 케이스: [`docs/03_QA_Test_Cases.md`](docs/03_QA_Test_Cases.md).

## 구조

```
index.html                        혜택on 공통 UI 구조 + SEO 메타 + JSON-LD
style.css                         혜택on 디자인 시스템(공통 토큰·클래스) + 이 도구 전용 스타일
app.js                            (ESM) 입력 검증 · 렌더링 · localStorage — 계산식 없음
engine/profit-analyzer.js         (ESM) 순수 계산: 이익 · 증감 · 항목별 영향 · 영향 순위 · 결과 문구
engine/profit-analyzer.test.js    Node 내장 assert 회귀 테스트
docs/01_PRD_Profit_Drop_Diagnosis_v1.0.md
docs/02_Rule_Engine_Profit_Drop_Diagnosis.md   ← engine 의 규칙과 1:1
docs/03_QA_Test_Cases.md
CHANGELOG.md
```

## 핵심 로직

```
총비용 = 식재료비 + 인건비 + 임대료 + 수수료 + 기타비용
이익 = 매출 − 총비용
이익 증감 = 이번 달 이익 − 지난달 이익
항목별 이익 영향 = 비용은 −(이번 달 − 지난달), 매출은 +(이번 달 − 지난달)
영향 순위 = 절대 영향액 내림차순, 동률이면 매출 > 식재료비 > 인건비 > 수수료 > 임대료 > 기타
```

- 영향 합계 == 이익 증감 항등식이 항상 성립.
- 결과 문구는 상황별로 고정(이익 감소/증가/동일/항목 변화/적자 축소/적자 전환/전부 0).
- "가장 큰 영향 항목"은 영향 순위 1위를 그대로 사용(별도 재계산 없음).

## 프라이버시

입력값은 서버로 전송되지 않고 내 브라우저(localStorage)에만 저장됩니다. 계산 기록은 저장하지 않습니다.
