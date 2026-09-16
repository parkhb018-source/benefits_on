# Change Log — 이익 변동 진단

기준 문서: `13_BenefitsON_Change_Log_Standard_v1.0`.
형식: `Version | Date | Type | Description` · Type: Added / Updated / Fixed / Removed / Deprecated.

| Version | Date | Type | Description |
|---|---|---|---|
| 1.0.0 | 2026-09-16 | Added | 최초 구현. 지난달·이번 달 매출·비용 6항목(매출/식재료비/인건비/임대료/수수료/기타비용) 비교, 이익 계산·증감, 항목별 이익 영향·영향 순위(동률 타이브레이크 고정), 상태 판정(전부 0/적자 전환/적자 축소/이익 감소/이익 증가/동일/항목 변화), 다음 확인(행동 힌트). |
| 1.0.0 | 2026-09-16 | Added | 순수 계산 엔진 `engine/profit-analyzer.js` + 회귀 테스트 `engine/profit-analyzer.test.js` (QA-01~15, 필수 검증 케이스 포함). |
| 1.0.0 | 2026-09-16 | Added | 혜택on 공통 디자인 시스템 적용(back-bar / app-header / notice-bar / hero-card / report-cards / accordion). 반응형 1·2·3단, 모바일 400px·데스크톱 1280px 가로 스크롤 없음 확인. |
| 1.0.0 | 2026-09-16 | Added | localStorage: 입력값 자동 저장(`profitDropDiagnosisInputs`). 계산 기록(history)은 저장하지 않음(도구 성격상 두 기간 비교만 필요). |
| 1.0.0 | 2026-09-16 | Added | SEO 메타 + JSON-LD(SoftwareApplication · BreadcrumbList · FAQPage), Pretendard(jsdelivr CDN). |
| 1.0.0 | 2026-09-16 | Added | 문서: PRD, Rule Engine, QA Test Cases, README, CLAUDE.md. |
| 1.0.0 | 2026-09-16 | Added | `data/resources.json` 에 항목 추가, 저장소 루트 `sitemap.xml` 에 URL 추가. |
