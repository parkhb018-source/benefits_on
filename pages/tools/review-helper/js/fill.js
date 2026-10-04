// 답변 템플릿의 [빈칸] 처리 — 찾기, 채우기, 남은 빈칸 세기. DOM 의존 없음.
// values 는 { '[가게 이름]': '○○분식', ... } 처럼 빈칸 토큰을 키로 쓴다. 빈 문자열은 '안 채움'.

import { resolveJosa } from './josa.js?v=20261005c';

const TOKEN_RE = /\[[^\]]+\]/g;

const filled = (values, token) => typeof values[token] === 'string' && values[token].trim() !== '';

// 템플릿에 나오는 빈칸 토큰(중복 제거, 처음 나온 순서)
export function listBlanks(template) {
  return [...new Set(template.match(TOKEN_RE) || [])];
}

// 미리보기용 조각: [{ text, blank: true|false }] — blank 는 '아직 안 채운 빈칸'만 true
// 채운 빈칸 뒤 조사는 값에 맞게 보정한다(js/josa.js). 복사(fillTemplate)도 이 함수를 거쳐 화면과 항상 같다.
export function splitTemplate(rawTemplate, values = {}) {
  const template = resolveJosa(rawTemplate, values);
  const out = [];
  let last = 0;
  for (const m of template.matchAll(TOKEN_RE)) {
    if (m.index > last) out.push({ text: template.slice(last, m.index), blank: false });
    const tok = m[0];
    out.push(filled(values, tok) ? { text: values[tok].trim(), blank: false } : { text: tok, blank: true });
    last = m.index + tok.length;
  }
  if (last < template.length) out.push({ text: template.slice(last), blank: false });
  return out;
}

// 복사용 완성 문장. 안 채운 빈칸은 [대괄호] 그대로 남는다.
export function fillTemplate(template, values = {}) {
  return splitTemplate(template, values).map((s) => s.text).join('');
}

// 남은 빈칸 '곳' 수(같은 빈칸이 두 번 나오면 2곳)
export function countBlanksLeft(template, values = {}) {
  return (template.match(TOKEN_RE) || []).filter((tok) => !filled(values, tok)).length;
}
