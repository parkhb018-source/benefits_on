import { createFlowEngine } from "./engine/flow-engine.js";
import { evaluate } from "./engine/evaluator.js";
import { makeDecision } from "./engine/decision.js";
import { generateReport } from "./engine/report-engine.js";

/* 이 Tool의 결과 코드는 HIGH/LOW/REVIEW다(권리금 보호 자가진단의 R1~R6와 다름).
   decision.js는 하위 호환 옵션으로 이를 지원한다 - 옵션을 넘기지 않으면
   기존 R6 체계 그대로 동작한다. */
const DECISION_OPTIONS = { reviewResultCode: "REVIEW", noMatchResult: "REVIEW" };

const state = {
  questions: [],
  rules: [],
  reports: {},
  answers: {},
  currentIndex: 0,
  flow: null
};

const screens = {
  start: document.getElementById("start-screen"),
  question: document.getElementById("question-screen"),
  result: document.getElementById("result-screen"),
  error: document.getElementById("error-screen")
};

const elements = {
  startButton: document.getElementById("start-button"),
  previousButton: document.getElementById("previous-button"),
  nextButton: document.getElementById("next-button"),
  restartButton: document.getElementById("restart-button"),
  retryButton: document.getElementById("retry-button"),

  questionNumber: document.getElementById("question-number"),
  questionTotal: document.getElementById("question-total"),
  questionStep: document.getElementById("question-step"),
  questionTitle: document.getElementById("question-title"),
  questionHelp: document.getElementById("question-help"),
  questionOptions: document.getElementById("question-options"),
  progressBar: document.getElementById("progress-bar"),

  resultCard: document.getElementById("result-card"),
  resultIcon: document.getElementById("result-icon"),
  resultLevel: document.getElementById("result-level"),
  resultTitle: document.getElementById("result-title"),
  resultSummary: document.getElementById("result-summary"),
  resultFacts: document.getElementById("result-facts"),
  resultReasons: document.getElementById("result-reasons"),
  lawSection: document.getElementById("law-section"),
  lawReferences: document.getElementById("law-references"),
  resultRecommendations: document.getElementById("result-recommendations"),
  calculatorCta: document.getElementById("calculator-cta"),
  calculatorCtaLink: document.getElementById("calculator-cta-link"),
  resultDisclaimer: document.getElementById("result-disclaimer"),

  errorMessage: document.getElementById("error-message")
};


/* ========================================
   초기화
======================================== */

async function initialize() {

  try {

    const [
      questionsData,
      flowData,
      rulesData,
      reportsData
    ] = await Promise.all([
      loadJSON("./data/questions.json"),
      loadJSON("./data/flow.json"),
      loadJSON("./data/rules.json"),
      loadJSON("./data/reports.json")
    ]);

    state.questions = questionsData.questions ?? questionsData;
    state.rules = rulesData.rules ?? rulesData;
    state.reports = reportsData.reports ?? reportsData;

    state.flow = createFlowEngine(
      state.questions,
      flowData
    );

  } catch (error) {

    console.error("[BenefitsON] Initialization error:", error);

    showError(
      "진단 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
    );

  }

}


/* ========================================
   JSON Loader
======================================== */

async function loadJSON(path) {

  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load: ${path}`);
  }

  return response.json();

}


/* ========================================
   Screen
======================================== */

function showScreen(name) {

  Object.values(screens).forEach(screen => {
    screen.classList.add("hidden");
  });

  screens[name].classList.remove("hidden");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* ========================================
   진단 시작
======================================== */

function startDiagnosis() {

  if (!state.flow) {
    showError("진단 데이터를 불러오지 못했습니다.");
    return;
  }

  state.answers = {};
  state.currentIndex = 0;

  state.flow.reset?.();

  showScreen("question");

  renderQuestion();

}


/* ========================================
   질문 렌더링
======================================== */

function renderQuestion() {

  const question = getCurrentQuestion();

  if (!question) {
    finishDiagnosis();
    return;
  }

  const total = getVisibleQuestions().length;
  const current = state.currentIndex + 1;

  elements.questionNumber.textContent = current;
  elements.questionTotal.textContent = total;

  elements.questionStep.textContent =
    `QUESTION ${String(current).padStart(2, "0")}`;

  elements.questionTitle.textContent =
    question.title ?? question.question ?? "";

  renderHelp(question);

  renderOptions(question);

  updateProgress(current, total);

  updateNavigation(question);

}


/* ========================================
   현재 질문
======================================== */

function getCurrentQuestion() {

  const visibleQuestions = getVisibleQuestions();

  return visibleQuestions[state.currentIndex] ?? null;

}


/* ========================================
   표시 가능한 질문 (조건부 질문 판단은 flow-engine.js에 위임)
======================================== */

function getVisibleQuestions() {

  if (!state.flow) {
    return state.questions;
  }

  if (typeof state.flow.getVisibleQuestions === "function") {
    return state.flow.getVisibleQuestions(state.answers);
  }

  return state.questions;

}


/* ========================================
   도움말
======================================== */

function renderHelp(question) {

  if (!question.help) {

    elements.questionHelp.textContent = "";
    elements.questionHelp.classList.add("hidden");

    return;
  }

  elements.questionHelp.textContent = question.help;
  elements.questionHelp.classList.remove("hidden");

}


/* ========================================
   선택지
======================================== */

function renderOptions(question) {

  elements.questionOptions.innerHTML = "";

  const options = question.options ?? [];

  const currentValue =
    state.answers[question.id];

  options.forEach((option, index) => {

    const wrapper = document.createElement("div");

    wrapper.className = "option";

    const inputId =
      `${question.id}-${option.value ?? index}`;

    const input = document.createElement("input");

    input.type =
      question.multiple ? "checkbox" : "radio";

    input.name = question.id;

    input.id = inputId;

    input.value = option.value;

    const selected =
      question.multiple
        ? Array.isArray(currentValue)
          && currentValue.includes(option.value)
        : currentValue === option.value;

    input.checked = selected;

    const label = document.createElement("label");

    label.htmlFor = inputId;

    const labelContent =
      document.createElement("span");

    labelContent.className = "option-label";

    const marker =
      document.createElement("span");

    marker.className = "option-marker";

    marker.setAttribute(
      "aria-hidden",
      "true"
    );

    const text =
      document.createElement("span");

    text.className = "option-text";

    text.textContent =
      option.label ?? option.text ?? "";

    labelContent.appendChild(marker);
    labelContent.appendChild(text);

    label.appendChild(labelContent);

    input.addEventListener(
      "change",
      () => handleAnswer(question, option.value)
    );

    wrapper.appendChild(input);
    wrapper.appendChild(label);

    elements.questionOptions.appendChild(wrapper);

  });

}


/* ========================================
   답변 처리
======================================== */

function handleAnswer(question, value) {

  if (question.multiple) {

    const current =
      Array.isArray(state.answers[question.id])
        ? [...state.answers[question.id]]
        : [];

    if (current.includes(value)) {

      state.answers[question.id] =
        current.filter(item => item !== value);

    } else {

      current.push(value);

      state.answers[question.id] = current;

    }

  } else {

    state.answers[question.id] = value;

  }

  updateNavigation(question);

}


/* ========================================
   Navigation
======================================== */

function updateNavigation(question) {

  const value =
    state.answers[question.id];

  const hasAnswer =
    Array.isArray(value)
      ? value.length > 0
      : value !== undefined
        && value !== null
        && value !== "";

  elements.nextButton.disabled =
    !hasAnswer;

  elements.previousButton.disabled =
    state.currentIndex === 0;

}


/* ========================================
   다음
======================================== */

function nextQuestion() {

  const question = getCurrentQuestion();

  if (!question) {
    finishDiagnosis();
    return;
  }

  const value =
    state.answers[question.id];

  const hasAnswer =
    Array.isArray(value)
      ? value.length > 0
      : value !== undefined
        && value !== null
        && value !== "";

  if (!hasAnswer) {
    return;
  }

  state.currentIndex++;

  renderQuestion();

}


/* ========================================
   이전 (답변은 state.answers에 남아있으므로 유지됨)
======================================== */

function previousQuestion() {

  if (state.currentIndex <= 0) {
    return;
  }

  state.currentIndex--;

  renderQuestion();

}


/* ========================================
   Progress (조건부 질문으로 총 질문 수가 바뀔 수 있어
   getVisibleQuestions().length 기준으로 매번 다시 계산한다)
======================================== */

function updateProgress(current, total) {

  const percentage =
    total > 0
      ? (current / total) * 100
      : 0;

  elements.progressBar.style.width =
    `${percentage}%`;

  const progressTrack =
    elements.progressBar.parentElement;

  progressTrack.setAttribute(
    "aria-valuenow",
    String(Math.round(percentage))
  );

}


/* ========================================
   진단 완료
======================================== */

function finishDiagnosis() {

  try {

    const evaluation =
      evaluate(
        state.answers,
        state.rules
      );

    const decision =
      makeDecision(evaluation, DECISION_OPTIONS);

    const reportTemplate =
      state.reports[decision.result];

    if (!reportTemplate) {

      throw new Error(
        `Report not found: ${decision.result}`
      );

    }

    const report =
      generateReport(
        reportTemplate,
        state.answers
      );

    renderResult(
      report,
      decision
    );

    showScreen("result");

  } catch (error) {

    console.error(
      "[BenefitsON] Evaluation error:",
      error
    );

    showError(
      "진단 결과를 생성하는 중 문제가 발생했습니다."
    );

  }

}


/* ========================================
   결과 렌더링
======================================== */

function renderResult(report, decision) {

  elements.resultTitle.textContent =
    report.title ?? "";

  elements.resultSummary.textContent =
    report.summary ?? "";

  elements.resultLevel.textContent =
    getResultLevel(report.level);

  elements.resultIcon.textContent =
    getResultIcon(report.icon);

  renderFacts(report.facts ?? []);

  renderList(
    elements.resultReasons,
    report.reasons ?? []
  );

  renderLawReferences(
    report.lawReference ??
    report.lawReferences ??
    []
  );

  renderList(
    elements.resultRecommendations,
    report.recommendations ?? []
  );

  renderCalculatorCta(report.calculatorLink);

  elements.resultDisclaimer.textContent =
    report.disclaimer ?? "";

  applyResultStyle(report);

}


/* ========================================
   퇴직금 계산기 CTA (HIGH 결과에서만 노출)
   퇴직금 계산 로직은 여기서 다시 구현하지 않고
   기존 퇴직금 실수령액 계산기로 연결만 한다.
======================================== */

function renderCalculatorCta(calculatorLink) {

  if (!calculatorLink) {

    elements.calculatorCta.classList.add("hidden");

    return;

  }

  elements.calculatorCtaLink.href = calculatorLink;

  elements.calculatorCta.classList.remove("hidden");

}


/* ========================================
   결과 스타일
======================================== */

function applyResultStyle(report) {

  elements.resultCard.className =
    "result-card";

  const level =
    String(report.level ?? "").toUpperCase();

  const classMap = {
    SUCCESS: "result-success",
    WARNING: "result-warning",
    ERROR: "result-error",
    INFO: "result-info",
    CONSULT: "result-warning"
  };

  const className =
    classMap[level];

  if (className) {
    elements.resultCard.classList.add(className);
  }

}


/* ========================================
   Facts
======================================== */

function renderFacts(facts) {

  elements.resultFacts.innerHTML = "";

  facts.forEach(fact => {

    const item =
      document.createElement("div");

    item.className = "fact";

    const label =
      document.createElement("span");

    label.className = "fact-label";

    label.textContent =
      fact.label ?? "";

    const value =
      document.createElement("span");

    value.className = "fact-value";

    value.textContent =
      fact.value ?? "-";

    item.appendChild(label);
    item.appendChild(value);

    elements.resultFacts.appendChild(item);

  });

}


/* ========================================
   List
======================================== */

function renderList(element, items) {

  element.innerHTML = "";

  items.forEach(item => {

    const li =
      document.createElement("li");

    li.textContent =
      typeof item === "string"
        ? item
        : item.text ?? "";

    element.appendChild(li);

  });

}


/* ========================================
   법률 근거
======================================== */

function renderLawReferences(references) {

  elements.lawReferences.innerHTML = "";

  if (!references.length) {

    elements.lawSection.classList.add("hidden");

    return;

  }

  elements.lawSection.classList.remove("hidden");

  references.forEach(reference => {

    const item =
      document.createElement("div");

    item.className = "law-reference";

    const act =
      reference.act ?? "";

    const article =
      reference.article ?? "";

    item.textContent =
      article
        ? `${act} ${article}`
        : act;

    elements.lawReferences.appendChild(item);

  });

}


/* ========================================
   결과 표시용 텍스트
======================================== */

function getResultLevel(level) {

  const map = {

    SUCCESS: "지급 대상 가능성 높음",

    WARNING: "추가 확인 필요",

    ERROR: "지급 대상 아닐 가능성",

    INFO: "현재 입력 기준 확인 결과",

    CONSULT: "전문가 상담 권장"

  };

  return map[String(level).toUpperCase()]
    ?? "자가진단 결과";

}


function getResultIcon(icon) {

  const map = {

    "check-circle": "✓",

    "help-circle": "?",

    "x-circle": "×",

    "clock": "!",

    "info": "i",

    "alert-triangle": "!"

  };

  return map[icon] ?? "i";

}


/* ========================================
   오류
======================================== */

function showError(message) {

  elements.errorMessage.textContent =
    message;

  showScreen("error");

}


/* ========================================
   이벤트
======================================== */

elements.startButton.addEventListener(
  "click",
  startDiagnosis
);

elements.nextButton.addEventListener(
  "click",
  nextQuestion
);

elements.previousButton.addEventListener(
  "click",
  previousQuestion
);

elements.restartButton.addEventListener(
  "click",
  startDiagnosis
);

elements.retryButton.addEventListener(
  "click",
  initialize
);


/* ========================================
   Start
======================================== */

initialize();
