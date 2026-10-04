// 리뷰 유형 분류 — data/review-helper/classify_check.py 를 그대로 옮긴 것.
// 규칙 원본은 types.json 의 classification.steps. 판정 문구는 여기 두지 않는다(화면이 types.json 에서 읽음).
// 규칙을 바꾸면 classify_check.py 와 이 파일을 함께 고치고 classify-fixtures.json 31개를 다시 돌린다.

const RISK_KEYWORD_TYPES = ['T06', 'T05', 'T13']; // 키워드로 잡는 위험·핵심 유형
const NEGATIVE_TYPES = ['T01', 'T02', 'T03', 'T04', 'T07', 'T08', 'T09', 'T10'];

// typesData: types.json 전체, abuseCheck: createAbuseChecker(...) 가 돌려준 함수
export function createClassifier(typesData, abuseCheck) {
  const TYPES = Object.fromEntries(typesData.types.map((t) => [t.id, t]));
  const KW = {};
  for (const t of typesData.types) {
    if (t.match.type === 'keywords') KW[t.id] = t.match.keywords.map((k) => k.toLowerCase());
  }
  const POSITIVE = KW.T14;
  const prio = (id) => TYPES[id].priority;
  const minByPrio = (ids) => ids.reduce((a, b) => (prio(b) < prio(a) ? b : a));

  return function classify(text, rating = null) {
    const t = (text || '').trim();
    const low = t.toLowerCase();
    const ab = abuseCheck(t);
    const hit = (ids) => ids.filter((id) => KW[id].some((k) => low.includes(k)));
    const risk = hit(RISK_KEYWORD_TYPES).concat(ab.abusive ? ['T12'] : []);
    const neg = hit(NEGATIVE_TYPES);
    const positive = POSITIVE.some((k) => low.includes(k));
    // 1단계: 공백을 뺀 글자 수가 5자 미만이면
    //   (a) 욕설·모욕이 있으면 T12
    //   (b) 키워드(위험·핵심 / 일반 불만 / 칭찬)가 하나라도 걸리면 아래 2~5단계를 그대로 적용
    //   (c) 아무것도 걸리지 않을 때만 '별점만'(T11). 빈 글도 T11
    if (Array.from(t.replace(/\s/gu, '')).length < TYPES.T11.match.maxChars + 1) {
      if (ab.abusive) return { main: 'T12', secondary: [], abusive: true, vulgar: ab.vulgar };
      if (!risk.length && !neg.length && !positive) return { main: 'T11', secondary: [], abusive: false, vulgar: false };
    }
    let main = null;
    if (risk.length) {
      main = minByPrio(risk); // 2단계: 위험·핵심 유형은 항상 우선
    } else if (positive && neg.length) { // 3단계: 칭찬과 불만이 함께 있을 때
      if (rating !== null && rating <= 2) main = minByPrio(neg);
      else if (rating === 5) main = 'T14';
      else main = 'T15';
    } else if (positive) {
      if (rating === null || rating >= 4) main = 'T14';
    } else if (neg.length) {
      main = minByPrio(neg); // 4단계: 일반 불만은 우선순위가 높은 유형
    }
    const secondary = risk.concat(neg).filter((id) => id !== main).sort((a, b) => prio(a) - prio(b));
    return { main, secondary, abusive: ab.abusive, vulgar: ab.vulgar };
  };
}
