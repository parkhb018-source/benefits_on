# -*- coding: utf-8 -*-
"""리뷰 유형 분류 참고 구현 (types.json의 classification.steps를 그대로 코드로 옮긴 것)
개발 도구가 앱(JavaScript)을 만들 때 이 코드의 동작을 기준으로 삼고, classify-fixtures.json의 문장으로 같은 결과가 나오는지 확인하세요.

사용법:  python classify_check.py            (시험 문장 전체 실행)
         python classify_check.py "리뷰 문장" 2   (한 문장과 별점으로 검사)"""
import json, re, sys, pathlib
here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here))
from abuse_check import check as abuse_check

TYPES = {t["id"]: t for t in json.loads((here / "types.json").read_text(encoding="utf-8"))["types"]}
KW = {tid: [k.lower() for k in t["match"]["keywords"]] for tid, t in TYPES.items() if t["match"]["type"] == "keywords"}
POSITIVE = KW["T14"]
RISK_KEYWORD_TYPES = ["T06", "T05", "T13"]                    # 키워드로 잡는 위험·핵심 유형
NEGATIVE_TYPES = ["T01", "T02", "T03", "T04", "T07", "T08", "T09", "T10"]
prio = lambda tid: TYPES[tid]["priority"]


def classify(text, rating=None):
    t = (text or "").strip()
    low = t.lower()
    ab = abuse_check(t)
    # 1단계: 글이 없거나 매우 짧으면 '별점만'. 단, 짧아도 욕설이 있으면 욕설·비방(T12)
    if len(re.sub(r"\s", "", t)) < TYPES["T11"]["match"]["maxChars"] + 1:
        if ab["abusive"]:
            return {"main": "T12", "secondary": [], "abusive": True, "vulgar": ab["vulgar"]}
        return {"main": "T11", "secondary": [], "abusive": False, "vulgar": False}
    hit = lambda ids: [i for i in ids if any(k in low for k in KW[i])]
    risk = hit(RISK_KEYWORD_TYPES) + (["T12"] if ab["abusive"] else [])
    neg = hit(NEGATIVE_TYPES)
    positive = any(k in low for k in POSITIVE)
    main = None
    if risk:                                               # 2단계: 위험·핵심 유형은 항상 우선
        main = min(risk, key=prio)
    elif positive and neg:                                 # 3단계: 칭찬과 불만이 함께 있을 때
        if rating is not None and rating <= 2: main = min(neg, key=prio)
        elif rating == 5: main = "T14"
        else: main = "T15"
    elif positive:
        if rating is None or rating >= 4: main = "T14"
    elif neg:                                              # 4단계: 일반 불만은 우선순위가 높은 유형
        main = min(neg, key=prio)
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


if __name__ == "__main__":
    if len(sys.argv) > 1:
        rating = int(sys.argv[2]) if len(sys.argv) > 2 else None
        print(json.dumps(classify(sys.argv[1], rating), ensure_ascii=False, indent=2))
    else:
        n, f = run_tests()
        print(f"분류 시험 문장 {n}개 중 {n - len(f)}개 통과")
        for x in f: print("실패:", x)
        sys.exit(1 if f else 0)
