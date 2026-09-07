// ============================================================
// 혜택on GA4 맞춤 이벤트 공통 헬퍼
// gtag가 없거나(광고차단 등) 에러가 나도 사이트 동작에 영향이 없어야 하므로
// 모든 외부 노출 함수는 내부적으로 try/catch로 감싼다.
// ============================================================
(function () {
  "use strict";

  var RUN_COUNT_KEY = "htkon_track_runs";
  var ONCE_PREFIX = "htkon_track_once:";

  // tool_id → { type, audience } — 모든 tool_* 이벤트 공통 파라미터의 근거 테이블
  var TOOL_META = {
    "delivery-fee-calc":      { type: "calculator", audience: "owner" },
    "business-survival-calc": { type: "calculator", audience: "owner" },
    "goodwill-check":         { type: "diagnosis",  audience: "owner" },
    "retirement-eligibility": { type: "diagnosis",  audience: "owner" },
    "calc-net-salary":        { type: "calculator", audience: "individual" },
    "calc-eitc":              { type: "calculator", audience: "individual" },
    "calc-minimum-wage":      { type: "calculator", audience: "individual" },
    "calc-unemployment":      { type: "calculator", audience: "individual" },
    "calc-tax-refund":        { type: "calculator", audience: "individual" },
    "calc-retirement-pay":    { type: "calculator", audience: "individual" },
    "calc-youth-deposit":     { type: "calculator", audience: "individual" },
    "policy-self-check":      { type: "diagnosis",  audience: "individual" },
  };

  // 자료실(.res-dl)·계산기모음(.pl-link) 카드의 href 조각 → tool_id
  // (policy-self-check는 홈 위젯이라 별도 페이지가 없어 여기 없음)
  var TOOL_PATH_MAP = [
    ["delivery-fee-calc/", "delivery-fee-calc"],
    ["business-survival-calc/", "business-survival-calc"],
    ["goodwill-protection-check/", "goodwill-check"],
    ["retirement-pay-eligibility-check/", "retirement-eligibility"],
    ["calc-net-salary.html", "calc-net-salary"],
    ["calc-eitc.html", "calc-eitc"],
    ["calc-minimum-wage.html", "calc-minimum-wage"],
    ["calc-unemployment.html", "calc-unemployment"],
    ["calc-tax-refund.html", "calc-tax-refund"],
    ["calc-retirement-pay.html", "calc-retirement-pay"],
    ["calc-youth-deposit.html", "calc-youth-deposit"],
  ];

  function isDebugMode() {
    try {
      return new URLSearchParams(location.search).get("debug_track") === "1";
    } catch (e) {
      return false;
    }
  }

  function getSourcePage() {
    return location.pathname;
  }

  function readRunCounts() {
    try {
      return JSON.parse(sessionStorage.getItem(RUN_COUNT_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function getRunCount(toolId) {
    return readRunCounts()[toolId] || 0;
  }

  // 명시적 "계산하기"/재실행 시점에 호출 — 세션 내 tool_id별 실행 횟수를 1씩 늘리고 새 값을 돌려준다
  function incrementRunCount(toolId) {
    var counts = readRunCounts();
    counts[toolId] = (counts[toolId] || 0) + 1;
    try {
      sessionStorage.setItem(RUN_COUNT_KEY, JSON.stringify(counts));
    } catch (e) {
      /* 저장 실패(시크릿 모드 등)는 무시 — 카운트만 못 늘어날 뿐 에러는 없어야 함 */
    }
    return counts[toolId];
  }

  function onceFlagKey(eventName, toolId) {
    return ONCE_PREFIX + eventName + ":" + toolId;
  }

  function hasFiredOnce(eventName, toolId) {
    try {
      return sessionStorage.getItem(onceFlagKey(eventName, toolId)) === "1";
    } catch (e) {
      return false;
    }
  }

  function markFiredOnce(eventName, toolId) {
    try {
      sessionStorage.setItem(onceFlagKey(eventName, toolId), "1");
    } catch (e) {
      /* 무시 */
    }
  }

  // ── 1. 공통 이벤트 전송기 ──
  // gtag 미존재(광고차단 등) 시 조용히 무시. ?debug_track=1 이면 콘솔에도 찍는다.
  window.track = function (eventName, params) {
    try {
      var merged = Object.assign({}, params || {});
      var debug = isDebugMode();
      if (debug) merged.debug_mode = true; // GA4 DebugView에서 바로 확인 가능

      if (typeof window.gtag === "function") {
        window.gtag("event", eventName, merged);
      }
      if (debug) {
        console.log("[htkon:track]", eventName, merged);
      }
    } catch (e) {
      /* 조용히 무시 */
    }
  };

  // ── 2. 도구 전용 이벤트 전송기 ──
  // tool_id로 tool_type/audience를 찾고, 세션 내 실행 횟수(run_count)를 자동으로 붙여 전송한다.
  window.trackTool = function (eventName, toolId, extra) {
    try {
      var meta = TOOL_META[toolId] || {};
      var merged = Object.assign(
        {
          tool_id: toolId,
          tool_type: meta.type || "",
          audience: meta.audience || "",
          run_count: getRunCount(toolId) || 1,
        },
        extra || {}
      );
      window.track(eventName, merged);
    } catch (e) {
      /* 조용히 무시 */
    }
  };

  // ── 3. 세션·도구당 1회만 전송해야 하는 이벤트(tool_start, 자가진단 tool_complete 등) ──
  window.trackToolOnce = function (eventName, toolId, extra) {
    try {
      if (hasFiredOnce(eventName, toolId)) return false;
      markFiredOnce(eventName, toolId);
      window.trackTool(eventName, toolId, extra);
      return true;
    } catch (e) {
      return false;
    }
  };

  window.trackToolStart = function (toolId, extra) {
    return window.trackToolOnce("tool_start", toolId, extra);
  };

  // ── 4. 명시적 "계산하기" 실행 시점에 호출 ──
  // 이번 세션 첫 실행이면 tool_complete, 2회차부터는 tool_repeat을 자동으로 보낸다.
  window.trackToolRun = function (toolId, extra) {
    try {
      var count = incrementRunCount(toolId);
      var eventName = count <= 1 ? "tool_complete" : "tool_repeat";
      window.trackTool(eventName, toolId, extra);
      return count;
    } catch (e) {
      return 0;
    }
  };

  // ── 5. 전 페이지 공통: 자료실/계산기모음 카드 이동(tool_discover), 외부 링크 클릭(outbound_click) ──
  function resolveToolIdFromHref(href) {
    for (var i = 0; i < TOOL_PATH_MAP.length; i++) {
      if (href.indexOf(TOOL_PATH_MAP[i][0]) !== -1) return TOOL_PATH_MAP[i][1];
    }
    return null;
  }

  function handleDocumentClick(e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";

    if (a.classList.contains("res-dl") || a.classList.contains("pl-link")) {
      var toolId = resolveToolIdFromHref(href);
      if (toolId) {
        window.trackTool("tool_discover", toolId, { target_tool: toolId, source_page: getSourcePage() });
      }
    }

    try {
      var url = new URL(a.href, location.href);
      if (/^https?:$/.test(url.protocol) && url.hostname && url.hostname !== location.hostname) {
        window.track("outbound_click", { target_domain: url.hostname, source_page: getSourcePage() });
      }
    } catch (e2) {
      /* mailto:, tel:, javascript: 등은 URL 파싱 대상이 아니므로 무시 */
    }
  }

  try {
    document.addEventListener("click", handleDocumentClick, true);
  } catch (e) {
    /* 구형 환경 등에서 addEventListener 자체가 실패해도 사이트 동작에는 영향 없음 */
  }
})();
