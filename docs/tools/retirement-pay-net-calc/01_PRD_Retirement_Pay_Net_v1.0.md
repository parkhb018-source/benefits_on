# PRD — 퇴직금 실수령액 계산기

기준 문서: `09_BenefitsON_PRD_Template_v1.0`

## 1. Basic Information

- Project Name: 퇴직금 실수령액 계산기
- Tool ID: `RETIREMENT-PAY-NET-001`
- Document Version: v1.1 (2차 정책 검증 반영, 파일명은 최초 승인본 v1.0 유지)
- Status: **Development** (2026-08-17 최종 코딩 승인, Planning → Development)
- Author: BenefitsON
- Planned Release Date: [확인 필요 — 개발 완료 후 최종 QA 통과 시점 기준으로 산정]

## 2. Product Overview

**한 줄 설명**: 입사일·퇴사일·급여만 입력하면 예상 퇴직금과 퇴직소득세·지방소득세를 제외한 예상 실수령액을 계산해주는 무료 도구.

**Problem**: 근로자는 "내가 퇴직금을 얼마나 받는지"는 대략 알아도 "세금을 떼고 실제 얼마를 받는지"는 알기 어렵다. 국세청 계산기는 세금만 계산하고, 기존 `article-severance.html`은 퇴직금 산식만 설명하며 세금은 국세청으로 아웃링크한다. 두 계산을 이어주는 도구가 없다.

**Solution**: 근로기준법 기준 퇴직금 계산 → 소득세법 기준 퇴직소득세·지방소득세 계산 → 예상 실수령액을 한 화면에서 순차적으로 보여준다.

## 3. Target User

- Primary User: 퇴직(예정)을 앞둔 일반 근로자 — 계약직/정규직 무관
- Secondary User: 소상공인/사업주 — 직원 퇴직금 예상 지급액을 사전 파악하려는 경우

## 4. User Scenario

```
① 입사일·퇴사일 입력 (근속기간 자동 계산)
↓
② 퇴직 전 3개월 평균 월급여 입력
↓
③ (선택) 연간 상여금·기타수당 총액, 만 나이 입력
↓
④ 계산하기 클릭
↓
⑤ 세전 퇴직금 → 퇴직소득세 → 지방소득세 → 예상 실수령액 순서로 결과 확인
```

## 5. Functional Requirements

- 입력값 검증(날짜 순서, 급여 양수 여부)
- 지급요건 판정(LAW-RET-01/02) — 미충족 시 계산 대신 안내 메시지
- 평균임금 계산(CAL-RET-01)
- 퇴직금 계산(CAL-RET-02)
- 퇴직소득세 계산(TAX-RET-01~05)
- 지방소득세 계산(TAX-RET-06)
- 예상 실수령액 및 IRP 의무이전 고지(TAX-RET-07, TAX-RET-07-IRP)
- 초기화(Reset)
- 결과 링크 공유는 MVP 범위 아님(URL 파라미터 인코딩 등 미구현)

## 6. Input Definition

| 항목 | 필수 | 설명 |
|---|---|---|
| 입사일 | O | date input |
| 퇴사일 | O | date input, 입사일 이후여야 함 |
| 퇴직 전 3개월 평균 월급여 | O | 원 단위 숫자, 0 초과 |
| 연간 상여금·기타수당 총액 | X (기본값 0) | 상여금+연차수당 등을 합산해 하나의 필드로 입력. 3/12 가중치로 평균임금에 반영(CAL-RET-01) |
| 만 나이 | X (기본값: IRP 고지 생략) | IRP 의무이전 고지(TAX-RET-07-IRP) 판단에만 사용, 세액 계산에는 영향 없음 |

Design System 문서의 "입력 5개 이하 권장" 기준 충족(총 5개, 그중 2개는 선택 입력).

## 7. Output Definition

**2차 검증에서 확정한 결과 명칭** — 평균임금이 간편(근사) 계산이라는 한계(Appendix A 참조)와 IRP 이전 시 즉시 현금 수령이 아닐 수 있다는 점을 결과 명칭 자체에 반영한다.

```
예상 세후 금액 (퇴직소득세·지방소득세 제외)
XXX,XXX,XXX원

세전 예상 퇴직금 (간편 계산)
XXX,XXX,XXX원

예상 퇴직소득세
XXX,XXX원

예상 지방소득세
XX,XXX원
```

+ "간편 계산" 옆에 `?` 툴팁 또는 하단 각주로 "실제 평균임금과 다를 수 있습니다(수습·휴직 등 제외기간 미반영)" 고지
+ IRP 해당 시(만 55세 미만·퇴직금 300만원 초과) 상단에 "실제 현금 수령이 아닌 IRP 계좌 이전 후 과세이연될 수 있음" 안내 박스 별도 표시

+ 지급요건 미충족 시: `.eligibility-box.warn` 스타일로 사유 표시
+ IRP 해당 시: `.info-box`로 고지문 표시
+ 하단 고지: Rule Engine 표준 면책문구 + 이 도구 전용 고지 4종(`policy-data-draft.json`의 `disclaimers[]`)

## 8. Rule Engine

사용된 Rule ID (전체 정의는 `02_Rule_Engine_Retirement_Pay.md` 참조):

`LAW-RET-01`, `LAW-RET-02`, `CAL-RET-01`, `CAL-RET-02`, `TAX-RET-01`, `TAX-RET-02`, `TAX-RET-03`, `TAX-RET-04`, `TAX-RET-05`, `TAX-RET-06`, `TAX-RET-07`, `TAX-RET-07-IRP`

## 9. UI Structure

```
Header
↓
Tool Title ("퇴직금 실수령액 계산기")
↓
Description
↓
Input (calc-card, 5개 필드)
↓
Result (result-hero + detail-rows + eligibility-box/info-box)
↓
Analysis / 계산 방식 설명 (article-body)
↓
Guide (계산 예시)
↓
FAQ
↓
Footer
```
`pages/calc-youth-deposit.html`의 실제 마크업 구조·CSS 클래스를 그대로 재사용(신규 클래스 도입 없음).

## 10. UX Flow

```
Start → Input → Validation → 지급요건 판정(LAW-RET-01/02)
  ├─ 미충족 → 안내 메시지 표시 후 종료
  └─ 충족 → Calculation(CAL/TAX) → Result 표시 → Reset 가능
```

## 11. Error Handling

| 예외 상황 | 처리 |
|---|---|
| 빈 값 | "입력값을 확인해주세요" |
| 문자 입력(날짜/숫자 형식 오류) | 브라우저 native date/number input으로 1차 방지 + JS 검증 |
| 음수 입력 | "급여는 0보다 커야 합니다" |
| 범위 초과(비현실적 초고액 등) | MVP는 별도 상한 검증 없음 — 세율표 최상단 구간(45%)까지 자연스럽게 커버되므로 로직상 문제 없음 |

## 12. Validation Rules

- 퇴사일 ≥ 입사일 + 1일
- 3개월 평균 월급여 > 0
- 연간 상여금·기타수당 ≥ 0
- 만 나이(입력 시) 0 < age < 120

## 13. Responsive Requirements

Mobile / Tablet / Desktop / POS(가로형) — 기존 `calc-*.html` 반응형 브레이크포인트 그대로 사용.

## 14. SEO Requirements

- Title (안): `퇴직금 실수령액 계산기 2026 — 퇴직소득세·지방소득세 자동계산 — 혜택on`
- Description (안): `입사일·퇴사일·급여만 입력하면 예상 퇴직금과 퇴직소득세·지방소득세를 제외한 실수령액을 30초 만에 확인하세요.`
- Canonical: `https://benefitson.pages.dev/pages/calc-retirement-pay.html` [확인 필요 — 실제 배포 도메인, CLAUDE.md의 `YOUR-DOMAIN.com` 플레이스홀더 정책과 동일하게 배포 전 확정]
- OG/Twitter: 기존 공용 `/og-image.png` 재사용
- JSON-LD: `WebApplication`(`calc-youth-deposit.html` 패턴) — Rule Engine Standard/Tool Development Framework 문서가 요구하는 FAQ Schema·Breadcrumb Schema는 기존 `calc-*.html`에는 없는 신규 항목이라 이번 PRD에서 **추가 적용을 제안**(코딩 단계에서 확정)
- 키워드: 퇴직금 계산기, 퇴직금 실수령액 계산기, 퇴직금 세금 계산기, 퇴직소득세 계산기, 퇴직금 세후 금액, 퇴직금 계산, 퇴직금 세금

## 15. Accessibility

키보드 조작 가능, 충분한 명도 대비, 큰 버튼/입력창 — 기존 `calc-*.html` 기준 그대로.

## 16. Performance

3초 이내 로딩, 계산 결과 0.5초 이내, Lighthouse 90+ (Tool Development Framework 문서 9번 기준)

## 17. Security

개인정보(급여·근속기간) 저장 안 함, HTTPS, 입력값 검증. localStorage 미사용(관리자 정책데이터 오버라이드 메커니즘은 이 도구의 정책 데이터가 연 1회 미만 변경이라 적용 여부는 코딩 단계 판단 사항으로 남김).

## 18. Testing Checklist

`04_QA_Test_Cases.md` 참조 — 기능/UI/SEO/성능/접근성/브라우저 전 항목.

## 19. Release Checklist

- [ ] GitHub Commit
- [ ] GitHub Pages 배포 확인 [문서상 "Cloudflare"와 실제 배포 방식(GitHub Pages) 불일치 — 20번 보고서에서 별도 확인 요청]
- [ ] Change Log 작성
- [ ] Release Note 작성
- [ ] Tool Database 등록/상태 갱신(Planning → Released)

## 20. KPI

방문자 수, 재방문율, 검색 CTR, 입력 완료율(Product Strategy 문서 9번 KPI: 평균 사용시간 1분 이내/입력 완료율 90%+/결과 확인율 95%+/재방문율 30%+/오류 신고율 1%↓)

## 21. Related Documents

Product Strategy, Business Blueprint, Free Tools Manifest, Tool Evaluation Framework(`00_Tool_Evaluation_Sheet.md`), Rule Engine Standard(`02_Rule_Engine_Retirement_Pay.md`), Policy Sources(`03_Policy_Sources.md`), QA Test Standard(`04_QA_Test_Cases.md`)

## 22. Change Log

| Version | Date | Description |
|---|---|---|
| v1.0 | 2026-08-17 | 최초 PRD 작성(조사·설계 단계, 코딩 전) |
| v1.1 | 2026-08-17 | 2차 정책 검증 반영 — 결과 명칭 확정("간편 계산"·"예상 세후 금액"), IRP 조항 정확한 근거(제9조제2항) 반영, 원 단위 절사 규칙 추가, Appendix A(평균임금 근사 계산 A/B/C 결론) 추가 |
| v1.2 | 2026-08-17 | 최종 코딩 승인 — Status Planning → Development. TAX-RET-01 근거 소득세법 시행령 제42조의2로 최종 확정(3차 검증), 코딩 착수 |

## 23. Approval

| Role | Status |
|---|---|
| Product | Pending |
| Design | Pending |
| Development | Pending |
| QA | Pending |

## 24. Completion Criteria

- 기능 정의 완료 ✅(본 PRD)
- Rule 검증 완료 — 코딩 단계에서 `engine/*.test.js`로 확인 예정
- 테스트 완료 — 코딩 단계
- SEO 적용 — 코딩 단계
- 문서 작성 완료 ✅(본 산출물 세트)
- BenefitsON 배포 완료 — 코딩 승인 후

## Appendix A — 평균임금 근사 계산 2차 검증 (지시서 7번 A/B/C 결론)

**A. 현재 입력값(입사일·퇴사일·3개월 평균 월급여·기타수당 총액)만으로 법정 평균임금을 정확히 계산할 수 있는가?**
아니오. 근로기준법 시행령 제2조는 산정기간(퇴직 전 3개월) 중 수습기간(3개월 이내)·사용자 귀책 휴업·출산전후휴가·업무상 요양휴업·육아휴직·쟁의행위기간·병역의무이행기간·사용자 승인 휴업이 있으면 그 기간과 그 기간 중 지급된 임금을 산정기간·임금총액에서 각각 제외하도록 정한다. 또한 임시로 지급된 임금·수당, 통화 외의 것으로 지급된 임금은 산입하지 않는다. 이 계산기는 이런 예외기간의 존재 여부를 입력받지 않으므로, 해당 사유가 있는 근로자에게는 부정확한 근사값이 나온다.

**B. 불가능하다면 어떤 추가 입력값이 필요한가?**
정확히 계산하려면 최소한 "최근 3개월간 위 예외기간(수습·휴업·휴직 등)에 해당하는 일수와 그 기간 지급 임금"을 별도로 입력받아야 한다. 이는 Design System 문서의 "입력 5개 이하 권장" 기준과 정면으로 충돌하고, 대부분의 일반 사용자에게는 해당사항이 없는 예외 케이스를 위해 전체 UX를 복잡하게 만든다. 따라서 MVP에서는 이 추가 입력을 채택하지 않는다.

**C. MVP 간편 계산의 결과 명칭과 고지 문구는 어떻게 해야 하는가?**
"예상 퇴직금"이라는 표현만으로는 근사치라는 한계가 드러나지 않으므로, **"세전 예상 퇴직금 (간편 계산)"**으로 명칭을 확정하고, 계산 방식 설명(article-body) 및 결과 카드 하단에 다음 고지를 명시한다:
> 이 결과는 최근 3개월 평균 급여를 기준으로 한 간편 계산입니다. 수습기간, 휴직·휴업 기간이 있었던 경우 실제 법정 평균임금과 다를 수 있습니다. 정확한 금액은 회사의 임금대장을 기준으로 확인하세요.

동일한 논리로 세후 금액도 "예상 세후 금액"으로 표기하고 IRP 이전 대상자에게는 "실제 현금 수령액과 다를 수 있음"을 별도 고지한다(§7 Output Definition 참조).

## 25. PRD Principle

> 모든 무료도구는 PRD 없이 개발하지 않는다.

본 PRD는 코딩 착수의 기준 문서이며, 사용자 승인 후에만 `pages/calc-retirement-pay.html` 등 실제 코드 작성 단계로 진행한다.
