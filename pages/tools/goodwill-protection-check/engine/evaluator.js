/* BenefitsON Law Engine - Rule Evaluator v1.0.0
   Pure function: same input -> same output.
   Does not read rules.json content itself - operates on whatever
   rule set (data/rules.json) is passed in. */

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
