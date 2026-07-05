/**
 * 혜택on 데이터 로더 v2
 * ─────────────────────────────────────────────────────
 * 1) localStorage에 저장된 값 우선 적용 (관리자 페이지에서 저장한 값)
 * 2) 없으면 constants.json / policies.json / matching-rules.json 파일 로드
 * 3) window.POLICY_DATA, window.POLICIES, window.MATCHING_RULES에 노출
 *
 * 관리자 페이지 → 저장 → 모든 페이지 즉시 반영 (새로고침 필요 없음)
 */

(function () {
  const loaderSrc = document.currentScript ? document.currentScript.src.split('?')[0] : '';
  const base      = loaderSrc ? loaderSrc.replace('policy-loader.js', '') : 'data/';

  window.POLICY_DATA    = null;
  window.POLICIES       = null;
  window.MATCHING_RULES = null;

  // localStorage keys
  var LS_CONSTANTS = 'htkon_constants';
  var LS_POLICIES  = 'htkon_policies';
  var LS_RULES     = 'htkon_rules';

  /* ── JSON 파일 또는 localStorage에서 로드 ── */
  function loadSource(lsKey, filename) {
    var raw = localStorage.getItem(lsKey);
    if (raw) {
      try { return Promise.resolve(JSON.parse(raw)); } catch (e) {
        localStorage.removeItem(lsKey); // 손상된 데이터 제거
      }
    }
    return fetch(base + filename)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function (err) {
        console.warn('[혜택on] ' + filename + ' 로드 실패:', err);
        return null;
      });
  }

  /* ── 모든 파일 병렬 로드 ── */
  Promise.all([
    loadSource(LS_CONSTANTS, 'constants.json'),
    loadSource(LS_POLICIES,  'policies.json'),
    loadSource(LS_RULES,     'matching-rules.json'),
  ]).then(function (results) {
    var constants = results[0];
    var policies  = results[1];
    var rules     = results[2];

    window.POLICY_DATA    = constants;
    window.POLICIES       = policies;
    window.MATCHING_RULES = rules;

    if (constants) applyConstants(constants);
    applyPolicies(policies || { policies: [] });
  });

  /* ── 기준값 DOM 반영 ── */
  function applyConstants(data) {
    // [data-policy="path.to.value"] 요소 텍스트 교체
    document.querySelectorAll('[data-policy]').forEach(function (el) {
      var value = getDeep(data, el.dataset.policy);
      if (value !== undefined && value !== null) {
        el.textContent = formatValue(value, el.dataset.policyFormat);
      }
    });

    // [data-policy-default] 입력 기본값
    document.querySelectorAll('[data-policy-default]').forEach(function (el) {
      var value = getDeep(data, el.dataset.policyDefault);
      if (value !== undefined) el.value = value;
    });

    // [data-policy-min] 입력 최솟값
    document.querySelectorAll('[data-policy-min]').forEach(function (el) {
      var value = getDeep(data, el.dataset.policyMin);
      if (value !== undefined) el.min = value;
    });

    // [data-policy-date] 날짜 표시
    document.querySelectorAll('[data-policy-date]').forEach(function (el) {
      el.textContent = data.meta && data.meta.lastUpdated ? data.meta.lastUpdated : '';
    });

    // .policy-data-badge 배지 업데이트
    document.querySelectorAll('.policy-data-badge').forEach(function (el) {
      if (data.meta && data.meta.lastUpdated) {
        el.innerHTML = '✅ <strong>' + data.meta.lastUpdated + '</strong> 기준 최신 데이터';
      }
    });

    // 계산기 change 이벤트 발생 (UI 재동기화)
    document.querySelectorAll('[data-policy-default]').forEach(function (el) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  /* ── 정책 만료 상태 자동 처리 ── */
  function applyPolicies(policies) {
    var today = new Date().toISOString().split('T')[0];
    var list  = (policies && policies.policies) || [];

    // 만료된 정책에 클래스 추가 (카테고리 페이지의 아티클 카드에 적용 가능)
    list.forEach(function (p) {
      if (p.deadline && p.deadline < today && p.status === 'active') {
        // 해당 정책 링크에 expired 클래스 표시 (선택적)
        document.querySelectorAll('a[href*="' + p.articleUrl + '"]').forEach(function (el) {
          el.classList.add('policy-expired');
        });
      }
    });

    // 카테고리 페이지의 정책 목록 렌더 (#pl-grid[data-category])
    renderCategoryPolicies(list);
  }

  /* ── 카테고리 페이지 정책 목록 렌더 (한 페이지 9개 = 3×3) ──
     #pl-grid[data-category] 컨테이너가 있을 때만 동작 (홈·계산기 페이지 등에는 없음). */
  var PL_PAGE_SIZE = 9;
  var plPage = 1;
  var plFiltered = [];
  var plPagerBound = false;

  function renderCategoryPolicies(list) {
    var box = document.getElementById('pl-grid');
    if (!box || !box.dataset.category) return;
    var cat = box.dataset.category;

    var filtered = list.filter(function (p) {
      return p.status !== 'draft' && p.category === cat;
    });

    var countEl = document.getElementById('pl-count');
    if (countEl) countEl.textContent = '총 ' + filtered.length + '건';

    if (!filtered.length) {
      plFiltered = [];
      box.innerHTML = '<div class="pl-empty">해당 분야의 정책이 준비 중입니다.</div>';
      renderPlPager(0);
      return;
    }

    plFiltered = filtered;
    plPage = 1;   // 초기 로드·관리자 저장 재렌더 시 1페이지로
    renderPlPage();
  }

  /* ── 현재 페이지(9개)만 그리드에 렌더 ── */
  function renderPlPage() {
    var box = document.getElementById('pl-grid');
    if (!box) return;
    var totalPages = Math.ceil(plFiltered.length / PL_PAGE_SIZE);
    if (plPage < 1) plPage = 1;
    if (plPage > totalPages) plPage = totalPages;

    var start = (plPage - 1) * PL_PAGE_SIZE;
    box.innerHTML = plFiltered.slice(start, start + PL_PAGE_SIZE).map(plCardHtml).join('');
    renderPlPager(totalPages);
  }

  /* ── 정책 카드 HTML ── */
  function plCardHtml(p) {
    var tags = (p.tags || []).slice(0, 3).map(function (t) {
      return '<span class="pl-tag">' + esc(t) + '</span>';
    }).join('');
    var deadline = p.deadline ? '<div class="pl-deadline">신청기한 ' + esc(p.deadline) + '</div>' : '';
    var url = p.sourceUrl || p.articleUrl || '#';
    return '' +
      '<div class="pl-card">' +
        '<span class="pl-cat">' + esc(p.category) + '</span>' +
        '<div class="pl-title">' + esc(p.title) + '</div>' +
        '<p class="pl-summary">' + esc(p.summary || '') + '</p>' +
        (tags ? '<div class="pl-meta">' + tags + '</div>' : '') +
        deadline +
        '<a class="pl-link" href="' + esc(url) + '" target="_blank" rel="noopener">공식 사이트에서 확인 →</a>' +
      '</div>';
  }

  /* ── 페이지네이션(이전 · 1 2 3 … · 다음) ── */
  function renderPlPager(totalPages) {
    var box = document.getElementById('pl-grid');
    if (!box) return;
    var pager = document.getElementById('pl-pager');
    if (!pager) {
      pager = document.createElement('div');
      pager.id = 'pl-pager';
      pager.className = 'pl-pager';
      box.parentNode.insertBefore(pager, box.nextSibling);
    }

    if (totalPages <= 1) { pager.innerHTML = ''; return; }

    var html = '<button class="pl-pbtn" data-page="' + (plPage - 1) + '"' + (plPage === 1 ? ' disabled' : '') + '>이전</button>';
    for (var i = 1; i <= totalPages; i++) {
      html += '<button class="pl-pbtn' + (i === plPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    html += '<button class="pl-pbtn" data-page="' + (plPage + 1) + '"' + (plPage === totalPages ? ' disabled' : '') + '>다음</button>';
    pager.innerHTML = html;

    if (!plPagerBound) {
      plPagerBound = true;
      pager.addEventListener('click', function (e) {
        var btn = e.target.closest('.pl-pbtn');
        if (!btn || btn.disabled) return;
        var page = parseInt(btn.dataset.page, 10);
        if (isNaN(page) || page === plPage) return;
        plPage = page;
        renderPlPage();
        var grid = document.getElementById('pl-grid');
        if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  /* ── 헬퍼: HTML 이스케이프 ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── 관리자 페이지에서 호출: 저장 후 즉시 반영 ── */
  window.htkonApplyConstants = applyConstants;
  window.htkonApplyPolicies  = applyPolicies;

  /* ── 헬퍼: 점 표기법 중첩 값 읽기 ── */
  function getDeep(obj, path) {
    if (!path) return undefined;
    return path.split('.').reduce(function (acc, key) {
      return (acc != null && acc[key] !== undefined) ? acc[key] : undefined;
    }, obj);
  }

  /* ── 헬퍼: 포맷 ── */
  function formatValue(value, fmt) {
    if (fmt === 'currency')     return Number(value).toLocaleString('ko-KR') + '원';
    if (fmt === 'currency-man') return Math.round(Number(value) / 10000).toLocaleString('ko-KR') + '만원';
    if (fmt === 'number')       return Number(value).toLocaleString('ko-KR');
    if (fmt === 'percent')      return value + '%';
    return String(value);
  }
}());
