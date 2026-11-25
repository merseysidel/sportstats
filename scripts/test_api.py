"""API-Football-ის საცდელი შემოწმება: გასაღები, მიმდინარე სეზონი, მატჩის სტატები, დაზიანებები.
იყენებს მაქსიმუმ ~7 მოთხოვნას დღიური 100-დან. გასაღებს არსად ბეჭდავს."""
import json, os, sys, urllib.request, urllib.parse

KEY = os.environ.get("API_FOOTBALL_KEY", "").strip()
BASE = "https://v3.football.api-sports.io/"
PL = 39  # პრემიერლიგა

if not KEY:
    print("❌ API_FOOTBALL_KEY ვერ მოიძებნა Secrets-ში")
    sys.exit(1)

def get(path, **params):
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"x-apisports-key": KEY})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    errs = data.get("errors")
    if errs:
        print(f"   ⚠️ შეცდომა ({path} {params}): {errs}")
    return data

def line(t): print("\n" + "=" * 8 + " " + t + " " + "=" * 8)

line("1. ანგარიში")
st = get("status").get("response", {})
if isinstance(st, dict) and st:
    sub = st.get("subscription", {}); rq = st.get("requests", {})
    print(f"   პაკეტი: {sub.get('plan')} | აქტიური: {sub.get('active')} | დღეს გამოყენებული: {rq.get('current')}/{rq.get('limit_day')}")
else:
    print("   ❌ გასაღები არ მუშაობს"); sys.exit(1)

line("2. პრემიერლიგის მიმდინარე სეზონი")
lg = get("leagues", id=PL, current="true").get("response", [])
season = None
if lg:
    s = lg[0]["seasons"][0]
    season = s["year"]
    cov = s.get("coverage", {})
    print(f"   სეზონი: {season} ({s.get('start')} → {s.get('end')})")
    print(f"   coverage: {json.dumps(cov, ensure_ascii=False)}")

season = 2024
line(f"3. მატჩები, სეზონი {season}")
fx = get("fixtures", league=PL, season=season)
games = fx.get("response", [])
done = [g for g in games if g["fixture"]["status"]["short"] in ("FT", "AET", "PEN")]
print(f"   სულ მატჩი: {len(games)} | დასრულებული: {len(done)}")
if fx.get("errors"):
    print("   👉 როგორც ჩანს, უფასო პაკეტი მიმდინარე სეზონზე წვდომას არ იძლევა")

if done:
    g = done[-1]
    fid = g["fixture"]["id"]
    print(f"   ბოლო: {g['teams']['home']['name']} {g['goals']['home']}-{g['goals']['away']} {g['teams']['away']['name']} | მსაჯი: {g['fixture'].get('referee')}")

    line("4. ამ მატჩის სტატისტიკა (რა ტიპის სტატები მოდის)")
    stats = get("fixtures/statistics", fixture=fid).get("response", [])
    for team in stats:
        print(f"   {team['team']['name']}:")
        for x in team["statistics"]:
            print(f"      {x['type']}: {x['value']}")
    types = {x["type"].lower() for t in stats for x in t["statistics"]}
    for want in ("throw", "cross"):
        print(f"   {'✅' if any(want in t for t in types) else '❌'} '{want}' სტატი {'არის' if any(want in t for t in types) else 'არ არის'}")

    line("5. მოვლენები (გოლების წუთები)")
    ev = get("fixtures/events", fixture=fid).get("response", [])
    print(f"   მოვლენა: {len(ev)}  მაგ: " + "; ".join(f"{e['time']['elapsed']}' {e['type']}/{e['detail']}" for e in ev[:6]))

line("6. დაზიანებები")
inj = get("injuries", league=PL, season=season).get("response", [])
print(f"   ჩანაწერი: {len(inj)}  მაგ: " + "; ".join(f"{i['player']['name']} ({i['team']['name']}) - {i['player'].get('reason')}" for i in inj[-3:]))

line("დასრულდა")
st = get("status").get("response", {})
if isinstance(st, dict):
    print(f"   დღეს გამოყენებული: {st.get('requests', {}).get('current')}/{st.get('requests', {}).get('limit_day')}")
