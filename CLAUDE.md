# CLAUDE.md

이 파일은 이 저장소에서 작업하는 Claude Code에게 가이드를 제공합니다.

## 프로젝트 개요

**혜택on** — 나이·소득·가구 형태를 입력하면 받을 수 있는 정부지원금을 알려주는 정적 웹사이트.
빌드 도구 없이 순수 HTML/CSS/JS로 작성되었으며, `main` 브랜치 push 시 GitHub Pages로 자동 배포됩니다.

## 기술 스택 / 빌드

- **빌드 시스템 없음.** 번들러·트랜스파일러·패키지 매니저 없음. 파일을 직접 편집하면 곧 배포 산출물입니다.
- 정적 사이트이므로 로컬에서 보려면 정적 서버로 띄웁니다 (예: `python -m http.server`).
  `file://`로 열면 `fetch` 기반 JSON 로딩이 CORS로 실패할 수 있습니다.
- 배포: [.github/workflows/deploy.yml](.github/workflows/deploy.yml) — `main` push → 저장소 루트(`.`)를 그대로 GitHub Pages에 업로드.

## 구조

- [index.html](index.html) — 메인 페이지. 자가진단 도구, SEO 메타/JSON-LD 포함.
- [main.js](main.js) — 헤더 스크롤·햄버거 메뉴·자가진단 로직. `data-*` 데이터셋이 없을 때 쓰는 fallback 매칭 맵(`defaultBenefitsMap`)을 내장.
- [style.css](style.css) / [pages/pages.css](pages/pages.css) — 전역/페이지 공통 스타일.
- [pages/](pages/) — 카테고리 페이지(청년·소득·세금 등), 아티클(`article-*.html`), 계산기(`calc-*.html`).
- [admin/](admin/) — 관리자 페이지. JSON 데이터를 편집해 localStorage에 저장.
- [data/](data/) — 사이트 데이터 소스(아래 참조).

## 데이터 흐름 (중요)

[data/policy-loader.js](data/policy-loader.js)가 데이터 계층의 핵심입니다.

1. **우선순위**: `localStorage`(관리자 페이지 저장값) → 없으면 `data/*.json` 파일.
2. 로드 대상 3종:
   - `constants.json` → `window.POLICY_DATA` (계산기 기준값)
   - `policies.json` → `window.POLICIES` (정책 목록·마감일)
   - `matching-rules.json` → `window.MATCHING_RULES` (자가진단 매칭 규칙)
3. DOM 반영은 **데이터 속성**으로 동작: `data-policy="path.to.value"`(점 표기 중첩 경로),
   `data-policy-default` / `data-policy-min` / `data-policy-date`, `.policy-data-badge` 등.
   포맷터는 `data-policy-format`(`currency`/`currency-man`/`number`/`percent`)로 지정.
4. 관리자 저장 시 `window.htkonApplyConstants` / `htkonApplyPolicies`로 **새로고침 없이 즉시 반영**.

> 매칭 규칙은 `matching-rules.json`(런타임 소스)과 `main.js`의 `defaultBenefitsMap`(fallback)
> **두 곳에 존재**합니다. 혜택 항목을 추가/변경하면 두 곳의 정합성을 함께 확인하세요.

## 작업 시 주의사항

- 콘텐츠 언어는 **한국어**. 새 문구·UI 텍스트는 기존 톤을 따릅니다.
- 새 페이지 추가 시 [sitemap.xml](sitemap.xml)도 갱신하세요.
- `YOUR-DOMAIN.com`, `ca-pub-XXXX`(AdSense) 등은 배포 전 교체되는 **플레이스홀더**입니다 — 임의로 채우지 마세요.
- 외부 의존성·프레임워크를 새로 도입하지 마세요. 정적·무빌드 구조를 유지합니다.

---

## 작업 가이드라인 (Karpathy Guidelines)

LLM 코딩에서 흔한 실수를 줄이기 위한 행동 지침. ([출처](https://github.com/multica-ai/andrej-karpathy-skills/tree/main/skills/karpathy-guidelines))
**원칙: 속도보다 신중함.** 사소한 작업에는 판단껏 적용.

### 1. 코딩 전에 생각하라
**추측하지 말고, 혼란을 숨기지 말고, 트레이드오프를 드러내라.**
- 가정을 명시한다. 불확실하면 묻는다.
- 해석이 여러 개면 임의로 고르지 말고 제시한다.
- 더 단순한 방법이 있으면 말한다. 필요하면 반대 의견을 낸다.
- 불분명하면 멈춘다. 무엇이 헷갈리는지 짚고 질문한다.

### 2. 단순함이 먼저다
**문제를 푸는 최소한의 코드. 추측성 코드 금지.**
- 요청 범위를 넘는 기능 추가 금지.
- 단발성 코드에 추상화 금지.
- 요청하지 않은 "유연성"·"설정 가능성" 금지.
- 불가능한 시나리오에 대한 예외 처리 금지.
- 200줄을 50줄로 줄일 수 있으면 다시 쓴다.
- 자문하라: "시니어 엔지니어가 과하다고 할까?" → 그렇다면 단순화.

### 3. 외과적 변경
**필요한 것만 건드리고, 네가 만든 것만 정리하라.**
- 인접한 코드·주석·서식을 "개선"하지 않는다.
- 망가지지 않은 것을 리팩터링하지 않는다.
- 내 취향과 달라도 기존 스타일에 맞춘다.
- 관련 없는 데드 코드를 발견하면 삭제하지 말고 언급만 한다.
- 내 변경으로 쓰이지 않게 된 import/변수/함수만 제거한다. 기존 데드 코드는 요청 없이 건드리지 않는다.
- 기준: **변경된 모든 줄이 사용자의 요청으로 직접 추적되어야 한다.**

### 4. 목표 기반 실행
**성공 기준을 정의하고, 검증될 때까지 반복하라.**
- "검증 추가" → "잘못된 입력에 대한 테스트를 쓰고 통과시킨다"
- "버그 수정" → "버그를 재현하는 테스트를 쓰고 통과시킨다"
- "X 리팩터링" → "전후로 테스트가 통과하는지 확인한다"
- 다단계 작업은 간단한 계획을 먼저 제시한다:
  ```
  1. [단계] → 검증: [확인 방법]
  2. [단계] → 검증: [확인 방법]
  ```
- 강한 성공 기준은 독립적인 반복을 가능케 한다. 약한 기준("되게 해줘")은 계속 되묻게 만든다.
