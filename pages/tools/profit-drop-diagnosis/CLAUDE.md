# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

혜택on 무료도구 — **이익 변동 진단 ("왜 이번 달에 돈이 덜 남았지?")**.
지난달과 이번 달의 매출·비용을 입력하면 이익 변동에 영향을 준 항목을 순위로 보여주는
두 기간 비교 진단 도구. 혜택on 사이트(`benefitson.org`)의
`pages/tools/profit-drop-diagnosis/` 에 들어갈 무빌드 정적 도구.

**회계 프로그램이 아니다.** 장부 입력을 요구하지 않고, "원인"이라는 단어도 쓰지 않는다.
항상 "이익 변동에 영향을 준 항목"으로 표현한다.

## 실행 / 테스트

- 로컬: `python -m http.server 8000` → `http://localhost:8000`.
  `app.js` 가 ESM(`import`)이라 `file://` 로는 안 열린다 — 반드시 정적 서버로 띄운다.
- 계산 엔진 테스트: `node engine/profit-analyzer.test.js` (외부 의존성 없음, QA-01~20, 23개).
- 수수료 계산 보조 엔진 테스트: `node engine/fee-calc.test.js` (QA-FEE-01~10).
- 회귀 기준: `docs/tools/profit-drop-diagnosis/03_QA_Test_Cases.md` (저장소 루트 기준).

## 아키텍처

- **`engine/profit-analyzer.js`** — 계산 + 결과 문구 전부. `analyze(prev, curr)` 하나가
  ```
  { profitPrev, profitCurr, profitChange,
    status,                        // 'NO_DATA'|'PROFIT_DOWN'|'PROFIT_UP'|'PROFIT_SAME'|'PROFIT_SAME_BUT_ITEMS_CHANGED'
    heroLabel, heroAmount,         // 히어로 큰 숫자용 (heroAmount = profitChange, 포맷은 UI에서)
    heroTier,                      // { label, tone } — tone: 'danger'|'success'|'warning'|''. headline 과 같은
                                    // 분기(describeOutcome())에서 함께 결정 — 어긋나면 안 됨(9가지 상황, 02번 문서)
    headline, topImpactLine, notCauseLine,
    rankedImpacts,                 // [{ id, name, delta, impact, prev, curr, flag }]
    actionHints,                   // [{ id, name, impact, text, toolUrl }]
    caveats }
  ```
  를 반환한다. `formatWon` 도 여기 있다. `computeWaterfallLayout(a)` 는 워터폴 막대의 `left`/`width`
  좌표(0 기준선이 있는 양방향 축, % 단위)를 계산하는 별도 순수 함수 — "그리기 방식"이라 문구는
  아니지만 DOM 의존 없이 결정적이라 여기 함께 둔다.
  DOM·localStorage·시간·난수 의존 없음, 로케일 ko-KR 고정. 동일 입력 → 동일 출력.
  내부 함수(`normalizeInput`/`calculateProfit`/`calculateDelta`/`calculateImpacts`/`rankImpacts`)는
  테스트를 위해 export 하지만, `app.js` 는 `analyze`·`formatWon`·`computeWaterfallLayout` 세 개만
  import 한다.
  `rankedImpacts[].flag` 는 열거값(`NEW_COST`/`COST_ENDED`/`null`)만 반환 — "신규 발생"/
  "이번 달 없음" 같은 배지 문구는 `app.js` 가 매핑한다(순수 표시 라벨이라 예외적으로 UI에 둠).
- **`engine/fee-calc.js`** — 수수료 행(`platformFee`) 입력을 돕는 계산 보조 엔진(카드수수료·
  배달수수료). `profit-analyzer.js`(진단 로직)와 완전히 독립. DOM·localStorage 의존 없는 순수
  함수: `CARD_RATE_TIERS`(우대수수료율 4구간+30억초과)·`calcCardFee({tier, cardSales})`,
  `DELIVERY_RATES`(배민/쿠팡이츠/요기요)·`calcDeliveryFee(selections)`, `sumFees({card, delivery})`.
  결과는 오직 `platformFee` 칸에 값을 채워 넣는 데만 쓰이고, 진단 계산(`analyze`)에는 관여하지
  않는다. **`DELIVERY_RATES` 는 `pages/tools/delivery-fee-calc/script.js` 의 `PLATFORM_RATES`
  와 값이 항상 같아야 한다** — 둘 다 `<script>` 로만 로드되는 무빌드 도구라 import 를 공유할 수
  없어 값을 각자 갖고 있고, `scripts/build-pages.js` 가 빌드 시점에 두 값을 파싱·대조해 다르면
  빌드를 실패시킨다(드리프트 가드). 회귀 테스트: `node engine/fee-calc.test.js`(QA-FEE-01~10).
- **`app.js`** — 화면 로직만. 입력 검증 · 콤마 처리 · DOM 조립(6행 입력표를 `FIELDS` 배열로
  생성) · localStorage. 계산식·판정·결과 문구·좌표 계산 없음(전부 엔진에서 가져다 그리기만).
  입력마다 `analyze()` 를 다시 호출해 행별 증감·합계를 갱신하고(라이브 피드백), "진단하기"
  클릭 시에만 결과·리포트 패널을 공개하고 `scrollIntoView`.
  수수료 계산 보조 패널(`buildFeePanel()`)은 `.sheet-row[data-f="platformFee"]` 바로 뒤에
  형제로 삽입한다(`#sheet` 안에 넣지 않음 — 데스크톱 4열 grid 셀로 풀리는 걸 피하기 위함).
  카드수수료·배달수수료 계산은 `fee-calc.js` 의 함수만 가져다 쓰고 계산식은 이 파일에 두지
  않는다. 결과 합계를 "지난달/이번 달 수수료에 넣기" 버튼으로 해당 `platformFee` 칸에
  **덮어쓰기**(누적 아님)로 반영한 뒤 기존 `refresh()`/`saveInputs()` 를 그대로 호출한다.
- **`engine` 의 상태 규칙(`STATUS`)·영향 순위(`rankImpacts`)·행동 힌트(`ACTION_TABLE`)는
  `docs/tools/profit-drop-diagnosis/02_Rule_Engine_Profit_Drop_Diagnosis.md` 와 1:1 대응**.
  문구·순위 규칙을 바꾸면 → 엔진 + Rule Engine 문서 + `docs/tools/profit-drop-diagnosis/CHANGELOG.md`
  세 곳 동시 수정.
- **`style.css`** — 혜택on 공통 디자인 토큰(`--color-*`/`--radius`/`--shadow-*`)을 그대로 쓰되,
  레이아웃은 확정 시안(`docs/tools/profit-drop-diagnosis/ui-mockup.html`, 참고용 — 런타임에 복사 금지)
  전용 클래스(`.sheet-row`/`.hero-card`/`.wf-*`/`.check-item` 등)를 이 파일에 둔다.
  다른 도구(`pages/tools/*/style.css`)와는 토큰만 공유하고, 클래스 구조는 이 도구 고유다.
- 입력 패널은 항상 전체 폭(3단 그리드 아님). 결과·리포트는 진단 전 숨김, 진단 후에만
  2단(`result-grid`, 900px 이하 1단)으로 공개된다.
- UI 섹션 순서(back-bar → app-header → notice-bar → 1.입력표 → 2.결과·3.리포트(진단 후) →
  disclaimer → accordion → footer)는 이 도구의 확정 시안 규격.

## 불변 제약

- 서버·API·로그인 없음. 입력값은 localStorage(내 브라우저)에만, 전송 없음. 계산 기록(history) 저장 없음.
- 외부 JS 라이브러리 추가 금지 (Pretendard CDN은 사이트 공통이라 예외).
- 입력 필드 6개(매출/식재료비/인건비/임대료/수수료/기타비용) × 지난달·이번 달 = 12개, 전부 필수.
  쉼표·원화기호는 UI에서 허용하고 내부는 정수로 normalize(소수점 반올림), 안전정수 초과는 에러.
- 영향 순위 동률 타이브레이크: 매출 → 식재료비 → 인건비 → 수수료 → 임대료 → 기타비용 순 고정.
  "가장 큰 영향 항목"은 `rankedImpacts[0]` 을 그대로 쓴다 — 별도로 다시 계산하지 않는다.
- 영향 합계(모든 `rankedImpacts[].impact` 합) == 이익 증감(`profitChange`) 항등식이 항상 성립해야 한다.
- 결과 화면에 세무·회계 자문이 아니라는 면책 문구가 상시 노출돼야 한다(`tool-disclaimer`).

## 문서 / 릴리스

- 모든 코드 변경은 `CHANGELOG.md` 에 기록 (형식: `Version | Date | Type | Description`).
- 버전: Major(기능 변경) / Minor(기능 추가) / Patch(버그). 금요일 야간 배포 금지.
- 이 도구는 **`benefitson.org` 모노레포(`github.com/parkhb018-source/benefits_on`)** 의 한 폴더다.
  런타임 파일은 `pages/tools/profit-drop-diagnosis/`, 개발 문서는 `docs/tools/profit-drop-diagnosis/`.
  배포: 저장소 `main` push → `.github/workflows/deploy.yml`(GitHub Pages) 가 자동 빌드,
  `benefitson.org/pages/tools/profit-drop-diagnosis/` 로 서빙(그래서 canonical·OG·JSON-LD·
  sitemap 은 모두 `benefitson.org` 절대 URL, asset 은 상대경로). Cloudflare 가 `style.css`/`app.js`
  를 4시간 캐시하므로, **이 파일들을 고치면 `index.html` 의 `?v=YYYYMMDD` 토큰과 `app.js` 상단
  엔진 import 의 `?v=` 토큰을 함께 올려야** 재방문자가 즉시 새 파일을 받는다. 네 곳(`index.html`
  의 `style.css?v=`, `index.html` 의 `app.js?v=`, `app.js` 의 `profit-analyzer.js`/`fee-calc.js`
  엔진 import `?v=` 2건)은 항상 같은 값.
  도구를 새로 추가할 때만 **저장소 루트** `sitemap.xml` 에 URL 을 넣는다.
  AdSense/GA/Kakao ad 스크립트는 다른 도구와 동일하게 삽입돼 있음.
- **AdSense auto ads가 로드 직후 빈/숨김 요소를 잠깐 떼어냈다 되돌린다.** `app.js`의 `init()`은
  필요한 요소가 다 보일 때까지 재시도한 뒤 참조를 `el`에 캐시한다 — DOM 조회는 이 캐시(`$()`)를 쓸 것.
- 참고: `docs/tools/profit-drop-diagnosis/01_PRD_Profit_Drop_Diagnosis_v1.0.md`,
  `docs/tools/profit-drop-diagnosis/02_Rule_Engine_Profit_Drop_Diagnosis.md`,
  `docs/tools/profit-drop-diagnosis/CHANGELOG.md` (모두 저장소 루트 기준 경로).
