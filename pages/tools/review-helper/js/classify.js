// 리뷰 유형 분류 — data/review-helper/classify_check.py 를 그대로 옮긴 것.
// 규칙 원본은 types.json 의 classification.steps. 판정 문구는 여기 두지 않는다(화면이 types.json 에서 읽음).
// 규칙을 바꾸면 classify_check.py 와 이 파일을 함께 고치고 classify-fixtures.json 97개·normalize-fixtures.json 41개를 다시 돌린다.
import { normalizeForMatch } from './normalize.js?v=20261005c';

const RISK_KEYWORD_TYPES = ['T06', 'T05', 'T13']; // 키워드로 잡는 위험·핵심 유형
const NEGATIVE_TYPES = ['T01', 'T02', 'T03', 'T04', 'T07', 'T08', 'T09', 'T10'];

// typesData: types.json 전체, abuseCheck: createAbuseChecker(...) 가 돌려준 함수
export function createClassifier(typesData, abuseCheck) {
  const TYPES = Object.fromEntries(typesData.types.map((t) => [t.id, t]));
  const KW = {};
  for (const t of typesData.types) {
    if (t.match.type === 'keywords') KW[t.id] = t.match.keywords.map(normalizeForMatch);
  }
  const POSITIVE = KW.T14;
  const { generalNegative, positiveGuards } = typesData.classification;
  const GENERAL_NEG = generalNegative.map(normalizeForMatch); // 특정 유형이 없는 일반 불만 표현
  const GUARD_BEFORE = {}; // 정규화 키워드 -> 막는 앞 글자
  for (const g of positiveGuards.before) {
    for (const k of g.keywords) {
      const key = normalizeForMatch(k);
      GUARD_BEFORE[key] = (GUARD_BEFORE[key] || []).concat(g.chars.map(normalizeForMatch));
    }
  }
  const GUARD_AFTER = positiveGuards.after.map((g) => ({
    keys: g.appliesTo ? g.appliesTo.map(normalizeForMatch) : null, // 적용 키워드(null=전부)
    patterns: g.patterns.map(normalizeForMatch),
    within: g.withinChars,
  }));
  const prio = (id) => TYPES[id].priority;
  const minByPrio = (ids) => ids.reduce((a, b) => (prio(b) < prio(a) ? b : a));
  // 글자 수는 Python 과 같게 코드 포인트로 센다(이모지 등)
  const cpLen = (s) => Array.from(s).length;

  // 정규화한 글에서 칭찬 키워드 등장을 살펴 [막히지 않은 칭찬이 있는가, 막힌 칭찬이 있는가]
  function positiveHits(low) {
    let ok = false;
    let guarded = false;
    for (const k of POSITIVE) {
      for (let s = low.indexOf(k); s !== -1; s = low.indexOf(k, s + 1)) {
        const e = s + k.length;
        const prev = s > 0 ? Array.from(low.slice(0, s)).pop() : '';
        const before = s > 0 && (GUARD_BEFORE[k] || []).includes(prev); // 앞 글자로 막기
        const after = GUARD_AFTER.some((g) => (!g.keys || g.keys.includes(k)) && g.patterns.some((p) => { // 뒤 표현으로 막기
          const i = low.indexOf(p, e);
          return i !== -1 && cpLen(low.slice(e, i)) <= g.within;
        }));
        if (before || after) guarded = true;
        else ok = true;
      }
    }
    return [ok, guarded];
  }

  return function classify(text, rating = null) {
    const t = (text || '').trim();
    const low = normalizeForMatch(t); // 키워드 비교용. 욕설 판정은 원문으로
    const ab = abuseCheck(t);
    const hit = (ids) => ids.filter((id) => KW[id].some((k) => low.includes(k)));
    const risk = hit(RISK_KEYWORD_TYPES).concat(ab.abusive ? ['T12'] : []);
    const neg = hit(NEGATIVE_TYPES);
    const [positive, guarded] = positiveHits(low);
    const general = guarded || GENERAL_NEG.some((k) => low.includes(k)); // 막힌 칭찬도 일반 불만 표현으로 본다
    // 1단계: 공백을 뺀 글자 수가 5자 미만이면
    //   (a) 욕설·모욕이 있으면 T12
    //   (b) 키워드(위험·핵심 / 일반 불만 / 칭찬 / 일반 불만 표현)가 하나라도 걸리면 아래 2~5단계를 그대로 적용
    //   (c) 아무것도 걸리지 않을 때만 '별점만'(T11). 빈 글도 T11
    if (Array.from(t.replace(/\s/gu, '')).length < TYPES.T11.match.maxChars + 1) {
      if (ab.abusive) return { main: 'T12', secondary: [], abusive: true, vulgar: ab.vulgar };
      if (!risk.length && !neg.length && !positive && !general) return { main: 'T11', secondary: [], abusive: false, vulgar: false };
    }
    let main = null;
    if (risk.length) {
      main = minByPrio(risk); // 2단계: 위험·핵심 유형은 항상 우선
    } else if (positive && neg.length) { // 3단계: 칭찬과 불만이 함께 있을 때
      if (rating !== null && rating <= 2) main = minByPrio(neg);
      else if (rating === 5) main = 'T14';
      else main = 'T15';
    } else if (positive && general) { // 3단계: 칭찬과 일반 불만 표현만(불만 유형 없음)
      if (rating !== null && rating <= 2) main = null;
      else if (rating === 5) main = 'T14';
      else main = 'T15';
    } else if (positive) {
      if (rating === null || rating >= 4) main = 'T14';
    } else if (neg.length) {
      main = minByPrio(neg); // 4단계: 일반 불만은 우선순위가 높은 유형
    }
    // 일반 불만 표현만 걸렸거나 아무것도 없으면 미분류(null)
    const secondary = risk.concat(neg).filter((id) => id !== main).sort((a, b) => prio(a) - prio(b));
    return { main, secondary, abusive: ab.abusive, vulgar: ab.vulgar };
  };
}
