// Header scroll effect
const header = document.querySelector('.site-header');
if (header) {
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 8);
  }, { passive: true });
}

// Hamburger menu
const hamburger = document.querySelector('.hamburger');
const mobileMenu = document.querySelector('.mobile-menu');

if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    const isOpen = mobileMenu.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-label', isOpen ? '메뉴 닫기' : '메뉴 열기');
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      hamburger.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}

// Seasonal banner close
const bannerClose = document.querySelector('.banner-close');
const banner = document.querySelector('.seasonal-banner');
if (bannerClose && banner) {
  bannerClose.addEventListener('click', () => {
    banner.style.display = 'none';
  });
}

// Self-diagnosis tool
(function () {
  const selAge       = document.getElementById('sel-age');
  const selHousehold = document.getElementById('sel-household');
  const selEmploy    = document.getElementById('sel-employ');
  const diagBtn      = document.getElementById('diagBtn');
  const diagResult   = document.getElementById('diagResult');
  const diagCounter  = document.getElementById('diagCounter');
  const diagReset    = document.getElementById('diagReset');

  // ===== GA4 맞춤 이벤트 (assets/js/analytics.js) =====
  // gtag·analytics.js 미로딩(광고차단 등) 환경에서도 자가진단이 정상 동작해야 하므로 항상 try/catch로 감싼다.
  const TOOL_ID = 'policy-self-check';
  function safeTrack(fn) {
    try { fn(); } catch (e) { /* 조용히 무시 */ }
  }

  if (!selAge || !diagBtn) return;

  const allSelects = [selAge, selHousehold, selEmploy];

  // 기본값 (matching-rules.json 로드 전 fallback 또는 로드 실패 시 사용)
  const defaultBenefitsMap ={
    "10대": {
      "default": [
        "청소년 교육지원금",
        "방과후 지원 프로그램",
        "국민내일배움카드"
      ]
    },
    "20대": {
      "1인가구": {
        "직장인": [
          "청년도약계좌",
          "청년 소득공제",
          "청년월세 특별지원"
        ],
        "취업준비중": [
          "청년구직활동지원금",
          "국민내일배움카드",
          "청년월세 특별지원"
        ],
        "자영업자": [
          "청년도약계좌",
          "근로장려금",
          "청년월세 특별지원"
        ],
        "무직·기타": [
          "청년월세 특별지원",
          "주거급여",
          "국민내일배움카드"
        ],
        "default": [
          "청년월세 특별지원",
          "청년도약계좌",
          "청년미래적금"
        ]
      },
      "부모님과 동거": {
        "직장인": [
          "청년도약계좌",
          "청년 소득공제",
          "청년미래적금"
        ],
        "취업준비중": [
          "청년구직활동지원금",
          "국민내일배움카드",
          "청년취업지원금"
        ],
        "자영업자": [
          "청년도약계좌",
          "근로장려금",
          "청년미래적금"
        ],
        "무직·기타": [
          "청년구직활동지원금",
          "국민내일배움카드",
          "청년미래적금"
        ],
        "default": [
          "청년도약계좌",
          "청년미래적금",
          "청년 소득공제"
        ]
      },
      "배우자와 동거": {
        "직장인": [
          "청년도약계좌",
          "청년 소득공제",
          "청년월세 특별지원"
        ],
        "취업준비중": [
          "청년구직활동지원금",
          "국민내일배움카드",
          "주거급여"
        ],
        "자영업자": [
          "청년도약계좌",
          "근로장려금",
          "주거급여"
        ],
        "무직·기타": [
          "주거급여",
          "청년월세 특별지원",
          "국민내일배움카드"
        ],
        "default": [
          "청년월세 특별지원",
          "청년도약계좌",
          "주거급여"
        ]
      },
      "자녀 있는 가구": {
        "직장인": [
          "자녀 교육비 공제",
          "청년도약계좌",
          "청년 소득공제"
        ],
        "취업준비중": [
          "청년구직활동지원금",
          "자녀 교육비 공제",
          "국민내일배움카드"
        ],
        "자영업자": [
          "자녀 교육비 공제",
          "근로장려금",
          "청년도약계좌"
        ],
        "무직·기타": [
          "주거급여",
          "자녀 교육비 공제",
          "국민내일배움카드"
        ],
        "default": [
          "자녀 교육비 공제",
          "청년도약계좌",
          "주거급여"
        ]
      },
      "default": [
        "청년월세 특별지원",
        "청년도약계좌",
        "청년 소득공제"
      ]
    },
    "30대": {
      "1인가구": {
        "직장인": [
          "연말정산 환급",
          "근로장려금",
          "주거급여"
        ],
        "취업준비중": [
          "실업급여",
          "국민내일배움카드",
          "주거급여"
        ],
        "자영업자": [
          "근로장려금",
          "국민내일배움카드",
          "주거급여"
        ],
        "무직·기타": [
          "실업급여",
          "주거급여",
          "국민내일배움카드"
        ],
        "default": [
          "근로장려금",
          "주거급여",
          "연말정산 환급"
        ]
      },
      "부모님과 동거": {
        "직장인": [
          "연말정산 환급",
          "근로장려금",
          "국민내일배움카드"
        ],
        "취업준비중": [
          "실업급여",
          "국민내일배움카드",
          "근로장려금"
        ],
        "자영업자": [
          "근로장려금",
          "국민내일배움카드",
          "연말정산 환급"
        ],
        "무직·기타": [
          "실업급여",
          "국민내일배움카드",
          "근로장려금"
        ],
        "default": [
          "근로장려금",
          "연말정산 환급",
          "국민내일배움카드"
        ]
      },
      "배우자와 동거": {
        "직장인": [
          "연말정산 환급",
          "근로장려금",
          "주거급여"
        ],
        "취업준비중": [
          "실업급여",
          "주거급여",
          "국민내일배움카드"
        ],
        "자영업자": [
          "근로장려금",
          "주거급여",
          "국민내일배움카드"
        ],
        "무직·기타": [
          "실업급여",
          "주거급여",
          "근로장려금"
        ],
        "default": [
          "연말정산 환급",
          "근로장려금",
          "주거급여"
        ]
      },
      "자녀 있는 가구": {
        "직장인": [
          "자녀 교육비 공제",
          "연말정산 환급",
          "근로장려금"
        ],
        "취업준비중": [
          "실업급여",
          "자녀 교육비 공제",
          "주거급여"
        ],
        "자영업자": [
          "자녀 교육비 공제",
          "근로장려금",
          "국민내일배움카드"
        ],
        "무직·기타": [
          "주거급여",
          "자녀 교육비 공제",
          "실업급여"
        ],
        "default": [
          "자녀 교육비 공제",
          "연말정산 환급",
          "근로장려금"
        ]
      },
      "default": [
        "근로장려금",
        "주거급여",
        "연말정산 환급"
      ]
    },
    "40대": {
      "1인가구": {
        "직장인": [
          "연말정산 환급",
          "근로장려금",
          "국민연금 수령 조회"
        ],
        "취업준비중": [
          "실업급여",
          "국민내일배움카드",
          "주거급여"
        ],
        "자영업자": [
          "근로장려금",
          "국민내일배움카드",
          "국민연금 수령 조회"
        ],
        "무직·기타": [
          "실업급여",
          "주거급여",
          "국민내일배움카드"
        ],
        "default": [
          "연말정산 환급",
          "근로장려금",
          "주거급여"
        ]
      },
      "부모님과 동거": {
        "직장인": [
          "연말정산 환급",
          "근로장려금",
          "국민연금 수령 조회"
        ],
        "취업준비중": [
          "실업급여",
          "국민내일배움카드",
          "근로장려금"
        ],
        "자영업자": [
          "근로장려금",
          "국민내일배움카드",
          "국민연금 수령 조회"
        ],
        "무직·기타": [
          "실업급여",
          "국민내일배움카드",
          "주거급여"
        ],
        "default": [
          "연말정산 환급",
          "근로장려금",
          "국민연금 수령 조회"
        ]
      },
      "배우자와 동거": {
        "직장인": [
          "연말정산 환급",
          "근로장려금",
          "국민연금 수령 조회"
        ],
        "취업준비중": [
          "실업급여",
          "주거급여",
          "국민내일배움카드"
        ],
        "자영업자": [
          "근로장려금",
          "국민연금 수령 조회",
          "국민내일배움카드"
        ],
        "무직·기타": [
          "실업급여",
          "주거급여",
          "근로장려금"
        ],
        "default": [
          "연말정산 환급",
          "근로장려금",
          "주거급여"
        ]
      },
      "자녀 있는 가구": {
        "직장인": [
          "자녀 교육비 공제",
          "연말정산 환급",
          "근로장려금"
        ],
        "취업준비중": [
          "실업급여",
          "자녀 교육비 공제",
          "주거급여"
        ],
        "자영업자": [
          "자녀 교육비 공제",
          "근로장려금",
          "국민내일배움카드"
        ],
        "무직·기타": [
          "주거급여",
          "자녀 교육비 공제",
          "실업급여"
        ],
        "default": [
          "자녀 교육비 공제",
          "연말정산 환급",
          "근로장려금"
        ]
      },
      "default": [
        "근로장려금",
        "연말정산 환급",
        "국민연금 수령 조회"
      ]
    },
    "50대": {
      "1인가구": {
        "직장인": [
          "국민연금 수령 조회",
          "퇴직금 계산기",
          "연말정산 환급"
        ],
        "취업준비중": [
          "실업급여",
          "국민내일배움카드",
          "국민연금 수령 조회"
        ],
        "자영업자": [
          "근로장려금",
          "국민연금 수령 조회",
          "국민내일배움카드"
        ],
        "무직·기타": [
          "실업급여",
          "국민연금 수령 조회",
          "주거급여"
        ],
        "default": [
          "국민연금 수령 조회",
          "퇴직금 계산기",
          "근로장려금"
        ]
      },
      "부모님과 동거": {
        "직장인": [
          "국민연금 수령 조회",
          "퇴직금 계산기",
          "연말정산 환급"
        ],
        "취업준비중": [
          "실업급여",
          "국민내일배움카드",
          "국민연금 수령 조회"
        ],
        "자영업자": [
          "근로장려금",
          "국민연금 수령 조회",
          "국민내일배움카드"
        ],
        "무직·기타": [
          "실업급여",
          "국민연금 수령 조회",
          "주거급여"
        ],
        "default": [
          "국민연금 수령 조회",
          "퇴직금 계산기",
          "근로장려금"
        ]
      },
      "배우자와 동거": {
        "직장인": [
          "국민연금 수령 조회",
          "퇴직금 계산기",
          "연말정산 환급"
        ],
        "취업준비중": [
          "실업급여",
          "국민내일배움카드",
          "국민연금 수령 조회"
        ],
        "자영업자": [
          "근로장려금",
          "국민연금 수령 조회",
          "국민내일배움카드"
        ],
        "무직·기타": [
          "실업급여",
          "국민연금 수령 조회",
          "주거급여"
        ],
        "default": [
          "국민연금 수령 조회",
          "퇴직금 계산기",
          "연말정산 환급"
        ]
      },
      "자녀 있는 가구": {
        "직장인": [
          "자녀 교육비 공제",
          "국민연금 수령 조회",
          "퇴직금 계산기"
        ],
        "취업준비중": [
          "실업급여",
          "자녀 교육비 공제",
          "국민연금 수령 조회"
        ],
        "자영업자": [
          "자녀 교육비 공제",
          "근로장려금",
          "국민연금 수령 조회"
        ],
        "무직·기타": [
          "실업급여",
          "자녀 교육비 공제",
          "주거급여"
        ],
        "default": [
          "자녀 교육비 공제",
          "국민연금 수령 조회",
          "퇴직금 계산기"
        ]
      },
      "default": [
        "국민연금 수령 조회",
        "퇴직금 계산기",
        "실업급여"
      ]
    },
    "60대 이상": {
      "1인가구": {
        "직장인": [
          "노인일자리사업",
          "기초연금",
          "국민연금 수령 조회"
        ],
        "취업준비중": [
          "노인일자리사업",
          "기초연금",
          "국민내일배움카드"
        ],
        "자영업자": [
          "기초연금",
          "노인일자리사업",
          "근로장려금"
        ],
        "무직·기타": [
          "기초연금",
          "노인일자리사업",
          "에너지바우처"
        ],
        "default": [
          "기초연금",
          "노인일자리사업",
          "에너지바우처"
        ]
      },
      "부모님과 동거": {
        "직장인": [
          "노인일자리사업",
          "기초연금",
          "국민연금 수령 조회"
        ],
        "취업준비중": [
          "노인일자리사업",
          "기초연금",
          "국민내일배움카드"
        ],
        "자영업자": [
          "기초연금",
          "노인일자리사업",
          "근로장려금"
        ],
        "무직·기타": [
          "기초연금",
          "노인일자리사업",
          "에너지바우처"
        ],
        "default": [
          "기초연금",
          "국민연금 수령 조회",
          "노인일자리사업"
        ]
      },
      "배우자와 동거": {
        "직장인": [
          "노인일자리사업",
          "기초연금",
          "국민연금 수령 조회"
        ],
        "취업준비중": [
          "노인일자리사업",
          "기초연금",
          "국민내일배움카드"
        ],
        "자영업자": [
          "기초연금",
          "노인일자리사업",
          "근로장려금"
        ],
        "무직·기타": [
          "기초연금",
          "노인일자리사업",
          "에너지바우처"
        ],
        "default": [
          "기초연금",
          "국민연금 수령 조회",
          "노인일자리사업"
        ]
      },
      "자녀 있는 가구": {
        "직장인": [
          "노인일자리사업",
          "기초연금",
          "국민연금 수령 조회"
        ],
        "취업준비중": [
          "노인일자리사업",
          "기초연금",
          "국민내일배움카드"
        ],
        "자영업자": [
          "기초연금",
          "노인일자리사업",
          "근로장려금"
        ],
        "무직·기타": [
          "기초연금",
          "노인일자리사업",
          "에너지바우처"
        ],
        "default": [
          "기초연금",
          "노인일자리사업",
          "에너지바우처"
        ]
      },
      "default": [
        "기초연금",
        "노인일자리사업",
        "에너지바우처"
      ]
    }
  };

  const defaultBenefitDetails = {
    '청년월세 특별지원':    { icon: '🏠', desc: '월 최대 20만원, 최장 24개월 지원 (생애 1회)',        url: 'pages/article-youth-rent' },
    '청년미래적금':         { icon: '💰', desc: '월 50만원 납입 시 정부 매칭 최대 36만원',            url: 'pages/article-youth-savings' },
    '청년도약계좌':         { icon: '📈', desc: '월 40~70만원 납입, 5년 후 최대 5,000만원',           url: 'pages/article-youth-dream-account' },
    '청년취업지원금':       { icon: '🎯', desc: '취업 준비 청년 월 50만원, 최대 6개월',               url: 'pages/article-youth-job-support' },
    '청년구직활동지원금':   { icon: '🔍', desc: '구직활동 지원금 월 50만원, 최대 6개월',              url: 'pages/article-youth-job-support' },
    '청년 소득공제':        { icon: '💳', desc: '중소기업 취업 청년 소득세 90% 감면',                 url: 'pages/article-youth-sme-tax' },
    '국민내일배움카드':     { icon: '🎓', desc: '직업훈련 비용 최대 500만원 지원',                    url: 'pages/article-tomorrow-learning' },
    '근로장려금':           { icon: '💵', desc: '맞벌이 기준 연간 최대 330만원',                      url: 'pages/article-eitc' },
    '주거급여':             { icon: '🏘️', desc: '임차료 또는 자가수선 비용 지원',                    url: 'pages/article-housing-benefit' },
    '실업급여':             { icon: '📋', desc: '퇴직 전 평균임금의 60%, 최대 270일',                 url: 'pages/article-unemployment-guide' },
    '연말정산 환급':        { icon: '🧾', desc: '공제 항목별 환급액 미리 계산해보세요',               url: 'pages/calc-tax-refund' },
    '자녀 교육비 공제':     { icon: '📚', desc: '1인당 연 300만원 한도 교육비 세액공제',              url: 'pages/article-child-edu' },
    '국민연금 수령 조회':   { icon: '📊', desc: '예상 수령액을 미리 확인하세요',                      url: 'pages/article-national-pension' },
    '퇴직금 계산기':        { icon: '💰', desc: '퇴직소득세·지방소득세 뺀 예상 실수령액 계산',        url: 'pages/calc-retirement-pay' },
    '기초연금':             { icon: '👴', desc: '소득 하위 70% 어르신, 월 최대 349,700원 (2026년)',   url: 'pages/article-basic-pension' },
    '노인일자리사업':       { icon: '🌟', desc: '월 최대 76만원, 다양한 사회활동 참여',               url: 'pages/article-senior-jobs' },
    '에너지바우처':         { icon: '⚡', desc: '취약계층 에너지 비용, 4인 이상 최대 70만원',         url: 'pages/article-energy-voucher' },
    '청소년 교육지원금':    { icon: '🎒', desc: '교육활동비 지원, 학교별 상이',                       url: 'pages/article-teen-edu' },
    '방과후 지원 프로그램': { icon: '🏫', desc: '방과후 학교 자유수강권 지원',                        url: 'pages/article-after-school' }
  };

  // 연령대 대표값 — 판정 엔진의 age 조건(between)과 비교할 기준 나이
  const AGE_REPRESENTATIVE = { '10대': 16, '20대': 25, '30대': 35, '40대': 45, '50대': 55, '60대 이상': 67 };

  // matching-rules.json이 로드되었으면 우선 사용 (관리자에서 편집 가능) — 엔진 실패 시 폴백
  function getBenefitsFallback(age, household, employ) {
    const map = (window.MATCHING_RULES && window.MATCHING_RULES.benefitsMap) || defaultBenefitsMap;
    const ageMap = map[age] || {};
    const hhMap  = ageMap[household] || ageMap.default;
    if (!hhMap) return ['근로장려금', '에너지바우처', '실업급여'];
    if (Array.isArray(hhMap)) return hhMap;
    return hhMap[employ] || hhMap.default || ['근로장려금', '에너지바우처', '실업급여'];
  }

  // gov24 조건의 household/employment/incomeLevel 'in' 조건은 상당수가 전체 선택지를 다 나열해
  // 사실상 제한이 없다(household 96건 중 73건, employment 43건 중 34건, incomeLevel 126건 중 88건).
  // 엔진에 이 type들의 전체 선택지 수를 알려줘야 "실질 제한"을 가려낼 수 있다(엔진 자체는 이 숫자를 모른다).
  const TOTAL_OPTIONS = { household: 5, employment: 3, incomeLevel: 5 };

  // required 나이 조건이 "그 나이대 전용"인지 판단하는 기준 — AGE_REPRESENTATIVE의 구간 경계에 맞춘다
  // (50대 대표값 55부터 또는 30대 대표값 35가 속한 구간 끝 39까지). 실질 제한이 하나도 없는 정책이라도
  // 이 나이대 전용이면 green으로 본다(예: 60대 전용 정책은 가구/고용/소득 제한이 없어도 green).
  const NARROW_REQUIRED_TYPES = {
    age: function (value) { return value[0] >= 55 || value[1] <= 39; },
  };

  // 정렬 점수 계산용 — engine/matching-engine.js와 같은 "실질 제한" 판정을 main.js에서 다시 쓴다
  // (엔진은 type별 일치 여부를 밖으로 내보내지 않으므로 정렬은 여기서 조건을 직접 훑는다).
  function isEffectiveConstraintForSort(cond) {
    if (!cond) return false;
    if (cond.op !== 'in') return true;
    const total = TOTAL_OPTIONS[cond.type];
    if (total === undefined) return true;
    const values = Array.isArray(cond.value) ? cond.value : [cond.value];
    return values.length < total;
  }

  function conditionMatchesProfileForSort(cond, profile) {
    if (!cond) return false;
    const profileValue = profile[cond.type];
    if (profileValue === undefined || profileValue === null) return false;
    switch (cond.op) {
      case 'eq': return profileValue === cond.value;
      case 'in': {
        const candidates = Array.isArray(cond.value) ? cond.value : [cond.value];
        return candidates.indexOf(profileValue) !== -1;
      }
      case 'between': return profileValue >= cond.value[0] && profileValue <= cond.value[1];
      case 'lte': return profileValue <= cond.value;
      case 'gte': return profileValue >= cond.value;
      case 'exists': return true;
      default: return false;
    }
  }

  // 자가진단 결과 정렬 점수 — 가구·고용 조건이 "실질 제한"이면서 사용자와 일치할 때 가장 크게 가점한다.
  // 검색으로도 찾을 수 있는(popularity 높은) 정책보다, 자가진단이 아니면 못 찾는 가구·고용 조건부
  // 정책을 위로 올리기 위함. 특정 정책을 상위에 올리려는 튜닝 목적으로 이 가중치를 바꾸지 않는다.
  function computeSortScore(policy, profile, conditions) {
    const householdCond = conditions.find(function (c) { return c.type === 'household'; });
    const employmentCond = conditions.find(function (c) { return c.type === 'employment'; });
    const ageCond = conditions.find(function (c) { return c.type === 'age'; });

    let score = 0;
    if (isEffectiveConstraintForSort(householdCond) && conditionMatchesProfileForSort(householdCond, profile)) {
      score += 25;
    }
    if (isEffectiveConstraintForSort(employmentCond) && conditionMatchesProfileForSort(employmentCond, profile)) {
      score += 8;
    }
    if (ageCond && ageCond.op === 'between' && (ageCond.value[0] >= 55 || ageCond.value[1] <= 39)) {
      score += 10;
    }
    const popularity = typeof policy.popularity === 'number' ? policy.popularity : 0;
    score += Math.log10(1 + popularity * 9) * 20;
    if (policy.detailUrl) score += 8;
    return score;
  }

  // 판정 엔진(engine/matching-engine.js) + data/policies.json + data/benefit-conditions.json으로 매칭
  // → { name, level, failed }[] 를 점수 순으로 반환. 데이터가 준비되지 않았거나 결과가 0건이면 null.
  function getEngineMatches(profile) {
    const engine = window.HtkonMatchingEngine;
    const policies = (window.POLICIES && window.POLICIES.policies) || [];
    const conditionsMap = (window.BENEFIT_CONDITIONS && window.BENEFIT_CONDITIONS.conditions) || {};
    if (!engine || !policies.length || !Object.keys(conditionsMap).length) return null;

    function runPass(useOptional) {
      const matches = [];
      policies.forEach(function (policy) {
        const entry = conditionsMap[policy.id];
        if (!entry) return; // 조건 데이터가 없는 정책은 자가진단 결과에서 제외(있는 걸 지어내지 않음)
        const conditions = useOptional
          ? entry.conditions
          : entry.conditions.filter(function (c) { return c.required; });
        const result = engine.match(profile, conditions, entry.period, {
          totalOptions: TOTAL_OPTIONS,
          narrowRequiredTypes: NARROW_REQUIRED_TYPES,
        });
        if (!result) return;
        matches.push({
          policy: policy,
          result: result,
          conditions: entry.conditions,
          sortScore: computeSortScore(policy, profile, entry.conditions),
        });
      });
      return matches;
    }

    let matches = runPass(true);
    if (matches.length === 0) matches = runPass(false); // 결과 0건 → optional 조건 빼고 재검색
    if (matches.length === 0) return null;

    const LEVEL_RANK = { green: 2, yellow: 1, blue: 0 };
    matches.sort(function (a, b) {
      const levelDiff = LEVEL_RANK[b.result.level] - LEVEL_RANK[a.result.level];
      if (levelDiff) return levelDiff;
      return b.sortScore - a.sortScore;
    });

    return matches.map(function (m) {
      return { name: m.policy.title, level: m.result.level, failed: m.result.failed };
    });
  }

  function getBenefits(age, household, employ) {
    const profile = { age: AGE_REPRESENTATIVE[age], household: household, employment: employ };
    const engineMatches = getEngineMatches(profile);
    if (engineMatches) return engineMatches;
    return getBenefitsFallback(age, household, employ).map(function (name) {
      return { name: name, level: null, failed: [] };
    });
  }

  function updateUI() {
    const count = allSelects.filter(s => s.value).length;
    if (diagCounter) diagCounter.textContent = `${count}/3 선택`;
    if (diagReset)   diagReset.classList.toggle('visible', count > 0);
    const done = count === 3;
    diagBtn.disabled = !done;
    diagBtn.textContent = done
      ? '내가 받을 수 있는 혜택 보기 →'
      : '연령대·가구형태·고용상태를 선택해주세요';
  }

  const DIAG_INITIAL_COUNT = 5;
  const DIAG_MAX_COUNT     = 10;

  const LEVEL_BADGE = {
    green:  { label: '🟢 가능성 높음',   cls: 'result-badge-green' },
    yellow: { label: '🟡 조건 확인 필요', cls: 'result-badge-yellow' },
    blue:   { label: '🔵 향후 가능',     cls: 'result-badge-blue' },
  };

  function levelBadgeHtml(level, failed) {
    const badge = LEVEL_BADGE[level];
    if (!badge) return ''; // 폴백 결과(level: null)는 배지 없이 표시
    const title = (level === 'yellow' && failed && failed.length)
      ? ` title="확인 필요: ${failed.join(', ')}"`
      : '';
    return ` <span class="result-badge ${badge.cls}"${title}>${badge.label}</span>`;
  }

  // data/policies.json 정책 대부분은 자체 상세 페이지가 없어 sourceUrl(gov.kr 등 공식 페이지)이 유일한 링크지만,
  // 자체 아티클이 있는 일부는 detailUrl(pages/*)이 채워져 있다 — 있으면 그걸 내부 링크로 우선 쓴다.
  // title로 한 번만 찾아 캐시해둔다.
  let policyUrlIndex = null;
  function policyUrlByTitle(name) {
    if (!policyUrlIndex) {
      policyUrlIndex = {};
      const policies = (window.POLICIES && window.POLICIES.policies) || [];
      policies.forEach(function (p) { policyUrlIndex[p.title] = p.detailUrl || p.sourceUrl; });
    }
    return policyUrlIndex[name] || null;
  }

  // url이 http(s)로 시작하면 정부 공식 사이트(gov.kr 등) 외부 링크 → 새 탭으로 보내고 "공식 사이트에서 확인"이라 안내한다.
  // 아니면 자체 콘텐츠(pages/*) 내부 링크 → 같은 탭에서 "자세히 보기"로 이동한다.
  function resultItemHtml(item, jsonDetails) {
    const name = item.name;
    // url 우선순위: 관리자 등록(benefitDetails.json) → 사이트 자체 콘텐츠(defaultBenefitDetails) → policies.json의 공식 링크
    const def  = defaultBenefitDetails[name]; // 없으면 undefined(아래에서 policies.json으로 폴백)
    const json = jsonDetails[name] || {};
    const icon = json.icon || (def && def.icon) || '✨';
    const desc = json.desc || (def && def.desc) || '혜택 상세 내용을 확인하세요';
    const url  = json.url || (def && def.url) || policyUrlByTitle(name) || '#';

    const isExternal = /^https?:\/\//.test(url);
    const linkClass = isExternal ? 'result-link is-external' : 'result-link';
    const linkAttrs = isExternal ? ' target="_blank" rel="noopener"' : '';
    const linkText  = isExternal ? '공식 사이트에서 확인 →' : '자세히 보기 →';
    const badge = levelBadgeHtml(item.level, item.failed);

    return `<div class="result-item">
      <div class="result-icon">${icon}</div>
      <div class="result-content">
        <div class="result-title">${name}${badge}</div>
        <div class="result-desc">${desc}</div>
        <a href="${url}" class="${linkClass}"${linkAttrs}>${linkText}</a>
      </div>
    </div>`;
  }

  function isInternalUrl(name, jsonDetails) {
    const def  = defaultBenefitDetails[name];
    const json = jsonDetails[name] || {};
    const url  = json.url || (def && def.url) || policyUrlByTitle(name) || '#';
    return !/^https?:\/\//.test(url);
  }

  // 매칭 결과가 이 건수를 넘으면(주로 나이 조건만 있는 정책이 많이 걸릴 때) "총 N개"라는 문구가
  // 무의미해진다 — 상위 10개만 보여주고 "조건에 맞는 혜택 중 상위 10개"로 표현을 바꾼다.
  const DIAG_OVERFLOW_THRESHOLD = 20;

  // 자영업자·프리랜서는 개인 대상 혜택 데이터(gov24)에 대응값이 없어 자가진단 결과에 반영되지 않는다.
  // 대신 사장님 혜택 모음(무료도구) 페이지로 안내한다.
  const SELF_EMPLOYED_NOTICE =
    '<p class="result-note">🏪 자영업자·프리랜서 대상 혜택은 이 진단에 포함되지 않아요. ' +
    '<a href="pages/resources">사장님 혜택에서 더 많이 찾을 수 있어요 →</a></p>';

  function showResult() {
    const allBenefits = getBenefits(selAge.value, selHousehold.value, selEmploy.value);
    const jsonDetails  = (window.MATCHING_RULES && window.MATCHING_RULES.benefitDetails) || {};
    const isOverflow = allBenefits.length > DIAG_OVERFLOW_THRESHOLD;
    const benefits = allBenefits.slice(0, DIAG_MAX_COUNT);
    const shown = isOverflow ? benefits : benefits.slice(0, DIAG_INITIAL_COUNT);
    const rest  = isOverflow ? [] : benefits.slice(DIAG_INITIAL_COUNT);
    const countText = isOverflow
      ? `조건에 맞는 혜택 중 상위 ${DIAG_MAX_COUNT}개`
      : allBenefits.length > DIAG_MAX_COUNT
        ? `총 ${allBenefits.length}개 중 상위 ${DIAG_MAX_COUNT}개를 보여드려요`
        : `총 ${benefits.length}개의 혜택을 찾았어요`;
    diagResult.innerHTML =
      '<div class="diag-result-inner">' +
      (selEmploy.value === '자영업자' ? SELF_EMPLOYED_NOTICE : '') +
      `<p class="result-count">${countText}</p>` +
      '<div class="result-list">' + shown.map(item => resultItemHtml(item, jsonDetails)).join('') + '</div>' +
      (rest.length ? `<button type="button" class="result-more-btn" id="diagMoreBtn">더보기 (+${rest.length}개)</button>` : '') +
      '<p class="result-note">* 상세 금액은 개인 상황에 따라 다를 수 있습니다. 🟢 표시도 신청 가능을 확정하지 않으니 최종 자격은 공식 사이트에서 확인하세요.</p>' +
      '</div>';
    diagResult.classList.add('show');

    const internalCount = benefits.filter(item => isInternalUrl(item.name, jsonDetails)).length;
    const internalRatio = benefits.length ? internalCount / benefits.length : 0;
    safeTrack(() => window.trackToolOnce && window.trackToolOnce('tool_complete', TOOL_ID, {
      match_count: allBenefits.length,
      internal_ratio: internalRatio,
    }));

    const list    = diagResult.querySelector('.result-list');
    const moreBtn = document.getElementById('diagMoreBtn');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        list.insertAdjacentHTML('beforeend', rest.map(item => resultItemHtml(item, jsonDetails)).join(''));
        moreBtn.remove();
      });
    }
  }

  function resetDiag() {
    allSelects.forEach(s => { s.selectedIndex = 0; });
    diagResult.innerHTML = '';
    diagResult.classList.remove('show');
    updateUI();
  }

  allSelects.forEach((s, i) => s.addEventListener('change', () => {
    safeTrack(() => window.trackTool && window.trackTool('diagnosis_step', TOOL_ID, { step: i + 1, total_steps: allSelects.length }));
    updateUI();
  }));
  diagBtn.addEventListener('click', showResult);
  if (diagReset) diagReset.addEventListener('click', resetDiag);

  // 페이지 로드·뒤로가기(bfcache) 복원 시 셀렉트 값과 버튼 상태 동기화
  window.addEventListener('pageshow', updateUI);
}());

// 사장님 지원사업 자가진단 — 개인 자가진단과 별개 함수, #diagResult 만 공유한다.
// 매칭·정렬은 engine/matching-engine.js · engine/biz-sort.js 를 그대로 쓴다(로직 복제 금지).
(function () {
  const selBizRegion  = document.getElementById('sel-biz-region');
  const selBizType    = document.getElementById('sel-biz-type');
  const selBizField   = document.getElementById('sel-biz-field');
  const bizDiagBtn     = document.getElementById('bizDiagBtn');
  const bizDiagCounter = document.getElementById('bizDiagCounter');
  const bizDiagReset   = document.getElementById('bizDiagReset');
  const diagResult    = document.getElementById('diagResult');
  const diagReset     = document.getElementById('diagReset');

  if (!selBizRegion || !bizDiagBtn || !diagResult) return;

  const bizSelects = [selBizRegion, selBizType, selBizField];

  // 소상공인은 법적으로 중소기업의 부분집합 — 확장하지 않으면 실제 신청 가능한 사업 다수를 놓친다.
  const BUSINESS_TYPE_EXPAND = {
    '소상공인':     ['소상공인', '중소기업'],
    '중소기업':     ['중소기업'],
    '예비·초기창업': ['창업벤처', '중소기업'],
    '사회적기업':   ['사회적기업', '협동조합', '마을기업', '중소기업'],
    '여성기업':     ['여성기업', '중소기업'],
    '장애인기업':   ['장애인기업', '중소기업'],
  };

  const FIELD_MAP = {
    '자금·융자':   ['금융'],
    '판로·마케팅': ['내수', '수출'],
    '인력·고용':   ['인력'],
    '기술·인증':   ['기술'],
    '경영·컨설팅': ['경영'],
    '창업':        ['창업'],
  };

  const BIZ_PAGE_SIZE = 10;

  let bizDataCache = null;
  let bizDataPromise = null;

  function loadBizData() {
    if (bizDataCache) return Promise.resolve(bizDataCache);
    if (bizDataPromise) return bizDataPromise;
    bizDataPromise = fetch('data/biz-benefits.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) { bizDataCache = data; return data; })
      .catch(function (err) { bizDataPromise = null; throw err; });
    return bizDataPromise;
  }

  function updateBizUI() {
    const done = !!(selBizRegion.value && selBizType.value);
    if (bizDiagCounter) {
      const count = [selBizRegion, selBizType].filter(function (s) { return s.value; }).length;
      bizDiagCounter.textContent = count + '/2 선택';
    }
    if (bizDiagReset) {
      const anySelected = bizSelects.some(function (s) { return s.value; });
      bizDiagReset.classList.toggle('visible', anySelected);
    }
    bizDiagBtn.disabled = !done;
    bizDiagBtn.textContent = done
      ? '사장님 지원사업 찾기 →'
      : '사업 지역·지원 대상을 선택해주세요';
  }

  function resetBizDiag() {
    bizSelects.forEach(function (s) { s.selectedIndex = 0; });
    diagResult.innerHTML = '';
    diagResult.classList.remove('show');
    updateBizUI();
  }

  function daysUntilLocal(dateStr, today) {
    return Math.round((Date.parse(dateStr) - Date.parse(today)) / 86400000);
  }

  function bizStatusLabel(period, today) {
    if (!period) return '';
    if (period.start && period.start > today) return '접수예정';
    if (period.end) return 'D-' + daysUntilLocal(period.end, today);
    return period.raw || '';
  }

  function bizCardHtml(item, today) {
    const btCond = item.conditions.find(function (c) { return c.type === 'businessType'; });
    const chip2  = btCond ? btCond.value[0] : '';
    const chip3  = item.fieldMid || item.fields[0] || '';
    const status = bizStatusLabel(item.period, today);
    return '<div class="biz-card">' +
      '<div class="biz-card-title">' + item.title + '</div>' +
      '<div class="biz-chips">' +
        '<span class="biz-chip">' + item.regionLabel + '</span>' +
        '<span class="biz-chip">' + chip2 + '</span>' +
        '<span class="biz-chip">' + chip3 + '</span>' +
      '</div>' +
      '<div class="biz-status">' + status + '</div>' +
      '<p class="biz-summary">' + item.summary + '</p>' +
      '<a href="' + item.applyUrl + '" class="biz-apply-link" target="_blank" rel="nofollow noopener">기업마당에서 신청하기 →</a>' +
    '</div>';
  }

  function computeMatches(profile, data) {
    const today = new Date().toISOString().slice(0, 10);
    const engine = window.HtkonMatchingEngine;
    const sort = window.HtkonBizSort;
    const matched = [];
    (data.items || []).forEach(function (item) {
      const result = engine.match(profile, item.conditions, item.period, {});
      if (!result) return;
      matched.push({ item: item, score: sort.scoreItem(profile, item, today) });
    });
    matched.sort(function (a, b) { return sort.compareByScore(a, b, profile, today); });
    return matched;
  }

  function renderBizResult(matched) {
    const today = new Date().toISOString().slice(0, 10);
    const localCount = matched.filter(function (m) { return m.item.regionCount <= 3; }).length;
    const nationalCount = matched.length - localCount;
    const headText = '총 ' + matched.length + '건 · 내 지역 사업 ' + localCount + '건 · 전국 사업 ' + nationalCount + '건';

    const shown = matched.slice(0, BIZ_PAGE_SIZE);

    diagResult.innerHTML =
      '<div class="diag-result-inner">' +
      '<p class="result-count">' + headText + '</p>' +
      '<div class="result-list biz-result-list">' + shown.map(function (m) { return bizCardHtml(m.item, today); }).join('') + '</div>' +
      (matched.length > BIZ_PAGE_SIZE
        ? '<button type="button" class="result-more-btn" id="bizMoreBtn">더보기 (+' + Math.min(matched.length - BIZ_PAGE_SIZE, BIZ_PAGE_SIZE) + '개)</button>'
        : '') +
      '<p class="result-note">* 신청 자격·기한은 기업마당 공식 페이지에서 다시 확인하세요.</p>' +
      '</div>';
    diagResult.classList.add('show');

    const list = diagResult.querySelector('.biz-result-list');
    let shownCount = shown.length;
    const moreBtn = document.getElementById('bizMoreBtn');
    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        const nextBatch = matched.slice(shownCount, shownCount + BIZ_PAGE_SIZE);
        list.insertAdjacentHTML('beforeend', nextBatch.map(function (m) { return bizCardHtml(m.item, today); }).join(''));
        shownCount += nextBatch.length;
        if (shownCount >= matched.length) {
          moreBtn.remove();
        } else {
          moreBtn.textContent = '더보기 (+' + Math.min(matched.length - shownCount, BIZ_PAGE_SIZE) + '개)';
        }
      });
    }
  }

  function showBizResult() {
    const profile = {
      region: selBizRegion.value,
      businessType: BUSINESS_TYPE_EXPAND[selBizType.value] || [selBizType.value],
      businessTypePicked: selBizType.value,
      fields: FIELD_MAP[selBizField.value] || [],
    };

    bizDiagBtn.disabled = true;
    bizDiagBtn.textContent = '불러오는 중…';

    loadBizData().then(function (data) {
      const matched = computeMatches(profile, data);
      renderBizResult(matched);
    }).catch(function () {
      diagResult.innerHTML = '<div class="diag-result-inner"><p class="result-note">잠시 후 다시 시도해주세요</p></div>';
      diagResult.classList.add('show');
    }).then(function () {
      updateBizUI();
    });
  }

  bizSelects.forEach(function (s) {
    s.addEventListener('change', updateBizUI);
  });
  bizDiagBtn.addEventListener('click', showBizResult);
  if (bizDiagReset) bizDiagReset.addEventListener('click', resetBizDiag);

  // #diagReset 은 개인 카드 소속이지만, 초기화는 두 진단 모두를 비운다(개인 쪽 diagResult 초기화는
  // 기존 personal resetDiag가 처리 — 여기서는 사장님 쪽만 resetBizDiag로 같이 비운다).
  if (diagReset) {
    diagReset.addEventListener('click', resetBizDiag);
  }

  window.addEventListener('pageshow', updateBizUI);
  updateBizUI();
}());

/* ── 카테고리 페이지 정책 카드 페이지네이션 ──
   카드는 SEO를 위해 정적 HTML로 전부 존재하고, 화면에는 9개씩(3×3) 페이지 번호로 나눠 보여준다. */
(function () {
  var PAGE_SIZE = 9;
  var grid = document.getElementById('pl-grid');
  if (!grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.pl-card'));
  var countEl = document.getElementById('pl-count');
  if (countEl) countEl.textContent = '총 ' + cards.length + '건';

  var totalPages = Math.ceil(cards.length / PAGE_SIZE);
  if (totalPages <= 1) return;

  var pager = document.createElement('div');
  pager.id = 'pl-pager';
  pager.className = 'pl-pager';
  grid.parentNode.insertBefore(pager, grid.nextSibling);

  var page = 1;

  function render() {
    cards.forEach(function (card, i) {
      card.style.display = (i >= (page - 1) * PAGE_SIZE && i < page * PAGE_SIZE) ? '' : 'none';
    });
    var html = '<button class="pl-pbtn" data-page="' + (page - 1) + '"' + (page === 1 ? ' disabled' : '') + '>이전</button>';
    for (var i = 1; i <= totalPages; i++) {
      html += '<button class="pl-pbtn' + (i === page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    html += '<button class="pl-pbtn" data-page="' + (page + 1) + '"' + (page === totalPages ? ' disabled' : '') + '>다음</button>';
    pager.innerHTML = html;
  }

  pager.addEventListener('click', function (e) {
    var btn = e.target.closest('.pl-pbtn');
    if (!btn || btn.disabled) return;
    var p = parseInt(btn.dataset.page, 10);
    if (isNaN(p) || p === page) return;
    page = p;
    render();
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  render();
}());
