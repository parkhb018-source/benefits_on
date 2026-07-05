/**
 * filter.js — 최신성 필터
 * ─────────────────────────────────────────────────────────
 * transform.js 결과를 받아 "현재 유효하지 않은" 정책을 제거한다.
 * 두 신호를 각각 스위치로 켠다(config.filter):
 *   1) dropPastDeadline  — 신청기한(deadline)이 실행일보다 과거면 제외.
 *   2) dropOldYearInTitle — 제목에 언급된 연도가 전부 올해보다 과거면 제외.
 *
 * 공통 원칙(보수적): 신호가 없으면(마감 null·연도 미언급) 유지.
 * 명시적으로 "지났다"고 판단되는 것만 버린다.
 */

'use strict';

/**
 * 제목에서 '연도'로 보이는 토큰만 추출한다. 금액(2000만원)·수량 등 오탐 방지:
 *   - 앞뒤가 숫자면 제외(더 긴 숫자의 일부)
 *   - 뒤에 금액·수량 단위(만·억·원·명·개·회·세·호·차·위)가 붙으면 연도가 아님 → 제외
 *   - '년' 접미사, 공백, 괄호 등에 둘러싸인 20xx만 연도로 인정
 * @param {string} title
 * @returns {number[]} 연도 배열(없으면 빈 배열)
 */
function extractTitleYears(title) {
  if (!title) return [];
  const re = /(?<!\d)(20\d{2})(?!\d)(?![만억원명개회세호차위])/g;
  const years = [];
  let m;
  while ((m = re.exec(title)) !== null) years.push(Number(m[1]));
  return years;
}

/**
 * @param {object[]} items       transform 결과
 * @param {object} [filterConfig] config.filter (없으면 무동작)
 * @param {string} todayISO       'YYYY-MM-DD' 실행일
 * @returns {object[]} 필터를 통과한 항목 배열
 */
function filterCurrent(items, filterConfig, todayISO) {
  const cfg = filterConfig || {};
  const currentYear = Number(todayISO.slice(0, 4));
  return items.filter((it) => {
    if (cfg.dropPastDeadline && it.deadline && it.deadline < todayISO) return false;
    if (cfg.dropOldYearInTitle) {
      const years = extractTitleYears(it.title);
      if (years.length && Math.max(...years) < currentYear) return false;
    }
    return true;
  });
}

module.exports = { filterCurrent, extractTitleYears };
