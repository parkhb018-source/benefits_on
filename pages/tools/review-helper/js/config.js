// 리뷰 대응도우미 설정값 — 한곳에 모은다.

export const TOOL_ID = 'review-helper';

// 하단 탭 "무료도구 돌아가기" 이동 주소 (기존 도구 back-bar·BreadcrumbList 와 같은 허브)
export const HUB_URL = '/pages/small-business';

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

// 캡쳐 글자 읽기(Tesseract.js) — jsDelivr CDN, 버전 고정(OPEN-ITEMS 12번, 2026-10-04 승인).
// 캡쳐 화면에 들어갈 때만 불러온다. 버전을 올리면 integrity 를 새 파일로 다시 계산한다:
//   curl -sL <script URL> | openssl dgst -sha384 -binary | openssl base64 -A
export const OCR_ENABLED = true;
export const TESSERACT = {
  script: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js',
  integrity: 'sha384-2BQ3U3OdKOb0Uczxqr41I9UvZkzr4V9Hv8uSzMMZAlmhsFClvdZX5wi5fDCzG+tM',
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0', // 브라우저 기능에 맞는 wasm 파일을 라이브러리가 고른다
  langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/kor/4.0.0_best_int',
  lang: 'kor',
};
export const OCR_MAX_SIDE = 2000; // 긴 변이 이보다 크면 줄여서 처리(px)
export const OCR_TIMEOUT_MS = 90000; // 프로그램 내려받기 + 글자 읽기 전체 제한 시간
