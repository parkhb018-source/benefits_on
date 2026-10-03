// 빈칸 값에 맞춘 조사 자동 보정 — DOM 의존 없는 순수 함수.
// templates.json 원문은 고치지 않고, 미리보기·복사에 쓰는 템플릿 문자열만 바꾼다(fill.js 가 호출).
// 구현 범위는 45개 템플릿 조사 분포 조사(2026-10-04)에서 나온 형태만: 으로/로, 을/를, 은/는, 이/가, 그리고 서술격 "였"(이었/였).

// 조사 → [받침 있을 때, 받침 없을 때, 마지막 글자가 한글이 아닐 때]
const PAIRS = {
  으로: ['으로', '로', '(으)로'],
  로: ['으로', '로', '(으)로'],
  을: ['을', '를', '을(를)'],
  를: ['을', '를', '을(를)'],
  은: ['은', '는', '은(는)'],
  는: ['은', '는', '은(는)'],
  이: ['이', '가', '이(가)'],
  가: ['이', '가', '이(가)'],
};

// [빈칸] 바로 뒤의 조사. 다음 글자가 한글이면(단어의 일부일 수 있음) 바꾸지 않는다.
const RE = /(\[[^\]]+\])(으로|로|을|를|은|는|이|가)(?![가-힣ㄱ-ㅎㅏ-ㅣ])/g;

function pick(value, particle) {
  const [withFinal, noFinal, neutral] = PAIRS[particle];
  const last = value.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return neutral;
  const jong = (code - 0xac00) % 28; // 0 = 받침 없음, 8 = ㄹ
  if (particle === '으로' || particle === '로') return jong === 0 || jong === 8 ? noFinal : withFinal;
  return jong === 0 ? noFinal : withFinal;
}

// 서술격 과거 "였"(템플릿의 "[확인 결과]였고/였습니다" 4곳): 받침 있으면 "이었", 없으면 "였", 한글 아니면 "(이)었".
// "이고/이며"는 받침 없는 값 뒤에도 문법상 정상이라 바꾸지 않는다.
const RE_COPULA_PAST = /(\[[^\]]+\])였/g;

function pickCopulaPast(value) {
  const code = value.trim().slice(-1).charCodeAt(0);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return '(이)었';
  return (code - 0xac00) % 28 === 0 ? '였' : '이었';
}

const filledValue = (values, token) => {
  const v = values[token];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
};

// values: { '[가게 이름]': '행복분식', ... }. 채워진 빈칸 뒤 조사만 바꾼다(비어 있으면 원문 그대로).
export function resolveJosa(templateText, values = {}) {
  return templateText
    .replace(RE, (all, token, particle) => {
      const v = filledValue(values, token);
      return v === null ? all : token + pick(v, particle);
    })
    .replace(RE_COPULA_PAST, (all, token) => {
      const v = filledValue(values, token);
      return v === null ? all : token + pickCopulaPast(v);
    });
}
