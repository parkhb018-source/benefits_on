// ===== 플랫폼별 기본 수수료율 (수수료가 바뀌면 이 값만 고치면 됨) =====
// 배민1플러스·쿠팡이츠 상생요금제는 매출 상위 비율에 따라 2.0~7.8%로 차등 적용됨.
// 여기서는 "매출 상위 35%·신규 사장님" 구간(가장 흔한 기본 구간) 기준값을 사용.
// 부가세 10%는 별도로 붙으므로 실제 청구액은 아래 수수료율보다 조금 더 높을 수 있음.
const PLATFORM_RATES = {
  baemin:       { name: "배민",     brokerage: 7.8, payment: 3.0 },
  coupangeats:  { name: "쿠팡이츠", brokerage: 7.8, payment: 3.0 },
  yogiyo:       { name: "요기요",   brokerage: 9.7, payment: 3.0 },
  custom:       { name: "직접입력", brokerage: 0,   payment: 0   },
};

const HISTORY_KEY = "menuProfitHistory";
const INPUTS_KEY = "menuProfitInputs";
const HISTORY_LIMIT = 10;

// 메인 계산기 입력 필드 id 목록 — comma 처리/실시간 계산/초기화/자동저장이 모두 이 목록을 기준으로 동작함
const MAIN_MONEY_FIELD_IDS = ["price", "cost", "delivery", "box", "wrap"];
const MAIN_RATE_FIELD_IDS = ["rate-brokerage", "rate-payment"];
const MAIN_FIELD_IDS = [...MAIN_MONEY_FIELD_IDS, ...MAIN_RATE_FIELD_IDS];
const REVERSE_MONEY_FIELD_IDS = ["reverse-cost", "reverse-box", "reverse-wrap", "reverse-delivery"];
const REVERSE_FIELD_IDS = [...REVERSE_MONEY_FIELD_IDS, "reverse-target-ratio", "reverse-rate-brokerage", "reverse-rate-payment"];

// ===== 숫자 입력 콤마 처리 =====
function toNumber(str) {
  const cleaned = String(str).replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function formatComma(str) {
  const cleaned = String(str).replace(/[^0-9]/g, "");
  if (cleaned === "") return "";
  return Number(cleaned).toLocaleString("ko-KR");
}

function bindCommaInput(input) {
  input.addEventListener("input", () => {
    const cursorFromEnd = input.value.length - input.selectionStart;
    input.value = formatComma(input.value);
    const pos = input.value.length - cursorFromEnd;
    input.setSelectionRange(pos, pos);
  });
}

document.querySelectorAll(
  [...MAIN_MONEY_FIELD_IDS, "daily-qty", "monthly-days", ...REVERSE_MONEY_FIELD_IDS].map(id => `#${id}`).join(", ")
).forEach(bindCommaInput);

// 화면에 보이는 금액은 항상 이 규칙으로 반올림됨 — 동점 판정 등 다른 곳에서도
// "화면에 보이는 값이 같은지"를 확인할 때는 이 함수를 기준으로 삼아야 함
function roundWon(n) {
  return Math.round(n);
}

function formatWon(n) {
  return roundWon(n).toLocaleString("ko-KR") + "원";
}

// 판매가 대비 비율(%) — 원가율/배달비 비중/도넛 세그먼트/비용내역 비율 표시가 모두 이 계산을 공유함
function pctOf(value, price) {
  return price > 0 ? (value / price) * 100 : 0;
}

function getNum(id) {
  const el = document.getElementById(id);
  return el ? toNumber(el.value) : 0;
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ===== 보이기/숨기기 토글 (고급 옵션 등) =====
// 패널이 markup 상 이미 열려 있을 수도 있으므로, 초기 라벨은 현재 hidden 상태를 보고 정함
function setupToggle(button, panel, openLabel, closeLabel) {
  function open() {
    panel.removeAttribute("hidden");
    button.textContent = closeLabel;
  }
  function close() {
    panel.setAttribute("hidden", "");
    button.textContent = openLabel;
  }
  button.textContent = panel.hasAttribute("hidden") ? openLabel : closeLabel;
  button.addEventListener("click", () => {
    if (panel.hasAttribute("hidden")) open(); else close();
  });
  return { open, close };
}

const advancedToggles = {};
document.querySelectorAll(".advanced-toggle").forEach(toggle => {
  const panel = document.getElementById(`${toggle.dataset.target}-advanced`);
  if (!panel) return;
  const baseLabel = toggle.textContent.replace(/\s*[▾▴]$/, "").trim();
  advancedToggles[toggle.dataset.target] = setupToggle(toggle, panel, `${baseLabel} ▾`, `${baseLabel} ▴`);
});

// ===== 플랫폼 선택 버튼 =====
// idPrefix/advancedKey는 호출부에서 명시적으로 지정 — targetPrefix 값에 따른 특례 분기를 두지 않기 위함
function setupPlatformButtons(targetPrefix, { idPrefix = `${targetPrefix}-`, advancedKey = targetPrefix } = {}, onSelect) {
  const group = document.querySelector(`.platform-buttons[data-target="${targetPrefix}"]`);
  if (!group) return;
  const buttons = group.querySelectorAll(".platform-btn");
  const advancedToggle = advancedToggles[advancedKey];
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const rates = PLATFORM_RATES[btn.dataset.platform];
      const brokerageInput = document.getElementById(`${idPrefix}rate-brokerage`);
      const paymentInput = document.getElementById(`${idPrefix}rate-payment`);
      if (brokerageInput) brokerageInput.value = rates.brokerage;
      if (paymentInput) paymentInput.value = rates.payment;

      // "직접입력"은 값을 눈으로 봐야 의미가 있으므로 수수료율 패널을 바로 펼쳐줌
      if (btn.dataset.platform === "custom" && advancedToggle) {
        advancedToggle.open();
        if (brokerageInput) brokerageInput.focus();
      }
      if (onSelect) onSelect(btn.dataset.platform);
    });
  });
}

// ===== 핵심 계산 함수 =====
function calcNet({ price, cost, delivery, box, wrap, brokerageRate, paymentRate }) {
  const brokerageFee = price * (brokerageRate / 100);
  const paymentFee = price * (paymentRate / 100);
  const totalDeduction = brokerageFee + paymentFee + delivery + box + wrap + cost;
  const net = price - totalDeduction;
  const rate = pctOf(net, price);
  return { brokerageFee, paymentFee, net, rate };
}

// ========================================================
// 메인 계산기 (① 정보 입력 → ② 계산 결과 → ③ 수익 분석 리포트)
// ========================================================

let selectedMainPlatform = null;
let costUnitMode = "amount"; // "amount" | "percent"

setupPlatformButtons("main", { idPrefix: "", advancedKey: "rate" }, (platform) => {
  selectedMainPlatform = platform;
  recalculate();
  saveInputs();
});

// ----- 리포트 규칙 (if문 대신 임계값 표로 표현, AI 미사용) -----
// descending=true면 "값 >= threshold"를 위에서부터, false면 "값 <= threshold"를 위에서부터 검사한다
// (높을수록 좋은 지표는 descending, 낮을수록 좋은 지표는 ascending)
function pickTier(value, table, descending) {
  for (const tier of table) {
    if (descending ? value >= tier.threshold : value <= tier.threshold) {
      return { tag: tier.tag, tone: tier.tone, text: tier.text(value), emoji: tier.emoji, score: tier.score };
    }
  }
  return null; // 마지막 항목의 threshold가 ±Infinity이므로 실제로는 도달하지 않음
}

// 원가율/순이익률/배달비 비중/플랫폼 비중은 모두 "메뉴 수익률"을 결정짓는 원인 지표라서,
// 종합 점수는 결과(순이익률)를 다시 세지 않고 이 4개 원인 지표의 score 합산으로만 산출한다(만점 100점).
// 등급 문구와 점수가 같은 표, 같은 threshold에서 나오므로 둘이 서로 어긋날 일이 없다.
const COST_RATE_TABLE = [
  { threshold: 25, score: 30, tag: "매우 좋음", tone: "success", text: v => `원가율 ${v.toFixed(1)}%는 매우 이상적인 수준이에요.` },
  { threshold: 35, score: 25, tag: "적정", tone: "success", text: v => `원가율 ${v.toFixed(1)}%는 적정 수준이에요.` },
  { threshold: 45, score: 15, tag: "보통", tone: "info", text: v => `원가율 ${v.toFixed(1)}%는 보통 수준이에요. 30% 이하가 이상적이에요.` },
  { threshold: Infinity, score: 5, tag: "부담", tone: "warning", text: v => `원가율 ${v.toFixed(1)}%로 다소 높아요. 원가나 판매가 조정을 고려해보세요.` },
];

const PROFIT_RATE_TABLE = [
  { threshold: 50, score: 40, tag: "매우 우수", tone: "success", text: v => `순이익률 ${v.toFixed(1)}%로 매우 우수해요. 평균보다 훨씬 높은 수익을 기대할 수 있어요.` },
  { threshold: 40, score: 32, tag: "우수", tone: "success", text: v => `순이익률 ${v.toFixed(1)}%로 우수한 편이에요.` },
  { threshold: 30, score: 20, tag: "보통", tone: "info", text: v => `순이익률 ${v.toFixed(1)}%로 평균적인 수준이에요.` },
  { threshold: 20, score: 10, tag: "낮음", tone: "warning", text: v => `순이익률 ${v.toFixed(1)}%로 낮은 편이에요. 원가·수수료·배달비를 점검해보세요.` },
  { threshold: -Infinity, score: 0, tag: "주의", tone: "warning", text: v => `순이익률 ${v.toFixed(1)}%로 매우 낮아요. 수익 구조를 재검토해야 해요.` },
];

const DELIVERY_SHARE_TABLE = [
  { threshold: 10, score: 15, tag: "낮음", tone: "success", text: v => `배달비 비중 ${v.toFixed(1)}%로 평균보다 낮아요.` },
  { threshold: 15, score: 12, tag: "보통", tone: "success", text: v => `배달비 비중 ${v.toFixed(1)}%로 평균 수준이에요.` },
  { threshold: 20, score: 7, tag: "다소 높음", tone: "info", text: v => `배달비 비중 ${v.toFixed(1)}%로 다소 높은 편이에요.` },
  { threshold: Infinity, score: 0, tag: "부담", tone: "warning", text: v => `배달비 비중 ${v.toFixed(1)}%로 부담이 커요. 배달비를 낮출 방법을 찾아보세요.` },
];

const PLATFORM_SHARE_TABLE = [
  { threshold: 8, score: 15, tag: "낮음", tone: "success", text: v => `플랫폼 비용 비중 ${v.toFixed(1)}%로 평균보다 낮아요.` },
  { threshold: 12, score: 12, tag: "보통", tone: "success", text: v => `플랫폼 비용 비중 ${v.toFixed(1)}%로 평균 수준이에요.` },
  { threshold: 15, score: 7, tag: "다소 높음", tone: "info", text: v => `플랫폼 비용 비중 ${v.toFixed(1)}%로 다소 높은 편이에요.` },
  { threshold: Infinity, score: 0, tag: "부담", tone: "warning", text: v => `플랫폼 비용 비중 ${v.toFixed(1)}%로 부담이 커요. 수수료율이 낮은 플랫폼을 검토해보세요.` },
];

// 각 표의 최고 점수(항상 첫 행)를 "N/M점" 표시의 분모로 사용 — 표를 조정해도 분모가 자동으로 따라간다
const COST_RATE_MAX = COST_RATE_TABLE[0].score;
const PROFIT_RATE_MAX = PROFIT_RATE_TABLE[0].score;
const DELIVERY_SHARE_MAX = DELIVERY_SHARE_TABLE[0].score;
const PLATFORM_SHARE_MAX = PLATFORM_SHARE_TABLE[0].score;

const SCORE_GRADE_TABLE = [
  { threshold: 85, tag: "⭐⭐⭐⭐⭐ 매우 우수", tone: "success", emoji: "🤩", text: v => `종합 점수 ${v}점(100점 만점). 수익성이 매우 좋은 메뉴예요. 이 메뉴를 대표 메뉴로 밀어보세요!` },
  { threshold: 70, tag: "⭐⭐⭐⭐ 우수", tone: "success", emoji: "😊", text: v => `종합 점수 ${v}점(100점 만점). 수익성이 좋은 메뉴예요.` },
  { threshold: 60, tag: "⭐⭐⭐ 보통", tone: "info", emoji: "🙂", text: v => `종합 점수 ${v}점(100점 만점). 평균적인 수익성의 메뉴예요.` },
  { threshold: 40, tag: "⭐⭐ 비용 구조 점검", tone: "warning", emoji: "😟", text: v => `종합 점수 ${v}점(100점 만점). 원가·배달비·플랫폼 비용 구조를 점검해보세요.` },
  { threshold: -Infinity, tag: "⭐ 수익성 위험", tone: "warning", emoji: "🚨", text: v => `종합 점수 ${v}점(100점 만점). 수익 구조 전반을 재검토해야 해요.` },
];

const getCostRateTier = costRate => pickTier(costRate, COST_RATE_TABLE, false);
const getProfitRateTier = profitRate => pickTier(profitRate, PROFIT_RATE_TABLE, true);
const getDeliveryShareTier = deliveryShare => pickTier(deliveryShare, DELIVERY_SHARE_TABLE, false);
const getPlatformShareTier = platformShare => pickTier(platformShare, PLATFORM_SHARE_TABLE, false);
const getScoreGradeTier = totalScore => pickTier(totalScore, SCORE_GRADE_TABLE, true);

// 리포트 카드 DOM은 고정 5개뿐이므로 매번 조회하지 않고 한 번만 캐시해둔다
// defaultTag/defaultText는 마크업에 적힌 안내문구(placeholder)를 그대로 기억해뒀다가 초기화 시 복원하는 데 쓴다
const reportCardEls = {};
["cost-rate", "profit-rate", "delivery-share", "platform-share", "summary"].forEach(prefix => {
  const tag = document.getElementById(`report-${prefix}-tag`);
  const text = document.getElementById(`report-${prefix}-text`);
  reportCardEls[prefix] = {
    card: document.getElementById(`report-${prefix}`),
    tag,
    text,
    defaultTag: tag.textContent,
    defaultText: text.textContent,
  };
});

// max가 있으면 "N/M점"을 문구 뒤에 덧붙여, 등급이 어떤 점수 산정 근거로 나왔는지 보여준다
function applyReportCard(prefix, tier, max) {
  const { card, tag, text } = reportCardEls[prefix];
  card.classList.remove("tone-success", "tone-warning", "tone-info");
  card.classList.add(`tone-${tier.tone}`);
  tag.textContent = tier.tag;
  text.textContent = max ? `${tier.text} (${tier.score}/${max}점)` : tier.text;
}

function resetReportCards() {
  Object.values(reportCardEls).forEach(({ card, tag, text, defaultTag, defaultText }) => {
    card.classList.remove("tone-success", "tone-warning", "tone-info");
    tag.textContent = defaultTag;
    text.textContent = defaultText;
  });
}

const DONUT_SEGMENTS = [
  { key: "cost", label: "음식 원가", color: "var(--donut-cost)" },
  { key: "brokerageFee", label: "중개수수료", color: "var(--donut-brokerage)" },
  { key: "paymentFee", label: "결제수수료", color: "var(--donut-payment)" },
  { key: "delivery", label: "배달비", color: "var(--donut-delivery)" },
  { key: "box", label: "용기값", color: "var(--donut-box)" },
  { key: "wrap", label: "포장비", color: "var(--donut-wrap)" },
];

function renderDonut(price, parts, rate) {
  const chart = document.getElementById("donut-chart");
  const centerValue = document.getElementById("donut-center-value");
  const legend = document.getElementById("donut-legend");

  centerValue.textContent = `${rate.toFixed(1)}%`;
  centerValue.style.color = rate >= 0 ? "var(--color-success)" : "var(--color-danger)";

  if (price <= 0) {
    chart.style.background = "conic-gradient(var(--color-border) 0 100%)";
    legend.innerHTML = "";
    return;
  }

  let cursor = 0;
  const stops = [];
  const legendItems = [];

  DONUT_SEGMENTS.forEach(seg => {
    const value = Math.max(0, parts[seg.key]);
    const pct = Math.min(100, pctOf(value, price));
    if (pct <= 0) return;
    const start = cursor;
    const end = Math.min(100, cursor + pct);
    stops.push(`${seg.color} ${start}% ${end}%`);
    cursor = end;
    legendItems.push({ label: seg.label, color: seg.color, pct });
  });

  const netPct = Math.max(0, Math.min(100 - cursor, 100));
  if (netPct > 0) {
    stops.push(`var(--donut-net) ${cursor}% ${cursor + netPct}%`);
    legendItems.push({ label: "남는 돈", color: "var(--donut-net)", pct: netPct });
  }

  chart.style.background = `conic-gradient(${stops.join(", ")})`;
  legend.innerHTML = legendItems.map(item => `
    <li><span class="donut-dot" style="background:${item.color}"></span>${item.label} ${item.pct.toFixed(1)}%</li>
  `).join("");
}

function renderBreakdown(price, parts, net) {
  const list = document.getElementById("breakdown-list");
  const rows = [
    { label: "매출 판매가", value: price, negative: false },
    { label: "음식 원가", value: -parts.cost, negative: true },
    { label: "중개수수료", value: -parts.brokerageFee, negative: true },
    { label: "결제수수료", value: -parts.paymentFee, negative: true },
    { label: "배달비 부담액", value: -parts.delivery, negative: true },
    { label: "용기값", value: -parts.box, negative: true },
    { label: "포장비", value: -parts.wrap, negative: true },
  ];

  function fmt(value) {
    if (costUnitMode === "percent") {
      const pct = pctOf(value, price);
      const sign = pct > 0 ? "+" : "";
      return `${sign}${pct.toFixed(1)}%`;
    }
    const sign = value > 0 ? "" : "-";
    return `${sign}${formatWon(Math.abs(value))}`;
  }

  list.innerHTML = rows.map(row => `
    <li><span>${row.label}</span><span class="${row.negative ? "negative" : ""}">${fmt(row.value)}</span></li>
  `).join("") + `
    <li class="total"><span>순수익 (내 통장에 남는 돈)</span><span class="positive">${fmt(net)}</span></li>
  `;
}

document.querySelectorAll(".unit-toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".unit-toggle-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    costUnitMode = btn.dataset.unit;
    recalculate();
  });
});

// 비교 카드 DOM은 고정 3개뿐이므로 매번 조회하지 않고 한 번만 캐시해둔다
const compareCardEls = {};
document.querySelectorAll(".compare-card").forEach(card => {
  compareCardEls[card.dataset.platform] = {
    card,
    amount: card.querySelector(".cc-amount"),
    rate: card.querySelector(".cc-rate"),
    best: card.querySelector(".cc-best"),
  };
});

function renderCompareStrip(price, cost, delivery, box, wrap) {
  if (price <= 0) {
    Object.values(compareCardEls).forEach(({ card, amount, rate, best }) => {
      amount.textContent = "0원";
      rate.textContent = "0%";
      card.classList.remove("best");
      best.setAttribute("hidden", "");
    });
    return;
  }

  const results = {};
  ["baemin", "coupangeats", "yogiyo"].forEach(key => {
    const rates = PLATFORM_RATES[key];
    results[key] = calcNet({ price, cost, delivery, box, wrap, brokerageRate: rates.brokerage, paymentRate: rates.payment });
  });

  const maxNet = Math.max(...Object.values(results).map(r => roundWon(r.net)));
  const winners = Object.keys(results).filter(key => roundWon(results[key].net) === maxNet);

  Object.entries(compareCardEls).forEach(([key, { card, amount, rate, best }]) => {
    const r = results[key];
    amount.textContent = formatWon(r.net);
    rate.textContent = `순이익률 ${r.rate.toFixed(1)}%`;
    if (winners.includes(key)) {
      card.classList.add("best");
      best.removeAttribute("hidden");
    } else {
      card.classList.remove("best");
      best.setAttribute("hidden", "");
    }
  });
}

function renderMonthly(net) {
  const qty = getNum("daily-qty");
  const days = getNum("monthly-days");
  const monthly = net * qty * days;
  document.getElementById("monthly-result-value").textContent = formatWon(monthly);
}

function recalculate() {
  const price = getNum("price");
  const cost = getNum("cost");
  const delivery = getNum("delivery");
  const box = getNum("box");
  const wrap = getNum("wrap");
  const brokerageRate = getNum("rate-brokerage");
  const paymentRate = getNum("rate-payment");

  const { brokerageFee, paymentFee, net, rate } = calcNet({ price, cost, delivery, box, wrap, brokerageRate, paymentRate });
  const costRate = pctOf(cost, price);
  const deliveryShare = pctOf(delivery, price);
  const platformShare = pctOf(brokerageFee + paymentFee, price);

  document.getElementById("net-amount").textContent = formatWon(net);
  document.getElementById("profit-rate").textContent = `${rate.toFixed(1)}%`;
  document.getElementById("cost-rate").textContent = `${costRate.toFixed(1)}%`;

  const tierEl = document.getElementById("hero-tier");
  const parts = { cost, brokerageFee, paymentFee, delivery, box, wrap };
  renderBreakdown(price, parts, net);
  renderDonut(price, parts, rate);
  renderCompareStrip(price, cost, delivery, box, wrap);
  renderMonthly(net);

  if (price > 0) {
    // 원가율/순이익률/배달비 비중/플랫폼 비중 4개 원인 지표의 점수를 합산해 종합 점수(100점 만점)를 산출한다.
    // 순이익률은 이미 저 지표들의 결과이므로, 종합 점수에 순이익률 자체를 별도로 다시 반영하지 않는다.
    const costTier = getCostRateTier(costRate);
    const profitTier = getProfitRateTier(rate);
    const deliveryTier = getDeliveryShareTier(deliveryShare);
    const platformTier = getPlatformShareTier(platformShare);
    const totalScore = costTier.score + profitTier.score + deliveryTier.score + platformTier.score;

    const grade = getScoreGradeTier(totalScore);
    tierEl.textContent = `${grade.emoji} ${grade.tag}`;
    tierEl.removeAttribute("hidden");

    applyReportCard("cost-rate", costTier, COST_RATE_MAX);
    applyReportCard("profit-rate", profitTier, PROFIT_RATE_MAX);
    applyReportCard("delivery-share", deliveryTier, DELIVERY_SHARE_MAX);
    applyReportCard("platform-share", platformTier, PLATFORM_SHARE_MAX);
    applyReportCard("summary", grade);
  } else {
    tierEl.setAttribute("hidden", "");
    resetReportCards();
  }
}

const recalcDebounced = debounce(recalculate, 120);

document.querySelectorAll([...MAIN_FIELD_IDS, "daily-qty", "monthly-days"].map(id => `#${id}`).join(", "))
  .forEach(input => {
    input.addEventListener("input", () => {
      recalcDebounced();
      saveInputsDebounced();
    });
  });

document.getElementById("calc-btn").addEventListener("click", () => {
  recalculate();
  document.getElementById("calc-btn").blur();
  const price = getNum("price");
  if (price <= 0) {
    alert("메뉴 판매가를 입력해 주세요.");
    return;
  }
  pushHistory();
});

document.getElementById("reset-btn").addEventListener("click", () => {
  MAIN_FIELD_IDS.forEach(id => {
    document.getElementById(id).value = "";
  });
  document.querySelectorAll('.platform-buttons[data-target="main"] .platform-btn').forEach(b => b.classList.remove("active"));
  selectedMainPlatform = null;
  recalculate();
  saveInputs();
});

// ===== 계산 기록 (localStorage) =====
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function renderHistory() {
  const history = loadHistory();
  const emptyEl = document.getElementById("history-empty");
  const tableEl = document.getElementById("history-table");
  const tbody = document.getElementById("history-tbody");

  if (history.length === 0) {
    emptyEl.removeAttribute("hidden");
    tableEl.setAttribute("hidden", "");
    return;
  }
  emptyEl.setAttribute("hidden", "");
  tableEl.removeAttribute("hidden");

  tbody.innerHTML = history.map((row, idx) => `
    <tr>
      <td>${row.time}</td>
      <td>${row.platformName}</td>
      <td>${formatWon(row.price)}</td>
      <td>${formatWon(row.net)}</td>
      <td>${row.rate.toFixed(1)}%</td>
      <td><button type="button" class="history-row-delete" data-idx="${idx}" aria-label="삭제">✕</button></td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".history-row-delete").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      const list = loadHistory();
      list.splice(idx, 1);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
      renderHistory();
    });
  });
}

function pushHistory() {
  const price = getNum("price");
  const cost = getNum("cost");
  const delivery = getNum("delivery");
  const box = getNum("box");
  const wrap = getNum("wrap");
  const brokerageRate = getNum("rate-brokerage");
  const paymentRate = getNum("rate-payment");
  const { net, rate } = calcNet({ price, cost, delivery, box, wrap, brokerageRate, paymentRate });

  const platformName = selectedMainPlatform ? PLATFORM_RATES[selectedMainPlatform].name : "직접입력";
  const now = new Date();
  const time = `${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const history = loadHistory();
  history.unshift({ time, platformName, price, net, rate });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
  renderHistory();
}

document.getElementById("history-clear-btn").addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

// ===== 입력값 자동 저장 (localStorage) =====
function saveInputs() {
  const data = { platform: selectedMainPlatform };
  MAIN_FIELD_IDS.forEach(id => {
    data[id] = document.getElementById(id).value;
  });
  localStorage.setItem(INPUTS_KEY, JSON.stringify(data));
}
const saveInputsDebounced = debounce(saveInputs, 300);

function restoreInputs() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(INPUTS_KEY));
  } catch {
    data = null;
  }
  if (!data) return;

  MAIN_FIELD_IDS.forEach(id => {
    if (data[id]) document.getElementById(id).value = data[id];
  });

  if (data.platform && PLATFORM_RATES[data.platform]) {
    selectedMainPlatform = data.platform;
    const btn = document.querySelector(`.platform-buttons[data-target="main"] .platform-btn[data-platform="${data.platform}"]`);
    if (btn) btn.classList.add("active");
  }
}

// ========================================================
// 접이식: 얼마에 팔아야 할까? (목표 원가율 역산)
// ========================================================
setupPlatformButtons("reverse");

function recalculateReverse() {
  const cost = getNum("reverse-cost");
  const box = getNum("reverse-box");
  const wrap = getNum("reverse-wrap");
  const delivery = getNum("reverse-delivery");
  const targetRatio = getNum("reverse-target-ratio");
  const brokerageRate = getNum("reverse-rate-brokerage");
  const paymentRate = getNum("reverse-rate-payment");

  const priceEl = document.getElementById("reverse-price");
  const infoEl = document.getElementById("reverse-rate-info");

  if (targetRatio <= 0 || targetRatio >= 100 || cost <= 0) {
    priceEl.textContent = "0원";
    infoEl.textContent = "원가와 목표 원가율을 입력하면 계산돼요";
    return;
  }

  // 목표 원가율 = 음식 원가 ÷ 판매가 이 되도록 판매가를 역산
  const rawPrice = cost / (targetRatio / 100);
  const price = Math.round(rawPrice / 100) * 100;

  const { net, rate } = calcNet({ price, cost, delivery, box, wrap, brokerageRate, paymentRate });

  priceEl.textContent = formatWon(price);
  infoEl.textContent = `실제로 남는 돈 ${formatWon(net)} (순이익률 ${rate.toFixed(1)}%)`;
}

const recalcReverseDebounced = debounce(recalculateReverse, 120);
document.querySelectorAll("#reverse-cost, #reverse-box, #reverse-wrap, #reverse-delivery, #reverse-target-ratio, #reverse-rate-brokerage, #reverse-rate-payment")
  .forEach(input => input.addEventListener("input", recalcReverseDebounced));

document.getElementById("reverse-reset-btn").addEventListener("click", () => {
  REVERSE_FIELD_IDS.forEach(id => {
    document.getElementById(id).value = "";
  });
  document.querySelectorAll('.platform-buttons[data-target="reverse"] .platform-btn').forEach(b => b.classList.remove("active"));
  recalculateReverse();
});

// ===== 초기화 =====
restoreInputs();
renderHistory();
recalculate();
recalculateReverse();