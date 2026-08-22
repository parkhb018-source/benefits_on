/* BenefitsON Law Engine - Flow Engine v1.1.0

   v1.1.0 (this tool): 권리금 보호 자가진단/engine/flow-engine.js를 기반으로
   조건부 질문 노출 기능을 하위 호환 방식으로 추가했다.

   - 기존 `skipRules`(단일 필드 equals/notEquals/includes로 "이 조건이면
     숨긴다")는 동작·시그니처 변경 없이 그대로 유지한다.
   - 새 `conditionalQuestions`는 "이 조건들 중 하나라도 맞으면 보여준다"
     (`showIf.anyOf`)를 표현하기 위한 최소 확장이다. 여러 필드에 걸친 OR
     조건은 skipRules만으로 표현할 수 없어서 추가했다 - 범용 Rule Engine으로
     확장한 것이 아니라 이 Tool에 필요한 최소 형태(anyOf/allOf)만 지원한다.
   - flow.json에 `conditionalQuestions`가 없으면(예: 권리금 보호 자가진단의
     flow.json) 동작이 v1.0.0과 완전히 동일하다. */

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

function matchesShowCondition(condition, answers) {

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

    default:
      return false;

  }

}

function isShowConditionSatisfied(showIf, answers) {

  if (!showIf) {
    return true;
  }

  if (Array.isArray(showIf.anyOf)) {
    return showIf.anyOf.some(condition => matchesShowCondition(condition, answers));
  }

  if (Array.isArray(showIf.allOf)) {
    return showIf.allOf.every(condition => matchesShowCondition(condition, answers));
  }

  return matchesShowCondition(showIf, answers);

}

export function createFlowEngine(questions, flowData) {

  const order = flowData?.order ?? questions.map(question => question.id);

  const skipRules = flowData?.skipRules ?? [];

  const conditionalQuestions = flowData?.conditionalQuestions ?? [];

  const conditionalById = Object.fromEntries(
    conditionalQuestions.map(entry => [entry.id, entry])
  );

  const questionsById = Object.fromEntries(
    questions.map(question => [question.id, question])
  );

  function getVisibleQuestions(answers = {}) {

    return order
      .filter(questionId => {

        const skipRule = skipRules.find(
          rule => rule.questionId === questionId
        );

        if (skipRule && matchesSkipCondition(skipRule.skipIf, answers)) {
          return false;
        }

        const conditional = conditionalById[questionId];

        if (conditional && !isShowConditionSatisfied(conditional.showIf, answers)) {
          return false;
        }

        return true;

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
