// 욕설·모욕 표현 사전 검사 — data/review-helper/abuse_check.py 를 그대로 옮긴 것.
// abuse-words.json 의 matchingRules 9개를 따른다. DOM·저장소·네트워크 의존 없음.
// 규칙을 바꾸면 abuse_check.py 와 이 파일을 함께 고치고 abuse-tests.json 36개를 다시 돌린다.

// Python 의 \d 는 유니코드 숫자 전체라서 \p{Nd} 로 맞춘다 (u 플래그 필요).
const SEP = '[\\.\\-_\\*\\+~!?,·\\p{Nd}]{1,2}';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');

// 규칙 1: 소문자로 바꾸고, 같은 글자가 3번 이상 반복되면 2번으로 줄인다.
function normalize(text) {
  return text.toLowerCase().replace(/(.)\1{2,}/gu, '$1$1');
}

// 규칙 2: allowSeparators 인 항목은 글자 사이에 구분 기호 1~2개를 허용(띄어쓰기는 불허).
function termRegex(term, allowSep) {
  const chars = Array.from(term).map(escapeRe);
  const glue = allowSep ? `(?:${SEP})?` : '';
  return new RegExp(chars.join(glue), 'gu');
}

function spans(text, words) {
  const out = [];
  for (const w of words) {
    for (const m of text.matchAll(new RegExp(escapeRe(w), 'gu'))) {
      out.push([m.index, m.index + m[0].length]);
    }
  }
  return out;
}

// 문자열 인덱스(UTF-16) 기준 창. 사전·사람 대상 낱말은 모두 BMP 한글이라 Python 결과와 같다.
export function createAbuseChecker(dict) {
  const compiled = dict.entries.map((e) => {
    // 규칙 3: pattern 이 있으면 그 정규식, 없으면 term + variants
    const regs = e.pattern
      ? [new RegExp(e.pattern, 'gu')]
      : [e.term, ...(e.variants || [])].map((t) => termRegex(t, !!e.allowSeparators));
    return { e, regs };
  });
  const excl = dict.exclusions.map((x) => x.term);
  const person = dict.personTargets;
  const win = dict.personWindowChars;

  return function check(text) {
    const t = normalize(text || '');
    const ex = spans(t, excl); // 규칙 4
    const hits = [];
    for (const { e, regs } of compiled) {
      for (const rg of regs) {
        rg.lastIndex = 0;
        for (const m of t.matchAll(rg)) {
          const s = m.index;
          const en = s + m[0].length;
          if (ex.some(([a, b]) => s < b && a < en)) continue; // 제외 낱말과 겹치면 무시
          const near = t.slice(Math.max(0, s - win), en + win);
          const hasPerson = person.some((p) => near.includes(p));
          let counted = false;
          if (e.severity === 3) counted = true; // 규칙 5
          else if (e.requiresPerson || e.escalateWithPerson) counted = hasPerson; // 규칙 6, 7
          hits.push({ category: e.category, severity: e.severity, counted });
        }
      }
    }
    const abusive = hits.some((h) => h.counted && h.category !== 'vulgar');
    const vulgar = hits.some((h) => h.category === 'vulgar'); // 규칙 8
    // 욕설 단어 자체는 돌려주지 않는다(화면에 다시 출력하지 않기 위해).
    return { abusive, vulgar };
  };
}
