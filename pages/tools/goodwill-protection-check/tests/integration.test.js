/* BenefitsON Law Engine - Integration Test
   Verifies the real 상가건물 임대차보호법 Decision Table wired through
   Flow Engine -> Rule Engine -> Decision Engine -> Report Engine,
   exactly as app.js calls them. */

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

console.log("BenefitsON Law Engine - Integration Test (상가건물 임대차보호법)\n");

const questionsData = loadJSON("questions.json");
const flowData = loadJSON("flow.json");
const rulesData = loadJSON("rules.json");
const reportsData = loadJSON("reports.json");

const questions = questionsData.questions ?? questionsData;
const rules = rulesData.rules ?? rulesData;
const reports = reportsData.reports ?? reportsData;

/* ---------------------------------------
   0. 파일 로딩 / 배선
--------------------------------------- */

test("questions.json / flow.json / rules.json / reports.json 로딩", () => {
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

test("flow engine: contractStatus=active면 afterThreeYears 질문 스킵", () => {
  const flow = createFlowEngine(questions, flowData);
  const visible = flow.getVisibleQuestions({ contractStatus: "active" });
  assert.ok(!visible.some(q => q.id === "afterThreeYears"));
});

test("flow engine: contractStatus=ended면 afterThreeYears 질문 노출", () => {
  const flow = createFlowEngine(questions, flowData);
  const visible = flow.getVisibleQuestions({ contractStatus: "ended" });
  assert.ok(visible.some(q => q.id === "afterThreeYears"));
});

/* ---------------------------------------
   Helper: run full pipeline
--------------------------------------- */

function runPipeline(answers) {
  const evaluation = evaluate(answers, rules);
  const decision = makeDecision(evaluation);
  const template = reports[decision.result];
  assert.ok(template, `No report template for result: ${decision.result}`);
  const report = generateReport(template, answers);
  return { evaluation, decision, report };
}

function baseAnswers(overrides = {}) {
  return {
    contractStatus: "active",
    contractYears: "under10",
    rentDefault: "no",
    tenantBreachGrounds: ["none"],
    eligibleBuilding: "none",
    newTenant: "yes",
    interference: ["demandOrTakeKeyMoney"],
    landlordJustification: ["none"],
    interferencePeriod: "yes",
    afterThreeYears: "notApplicable",
    ...overrides
  };
}

/* ---------------------------------------
   1. 적용 제외 대상 (제10조의5)
--------------------------------------- */

test("제10조의5제1호: 대규모점포 -> R3, lawReferences에 제10조의5제1호 포함", () => {
  const { decision, report } = runPipeline(baseAnswers({ eligibleBuilding: "largeScale" }));
  assert.equal(decision.result, "R3");
  assert.ok(report.lawReferences.some(r => r.article === "제10조의5제1호"));
});

test("제10조의5제2호: 국유재산·공유재산 -> R3, lawReferences에 제10조의5제2호 포함", () => {
  const { decision, report } = runPipeline(baseAnswers({ eligibleBuilding: "publicProperty" }));
  assert.equal(decision.result, "R3");
  assert.ok(report.lawReferences.some(r => r.article === "제10조의5제2호"));
});

test("적용 제외 대상 아님(eligibleBuilding=none) -> R3로 배제되지 않음", () => {
  const { decision } = runPipeline(baseAnswers({ eligibleBuilding: "none" }));
  assert.notEqual(decision.result, "R3");
});

/* ---------------------------------------
   2. 제10조의4 제1항 방해행위 4개 유형
--------------------------------------- */

test("제1항제1호: 권리금 요구·수수 -> R1, lawReferences에 제10조의4제1항제1호", () => {
  const { decision, report } = runPipeline(baseAnswers({ interference: ["demandOrTakeKeyMoney"] }));
  assert.equal(decision.result, "R1");
  assert.ok(report.lawReferences.some(r => r.article === "제10조의4제1항제1호"));
});

test("제1항제2호: 권리금 지급 방해 -> R1, lawReferences에 제10조의4제1항제2호", () => {
  const { decision, report } = runPipeline(baseAnswers({ interference: ["blockKeyMoneyPayment"] }));
  assert.equal(decision.result, "R1");
  assert.ok(report.lawReferences.some(r => r.article === "제10조의4제1항제2호"));
});

test("제1항제3호: 현저히 고액의 차임·보증금 요구 -> R1, lawReferences에 제10조의4제1항제3호", () => {
  const { decision, report } = runPipeline(baseAnswers({ interference: ["excessiveRentDemand"] }));
  assert.equal(decision.result, "R1");
  assert.ok(report.lawReferences.some(r => r.article === "제10조의4제1항제3호"));
});

test("제1항제4호: 정당한 사유 없는 거절 (landlordJustification=none) -> R1, lawReferences에 제10조의4제1항제4호", () => {
  const { decision, report } = runPipeline(baseAnswers({
    interference: ["refuseWithoutReason"],
    landlordJustification: ["none"]
  }));
  assert.equal(decision.result, "R1");
  assert.ok(report.lawReferences.some(r => r.article === "제10조의4제1항제4호"));
});

/* ---------------------------------------
   3. 제10조의4 제2항 정당한 사유 4개 유형
--------------------------------------- */

test("제2항제1호: 신규임차인 지급자력 없음 -> R6(reviewRequired), 제10조의4제2항제1호", () => {
  const { decision, report } = runPipeline(baseAnswers({
    interference: ["refuseWithoutReason"],
    landlordJustification: ["noAbility"]
  }));
  assert.equal(decision.result, "R6");
  assert.equal(decision.reviewRequired, true);
  assert.ok(report.lawReferences.some(r => r.article === "제10조의4제2항제1호"));
});

test("제2항제2호: 신규임차인 부적격 -> R6(reviewRequired), 제10조의4제2항제2호", () => {
  const { decision, report } = runPipeline(baseAnswers({
    interference: ["refuseWithoutReason"],
    landlordJustification: ["tenantUnsuitable"]
  }));
  assert.equal(decision.result, "R6");
  assert.equal(decision.reviewRequired, true);
  assert.ok(report.lawReferences.some(r => r.article === "제10조의4제2항제2호"));
});

test("제2항제3호: 1년 6개월 이상 비영리 사용 계획 -> R6(reviewRequired), 제10조의4제2항제3호", () => {
  const { decision, report } = runPipeline(baseAnswers({
    interference: ["refuseWithoutReason"],
    landlordJustification: ["vacancyOverEighteenMonths"]
  }));
  assert.equal(decision.result, "R6");
  assert.equal(decision.reviewRequired, true);
  assert.ok(report.lawReferences.some(r => r.article === "제10조의4제2항제3호"));
});

test("제2항제4호: 임대인이 이미 권리금 지급 -> R6(reviewRequired), 제10조의4제2항제4호", () => {
  const { decision, report } = runPipeline(baseAnswers({
    interference: ["refuseWithoutReason"],
    landlordJustification: ["keyMoneyAlreadyPaid"]
  }));
  assert.equal(decision.result, "R6");
  assert.equal(decision.reviewRequired, true);
  assert.ok(report.lawReferences.some(r => r.article === "제10조의4제2항제4호"));
});

/* ---------------------------------------
   4. 6개월 보호기간
--------------------------------------- */

test("보호기간 밖(interferencePeriod=no) -> R6, R1로 자동 인정되지 않음", () => {
  const { decision } = runPipeline(baseAnswers({ interferencePeriod: "no" }));
  assert.equal(decision.result, "R6");
});

test("방해행위 없음(interference=[none]) -> R5", () => {
  const { decision } = runPipeline(baseAnswers({
    interference: ["none"],
    landlordJustification: ["none"],
    interferencePeriod: "notApplicable"
  }));
  assert.equal(decision.result, "R5");
});

/* ---------------------------------------
   5. 3년 소멸시효 (제10조의4제4항)
--------------------------------------- */

test("계약 종료 + 3년 경과 -> R4, lawReferences에 제10조의4제4항", () => {
  const { decision, report } = runPipeline(baseAnswers({
    contractStatus: "ended",
    afterThreeYears: "yes"
  }));
  assert.equal(decision.result, "R4");
  assert.ok(report.lawReferences.some(r => r.article === "제10조의4제4항"));
});

test("계약 종료 + 3년 미경과 -> R4로 배제되지 않고 방해행위 판단으로 진행", () => {
  const { decision } = runPipeline(baseAnswers({
    contractStatus: "ended",
    afterThreeYears: "no"
  }));
  assert.equal(decision.result, "R1");
});

/* ---------------------------------------
   6. 10년 초과 임대차기간을 이유로 단순 배제하지 않음
--------------------------------------- */

test("계약기간 10년 초과해도 방해행위 성립 시 R1 (10년 제한으로 배제되지 않음)", () => {
  const under10 = runPipeline(baseAnswers({ contractYears: "under10" }));
  const over10 = runPipeline(baseAnswers({ contractYears: "over10" }));
  assert.equal(under10.decision.result, "R1");
  assert.equal(over10.decision.result, "R1");
});

test("10년 초과 시 갱신요구권(제10조제2항)과 별개라는 안내 문구가 reasons에 포함됨", () => {
  const { report } = runPipeline(baseAnswers({ contractYears: "over10" }));
  assert.ok(report.reasons.some(r => r.includes("계약갱신요구권")));
  assert.ok(report.lawReferences.some(r => r.article === "제10조제2항"));
});

/* ---------------------------------------
   7. 3기 차임 연체 (제10조제1항제1호 / 제10조의4제1항 단서)
--------------------------------------- */

test("3기 차임 연체 -> R3, lawReferences에 제10조제1항제1호 및 제10조의4제1항", () => {
  const { decision, report } = runPipeline(baseAnswers({ rentDefault: "yes" }));
  assert.equal(decision.result, "R3");
  assert.ok(report.lawReferences.some(r => r.article === "제10조제1항제1호"));
  assert.ok(report.lawReferences.some(r => r.article === "제10조의4제1항"));
});

/* ---------------------------------------
   8. 복수 Rule 동시 매칭
--------------------------------------- */

test("복수 방해행위 유형 동시 선택 -> R1 유지, 각 유형이 reasons에 모두 반영됨", () => {
  const { decision, report } = runPipeline(baseAnswers({
    interference: ["demandOrTakeKeyMoney", "excessiveRentDemand"]
  }));
  assert.equal(decision.result, "R1");
  assert.ok(report.lawReferences.some(r => r.article === "제10조의4제1항제1호"));
  assert.ok(report.lawReferences.some(r => r.article === "제10조의4제1항제3호"));
});

test("제외 사유(대규모점포) + 차임연체 동시 해당 -> 여전히 R3 (충돌 없이 안전한 방향으로 수렴)", () => {
  const { decision } = runPipeline(baseAnswers({
    eligibleBuilding: "largeScale",
    rentDefault: "yes"
  }));
  assert.equal(decision.result, "R3");
});

test("실질적 방해행위(1호)와 정당화된 거절(4호+사유)이 함께 있으면 R1이 우선 (진짜 위반이 있으면 정당화된 거절 유무와 무관하게 보호 가능)", () => {
  const { decision, evaluation } = runPipeline(baseAnswers({
    interference: ["demandOrTakeKeyMoney", "refuseWithoutReason"],
    landlordJustification: ["noAbility"]
  }));
  assert.equal(decision.result, "R1");
  assert.ok(evaluation.matches.some(m => m.reasonCode === "INTERFERENCE_TYPE1_KEYMONEY_DEMAND"));
});

/* ---------------------------------------
   9. reviewRequired 처리
--------------------------------------- */

test("객관적으로 명확한 사유(방해행위 확정, HIGH severity)는 reviewRequired=false", () => {
  const { decision } = runPipeline(baseAnswers({ interference: ["demandOrTakeKeyMoney"] }));
  assert.equal(decision.reviewRequired, false);
});

test("해석이 필요한 정당한 사유 판단(MEDIUM severity)은 reviewRequired=true", () => {
  const { decision } = runPipeline(baseAnswers({
    interference: ["refuseWithoutReason"],
    landlordJustification: ["noAbility"]
  }));
  assert.equal(decision.reviewRequired, true);
});

test("정보 부족(newTenant=no)은 reviewRequired=true", () => {
  const { decision } = runPipeline(baseAnswers({
    newTenant: "no",
    interference: [],
    landlordJustification: ["none"],
    interferencePeriod: "notApplicable"
  }));
  assert.equal(decision.result, "R2");
  assert.equal(decision.reviewRequired, true);
});

/* ---------------------------------------
   10. lawReferences 표시 / 결과 문구의 비확정적 표현
--------------------------------------- */

test("모든 결과 코드의 report 문구가 확정적 표현('보호된다'/'보호되지 않는다')을 쓰지 않음", () => {
  for (const code of Object.keys(reports)) {
    const template = reports[code];
    const text = `${template.title} ${template.summary}`;
    assert.ok(!text.includes("법적으로 보호된다"));
    assert.ok(!text.includes("법적으로 보호되지 않는다"));
  }
});

test("결과 화면에 표시될 lawReferences는 act/article 필드를 모두 가짐", () => {
  const { report } = runPipeline(baseAnswers({ interference: ["blockKeyMoneyPayment"] }));
  assert.ok(report.lawReferences.length > 0);
  for (const ref of report.lawReferences) {
    assert.ok(typeof ref.act === "string" && ref.act.length > 0);
    assert.ok(typeof ref.article === "string" && ref.article.length > 0);
  }
});

/* ---------------------------------------
   11. 안전성: 알 수 없는 값 / 빈 입력에도 예외 없이 동작
--------------------------------------- */

test("빈 answers 객체도 예외 없이 항상 결과를 반환", () => {
  const { decision, report } = runPipeline({});
  assert.ok(typeof decision.result === "string");
  assert.ok(typeof report.title === "string" && report.title.length > 0);
});

test("알 수 없는 값이 섞여도 예외 없이 항상 결과를 반환", () => {
  const { decision } = runPipeline({
    contractStatus: "UNKNOWN",
    eligibleBuilding: "UNKNOWN",
    interference: ["UNKNOWN"],
    landlordJustification: ["UNKNOWN"],
    interferencePeriod: "UNKNOWN"
  });
  assert.ok(typeof decision.result === "string" && decision.result.length > 0);
});

/* ---------------------------------------
   12. 제10조제1항 나머지 7개 갱신거절 사유
   (1호=rentDefault는 기존 테스트에서 이미 검증됨)
   -> 제10조의4제1항 단서를 통해 동일하게 R3로 연결되는지 확인
--------------------------------------- */

const tenantBreachCases = [
  { value: "fraudulentLease", law: "제10조제1항제2호", expectReview: true },
  { value: "compensationAgreed", law: "제10조제1항제3호", expectReview: true },
  { value: "unauthorizedSublease", law: "제10조제1항제4호", expectReview: false },
  { value: "willfulDamage", law: "제10조제1항제5호", expectReview: true },
  { value: "totalLossOfPurpose", law: "제10조제1항제6호", expectReview: true },
  { value: "demolitionNoticedPlan", law: "제10조제1항제7호가목", expectReview: true },
  { value: "demolitionSafetyRisk", law: "제10조제1항제7호나목", expectReview: true },
  { value: "demolitionByOtherLaw", law: "제10조제1항제7호다목", expectReview: false },
  { value: "severeBreachOrDifficult", law: "제10조제1항제8호", expectReview: true }
];

for (const testCase of tenantBreachCases) {

  test(`${testCase.law}: tenantBreachGrounds=${testCase.value} -> R3, lawReferences에 ${testCase.law} 및 제10조의4제1항 포함`, () => {
    const { decision, report } = runPipeline(baseAnswers({ tenantBreachGrounds: [testCase.value] }));
    assert.equal(decision.result, "R3");
    assert.ok(report.lawReferences.some(r => r.article === testCase.law));
    assert.ok(report.lawReferences.some(r => r.article === "제10조의4제1항"));
    assert.equal(decision.reviewRequired, testCase.expectReview);
  });

}

test("tenantBreachGrounds=none이면 R3로 배제되지 않음 (다른 위반 유형과 혼동되지 않음)", () => {
  const { decision } = runPipeline(baseAnswers({ tenantBreachGrounds: ["none"] }));
  assert.equal(decision.result, "R1");
});

test("tenantBreachGrounds 미제공(undefined)이어도 예외 없이 동작 (기존 33개 테스트 호환성)", () => {
  const answers = baseAnswers();
  delete answers.tenantBreachGrounds;
  const { decision } = runPipeline(answers);
  assert.equal(decision.result, "R1");
});

test("복수의 제10조제1항 사유 동시 선택 -> 여전히 R3, 각 사유가 reasons에 모두 반영됨", () => {
  const { decision, report } = runPipeline(baseAnswers({
    tenantBreachGrounds: ["unauthorizedSublease", "willfulDamage"]
  }));
  assert.equal(decision.result, "R3");
  assert.ok(report.lawReferences.some(r => r.article === "제10조제1항제4호"));
  assert.ok(report.lawReferences.some(r => r.article === "제10조제1항제5호"));
});

test("건물 유형 제외(제10조의5) + 제10조제1항 사유 동시 해당 -> 여전히 R3로 안전하게 수렴", () => {
  const { decision } = runPipeline(baseAnswers({
    eligibleBuilding: "largeScale",
    tenantBreachGrounds: ["unauthorizedSublease"]
  }));
  assert.equal(decision.result, "R3");
});

test("flow engine: 새 질문 tenantBreachGrounds가 order에 포함됨", () => {
  const flow = createFlowEngine(questions, flowData);
  const visible = flow.getVisibleQuestions({});
  assert.ok(visible.some(q => q.id === "tenantBreachGrounds"));
});

test("facts에 '그 밖의 갱신거절 사유' 항목이 표시됨", () => {
  const { report } = runPipeline(baseAnswers({ tenantBreachGrounds: ["unauthorizedSublease"] }));
  assert.ok(report.facts.some(f => f.label.includes("갱신거절 사유")));
});

/* ---------------------------------------
   Summary
--------------------------------------- */

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
