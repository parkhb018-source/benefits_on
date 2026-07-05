/**
 * transform.js — 원시 API 응답 → 혜택on import 스키마
 * ─────────────────────────────────────────────────────────
 * 출력 스키마(혜택on 관리자 "일괄 가져오기" 입력 계약):
 *   { title, category, summary, sourceUrl, deadline, tags }
 *   (title만 필수, 나머지는 선택)
 *
 * 참고: 관리자는 선택 필드 `diagnosis`(자가진단 자동등록)도 소비하지만, gov24 응답만으로는
 * 연령·가구 정보를 신뢰성 있게 뽑기 어려워 이 탐색기는 diagnosis를 생성하지 않는다.
 * → 자가진단 자동등록은 손으로 작성/편집한 import 파일에서만 동작한다.
 */

'use strict';

const { categorize } = require('./categorize');

const GOV24_SEARCH = 'https://www.gov.kr/portal/rcvfvrSvc/main';

/** 긴 텍스트를 한 줄 요약으로 자른다. */
function summarize(text, max = 120) {
  if (!text) return '';
  const one = String(text).replace(/\s+/g, ' ').trim();
  return one.length > max ? one.slice(0, max) + '…' : one;
}

/** 자유 텍스트에서 YYYY-MM-DD 마감일 추출. 못 찾으면 null(상시). */
function parseDeadline(text) {
  if (!text) return null;
  const m = String(text).match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * @param {object[]} raw  fetch.js 결과
 * @param {object} fieldMap  config.fieldMap (API 필드명 → 의미)
 * @returns {object[]} 혜택on import 항목 배열
 */
function transform(raw, fieldMap) {
  const f = fieldMap;
  return raw
    .map((item) => {
      const title = (item[f.title] || '').trim();
      if (!title) return null; // 제목 없으면 버림

      const categoryRaw = item[f.category] || '';
      const org = item[f.org] || '';
      const target = item[f.target] || '';
      const summary = summarize(item[f.summary] || item[f.summaryFallback]);
      const sourceUrl = (item[f.sourceUrl] || '').trim() || GOV24_SEARCH;
      const deadline = parseDeadline(item[f.deadline]);

      const tags = [org, categoryRaw]
        .filter(Boolean)
        .flatMap((t) => String(t).split(/[\/,·]/))
        .map((t) => t.trim())
        .filter(Boolean);

      return {
        title,
        category: categorize(title, categoryRaw, target),
        summary,
        sourceUrl,
        deadline,
        tags: [...new Set(tags)],
      };
    })
    .filter(Boolean);
}

module.exports = { transform };
