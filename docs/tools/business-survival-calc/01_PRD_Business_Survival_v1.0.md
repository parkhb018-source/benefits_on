# PRD — 사업 생존기간 계산기 ("지금 매출로 몇 개월 버틸까?")

기준 문서: `09_BenefitsON_PRD_Template_v1.0`

## 1. Basic Information

- Project Name: 사업 생존기간 계산기
- Tool ID: `BUSINESS-SURVIVAL-001`
- Category: B. Business Calculators
- Document Version: v1.0
- Status: **Development**
- Author: BenefitsON
- 배포 경로(예정): `pages/tools/business-survival-calc/index.html`

## 2. Product Overview

**한 줄 설명**: 현재 현금·매출·비용을 입력하면 현재 조건에서 현금이 최소 유지금액에 도달하는 예상 기간(생존 개월 수)을 계산하는 무료 도구.
**서브헤딩(화면)**: "사장님, 지금 매출로 몇 개월 버틸 수 있을까요?"
**SEO Title**: 사업 생존기간 계산기 | 지금 매출로 몇 개월 버틸까?

**Problem**: 소상공인은 "이익이 나는지"는 감으로 알아도 "현금이 언제 바닥나는지"는 계산하기 어렵다. 이익과 현금흐름은 다르다. 손익분기점 계산기는 "얼마 팔아야 하나"만 답하고, 현금 소진 시점을 알려주는 도구가 없다.

**Solution**: 5개 입력만으로 월 현금흐름 → 생존기간 → 상태 판정 → 분석 카드 → 시나리오 비교를 한 화면에서 즉시(서버 없이) 제공한다.

## 3. Target User

- Primary User: 개인사업자·소상공인 (음식점, 카페, 미용실, 네일샵 등), 1인 사업자
- Secondary User: 예비창업자 — 창업 후 현금 소진 속도를 사전 점검

## 4. User Scenario

```
① 현재 보유 현금 입력
↓
② 월평균 매출 입력
↓
③ 변동비 · 고정비 · 기타 현금 유출 입력
↓
④ (선택) 최소 유지 현금 입력
↓
⑤ 예상 생존기간 → 상태 → 분석 리포트 → 시나리오 비교 순서로 확인
```

## 5. Functional Requirements

- 입력값 실시간 콤마 처리 · 실시간 계산(버튼 없이도)
- 월 현금흐름 · 생존기간 계산 (120개월 표시 상한)
- 상태 판정 (안정/주의/경고/위험) + Rule Engine 리포트(결과·근거·권장 행동)
- 분석 카드 5종 (CAL-001~005)
- 시나리오 6종 (현재 + 매출 −10/−20/−30%, 고정비 −10/−20%)
- 최근 계산 기록 (localStorage, 최대 10건, 개별/전체 삭제)
- 입력값 자동 저장 (localStorage) / "초기화" 버튼
- 면책 문구 상시 노출

## 6. Input Definition

| 항목 | 필수 | 단위 | 검증 |
|---|---|---|---|
| 현재 보유 현금 | O | 원(정수) | ≥ 0 |
| 월평균 매출 | O | 원(정수) | ≥ 0 |
| 월 변동비 | O | 원(정수) | ≥ 0, 매출 초과 시 **입력 차단** |
| 월 고정비 | O | 원(정수) | ≥ 0 |
| 월 기타 현금 유출 | O | 원(정수) | ≥ 0, 매출 초과 시 **경고(계산 진행)** |
| 최소 유지 현금 | X | 원(정수) | ≥ 0, 미입력 = 0 |

- 콤마 입력만 허용되어 음수·문자는 구조적으로 입력 불가.
- 총비용(변동비+고정비+기타) > 매출 조합은 **허용** — 적자 상황을 보여주는 것이 도구의 목적.

## 7. Output Definition

예상 생존기간(개월+일), 상태 뱃지, 월 현금흐름, 매월 감소액, 현금 흐름 내역(리스트), Rule 리포트(상태 판정 + CAL 카드 5종), 시나리오 표, 최근 계산 기록.

## 8. Rule Engine

`docs/02_Rule_Engine_Business_Survival.md` 참조. Rule ID: `SURV-001`~`SURV-005`, `CAL-001`~`CAL-005`.

## 9. UI Structure (혜택on 공통 규격)

```
tool-back-bar → app-header(가운데) → notice-bar → app-main
  → layout-grid: 1.정보 입력 / 2.계산 결과(hero-card) / 3.분석 리포트(report-cards + 시나리오 + 기록)
  → tool-disclaimer
  → accordion(사용법 / FAQ)
→ app-footer
```

## 10. Error Handling

빈 값(필수 미입력 → 계산 대기) / 변동비 > 매출(차단) / 기타 유출 > 매출(경고).

## 11. Responsive

Mobile(1단) / Tablet ≥768px(2단) / PC ≥1200px(3단 sticky). POS 가로형은 3단 레이아웃으로 커버.

## 12. SEO

`<title>`, meta description, canonical, Open Graph(site_name: 혜택on), JSON-LD(SoftwareApplication + BreadcrumbList + FAQPage).

## 13. Accessibility

키보드 전체 조작, `role="alert"` 오류 안내, 상태는 색+텍스트(뱃지 라벨) 병행, 큰 입력창/버튼(min-height 46~52px).

## 14. Performance

외부 JS 라이브러리 0개. Pretendard는 사이트 공통 CDN(jsdelivr). 계산 즉시. 무빌드 정적.

## 15. Security · Privacy

서버 통신 없음. 입력값·계산 기록은 localStorage(내 브라우저)에만 저장, 전송 없음.

## 16. 비기능 (구현 금지)

카드/은행 연동, 영수증 OCR, 세금 계산, 회계장부, AI 상담, 로그인/결제, 서버 저장.

## 17. Completion Criteria

기능 정상 동작 · `engine/survival-calculator.test.js` 통과 · `03_QA_Test_Cases.md` 시나리오 일치 · 반응형 확인 · SEO 적용 · 문서 작성 완료.

## 18. Change Log

`CHANGELOG.md` 참조.
