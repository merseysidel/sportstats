// ===================== SportStats — ინტერფეისი =====================
import { DB, indexData, predict, teamRows, aggregate, isFin, playerLines, playerTotals, refereeStats, injuriesNear } from './engine.js';
import { buildMarkets, aiPicks, explain, checkItem, tn, pickName } from './markets.js';
import { traits, patterns, keyAbsences, standings } from './insights.js';
import { NUM, loadNumerology, findClub, findPlayer, findPlayerAnywhere, base, combine, dayBase, fmtDate } from './numerology.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = x => x == null || isNaN(x) ? '—' : (Math.round(x * 10) / 10).toFixed(1);
const P = x => x == null || isNaN(x) ? '—' : Math.round(x * 100) + '%';
const MIN = 0.7;
const ST = { date: null, venue: 'all', tab: {}, mode: 'list' };
const DAYS = ['კვი', 'ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ'];
const MONTHS = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dayStart = s => new Date(s + 'T00:00:00').getTime();
const hhmm = t => new Date(t).toLocaleTimeString('ka-GE', { hour: '2-digit', minute: '2-digit', hour12: false });
const dlabel = t => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const logo = (id, cls = 'lg') => DB.teams[id]?.logo ? `<img class="${cls}" src="${esc(DB.teams[id].logo)}" alt="" loading="lazy">` : `<span class="${cls}"></span>`;
const tlink = id => `<a href="#/t/${id}" class="tl">${logo(id)}<span>${esc(tn(id))}</span></a>`;
const pcls = p => p >= 0.8 ? 'p80' : p >= MIN ? 'p70' : p >= 0.5 ? 'p50' : '';
const compName = c => DB.comps[c]?.name || c;

const predCache = new Map();
function pred(f) {
  if (!predCache.has(f.i)) { const pr = predict(f); const mk = buildMarkets(pr); predCache.set(f.i, { pr, mk, picks: aiPicks(mk, MIN) }); }
  return predCache.get(f.i);
}

// -------------------------------------------------- ჩატვირთვა
async function j(url) { const r = await fetch(url + '?v=' + Date.now()); if (!r.ok) throw new Error(url); return r.json(); }
async function boot() {
  $('#view').innerHTML = '<div class="loading">მონაცემები იტვირთება…</div>';
  const cfg = await j('config.json');
  let state = {}; try { state = await j('data/state.json'); } catch (e) { }
  const comps = {}, players = {}, inj = {};
  await Promise.all(cfg.competitions.map(async c => {
    try { comps[c.code] = await j(`data/comp/${c.code}.json`); } catch (e) { }
    try { players[c.code] = await j(`data/players/${c.code}.json`); } catch (e) { }
    try { inj[c.code] = await j(`data/injuries/${c.code}.json`); } catch (e) { }
  }));
  indexData(cfg, comps, players, inj);
  DB.state = state;
  loadNumerology().then(() => { if (location.hash.includes('/m/') || location.hash.includes('/t/') || location.hash.includes('/p/')) render(); });
  if (!DB.fixtures.length) { $('#view').innerHTML = '<div class="empty">მონაცემები ჯერ არ არის. პირველი განახლება GitHub Actions-ში უნდა დასრულდეს.</div>'; return; }
  // ნაგულისხმევი თარიღი: დღეს, თუ სეზონის ფარგლებშია; თორემ ბოლო სათამაშო დღე
  const today = iso(new Date()), first = DB.fixtures[0].d.slice(0, 10), last = DB.fixtures[DB.fixtures.length - 1].d.slice(0, 10);
  ST.sim = !(today >= first && today <= last);
  ST.date = ST.sim ? lastMatchDay() : today;
  ST.range = [first, last];
  sidebar(); footer();
  window.addEventListener('hashchange', render);
  render();
}
function lastMatchDay() {
  // ბოლო დღე, სადაც ≥6 მატჩია (უპირატესობა — დეტალური სტატებით)
  for (const needSt of [true, false]) {
    const cnt = {};
    for (const f of DB.fixtures) if (isFin(f) && (!needSt || f.st)) { const d = f.d.slice(0, 10); cnt[d] = (cnt[d] || 0) + 1; }
    const days = Object.keys(cnt).sort();
    for (let i = days.length - 1; i >= 0; i--) if (cnt[days[i]] >= 6) return days[i];
  }
  return iso(new Date());
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
  $('#foot').innerHTML = `<span>სეზონი ${DB.cfg.season}/${String(DB.cfg.season + 1).slice(2)}${ST.sim ? ' · <b class="sim">საცდელი რეჟიმი</b>' : ''}</span>
    <span>ბოლო განახლება: ${upd}</span>${pg ? `<span>დეტალური სტატები: ${pg.detailed}/${pg.finished} მატჩი</span>` : ''}
    <span>ნუმეროლოგია: ${NUM.source === 'sheet' ? 'Google Sheet' : 'ჩაშენებული ასლი'}</span>
    <a class="btn sm" target="_blank" href="https://github.com/merseysidel/sportstats/actions/workflows/update.yml">⟳ განახლება</a>`;
}

// -------------------------------------------------- როუტერი
function render() {
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
    else v.innerHTML = homeView();
  } catch (e) { console.error(e); v.innerHTML = `<div class="empty">შეცდომა: ${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, val = b.dataset.v;
  if (a === 'day') { const d = new Date(ST.date + 'T12:00:00'); d.setDate(d.getDate() + (+val)); ST.date = iso(d); render(); }
  if (a === 'today') { ST.date = ST.sim ? lastMatchDay() : iso(new Date()); render(); }
  if (a === 'venue') { ST.venue = val; render(); }
  if (a === 'tab') { ST.tab[b.dataset.k] = val; render(); }
  if (a === 'mode') { ST.mode = val; render(); }
  if (a === 'nextday') { ST.date = nearestDay(+val); render(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'dpick' && e.target.value) { ST.date = e.target.value; render(); }
  if (e.target.matches('.scanf')) { ST.scan = Object.fromEntries([...document.querySelectorAll('.scanf')].map(x => [x.name, x.value])); render(); }
  if (e.target.matches('.cmpf')) { const a = $('#cmpA').value, b = $('#cmpB').value; location.hash = `#/cmp/${a}/${b}`; }
});
function nearestDay(dir) {
  const t = dayStart(ST.date);
  const list = DB.fixtures.map(f => f.d.slice(0, 10));
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
    <label class="dlab"><b>${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}</b><input id="dpick" type="date" value="${ST.date}"></label>
    <button class="btn" data-act="day" data-v="1">▶</button>
    <button class="btn" data-act="nextday" data-v="1" title="შემდეგი სათამაშო დღე">⏭</button>
    <button class="btn ghost" data-act="today">${ST.sim ? 'ბოლო ტური' : 'დღეს'}</button>
  </div>`;
}
function homeView() {
  const t0 = dayStart(ST.date), t1 = t0 + 864e5;
  const fx = DB.fixtures.filter(f => f.t >= t0 && f.t < t1);
  let h = `<div class="head"><h1>დღის მატჩები</h1>${seg('mode', [['list', 'მატჩები'], ['picks', 'AI ფსონები']], ST.mode)}</div>` + dateBar();
  if (ST.sim) h += `<div class="note">🧪 საცდელი რეჟიმი: ${DB.cfg.season}/${String(DB.cfg.season + 1).slice(2)} სეზონი. პროგნოზი ითვლება მხოლოდ მატჩამდე არსებული მონაცემებით, ამიტომ ✅/❌ რეალურ შედეგს უჩვენებს.</div>`;
  if (!fx.length) return h + `<div class="empty">ამ დღეს ჩვენს ტურნირებში მატჩი არ არის. გამოიყენე ⏮ ⏭ უახლოესი სათამაშო დღისთვის.</div>`;
  if (ST.mode === 'picks') {
    const all = [];
    for (const f of fx) { const { pr, picks } = pred(f); for (const p of picks) all.push({ f, pr, p }); }
    all.sort((a, b) => b.p.p - a.p.p);
    const hits = all.map(x => checkItem(x.f, x.p)).filter(x => x != null);
    if (hits.length) h += `<div class="kpis"><div><b>${hits.filter(Boolean).length}/${hits.length}</b><span>გამართლდა</span></div><div><b>${P(hits.filter(Boolean).length / hits.length)}</b><span>სიზუსტე</span></div></div>`;
    return h + `<div class="card">` + all.map(({ f, pr, p }) => {
      const c = checkItem(f, p);
      return `<a class="pickrow" href="#/m/${f.i}"><span class="tm">${hhmm(f.t)}</span><span class="pm">${esc(tn(f.h))} – ${esc(tn(f.a))}<small>${esc(compName(f.c))}</small></span>
        <span class="pk">${esc(pickName(p))}<small>${esc(p.group.replace(/\s*\(.*\)$/, ''))}</small></span><span class="pct ${pcls(p.p)}">${P(p.p)}</span>${c == null ? '<span class="ck"></span>' : `<span class="ck ${c ? 'ok' : 'no'}">${c ? '✅' : '❌'}</span>`}</a>`;
    }).join('') + `</div>`;
  }
  const byComp = {};
  for (const f of fx) (byComp[f.c] ||= []).push(f);
  for (const c of DB.cfg.competitions.map(c => c.code)) {
    if (!byComp[c]) continue;
    h += `<div class="card"><a class="chead" href="#/c/${c}"><i class="flag">${esc(DB.comps[c].country.slice(0, 3))}</i>${esc(compName(c))}</a>`;
    for (const f of byComp[c]) {
      const { pr, picks } = pred(f), top = picks[0];
      const fin = isFin(f), c1 = top ? checkItem(f, top) : null;
      h += `<a class="mrow" href="#/m/${f.i}">
        <span class="tm">${fin ? 'დასრ.' : hhmm(f.t)}</span>
        <span class="teams"><span>${logo(f.h)}${esc(tn(f.h))}</span><span>${logo(f.a)}${esc(tn(f.a))}</span></span>
        <span class="sc">${fin ? `<b>${f.g[0]}</b><b>${f.g[1]}</b>` : ''}</span>
        <span class="odds"><i class="${pcls(pr.p1)}">1 <b>${P(pr.p1)}</b></i><i class="${pcls(pr.px)}">X <b>${P(pr.px)}</b></i><i class="${pcls(pr.p2)}">2 <b>${P(pr.p2)}</b></i></span>
        <span class="best">${top ? `<span class="chip ${pcls(top.p)}">${esc(pickName(top))} · ${P(top.p)}</span>${c1 == null ? '' : c1 ? ' ✅' : ' ❌'}<small>${picks.length > 1 ? `+${picks.length - 1} ფსონი` : ''}</small>` : '<small class="mut">70%+ ფსონი არ არის</small>'}</span>
      </a>`;
    }
    h += `</div>`;
  }
  return h;
}

// -------------------------------------------------- მატჩის გვერდი
function matchView(id) {
  const f = DB.byId[id]; if (!f) return '<div class="empty">მატჩი ვერ მოიძებნა</div>';
  const { pr, mk, picks } = pred(f);
  const fin = isFin(f), tab = ST.tab.m || 'ov';
  let h = `<div class="mhead">
    <div class="mcomp"><a href="#/c/${f.c}">${esc(compName(f.c))}</a> · ${esc(f.r || '')} · ${dlabel(f.t)} ${hhmm(f.t)}${f.ref ? ` · მსაჯი: ${esc(f.ref)}` : ''}</div>
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
    h += `<div class="pick"><div class="ph"><span class="pct big ${pcls(p.p)}">${P(p.p)}</span><div><b>${esc(pickName(p))}</b><small>${esc(p.group)}</small></div>${c == null ? '' : `<span class="ck ${c ? 'ok' : 'no'}">${c ? '✅ გამართლდა' : '❌ ვერ გამართლდა'}</span>`}</div>
      <p>${esc(explainPick(pr, p))}</p></div>`;
  }
  const ns = numSentence(f);
  if (ns) h += `<div class="pick num"><div class="ph"><span class="pct big">🔢</span><div><b>ნუმეროლოგია (1X2 / ორმაგი შანსი)</b></div></div><p>${ns}</p></div>`;
  h += `</div>`;
  // ძირითადი ალბათობები
  const kp = [['1', pr.p1], ['X', pr.px], ['2', pr.p2], ['1X', pr.p1 + pr.px], ['X2', pr.px + pr.p2], ['მეტი 2.5', pr.over(pr.tot, 2.5)], ['BTTS კი', (1 - pr.hF[0]) * (1 - pr.aF[0])], ['კუთხ. მეტი 9.5', pr.over(pr.corT, 9.5)], ['ყვით. მეტი 3.5', pr.over(pr.ycT, 3.5)]];
  h += `<div class="card"><h3>ძირითადი ალბათობები</h3><div class="kgrid">${kp.map(([l, p]) => `<div class="${pcls(p)}"><span>${l}</span><b>${P(p)}</b></div>`).join('')}</div>
    <div class="scores">${pr.scores.slice(0, 5).map(([s, p]) => `<span>${s} <b>${P(p)}</b></span>`).join('')}</div></div>`;
  h += `</div><div>`;
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
  // traits + patterns
  for (const [tid, ven] of [[f.h, 'home'], [f.a, 'away']]) {
    const tr = traits(tid, f.t), pt = patterns(tid, f.t, ven);
    h += `<div class="card"><h3>${logo(tid)} ${esc(tn(tid))}</h3>${traitChips(tr)}${pt.length ? `<ul class="pat">${pt.map(p => `<li class="${p.tone}">${esc(p.txt)}</li>`).join('')}</ul>` : ''}</div>`;
  }
  return h + `</div></div>`;
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
    const c = checkItem(f, it);
    return `<div class="mi ${pcls(it.p)}"><span>${esc(it.label)}</span><span class="pb"><i style="width:${Math.round(it.p * 100)}%"></i></span><b>${P(it.p)}</b>${c == null ? '<em></em>' : `<em>${c ? '✅' : '❌'}</em>`}</div>`;
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

function h2h(f) {
  const list = DB.fixtures.filter(x => isFin(x) && ((x.h === f.h && x.a === f.a) || (x.h === f.a && x.a === f.h)) && x.i !== f.i);
  let h = `<div class="card"><h3>პირისპირ (ჩვენს ბაზაში)</h3>`;
  h += list.length ? list.map(x => `<a class="mrow sm" href="#/m/${x.i}"><span class="tm">${dlabel(x.t)}</span><span class="teams"><span>${logo(x.h)}${esc(tn(x.h))}</span><span>${logo(x.a)}${esc(tn(x.a))}</span></span><span class="sc"><b>${x.g[0]}</b><b>${x.g[1]}</b></span><span class="mut small">${esc(compName(x.c))}</span></a>`).join('') : '<div class="mut small">ამ სეზონში ერთმანეთს ჯერ არ შეხვედრიან.</div>';
  return h + `<div class="note">ბოლო 10–15 წლის სრული H2H ისტორია ფასიან (Pro) პაკეტზე გადასვლის მერე ჩაირთვება — უფასო პაკეტი მხოლოდ 2022–2024 სეზონებს იძლევა.</div></div>`;
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

// -------------------------------------------------- ტურნირი
function compView(code) {
  const C = DB.comps[code]; if (!C) return '<div class="empty">ტურნირი ვერ მოიძებნა</div>';
  const before = dayStart(ST.date) + 864e5, tab = ST.tab.c || 'tbl';
  let h = `<div class="head"><h1><i class="flag">${esc(C.country.slice(0, 3))}</i>${esc(C.name)}</h1></div>` + dateBar();
  const isLeague = C.group === 'league', isEuro = C.group === 'euro';
  h += tabs('c', [['tbl', isLeague || isEuro ? 'ცხრილი' : 'გუნდები'], ['fx', 'მატჩები'], ['stat', 'სტატისტიკა']], tab);
  if (tab === 'tbl') {
    const rf = isEuro ? (r => /League Stage/i.test(r || '')) : null;
    const tbl = standings(code, before, rf).filter(r => r.p > 0 || isLeague);
    h += `<div class="card"><table class="tbl std"><thead><tr><th>#</th><th>გუნდი</th><th>თ</th><th>მ</th><th>ფ</th><th>წ</th><th>გოლები</th><th>სხვ.</th><th>ქ</th><th>ფორმა</th></tr></thead><tbody>${tbl.map((r, i) => `<tr><td>${i + 1}</td><td>${tlink(r.t)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}:${r.ga}</td><td>${r.gf - r.ga}</td><td><b>${r.pts}</b></td><td>${form(r.form.slice(-5))}</td></tr>`).join('')}</tbody></table>
    <div class="mut small">ცხრილი არჩეული თარიღის მდგომარეობით.</div></div>`;
  }
  if (tab === 'fx') {
    const fx = C.doc.fixtures.map(x => DB.byId[x.i]);
    const rounds = []; const idx = {};
    for (const f of fx) { const r = f.r || '—'; if (!idx[r]) { idx[r] = []; rounds.push(r); } idx[r].push(f); }
    // არჩეულ თარიღთან ყველაზე ახლოს მყოფი ტური ზემოთ
    const near = rounds.map(r => [r, Math.min(...idx[r].map(f => Math.abs(f.t - before)))]).sort((a, b) => a[1] - b[1]).slice(0, 4).map(x => x[0]);
    const order = [...near, ...rounds.filter(r => !near.includes(r)).reverse()];
    h += order.slice(0, 12).map(r => `<div class="card"><div class="chead">${esc(r)}</div>${idx[r].map(f => `<a class="mrow sm" href="#/m/${f.i}"><span class="tm">${dlabel(f.t)}</span><span class="teams"><span>${logo(f.h)}${esc(tn(f.h))}</span><span>${logo(f.a)}${esc(tn(f.a))}</span></span><span class="sc">${isFin(f) ? `<b>${f.g[0]}</b><b>${f.g[1]}</b>` : `<small>${hhmm(f.t)}</small>`}</span></a>`).join('')}</div>`).join('');
  }
  if (tab === 'stat') h += scanTable({ comp: code, venue: ST.venue, metric: 'o25' }, true);
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
  const before = dayStart(ST.date) + 864e5;
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
  let main = { n: 0, top1x2: 0, o25: 0, btts: 0 };
  for (let i = 0; i < fx.length; i++) {
    if (job !== accJob) return;
    const f = fx[i];
    const { pr, picks } = pred(f);
    const g = f.g, res = g[0] > g[1] ? 0 : g[0] === g[1] ? 1 : 2, pp = [pr.p1, pr.px, pr.p2];
    main.n++; if (pp.indexOf(Math.max(...pp)) === res) main.top1x2++;
    if ((pr.over(pr.tot, 2.5) >= 0.5) === (g[0] + g[1] > 2.5)) main.o25++;
    const pb = (1 - pr.hF[0]) * (1 - pr.aF[0]); if ((pb >= 0.5) === (g[0] > 0 && g[1] > 0)) main.btts++;
    for (const p of picks) {
      const c = checkItem(f, p); if (c == null) continue;
      const k = p.group.replace(/\s*\(.*\)$/, '').replace(/^.* — /, 'გუნდის — ');
      (fam[k] ||= [0, 0]); fam[k][0] += c; fam[k][1]++;
      const b = p.p >= 0.85 ? '85%+' : p.p >= 0.8 ? '80–85%' : p.p >= 0.75 ? '75–80%' : '70–75%';
      (byP[b] ||= [0, 0]); byP[b][0] += c; byP[b][1]++;
      (byComp[f.c] ||= [0, 0]); byComp[f.c][0] += c; byComp[f.c][1]++;
    }
    if (i % 25 === 0) { const e = $('#accp'); if (e) e.textContent = Math.round(i / fx.length * 100) + '%'; await new Promise(r => setTimeout(r, 0)); }
  }
  if (job !== accJob || !$('#acc')) return;
  const tot = Object.values(fam).reduce((s, x) => [s[0] + x[0], s[1] + x[1]], [0, 0]);
  const row = ([k, [a, n]]) => `<tr><td>${esc(k)}</td><td>${n}</td><td>${a}</td><td><b class="${a / n >= 0.7 ? 'okc' : a / n < 0.6 ? 'noc' : ''}">${P(a / n)}</b></td></tr>`;
  $('#acc').innerHTML = `<div class="kpis"><div><b>${main.n}</b><span>შემოწმებული მატჩი</span></div><div><b>${P(tot[0] / tot[1])}</b><span>AI ფსონები (${tot[1]})</span></div><div><b>${P(main.top1x2 / main.n)}</b><span>1X2 ფავორიტი</span></div><div><b>${P(main.o25 / main.n)}</b><span>მეტი/ნაკლები 2.5</span></div><div><b>${P(main.btts / main.n)}</b><span>BTTS</span></div></div>
    <div class="grid2"><div><h3>ალბათობის მიხედვით</h3><table class="tbl"><thead><tr><th>დიაპაზონი</th><th>ფსონი</th><th>გამართლდა</th><th>%</th></tr></thead><tbody>${['70–75%', '75–80%', '80–85%', '85%+'].filter(k => byP[k]).map(k => row([k, byP[k]])).join('')}</tbody></table>
    <h3>ტურნირების მიხედვით</h3><table class="tbl"><thead><tr><th>ტურნირი</th><th>ფსონი</th><th>გამართლდა</th><th>%</th></tr></thead><tbody>${Object.entries(byComp).map(([k, v]) => row([compName(k), v])).join('')}</tbody></table></div>
    <div><h3>ბაზრების მიხედვით</h3><table class="tbl"><thead><tr><th>ბაზარი</th><th>ფსონი</th><th>გამართლდა</th><th>%</th></tr></thead><tbody>${Object.entries(fam).sort((a, b) => b[1][1] - a[1][1]).map(row).join('')}</tbody></table></div></div>
    <div class="mut small">კარგი მოდელისთვის „70–75%“ დიაპაზონი დაახლოებით 70–75%-ით უნდა მართლდებოდეს. თუ ნაკლებია — მოდელი ზედმეტად თავდაჯერებულია და ვასწორებთ.</div>`;
}

boot().catch(e => { console.error(e); $('#view').innerHTML = `<div class="empty">ჩატვირთვის შეცდომა: ${esc(e.message)}</div>`; });
