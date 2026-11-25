"""
მონაცემების შემგროვებელი (API-Football v3).
ყოველ გაშვებაზე ხარჯავს მაქსიმუმ config.max_requests_per_run მოთხოვნას და
ინახავს კომპაქტურ JSON-ებს data/ ფოლდერში. მომდევნო გაშვება აგრძელებს იქიდან, სადაც გაჩერდა.

რიგი:
  1. ტურნირების მატჩების სიები (1 მოთხოვნა ტურნირზე, განახლდება ≥20 საათში ერთხელ)
  2. დასრულებული მატჩების დეტალები — სტატები, მოვლენები, მოთამაშეები (20 მატჩი = 1 მოთხოვნა)
     ევრო/თასებზე მხოლოდ ის მატჩები, სადაც ჩვენი 6 ლიგის გუნდი თამაშობს
  3. დაზიანებები (1 მოთხოვნა ტურნირზე, განახლდება ≥20 საათში ერთხელ)
"""
import json, os, sys, time, urllib.request, urllib.parse
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, os.environ.get("DATA_DIR") or "data")
CFG = json.load(open(os.path.join(ROOT, "config.json"), encoding="utf-8"))
SEASON = int(os.environ.get("SEASON") or CFG["season"])
BUDGET = int(os.environ.get("MAX_REQ") or CFG["max_requests_per_run"])
KEY = os.environ.get("API_FOOTBALL_KEY", "").strip()
BASE = "https://v3.football.api-sports.io/"
FINISHED = {"FT", "AET", "PEN"}
STAT_KEYS = ["Shots on Goal", "Shots off Goal", "Total Shots", "Blocked Shots", "Shots insidebox",
             "Shots outsidebox", "Fouls", "Corner Kicks", "Offsides", "Ball Possession", "Yellow Cards",
             "Red Cards", "Goalkeeper Saves", "Total passes", "Passes accurate", "Passes %",
             "expected_goals", "goals_prevented"]
EV_TYPE = {"Goal": "G", "Card": "C", "subst": "S", "Var": "V"}

used = 0
last_call = 0.0
PACE = 6.5
LAST_ERR = ""


class Budget(Exception):
    pass


def api(path, **params):
    global used, last_call, LAST_ERR
    if used >= BUDGET:
        raise Budget()
    wait = PACE - (time.time() - last_call)  # უფასო: ~10/წთ, ფასიანი: ბევრად მეტი
    if wait > 0:
        time.sleep(wait)
    url = BASE + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"x-apisports-key": KEY})
    last_call = time.time()
    used += 1
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.load(r)
            break
        except Exception as e:
            print(f"   ! ქსელის შეცდომა ({e}), ვცდი თავიდან")
            time.sleep(10)
    else:
        return []
    errs = data.get("errors")
    LAST_ERR = json.dumps(errs, ensure_ascii=False) if errs else ""
    if errs:
        print(f"   ⚠️ {path} {params}: {errs}")
        if isinstance(errs, dict) and ("requests" in errs or "rateLimit" in errs):
            raise Budget()
        return []
    return data.get("response", [])


def path(*p):
    return os.path.join(DATA, *p)


def load(p, default):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def num(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = v.replace("%", "").strip()
        try:
            return float(v) if "." in v else int(v)
        except ValueError:
            return None
    return v


def hours_since(iso):
    if not iso:
        return 1e9
    return (datetime.now(timezone.utc) - datetime.fromisoformat(iso)).total_seconds() / 3600


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------- 1. სიები
def refresh_list(comp, state):
    code = comp["code"]
    st = state.setdefault("lists", {})
    fp = path("comp", f"{code}.json")
    doc = load(fp, None)
    if doc and doc.get("season") == SEASON:
        all_done = all(f["s"] in FINISHED or f["s"] in ("CANC", "ABD", "AWD", "WO") for f in doc["fixtures"])
        if all_done or hours_since(st.get(code)) < 20:
            return doc
    rows = api("fixtures", league=comp["id"], season=SEASON)
    if not rows:
        return doc
    old = {f["i"]: f for f in (doc or {}).get("fixtures", [])} if doc and doc.get("season") == SEASON else {}
    teams = (doc or {}).get("teams", {}) if old else {}
    fixtures = []
    for r in rows:
        fx, t, g, sc = r["fixture"], r["teams"], r["goals"], r["score"]
        for side in ("home", "away"):
            teams[str(t[side]["id"])] = [t[side]["name"], t[side]["logo"]]
        ref = (fx.get("referee") or "").split(",")[0].strip() or None
        f = {"i": fx["id"], "d": fx["date"], "r": r["league"].get("round"), "h": t["home"]["id"], "a": t["away"]["id"],
             "s": fx["status"]["short"], "g": [g["home"], g["away"]],
             "ht": [sc["halftime"]["home"], sc["halftime"]["away"]], "ref": ref,
             "w": [1 if t["home"]["winner"] else 0, 1 if t["away"]["winner"] else 0]}
        prev = old.get(fx["id"])
        if prev and prev.get("st") is not None and prev.get("s") == f["s"]:
            f["st"], f["ev"] = prev["st"], prev.get("ev", [])
        fixtures.append(f)
    fixtures.sort(key=lambda f: f["d"])
    doc = {"code": code, "id": comp["id"], "season": SEASON, "teams": teams, "fixtures": fixtures, "updated": now_iso()}
    save(fp, doc)
    st[code] = now_iso()
    print(f"   {code}: {len(fixtures)} მატჩი ({sum(f['s'] in FINISHED for f in fixtures)} დასრულებული)")
    return doc


# ---------------------------------------------------------------- 2. დეტალები
def compact_stats(team_stats):
    m = {x["type"]: num(x["value"]) for x in team_stats.get("statistics", [])}
    return [m.get(k) for k in STAT_KEYS]


def store_detail(code, f, r, players_cache):
    hid, aid = f["h"], f["a"]
    stats = {s["team"]["id"]: s for s in r.get("statistics", [])}
    if hid in stats and aid in stats:
        f["st"] = [compact_stats(stats[hid]), compact_stats(stats[aid])]
        f.pop("nost", None)
    else:
        f["st"] = None
        f["nost"] = 1  # სტატები ამ მატჩზე API-ში არ არის
    ev = []
    for e in r.get("events", []):
        side = 0 if e["team"]["id"] == hid else 1
        ev.append([e["time"]["elapsed"], e["time"].get("extra") or 0, side, EV_TYPE.get(e["type"], e["type"]),
                   e.get("detail"), (e.get("player") or {}).get("id"), (e.get("assist") or {}).get("id")])
    f["ev"] = ev
    pl = players_cache.setdefault(code, load(path("players", f"{code}.json"), {"names": {}, "m": {}}))
    lines = []
    for tb in r.get("players", []):
        side = 0 if tb["team"]["id"] == hid else 1
        for p in tb.get("players", []):
            s = (p.get("statistics") or [{}])[0]
            gm = s.get("games") or {}
            mins = gm.get("minutes") or 0
            if not mins:
                continue
            pid = p["player"]["id"]
            pl["names"][str(pid)] = [p["player"]["name"], gm.get("position")]
            goals = s.get("goals") or {}
            cards = s.get("cards") or {}
            shots = s.get("shots") or {}
            lines.append([pid, side, mins, goals.get("total") or 0, goals.get("assists") or 0,
                          cards.get("yellow") or 0, cards.get("red") or 0, shots.get("total") or 0,
                          shots.get("on") or 0, num(gm.get("rating"))])
    pl["m"][str(f["i"])] = lines


PRIORITY = {c["code"]: i for i, c in enumerate(CFG["competitions"])}


def fetch_details(docs, core_teams, state):
    todo = []
    for code, doc in docs.items():
        group = doc["_group"]
        for f in doc["fixtures"]:
            if f["s"] in FINISHED and f.get("st") is None and not f.get("nost"):
                if group == "league" or f["h"] in core_teams or f["a"] in core_teams:
                    todo.append((code, f))
    # რიგი: ჯერ ტურნირების რიგით (პრემიერლიგა პირველი), ტურნირში — უახლესი მატჩები პირველი
    todo.sort(key=lambda x: (PRIORITY[x[0]], -datetime.fromisoformat(x[1]["d"]).timestamp()))
    print(f"   დეტალები დასაგროვებელია: {len(todo)} მატჩი")
    players_cache = {}
    done = 0
    try:
        i = 0
        while i < len(todo):
            if state.get("ids_ok", True):
                chunk = todo[i:i + 20]
                rows = api("fixtures", ids="-".join(str(f["i"]) for _, f in chunk))
                if not rows and LAST_ERR and "Ids" in LAST_ERR:
                    print("   ℹ️ ეს პაკეტი ერთდროულად 20 მატჩს არ იძლევა — გადავდივარ თითო მატჩზე")
                    state["ids_ok"] = False
                    continue
                i += len(chunk)
            else:
                chunk = todo[i:i + 1]
                rows = api("fixtures", id=chunk[0][1]["i"])
                i += 1
            by_id = {r["fixture"]["id"]: r for r in rows}
            for code, f in chunk:
                r = by_id.get(f["i"])
                if r:
                    store_detail(code, f, r, players_cache)
                    done += 1
    finally:
        for code, pl in players_cache.items():
            save(path("players", f"{code}.json"), pl)
        for code, doc in docs.items():
            save(path("comp", f"{code}.json"), {k: v for k, v in doc.items() if not k.startswith("_")})
        print(f"   შევსებულია {done} მატჩის დეტალები")


# ---------------------------------------------------------------- 3. დაზიანებები
def fetch_injuries(comp, state, core_teams, doc=None):
    code = comp["code"]
    st = state.setdefault("injuries", {})
    if hours_since(st.get(code)) < 20:
        return
    # დასრულებულ სეზონზე დაზიანებები ერთხელ საკმარისია
    if st.get(code) and doc and all(f["s"] in FINISHED for f in doc["fixtures"]):
        return
    rows = api("injuries", league=comp["id"], season=SEASON)
    out = []
    for r in rows:
        tid = r["team"]["id"]
        if comp["group"] != "league" and tid not in core_teams:
            continue
        out.append([r["player"]["id"], r["player"]["name"], tid, r["fixture"]["id"], r["fixture"]["date"][:10],
                    r["player"].get("type"), r["player"].get("reason")])
    save(path("injuries", f"{code}.json"), out)
    st[code] = now_iso()


# ---------------------------------------------------------------- 4. H2H (მომავალი მატჩებისთვის)
CUP_IDS = {c["id"] for c in CFG["competitions"] if c["group"] == "cup"}
CUP_WORDS = ("cup", "pokal", "coppa", "copa", "coupe", "beker", "trophy", "shield", "super", "trofeo", "taça")


def is_cup(lg):
    if lg.get("id") in CUP_IDS:
        return True
    n = (lg.get("name") or "").lower()
    return any(w in n for w in CUP_WORDS)
def fetch_h2h(docs, state):
    years = int(CFG.get("h2h_years", 15))
    ahead = int(CFG.get("h2h_days_ahead", 7))
    fp = path("h2h.json")
    db = load(fp, {})
    st = state.setdefault("h2h", {})
    now = datetime.now(timezone.utc)
    since = f"{now.year - years}-{now.month:02d}-01"
    pairs = []
    for doc in docs.values():
        for f in doc["fixtures"]:
            if f["s"] in ("NS", "TBD", "PST"):
                dt = datetime.fromisoformat(f["d"])
                if 0 <= (dt - now).total_seconds() <= ahead * 86400:
                    pairs.append(tuple(sorted((f["h"], f["a"]))))
    pairs = sorted(set(pairs))
    # ძველი ფორმატის ჩანაწერები (ტურნირის ლოგოს გარეშე) თავიდან ჩაიტვირთება
    todo = [p for p in pairs if hours_since(st.get(f"{p[0]}-{p[1]}")) > 24 * 6
            or any(len(x) < 14 for x in db.get(f"{p[0]}-{p[1]}", []))]
    print(f"   H2H: {len(pairs)} წყვილი მომავალ {ahead} დღეში, განსაახლებელი {len(todo)}")
    for a, b in todo:
        rows = api("fixtures/headtohead", h2h=f"{a}-{b}", **{"from": since, "to": now.strftime("%Y-%m-%d")})
        out = []
        for r in rows:
            if r["fixture"]["status"]["short"] not in FINISHED:
                continue
            t, lg = r["teams"], r["league"]
            out.append([r["fixture"]["date"][:10], t["home"]["id"], t["away"]["id"], r["goals"]["home"], r["goals"]["away"],
                        lg["name"], t["home"]["name"], t["away"]["name"],
                        r["score"]["halftime"]["home"], r["score"]["halftime"]["away"],
                        lg.get("id"), lg.get("logo"), 1 if is_cup(lg) else 0, r["fixture"]["status"]["short"]])
        out.sort(reverse=True)
        db[f"{a}-{b}"] = out
        st[f"{a}-{b}"] = now_iso()
    save(fp, db)


def main():
    if not KEY:
        print("❌ API_FOOTBALL_KEY არ არის")
        sys.exit(1)
    state = load(path("state.json"), {})
    if state.get("season") != SEASON:
        state = {"season": SEASON}
    global PACE
    print(f"სეზონი {SEASON}-{SEASON + 1}, ლიმიტი ამ გაშვებაზე: {BUDGET} მოთხოვნა")
    try:
        req = urllib.request.Request(BASE + "status", headers={"x-apisports-key": KEY})
        stt = json.load(urllib.request.urlopen(req, timeout=30)).get("response", {})
        plan = stt.get("subscription", {}).get("plan", "?")
        print(f"პაკეტი: {plan} | დღეს გამოყენებული: {stt.get('requests', {}).get('current')}/{stt.get('requests', {}).get('limit_day')}")
        if plan and plan.lower() != "free":
            PACE = 0.25
            state["ids_ok"] = True
    except Exception as e:
        print("status ვერ წავიკითხე:", e)
    docs = {}
    try:
        print("1) მატჩების სიები")
        for comp in CFG["competitions"]:
            doc = refresh_list(comp, state)
            if doc:
                doc["_group"] = comp["group"]
                docs[comp["code"]] = doc
        core = set()
        for comp in CFG["competitions"]:
            if comp["group"] == "league" and comp["code"] in docs:
                core.update(int(t) for t in docs[comp["code"]]["teams"])
        print("2) დაზიანებები")
        for comp in CFG["competitions"]:
            if comp["group"] == "league" or PACE < 1:
                fetch_injuries(comp, state, core, docs.get(comp["code"]))
        print("3) მატჩების დეტალები")
        fetch_details(docs, core, state)
        if not os.environ.get("SKIP_H2H"):
            print("4) H2H")
            fetch_h2h(docs, state)
    except Budget:
        print("⏸ ამ გაშვების ლიმიტი ამოიწურა — დანარჩენს შემდეგი გაშვება გააგრძელებს")
        for code, doc in docs.items():
            save(path("comp", f"{code}.json"), {k: v for k, v in doc.items() if not k.startswith("_")})
    state["last_run"] = now_iso()
    state["requests_last_run"] = used
    # პროგრესი
    total = withst = 0
    core = set()
    for comp in CFG["competitions"]:
        if comp["group"] == "league" and comp["code"] in docs:
            core.update(int(t) for t in docs[comp["code"]]["teams"])
    for doc in docs.values():
        for f in doc["fixtures"]:
            if f["s"] in FINISHED and (doc.get("_group") == "league" or f["h"] in core or f["a"] in core):
                total += 1
                withst += 1 if (f.get("st") is not None or f.get("nost")) else 0
    state["progress"] = {"finished": total, "detailed": withst}
    save(path("state.json"), state)
    print(f"✅ დასრულდა. გამოყენებული მოთხოვნა: {used}. დეტალები: {withst}/{total} დასრულებული მატჩი")


if __name__ == "__main__":
    main()
