/* BenefitsON Law Engine - Decision Engine v1.1.0
   Pure function: same input -> same output.
   "confidence" = completeness/reliability of the judgment given the
   matched rules, NOT a probability of legal protection.

   v1.1.0 (this tool): 권리금 보호 자가진단/engine/decision.js를 기반으로,
   결과 코드 체계가 다른 Tool(R1~R6 대신 HIGH/LOW/REVIEW)에서도 재사용할 수
   있도록 두 값만 옵션으로 뺐다. 옵션을 생략하면 기존 호출부(R2/R6 체계)와
   완전히 동일하게 동작한다 - 하위 호환. */

const SEVERITY_BASE_CONFIDENCE = {
  HIGH: 90,
  MEDIUM: 70,
  LOW: 50
};

export function makeDecision(evaluation, options = {}) {

  const noMatchResult = options.noMatchResult ?? "R2";
  const reviewResultCode = options.reviewResultCode ?? "R6";

  const matches = evaluation?.matches ?? [];

  if (matches.length === 0) {

    return {
      result: noMatchResult,
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
    || primary.result === reviewResultCode
    || primary.severity !== "HIGH";

  return {
    result: primary.result,
    primaryRule: primary.ruleId,
    matchedRules: matches,
    confidence,
    reviewRequired
  };

}
