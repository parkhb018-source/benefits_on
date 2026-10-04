# -*- coding: utf-8 -*-
"""리뷰 유형 분류 참고 구현 (types.json의 classification.steps를 그대로 코드로 옮긴 것)
개발 도구가 앱(JavaScript)을 만들 때 이 코드의 동작을 기준으로 삼고, classify-fixtures.json의 문장으로 같은 결과가 나오는지 확인하세요.

사용법:  python classify_check.py            (시험 문장 전체 실행)
         python classify_check.py "리뷰 문장" 2   (한 문장과 별점으로 검사)"""
import json, re, sys, pathlib, unicodedata
here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here))
from abuse_check import check as abuse_check

# 분류 키워드 매칭 전용 표기 정규화 (js/normalize.js 와 결과가 항상 같아야 함)
# 1) NFC + 소문자  2) 모든 공백 제거  3) 받침만 접기: ㄲ·ㄳ→ㄱ, ㄶ→ㄴ, ㅀ→ㄹ, ㅄ→ㅂ, ㅆ→ㅅ
# 욕설 판정·화면 표시·답변 초안에는 쓰지 않는다.
SPACES = re.compile("[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]")
JONG_FOLD = {2: 1, 3: 1, 6: 4, 15: 8, 18: 17, 20: 19}


def normalize_for_match(s):
    s = SPACES.sub("", unicodedata.normalize("NFC", s or "").lower())
    out = []
    for ch in s:
        code = ord(ch) - 0xAC00
        jong = code % 28
        out.append(chr(0xAC00 + code - jong + JONG_FOLD[jong]) if 0 <= code < 11172 and jong in JONG_FOLD else ch)
    return "".join(out)


DATA = json.loads((here / "types.json").read_text(encoding="utf-8"))
TYPES = {t["id"]: t for t in DATA["types"]}
KW = {tid: [normalize_for_match(k) for k in t["match"]["keywords"]] for tid, t in TYPES.items() if t["match"]["type"] == "keywords"}
POSITIVE = KW["T14"]
GENERAL_NEG = [normalize_for_match(k) for k in DATA["classification"]["generalNegative"]]   # 특정 유형이 없는 일반 불만 표현
GUARDS = DATA["classification"]["positiveGuards"]                                           # 칭찬 키워드 보호 규칙
GUARD_BEFORE = {}                                                                           # 정규화 키워드 -> 막는 앞 글자
for g in GUARDS["before"]:
    for k in g["keywords"]:
        GUARD_BEFORE.setdefault(normalize_for_match(k), []).extend(normalize_for_match(c) for c in g["chars"])
GUARD_AFTER = [normalize_for_match(p) for p in GUARDS["after"]["patterns"]]
GUARD_WITHIN = GUARDS["after"]["withinChars"]
RISK_KEYWORD_TYPES = ["T06", "T05", "T13"]                    # 키워드로 잡는 위험·핵심 유형
NEGATIVE_TYPES = ["T01", "T02", "T03", "T04", "T07", "T08", "T09", "T10"]
prio = lambda tid: TYPES[tid]["priority"]


def positive_hits(low):
    """정규화한 글에서 칭찬 키워드 등장을 살펴 (막히지 않은 칭찬이 있는가, 막힌 칭찬이 있는가)를 돌려준다"""
    ok = guarded = False
    for k in POSITIVE:
        s = low.find(k)
        while s != -1:
            e = s + len(k)
            before = s > 0 and low[s - 1] in GUARD_BEFORE.get(k, ())                    # 앞 글자로 막기
            after = any(0 <= low.find(p, e) - e <= GUARD_WITHIN for p in GUARD_AFTER)   # 뒤 표현으로 막기
            blocked = before or after
            guarded, ok = guarded or blocked, ok or not blocked
            s = low.find(k, s + 1)
    return ok, guarded


def classify(text, rating=None):
    t = (text or "").strip()
    low = normalize_for_match(t)                           # 키워드 비교용. 욕설 판정은 원문으로
    ab = abuse_check(t)
    hit = lambda ids: [i for i in ids if any(k in low for k in KW[i])]
    risk = hit(RISK_KEYWORD_TYPES) + (["T12"] if ab["abusive"] else [])
    neg = hit(NEGATIVE_TYPES)
    positive, guarded = positive_hits(low)
    general = guarded or any(k in low for k in GENERAL_NEG)  # 막힌 칭찬도 일반 불만 표현으로 본다
    # 1단계: 공백을 뺀 글자 수가 5자 미만이면
    #   (a) 욕설·모욕이 있으면 욕설·비방(T12)
    #   (b) 키워드(위험·핵심 / 일반 불만 / 칭찬 / 일반 불만 표현)가 하나라도 걸리면 아래 2~5단계를 그대로 적용
    #   (c) 아무것도 걸리지 않을 때만 '별점만'(T11). 빈 글도 T11
    if len(re.sub(r"\s", "", t)) < TYPES["T11"]["match"]["maxChars"] + 1:
        if ab["abusive"]:
            return {"main": "T12", "secondary": [], "abusive": True, "vulgar": ab["vulgar"]}
        if not (risk or neg or positive or general):
            return {"main": "T11", "secondary": [], "abusive": False, "vulgar": False}
    main = None
    if risk:                                               # 2단계: 위험·핵심 유형은 항상 우선
        main = min(risk, key=prio)
    elif positive and neg:                                 # 3단계: 칭찬과 불만이 함께 있을 때
        if rating is not None and rating <= 2: main = min(neg, key=prio)
        elif rating == 5: main = "T14"
        else: main = "T15"
    elif positive and general:                             # 3단계: 칭찬과 일반 불만 표현만(불만 유형 없음)
        if rating is not None and rating <= 2: main = None
        elif rating == 5: main = "T14"
        else: main = "T15"
    elif positive:
        if rating is None or rating >= 4: main = "T14"
    elif neg:                                              # 4단계: 일반 불만은 우선순위가 높은 유형
        main = min(neg, key=prio)
    # 일반 불만 표현만 걸렸거나 아무것도 없으면 미분류(None)
    secondary = sorted([i for i in risk + neg if i != main], key=prio)
    return {"main": main, "secondary": secondary, "abusive": ab["abusive"], "vulgar": ab["vulgar"]}


def run_tests():
    cases = json.loads((here / "classify-fixtures.json").read_text(encoding="utf-8"))["cases"]
    fails = []
    for c in cases:
        r = classify(c["text"], c.get("rating"))
        if r["main"] != c["expectMain"]:
            fails.append(f'[{c["id"]}] 대표 유형 기대 {c["expectMain"]} / 결과 {r["main"]} :: {c["text"]}')
        for s in c.get("expectSecondaryContains", []):
            if s not in r["secondary"]: fails.append(f'[{c["id"]}] 보조 유형 {s} 없음 :: {c["text"]}')
        for s in c.get("expectSecondaryExcludes", []):
            if s in r["secondary"]: fails.append(f'[{c["id"]}] 보조 유형 {s}가 잘못 붙음 :: {c["text"]}')
        if "expectAbusive" in c and r["abusive"] != c["expectAbusive"]:
            fails.append(f'[{c["id"]}] 욕설 감지 기대 {c["expectAbusive"]} / 결과 {r["abusive"]} :: {c["text"]}')
    return len(cases), fails


def run_normalize_tests():
    cases = json.loads((here / "normalize-fixtures.json").read_text(encoding="utf-8"))["cases"]
    fails = [f'[{c["id"]}] 정규화 기대 {c["expect"]!r} / 결과 {normalize_for_match(c["input"])!r}'
             for c in cases if normalize_for_match(c["input"]) != c["expect"]]
    return len(cases), fails


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--dump":
        # JS 시험(engine.test.mjs)이 두 구현의 결과를 비교할 때 쓴다.
        # 표준 입력 {"normalize": [글...], "classify": [[글, 별점]...]} -> 표준 출력 같은 순서의 결과(JSON)
        req = json.loads(sys.stdin.buffer.read().decode("utf-8"))
        print(json.dumps({"normalize": [normalize_for_match(s) for s in req["normalize"]],
                          "classify": [classify(t, r) for t, r in req["classify"]]}))
    elif len(sys.argv) > 1:
        rating = int(sys.argv[2]) if len(sys.argv) > 2 else None
        print(json.dumps(classify(sys.argv[1], rating), ensure_ascii=False, indent=2))
    else:
        n, f = run_tests()
        nn, nf = run_normalize_tests()
        print(f"분류 시험 문장 {n}개 중 {n - len(f)}개 통과 · 정규화 시험 {nn}개 중 {nn - len(nf)}개 통과")
        for x in f + nf: print("실패:", x)
        sys.exit(1 if f or nf else 0)
