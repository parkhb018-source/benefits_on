// 카카오 애드핏 배너 — .adfit-slot 안에 화면 폭에 맞는 광고단위 하나만 삽입한다.
// 애드핏은 반응형 광고단위가 없어 PC/모바일 두 사이즈를 둘 다 넣고 CSS로 숨기면
// 숨긴 쪽도 로드되어 노출로 집계될 수 있다 — 그래서 JS로 화면 폭을 먼저 판정하고 하나만 넣는다.
// 리사이즈 시 다시 판정하지 않는다(최초 1회) — 렌더된 애드핏 광고를 교체하면 중복 노출이 된다.
(function () {
  var AD_MOBILE = { unit: 'DAN-ntJWItYnhuyVV5W8', width: '320', height: '100' };
  var AD_DESKTOP = { unit: 'DAN-Ueb2jcohlfuYZmNY', width: '728', height: '90' };
  var BA_SRC = '//t1.kakaocdn.net/kas/static/ba.min.js';

  function pickAd() {
    var isDesktop = window.matchMedia && window.matchMedia('(min-width: 768px)').matches;
    return isDesktop ? AD_DESKTOP : AD_MOBILE;
  }

  function loadBaScript() {
    if (document.querySelector('script[src*="ba.min.js"]')) return; // 이미 로드돼 있으면 다시 넣지 않는다
    var s = document.createElement('script');
    s.type = 'text/javascript';
    s.src = BA_SRC;
    s.async = true;
    document.body.appendChild(s);
  }

  function insertAds() {
    var slots = document.querySelectorAll('.adfit-slot');
    if (!slots.length) return;
    var ad = pickAd();
    slots.forEach(function (slot) {
      if (slot.querySelector('.kakao_ad_area')) return; // 이미 삽입됐으면 건너뜀(중복 노출 방지)
      var ins = document.createElement('ins');
      ins.className = 'kakao_ad_area';
      ins.style.display = 'none';
      ins.setAttribute('data-ad-unit', ad.unit);
      ins.setAttribute('data-ad-width', ad.width);
      ins.setAttribute('data-ad-height', ad.height);
      slot.appendChild(ins);
    });
    loadBaScript();
  }

  insertAds();
}());
