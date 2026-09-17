# Change Log — 이익 변동 진단

기준 문서: `13_BenefitsON_Change_Log_Standard_v1.0`.
형식: `Version | Date | Type | Description` · Type: Added / Updated / Fixed / Removed / Deprecated.

| Version | Date | Type | Description |
|---|---|---|---|
| 1.1.1 | 2026-09-17 | Fixed | `status` enum 통합(`PROFIT_UP`/`PROFIT_DOWN`) 이후 `headline` 문구가 적자 축소·적자 전환을 구분하지 못해 "여전히 적자인데 이익이 늘었습니다"처럼 오해를 부를 수 있던 문제. 두 기간 모두 적자면서 이익이 늘어난 경우 "적자 규모가 {N}원 줄었습니다."(구 `DEFICIT_REDUCED`와 동일 문구), 흑자에서 적자로 넘어간 경우 "이번 달 적자로 전환되었습니다."(구 `DEFICIT_FLIP`과 동일 문구)를 `headline`에 복원. `status` enum 자체는 5종 그대로 유지(계산·판정 로직 변경 없음). `02_Rule_Engine_Profit_Drop_Diagnosis.md`·`03_QA_Test_Cases.md`·`engine/profit-analyzer.test.js`(QA-08/08b/09/09b/09c 추가, 18개 pass) 동시 갱신. |
| 1.1.0 | 2026-09-17 | Updated | UI/UX 전면 개편(확정 시안 `docs/ui-mockup.html` 기준). 제목을 "왜 이번 달에 돈이 덜 남았지?"로 변경(배지: "이익 변동 진단"), index.html 전 위치(title/description/OG/JSON-LD/헤더)와 `data/resources.json` 동시 반영. 입력을 12칸 세로에서 6행 좌우 비교표(항목\|지난달\|이번 달\|증감)로 재구성, 입력 중 실시간 행별 증감·"만원" 읽기 힌트·"지난달과 같음"/"예시 숫자"/"비우기" 버튼 추가. 결과·리포트 패널은 진단 전 숨김 → 진단하기 클릭 시 공개 + 자동 스크롤. 히어로에 이익 변동 금액을 2.5rem 큰 숫자로 복원, "이익이 어디서 깎였나" 가로 누적 워터폴(CSS만, 라이브러리 없음) 추가, "원인 아님" 고지를 워터폴 바로 아래(1등 바로 밑)로 이동. 리포트를 체크박스형 "다음에 확인할 것" 목록으로 변경 + 결과 요약 복사 버튼. 계산 결과값(금액·순위)은 개편 전과 100% 동일. |
| 1.1.0 | 2026-09-17 | Updated | **엔진 반환 형태 변경**(`analyze()`). 기존 `headline` 한 문장(1차 메시지+1등 항목 메시지 결합)을 `heroLabel`/`heroAmount`/`headline`/`topImpactLine`/`notCauseLine` 5개 필드로 분리. `status` 를 `{id,tone,label}` 오브젝트에서 문자열 enum(`NO_DATA`/`PROFIT_DOWN`/`PROFIT_UP`/`PROFIT_SAME`/`PROFIT_SAME_BUT_ITEMS_CHANGED`)으로 단순화하면서 적자 전환·적자 축소 전용 상태(`DEFICIT_FLIP`/`DEFICIT_REDUCED`)를 폐지(이익 증감 부호만으로 통합 판정). `rankedImpacts[]` 필드명을 `key`/`label`→`id`/`name`으로, 텍스트 `note`→열거값 `flag`(`NEW_COST`/`COST_ENDED`/`null`, 배지 문구는 UI가 매핑)로 변경. 최상위 `deltas` 필드 제거(각 `rankedImpacts[]` 항목에 `delta`/`prev`/`curr`로 포함). `actionHints[]` 필드명 `label`→`name`, `hint`→`text`, `impact` 추가. `02_Rule_Engine_Profit_Drop_Diagnosis.md`·`engine/profit-analyzer.test.js`(QA-01~15) 동시 갱신. 기획문서 검증 케이스(이익 변동 −2,500,000 / 1등 식재료비 −1,500,000 / 순위 식재료비\>인건비\>수수료\>기타비용 / 영향 합계 −2,500,000)는 개편 전과 수치 동일함을 테스트로 확인. |
| 1.0.0 | 2026-09-16 | Added | 최초 구현. 지난달·이번 달 매출·비용 6항목(매출/식재료비/인건비/임대료/수수료/기타비용) 비교, 이익 계산·증감, 항목별 이익 영향·영향 순위(동률 타이브레이크 고정), 상태 판정(전부 0/적자 전환/적자 축소/이익 감소/이익 증가/동일/항목 변화), 다음 확인(행동 힌트). |
| 1.0.0 | 2026-09-16 | Added | 순수 계산 엔진 `engine/profit-analyzer.js` + 회귀 테스트 `engine/profit-analyzer.test.js` (QA-01~15, 필수 검증 케이스 포함). |
| 1.0.0 | 2026-09-16 | Added | 혜택on 공통 디자인 시스템 적용(back-bar / app-header / notice-bar / hero-card / report-cards / accordion). 반응형 1·2·3단, 모바일 400px·데스크톱 1280px 가로 스크롤 없음 확인. |
| 1.0.0 | 2026-09-16 | Added | localStorage: 입력값 자동 저장(`profitDropDiagnosisInputs`). 계산 기록(history)은 저장하지 않음(도구 성격상 두 기간 비교만 필요). |
| 1.0.0 | 2026-09-16 | Added | SEO 메타 + JSON-LD(SoftwareApplication · BreadcrumbList · FAQPage), Pretendard(jsdelivr CDN). |
| 1.0.0 | 2026-09-16 | Added | 문서: PRD, Rule Engine, QA Test Cases, README, CLAUDE.md. |
| 1.0.0 | 2026-09-16 | Added | `data/resources.json` 에 항목 추가, 저장소 루트 `sitemap.xml` 에 URL 추가. |
