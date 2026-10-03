# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

혜택on 무료도구 — **리뷰 대응도우미**. 배달앱(배달의민족·쿠팡이츠·요기요) 사장님이 받은 부정 리뷰를
붙여넣으면 ① 리뷰 유형 ② 신고 대상 여부(참고) ③ 확인해 볼 점 ④ 답변 초안(3가지 말투)을 보여 주는
무빌드 정적 도구. 혜택on 사이트(`benefitson.org`)의 `pages/tools/review-helper/`.

**판정하지 않는다.** 실제 주문 내역을 모르므로 "허위 리뷰입니다" 같은 단정 문구를 쓰지 않고,
확인할 점과 공식 신고 경로만 안내한다. 표기는 "캡쳐"(캡처 아님).

## 실행 / 테스트 (저장소 루트에서)

- 로컬: `python -m http.server 8000` → `http://localhost:8000/pages/tools/review-helper/`.
  ESM + 절대경로 fetch(`/data/review-helper/…`)라 `file://` 로는 안 열리고, 반드시 저장소 루트에서 띄운다.
- JS 엔진 시험: `node --test tests/review-helper/engine.test.mjs tests/review-helper/josa.test.mjs tests/review-helper/ocr-clean.test.mjs`
  (욕설 36개·분류 31개·수용 기준 문장·빈칸·정책 판단)
- 데이터·참고 구현 시험: `python data/review-helper/validate.py`, `abuse_check.py`, `classify_check.py`
  (`python` 이 안 되면 `py`)

## 구조

- **`data/review-helper/*.json`** — 정책·체크리스트·유형·템플릿·욕설 사전. **문구는 여기서만** 읽는다
  (화면 고정 문구 제외). 설계서: `data/review-helper/README.md`. JSON 을 고치면 `validate.py` 실행.
- **`js/abuse.js`** — `abuse_check.py` 이식. **`js/classify.js`** — `classify_check.py` 이식.
  두 파일은 Python 참고 구현과 결과가 항상 같아야 한다(규칙을 바꾸면 Python·JS·시험 문장 함께).
  욕설 단어 자체는 반환하지 않는다(화면에 다시 출력 금지).
- **`js/fill.js`** — 템플릿 `[빈칸]` 찾기·채우기·남은 수. 미리보기·복사 모두 `js/josa.js` 의 `resolveJosa` 를 거친다(화면 = 복사 결과).
- **`js/josa.js`** — 채운 빈칸 뒤 조사 보정(으로/로·을/를·은/는·이/가만, 다음 글자가 한글이면 미적용, 한글 아닌 값은 "(으)로" 같은 중립 표기). `templates.json` 원문은 고치지 않는다. **`js/policy.js`** — 확인 중/확인일 경과 판단.
- **`js/config.js`** — `HUB_URL`·데이터 경로·플랫폼 칩·`OCR_ENABLED`·`TESSERACT` 등 설정값.
- **`js/ocr.js`** — Tesseract 지연 로드·이미지 축소(긴 변 `OCR_MAX_SIDE`)·시간 제한(`OCR_TIMEOUT_MS`)·정리.
- **`js/ocr-clean.js`** — 읽은 글자에서 깨진 줄만 보수적으로 제거(의미 문자 2개 미만이면서 한글 음절 없음, 또는 의미 문자 비율 40% 미만). 지운 줄이 있으면 확인 화면에 안내.
- **`js/data.js`** — JSON 5개를 한 번에 읽음. 실패 시 안내만 띄우고 입력은 막지 않는다.
- **`app.js`** — 상태(메모리 객체 하나) · 해시 라우팅(`#home #paste #capture #confirm #result #reply #report`)
  · DOM 그리기 · GA 이벤트. 960px 이상은 같은 DOM 을 3열 그리드로 보여 준다(왼쪽 확인 / 가운데 결과·체크리스트 /
  오른쪽 답변·공식 안내).
- `index.html` 의 "리뷰 유형별 대응 요령"·"공식 신고 경로 안내"·FAQ 는 **크롤러용 정적 HTML** 이며
  `types.json`·`platforms.json` 내용을 옮겨 적은 것이다. JSON 의 정책 사실을 바꾸면 이 섹션도 함께 고친다.
  FAQ 문구는 JSON-LD `FAQPage` 와 글자까지 같아야 한다.

## 불변 제약

- 리뷰 글·가게 이름·빈칸 값·캡쳐 이미지는 **어디에도 저장·전송하지 않는다**(localStorage/sessionStorage/쿠키/
  URL/GA 이벤트 포함). 새로고침하면 사라지는 것이 의도된 동작.
- GA 는 `/assets/js/analytics.js` 의 `track`/`trackToolStart`/`trackToolRun` 만 쓴다(gtag 직접 호출 금지).
  이벤트 이름·매개변수는 `docs/tools/review-helper/PRD.md` §8 표에 있는 것만.
- 욕설·모욕이 감지되면 `not_target`·`principle_not_target` 문구 대신 `may_review` 를 쓴다
  ("신고대상은 아닙니다"가 욕설 상태에서 나오면 안 됨).
- h1 은 상단 바의 "리뷰 대응도우미" 하나뿐(화면 전환으로 숨겨지지 않음). 화면 제목은 모두 h2.
- 도구 화면(입력·결과·답변) 안에 수동 광고 슬롯을 만들지 않는다.
- 외부 JS 라이브러리 금지. 예외는 캡쳐 글자 읽기용 Tesseract.js 하나 — `js/ocr.js`.
  jsDelivr CDN·버전 고정(tesseract.js 7.0.0 / core 7.0.0 / kor 4.0.0_best_int), 주소와 SRI 는 `js/config.js` 의
  `TESSERACT`. 모바일은 캡쳐 화면(`#capture`) 진입 시, PC 는 이미지를 처음 넣을 때만 불러온다(처음·붙여넣기 화면에서는
  요청 0). 처리가 끝나면 worker 를 terminate. 버전을 올리면 integrity 를 다시 계산(`config.js` 주석의 명령).
  언어 데이터는 Tesseract 기본 동작대로 IndexedDB(`keyval-store`)에 보관된다 — 사용자 입력은 저장하지 않는다.
- **AdSense auto ads 가 로드 직후 빈/숨김 요소를 잠깐 떼어냈다 되돌린다.** `init()` 은 `EL_IDS` 가 모두
  보일 때까지 재시도한 뒤 참조를 `el` 에 캐시한다 — DOM 조회는 `$()` 를 쓸 것. 새 id 를 쓰면 `EL_IDS` 에 추가.

## 문서 / 릴리스

- 개발 문서: `docs/tools/review-helper/` (PRD·TASKS·OPEN-ITEMS·DESIGN-TOKENS·02_Rule_Engine·03_QA_Test_Cases·
  CHANGELOG·design-reference). 모든 코드 변경은 `CHANGELOG.md` 에 기록.
- 캐시 버스터: `index.html` 의 `style.css?v=`·`app.js?v=`, `app.js` 의 `js/*.js?v=` import 7건,
  `js/data.js`·`js/ocr.js` 의 `config.js?v=`, `js/fill.js` 의 `josa.js?v=`, `js/ocr.js` 의 `ocr-clean.js?v=` import 는 **항상 같은 값(YYYYMMDD)**. 한 파일만 고쳐도 전부 올린다.
- 배포: 저장소 `main` push → GitHub Pages / Cloudflare Pages. `data/**/*.json` 변경은
  `.github/workflows/build-pages.yml` 도 트리거하지만 `build-pages.js` 는 이 폴더를 읽지 않아 변경이 없다.
  커밋 메시지에 `[skip ci]` 금지.
