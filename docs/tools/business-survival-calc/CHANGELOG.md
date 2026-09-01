# Change Log — 사업 생존기간 계산기

기준 문서: `13_BenefitsON_Change_Log_Standard_v1.0`.
형식: `Version | Date | Type | Description` · Type: Added / Updated / Fixed / Removed / Deprecated.

| Version | Date | Type | Description |
|---|---|---|---|
| 1.2.6 | 2026-09-01 | Updated | "시나리오 비교"를 "3. 분석 리포트" 패널에서 "2. 계산 결과" 패널의 현금 흐름 내역 바로 아래로 이동(결과 → 시나리오 → 상세 분석 순서가 더 직관적). 시나리오 표 밀도 조정(min-width 520→420, padding·폰트 축소)으로 3단 레이아웃에서도 가로 스크롤 없이 5개 열 표시. `#scenario-wrap`이 `#result-body` 하위로 들어가 별도 토글 제거. |
| 1.2.5 | 2026-09-01 | Fixed | "초기화" 후 분석 리포트 카드(`#report-cards`)가 사라지지 않던 버그. `.report-cards { display:flex }` 가 `[hidden]` 속성을 덮어써서 `hidden`이 무효였음 → `.report-cards[hidden] { display:none }` 규칙 추가. |
| 1.2.4 | 2026-09-01 | Added | 광고·애널리틱스 스크립트를 다른 도구와 동일하게 삽입 — Google AdSense(ca-pub-4871058922328451), GA4(G-K1YVTR39FF), 카카오 애드핏 배너(DAN-ntJWItYnhuyVV5W8), naver-site-verification. |
| 1.2.3 | 2026-09-01 | Updated | 내부 정리(동작 불변). 엔진이 헤드라인·안내(`describeSurvival`)와 상태(`status`)를 `analyze()` 결과에 담아 반환 → `app.js`에서 결과 문구·상태 판정 로직 제거(engine import 5개→4개, `formatWon`도 엔진으로). `analysisCards` 포매터 주입 제거. `totalCost` 파생값 제거(= `−월현금흐름`). CAL-002/003 헬퍼로 통합, CAL-004 부호 판정으로 단순화. `evaluateStatus` 오브젝트 재조립 제거. SURV-003/004 중복 상한 제거(평가 순서 의존). localStorage `safeSet/safeRemove/safeParse(fallback)` 헬퍼로 통합. 예약패널 토글·필드 피드백 중복 제거. 시나리오 "월 매출" 칸 `formatWon` 사용. |
| 1.2.2 | 2026-09-01 | Updated | 제목·문구 교체. SEO title "사업 생존기간 계산기 \| 지금 매출로 몇 개월 버틸까?", meta description·OG·JSON-LD를 "현재 현금·매출·비용 → 최소 유지금액 도달 예상 기간" 문구로 통일. 페이지 서브헤딩 "사장님, 지금 매출로 몇 개월 버틸 수 있을까요?". |
| 1.2.1 | 2026-09-01 | Updated | 계산 결과 영역에서 음수 금액(−)을 붉은색으로 표시: 히어로 "월 현금흐름"(파란 배경용 연한 적색), 현금 흐름 내역 합계, 시나리오 표·계산 기록의 월 현금흐름 열. |
| 1.2.0 | 2026-09-01 | Updated | SURV 상태 규칙 최종: **"안정"은 월 현금흐름이 흑자(현금 감소 없음)일 때만.** 적자이면 현금 소진까지 아무리 오래 남아도 최대 "주의"(SURV-002, `months ≥ 6`). SURV-001 조건에서 `months` 분기 제거. 매출 감소 시나리오가 흑자→적자로 전환되면 상태가 바로 "주의"로 드러남. `RULE_ENGINE` / QA / 테스트 동시 갱신. |
| 1.1.0 | 2026-09-01 | Updated | (중간본) SURV "안정" 기준을 생존기간 12개월 → 24개월로 상향. v1.2에서 흑자 한정으로 대체됨. |
| 1.0.0 | 2026-09-01 | Added | 최초 구현. 입력 5+1, 월 현금흐름·생존기간 계산(120개월 상한), 상태 판정(SURV-001~005), 분석 카드(CAL-001~005), 시나리오 6종(매출 −10/−20/−30%, 고정비 −10/−20%). |
| 1.0.0 | 2026-09-01 | Added | 순수 계산 엔진 `engine/survival-calculator.js` + 회귀 테스트 `engine/survival-calculator.test.js` (QA-01~08). |
| 1.0.0 | 2026-09-01 | Added | 혜택on 공통 디자인 시스템 적용(back-bar / app-header / notice-bar / hero-card / report-cards / accordion). 반응형 1·2·3단. |
| 1.0.0 | 2026-09-01 | Added | localStorage: 입력값 자동 저장(`survivalCalcInputs`), 최근 계산 기록 최대 10건(`survivalCalcHistory`). |
| 1.0.0 | 2026-09-01 | Added | SEO 메타 + JSON-LD(SoftwareApplication · BreadcrumbList · FAQPage), Pretendard(jsdelivr CDN). |
| 1.0.0 | 2026-09-01 | Added | 문서: PRD, Rule Engine, QA Test Cases, README, CLAUDE.md. |
