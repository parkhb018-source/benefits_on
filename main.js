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

  if (!selAge || !diagBtn) return;

  const allSelects = [selAge, selHousehold, selEmploy];

  // 기본값 (matching-rules.json 로드 전 fallback 또는 로드 실패 시 사용)
  const defaultBenefitsMap = {
    '10대':     { default: ['청소년 교육지원금', '방과후 지원 프로그램', '국민내일배움카드'] },
    '20대':     {
      '1인가구':       { '취업준비중': ['청년월세 특별지원', '청년미래적금', '청년취업지원금'], '직장인': ['청년도약계좌', '청년 소득공제', '근로장려금'], default: ['청년월세 특별지원', '청년미래적금', '청년도약계좌'] },
      '부모님과 동거': { '취업준비중': ['청년구직활동지원금', '국민내일배움카드', '청년도약계좌'], default: ['청년도약계좌', '청년미래적금', '주거급여'] },
      default:         ['청년월세 특별지원', '청년도약계좌', '근로장려금']
    },
    '30대':     { default: ['근로장려금', '주거급여', '실업급여'] },
    '40대':     { default: ['근로장려금', '연말정산 환급', '자녀 교육비 공제'] },
    '50대':     { default: ['국민연금 수령 조회', '퇴직금 계산기', '실업급여'] },
    '60대 이상':{ default: ['기초연금', '노인일자리사업', '에너지바우처'] }
  };

  const defaultBenefitDetails = {
    '청년월세 특별지원':    { icon: '🏠', desc: '월 최대 20만원, 최장 24개월 지원 (생애 1회)',        url: 'pages/article-youth-rent.html' },
    '청년미래적금':         { icon: '💰', desc: '월 50만원 납입 시 정부 매칭 최대 36만원',            url: 'pages/article-youth-savings.html' },
    '청년도약계좌':         { icon: '📈', desc: '월 40~70만원 납입, 5년 후 최대 5,000만원',           url: 'pages/article-youth-dream-account.html' },
    '청년취업지원금':       { icon: '🎯', desc: '취업 준비 청년 월 50만원, 최대 6개월',               url: 'pages/article-youth-job-support.html' },
    '청년구직활동지원금':   { icon: '🔍', desc: '구직활동 지원금 월 50만원, 최대 6개월',              url: 'pages/article-youth-job-support.html' },
    '청년 소득공제':        { icon: '💳', desc: '중소기업 취업 청년 소득세 90% 감면',                 url: 'pages/article-youth-sme-tax.html' },
    '국민내일배움카드':     { icon: '🎓', desc: '직업훈련 비용 최대 500만원 지원',                    url: 'pages/article-tomorrow-learning.html' },
    '근로장려금':           { icon: '💵', desc: '맞벌이 기준 연간 최대 330만원',                      url: 'pages/article-eitc.html' },
    '주거급여':             { icon: '🏘️', desc: '임차료 또는 자가수선 비용 지원',                    url: 'pages/article-housing-benefit.html' },
    '실업급여':             { icon: '📋', desc: '퇴직 전 평균임금의 60%, 최대 270일',                 url: 'pages/article-unemployment-guide.html' },
    '연말정산 환급':        { icon: '🧾', desc: '공제 항목별 환급액 미리 계산해보세요',               url: 'pages/calc-tax-refund.html' },
    '자녀 교육비 공제':     { icon: '📚', desc: '1인당 연 300만원 한도 교육비 세액공제',              url: 'pages/article-child-edu.html' },
    '국민연금 수령 조회':   { icon: '📊', desc: '예상 수령액을 미리 확인하세요',                      url: 'pages/article-national-pension.html' },
    '퇴직금 계산기':        { icon: '💼', desc: '근속연수·평균임금으로 퇴직금 계산',                  url: 'pages/article-severance.html' },
    '기초연금':             { icon: '👴', desc: '소득 하위 70% 어르신, 월 최대 349,700원 (2026년)',   url: 'pages/article-basic-pension.html' },
    '노인일자리사업':       { icon: '🌟', desc: '월 최대 76만원, 다양한 사회활동 참여',               url: 'pages/article-senior-jobs.html' },
    '에너지바우처':         { icon: '⚡', desc: '취약계층 에너지 비용, 4인 이상 최대 70만원',         url: 'pages/article-energy-voucher.html' },
    '청소년 교육지원금':    { icon: '🎒', desc: '교육활동비 지원, 학교별 상이',                       url: 'pages/article-teen-edu.html' },
    '방과후 지원 프로그램': { icon: '🏫', desc: '방과후 학교 자유수강권 지원',                        url: 'pages/article-after-school.html' }
  };

  function getBenefits(age, household, employ) {
    // matching-rules.json이 로드되었으면 우선 사용 (관리자에서 편집 가능)
    const map = (window.MATCHING_RULES && window.MATCHING_RULES.benefitsMap) || defaultBenefitsMap;
    const ageMap = map[age] || {};
    const hhMap  = ageMap[household] || ageMap.default;
    if (!hhMap) return ['근로장려금', '에너지바우처', '실업급여'];
    if (Array.isArray(hhMap)) return hhMap.slice(0, 3);
    return (hhMap[employ] || hhMap.default || ['근로장려금', '에너지바우처', '실업급여']).slice(0, 3);
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

  function showResult() {
    const benefits = getBenefits(selAge.value, selHousehold.value, selEmploy.value);
    const details = (window.MATCHING_RULES && window.MATCHING_RULES.benefitDetails) || defaultBenefitDetails;
    diagResult.innerHTML =
      '<div class="diag-result-inner">' +
      benefits.map(name => {
        const d = details[name] || { icon: '✨', desc: '혜택 상세 내용을 확인하세요', url: '#' };
        return `<div class="result-item">
          <div class="result-icon">${d.icon}</div>
          <div class="result-content">
            <div class="result-title">${name}</div>
            <div class="result-desc">${d.desc}</div>
            <a href="${d.url || '#'}" class="result-link">자세히 보기 →</a>
          </div>
        </div>`;
      }).join('') +
      '<p class="result-note">* 상세 금액은 개인 상황에 따라 다를 수 있습니다.</p>' +
      '</div>';
    diagResult.classList.add('show');
  }

  function resetDiag() {
    allSelects.forEach(s => { s.selectedIndex = 0; });
    diagResult.innerHTML = '';
    diagResult.classList.remove('show');
    updateUI();
  }

  allSelects.forEach(s => s.addEventListener('change', updateUI));
  diagBtn.addEventListener('click', showResult);
  if (diagReset) diagReset.addEventListener('click', resetDiag);
}());
