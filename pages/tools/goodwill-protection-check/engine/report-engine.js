/* BenefitsON Law Engine - Report Engine v1.1.0
   Pure function: same input -> same output.

   generateReport(template, answers) only receives the static per-result
   template plus the raw answers (frozen signature - see app.js). It does
   NOT receive the Rule Engine's matched rules, so the specific "reasons"
   and "lawReferences" (which law provision applies to THIS user's
   answers) are re-derived here directly from answers, independently of
   which rule the Decision Engine used to pick the result code. This
   keeps citations accurate per-case instead of one generic blurb per
   result code. */

const ACT = "상가건물 임대차보호법";

const FIELD_LABELS = {
  contractStatus: "임대차 계약 상태",
  contractYears: "총 임대차 기간",
  rentDefault: "3기 차임 연체 여부",
  tenantBreachGrounds: "그 밖의 갱신거절 사유(제10조제1항제2호~제8호) 해당 여부",
  eligibleBuilding: "적용 제외 대상(제10조의5) 해당 여부",
  newTenant: "신규임차인 주선 여부",
  interference: "임대인의 방해행위(제10조의4제1항)",
  landlordJustification: "임대인이 제시한 거절 사유(제10조의4제2항)",
  interferencePeriod: "보호기간(종료 6개월 전~종료 시) 내 발생 여부",
  afterThreeYears: "계약 종료 후 3년 경과 여부"
};

const VALUE_LABELS = {
  contractStatus: { active: "계약 진행 중", ended: "계약 종료" },
  contractYears: { under10: "10년 이하", over10: "10년 초과" },
  rentDefault: { yes: "있음", no: "없음" },
  eligibleBuilding: {
    none: "해당 없음",
    largeScale: "대규모점포·준대규모점포(전통시장 제외)",
    publicProperty: "국유재산·공유재산"
  },
  newTenant: { yes: "있음", no: "없음" },
  interferencePeriod: { yes: "예", no: "아니요", notApplicable: "해당 없음" },
  afterThreeYears: { yes: "예", no: "아니요", notApplicable: "해당 없음" }
};

const INTERFERENCE_LABELS = {
  none: "해당 없음",
  demandOrTakeKeyMoney: "권리금 요구·수수 (제1항제1호)",
  blockKeyMoneyPayment: "신규임차인의 권리금 지급 방해 (제1항제2호)",
  excessiveRentDemand: "현저히 고액의 차임·보증금 요구 (제1항제3호)",
  refuseWithoutReason: "정당한 사유 없는 계약체결 거절 (제1항제4호)"
};

const TENANT_BREACH_LABELS = {
  none: "해당 없음",
  fraudulentLease: "거짓·부정한 방법으로 임차 (제1항제2호)",
  compensationAgreed: "상당한 보상 합의 (제1항제3호)",
  unauthorizedSublease: "무단 전대 (제1항제4호)",
  willfulDamage: "고의·중과실 파손 (제1항제5호)",
  totalLossOfPurpose: "건물 멸실로 목적 달성 불가 (제1항제6호)",
  demolitionNoticedPlan: "철거·재건축 계획 사전 고지 (제1항제7호가목)",
  demolitionSafetyRisk: "노후·안전사고 우려로 철거·재건축 필요 (제1항제7호나목)",
  demolitionByOtherLaw: "다른 법령에 따른 철거·재건축 (제1항제7호다목)",
  severeBreachOrDifficult: "그 밖의 현저한 의무위반·중대사유 (제1항제8호)"
};

const JUSTIFICATION_LABELS = {
  none: "해당 없음",
  noAbility: "신규임차인의 지급자력 없음 (제2항제1호)",
  tenantUnsuitable: "신규임차인의 의무위반 우려 등 (제2항제2호)",
  vacancyOverEighteenMonths: "1년 6개월 이상 비영리 사용 계획 (제2항제3호)",
  keyMoneyAlreadyPaid: "임대인이 이미 권리금을 지급함 (제2항제4호)"
};

function formatValue(fieldId, rawValue) {

  if (fieldId === "interference") {
    if (!Array.isArray(rawValue) || rawValue.length === 0) {
      return "해당 없음";
    }
    return rawValue.map(value => INTERFERENCE_LABELS[value] ?? value).join(", ");
  }

  if (fieldId === "landlordJustification") {
    if (!Array.isArray(rawValue) || rawValue.length === 0) {
      return "해당 없음";
    }
    return rawValue.map(value => JUSTIFICATION_LABELS[value] ?? value).join(", ");
  }

  if (fieldId === "tenantBreachGrounds") {
    if (!Array.isArray(rawValue) || rawValue.length === 0) {
      return "해당 없음";
    }
    return rawValue.map(value => TENANT_BREACH_LABELS[value] ?? value).join(", ");
  }

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

function law(article) {
  return { act: ACT, article };
}

/* Re-derives precise reasons + lawReferences directly from answers.
   Mirrors data/rules.json's conditions for display purposes only -
   it does not make the decision, it explains it. */
function deriveLegalExplanation(answers) {

  const reasons = [];
  const lawReferences = [];

  const addLaw = article => {
    if (!lawReferences.some(entry => entry.article === article)) {
      lawReferences.push(law(article));
    }
  };

  if (answers.eligibleBuilding === "largeScale") {
    reasons.push(
      "임차 중인 상가건물이 대규모점포 또는 준대규모점포의 일부에 해당하는 것으로 입력하셨습니다. " +
      "전통시장 안에 있는 경우는 예외적으로 적용 대상이 될 수 있습니다."
    );
    addLaw("제10조의5제1호");
  }

  if (answers.eligibleBuilding === "publicProperty") {
    reasons.push("임차 중인 상가건물이 국유재산 또는 공유재산에 해당하는 것으로 입력하셨습니다.");
    addLaw("제10조의5제2호");
  }

  if (answers.rentDefault === "yes") {
    reasons.push(
      "3기의 차임액에 해당하는 금액을 연체한 사실이 있는 것으로 입력하셨습니다. " +
      "이는 임대인이 계약갱신을 거절할 수 있는 사유이며, 권리금 회수기회 보호 규정(제10조의4제1항 단서)의 " +
      "적용 여부를 판단할 때 함께 고려됩니다."
    );
    addLaw("제10조제1항제1호");
    addLaw("제10조의4제1항");
  }

  const tenantBreachGrounds = Array.isArray(answers.tenantBreachGrounds) ? answers.tenantBreachGrounds : [];

  const TENANT_BREACH_EXPLANATIONS = {
    fraudulentLease: {
      text: "거짓이나 그 밖의 부정한 방법으로 임차한 사실이 있는 것으로 입력하셨습니다.",
      law: "제10조제1항제2호"
    },
    compensationAgreed: {
      text: "임대인과 합의하여 상당한 보상을 제공받기로 한 것으로 입력하셨습니다.",
      law: "제10조제1항제3호"
    },
    unauthorizedSublease: {
      text: "임대인의 동의 없이 건물의 전부 또는 일부를 전대한 것으로 입력하셨습니다.",
      law: "제10조제1항제4호"
    },
    willfulDamage: {
      text: "고의나 중대한 과실로 건물을 파손한 것으로 입력하셨습니다.",
      law: "제10조제1항제5호"
    },
    totalLossOfPurpose: {
      text: "건물의 전부 또는 일부가 멸실되어 임대차 목적을 달성할 수 없는 것으로 입력하셨습니다.",
      law: "제10조제1항제6호"
    },
    demolitionNoticedPlan: {
      text: "계약체결 당시 임대인이 철거·재건축 계획을 구체적으로 고지했고 그 계획에 따르는 것으로 입력하셨습니다.",
      law: "제10조제1항제7호가목"
    },
    demolitionSafetyRisk: {
      text: "건물의 노후·훼손 등으로 안전사고 우려가 있어 철거·재건축이 필요한 것으로 입력하셨습니다.",
      law: "제10조제1항제7호나목"
    },
    demolitionByOtherLaw: {
      text: "다른 법령에 따라 철거 또는 재건축이 이루어지는 것으로 입력하셨습니다.",
      law: "제10조제1항제7호다목"
    },
    severeBreachOrDifficult: {
      text: "그 밖에 임차인으로서의 의무를 현저히 위반했거나 임대차를 계속하기 어려운 중대한 사유가 있는 것으로 입력하셨습니다.",
      law: "제10조제1항제8호"
    }
  };

  for (const ground of tenantBreachGrounds) {

    const explanation = TENANT_BREACH_EXPLANATIONS[ground];

    if (!explanation) {
      continue;
    }

    reasons.push(
      `${explanation.text} 이는 임대인이 계약갱신을 거절할 수 있는 사유이며, 권리금 회수기회 보호 규정` +
      "(제10조의4제1항 단서)의 적용 여부를 판단할 때 함께 고려됩니다."
    );
    addLaw(explanation.law);
    addLaw("제10조의4제1항");

  }

  if (answers.newTenant === "no") {
    reasons.push(
      "권리금을 지급받기 위한 신규임차인 주선 사실이 아직 확인되지 않아, " +
      "권리금 회수기회 방해 여부를 판단하기에는 아직 이릅니다."
    );
  }

  const interference = Array.isArray(answers.interference) ? answers.interference : [];
  const hasReportedInterference = interference.some(value => value !== "none");

  if (answers.newTenant !== "no") {

    if (!hasReportedInterference) {

      reasons.push("선택하신 항목 중 임대인의 방해행위(제10조의4제1항 각 호)에 해당하는 사항이 없습니다.");

    } else if (answers.interferencePeriod === "no") {

      reasons.push(
        "입력하신 상황은 보호기간(임대차기간이 끝나기 6개월 전부터 임대차가 종료될 때까지)이 아닌 " +
        "시점에 발생한 것으로 확인되어, 제10조의4의 적용 여부에 대한 별도 검토가 필요합니다."
      );
      addLaw("제10조의4제1항");

    } else if (answers.interferencePeriod === "yes") {

      if (interference.includes("demandOrTakeKeyMoney")) {
        reasons.push("임대인이 신규임차인이 되려는 자에게 권리금을 요구하거나 직접 수수한 것으로 입력하셨습니다.");
        addLaw("제10조의4제1항제1호");
      }

      if (interference.includes("blockKeyMoneyPayment")) {
        reasons.push("신규임차인이 되려는 자가 임차인에게 권리금을 지급하지 못하도록 방해받은 것으로 입력하셨습니다.");
        addLaw("제10조의4제1항제2호");
      }

      if (interference.includes("excessiveRentDemand")) {
        reasons.push("임대인이 신규임차인이 되려는 자에게 현저히 고액의 차임과 보증금을 요구한 것으로 입력하셨습니다.");
        addLaw("제10조의4제1항제3호");
      }

      if (interference.includes("refuseWithoutReason")) {

        const justification = Array.isArray(answers.landlordJustification) ? answers.landlordJustification : [];
        const hasJustification = justification.some(value => value !== "none");

        if (!hasJustification) {

          reasons.push("임대인이 정당한 사유 없이 신규임차인과의 계약체결을 거절한 것으로 입력하셨습니다.");
          addLaw("제10조의4제1항제4호");

        } else {

          if (justification.includes("noAbility")) {
            reasons.push(
              "신규임차인이 보증금 또는 차임을 지급할 자력이 없다는 이유로 거절하신 것으로 입력하셨습니다. " +
              "이는 임대인의 정당한 사유로 인정될 수 있는 사유 중 하나입니다."
            );
            addLaw("제10조의4제2항제1호");
          }

          if (justification.includes("tenantUnsuitable")) {
            reasons.push(
              "신규임차인이 임차인으로서의 의무를 위반할 우려가 있거나 임대차 유지가 어렵다는 이유로 " +
              "거절하신 것으로 입력하셨습니다. 이는 임대인의 정당한 사유로 인정될 수 있는 사유 중 하나입니다."
            );
            addLaw("제10조의4제2항제2호");
          }

          if (justification.includes("vacancyOverEighteenMonths")) {
            reasons.push(
              "상가건물을 1년 6개월 이상 영리목적으로 사용하지 않을 계획이라는 이유로 거절하신 것으로 " +
              "입력하셨습니다. 이는 임대인의 정당한 사유로 인정될 수 있는 사유 중 하나입니다."
            );
            addLaw("제10조의4제2항제3호");
          }

          if (justification.includes("keyMoneyAlreadyPaid")) {
            reasons.push(
              "임대인이 선택한 신규임차인이 기존 임차인과 권리금 계약을 체결하고 권리금을 지급했다는 " +
              "이유로 거절하신 것으로 입력하셨습니다. 이는 임대인의 정당한 사유로 인정될 수 있는 사유 중 하나입니다."
            );
            addLaw("제10조의4제2항제4호");
          }

          reasons.push(
            "다만 위 사유가 실제로 '정당한 사유'에 해당하는지는 구체적인 사실관계에 따라 달라질 수 있어, " +
            "전문가 확인을 권장합니다."
          );

        }

      }

    }

  }

  if (answers.contractStatus === "ended" && answers.afterThreeYears === "yes") {
    reasons.push(
      "임대차가 종료된 날로부터 3년이 경과한 것으로 입력하셨습니다. 방해행위로 인한 손해배상청구권은 " +
      "임대차가 종료한 날부터 3년 이내에 행사하지 않으면 시효의 완성으로 소멸합니다."
    );
    addLaw("제10조의4제4항");
  }

  if (answers.contractYears === "over10") {
    reasons.push(
      "총 임대차 기간이 10년을 초과한 것으로 입력하셨습니다. 이 10년 제한은 계약갱신요구권(제10조제2항)에 " +
      "관한 사항으로, 권리금 회수기회 보호(제10조의4)와는 별개로 판단됩니다."
    );
    addLaw("제10조제2항");
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
    disclaimer: template.disclaimer ?? ""
  };

}
