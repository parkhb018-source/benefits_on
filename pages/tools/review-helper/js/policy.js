// 플랫폼 정책 표시 판단 (PRD §6) — 확인일 경과·신뢰도. 문구는 화면(app.js)이 정한다.

const DAY = 24 * 60 * 60 * 1000;

// 'YYYY-MM-DD' 를 날짜 차이 계산용 UTC 자정으로
const utcDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

// today: Date (테스트에서 고정값을 넣는다)
export function policyFlags(platform, staleAfterDays, today = new Date()) {
  const pol = platform.policy;
  const checking = !platform.inScope || pol.confidence === 'low' || !pol.verifiedDate;
  let stale = false;
  if (pol.verifiedDate) {
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    stale = Math.round((todayUtc - utcDay(pol.verifiedDate)) / DAY) > staleAfterDays;
  }
  return { checking, stale };
}
