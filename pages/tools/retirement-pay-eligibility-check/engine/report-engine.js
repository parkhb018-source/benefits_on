/* BenefitsON Law Engine - Report Engine v1.0.0 (퇴직금 지급 대상 자가진단)

   Pure function: same input -> same output.

   권리금 보호 자가진단/engine/report-engine.js와 동일한 패턴을 따른다:
   generateReport(template, answers)는 정적 결과 템플릿과 원본 answers만
   받는다. Rule Engine이 어떤 규칙으로 결과를 골랐는지는 받지 않고, reasons/
   lawReferences는 answers로부터 이 파일이 직접 다시 도출한다. 이렇게 하면
   케이스마다 인용이 정확해진다(결과 코드 하나에 뭉뚱그린 문구가 아니라).

   퇴직금 계산 로직은 이 파일에 두지 않는다. HIGH 결과의 calculatorLink는
   data/reports.json의 값(https://benefitson.org/pages/calc-retirement-pay)을
   그대로 통과시킬 뿐이다. */

const ACT_RPGL = "근로자퇴직급여 보장법";
const ACT_LSA = "근로기준법";

const FIELD_LABELS = {
  workerStatus: "근로자 여부",
  retirementStatus: "퇴직 여부",
  continuousPeriod: "계속근로기간(1년 기준)",
  fourWeekPrescribedHours: "4주 평균 소정근로시간(15시간 기준)",
  continuityIssue: "근로관계 단절·특이사항",
  workerType: "일용근로 여부",
  evidenceStatus: "확인 자료 여부"
};

const VALUE_LABELS = {
  workerStatus: { worker: "근로자", notWorker: "근로자 아님", unknown: "확인 안 됨" },
  retirementStatus: {
    retired: "이미 퇴직",
    planningToRetire: "퇴직 예정",
    stillWorking: "재직 중(퇴직 예정 없음)",
    unknown: "확인 안 됨"
  },
  continuousPeriod: { oneYearOrMore: "1년 이상", under1Year: "1년 미만", unknown: "확인 안 됨" },
  fourWeekPrescribedHours: {
    "15OrMore": "1주 평균 15시간 이상",
    under15: "1주 평균 15시간 미만",
    variable: "주별로 변동(4주 평균 필요)",
    unknown: "확인할 자료 없음"
  },
  continuityIssue: {
    none: "특별한 사정 없음",
    breakOrReentry: "퇴사 후 재입사·공백",
    leaveOrClosure: "휴직·휴업·사업주 변경",
    unknown: "확인 안 됨"
  },
  workerType: { regular: "일용 아님", daily: "일용·하루 단위 계약", unknown: "확인 안 됨" },
  evidenceStatus: { clear: "자료 있음", partial: "일부만 있음", unknown: "없음" }
};

function formatValue(fieldId, rawValue) {

  const labelMap = VALUE_LABELS[fieldId];

  if (labelMap && rawValue in labelMap) {
    return labelMap[rawValue];
  }

  return rawValue ?? "-";

}

function buildFacts(answers) {

  return Object.keys(FIELD_LABELS)
    .filter(fieldId => answers[fieldId] !== undefined)
    .map(fieldId => ({
      label: FIELD_LABELS[fieldId],
      value: formatValue(fieldId, answers[fieldId])
    }));

}

function law(act, article) {
  return { act, article };
}

/* Re-derives precise reasons + lawReferences directly from answers.
   Mirrors data/rules.json's conditions for display purposes only - it
   does not make the decision, it explains it. */
function deriveLegalExplanation(answers) {

  const reasons = [];
  const lawReferences = [];

  const addLaw = (act, article) => {
    if (!lawReferences.some(entry => entry.act === act && entry.article === article)) {
      lawReferences.push(law(act, article));
    }
  };

  if (answers.workerStatus === "notWorker") {
    reasons.push(
      "근로기준법상 근로자에 해당하지 않는 것으로 입력하셨습니다. " +
      "근로자퇴직급여 보장법은 근로자에 해당하는 것을 전제로 적용됩니다."
    );
    addLaw(ACT_RPGL, "제2조제1호");
    addLaw(ACT_LSA, "제2조제1항제1호");
  }

  if (answers.workerStatus === "unknown") {
    reasons.push(
      "근로자에 해당하는지 여부가 확인되지 않았습니다. 계약 형식상 이름보다 " +
      "실제 업무 지시·감독, 임금 지급 관계가 근로자성 판단에서 중요합니다."
    );
  }

  if (answers.continuousPeriod === "under1Year") {
    reasons.push("같은 사용자와의 계속근로기간이 1년 미만인 것으로 입력하셨습니다.");
    addLaw(ACT_RPGL, "제4조제1항");
  }

  if (answers.continuousPeriod === "unknown") {
    reasons.push(
      "계속근로기간이 1년 이상인지 확인되지 않았습니다. 입사일, 재입사·공백 " +
      "여부를 함께 확인해야 정확한 판단이 가능합니다."
    );
    addLaw(ACT_RPGL, "제4조제1항");
  }

  if (answers.fourWeekPrescribedHours === "under15") {
    reasons.push("4주 평균 1주 소정근로시간이 15시간 미만인 것으로 입력하셨습니다.");
    addLaw(ACT_RPGL, "제4조제1항");
    addLaw(ACT_LSA, "제18조제3항");
  }

  if (answers.fourWeekPrescribedHours === "unknown") {
    reasons.push(
      "소정근로시간 또는 4주 평균 계산에 필요한 자료가 확인되지 않았습니다. " +
      "근로계약서·근무표를 통해 실제 시간이 아닌 정해진(소정) 근로시간을 확인해야 합니다."
    );
    addLaw(ACT_LSA, "제18조제3항");
  }

  if (answers.fourWeekPrescribedHours === "variable") {
    reasons.push(
      "주별 소정근로시간이 반복적으로 달라 4주 단위로 평균해서 산정해야 하는 " +
      "것으로 확인되었습니다. 퇴직일 기준 직전 4주 단위로 역산해 15시간 이상/미만 " +
      "구간을 나누어 계산해야 합니다."
    );
    addLaw(ACT_LSA, "제18조제3항");
  }

  if (answers.continuityIssue === "breakOrReentry") {
    reasons.push(
      "퇴사 후 재입사 또는 공백 기간이 있는 것으로 확인되었습니다. 계약 체결 " +
      "동기·목적과 공백 기간의 길이에 따라 계속근로기간 합산 여부가 달라질 수 있습니다."
    );
    addLaw(ACT_RPGL, "제4조제1항");
  }

  if (answers.continuityIssue === "leaveOrClosure") {
    reasons.push(
      "휴직·휴업 또는 사업주 변경(영업양도 등)이 있는 것으로 확인되었습니다. " +
      "휴직 사유와 영업양도 여부(포괄승계 vs 자산매각)에 따라 계속근로기간 산입 " +
      "여부가 달라질 수 있습니다."
    );
    addLaw(ACT_RPGL, "제4조제1항");
  }

  if (answers.continuityIssue === "unknown") {
    reasons.push("근로관계의 단절 여부나 특이사항이 확인되지 않았습니다.");
  }

  if (answers.workerType === "daily") {
    reasons.push(
      "일용·하루 단위 계약으로 근무한 것으로 입력하셨습니다. 명칭만으로 " +
      "퇴직금 대상에서 제외되지 않으며, 실제 근로관계의 계속성이 쟁점입니다."
    );
    addLaw(ACT_RPGL, "제4조제1항");
  }

  if (answers.retirementStatus === "stillWorking") {
    reasons.push(
      "아직 재직 중이고 퇴직 예정이 없는 것으로 입력하셨습니다. 퇴직금 지급사유는 " +
      "실제 퇴직 시점에 발생하므로, 현재는 요건 충족 가능성만 예상할 수 있습니다."
    );
    addLaw(ACT_RPGL, "제4조");
    addLaw(ACT_RPGL, "제9조");
  }

  if (answers.retirementStatus === "unknown") {
    reasons.push("퇴직 여부 또는 퇴직 예정 여부가 확인되지 않았습니다.");
  }

  const meetsCoreRequirements =
    answers.workerStatus === "worker" &&
    (answers.retirementStatus === "retired" || answers.retirementStatus === "planningToRetire") &&
    answers.continuousPeriod === "oneYearOrMore" &&
    answers.fourWeekPrescribedHours === "15OrMore" &&
    answers.continuityIssue === "none";

  if (meetsCoreRequirements) {
    reasons.push(
      "근로자, 퇴직(예정), 계속근로기간 1년 이상, 4주 평균 소정근로시간 15시간 " +
      "이상 요건을 입력하신 내용상 모두 충족하는 것으로 확인되었습니다."
    );
    addLaw(ACT_RPGL, "제4조제1항");
    addLaw(ACT_RPGL, "제8조제1항");
  }

  return { reasons, lawReferences };

}

export function generateReport(template, answers) {

  const derived = deriveLegalExplanation(answers);

  return {
    title: template.title ?? "",
    summary: template.summary ?? "",
    level: template.level ?? "INFO",
    icon: template.icon ?? "info",
    facts: buildFacts(answers),
    reasons: derived.reasons.length > 0 ? derived.reasons : (template.reasons ?? []),
    lawReferences: derived.lawReferences.length > 0 ? derived.lawReferences : (template.lawReferences ?? []),
    recommendations: template.recommendations ?? [],
    calculatorLink: template.calculatorLink ?? null,
    disclaimer: template.disclaimer ?? ""
  };

}
