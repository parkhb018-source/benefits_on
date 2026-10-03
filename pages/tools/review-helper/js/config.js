// 리뷰 대응도우미 설정값 — 한곳에 모은다.

export const TOOL_ID = 'review-helper';

// 하단 탭 "무료도구 돌아가기" 이동 주소 (기존 도구 back-bar·BreadcrumbList 와 같은 허브)
export const HUB_URL = '/pages/resources';

// 데이터 JSON 위치(절대경로). 파일 이름 → 기대 schemaVersion
export const DATA_BASE = '/data/review-helper/';
export const DATA_FILES = {
  platforms: { file: 'platforms.json', schema: 1 },
  checklist: { file: 'checklist.json', schema: 1 },
  types: { file: 'types.json', schema: 1 },
  templates: { file: 'templates.json', schema: 1 },
  abuse: { file: 'abuse-words.json', schema: 1 },
};

// 확인 화면 플랫폼 칩 순서와 칩 이름(PRD 3절 2번). 네이버는 칩에서만 '네이버·기타'로 줄여 쓴다.
export const PLATFORM_CHIPS = [
  { id: 'baemin', label: '배달의민족' },
  { id: 'coupangeats', label: '쿠팡이츠' },
  { id: 'yogiyo', label: '요기요' },
  { id: 'naver_place', label: '네이버·기타' },
];
export const DEFAULT_PLATFORM = 'baemin';
export const DEFAULT_TONE = 'polite';

// PC 3열 레이아웃 시작 폭(PRD 2절)
export const DESKTOP_MIN_WIDTH = 960;

// 캡쳐 글자 읽기(Tesseract.js). 로드 방식이 승인되기 전까지 꺼 둔다(OPEN-ITEMS 12번).
export const OCR_ENABLED = false;
