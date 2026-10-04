# -*- coding: utf-8 -*-
"""신고 기준 데이터 점검 스크립트
사용법:  python validate.py            (오늘 날짜 기준)
         python validate.py 2026-12-01 (날짜를 지정해서 확인일 경과 점검)
JSON 파일을 고친 뒤 배포하기 전에 한 번 실행하세요."""
import json, re, sys, datetime, pathlib

here = pathlib.Path(__file__).parent
load = lambda n: json.loads((here / n).read_text(encoding="utf-8"))
plat, chk, typ, tpl = load("platforms.json"), load("checklist.json"), load("types.json"), load("templates.json")
today = datetime.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else datetime.date.today()
errors, warnings = [], []

pids = {p["id"] for p in plat["platforms"]}
for p in plat["platforms"]:
    pol = p["policy"]
    if pol["confidence"] not in plat["confidenceLegend"]:
        errors.append(f'{p["id"]}: confidence 값이 목록에 없음')
    if pol["confidence"] == "high" and not (pol.get("officialUrl") or pol.get("officialUrlNote")):
        errors.append(f'{p["id"]}: 공식 링크나 안내 문구가 없음')
    vd = pol.get("verifiedDate")
    if vd is None:
        warnings.append(f'{p["id"]}: 공식 확인일이 없음 (confidence={pol["confidence"]})')
    else:
        age = (today - datetime.date.fromisoformat(vd)).days
        if age > plat["staleAfterDays"]:
            warnings.append(f'{p["id"]}: 확인한 지 {age}일 지남 (기준 {plat["staleAfterDays"]}일). 공식 정책을 다시 확인하세요')
    for k in ("strength",):
        s = p["request"]["notAccepted"][k]
        if s not in plat["strengthLegend"]:
            errors.append(f'{p["id"]}: notAccepted.strength 값이 목록에 없음')

ids = [i["id"] for i in chk["items"]]
if len(ids) != len(set(ids)): errors.append("checklist: id 중복")
for it in chk["items"]:
    for b in it["basis"]:
        if b["platformId"] not in pids: errors.append(f'checklist {it["id"]}: 없는 플랫폼 {b["platformId"]}')
        if b["strength"] not in plat["strengthLegend"]: errors.append(f'checklist {it["id"]}: strength 값 오류')
    for bad in ("허위", "거짓"):
        if bad in it["text"]: errors.append(f'checklist {it["id"]}: 단정 표현 "{bad}" 사용')

tids = {t["id"] for t in typ["types"]}
if len(tids) != 15: errors.append(f"types: 유형이 {len(tids)}개 (15개여야 함)")
for t in typ["types"]:
    if t["reportStatus"] not in typ["reportStatuses"]: errors.append(f'types {t["id"]}: reportStatus 오류')
    if t["reportStatus"] == "not_target" and t["match"]["type"] == "dictionary":
        errors.append(f'types {t["id"]}: 욕설 유형에 not_target을 쓸 수 없음')
t14 = next(t for t in typ["types"] if t["id"] == "T14")["match"]["keywords"]
for g in typ["classification"]["positiveGuards"]["before"]:
    for k in g["keywords"]:
        if k not in t14: errors.append(f'positiveGuards: "{k}"가 T14 키워드에 없음')
pr = [t["priority"] for t in typ["types"]]
if len(pr) != len(set(pr)): errors.append("types: priority 중복")

blank_tokens = {b["token"] for b in tpl["blanks"]}
tpl_ids = {t["typeId"] for t in tpl["templates"]}
if tpl_ids != tids: errors.append(f"templates: 유형과 불일치 {tpl_ids ^ tids}")
for t in tpl["templates"]:
    for tone in ("polite", "short", "sincere"):
        text = t[tone]
        for tok in re.findall(r"\[[^\]]+\]", text):
            if tok not in blank_tokens: errors.append(f'templates {t["typeId"]}/{tone}: 목록에 없는 빈칸 {tok}')
        for bad in ("허위", "거짓"):
            if bad in text: errors.append(f'templates {t["typeId"]}/{tone}: 단정 표현 "{bad}" 사용')


# ---- 욕설·모욕 사전 점검 ----
abuse = load("abuse-words.json")
cats = set(abuse["categories"])
for e in abuse["entries"]:
    if e["category"] not in cats: errors.append(f'abuse {e["term"]}: category 오류')
    if e["severity"] not in (1, 2, 3): errors.append(f'abuse {e["term"]}: severity 오류')
    if e.get("pattern"):
        try: re.compile(e["pattern"])
        except re.error as ex: errors.append(f'abuse {e["term"]}: 정규식 오류 {ex}')
for t in typ["types"]:
    if t["match"]["type"] == "dictionary" and not (here / t["match"]["dictionaryFile"]).exists():
        errors.append(f'types {t["id"]}: 사전 파일 {t["match"]["dictionaryFile"]} 없음')
sys.path.insert(0, str(here))
n_cases = 0
try:
    import abuse_check
    n_cases, fails = abuse_check.run_tests()
    for f in fails: errors.append("abuse 시험 실패: " + f)
except Exception as ex:
    errors.append(f"abuse 사전을 읽는 중 오류: {ex} (abuse-words.json의 pattern 항목을 확인하세요)")

n_classify = n_normalize = 0
try:
    import classify_check
    n_classify, cfails = classify_check.run_tests()
    for f in cfails: errors.append("분류 시험 실패: " + f)
    n_normalize, nfails = classify_check.run_normalize_tests()
    for f in nfails: errors.append("정규화 시험 실패: " + f)
except Exception as ex:
    errors.append(f"분류 시험을 실행하는 중 오류: {ex}")

print(f"기준일 {today} | 플랫폼 {len(pids)}개 · 체크리스트 {len(ids)}개 · 유형 {len(tids)}개 · 템플릿 {len(tpl['templates'])*3}개 · 욕설 사전 {len(abuse['entries'])}개 항목 · 시험 문장 {n_cases}개 · 분류 시험 {n_classify}개 · 정규화 시험 {n_normalize}개")
for w in warnings: print("주의:", w)
for e in errors: print("오류:", e)
print("결과:", "통과" if not errors else f"오류 {len(errors)}건")
sys.exit(1 if errors else 0)
