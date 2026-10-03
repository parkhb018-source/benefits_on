// 글자 읽기(OCR) 결과에서 깨진 줄만 아주 보수적으로 빼는 순수 함수.
// 아래 조건에 해당하는 줄만 지운다. 날짜·별점 줄처럼 보여도 조건에 안 맞으면 남긴다(리뷰 내용일 수 있음).
//  (1) 한글 음절·한글 자모·영문·숫자 합계가 2개 미만 — 단, 한글 음절이 하나라도 있으면 지우지 않는다("굿" 같은 한 글자 리뷰 보호)
//  (2) 위 문자 비율이 줄 전체 글자(공백 제외)의 40% 미만

const MEANINGFUL = /[가-힣ㄱ-ㅎㅏ-ㅣᄀ-ᇿA-Za-z0-9]/gu;
const SYLLABLE = /[가-힣]/u;

export function isBrokenLine(line) {
  const chars = Array.from(line.replace(/\s/gu, ''));
  if (chars.length === 0) return true;
  const meaningful = (line.match(MEANINGFUL) || []).length;
  if (meaningful < 2 && !SYLLABLE.test(line)) return true;
  return meaningful / chars.length < 0.4;
}

// 결과: { text, removed } — removed 는 지운 줄 수(빈 줄은 세지 않는다)
export function cleanOcrText(text) {
  const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const kept = lines.filter((l) => !isBrokenLine(l));
  return { text: kept.join('\n'), removed: lines.length - kept.length };
}
