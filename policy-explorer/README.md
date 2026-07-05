# 정부정책 탐색기 (policy-explorer)

공공데이터포털 **보조금24(gov24) Open API**에서 정부 정책을 수집해, 혜택on 관리자
"일괄 가져오기"에 바로 올릴 수 있는 `import-policies.json`으로 변환하는 **로컬 Node 스크립트**.

> 21개 기관을 각각 연동하지 않는다. 보조금24가 중앙부처·지자체 정책을 통합 제공하므로
> API 하나로 대부분을 한 번에 가져온다. (빠진 정책은 혜택on 관리자에서 수동 추가)

## 준비물

- **Node.js 20 이상** (내장 `fetch` 사용, 추가 설치 패키지 없음)
- 공공데이터포털 인증키

## 1. API 키 발급 (1회)

1. [공공데이터포털](https://www.data.go.kr) 가입·로그인
2. **"보조금24"** 또는 **"gov24"** 검색 → 서비스 목록 API(예: `gov24 서비스 목록`) **활용신청**
3. 마이페이지 → 활용신청 현황에서 **일반 인증키(Decoding)** 복사

## 2. 설정

**① 인증키는 `.env`에 (보안)**
```bash
cp .env.example .env    # .env는 git에 올라가지 않음(.gitignore)
```
`.env`를 열어 발급받은 **Decoding 인증키**를 넣는다:
```
SUBSIDY_SERVICE_KEY=여기에-실제-키
```
> 키를 코드/설정이 아니라 `.env`에 두는 이유: 실수로 커밋·공개되는 사고를 막기 위함.
> 이 스크립트는 추가 설치 없이 `.env`를 자동으로 읽는다.

**② 나머지 설정은 `config.json`에**
```bash
cp config.example.json config.json   # config.json도 .gitignore
```

`config.json`을 열어 채운다 (serviceKey는 여기 없음 — .env에 있음):

| 키 | 설명 |
| --- | --- |
| `endpoint` | 보조금24 API 요청주소 (물음표 앞까지, 오퍼레이션명 포함) |
| `perPage` / `maxPages` | 페이지당 건수 / 최대 페이지 (수집량 조절) |
| `keyword` | 서비스명 LIKE 필터 (비우면 전체) |
| `filter.dropPastDeadline` | true면 신청기한이 지난 정책 제외 (상시·미래 마감은 유지) |
| `filter.dropOldYearInTitle` | true면 제목의 연도가 전부 올해보다 과거인 정책 제외 (연도 미언급은 유지) |
| `excludeExistingFrom` | 기존 혜택on `policies.json` 경로 — 중복 제목 자동 제외 |
| `fieldMap` | API 응답 필드명 매핑 (데이터셋이 다르면 여기만 수정) |

> ⚠️ **데이터셋마다 응답 필드명이 다릅니다.** 처음 한 번은 작은 `maxPages`로 실행해
> `output/import-policies.json`을 열어보고, 비어있거나 이상하면 `fieldMap`을 실제 응답
> 필드명에 맞게 고치세요. (응답 필드는 공공데이터포털의 해당 API 문서/미리보기로 확인)

## 3. 실행

```bash
node src/index.js
```

결과: `output/import-policies.json` 생성. 콘솔에 `수집 N → 마감 지난 N 제외 → 미분류 N 제외 → 신규 N` 요약 출력.

## 4. 혜택on에 반영

1. 생성된 `output/import-policies.json`을 혜택on 관리자 **"일괄 가져오기"** 에 업로드
2. 미리보기에서 신규/중복 확인, 미분류 카테고리 보정 → **적용**
3. 내보내기 → `data/policies.json` 덮어쓰기 → git push (배포)

> "일괄 가져오기" 탭은 혜택on 쪽 후속 작업입니다(현재 미구현). 두 쪽은 아래 출력 스키마를
> 공유합니다.

## 출력 스키마

```json
[
  {
    "title": "2026 청년 전세보증금 지원",
    "category": "청년정책",
    "summary": "최대 2천만원 무이자 대출…",
    "sourceUrl": "https://www.gov.kr/...",
    "deadline": "2026-09-30",
    "tags": ["국토교통부", "주거"]
  }
]
```

## 폴더 구조

```
policy-explorer/
├── config.example.json   # 템플릿(커밋)
├── config.json           # 실제 키(.gitignore)
├── src/{fetch,categorize,transform,index}.js
├── output/import-policies.json   # 결과물(.gitignore)
└── README.md
```
