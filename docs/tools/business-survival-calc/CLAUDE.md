# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

혜택on 무료도구 — **사업 생존기간 계산기 ("이번 달 버틸 수 있나?")**.
현재 보유 현금과 월 매출·비용으로 현금 소진 시점(생존 개월 수)을 계산하는 현금흐름 시뮬레이터.
혜택on 사이트(`benefitson.org`)의 `pages/tools/business-survival-calc/` 에 들어갈 무빌드 정적 도구.

## 실행 / 테스트

- 로컬: `python -m http.server 8000` → `http://localhost:8000`.
  `app.js` 가 ESM(`import`)이라 `file://` 로는 안 열린다 — 반드시 정적 서버로 띄운다.
- 계산 엔진 테스트: `node engine/survival-calculator.test.js` (외부 의존성 없음, QA-01~08).
- 회귀 기준: `docs/03_QA_Test_Cases.md`.

## 아키텍처

- **`engine/survival-calculator.js`** — 계산 + 결과 문구 전부. `analyze(input)` 하나가
  `{monthlyCashFlow, survival, status(SURV), headline, note, variableRatio, fixedRatio}` 를 반환하고,
  `analysisCards(a)`(CAL)·`buildScenarios(base)` 가 그 위에 얹힌다. `formatWon` 도 여기 있다.
  DOM·localStorage·시간·난수 의존 없음, 로케일 ko-KR 고정. 동일 입력 → 동일 출력.
- **`app.js`** — 화면 로직만. 입력 검증 · 콤마 처리 · DOM 조립 · localStorage. 계산식·상태 판정·결과 문구 없음
  (엔진에서 `analyze` / `buildScenarios` / `analysisCards` / `formatWon` 4개만 import).
- **`engine` 의 `STATUS_RULES` / `analysisCards()` / `describeSurvival()` 는
  `docs/02_Rule_Engine_Business_Survival.md` 와 1:1 대응**. 문구·임계값을 바꾸면 →
  엔진 + Rule Engine 문서 + `CHANGELOG.md` 세 곳 동시 수정.
- **`style.css`** — 혜택on 공통 디자인 시스템(토큰·`.panel`·`.hero-card`·`.report-card` 등)을
  이 도구 파일에 복제한 것. 다른 도구(`pages/tools/*/style.css`)와 토큰·클래스명이 일치해야 한다.
- UI 섹션 순서(back-bar → app-header → notice-bar → 1.입력 / 2.결과 / 3.리포트 → disclaimer
  → accordion → footer)는 혜택on Design System 고정 규격.

## 불변 제약

- 서버·API·로그인 없음. 입력값·계산 기록은 localStorage(내 브라우저)에만, 전송 없음.
- 외부 JS 라이브러리 추가 금지 (Pretendard CDN은 사이트 공통이라 예외).
- **월 변동비 > 월평균 매출** 입력은 차단. **총비용 > 매출**(적자)은 그대로 계산 — 그게 목적.
  **월 기타 유출 > 매출**은 경고만 하고 계산 진행.
- 생존기간 표시 상한 **120개월** → 초과 시 "10년(120개월) 이상".
- 1개월 = 30일 고정. 면책 문구 상시 노출. 상태는 색+텍스트 라벨 병행.

## 문서 / 릴리스

- 모든 코드 변경은 `CHANGELOG.md` 에 기록 (형식: `Version | Date | Type | Description`).
- 버전: Major(기능 변경) / Minor(기능 추가) / Patch(버그). 금요일 야간 배포 금지.
- 배포: 저장소 `main` push → GitHub Pages (저장소 루트 그대로 업로드). 앞단 Cloudflare가
  `style.css`/`app.js`를 4시간 캐시하므로, **이 파일들을 고치면 `index.html`의 `?v=YYYYMMDD` 토큰과
  `app.js` 상단 엔진 import의 `?v=` 토큰을 함께 올려야** 재방문자가 즉시 새 파일을 받는다.
  새 페이지 추가 시 `sitemap.xml` 갱신. AdSense/GA/Kakao ad 스크립트는 다른 도구와 동일하게 삽입돼 있음.
- **AdSense auto ads가 로드 직후 빈/숨김 요소를 잠깐 떼어냈다 되돌린다.** `app.js`의 `init()`은
  필요한 요소가 다 보일 때까지 재시도한 뒤 참조를 `el`에 캐시한다 — DOM 조회는 이 캐시(`$()`)를 쓸 것.
- 참고: `docs/01_PRD_Business_Survival_v1.0.md`, `docs/02_Rule_Engine_Business_Survival.md`.
