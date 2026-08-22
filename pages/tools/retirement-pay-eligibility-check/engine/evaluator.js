/* BenefitsON Law Engine - Rule Evaluator v1.0.0
   Pure function: same input -> same output.
   Does not read rules.json content itself - operates on whatever
   rule set (data/rules.json) is passed in.

   Copied unchanged from 권리금 보호 자가진단/engine/evaluator.js (BenefitsON
   Rule Engine Standard: 재사용, naming convention 유지). No modification
   was needed - condition operators already cover this tool's rules.json
   (all conditions use "equals"). */

function isEmptyValue(value) {

  if (value === undefined || value === null || value === "") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;

}

function evaluateSingleCondition(condition, answers) {

  const value = answers[condition.field];

  switch (condition.operator) {

    case "equals":
      return value === condition.value;

    case "notEquals":
      return value !== condition.value;

    case "includes":
      return Array.isArray(value) && value.includes(condition.value);

    case "notIncludes":
      return !Array.isArray(value) || !value.includes(condition.value);

    case "isEmpty":
      return isEmptyValue(value);

    case "isNotEmpty":
      return !isEmptyValue(value);

    default:
      return false;

  }

}

function evaluateConditions(conditions, logic, answers) {

  if (!Array.isArray(conditions) || conditions.length === 0) {
    return true;
  }

  if (logic === "OR") {
    return conditions.some(condition => evaluateSingleCondition(condition, answers));
  }

  return conditions.every(condition => evaluateSingleCondition(condition, answers));

}

export function evaluate(answers, rules) {

  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  const matches = [];

  for (const rule of sortedRules) {

    const isMatch = evaluateConditions(rule.conditions, rule.logic, answers);

    if (!isMatch) {
      continue;
    }

    matches.push({
      ruleId: rule.id,
      result: rule.result,
      priority: rule.priority,
      reasonCode: rule.reasonCode,
      severity: rule.severity
    });

    if (rule.stopEvaluation) {
      break;
    }

  }

  return { matches };

}
