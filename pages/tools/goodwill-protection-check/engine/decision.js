/* BenefitsON Law Engine - Decision Engine v1.0.0
   Pure function: same input -> same output.
   "confidence" = completeness/reliability of the judgment given the
   matched rules, NOT a probability of legal protection. */

const SEVERITY_BASE_CONFIDENCE = {
  HIGH: 90,
  MEDIUM: 70,
  LOW: 50
};

export function makeDecision(evaluation) {

  const matches = evaluation?.matches ?? [];

  if (matches.length === 0) {

    return {
      result: "R2",
      primaryRule: null,
      matchedRules: [],
      confidence: 30,
      reviewRequired: true
    };

  }

  const primary = matches[0];

  const distinctResults = new Set(matches.map(match => match.result));

  const hasConflict = distinctResults.size > 1;

  let confidence = SEVERITY_BASE_CONFIDENCE[primary.severity] ?? 50;

  if (hasConflict) {
    confidence = Math.max(confidence - 30, 10);
  }

  const reviewRequired =
    hasConflict
    || primary.result === "R6"
    || primary.severity !== "HIGH";

  return {
    result: primary.result,
    primaryRule: primary.ruleId,
    matchedRules: matches,
    confidence,
    reviewRequired
  };

}
