/**
 * categorize.js — 정부 분류/키워드 → 혜택on 6분류 매핑
 * ─────────────────────────────────────────────────────────
 * 제목·서비스분야·지원대상 텍스트를 합쳐 키워드로 분류한다.
 * 못 맞추면 '미분류' → 혜택on 일괄 가져오기 미리보기에서 사람이 보정.
 *
 * 규칙 순서가 우선순위다(위에서부터 먼저 매칭). 더 구체적인 분류를 위에 둔다.
 */

'use strict';

const UNCLASSIFIED = '미분류'; // 혜택on 6분류에 안 맞는 항목 표식(사람 검토/필터 대상)

// gov24 '서비스분야' 값 → 혜택on 분류 직접 매핑 (키워드로 못 잡는 것 보강).
// 여기에 없는 분야(농림축산어업·행정·안전·보건·의료·문화·환경 등)는 혜택on 대상층과
// 무관하므로 의도적으로 매핑하지 않는다 → '미분류'로 남아 필터에서 제외됨.
const DOMAIN_MAP = {
  '보육·교육': '신혼·육아',
  '임신·출산': '신혼·육아',
  '입양·위탁': '신혼·육아',
  '고용·창업': '근로/소득',
  '주거·자립': '1인가구',
  '생활안정': '1인가구',
};

const RULES = [
  { cat: '세금/환급',    kw: ['세금', '환급', '공제', '세액', '연말정산', '소득세', '부가세'] },
  { cat: '신혼·육아',    kw: ['임신', '출산', '난임', '산모', '신혼', '육아', '보육', '어린이집', '아동', '유아', '양육', '입양', '다자녀'] },
  { cat: '청년정책',     kw: ['청년', '대학생', '학자금', '취업준비', '구직활동', '청소년'] },
  { cat: '중장년·노년',  kw: ['노인', '어르신', '노년', '장년', '중장년', '연금', '은퇴', '치매', '고령'] },
  { cat: '근로/소득',    kw: ['고용', '일자리', '창업', '근로', '실업', '직업훈련', '자영업', '소상공인', '실직', '재취업'] },
  { cat: '1인가구',      kw: ['주거', '전세', '월세', '임대', '주택', '에너지', '난방', '생활지원', '1인'] },
];

/**
 * @param {string} title      정책 제목
 * @param {string} categoryRaw 정부 서비스분야 (DOMAIN_MAP 매핑 대상)
 * @param {string} [target]   지원대상 (키워드 신호 보강용)
 * @returns {string} 혜택on 카테고리 또는 UNCLASSIFIED
 */
function categorize(title, categoryRaw, target) {
  const hay = [title, categoryRaw, target].filter(Boolean).join(' ');
  // 1) 키워드(제목·대상 등 강한 신호) 우선
  for (const r of RULES) {
    if (r.kw.some((k) => hay.includes(k))) return r.cat;
  }
  // 2) 서비스분야 도메인 매핑
  if (categoryRaw && DOMAIN_MAP[categoryRaw]) return DOMAIN_MAP[categoryRaw];
  return UNCLASSIFIED;
}

module.exports = { categorize };
