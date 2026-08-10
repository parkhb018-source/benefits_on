/* BenefitsON Law Engine - Flow Engine v1.0.0 */

function matchesSkipCondition(condition, answers) {

  const value = answers[condition.questionId];

  if (condition.equals !== undefined) {
    return value === condition.equals;
  }

  if (condition.notEquals !== undefined) {
    return value !== condition.notEquals;
  }

  if (condition.includes !== undefined) {
    return Array.isArray(value) && value.includes(condition.includes);
  }

  return false;

}

export function createFlowEngine(questions, flowData) {

  const order = flowData?.order ?? questions.map(question => question.id);

  const skipRules = flowData?.skipRules ?? [];

  const questionsById = Object.fromEntries(
    questions.map(question => [question.id, question])
  );

  function getVisibleQuestions(answers = {}) {

    return order
      .filter(questionId => {

        const rule = skipRules.find(
          skipRule => skipRule.questionId === questionId
        );

        if (!rule) {
          return true;
        }

        return !matchesSkipCondition(rule.skipIf, answers);

      })
      .map(questionId => questionsById[questionId])
      .filter(Boolean);

  }

  function reset() {}

  return {
    getVisibleQuestions,
    reset
  };

}
