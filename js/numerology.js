// ===================== ნუმეროლოგია =====================
// წყარო: Google Sheet „ნუმეროლოგია — ბაზა“ (იგივე, რაც footballnumerology საიტზე); ვერ ჩატვირთვისას — ჩაშენებული ასლი.
import { SEED } from './numseed.js?v=202611251622';

const SHEET_ID = '1rQFxc86UBC2obLmz_j9o6kT1Ceu2KGYN_YHLxCTVVrI', GID = '360651577';
const URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}&t=`;

export const NUM = { clubs: [], source: 'snapshot' };

function fromSeed() { return SEED.map(([name, date, coach, cdate, players]) => ({ name, date, coach: coach ? [coach, cdate] : null, players })); }
function parseCSV(s) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
function fromRows(rows) {
  const idx = {}, list = [];
  for (const r of rows.slice(1)) {
    const [sp, lg, tm, role, nm, dt] = r.map(x => (x || '').trim());
    if (sp !== 'ფეხბურთი' || !lg) continue;
    const team = tm || lg;
    if (!idx[team]) { idx[team] = { name: team, date: '', coach: null, players: [] }; list.push(idx[team]); }
    const c = idx[team];
    if (role === 'გუნდი') { c.date = dt; if (nm) c.name = nm; }
    else if (role === 'მწვრთნელი') c.coach = [nm, dt];
    else if (nm || dt) c.players.push([nm, dt]);
  }
  return list;
}
export async function loadNumerology() {
  NUM.clubs = fromSeed();
  try {
    const r = await fetch(URL + Date.now());
    const txt = await r.text();
    if (!r.ok || /^\s*</.test(txt)) throw 0;
    const list = fromRows(parseCSV(txt));
    if (list.length) { NUM.clubs = list; NUM.source = 'sheet'; }
  } catch (e) { /* ჩაშენებული ასლი რჩება */ }
  cache.clear();
}

// ---------- გამოთვლა (იგივე წესები, რაც footballnumerology-ზე)
const digits = s => { let t = 0; String(s).replace(/\d/g, c => { t += +c; }); return t; };
export function base(str) {
  if (!str || !/\d/.test(str)) return null;
  let s = digits(str); const chain = [s];
  while (s > 9) { s = digits(String(s)); chain.push(s); }
  for (let i = 0; i < chain.length - 1; i++) if (chain[i] === 10 || chain[i] === 11) return { v: chain[i], t: chain[i] + ' -> ' + chain[chain.length - 1], end: chain[chain.length - 1] };
  return { v: s, t: String(s), end: s };
}
const SHOW = { 10: 1, 11: 1, 13: 1, 16: 1, 19: 1 };
export function combine(b, d) {
  if (!b || !d) return '';
  const T = b.v + d.v;
  if (T <= 9) return String(T);
  if (SHOW[T]) return T + ' -> ' + digits(String(T));
  return String(1 + ((T - 1) % 9));
}
export const dayBase = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-'); return base(`${d}.${m}.${y}`); };
export const fmtDate = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}.${m}.${y}`; };

// ---------- სახელების დამთხვევა (API ↔ Sheet)
const STOP = new Set(['fc', 'afc', 'cf', 'sc', 'ac', 'as', 'ssc', 'ss', 'us', 'sv', 'vfl', 'tsg', 'rcd', 'rc', 'ud', 'cd', 'sd', 'ogc', 'osc', 'club', 'de', 'calcio', 'football', 'hotspur', 'and', 'albion', 'wanderers', 'olympique', 'stade', 'losc', 'bk', 'fk', 'sk', 'cfc', '1', '1899', '1846', '1907', '1909', '1913', '29']);
const ALIAS = { 'athletic club': 'athletic bilbao', 'paris saint germain': 'psg', 'bayern munchen': 'bayern', 'borussia dortmund': 'dortmund',
  'bayer leverkusen': 'leverkusen', 'borussia monchengladbach': 'monchengladbach', 'fsv mainz 05': 'mainz 05', 'stade rennais': 'rennes', 'rennais': 'rennes',
  'stade brestois 29': 'brest', 'brestois': 'brest', 'psv eindhoven': 'psv', 'inter milan': 'inter', 'internazionale': 'inter', 'wolves': 'wolverhampton',
  'nottingham': 'nottingham forest', 'tottenham hotspur': 'tottenham', 'spurs': 'tottenham', 'man utd': 'manchester united', 'man city': 'manchester city',
  'brighton hove': 'brighton', 'koln': 'koln', 'deportivo la coruna': 'deportivo la coruna', 'atletico de madrid': 'atletico madrid', 'celta de vigo': 'celta vigo' };
export const norm = s => {
  let t = String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (ALIAS[t]) t = ALIAS[t];
  let toks = t.split(' ').filter(w => !STOP.has(w));
  t = toks.join(' ');
  return ALIAS[t] || t;
};
const cache = new Map();
export function findClub(apiName) {
  if (cache.has(apiName)) return cache.get(apiName);
  const n = norm(apiName);
  let hit = NUM.clubs.find(c => norm(c.name) === n);
  if (!hit) hit = NUM.clubs.find(c => { const m = norm(c.name); return m.length > 3 && (n.split(' ').includes(m) || n.startsWith(m + ' ') || m.split(' ').every(w => n.split(' ').includes(w))); });
  if (!hit) hit = NUM.clubs.find(c => { const m = norm(c.name); return n.length > 3 && m.split(' ').includes(n); });
  cache.set(apiName, hit || null);
  return hit || null;
}
// მოთამაშე: API "M. Salah" ან "Mohamed Salah" ↔ Sheet "Mohamed Salah"/"Salah"
export function findPlayer(club, apiName) {
  if (!club || !apiName) return null;
  const a = norm(apiName).split(' ');
  const last = a[a.length - 1], first = a[0];
  const cands = club.players.filter(p => { const b = norm(p[0]).split(' '); return b[b.length - 1] === last || b.includes(last); });
  if (cands.length === 1) return cands[0];
  return cands.find(p => norm(p[0]).split(' ')[0][0] === first[0]) || null;
}
export function findPlayerAnywhere(apiName) {
  for (const c of NUM.clubs) { const p = findPlayer(c, apiName); if (p) return { club: c, p }; }
  return null;
}
