/* BenefitsON Law Engine - Integration Test (퇴직금 지급 대상 자가진단)
   Verifies the real 근로자퇴직급여 보장법 Decision Table wired through
   Flow Engine -> Rule Engine -> Decision Engine -> Report Engine.
   Loads data/*.json directly (no hardcoded rules in this test file). */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { createFlowEngine } from "../engine/flow-engine.js";
import { evaluate } from "../engine/evaluator.js";
import { makeDecision } from "../engine/decision.js";
import { generateReport } from "../engine/report-engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

function loadJSON(filename) {
  return JSON.parse(readFileSync(join(dataDir, filename), "utf-8"));
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error.message}`);
  }
}

console.log("BenefitsON Law Engine - Integration Test (근로자퇴직급여 보장법 - 퇴직금 지급 대상 자가진단)\n");

const questionsData = loadJSON("questions.json");
const flowData = loadJSON("flow.json");
const rulesData = loadJSON("rules.json");
const reportsData = loadJSON("reports.json");

const questions = questionsData.questions;
const rules = rulesData.rules;
const reports = reportsData.reports;

const DECISION_OPTIONS = { reviewResultCode: "REVIEW", noMatchResult: "REVIEW" };

/* ---------------------------------------
   0. 파일 로딩 / 배선
--------------------------------------- */

test("questions/flow/rules/reports.json 로딩", () => {
  assert.ok(Array.isArray(questions) && questions.length > 0);
  assert.ok(Array.isArray(rules) && rules.length > 0);
  assert.ok(typeof reports === "object");
});

test("flow.json order가 questions.json의 모든 id를 포함", () => {
  const questionIds = new Set(questions.map(q => q.id));
  const orderIds = new Set(flowData.order);
  assert.deepEqual(orderIds, questionIds);
});

test("rules.json이 참조하는 모든 result 코드에 대응하는 reports.json 템플릿 존재", () => {
  const resultCodes = new Set(rules.map(rule => rule.result));
  for (const code of resultCodes) {
    assert.ok(reports[code], `Missing report template: ${code}`);
  }
});

/* ---------------------------------------
   Flow Engine: evidenceStatus 조건부 노출
--------------------------------------- */

test("flow engine: 단순 케이스(continuityIssue=none, 15시간 이상, 일용 아님)에서는 evidenceStatus 숨김", () => {
  const flow = createFlowEngine(questions, flowData);
  const visible = flow.getVisibleQuestions({
    fourWeekPrescribedHours: "15OrMore",
    continuityIssue: "none",
    workerType: "regular"
  });
  assert.ok(!visible.some(q => q.id === "evidenceStatus"));
});

test("flow engine: fourWeekPrescribedHours=variable이면 evidenceStatus 노출", () => {
  const flow = createFlowEngine(questions, flowData);
  const visible = flow.getVisibleQuestions({ fourWeekPrescribedHours: "variable" });
  assert.ok(visible.some(q => q.id === "evidenceStatus"));
});

test("flow engine: continuityIssue=breakOrReentry이면 evidenceStatus 노출", () => {
  const flow = createFlowEngine(questions, flowData);
  const visible = flow.getVisibleQuestions({ continuityIssue: "breakOrReentry" });
  assert.ok(visible.some(q => q.id === "evidenceStatus"));
});

test("flow engine: workerType=daily이면 evidenceStatus 노출", () => {
  const flow = createFlowEngine(questions, flowData);
  const visible = flow.getVisibleQuestions({ workerType: "daily" });
  assert.ok(visible.some(q => q.id === "evidenceStatus"));
});

test("flow engine: 빈 answers({})에도 예외 없이 기본 질문 전체를 반환", () => {
  const flow = createFlowEngine(questions, flowData);
  const visible = flow.getVisibleQuestions({});
  assert.equal(visible.length, questions.length - 1); // evidenceStatus만 숨김
  assert.ok(!visible.some(q => q.id === "evidenceStatus"));
});

/* ---------------------------------------
   Helper: run full pipeline
--------------------------------------- */

function runPipeline(answers) {
  const evaluation = evaluate(answers, rules);
  const decision = makeDecision(evaluation, DECISION_OPTIONS);
  const template = reports[decision.result];
  assert.ok(template, `No report template for result: ${decision.result}`);
  const report = generateReport(template, answers);
  return { evaluation, decision, report };
}

function baseHighAnswers(overrides = {}) {
  return {
    workerStatus: "worker",
    retirementStatus: "retired",
    continuousPeriod: "oneYearOrMore",
    fourWeekPrescribedHours: "15OrMore",
    continuityIssue: "none",
    workerType: "regular",
    ...overrides
  };
}

/* ---------------------------------------
   1. LOW 케이스
--------------------------------------- */

test("1. 근로자가 아닌 경우 -> LOW", () => {
  const { decision } = runPipeline(baseHighAnswers({ workerStatus: "notWorker" }));
  assert.equal(decision.result, "LOW");
});

test("2. 계속근로기간 1년 미만 -> LOW", () => {
  const { decision } = runPipeline(baseHighAnswers({ continuousPeriod: "under1Year" }));
  assert.equal(decision.result, "LOW");
});

test("3. 4주 평균 소정근로시간 15시간 미만 -> LOW", () => {
  const { decision } = runPipeline(baseHighAnswers({ fourWeekPrescribedHours: "under15" }));
  assert.equal(decision.result, "LOW");
});

/* ---------------------------------------
   2. REVIEW 케이스
--------------------------------------- */

test("4. 계속근로기간 unknown -> REVIEW", () => {
  const { decision } = runPipeline(baseHighAnswers({ continuousPeriod: "unknown" }));
  assert.equal(decision.result, "REVIEW");
});

test("5. 근로시간 unknown -> REVIEW", () => {
  const { decision } = runPipeline(baseHighAnswers({ fourWeekPrescribedHours: "unknown" }));
  assert.equal(decision.result, "REVIEW");
});

test("6. 근로시간 variable -> REVIEW", () => {
  const { decision, report } = runPipeline(baseHighAnswers({ fourWeekPrescribedHours: "variable" }));
  assert.equal(decision.result, "REVIEW");
  assert.ok(report.reasons.some(r => r.includes("4주 단위")));
});

test("7. 재입사/공백(breakOrReentry) -> REVIEW", () => {
  const { decision } = runPipeline(baseHighAnswers({ continuityIssue: "breakOrReentry" }));
  assert.equal(decision.result, "REVIEW");
});

test("8. 휴직/사업양도(leaveOrClosure) -> REVIEW", () => {
  const { decision } = runPipeline(baseHighAnswers({ continuityIssue: "leaveOrClosure" }));
  assert.equal(decision.result, "REVIEW");
});

test("9. 일용근로자(workerType=daily) -> REVIEW (LOW로 자동 배제되지 않음)", () => {
  const { decision } = runPipeline(baseHighAnswers({ workerType: "daily" }));
  assert.equal(decision.result, "REVIEW");
  assert.notEqual(decision.result, "LOW");
});

test("10. 증빙 확인 불가(daily + evidenceStatus=unknown) -> REVIEW, facts에 확인 자료 여부 반영", () => {
  const { decision, report } = runPipeline(baseHighAnswers({ workerType: "daily", evidenceStatus: "unknown" }));
  assert.equal(decision.result, "REVIEW");
  assert.ok(report.facts.some(f => f.label === "확인 자료 여부" && f.value === "없음"));
});

test("11. 퇴직 여부 unknown -> REVIEW", () => {
  const { decision } = runPipeline(baseHighAnswers({ retirementStatus: "unknown" }));
  assert.equal(decision.result, "REVIEW");
});

/* ---------------------------------------
   3. HIGH 케이스 + 경계값
--------------------------------------- */

test("12. 1년 이상 + 15시간 이상 + 근로자 + 이미 퇴직 -> HIGH", () => {
  const { decision } = runPipeline(baseHighAnswers({ retirementStatus: "retired" }));
  assert.equal(decision.result, "HIGH");
});

test("12b. 1년 이상 + 15시간 이상 + 근로자 + 퇴직 예정 -> HIGH", () => {
  const { decision } = runPipeline(baseHighAnswers({ retirementStatus: "planningToRetire" }));
  assert.equal(decision.result, "HIGH");
});

test("13. 경계값: continuousPeriod=oneYearOrMore(정확히 1년 포함, 배제되지 않음) -> HIGH", () => {
  const { decision } = runPipeline(baseHighAnswers({ continuousPeriod: "oneYearOrMore" }));
  assert.equal(decision.result, "HIGH");
});

test("14. 경계값: fourWeekPrescribedHours=15OrMore(정확히 15시간 포함, 배제되지 않음) -> HIGH", () => {
  const { decision } = runPipeline(baseHighAnswers({ fourWeekPrescribedHours: "15OrMore" }));
  assert.equal(decision.result, "HIGH");
});

test("HIGH 결과에는 calculatorLink가 ../../calc-retirement-pay.html 로 연결됨(사이트 내부 상대경로)", () => {
  const { report } = runPipeline(baseHighAnswers());
  assert.equal(report.calculatorLink, "../../calc-retirement-pay.html");
});

test("LOW/REVIEW 결과에는 calculatorLink가 없음(퇴직금 계산 로직 미중복 구현 확인)", () => {
  const low = runPipeline(baseHighAnswers({ continuousPeriod: "under1Year" }));
  const review = runPipeline(baseHighAnswers({ continuityIssue: "breakOrReentry" }));
  assert.equal(low.report.calculatorLink, null);
  assert.equal(review.report.calculatorLink, null);
});

/* ---------------------------------------
   4. 기타 (정상/누락/이상값/DEFAULT 안전망)
--------------------------------------- */

test("15. 모든 질문 정상 입력(HIGH 베이스라인)은 결정론적으로 동일 결과 반환", () => {
  const first = runPipeline(baseHighAnswers());
  const second = runPipeline(baseHighAnswers());
  assert.equal(first.decision.result, second.decision.result);
  assert.equal(first.decision.result, "HIGH");
});

test("16. 필수 입력 누락(빈 answers {}) -> 예외 없이 REVIEW(DEFAULT 안전망)", () => {
  const { decision, report } = runPipeline({});
  assert.equal(decision.result, "REVIEW");
  assert.ok(typeof report.title === "string" && report.title.length > 0);
});

test("17. 예상하지 못한 값 입력 -> 예외 없이 항상 문자열 result 반환", () => {
  const { decision } = runPipeline({
    workerStatus: "UNKNOWN_VALUE",
    retirementStatus: "UNKNOWN_VALUE",
    continuousPeriod: "UNKNOWN_VALUE",
    fourWeekPrescribedHours: "UNKNOWN_VALUE",
    continuityIssue: "UNKNOWN_VALUE",
    workerType: "UNKNOWN_VALUE"
  });
  assert.ok(typeof decision.result === "string" && decision.result.length > 0);
});

test("18. 어떤 규칙 조건에도 정확히 매칭되지 않는 입력 -> RPE-DEFAULT-01 매칭 -> REVIEW", () => {
  const { decision } = runPipeline({
    workerStatus: "worker",
    retirementStatus: "retired",
    continuousPeriod: "oneYearOrMore",
    fourWeekPrescribedHours: "15OrMore",
    continuityIssue: "NOT_A_REAL_VALUE"
  });
  assert.equal(decision.result, "REVIEW");
  assert.equal(decision.primaryRule, "RPE-DEFAULT-01");
});

/* ---------------------------------------
   5. Decision Table 우선순위 테스트 (REVIEW가 HIGH보다 우선)
--------------------------------------- */

test("우선순위: 근로자+1년이상+15시간이상 이지만 continuityIssue=unknown -> HIGH 아니라 REVIEW", () => {
  const { decision } = runPipeline({
    workerStatus: "worker",
    retirementStatus: "retired",
    continuousPeriod: "oneYearOrMore",
    fourWeekPrescribedHours: "15OrMore",
    continuityIssue: "unknown"
  });
  assert.equal(decision.result, "REVIEW");
  assert.notEqual(decision.result, "HIGH");
});

test("우선순위: 근로자+1년이상 이지만 15시간 미만 -> LOW", () => {
  const { decision } = runPipeline({
    workerStatus: "worker",
    retirementStatus: "retired",
    continuousPeriod: "oneYearOrMore",
    fourWeekPrescribedHours: "under15",
    continuityIssue: "unknown"
  });
  assert.equal(decision.result, "LOW");
});

test("우선순위: workerType=daily이면 다른 조건이 전부 HIGH 요건을 충족해도 REVIEW", () => {
  const { decision } = runPipeline(baseHighAnswers({ workerType: "daily" }));
  assert.equal(decision.result, "REVIEW");
});

test("reviewRequired: HIGH/LOW는 reviewRequired=false, REVIEW는 reviewRequired=true", () => {
  const high = runPipeline(baseHighAnswers());
  const low = runPipeline(baseHighAnswers({ continuousPeriod: "under1Year" }));
  const review = runPipeline(baseHighAnswers({ continuityIssue: "breakOrReentry" }));
  assert.equal(high.decision.reviewRequired, false);
  assert.equal(low.decision.reviewRequired, false);
  assert.equal(review.decision.reviewRequired, true);
});

/* ---------------------------------------
   6. 법적 표현 안전성
--------------------------------------- */

test("모든 결과 코드의 report 문구가 지정된 비확정적 표현 형태를 그대로 사용", () => {
  assert.ok(reports.HIGH.title.includes("가능성이 높습니다"));
  assert.ok(reports.LOW.title.includes("충족하지 않는 것으로 보입니다"));
  assert.ok(reports.REVIEW.title.includes("판단하기 어렵습니다"));
});

test("모든 결과 코드의 report 문구에 확정적 표현('반드시 지급'/'무조건 제외'/'확정')이 없음", () => {
  for (const code of Object.keys(reports)) {
    const template = reports[code];
    const text = `${template.title} ${template.summary}`;
    assert.ok(!text.includes("반드시 지급"));
    assert.ok(!text.includes("무조건 제외"));
    assert.ok(!text.includes("확정"));
  }
});

test("lawReferences는 act/article 필드를 모두 가짐", () => {
  const { report } = runPipeline(baseHighAnswers({ continuousPeriod: "under1Year" }));
  assert.ok(report.lawReferences.length > 0);
  for (const ref of report.lawReferences) {
    assert.ok(typeof ref.act === "string" && ref.act.length > 0);
    assert.ok(typeof ref.article === "string" && ref.article.length > 0);
  }
});

/* ---------------------------------------
   Summary
--------------------------------------- */

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
