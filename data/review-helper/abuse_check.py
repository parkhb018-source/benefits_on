# -*- coding: utf-8 -*-
"""욕설·모욕 표현 사전 참고 구현 (abuse-words.json의 matchingRules를 그대로 코드로 옮긴 것)
개발 도구가 앱(JavaScript)을 만들 때 이 코드의 동작을 기준으로 삼고, abuse-tests.json의 문장으로 같은 결과가 나오는지 확인하세요.

사용법:  python abuse_check.py            (시험 문장 전체 실행)
         python abuse_check.py "검사할 문장"  (한 문장 검사)"""
import json, re, sys, pathlib

here = pathlib.Path(__file__).parent
DICT = json.loads((here / "abuse-words.json").read_text(encoding="utf-8"))
SEP = r"[\.\-_\*\+~!?,·\d]{1,2}"


def _normalize(text):
    text = text.lower()
    return re.sub(r"(.)\1{2,}", r"\1\1", text)          # 규칙 1: 3번 이상 반복 -> 2번


def _term_regex(term, allow_sep):
    chars = [re.escape(c) for c in term]
    glue = f"(?:{SEP})?" if allow_sep else ""             # 규칙 2: 구분 기호 허용(띄어쓰기는 불허)
    return re.compile(glue.join(chars))


def _compile():
    comp = []
    for e in DICT["entries"]:
        if e.get("pattern"):
            regs = [re.compile(e["pattern"])]
        else:
            regs = [_term_regex(t, e.get("allowSeparators", False)) for t in [e["term"]] + e.get("variants", [])]
        comp.append((e, regs))
    return comp


COMPILED = _compile()
EXCL = [x["term"] for x in DICT["exclusions"]]
PERSON = DICT["personTargets"]
WIN = DICT["personWindowChars"]


def _spans(text, words):
    out = []
    for w in words:
        for m in re.finditer(re.escape(w), text):
            out.append((m.start(), m.end()))
    return out


def check(text):
    t = _normalize(text)
    ex = _spans(t, EXCL)                                   # 규칙 4: 제외 낱말
    hits = []
    for e, regs in COMPILED:
        for rg in regs:
            for m in rg.finditer(t):
                s, en = m.span()
                if any(s < b and a < en for a, b in ex):   # 겹치면 무시
                    continue
                near = t[max(0, s - WIN): en + WIN]
                has_person = any(p in near for p in PERSON)
                counted = False
                if e["severity"] == 3:
                    counted = True                         # 규칙 5
                elif e.get("requiresPerson") or e.get("escalateWithPerson"):
                    counted = has_person                   # 규칙 6, 7
                hits.append({"term": e["term"], "category": e["category"], "severity": e["severity"], "text": m.group(), "counted": counted})
    abusive = any(h["counted"] and h["category"] != "vulgar" for h in hits)
    vulgar = any(h["category"] == "vulgar" for h in hits)    # 규칙 8
    labels = sorted({DICT["categories"][h["category"]]["label"] for h in hits if h["counted"] or h["category"] == "vulgar"})
    return {"abusive": abusive, "vulgar": vulgar, "labels": labels, "hits": hits}


def run_tests():
    cases = json.loads((here / "abuse-tests.json").read_text(encoding="utf-8"))["cases"]
    fails = []
    for c in cases:
        r = check(c["text"])
        if r["abusive"] != c["expectAbusive"]:
            fails.append(f'[{c["id"]}] 기대 {c["expectAbusive"]} / 결과 {r["abusive"]} :: {c["text"]} ({c["why"]})')
        if "expectVulgar" in c and r["vulgar"] != c["expectVulgar"]:
            fails.append(f'[{c["id"]}] 거친 표현 기대 {c["expectVulgar"]} / 결과 {r["vulgar"]} :: {c["text"]}')
    return len(cases), fails


if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(json.dumps(check(sys.argv[1]), ensure_ascii=False, indent=2))
    else:
        n, f = run_tests()
        print(f"시험 문장 {n}개 중 {n - len(f)}개 통과")
        for x in f: print("실패:", x)
        sys.exit(1 if f else 0)
