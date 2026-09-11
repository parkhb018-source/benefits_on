// 일반화된 판정 엔진 — "개인"도 "사장님"도 모른다.
// 조건 배열({ type, op, value, required })과 프로필(도메인 무관 key-value)만 비교한다.
// type 이름은 하드코딩하지 않는다 — profile[condition.type]로 값을 찾아 op에 따라 비교할 뿐이다.
//
// profile에 그 키가 아예 없으면(=질문하지 않은 항목) "불일치"가 아니라 "판정에서 제외"다.
// 즉 안 물어본 조건은 green을 막지 않는다 — 물어본 것(키가 있는 것)만 일치/불일치로 본다.

/**
 * @typedef {Object} Condition
 * @property {string} type      profile의 키 이름과 동일
 * @property {'eq'|'in'|'between'|'lte'|'gte'|'exists'} op
 * @property {*} value
 * @property {boolean} [required]
 */

/**
 * @typedef {Object} Period
 * @property {string} [raw]
 * @property {string|null} [start]  YYYY-MM-DD
 * @property {string|null} [end]    YYYY-MM-DD
 * @property {boolean} [always]
 */

/**
 * 조건 하나를 프로필과 비교한다. type이 무엇을 뜻하는지는 모른다 — profile[type] 값을 꺼내 op로 비교할 뿐.
 * @param {string} op
 * @param {*} profileValue
 * @param {*} condValue
 * @returns {boolean}
 */
function evalOp(op, profileValue, condValue) {
  switch (op) {
    case 'eq':
      return profileValue !== undefined && profileValue === condValue;
    case 'in': {
      if (profileValue === undefined || profileValue === null) return false;
      const candidates = Array.isArray(condValue) ? condValue : [condValue];
      if (Array.isArray(profileValue)) return profileValue.some((v) => candidates.includes(v));
      return candidates.includes(profileValue);
    }
    case 'between': {
      if (profileValue === undefined || profileValue === null) return false;
      const [min, max] = condValue;
      return profileValue >= min && profileValue <= max;
    }
    case 'lte':
      return profileValue !== undefined && profileValue !== null && profileValue <= condValue;
    case 'gte':
      return profileValue !== undefined && profileValue !== null && profileValue >= condValue;
    case 'exists':
      return profileValue !== undefined && profileValue !== null;
    default:
      // 모르는 op — 판정 불가로 취급(불일치)
      return false;
  }
}

/**
 * 조건 하나를 프로필과 비교해 상태를 매긴다.
 * profile에 그 키가 없으면(질문하지 않음) 'skip' — 일치도 불일치도 아니다.
 * @returns {'ok'|'fail'|'skip'}
 */
function evalCondition(cond, profile) {
  const has = !!profile && Object.prototype.hasOwnProperty.call(profile, cond.type) &&
    profile[cond.type] !== undefined && profile[cond.type] !== null;
  if (!has) return 'skip';
  return evalOp(cond.op, profile[cond.type], cond.value) ? 'ok' : 'fail';
}

/**
 * 프로필이 조건 배열·신청기간에 부합하는지 판정한다.
 * @param {Object} profile        도메인 무관 key-value ({age:67, household:'1인가구', ...} 등)
 * @param {Condition[]} conditions
 * @param {Period} [period]
 * @param {{ maxLevel?: 'yellow', today?: string }} [opts]
 * @returns {{ level: 'green'|'yellow'|'blue', score: number, failed: string[] } | null}
 */
export function match(profile, conditions, period, opts) {
  opts = opts || {};
  const list = conditions || [];
  const results = list.map((cond) => ({ cond, status: evalCondition(cond, profile) }));

  // 1) required 조건 불일치(질문했는데 안 맞음) → 제외. 안 물어본 required는 skip이라 여기 안 걸린다.
  for (const r of results) {
    if (r.cond.required && r.status === 'fail') return null;
  }

  const today = opts.today || new Date().toISOString().slice(0, 10);

  // 2) 신청기간 종료 → 제외
  if (period && period.end && period.end < today) return null;

  let level;
  if (period && period.start && period.start > today) {
    // 3) 신청기간 미도래 → 향후 가능
    level = 'blue';
  } else {
    // 4) always:true 포함 — 물어본(skip이 아닌) optional 조건이 전부 일치하면 green, 하나라도 불일치면 yellow.
    //    안 물어본 조건(skip)은 애초에 비교 대상이 아니므로 green을 막지 않는다.
    const askedOptional = results.filter((r) => !r.cond.required && r.status !== 'skip');
    const allAskedOptionalOk = askedOptional.every((r) => r.status === 'ok');
    level = allAskedOptionalOk ? 'green' : 'yellow';
  }

  if (opts.maxLevel === 'yellow' && level === 'green') level = 'yellow';

  const score = results.filter((r) => r.status === 'ok').length;
  const failed = results.filter((r) => r.status === 'fail').map((r) => r.cond.type);

  return { level, score, failed };
}

// 브라우저에서는 빌드 없이 <script type="module">로 로드하고 window에 노출한다.
// (main.js는 일반 스크립트라 import를 쓸 수 없어, 호출 시점에 window.HtkonMatchingEngine을 읽는다.)
if (typeof window !== 'undefined') {
  window.HtkonMatchingEngine = { match };
}
