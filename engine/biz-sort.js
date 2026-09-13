// 사장님 자가진단 결과 정렬 — scripts/fetch-bizinfo.js 와 main.js(사장님 진단)가 함께 쓰는 단일 소스.
// 점수 규칙은 scripts/fetch-bizinfo.js 에서 그대로 옮겨왔다(값 변경 없음).

// ── 정렬 점수 — 다음 단계(사장님 결과 화면)가 그대로 쓴다 ──────
// engine.match() 는 이제 region·businessType 만 필터로 걸러내고 나머지는 통과시키므로
// (통과 = 항상 yellow), 화면에 뭘 먼저 보여줄지는 이 점수로 정한다. 1순위·2순위 줄세우기가
// 아니라 합산 점수라, 지역이 넓어도(전국사업) 분야가 맞으면 충분히 위로 올라온다.
//
// 지역 점수는 이진값(전국이냐 아니냐)이 아니라 regionCount(시·도 개수)로 준다 — 시·도
// 15개짜리("사실상 전국"이지만 16개 미만이라 안 걸러진 사업)가 진짜 지역 전용(1개)과 같은
// +30 을 받던 문제를 없애기 위함. 실측 분포(1개 1096건, 12~15개 250건, 16개 160건, 나머지
// 2~11개는 18건뿐)에 맞춰 4구간으로 나눴다.
function regionScore(regionCount) {
  if (regionCount === 1) return 40;
  if (regionCount >= 2 && regionCount <= 3) return 25;
  if (regionCount >= 4 && regionCount <= 8) return 12;
  return 0; // 9개 이상 — 사실상 전국
}

function daysUntil(dateStr, today) {
  return Math.round((Date.parse(dateStr) - Date.parse(today)) / 86400000);
}

/**
 * item 정렬 점수. Q3(분야)는 여기서 더하지 않는다 — compareByScore 의 1차 정렬 키로 쓴다
 * (여기서도 더하면 이미 위로 올라온 항목에 또 가산하는 중복이 된다).
 * @param {Object} profile  { region, businessType, businessTypePicked, fields? }
 *   businessType: 자격 필터용 확장 집합(예: ['소상공인','중소기업'])
 *   businessTypePicked: Q2 에서 사장님이 실제로 고른 값 하나(예: '소상공인') — 정확 일치 판정용
 *   fields: Q3 관심 분야(optional) — scoreItem 은 안 쓰고 compareByScore 가 쓴다
 * @param {Object} item     data/biz-benefits.json 의 item
 * @param {string} [today]  YYYY-MM-DD, 생략 시 오늘
 */
function scoreItem(profile, item, today) {
  today = today || new Date().toISOString().slice(0, 10);
  let score = 0;

  score += regionScore(item.regionCount);

  const businessTypeCond = item.conditions.find((c) => c.type === 'businessType');
  const targetExact = businessTypeCond ? businessTypeCond.value[0] : null;
  if (targetExact && profile && targetExact === profile.businessTypePicked) {
    score += 15;
  }

  if (item.period && item.period.end) {
    score += 5;
    const dday = daysUntil(item.period.end, today);
    if (dday >= 0 && dday <= 14) score += 10;
  }

  if ((item.summaryLength || 0) >= 400) score += 5;

  return score;
}

/**
 * item 정렬 비교자. Q3(profile.fields)를 골랐으면 분야 일치 여부를 1차 키로 두고,
 * 그 안에서 점수 내림차순 → 마감일 가까운 순 → 제목순(가나다)으로 정렬한다.
 * Q3 를 안 골랐으면(profile.fields 비어있음) 기존처럼 점수 → 마감 → 제목 순이다.
 * ★ 분야가 안 맞아도 목록에서 빼지 않는다 — 순서만 뒤로 밀린다.
 */
function compareByScore(a, b, profile, today) {
  today = today || new Date().toISOString().slice(0, 10);

  const interestFields = (profile && profile.fields) || [];
  if (interestFields.length > 0) {
    const aMatch = a.item.fields.some((f) => interestFields.includes(f));
    const bMatch = b.item.fields.some((f) => interestFields.includes(f));
    if (aMatch !== bMatch) return aMatch ? -1 : 1;
  }

  if (b.score !== a.score) return b.score - a.score;
  const ea = a.item.period && a.item.period.end;
  const eb = b.item.period && b.item.period.end;
  if (ea && eb && ea !== eb) return ea < eb ? -1 : 1;
  if (ea && !eb) return -1;
  if (!ea && eb) return 1;
  return a.item.title.localeCompare(b.item.title, 'ko');
}

// 브라우저에서는 빌드 없이 <script type="module">로 로드하고 window에 노출한다.
// (main.js는 일반 스크립트라 import를 쓸 수 없어, 호출 시점에 window.HtkonBizSort를 읽는다.)
if (typeof window !== 'undefined') {
  window.HtkonBizSort = { scoreItem, compareByScore };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { scoreItem, compareByScore };
}
