"""ერთი მატჩის სრული დეტალების შემოწმება (fixtures?id=) — უფასო პაკეტზე მუშაობს თუ არა."""
import json, os, urllib.request
KEY = os.environ["API_FOOTBALL_KEY"].strip()
def get(q):
    req = urllib.request.Request("https://v3.football.api-sports.io/" + q, headers={"x-apisports-key": KEY})
    return json.load(urllib.request.urlopen(req, timeout=30))
d = get("fixtures?id=1208397")
print("errors:", d.get("errors"))
for r in d.get("response", []):
    print(r["teams"]["home"]["name"], r["goals"], r["teams"]["away"]["name"])
    print("events:", len(r.get("events", [])), "| statistics teams:", len(r.get("statistics", [])), "| players teams:", len(r.get("players", [])), "| lineups:", len(r.get("lineups", [])))
s = get("status")["response"]
print("requests today:", s["requests"])
