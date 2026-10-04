// 신고 전 체크리스트 노출 판단 — DOM 을 쓰지 않는 순수 함수.
// 규칙 목록은 types.json 의 reportCandidateStatuses 에 있다(유형 ID 를 여기 적지 않는다).

// typeId: 현재 선택된 유형 ID(미분류면 null), abusive: 욕설·비방·개인정보 표현 감지, typesData: types.json 전체
export function shouldShowChecklist(typeId, abusive, typesData) {
  if (abusive) return true;
  const list = (typesData && typesData.reportCandidateStatuses) || [];
  const type = typesData && typesData.types ? typesData.types.find((t) => t.id === typeId) : null;
  return !!type && list.includes(type.reportStatus);
}
