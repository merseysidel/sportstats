// ===================== SportStats — ინტერფეისი =====================
import { DB, indexData, predict, teamRows, aggregate, isFin, playerLines, playerTotals, refereeStats, injuriesNear } from './engine.js?v=202611271028';
import { buildMarkets, aiPicks, explain, checkItem, tn, pickName, oddsFor, valuePicks, BOOK } from './markets.js?v=202611271028';
import { traits, patterns, keyAbsences, standings, restInfo, motivation, coachInfo, scenarios } from './insights.js?v=202611271028';
import { REL } from './reliability.js?v=202611271028';
import { NUM, loadNumerology, findClub, findPlayer, findPlayerAnywhere, base, combine, dayBase, fmtDate } from './numerology.js?v=202611271028';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = x => x == null || isNaN(x) ? '—' : (Math.round(x * 10) / 10).toFixed(1);
const P = x => x == null || isNaN(x) ? '—' : Math.round(x * 100) + '%';
const MIN = 0.70; // AI ფსონების ზღვარი
const ST = { date: null, venue: 'all', tab: {}, mode: 'list', round: {} };
const DAYS = ['კვი', 'ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ'];
const MONTHS = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
// ყველა დრო — საქართველოს დროით (UTC+4, ზაფხულის დროის გარეშე), ნებისმიერ მოწყობილობაზე
const TZ = 'Asia/Tbilisi';
const tbIso = t => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const dayStart = s => Date.parse(s + 'T00:00:00+04:00');
const hhmm = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
const dlabel = t => { const [y, m, d] = tbIso(t).split('-'); return `${+d} ${MONTHS[+m - 1]}`; };
const logo = (id, cls = 'lg') => DB.teams[id]?.logo ? `<img class="${cls}" src="${esc(DB.teams[id].logo)}" alt="" loading="lazy">` : `<span class="${cls}"></span>`;
const tlink = id => `<a href="#/t/${id}" class="tl">${logo(id)}<span>${esc(tn(id))}</span></a>`;
const pcls = p => p >= 0.8 ? 'p80' : p >= MIN ? 'p70' : p >= 0.5 ? 'p50' : '';
const compName = c => DB.comps[c]?.name || c;

const ARCH = +new URLSearchParams(location.search).get('archive') || null; // არქივის სეზონი (მაგ. 2025)
const BASE = ARCH ? `data/archive/${ARCH}/` : 'data/';
const predCache = new Map();
const blendTag = it => it.pm != null ? `<small class="blend">🤖 მოდელი <b>${P(it.pm)}</b> · 🏦 ბუკმეკერი <b>${P(it.pb)}</b> · საბოლოო <b>${P(it.p)}</b></small>` : '';
const relOf = it => REL[it.fam + (it.dir || '')] || REL[it.fam] || null;
const relTag = it => { const r = relOf(it); return r ? `<span class="rel ${r[0] >= 0.78 ? 'hi' : r[0] < 0.7 ? 'lo' : ''}" title="ამ ბაზარზე AI ფსონები 2025-26 სეზონში ${Math.round(r[0] * 100)}%-ით გამართლდა (${r[1]} ფსონი)">სანდოობა ${Math.round(r[0] * 100)}%</span>` : ''; };

// -------------------------------------------------- 🧾 ბილეთი (კუპონი)
const TK = { legs: [] };
try { TK.legs = JSON.parse(localStorage.getItem('ss_ticket') || '[]'); } catch (e) { }
const saveTK = () => { try { localStorage.setItem('ss_ticket', JSON.stringify(TK.legs)); } catch (e) { } renderTicket(); };
const legKey = l => l.fid + '|' + l.group + '|' + l.label;
const addBtn = (f, it, group) => { const k = f.i + '|' + (group || it.group) + '|' + it.label; const on = TK.legs.some(l => legKey(l) === k);
  return `<button class="addb ${on ? 'on' : ''}" data-act="tk" data-fid="${f.i}" data-g="${esc(group || it.group)}" data-l="${esc(it.label)}" title="${on ? 'ბილეთიდან ამოღება' : 'ბილეთში დამატება'}">${on ? '✓' : '+'}</button>`; };
function findItem(fid, group, label) {
  const f = DB.byId[fid]; if (!f) return null;
  const { mk } = pred(f);
  for (const gr of [...mk.R, ...mk.ST, ...mk.OT]) if (gr.title === group) { const it = gr.items.find(x => x.label === label); if (it) return { f, it: { ...it, group } }; }
  // ჯგუფის სათაური შეიძლება შეიცვალოს (მოსალოდნელი მნიშვნელობა) — ვეძებთ სათაურის დასაწყისით
  const g0 = group.replace(/\s*\(.*\)$/, '');
  for (const gr of [...mk.R, ...mk.ST, ...mk.OT]) if (gr.title.replace(/\s*\(.*\)$/, '') === g0) { const it = gr.items.find(x => x.label === label); if (it) return { f, it: { ...it, group: gr.title } }; }
  return null;
}
function toggleLeg(fid, group, label) {
  const k = fid + '|' + group + '|' + label, i = TK.legs.findIndex(l => legKey(l) === k);
  if (i >= 0) TK.legs.splice(i, 1);
  else { const r = findItem(+fid, group, label); if (!r) return; const o = oddsFor(r.f, r.it);
    TK.legs.push({ fid: +fid, group, label, fam: r.it.fam, dir: r.it.dir || '', line: r.it.line, p: r.it.p, odd: o && o.odd ? o.odd : null, plName: r.it.pl?.name, pick: pickName(r.it) }); }
  saveTK();
}
function renderTicket() {
  let el = $('#ticket'); if (!el) { el = document.createElement('div'); el.id = 'ticket'; document.body.appendChild(el); }
  const L = TK.legs.map(l => ({ ...l, f: DB.byId[l.fid] })).filter(l => l.f);
  if (!L.length) { el.innerHTML = ''; el.className = ''; return; }
  const open = el.classList.contains('open');
  const P0 = L.reduce((s, l) => s * l.p, 1), O = L.reduce((s, l) => s * (l.odd || 1 / l.p), 1), est = L.some(l => !l.odd);
  const sorted = [...L].sort((a, b) => a.p - b.p), weak = new Set(sorted.filter(l => l.p < 0.7 || (L.length >= 4 && l === sorted[0])).map(legKey));
  const chk = L.map(l => { const r = findItem(l.fid, l.group, l.label); return r ? checkItem(l.f, { ...r.it, pl: r.it.pl }) : null; });
  const ev = P0 * O;
  let warn = '';
  if (P0 < 0.3) warn += `<div class="tw bad">⚠️ ბილეთი მხოლოდ ${P(P0)}-ით დაჯდება — ზედმეტად გრძელია. სჯობს გაყო რამდენიმე ბილეთად (ვარიანტი ქვემოთაა) ან ამოიღე ყველაზე სუსტი ფსონი.</div>`;
  else if (P0 < 0.5) warn += `<div class="tw mid">ბილეთი ${P(P0)}-ით დაჯდება — საშუალო რისკი.</div>`;
  if (weak.size) warn += `<div class="tw bad">🔻 ყველაზე სუსტი: ${sorted.filter(l => weak.has(legKey(l))).map(l => `${esc(tn(l.f.h))}–${esc(tn(l.f.a))}: ${esc(l.pick)} (${P(l.p)})`).join('; ')}</div>`;
  // გაყოფის ვარიანტები ალბათობის დიაპაზონებით (თითო ფსონი მხოლოდ ერთ ბილეთში)
  let split = '';
  if (L.length >= 3 && P0 < 0.5) {
    const byP = [...L].sort((a, b) => b.p - a.p);
    const prob = g => g.reduce((s, l) => s * l.p, 1), odds = g => g.reduce((s, l) => s * (l.odd || 1 / l.p), 1);
    // ხარბი შევსება: ბილეთს ვავსებთ, სანამ ალბათობა ქვედა ზღვარს არ ჩამოსცდება
    const pack = lo => { const out = []; let cur = [];
      for (const l of byP) { if (cur.length && prob(cur) * l.p < lo) { out.push(cur); cur = []; } cur.push(l); }
      if (cur.length) {
        // ბოლოს დარჩენილ 1 ფსონს ცალკე ბილეთად არ ვტოვებთ — ვამატებთ ყველაზე „ძლიერ“ ბილეთს
        if (out.length && cur.length === 1) { const best = out.reduce((a, g) => prob(g) > prob(a) ? g : a); best.push(cur[0]); } else out.push(cur);
      }
      return out; };
    const longT = () => { const g = []; for (const l of byP) { if (g.length && prob(g) * l.p < 0.2) break; g.push(l); } return [g]; };
    const variants = [
      ['🛡️ საიმედო — 50%+', pack(0.5)],
      ['⚖️ საშუალო — 35–50%', pack(0.35)],
      ['🔥 რისკიანი — 30–35%', pack(0.30)],
      ['🚀 ერთი გრძელი — 20–30%', longT()],
    ];
    const tk = (g, i) => `<span>ბილეთი ${i + 1}: ${g.length} ფსონი · <b>${P(prob(g))}</b> · კოეფ. <b>${g.some(l => !l.odd) ? '~' : ''}${odds(g).toFixed(2)}</b><small>${g.map(l => `${esc(tn(l.f.h))}–${esc(tn(l.f.a))}: ${esc(l.pick)}`).join(' · ')}</small></span>`;
    split = `<div class="tsplit"><b>🤖 გაყოფის ვარიანტები:</b>${variants.map(([t, gs]) => `<details${t.startsWith('🛡') ? ' open' : ''}><summary>${t} <span class="mut">(${gs.length} ბილეთი)</span></summary>${gs.map(tk).join('')}</details>`).join('')}</div>`;
  }
  el.className = open ? 'open' : '';
  el.innerHTML = `<button class="tkbtn" data-act="tkopen">🧾 ბილეთი <b>${L.length}</b> · ${P(P0)} · ${est ? '~' : ''}${O.toFixed(2)}</button>
    <div class="tkbody"><div class="tkhead"><h3>🧾 ჩემი ბილეთი</h3><button class="btn sm" data-act="tkclear">გასუფთავება</button><button class="btn sm" data-act="tkopen">✕</button></div>
    ${L.map((l, i) => `<div class="tleg ${weak.has(legKey(l)) ? 'weak' : ''}"><a href="#/m/${l.fid}"><small>${dlabel(l.f.t)} ${hhmm(l.f.t)} · ${esc(compName(l.f.c))}</small><b>${esc(tn(l.f.h))} – ${esc(tn(l.f.a))}</b><span>${esc(l.pick)}</span></a>
      <span class="pct ${pcls(l.p)}">${P(l.p)}</span><span class="odd">${l.odd ? l.odd.toFixed(2) : '~' + (1 / l.p).toFixed(2)}</span>${relTag(l)}<span>${chk[i] == null ? '' : chk[i] ? '✅' : '❌'}</span>
      <button class="addb on" data-act="tk" data-fid="${l.fid}" data-g="${esc(l.group)}" data-l="${esc(l.label)}" title="ამოღება">✕</button></div>`).join('')}
    <div class="tsum"><span>ერთიანი ალბათობა <b>${P(P0)}</b></span><span>ჯამური კოეფ. <b>${est ? '~' : ''}${O.toFixed(2)}</b></span><span>სამართლიანი კოეფ. <b>${(1 / P0).toFixed(2)}</b></span>${!est ? `<span class="${ev >= 1 ? 'okc' : 'noc'}">${ev >= 1 ? `value +${Math.round((ev - 1) * 100)}%` : `ბუკმეკერის სასარგებლოდ ${Math.round((1 - ev) * 100)}%`}</span>` : ''}</div>
    ${warn}${split}
    <div class="mut small">„~“ — ბუკმეკერის კოეფიციენტი უცნობია, ნაჩვენებია სამართლიანი (1 ÷ ალბათობა). შენთან კოეფიციენტი შეიძლება ცოტა განსხვავდებოდეს.</div></div>`;
}
function pred(f) {
  if (!predCache.has(f.i)) { const pr = predict(f); const mk = buildMarkets(pr); predCache.set(f.i, { pr, mk, picks: aiPicks(mk, MIN, 20, f), vpicks: valuePicks(mk, f) }); }
  return predCache.get(f.i);
}

// -------------------------------------------------- ჩატვირთვა
async function j(url) { const r = await fetch(url + '?v=' + Date.now()); if (!r.ok) throw new Error(url); return r.json(); }
async function boot() {
  $('#view').innerHTML = '<div class="loading">მონაცემები იტვირთება…</div>';
  const cfg = await j('config.json');
  if (ARCH) cfg.season = ARCH;
  let state = {}; try { state = await j(BASE + 'state.json'); } catch (e) { }
  try { DB.h2h = await j('data/h2h.json'); } catch (e) { DB.h2h = {}; }
  try { DB.odds = ARCH ? {} : await j('data/odds.json'); } catch (e) { DB.odds = {}; }
  try { DB.coaches = ARCH ? {} : await j('data/coaches.json'); } catch (e) { DB.coaches = {}; }
  const comps = {}, players = {}, inj = {};
  await Promise.all(cfg.competitions.map(async c => {
    try { comps[c.code] = await j(`${BASE}comp/${c.code}.json`); } catch (e) { }
    try { players[c.code] = await j(`${BASE}players/${c.code}.json`); } catch (e) { }
    try { inj[c.code] = await j(`${BASE}injuries/${c.code}.json`); } catch (e) { }
  }));
  // არქივი: მხოლოდ ამ სეზონის მატჩები (1 ივლისი – 11 ივლისი, მსოფლიო ჩემპიონატამდე)
  if (ARCH) for (const d of Object.values(comps)) d.fixtures = d.fixtures.filter(f => f.d >= `${ARCH}-07-01` && f.d < `${ARCH + 1}-07-12`);
  indexData(cfg, comps, players, inj);
  DB.state = state;
  loadNumerology().then(() => { if (location.hash.includes('/m/') || location.hash.includes('/t/') || location.hash.includes('/p/')) render(); });
  if (ARCH) {
    document.body.classList.add('arch');
    $('#archbar').innerHTML = `📁 არქივი: <b>${ARCH}-${ARCH + 1}</b> სეზონი <a class="btn sm" href="./?archive=${ARCH}#/">სეზონის მიმოხილვა</a><a class="btn sm" href="./#/archive">სხვა სეზონები</a><a class="btn sm" href="./#/">← მიმდინარე სეზონი</a>`;
    document.querySelector('#nav a[data-r="home"]').setAttribute('href', './#/');
  }
  if (!DB.fixtures.length && location.hash.startsWith('#/archive')) { sidebar(); footer(); window.addEventListener('hashchange', render); render(); return; }
  if (!DB.fixtures.length) { $('#view').innerHTML = '<div class="empty">მონაცემები ჯერ არ არის. პირველი განახლება GitHub Actions-ში უნდა დასრულდეს.</div>'; return; }
  // ნაგულისხმევი თარიღი: დღეს, თუ სეზონის ფარგლებშია; თორემ ბოლო სათამაშო დღე
  const today = tbIso(Date.now()), first = tbIso(DB.fixtures[0].t), last = tbIso(DB.fixtures[DB.fixtures.length - 1].t);
  ST.sim = !!ARCH || !(today >= first && today <= last);
  ST.date = ST.sim ? lastMatchDay() : today;
  ST.range = [first, last];
  sidebar(); footer();
  window.addEventListener('hashchange', render);
  render();
  renderTicket();
}
function lastMatchDay() {
  // ბოლო დღე, სადაც ≥6 მატჩია (უპირატესობა — დეტალური სტატებით)
  for (const needSt of [true, false]) {
    const cnt = {};
    for (const f of DB.fixtures) if (isFin(f) && (!needSt || f.st)) { const d = tbIso(f.t); cnt[d] = (cnt[d] || 0) + 1; }
    const days = Object.keys(cnt).sort();
    for (let i = days.length - 1; i >= 0; i--) if (cnt[days[i]] >= 6) return days[i];
  }
  return tbIso(Date.now());
}

function sidebar() {
  const groups = { league: 'ლიგები', euro: 'ევროტურნირები', cup: 'თასები' };
  let h = '';
  for (const [g, t] of Object.entries(groups)) {
    const cs = DB.cfg.competitions.filter(c => c.group === g && DB.comps[c.code]);
    if (!cs.length) continue;
    h += `<div class="sgroup">${t}</div>` + cs.map(c => `<a href="#/c/${c.code}" data-c="${c.code}"><i class="flag">${esc(c.country.slice(0, 3))}</i>${esc(c.name)}</a>`).join('');
  }
  $('#side').innerHTML = h;
}
function footer() {
  const s = DB.state || {}, pg = s.progress;
  const upd = s.last_run ? new Date(s.last_run).toLocaleString('ka-GE', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  $('#foot').innerHTML = `<span>სეზონი ${DB.cfg.season}-${DB.cfg.season + 1}${ARCH ? ' · <b class="sim">არქივი</b>' : ST.sim ? ' · <b class="sim">საცდელი რეჟიმი</b>' : ''}</span>
    <span>ბოლო განახლება: ${upd}</span>${pg ? `<span>დეტალური სტატები: ${pg.detailed}/${pg.finished} მატჩი</span>` : ''}
    <span>ნუმეროლოგია: ${NUM.source === 'sheet' ? 'Google Sheet' : 'ჩაშენებული ასლი'}</span>
    <label class="booksel">კოეფიციენტები: <select id="bookSel"><option value="cb"${BOOK.mode === 'cb' ? ' selected' : ''}>Crystalbet (შეფასება)</option><option value="raw"${BOOK.mode !== 'cb' ? ' selected' : ''}>Bet365 (ორიგინალი)</option></select></label>
    <a class="btn sm" target="_blank" href="https://github.com/merseysidel/sportstats/actions/workflows/update.yml">⟳ განახლება</a>`;
}

// -------------------------------------------------- როუტერი
function clampDate() {
  if (!ST.range || !ST.date) return;
  if (ST.date < ST.range[0]) ST.date = ST.range[0];
  if (ST.date > ST.range[1]) ST.date = ST.range[1];
}
function render() {
  clampDate();
  const h = location.hash.replace(/^#\/?/, '').split('/');
  document.querySelectorAll('#side a').forEach(a => a.classList.toggle('on', h[0] === 'c' && a.dataset.c === h[1]));
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === (h[0] || 'home')));
  const v = $('#view');
  try {
    if (h[0] === 'm') v.innerHTML = matchView(+h[1]);
    else if (h[0] === 'c') v.innerHTML = compView(h[1]);
    else if (h[0] === 't') v.innerHTML = teamView(+h[1]);
    else if (h[0] === 'p') v.innerHTML = playerView(+h[1]);
    else if (h[0] === 'scan') v.innerHTML = scanView();
    else if (h[0] === 'cmp') v.innerHTML = compareView(h[1], h[2]);
    else if (h[0] === 'acc') { v.innerHTML = accView(); runAccuracy(); }
    else if (h[0] === 'archive') v.innerHTML = archiveList();
    else v.innerHTML = ARCH ? archiveHome() + homeView() : homeView();
  } catch (e) { console.error(e); v.innerHTML = `<div class="empty">შეცდომა: ${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, val = b.dataset.v;
  if (a === 'tk') { e.preventDefault(); e.stopPropagation(); toggleLeg(b.dataset.fid, b.dataset.g, b.dataset.l); const on = TK.legs.some(l => legKey(l) === b.dataset.fid + '|' + b.dataset.g + '|' + b.dataset.l); if (!b.closest('#ticket')) { b.classList.toggle('on', on); b.textContent = on ? '✓' : '+'; } return; }
  if (a === 'tkopen') { e.preventDefault(); $('#ticket').classList.toggle('open'); return; }
  if (a === 'tkclear') { e.preventDefault(); TK.legs = []; saveTK(); render(); return; }
  if (a === 'day') { const d = new Date(ST.date + 'T12:00:00'); d.setDate(d.getDate() + (+val)); ST.date = iso(d); ST.round = {}; render(); }
  if (a === 'home' && ARCH) { location.href = './#/'; return; }
  if (a === 'home') { ST.date = ST.sim ? lastMatchDay() : tbIso(Date.now()); ST.mode = 'list'; ST.tab = {}; location.hash = '#/'; render(); }
  if (a === 'today') { ST.date = ST.sim ? lastMatchDay() : tbIso(Date.now()); render(); }
  if (a === 'venue') { ST.venue = val; render(); }
  if (a === 'tab') { ST.tab[b.dataset.k] = val; render(); }
  if (a === 'mode') { ST.mode = val; render(); }
  if (a === 'bb') { ST.bb = { start: $('#bbStart').value || ST.date, days: +$('#bbDays').value, n: +$('#bbN').value }; render(); setTimeout(() => $('#bb')?.scrollIntoView({ behavior: 'smooth' }), 50); return; }
  if (a === 'round') { ST.round[b.dataset.c] = +val; render(); }
  if (a === 'nextday') { ST.date = nearestDay(+val); render(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'dpick' && e.target.value) { ST.date = e.target.value; ST.round = {}; render(); }
  if (e.target.id === 'bookSel') { BOOK.mode = e.target.value; try { localStorage.setItem('ss_book', BOOK.mode); } catch (er) { } predCache.clear(); render(); renderTicket(); return; }
  if (e.target.matches('.roundsel')) { ST.round[e.target.dataset.c] = +e.target.value; render(); }
  if (e.target.matches('.scanf')) { ST.scan = Object.fromEntries([...document.querySelectorAll('.scanf')].map(x => [x.name, x.value])); render(); }
  if (e.target.matches('.cmpf')) { const a = $('#cmpA').value, b = $('#cmpB').value; location.hash = `#/cmp/${a}/${b}`; }
});
function nearestDay(dir) {
  const t = dayStart(ST.date);
  const list = DB.fixtures.map(f => tbIso(f.t));
  if (dir > 0) return list.find(d => dayStart(d) > t) || ST.date;
  return [...list].reverse().find(d => dayStart(d) < t) || ST.date;
}

const seg = (k, opts, cur) => `<div class="seg">${opts.map(([v, t]) => `<button data-act="${k}" data-v="${v}" class="${cur === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
const tabs = (key, list, cur) => `<div class="tabs">${list.map(([v, t]) => `<button data-act="tab" data-k="${key}" data-v="${v}" class="${cur === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;

// -------------------------------------------------- მთავარი: დღის მატჩები
function dateBar() {
  const d = new Date(ST.date + 'T12:00:00');
  return `<div class="datebar">
    <button class="btn" data-act="nextday" data-v="-1" title="წინა სათამაშო დღე">⏮</button>
    <button class="btn" data-act="day" data-v="-1">◀</button>
    <label class="dlab"><b>${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}</b><input id="dpick" type="date" value="${ST.date}" min="${ST.range?.[0] || ''}" max="${ST.range?.[1] || ''}"></label>
    <button class="btn" data-act="day" data-v="1">▶</button>
    <button class="btn" data-act="nextday" data-v="1" title="შემდეგი სათამაშო დღე">⏭</button>
    <button class="btn ghost" data-act="today">${ST.sim ? 'ბოლო ტური' : 'დღეს'}</button>
  </div>`;
}
// -------------------------------------------------- ფსონის ამწყობი
function builder() {
  const b = ST.bb || { start: ST.date, days: 1, n: 3 };
  let h = `<div class="card builder" id="bb"><h3>🎟️ ფსონის ამწყობი</h3><div class="filters">
    <label>საწყისი დღე<input type="date" id="bbStart" value="${b.start}" min="${ST.range?.[0] || ''}" max="${ST.range?.[1] || ''}"></label>
    <label>დღეების რაოდენობა<select id="bbDays">${[1, 2, 3].map(d => `<option${d === b.days ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
    <label>ფსონი ბილეთში<select id="bbN">${[2, 3, 4, 5, 6, 7, 8].map(d => `<option${d === b.n ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
    <label>&nbsp;<button class="btn acc" data-act="bb">🤖 ააწყე ბილეთი</button></label></div>`;
  if (!ST.bb) return h + `<div class="mut small" style="margin-top:8px">აირჩიე დღეები (მაქს. 3) და AI 3 ვარიანტს ააწყობს: საიმედო, ბალანსი და მაღალი კოეფიციენტი. თითო მატჩიდან მაქსიმუმ 1 ფსონი.</div></div>`;
  const t0 = dayStart(b.start), t1 = t0 + b.days * 864e5;
  const fx = DB.fixtures.filter(f => f.t >= t0 && f.t < t1);
  const per = fx.map(f => ({ f, picks: pred(f).picks.map(p => ({ ...p, o: p.odd || p.est })) })).filter(x => x.picks.length);
  const ticket = (title, desc, chooser, sorter) => {
    const legs = per.map(x => { const c = chooser(x.picks); return c ? { f: x.f, p: c } : null; }).filter(Boolean).sort(sorter).slice(0, b.n);
    if (legs.length < b.n) return `<div class="ticket"><h4>${title}</h4><div class="mut small">საკმარისი ფსონი ვერ მოიძებნა (${legs.length}/${b.n}).</div></div>`;
    const P0 = legs.reduce((s, l) => s * l.p.p, 1), O = legs.reduce((s, l) => s * l.p.o, 1), est = legs.some(l => !l.p.odd);
    const ch = legs.map(l => checkItem(l.f, l.p)), done = ch.every(c => c != null);
    return `<div class="ticket"><h4>${title}</h4><small class="mut">${desc}</small>${legs.map((l, i) => `<a class="leg" href="#/m/${l.f.i}"><span>${dlabel(l.f.t)} ${hhmm(l.f.t)}<b>${esc(tn(l.f.h))} – ${esc(tn(l.f.a))}</b></span><span>${esc(pickName(l.p))}</span><span class="pct ${pcls(l.p.p)}">${P(l.p.p)}</span><span class="odd">${l.p.odd ? l.p.odd.toFixed(2) : '~' + l.p.o.toFixed(2)}</span><span>${ch[i] == null ? '' : ch[i] ? '✅' : '❌'}</span></a>`).join('')}
      <div class="tsum"><span>ერთიანი ალბათობა <b>${P(P0)}</b></span><span>ჯამური კოეფ. <b>${est ? '~' : ''}${O.toFixed(2)}</b></span>${done ? `<span class="${ch.every(Boolean) ? 'okc' : 'noc'}"><b>${ch.every(Boolean) ? '✅ ბილეთი მოიგო' : '❌ ბილეთი წააგო'}</b></span>` : ''}</div>
      ${P0 < 0.3 ? `<div class="tw bad">⚠️ ბილეთი მხოლოდ ${P(P0)}-ით დაჯდება — ზედმეტად გრძელია, შეამცირე ფსონების რაოდენობა.</div>` : P0 < 0.5 ? `<div class="tw mid">საშუალო რისკი: ${P(P0)}.</div>` : ''}
      <div style="margin-top:6px">${legs.map(l => addBtn(l.f, l.p)).join('')} <small class="mut">← ფსონების ჩემს ბილეთში დამატება</small></div></div>`;
  };
  h += `<div class="tickets">`;
  h += ticket('🛡️ საიმედო', 'ყველაზე მაღალი ალბათობის ფსონები', ps => ps.reduce((a, c) => c.p > a.p ? c : a), (a, b) => b.p.p - a.p.p);
  h += ticket('⚖️ ბალანსი', 'ალბათობა × კოეფიციენტი — საუკეთესო თანაფარდობა', ps => { const q = ps.filter(p => p.p >= 0.72); return q.length ? q.reduce((a, c) => c.p * c.o > a.p * a.o ? c : a) : null; }, (a, b) => b.p.p * b.p.o - a.p.p * a.p.o);
  h += ticket('🚀 მაღალი კოეფიციენტი', 'ყველაზე მაღალი კოეფიციენტები 70%+ ალბათობით', ps => ps.reduce((a, c) => c.o > a.o ? c : a), (a, b) => b.p.o - a.p.o);
  h += `</div><div class="mut small">ერთიანი ალბათობა = ფსონების ალბათობების ნამრავლი (მატჩები ერთმანეთზე დამოუკიდებლად ითვლება). „~“ — ბუკმეკერის ხაზი არ არის, ნაჩვენებია სამართლიანი კოეფიციენტი.</div>`;
  return h + `</div>`;
}

function homeView() {
  const t0 = dayStart(ST.date), t1 = t0 + 864e5;
  const fx = DB.fixtures.filter(f => f.t >= t0 && f.t < t1);
  let h = `<div class="head"><h1>დღის მატჩები</h1>${seg('mode', [['list', 'მატჩები'], ['picks', 'AI ფსონები'], ['value', '💎 Value']], ST.mode)}</div>` + dateBar();
  if (ST.sim) h += `<div class="note">${ARCH ? '📁 არქივი' : '🧪 საცდელი რეჟიმი'}: ${DB.cfg.season}-${DB.cfg.season + 1} სეზონი. პროგნოზი ითვლება მხოლოდ მატჩამდე არსებული მონაცემებით, ამიტომ ✅/❌ რეალურ შედეგს უჩვენებს.</div>`;
  if (!fx.length) return h + `<div class="empty">ამ დღეს ჩვენს ტურნირებში მატჩი არ არის. გამოიყენე ⏮ ⏭ უახლოესი სათამაშო დღისთვის.</div>` + builder();
  if (ST.mode === 'picks' || ST.mode === 'value') {
    const all = [];
    for (const f of fx) { const { pr, picks, vpicks } = pred(f); for (const p of (ST.mode === 'value' ? vpicks : picks)) all.push({ f, pr, p }); }
    if (ST.mode === 'value') {
      all.sort((a, b) => b.p.value - a.p.value);
      h += `<div class="note">💎 Value: კოეფიციენტი 1.50–2.50, მოდელის ალბათობა 55%+ და ბუკმეკერის შეფასებაზე 4–80%-ით მაღალი. ცალკე ფსონი ნაკლებად სანდოა, ვიდრე 70%+, მაგრამ გრძელვადიან მოგებას სწორედ ასეთი ფსონები იძლევა.</div>`;
      if (!all.length) return h + `<div class="empty">ამ დღეს value ფსონი ვერ მოიძებნა (ან კოეფიციენტები ჯერ არ არის ჩატვირთული).</div>` + builder();
      return h + `<div class="card">` + all.map(({ f, p }) => { const c = checkItem(f, p);
        return `<a class="pickrow" href="#/m/${f.i}"><span class="tm">${addBtn(f, p)}${hhmm(f.t)}</span><span class="pm">${esc(tn(f.h))} – ${esc(tn(f.a))}<small>${esc(compName(f.c))}</small></span><span class="pk">${esc(pickName(p))}<small>value +${Math.round(p.value * 100)}% · მოდელი ${P(p.pm ?? p.p)} · ბუკმეკერი ${P(p.pb ?? 1 / p.odd)}</small></span><span class="pct ${pcls(p.p)}">${P(p.p)}</span><span class="odd">${p.odd.toFixed(2)}</span>${c == null ? '<span class="ck"></span>' : `<span class="ck ${c ? 'ok' : 'no'}">${c ? '✅' : '❌'}</span>`}</a>`; }).join('') + `</div>` + builder();
    }
    all.sort((a, b) => b.p.p - a.p.p);
    const hits = all.map(x => checkItem(x.f, x.p)).filter(x => x != null);
    if (hits.length) h += `<div class="kpis"><div><b>${hits.filter(Boolean).length}/${hits.length}</b><span>გამართლდა</span></div><div><b>${P(hits.filter(Boolean).length / hits.length)}</b><span>სიზუსტე</span></div></div>`;
    return h + `<div class="card">` + all.map(({ f, pr, p }) => {
      const c = checkItem(f, p);
      return `<a class="pickrow" href="#/m/${f.i}"><span class="tm">${addBtn(f, p)}${hhmm(f.t)}</span><span class="pm">${esc(tn(f.h))} – ${esc(tn(f.a))}<small>${esc(compName(f.c))}</small></span>
        <span class="pk">${esc(pickName(p))}<small>${esc(p.group.replace(/\s*\(.*\)$/, ''))} ${relTag(p)}</small></span><span class="pct ${pcls(p.p)}">${P(p.p)}</span><span class="odd">${p.odd ? p.odd.toFixed(2) : p.est ? '~' + p.est.toFixed(2) : '—'}</span>${c == null ? '<span class="ck"></span>' : `<span class="ck ${c ? 'ok' : 'no'}">${c ? '✅' : '❌'}</span>`}</a>`;
    }).join('') + `</div>` + builder();
  }
  const byComp = {};
  for (const f of fx) (byComp[f.c] ||= []).push(f);
  for (const c of DB.cfg.competitions.map(c => c.code)) {
    if (!byComp[c]) continue;
    h += `<div class="card"><a class="chead" href="#/c/${c}"><i class="flag">${esc(DB.comps[c].country.slice(0, 3))}</i>${esc(compName(c))}</a>`;
    for (const f of byComp[c]) h += matchRow(f);
    h += `</div>`;
  }
  return h + builder();
}

// -------------------------------------------------- არქივი
function archiveList() {
  const list = DB.cfg.archive || [];
  return `<div class="head"><h1>📁 არქივი</h1></div><div class="note">აქ ინახება დასრულებული სეზონები სრული სტატისტიკით — ცხრილები და მატჩები ტურების მიხედვით, AI ფსონების შედეგებით.</div>
    <div class="seasons">${list.map(y => `<a class="season" href="./?archive=${y}#/"><b>${y}-${y + 1}</b><span>სრული სეზონი · 16 ტურნირი</span></a>`).join('')}</div>`;
}
function archiveHome() {
  const end = Infinity;
  let h = `<div class="head"><h1>📁 სეზონი ${ARCH}-${ARCH + 1}</h1></div><div class="seasongrid">`;
  for (const c of DB.cfg.competitions) {
    const C = DB.comps[c.code]; if (!C) continue;
    const fx = C.doc.fixtures.map(x => DB.byId[x.i]).filter(Boolean);
    const fin = fx.filter(isFin);
    let top = '';
    if (c.group === 'league') {
      const t = standings(c.code, end).slice(0, 3);
      top = t.map((r, i) => `<div class="st3"><span>${i + 1}</span>${logo(r.t)}${esc(tn(r.t))}<b>${r.pts}</b></div>`).join('');
    } else {
      const fin2 = [...fin].sort((a, b) => b.t - a.t)[0];
      if (fin2) { const w = fin2.w?.[0] ? fin2.h : fin2.w?.[1] ? fin2.a : (fin2.g[0] > fin2.g[1] ? fin2.h : fin2.a); top = `<div class="st3">🏆 ${logo(w)}${esc(tn(w))}</div><div class="mut small">${esc(roundName(fin2.r))}: ${esc(tn(fin2.h))} ${fin2.g[0]}–${fin2.g[1]} ${esc(tn(fin2.a))}</div>`; }
    }
    h += `<a class="card scard" href="#/c/${c.code}"><div class="chead"><i class="flag">${esc(c.country.slice(0, 3))}</i>${esc(c.name)}<span class="mut small" style="margin-left:auto">${fin.length} მატჩი</span></div>${top}</a>`;
  }
  return h + `</div><h2 class="sub">დღის მატჩები</h2>`;
}

// -------------------------------------------------- მატჩის გვერდი
function matchView(id) {
  const f = DB.byId[id]; if (!f) return '<div class="empty">მატჩი ვერ მოიძებნა</div>';
  const { pr, mk, picks } = pred(f);
  const fin = isFin(f), tab = ST.tab.m || 'ov';
  let h = `<div class="mhead">
    <div class="mcomp"><a href="#/c/${f.c}">${esc(compName(f.c))}</a> · ${esc(roundName(f.r))} · ${dlabel(f.t)} ${hhmm(f.t)}${f.ref ? ` · მსაჯი: ${esc(f.ref)}` : ''}</div>
    <div class="mteams"><a href="#/t/${f.h}">${logo(f.h, 'lgb')}<b>${esc(tn(f.h))}</b></a>
    <div class="mscore">${fin ? `${f.g[0]} – ${f.g[1]}${f.ht[0] != null ? `<small>(${f.ht[0]}–${f.ht[1]})</small>` : ''}` : '<span>VS</span>'}</div>
    <a href="#/t/${f.a}">${logo(f.a, 'lgb')}<b>${esc(tn(f.a))}</b></a></div>
    <div class="bar3"><i style="width:${pr.p1 * 100}%">${P(pr.p1)}</i><i style="width:${pr.px * 100}%">${P(pr.px)}</i><i style="width:${pr.p2 * 100}%">${P(pr.p2)}</i></div>
    <div class="xg">მოსალოდნელი გოლები: <b>${f1(pr.lh)}</b> – <b>${f1(pr.la)}</b> · კუთხურები: <b>${f1(pr.ch)}</b> – <b>${f1(pr.ca)}</b> · ყვითლები: <b>${f1(pr.yh)}</b> – <b>${f1(pr.ya)}</b></div>
  </div>`;
  h += tabs('m', [['ov', 'მიმოხილვა'], ['res', 'შედეგი'], ['st', 'სტატისტიკა'], ['ot', 'სხვა'], ['cmp', 'შედარება'], ['h2h', 'H2H'], ['num', 'ნუმეროლოგია']], tab);
  if (tab === 'ov') h += overview(f, pr, mk, picks);
  if (tab === 'res') h += marketGroups(f, mk.R);
  if (tab === 'st') h += marketGroups(f, mk.ST);
  if (tab === 'ot') h += marketGroups(f, mk.OT) + `<div class="note">მოთამაშეების ალბათობა ითვლება სეზონის გოლების/დარტყმების/ბარათების წილიდან, საშუალო წუთებიდან და გუნდის მოსალოდნელი გოლებიდან. დაზიანებულები გამოკლებულია.</div>`;
  if (tab === 'cmp') h += comparison(f.h, f.a, f.t, true);
  if (tab === 'h2h') h += h2h(f);
  if (tab === 'num') h += numerologyMatch(f);
  return h;
}

function numSentence(f) {
  const ch = findClub(tn(f.h)), ca = findClub(tn(f.a));
  if (!ch || !ca || !ch.date || !ca.date) return '';
  const d = dayBase(f.d), nh = combine(base(ch.date), d), na = combine(base(ca.date), d);
  return `ნუმეროლოგიურად ${tn(f.h)}-ს მატჩის დღეს უწევს <b>${esc(nh)}</b>, ${tn(f.a)}-ს — <b>${esc(na)}</b>. <span class="mut">(რიცხვების მნიშვნელობებს და თავსებადობის წესებს მოგვიანებით დავამატებთ.)</span>`;
}

function overview(f, pr, mk, picks) {
  let h = `<div class="grid2"><div>`;
  h += `<div class="card"><h3>🤖 AI ფსონები <small>(${Math.round(MIN * 100)}%+ ალბათობა)</small></h3>`;
  if (!picks.length) h += `<div class="empty sm">ამ მატჩზე ${Math.round(MIN * 100)}%-ზე მაღალი ალბათობის ფსონი ვერ მოიძებნა.</div>`;
  for (const p of picks) {
    const c = checkItem(f, p);
    h += `<div class="pick"><div class="ph">${addBtn(f, p)}<span class="pct big ${pcls(p.p)}">${P(p.p)}</span><div><b>${esc(pickName(p))}</b><small>${esc(p.group)} ${relTag(p)}</small>${blendTag(p)}</div>${p.odd ? `<span class="oddbox"><b>${p.odd.toFixed(2)}</b><small>${esc(p.book)}${p.value > 0.02 ? ` · value +${Math.round(p.value * 100)}%` : ''}</small></span>` : p.est ? `<span class="oddbox"><b class="mut">~${p.est.toFixed(2)}</b><small>სამართლიანი (ბუკ. ხაზი არ არის)</small></span>` : ''}${c == null ? '' : `<span class="ck ${c ? 'ok' : 'no'}">${c ? '✅ გამართლდა' : '❌ ვერ გამართლდა'}</span>`}</div>
      <p>${esc(explainPick(pr, p))}</p></div>`;
  }
  const vp = pred(f).vpicks;
  if (vp.length) h += `</div><div class="card"><h3>💎 Value ფსონები <small>(1.50–2.50, მოდელი > ბუკმეკერი)</small></h3>${vp.map(p => { const c = checkItem(f, p);
    return `<div class="pick"><div class="ph">${addBtn(f, p)}<span class="pct big ${pcls(p.p)}">${P(p.p)}</span><div><b>${esc(pickName(p))}</b><small>${esc(p.group)} ${relTag(p)}</small>${blendTag(p)}</div><span class="oddbox"><b>${p.odd.toFixed(2)}</b><small>${esc(p.book)} · value +${Math.round(p.value * 100)}%</small></span>${c == null ? '' : `<span class="ck ${c ? 'ok' : 'no'}">${c ? '✅' : '❌'}</span>`}</div><p>${esc(explainPick(pred(f).pr, p))}</p></div>`; }).join('')}`;
  const ns = numSentence(f);
  if (ns) h += `<div class="pick num"><div class="ph"><span class="pct big">🔢</span><div><b>ნუმეროლოგია (1X2 / ორმაგი შანსი)</b></div></div><p>${ns}</p></div>`;
  h += `</div>`;
  // ძირითადი ალბათობები
  const kp = [['1', pr.p1], ['X', pr.px], ['2', pr.p2], ['1X', pr.p1 + pr.px], ['X2', pr.px + pr.p2], ['მეტი 2.5', pr.over(pr.tot, 2.5)], ['BTTS კი', (1 - pr.hF[0]) * (1 - pr.aF[0])], ['კუთხ. მეტი 9.5', pr.over(pr.corT, 9.5)], ['ყვით. მეტი 3.5', pr.over(pr.ycT, 3.5)]];
  h += `<div class="card"><h3>ძირითადი ალბათობები</h3><div class="kgrid">${kp.map(([l, p]) => `<div class="${pcls(p)}"><span>${l}</span><b>${P(p)}</b></div>`).join('')}</div>
    <div class="scores">${pr.scores.slice(0, 5).map(([s, p]) => `<span>${s} <b>${P(p)}</b></span>`).join('')}</div></div>`;
  h += `</div><div>`;
  h += contextCard(f);
  // დაზიანებები
  for (const [tid, rows] of [[f.h, 'h'], [f.a, 'a']]) {
    const abs = keyAbsences(tid, f.t, f), all = DB.injuries.filter(r => r[3] === f.i && r[2] === tid);
    h += `<div class="card"><h3>${logo(tid)} ${esc(tn(tid))} — არ თამაშობენ</h3>`;
    if (abs.length) h += abs.map(a => `<div class="abs ${a.big ? 'big' : ''}">${a.big ? '⚠️ ' : ''}${esc(a.txt)}</div>`).join('');
    const rest = all.filter(r => !abs.some(a => a.name === r[1]));
    if (rest.length) h += `<div class="mut small">${rest.map(r => `${esc(r[1])} (${esc(r[6] || r[5])})`).join(', ')}</div>`;
    if (!all.length) h += `<div class="mut small">ინფორმაცია არ არის</div>`;
    h += `</div>`;
  }
  // მსაჯი
  const rf = pr.ref;
  h += `<div class="card"><h3>👨‍⚖️ მსაჯი${rf ? ': ' + esc(rf.name) : ''}</h3>${rf && rf.n ? `<div class="kgrid">
    <div><span>მატჩი</span><b>${rf.n}</b></div><div><span>ჯარიმა/მატჩი</span><b>${f1(rf.foul)}</b></div><div><span>ყვითელი/მატჩი</span><b>${f1(rf.yc)}</b></div><div><span>წითელი/მატჩი</span><b>${f1(rf.rc)}</b></div><div><span>პენალტი/მატჩი</span><b>${f1(rf.pen)}</b></div></div>` : '<div class="mut small">მსაჯის მონაცემი ჯერ არ არის</div>'}</div>`;
  const hs = h2hSummary(f, h2hData(f));
  if (hs) h += `<div class="card"><h3>🤝 H2H (${hs.n} მატჩი)</h3><div class="kgrid"><div><span>${esc(tn(f.h))}</span><b>${hs.w}</b></div><div><span>ფრე</span><b>${hs.d}</b></div><div><span>${esc(tn(f.a))}</span><b>${hs.l}</b></div><div><span>გოლები/მატჩი</span><b>${f1(hs.avg)}</b></div><div><span>მეტი 2.5</span><b>${P(hs.o25)}</b></div><div><span>BTTS</span><b>${P(hs.btts)}</b></div></div></div>`;
  // traits + patterns
  for (const [tid, ven] of [[f.h, 'home'], [f.a, 'away']]) {
    const tr = traits(tid, f.t), pt = patterns(tid, f.t, ven);
    const sc = scenarios(tid, f.t, ven);
    h += `<div class="card"><h3>${logo(tid)} ${esc(tn(tid))}</h3>${traitChips(tr)}${pt.length ? `<ul class="pat">${pt.map(p => `<li class="${p.tone}">${esc(p.txt)}</li>`).join('')}</ul>` : ''}
      ${sc.length ? `<details class="scen"><summary>🎬 სცენარები (${ven === 'home' ? 'შინ' : 'გასვლაზე'})</summary>${scenList(sc)}</details>` : ''}</div>`;
  }
  return h + `</div></div>`;
}
const scenList = sc => sc.map(x => `<div class="scn ${x.tone}"><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div>`).join('');
function contextCard(f) {
  let h = `<div class="card"><h3>📋 მატჩის კონტექსტი</h3><table class="ctx"><thead><tr><th></th><th>${logo(f.h)} ${esc(tn(f.h))}</th><th>${logo(f.a)} ${esc(tn(f.a))}</th></tr></thead><tbody>`;
  const R = [restInfo(f.h, f), restInfo(f.a, f)], M = [motivation(f.h, f), motivation(f.a, f)], C = [coachInfo(f.h, f.t), coachInfo(f.a, f.t)];
  const restTxt = r => r.partial ? `<span class="mut">უცნობია</span><small>ამ გუნდის ლიგის მატჩები ჩვენს ბაზაში არ არის</small>` : r.prev ? `<b>${f1(r.days)} დღე</b><small>ბოლო: ${dlabel(r.prev.t)}, ${esc(tn(r.prev.h))} – ${esc(tn(r.prev.a))} · ${esc(compName(r.prev.c))}</small>` : '—';
  h += `<tr><td>დასვენება</td>${R.map(restTxt).map(x => `<td>${x}</td>`).join('')}</tr>`;
  h += `<tr><td>ბოლო 14 დღეში</td>${R.map(r => `<td>${r.partial ? '—' : r.last14 + ' მატჩი'}</td>`).join('')}</tr>`;
  h += `<tr><td>შემდეგი მატჩი</td>${R.map(r => `<td>${r.next ? `${f1(r.nextDays)} დღეში<small>${esc(tn(r.next.h))} – ${esc(tn(r.next.a))} · ${esc(compName(r.next.c))}</small>` : '—'}</td>`).join('')}</tr>`;
  h += `<tr><td>მოტივაცია</td>${M.map(m => `<td>${m ? `<span class="trait ${m.tone}">${esc(m.label)}</span>${m.lines.map(l => `<small>${esc(l)}</small>`).join('')}` : '—'}</td>`).join('')}</tr>`;
  h += `<tr><td>მწვრთნელი</td>${C.map(c => `<td>${c ? `<b>${esc(c.name)}</b><small>${c.start ? 'დან ' + fmtDate(c.start) : ''}</small>${c.change ? `<small class="${c.change.ppg >= c.change.ppg0 ? 'okc' : 'noc'}">ახალი მწვრთნელით: ${c.change.n} მატჩი, ${c.change.w}-${c.change.d}-${c.change.l}, ${f1(c.change.ppg)} ქულა/მატჩი (მანამდე ${f1(c.change.ppg0)})</small>` : ''}` : '—'}</td>`).join('')}</tr>`;
  h += `</tbody></table>`;
  const tags = R.flatMap((r, i) => r.tags.map(t => ({ ...t, team: i ? f.a : f.h })));
  if (tags.length) h += `<div class="chips" style="margin-top:8px">${tags.map(t => `<span class="trait ${t.tone}">${esc(tn(t.team))}: ${esc(t.t)}</span>`).join('')}</div>`;
  return h + `<div class="mut small">ეს ინფორმაცია პროცენტებზე გავლენას არ ახდენს — მხოლოდ შენი გადაწყვეტილებისთვისაა.</div></div>`;
}
function explainPick(pr, p) {
  if (p.pl && p.fam !== 'ps') {
    const x = p.pl; const m = { pa: `${x.a} ასისტი`, psot: `${x.sot} კარში დარტყმა`, pyc: `${x.yc} ყვითელი` }[p.fam];
    return `${x.name}: ${m} ${x.apps} მატჩში (საშუალოდ ${Math.round(x.mpg)} წუთი).`;
  }
  return explain(pr, p);
}
const traitChips = tr => tr.length ? `<div class="chips">${tr.map(t => `<span class="trait ${t.tone}" title="${esc(t.why)}">${esc(t.label)}<small>${esc(t.why)}</small></span>`).join('')}</div>` : '<div class="mut small">მკაფიო თვისება ჯერ ვერ გამოვლინდა</div>';

function marketGroups(f, groups) {
  return `<div class="mgrid">` + groups.map(g => `<div class="card mg"><h4>${esc(g.title)}</h4>${g.note ? `<div class="mut small">${esc(g.note)}</div>` : ''}${g.items.map(it => {
    const c = checkItem(f, it), o = oddsFor(f, it);
    const ot = o && o.odd ? `<u class="${o.odd * (it.pm ?? it.p) > 1.03 ? 'val' : ''}" title="${esc(o.book)}">${o.odd.toFixed(2)}</u>` : o && o.absent ? '<u class="mut" title="ბუკმეკერი არ სთავაზობს">—</u>' : '<u></u>';
    return `<div class="mi ${pcls(it.p)}">${addBtn(f, it, g.title)}<span>${esc(it.label)}</span><span class="pb"><i style="width:${Math.round(it.p * 100)}%"></i></span><b title="${it.pm != null ? `მოდელი ${P(it.pm)} · ბუკმეკერი ${P(it.pb)}` : 'მხოლოდ მოდელი'}">${P(it.p)}</b>${ot}${c == null ? '<em></em>' : `<em>${c ? '✅' : '❌'}</em>`}</div>`;
  }).join('')}</div>`).join('') + `</div>`;
}

// -------------------------------------------------- შედარება
const METRICS = [
  ['ppg', 'ქულა მატჩში', f1], ['gf', 'გატანილი', f1], ['ga', 'გაშვებული', f1], ['xg', 'xG', f1], ['xga', 'xGA (მეტოქის xG)', f1],
  ['o25', 'მეტი 2.5 გოლი', P], ['btts', 'ორივე იტანს', P], ['cs', 'მშრალი მატჩი', P], ['fts', 'ვერ გაიტანა', P],
  ['sh', 'დარტყმა', f1], ['sot', 'კარში დარტყმა', f1], ['sota', 'კარში დარტყმა (მეტოქე)', f1], ['inb', 'საჯარიმოდან დარტყმა', f1], ['blk', 'დაბლოკილი დარტყმა', f1],
  ['cor', 'კუთხური', f1], ['cora', 'კუთხური (მეტოქე)', f1], ['totCor', 'კუთხური მატჩში სულ', f1],
  ['poss', 'ბურთის ფლობა %', f1], ['ppct', 'პასის სიზუსტე %', f1], ['foul', 'ჯარიმა', f1], ['foula', 'ჯარიმა (მეტოქე)', f1],
  ['yc', 'ყვითელი', f1], ['totYc', 'ყვითელი მატჩში სულ', f1], ['rc', 'წითელი', v => v == null ? '—' : v.toFixed(2)], ['off', 'ოფსაიდი', f1],
  ['firstPct', 'პირველი იტანს', P], ['sfWin', 'მოგება, როცა პირველი იტანს', P], ['g1', '1-ლი ტაიმის გოლები', f1], ['g2', 'მე-2 ტაიმის გოლები', f1],
];
function comparison(a, b, before, matchMode) {
  const v = ST.venue;
  const ra = teamRows(a, before, matchMode ? (v === 'venue' ? 'home' : v) : v), rb = teamRows(b, before, matchMode ? (v === 'venue' ? 'away' : v) : v);
  const A = aggregate(ra), B = aggregate(rb);
  const opts = matchMode ? [['all', 'ტოტალი'], ['venue', 'შინ vs გასვლა'], ['home', 'ორივე შინ'], ['away', 'ორივე გასვლაზე']] : [['all', 'ტოტალი'], ['home', 'შინ'], ['away', 'გასვლა']];
  let h = `<div class="card"><div class="head">${seg('venue', opts, v)}<span class="mut small">${A.n} და ${B.n} მატჩი</span></div>
    <table class="cmp"><thead><tr><th>${tlink(a)}</th><th></th><th>${tlink(b)}</th></tr></thead><tbody>
    <tr><td>${form(A.form)}</td><td>ფორმა</td><td>${form(B.form)}</td></tr>
    <tr><td>${A.w}-${A.d}-${A.l}</td><td>მ-ფ-წ</td><td>${B.w}-${B.d}-${B.l}</td></tr>`;
  for (const [k, l, fm] of METRICS) {
    const x = A[k], y = B[k]; const better = x == null || y == null ? 0 : x > y ? 1 : x < y ? -1 : 0;
    h += `<tr><td class="${better > 0 ? 'hi' : ''}">${fm(x)}</td><td>${l}</td><td class="${better < 0 ? 'hi' : ''}">${fm(y)}</td></tr>`;
  }
  h += `<tr><td>${bucketBar(A.gForB, A.gForN)}</td><td>გოლების წუთები<br><small class="mut">0-15 … 76-90</small></td><td>${bucketBar(B.gForB, B.gForN)}</td></tr>`;
  return h + `</tbody></table></div>`;
}
const form = fm => `<span class="form">${(fm || []).map(r => `<i class="${r}">${{ W: 'მ', D: 'ფ', L: 'წ' }[r]}</i>`).join('')}</span>`;
const bucketBar = (b, n) => n ? `<span class="bk">${b.map(x => `<i style="height:${Math.round(x / Math.max(...b, 1) * 100)}%" title="${x}"></i>`).join('')}</span>` : '—';

function h2hData(f) {
  const key = [f.h, f.a].sort((x, y) => x - y).join('-');
  const ext = (DB.h2h || {})[key];
  if (ext) return ext.filter(r => r[0] < f.d.slice(0, 10));
  // ჩვენი ბაზიდან (მიმდინარე სეზონი)
  return DB.fixtures.filter(x => isFin(x) && x.t < f.t && ((x.h === f.h && x.a === f.a) || (x.h === f.a && x.a === f.h)))
    .map(x => [x.d.slice(0, 10), x.h, x.a, x.g[0], x.g[1], compName(x.c), tn(x.h), tn(x.a), x.ht[0], x.ht[1], null, null, DB.comps[x.c].group === 'cup' ? 1 : 0]).reverse();
}
function h2hSummary(f, list) {
  const n = list.length; if (!n) return null;
  let w = 0, d = 0, l = 0, g = 0, o25 = 0, btts = 0;
  for (const r of list) {
    const hg = r[1] === f.h ? r[3] : r[4], ag = r[1] === f.h ? r[4] : r[3];
    if (hg > ag) w++; else if (hg < ag) l++; else d++;
    g += r[3] + r[4]; if (r[3] + r[4] > 2.5) o25++; if (r[3] > 0 && r[4] > 0) btts++;
  }
  return { n, w, d, l, avg: g / n, o25: o25 / n, btts: btts / n };
}
function h2h(f) {
  const list = h2hData(f), s = h2hSummary(f, list);
  const ext = !!(DB.h2h || {})[[f.h, f.a].sort((x, y) => x - y).join('-')];
  let h = `<div class="card"><h3>პირისპირ ${ext ? `(ბოლო ${DB.cfg.h2h_years || 15} წელი)` : '(ჩვენს ბაზაში)'}</h3>`;
  if (s) h += `<div class="kgrid">
    <div><span>მატჩი</span><b>${s.n}</b></div><div><span>${esc(tn(f.h))} მოიგო</span><b>${s.w}</b></div><div><span>ფრე</span><b>${s.d}</b></div><div><span>${esc(tn(f.a))} მოიგო</span><b>${s.l}</b></div>
    <div><span>გოლები/მატჩი</span><b>${f1(s.avg)}</b></div><div><span>მეტი 2.5</span><b>${P(s.o25)}</b></div><div><span>ორივე იტანს</span><b>${P(s.btts)}</b></div></div><div style="height:10px"></div>`;
  h += list.length ? `<table class="tbl"><thead><tr><th>თარიღი</th><th>მატჩი</th><th>ანგარიში</th><th>ტაიმი</th><th>ტურნირი <span class="mut">(🏆 = თასი)</span></th></tr></thead><tbody>${list.map(r => `<tr><td>${fmtDate(r[0])}</td><td>${esc(r[6])} – ${esc(r[7])}</td><td><b>${r[3]}–${r[4]}</b></td><td class="mut">${r[8] != null ? `${r[8]}–${r[9]}` : ''}</td><td class="mut">${r[11] ? `<img class="lg" src="${esc(r[11])}" alt="" loading="lazy"> ` : ''}${r[12] ? '<span class="cup" title="თასის მატჩი">🏆</span> ' : ''}${esc(r[5])}</td></tr>`).join('')}</tbody></table>` : '<div class="mut small">ერთმანეთს ჯერ არ შეხვედრიან.</div>';
  if (!ext) h += `<div class="note">${DB.cfg.h2h_years || 15}-წლიანი H2H ავტომატურად ჩაიტვირთება მატჩამდე ${DB.cfg.h2h_days_ahead || 7} დღით ადრე.</div>`;
  return h + `</div>`;
}

// -------------------------------------------------- ნუმეროლოგია
function numerologyMatch(f) {
  const d = dayBase(f.d), yb = base(f.d.slice(0, 4));
  let h = `<div class="card"><p>მატჩის თარიღი: <b>${fmtDate(f.d)}</b> → დღის რიცხვი <b>${esc(d.t)}</b> · წელი ${f.d.slice(0, 4)} → <b>${esc(yb.t)}</b></p>`;
  const ns = numSentence(f); if (ns) h += `<p>${ns}</p>`;
  h += `</div><div class="grid2">`;
  for (const tid of [f.h, f.a]) {
    const c = findClub(tn(tid));
    h += `<div class="card"><h3>${logo(tid)} ${esc(tn(tid))}</h3>`;
    if (!c) { h += `<div class="mut small">ნუმეროლოგიის ბაზაში ვერ მოიძებნა. დაამატე ან შეასწორე სახელი Google Sheet-ში.</div></div>`; continue; }
    const rows = [['გუნდი', c.name, c.date], ...(c.coach ? [['მწვრთნელი', c.coach[0], c.coach[1]]] : [])];
    // ამ მატჩში მონაწილე მოთამაშეები (თუ ცნობილია), თორემ Sheet-ის შემადგენლობა
    const lines = DB.players.m[f.i]?.filter(l => l[1] === (tid === f.h ? 0 : 1)) || [];
    const fromMatch = lines.map(l => findPlayer(c, DB.players.names[l[0]]?.[0])).filter(Boolean);
    const pl = fromMatch.length >= 5 ? fromMatch : c.players;
    for (const p of pl) rows.push(['', p[0], p[1]]);
    h += `<table class="tbl num"><thead><tr><th></th><th>სახელი</th><th>თარიღი</th><th>ნუმ.</th><th>დღე</th><th>წელი</th></tr></thead><tbody>${rows.map(([r, n, dt]) => {
      const b = base(dt); return `<tr class="${r ? 'lead' : ''}"><td>${r}</td><td>${esc(n)}</td><td>${esc(dt || '')}</td><td>${b ? esc(b.t) : ''}</td><td class="dg">${esc(combine(b, d))}</td><td class="yr">${esc(combine(b, yb))}</td></tr>`;
    }).join('')}</tbody></table>${fromMatch.length >= 5 ? '<div class="mut small">ნაჩვენებია ამ მატჩის მონაწილე მოთამაშეები</div>' : ''}</div>`;
  }
  return h + `</div>`;
}

// -------------------------------------------------- ტურნირი (ტურების მიხედვით)
const RN = { 'Round of 32': '1/16 ფინალი', 'Round of 16': '1/8 ფინალი', 'Quarter-finals': '1/4 ფინალი', 'Semi-finals': '1/2 ფინალი', 'Final': 'ფინალი',
  'Knockout Round Play-offs': 'პლეი-ოფი', 'Play-offs': 'პლეი-ოფი', '1st Qualifying Round': '1-ლი საკვალიფიკაციო', '2nd Qualifying Round': 'მე-2 საკვალიფიკაციო', '3rd Qualifying Round': 'მე-3 საკვალიფიკაციო' };
function roundName(r) {
  if (!r) return '—';
  let m = r.match(/^Regular Season - (\d+)$/); if (m) return `ტური ${m[1]}`;
  m = r.match(/^League Stage - (\d+)$/); if (m) return `ლიგის ფაზა · ტური ${m[1]}`;
  m = r.match(/^Group (\w) - (\d+)$/); if (m) return `ჯგუფი ${m[1]} · ტური ${m[2]}`;
  m = r.match(/^(\d+)(st|nd|rd|th) Round$/); if (m) return `${m[1]}-ე რაუნდი`;
  return RN[r] || r;
}
function compRounds(code) {
  const idx = {}, rounds = [];
  for (const x of DB.comps[code].doc.fixtures) { const f = DB.byId[x.i]; if (!f) continue; const r = f.r || '—'; if (!idx[r]) { idx[r] = []; rounds.push(r); } idx[r].push(f); }
  // რიგი: ტურის ნომრით (გადადებული მატჩი რიგს არ არღვევს), სხვა შემთხვევაში — მედიანური თარიღით
  const med = r => { const t = idx[r].map(f => f.t).sort((a, b) => a - b); return t[Math.floor(t.length / 2)]; };
  const num = r => { const m = /(Regular Season|League Stage) - (\d+)$/.exec(r); return m ? +m[2] : null; };
  rounds.sort((a, b) => { const na = num(a), nb = num(b); if (na != null && nb != null && /League Stage/.test(a) === /League Stage/.test(b)) return na - nb; return med(a) - med(b); });
  return { rounds, idx };
}
function matchRow(f) {
  const { pr, picks } = pred(f), top = picks[0];
  const fin = isFin(f), c1 = top ? checkItem(f, top) : null;
  return `<a class="mrow" href="#/m/${f.i}">
    <span class="tm">${fin ? dlabel(f.t) : hhmm(f.t)}</span>
    <span class="teams"><span>${logo(f.h)}${esc(tn(f.h))}</span><span>${logo(f.a)}${esc(tn(f.a))}</span></span>
    <span class="sc">${fin ? `<b>${f.g[0]}</b><b>${f.g[1]}</b>` : ''}</span>
    <span class="odds"><i class="${pcls(pr.p1)}">1 <b>${P(pr.p1)}</b></i><i class="${pcls(pr.px)}">X <b>${P(pr.px)}</b></i><i class="${pcls(pr.p2)}">2 <b>${P(pr.p2)}</b></i></span>
    <span class="best">${top ? `<span class="chip ${pcls(top.p)}">${esc(pickName(top))} · ${P(top.p)}${top.odd ? ` · <b>${top.odd.toFixed(2)}</b>` : top.est ? ` · ~${top.est.toFixed(2)}` : ''}</span>${c1 == null ? '' : c1 ? ' ✅' : ' ❌'}<small>${picks.length > 1 ? `+${picks.length - 1} ფსონი` : ''}</small>` : `<small class="mut">${Math.round(MIN * 100)}%+ ფსონი არ არის</small>`}</span>
  </a>`;
}
function compView(code) {
  const C = DB.comps[code]; if (!C) return '<div class="empty">ტურნირი ვერ მოიძებნა</div>';
  const tab = ST.tab.c || 'tbl';
  const isLeague = C.group === 'league', isEuro = C.group === 'euro';
  const { rounds, idx } = compRounds(code);
  ST.round ||= {};
  // ნაგულისხმევი ტური: ბოლო ტური, რომელიც არჩეულ თარიღამდე დაიწყო
  if (ST.round[code] == null || ST.round[code] >= rounds.length) {
    const end = dayStart(ST.date) + 864e5; let k = 0;
    rounds.forEach((r, i) => { if (Math.min(...idx[r].map(f => f.t)) < end) k = i; });
    ST.round[code] = k;
  }
  const ri = ST.round[code], rname = rounds[ri], rfx = idx[rname] || [];
  const roundEnd = Math.max(...rfx.map(f => f.t)) + 1;
  let h = `<div class="head"><h1><i class="flag">${esc(C.country.slice(0, 3))}</i>${esc(C.name)}</h1></div>`;
  h += `<div class="datebar"><button class="btn" data-act="round" data-c="${code}" data-v="${ri - 1}" ${ri <= 0 ? 'disabled' : ''}>◀</button>
    <select class="roundsel btn" data-c="${code}">${rounds.map((r, i) => `<option value="${i}"${i === ri ? ' selected' : ''}>${esc(roundName(r))}</option>`).join('')}</select>
    <button class="btn" data-act="round" data-c="${code}" data-v="${ri + 1}" ${ri >= rounds.length - 1 ? 'disabled' : ''}>▶</button>
    <span class="mut small">${dlabel(Math.min(...rfx.map(f => f.t)))} – ${dlabel(roundEnd - 1)}</span></div>`;
  h += tabs('c', [['tbl', isLeague || isEuro ? 'ცხრილი' : 'გუნდები'], ['fx', 'ტურის მატჩები'], ['stat', 'სტატისტიკა']], tab);
  if (tab === 'tbl') {
    // ცხრილი ზუსტად არჩეული ტურის ჩათვლით (გადადებული მატჩები თავის ტურს ეკუთვნის)
    const rpos = Object.fromEntries(rounds.map((r, i) => [r, i]));
    const rf = r => rpos[r || '—'] <= ri && (!isEuro || /League Stage/i.test(r || ''));
    const tbl = standings(code, Infinity, rf).filter(r => r.p > 0 || isLeague);
    h += `<div class="card"><table class="tbl std"><thead><tr><th>#</th><th>გუნდი</th><th>თ</th><th>მ</th><th>ფ</th><th>წ</th><th>გოლები</th><th>სხვ.</th><th>ქ</th><th>ფორმა</th></tr></thead><tbody>${tbl.map((r, i) => `<tr><td>${i + 1}</td><td>${tlink(r.t)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}:${r.ga}</td><td>${r.gf - r.ga}</td><td><b>${r.pts}</b></td><td>${form(r.form.slice(-5))}</td></tr>`).join('')}</tbody></table>
    <div class="mut small">ცხრილი „${esc(roundName(rname))}“-ის შემდეგ.</div></div>`;
  }
  if (tab === 'tbl' || tab === 'fx') {
    const fin = rfx.filter(f => isFin(f));
    const hits = fin.flatMap(f => pred(f).picks.map(p => checkItem(f, p))).filter(x => x != null);
    h += `<div class="card"><div class="chead">${esc(roundName(rname))}${hits.length ? `<span class="mut small" style="margin-left:auto">AI ფსონები: ${hits.filter(Boolean).length}/${hits.length} (${P(hits.filter(Boolean).length / hits.length)})</span>` : ''}</div>${rfx.map(matchRow).join('')}</div>`;
  }
  if (tab === 'stat') h += scanTable({ comp: code, venue: ST.venue, metric: (ST.scan && ST.scan.metric) || 'o25', _before: roundEnd }, true);
  return h;
}

// -------------------------------------------------- გუნდი
function teamView(tid) {
  const T = DB.teams[tid]; if (!T) return '<div class="empty">გუნდი ვერ მოიძებნა</div>';
  const before = dayStart(ST.date) + 864e5, v = ST.venue === 'venue' ? 'all' : ST.venue;
  const rows = teamRows(tid, before, v), A = aggregate(rows), tab = ST.tab.t || 'ov';
  const lg = DB.teamLeague[tid];
  let h = `<div class="thead">${logo(tid, 'lgb')}<div><h1>${esc(T.name)}</h1><div class="mut">${[...T.comps].map(c => `<a href="#/c/${c}">${esc(compName(c))}</a>`).join(' · ')}</div></div></div>` + dateBar();
  h += `<div class="head">${seg('venue', [['all', 'ტოტალი'], ['home', 'შინ'], ['away', 'გასვლა']], v)}<span class="mut small">${A.n} მატჩი არჩეულ თარიღამდე</span></div>`;
  h += tabs('t', [['ov', 'მიმოხილვა'], ['pl', 'მოთამაშეები'], ['fx', 'მატჩები'], ['num', 'ნუმეროლოგია']], tab);
  if (tab === 'ov') {
    const k = [['თამაში', A.n], ['მ-ფ-წ', `${A.w}-${A.d}-${A.l}`], ['ქულა/მატჩი', f1(A.ppg)], ['გოლები', `${f1(A.gf)} : ${f1(A.ga)}`], ['xG', `${f1(A.xg)} : ${f1(A.xga)}`],
      ['მეტი 2.5', P(A.o25)], ['BTTS', P(A.btts)], ['მშრალი', P(A.cs)], ['კუთხური', `${f1(A.cor)} : ${f1(A.cora)}`], ['კარში დარტყმა', `${f1(A.sot)} : ${f1(A.sota)}`],
      ['ფლობა', A.poss == null ? '—' : Math.round(A.poss) + '%'], ['ყვითელი', f1(A.yc)], ['ჯარიმა', f1(A.foul)], ['ოფსაიდი', f1(A.off)]];
    h += `<div class="card"><div class="kgrid wide">${k.map(([l, x]) => `<div><span>${l}</span><b>${x}</b></div>`).join('')}</div><div class="fl">ფორმა: ${form(A.form)}</div></div>`;
    h += `<div class="grid2"><div class="card"><h3>🏷️ Team Traits</h3>${traitChips(traits(tid, before))}</div>`;
    const pt = patterns(tid, before, v), abs = keyAbsences(tid, before);
    h += `<div class="card"><h3>🔎 AI მიგნებები</h3>${abs.map(a => `<div class="abs ${a.big ? 'big' : ''}">${a.big ? '⚠️ ' : ''}${esc(a.txt)}</div>`).join('')}${pt.length ? `<ul class="pat">${pt.map(p => `<li class="${p.tone}">${esc(p.txt)}</li>`).join('')}</ul>` : '<div class="mut small">მკაფიო პატერნი ჯერ ვერ მოიძებნა</div>'}</div></div>`;
    const co = coachInfo(tid, before);
    if (co) h += `<div class="card"><h3>👔 მწვრთნელი: ${esc(co.name)}</h3><p>${co.start ? `გუნდს წვრთნის ${fmtDate(co.start)}-დან.` : ''} ${co.change ? `<span class="${co.change.ppg >= co.change.ppg0 ? 'okc' : 'noc'}">ახალი მწვრთნელით: ${co.change.n} მატჩი (${co.change.w}-${co.change.d}-${co.change.l}), ${f1(co.change.ppg)} ქულა/მატჩი, გოლები ${f1(co.change.gf)}:${f1(co.change.ga)}</span> — მანამდე ${co.change.n0} მატჩი: ${f1(co.change.ppg0)} ქულა/მატჩი, გოლები ${f1(co.change.gf0)}:${f1(co.change.ga0)}.` : 'ამ სეზონის ყველა მატჩი ამ მწვრთნელით.'}</p></div>`;
    const sc = scenarios(tid, before, v);
    if (sc.length) h += `<div class="card"><h3>🎬 სცენარები</h3>${scenList(sc)}</div>`;
    h += `<div class="card"><h3>გოლების დრო</h3><div class="mins">${['0-15', '16-30', '31-45', '46-60', '61-75', '76-90'].map((l, i) => `<div><span>${l}</span><b class="g">${A.gForB[i]}</b><b class="c">${A.gAgB[i]}</b></div>`).join('')}</div><div class="mut small">მწვანე — გატანილი, წითელი — გაშვებული</div></div>`;
  }
  if (tab === 'pl') {
    const tot = playerTotals(playerLines(tid, before).filter(x => v === 'all' || (v === 'home') === (x.side === 0))).sort((a, b) => b.g - a.g || b.a - a.a || b.min - a.min);
    const club = findClub(T.name), d = dayBase(ST.date);
    h += `<div class="card"><table class="tbl"><thead><tr><th>მოთამაშე</th><th>პოზ.</th><th>მატჩი</th><th>წთ</th><th>გოლი</th><th>ასისტი</th><th>მშრალი</th><th>ყვით.</th><th>რეიტ.</th><th>ნუმ. დღე</th></tr></thead><tbody>${tot.map(p => {
      const np = findPlayer(club, p.name), b = np ? base(np[1]) : null;
      return `<tr><td><a href="#/p/${p.pid}">${esc(p.name)}</a></td><td>${esc(p.pos || '')}</td><td>${p.apps}</td><td>${p.min}</td><td><b>${p.g}</b></td><td>${p.a}</td><td>${p.pos === 'G' || p.pos === 'D' ? p.cs : ''}</td><td>${p.yc}</td><td>${p.rating ? p.rating.toFixed(2) : ''}</td><td class="dg">${b ? esc(combine(b, d)) : ''}</td></tr>`;
    }).join('')}</tbody></table><div class="mut small">მშრალი მატჩი ეთვლება მეკარეს/მცველს, თუ ≥60 წუთი ითამაშა და გუნდმა არ გაუშვა.</div></div>`;
  }
  if (tab === 'fx') {
    const list = (DB.byTeam[tid] || []);
    h += `<div class="card">${list.map(f => { const r = isFin(f) ? (f.h === tid ? f.g[0] - f.g[1] : f.g[1] - f.g[0]) : null;
      return `<a class="mrow sm ${f.t >= before ? 'fut' : ''}" href="#/m/${f.i}"><span class="tm">${dlabel(f.t)}</span><span class="teams"><span>${logo(f.h)}${esc(tn(f.h))}</span><span>${logo(f.a)}${esc(tn(f.a))}</span></span><span class="sc">${isFin(f) ? `<b>${f.g[0]}</b><b>${f.g[1]}</b>` : ''}</span><span class="res">${r == null ? '' : `<i class="${r > 0 ? 'W' : r < 0 ? 'L' : 'D'}">${r > 0 ? 'მ' : r < 0 ? 'წ' : 'ფ'}</i>`}</span><span class="mut small">${esc(compName(f.c))}</span></a>`; }).join('')}</div>`;
  }
  if (tab === 'num') {
    const c = findClub(T.name), d = dayBase(ST.date), yb = base(ST.date.slice(0, 4));
    if (!c) h += `<div class="empty">ნუმეროლოგიის ბაზაში ვერ მოიძებნა</div>`;
    else h += `<div class="card"><p>თარიღი: <b>${fmtDate(ST.date)}</b> → <b>${esc(d.t)}</b></p><table class="tbl num"><thead><tr><th></th><th>სახელი</th><th>თარიღი</th><th>ნუმ.</th><th>დღე</th><th>წელი</th></tr></thead><tbody>${[['გუნდი', c.name, c.date], ...(c.coach ? [['მწვრთნელი', ...c.coach]] : []), ...c.players.map(p => ['', ...p])].map(([r, n, dt]) => { const b = base(dt); return `<tr class="${r ? 'lead' : ''}"><td>${r}</td><td>${esc(n)}</td><td>${esc(dt)}</td><td>${b ? esc(b.t) : ''}</td><td class="dg">${esc(combine(b, d))}</td><td class="yr">${esc(combine(b, yb))}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  return h;
}

// -------------------------------------------------- მოთამაშე
function playerView(pid) {
  const nm = DB.players.names[pid]; if (!nm) return '<div class="empty">მოთამაშე ვერ მოიძებნა</div>';
  const before = dayStart(ST.date) + 864e5;
  const lines = [];
  for (const f of DB.fixtures) { if (f.t >= before) break; const m = DB.players.m[f.i]; if (!m) continue; const l = m.find(x => x[0] === pid); if (l) lines.push({ pid, f, l, side: l[1] }); }
  const [p] = playerTotals(lines);
  const tid = lines.length ? (lines[lines.length - 1].side === 0 ? lines[lines.length - 1].f.h : lines[lines.length - 1].f.a) : null;
  const club = tid ? findClub(tn(tid)) : null; const np = findPlayer(club, nm[0]) || findPlayerAnywhere(nm[0])?.p;
  let h = `<div class="thead"><div><h1>${esc(nm[0])}</h1><div class="mut">${tid ? tlink(tid) : ''} · ${esc(nm[1] || '')}</div></div></div>` + dateBar();
  if (p) h += `<div class="card"><div class="kgrid wide">${[['მატჩი', p.apps], ['წუთი', p.min], ['გოლი', p.g], ['ასისტი', p.a], ['მშრალი', p.pos === 'G' || p.pos === 'D' ? p.cs : '—'], ['დარტყმა', p.sh], ['კარში', p.sot], ['ყვითელი', p.yc], ['წითელი', p.rc], ['რეიტინგი', p.rating ? p.rating.toFixed(2) : '—'], ['გოლი/90', f1(p.g / Math.max(1, p.min) * 90)]].map(([l, x]) => `<div><span>${l}</span><b>${x}</b></div>`).join('')}</div></div>`;
  if (np) { const b = base(np[1]), d = dayBase(ST.date); h += `<div class="card"><h3>🔢 ნუმეროლოგია</h3><p>დაბადების თარიღი: <b>${esc(np[1])}</b> → <b>${esc(b?.t || '')}</b> · დღის რიცხვი (${fmtDate(ST.date)}): <b class="dg">${esc(combine(b, d))}</b> · წლის რიცხვი: <b class="yr">${esc(combine(b, base(ST.date.slice(0, 4))))}</b></p></div>`; }
  h += `<div class="card"><table class="tbl"><thead><tr><th>თარიღი</th><th>მატჩი</th><th>წთ</th><th>გ</th><th>ა</th><th>დარტ.</th><th>ყვ.</th><th>რეიტ.</th></tr></thead><tbody>${lines.slice().reverse().map(({ f, l }) => `<tr><td>${dlabel(f.t)}</td><td><a href="#/m/${f.i}">${esc(tn(f.h))} ${f.g[0]}-${f.g[1]} ${esc(tn(f.a))}</a></td><td>${l[2]}</td><td>${l[3] || ''}</td><td>${l[4] || ''}</td><td>${l[7] || ''}</td><td>${l[5] ? '🟨' : ''}${l[6] ? '🟥' : ''}</td><td>${l[9] ?? ''}</td></tr>`).join('')}</tbody></table></div>`;
  return h;
}

// -------------------------------------------------- სტატისტიკის სკანერი
const SCAN = [['o25', 'მეტი 2.5 გოლი %', P], ['o15', 'მეტი 1.5 გოლი %', P], ['o35', 'მეტი 3.5 გოლი %', P], ['btts', 'ორივე იტანს %', P], ['cs', 'მშრალი მატჩი %', P], ['fts', 'ვერ გაიტანა %', P],
  ['tg', 'გოლები მატჩში (სულ)', f1], ['gf', 'გატანილი/მატჩი', f1], ['ga', 'გაშვებული/მატჩი', f1], ['xg', 'xG', f1], ['xga', 'xGA', f1],
  ['totCor', 'კუთხური მატჩში (სულ)', f1], ['cor', 'კუთხური (გუნდის)', f1], ['cora', 'კუთხური (მეტოქის)', f1], ['totYc', 'ყვითელი მატჩში (სულ)', f1], ['yc', 'ყვითელი (გუნდის)', f1],
  ['totFoul', 'ჯარიმა მატჩში (სულ)', f1], ['sot', 'კარში დარტყმა', f1], ['sh', 'დარტყმა', f1], ['off', 'ოფსაიდი', f1], ['poss', 'ფლობა %', f1], ['ppg', 'ქულა/მატჩი', f1], ['firstPct', 'პირველი იტანს %', P]];
function scanView() {
  const s = ST.scan || { comp: 'leagues', venue: 'all', metric: 'o25', min: '' };
  return `<div class="head"><h1>📊 სტატისტიკის სკანერი</h1></div>` + dateBar() + `<div class="card filters">
    <label>ტურნირი<select class="scanf" name="comp"><option value="leagues">ყველა ლიგა</option><option value="all"${s.comp === 'all' ? ' selected' : ''}>ყველა ტურნირი</option>${DB.cfg.competitions.filter(c => DB.comps[c.code]).map(c => `<option value="${c.code}"${s.comp === c.code ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label>მატჩები<select class="scanf" name="venue">${[['all', 'ტოტალი'], ['home', 'შინ'], ['away', 'გასვლა']].map(([v, t]) => `<option value="${v}"${s.venue === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <label>მაჩვენებელი<select class="scanf" name="metric">${SCAN.map(([k, t]) => `<option value="${k}"${s.metric === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <label>მინიმუმი<input class="scanf" name="min" type="number" step="0.1" placeholder="მაგ. 70 ან 10.5" value="${esc(s.min || '')}"></label>
  </div>` + scanTable(s);
}
function scanTable(s, compact) {
  const before = s._before || dayStart(ST.date) + 864e5;
  const [key, label, fm] = SCAN.find(x => x[0] === s.metric) || SCAN[0];
  let teams;
  if (s.comp === 'all') teams = Object.keys(DB.teams);
  else if (s.comp === 'leagues' || !s.comp) teams = Object.keys(DB.teamLeague);
  else teams = Object.keys(DB.comps[s.comp].doc.teams);
  const opts = s.comp && !['all', 'leagues'].includes(s.comp) ? { comp: s.comp } : {};
  let rows = teams.map(t => ({ t: +t, a: aggregate(teamRows(+t, before, s.venue || 'all', opts)) })).filter(x => x.a.n >= 3 && x.a[key] != null);
  let min = parseFloat(s.min); if (!isNaN(min)) { if (fm === P && min > 1) min /= 100; rows = rows.filter(x => x.a[key] >= min); }
  rows.sort((a, b) => b.a[key] - a.a[key]);
  if (compact) {
    const sel = `<div class="filters inline"><label>მაჩვენებელი<select class="scanf" name="metric">${SCAN.map(([k, t]) => `<option value="${k}"${s.metric === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label><input type="hidden" class="scanf" name="comp" value="${s.comp}"></div>`;
    if (ST.scan && ST.scan.comp === s.comp) { s = { ...s, ...ST.scan }; }
  }
  return `<div class="card"><table class="tbl"><thead><tr><th>#</th><th>გუნდი</th><th>მატჩი</th><th>${esc(label)}</th><th>მ-ფ-წ</th><th>გოლები</th><th>კუთხ.</th><th>ყვით.</th></tr></thead><tbody>${rows.slice(0, 100).map((x, i) => `<tr><td>${i + 1}</td><td>${tlink(x.t)}</td><td>${x.a.n}</td><td><b>${fm(x.a[key])}</b></td><td>${x.a.w}-${x.a.d}-${x.a.l}</td><td>${f1(x.a.gf)}:${f1(x.a.ga)}</td><td>${f1(x.a.cor)}</td><td>${f1(x.a.yc)}</td></tr>`).join('')}</tbody></table>${rows.length ? '' : '<div class="mut small">შედეგი ვერ მოიძებნა</div>'}</div>`;
}

// -------------------------------------------------- ორი გუნდის შედარება
function compareView(a, b) {
  const teams = Object.keys(DB.teamLeague).map(Number).sort((x, y) => tn(x).localeCompare(tn(y)));
  a = +a || teams[0]; b = +b || teams[1];
  const sel = (id, cur) => `<select class="cmpf" id="${id}">${teams.map(t => `<option value="${t}"${t === cur ? ' selected' : ''}>${esc(tn(t))} (${esc(compName(DB.teamLeague[t]))})</option>`).join('')}</select>`;
  return `<div class="head"><h1>⚖️ ორი გუნდის შედარება</h1></div>` + dateBar() + `<div class="card filters"><label>გუნდი 1 ${sel('cmpA', a)}</label><label>გუნდი 2 ${sel('cmpB', b)}</label></div>` + comparison(a, b, dayStart(ST.date) + 864e5, false);
}

// -------------------------------------------------- მოდელის სიზუსტე
function accView() {
  return `<div class="head"><h1>🎯 მოდელის სიზუსტე</h1></div><div class="note">ყველა დასრულებულ მატჩზე (არჩეულ თარიღამდე) მოდელი ითვლის პროგნოზს მხოლოდ იმ მატჩამდე არსებული მონაცემებით და ადარებს რეალურ შედეგს. სეზონის პირველ 5 ტურს ვტოვებთ — მაშინ მონაცემი ცოტაა.</div>` + dateBar() + `<div id="acc" class="card"><div class="loading">ითვლება… <span id="accp">0%</span></div></div>`;
}
let accJob = 0;
async function runAccuracy() {
  const job = ++accJob, before = dayStart(ST.date) + 864e5;
  const fx = DB.fixtures.filter(f => isFin(f) && f.t < before && teamRows(f.h, f.t).length >= 5 && teamRows(f.a, f.t).length >= 5);
  const fam = {}, byP = {}, byComp = {};
  const roi = { ai: [0, 0, 0], val: [0, 0, 0] }; // [ფსონი, მოგებული, მოგება ერთეულებში]
  let main = { n: 0, top1x2: 0, o25: 0, btts: 0 };
  for (let i = 0; i < fx.length; i++) {
    if (job !== accJob) return;
    const f = fx[i];
    const { pr, mk } = pred(f);
    const picks = aiPicks(mk, 0.7, 99, f);
    const g = f.g, res = g[0] > g[1] ? 0 : g[0] === g[1] ? 1 : 2, pp = [pr.p1, pr.px, pr.p2];
    main.n++; if (pp.indexOf(Math.max(...pp)) === res) main.top1x2++;
    if ((pr.over(pr.tot, 2.5) >= 0.5) === (g[0] + g[1] > 2.5)) main.o25++;
    const pb = (1 - pr.hF[0]) * (1 - pr.aF[0]); if ((pb >= 0.5) === (g[0] > 0 && g[1] > 0)) main.btts++;
    for (const p of picks) { if (p.p < MIN || !p.odd) continue; const c = checkItem(f, p); if (c == null) continue; roi.ai[0]++; roi.ai[1] += c; roi.ai[2] += c ? p.odd - 1 : -1; }
    for (const p of valuePicks(mk, f)) { const c = checkItem(f, p); if (c == null) continue; roi.val[0]++; roi.val[1] += c; roi.val[2] += c ? p.odd - 1 : -1; }
    for (const p of picks) {
      const c = checkItem(f, p); if (c == null) continue;
      const b = p.p >= 0.9 ? '90%+' : p.p >= 0.85 ? '85–90%' : p.p >= 0.8 ? '80–85%' : p.p >= 0.75 ? '75–80%' : '70–75%';
      (byP[b] ||= [0, 0]); byP[b][0] += c; byP[b][1]++;
      if (p.p < MIN) continue; // ქვემოთ — მხოლოდ საიტზე ნაჩვენები ფსონები
      const k0 = p.group.replace(/\s*\(.*\)$/, '').replace(/^.* — /, 'გუნდის — ');
      (fam[k0] ||= [0, 0]); fam[k0][0] += c; fam[k0][1]++;
      (byComp[f.c] ||= [0, 0]); byComp[f.c][0] += c; byComp[f.c][1]++;
    }
    if (i % 25 === 0) { const e = $('#accp'); if (e) e.textContent = Math.round(i / fx.length * 100) + '%'; await new Promise(r => setTimeout(r, 0)); }
  }
  if (job !== accJob || !$('#acc')) return;
  const tot = Object.values(fam).reduce((s, x) => [s[0] + x[0], s[1] + x[1]], [0, 0]);
  const row = ([k, [a, n]]) => `<tr><td>${esc(k)}</td><td>${n}</td><td>${a}</td><td><b class="${a / n >= 0.7 ? 'okc' : a / n < 0.6 ? 'noc' : ''}">${P(a / n)}</b></td></tr>`;
  $('#acc').innerHTML = `<div class="kpis"><div><b>${main.n}</b><span>შემოწმებული მატჩი</span></div><div><b>${P(tot[0] / tot[1])}</b><span>AI ფსონები (${tot[1]})</span></div><div><b>${P(main.top1x2 / main.n)}</b><span>1X2 ფავორიტი</span></div><div><b>${P(main.o25 / main.n)}</b><span>მეტი/ნაკლები 2.5</span></div><div><b>${P(main.btts / main.n)}</b><span>BTTS</span></div></div>
    <h3>💰 მოგება (ROI) — თითო ფსონზე 1 ლარი</h3>${[['AI ფსონები (70%+, ბუკმეკერის კოეფიციენტით)', roi.ai], ['💎 Value ფსონები', roi.val]].map(([t, r]) => `<div class="roi"><b>${t}</b>${r[0] ? `<span>${r[0]} ფსონი · ${r[1]} მოგებული (${P(r[1] / r[0])})</span><span class="${r[2] >= 0 ? 'okc' : 'noc'}">${r[2] >= 0 ? '+' : ''}${r[2].toFixed(2)} ლარი · ROI ${r[2] >= 0 ? '+' : ''}${Math.round(r[2] / r[0] * 100)}%</span>` : '<span class="mut">ჯერ მონაცემი არ არის — კოეფიციენტების შენახვა 25 ნოემბრიდან დაიწყო, დასრულებული მატჩები თანდათან დაემატება.</span>'}</div>`).join('')}
    <div class="grid2"><div><h3>ალბათობის მიხედვით</h3><table class="tbl"><thead><tr><th>დიაპაზონი</th><th>ფსონი</th><th>გამართლდა</th><th>%</th></tr></thead><tbody>${['70–75%', '75–80%', '80–85%', '85–90%', '90%+'].filter(k => byP[k]).map(k => row([k + (parseInt(k) < MIN * 100 ? ' (არ ჩანს)' : ''), byP[k]])).join('')}</tbody></table>
    <h3>ტურნირების მიხედვით</h3><table class="tbl"><thead><tr><th>ტურნირი</th><th>ფსონი</th><th>გამართლდა</th><th>%</th></tr></thead><tbody>${Object.entries(byComp).map(([k, v]) => row([compName(k), v])).join('')}</tbody></table></div>
    <div><h3>ბაზრების მიხედვით</h3><table class="tbl"><thead><tr><th>ბაზარი</th><th>ფსონი</th><th>გამართლდა</th><th>%</th></tr></thead><tbody>${Object.entries(fam).sort((a, b) => b[1][1] - a[1][1]).map(row).join('')}</tbody></table></div></div>
    <div class="mut small">კარგი მოდელისთვის „70–75%“ დიაპაზონი დაახლოებით 70–75%-ით უნდა მართლდებოდეს. თუ ნაკლებია — მოდელი ზედმეტად თავდაჯერებულია და ვასწორებთ.</div>`;
}

boot().catch(e => { console.error(e); $('#view').innerHTML = `<div class="empty">ჩატვირთვის შეცდომა: ${esc(e.message)}</div>`; });
