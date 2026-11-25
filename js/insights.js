// ===================== Team Traits + AI მიგნებები =====================
import { DB, teamRows, aggregate, playerLines, playerTotals, injuriesNear, S } from './engine.js?v=202611251728';
import { tn } from './markets.js?v=202611251728';

const f1 = x => x == null ? '—' : (Math.round(x * 10) / 10).toString();
const P = x => Math.round(x * 100) + '%';

// ლიგის გუნდების აგრეგატები პროცენტილებისთვის
const lgCache = new Map();
function leagueAggs(code, before) {
  const key = code + Math.floor(before / 864e5);
  if (lgCache.has(key)) return lgCache.get(key);
  const teams = Object.keys(DB.comps[code]?.doc.teams || {}).map(Number);
  const out = teams.map(t => ({ t, a: aggregate(teamRows(t, before, 'all', { leagueOnly: true })) })).filter(x => x.a.n >= 3);
  lgCache.set(key, out); return out;
}
const rank = (list, key, val) => { const v = list.map(x => x.a[key]).filter(x => x != null).sort((a, b) => a - b); if (!v.length || val == null) return 0.5; return v.filter(x => x < val).length / v.length; };

export function traits(tid, before) {
  const lg = DB.teamLeague[tid];
  const rows = teamRows(tid, before), a = aggregate(rows);
  if (a.n < 4) return [];
  const list = lg ? leagueAggs(lg, before) : [];
  const r = (k) => rank(list, k, a[k]);
  const out = [];
  const add = (cond, label, tone, why) => { if (cond) out.push({ label, tone, why }); };
  add(a.o25 >= 0.62, 'გოლიანი მატჩები', 'hot', `${P(a.o25)} მატჩში 2.5-ზე მეტი გოლი`);
  add(a.o25 <= 0.36, 'ძუნწი მატჩები', 'cold', `მხოლოდ ${P(a.o25)} მატჩშია 2.5-ზე მეტი გოლი`);
  add(r('gf') >= 0.8, 'ძლიერი შეტევა', 'good', `${f1(a.gf)} გოლი მატჩში — ლიგის ტოპ 20%`);
  add(r('ga') <= 0.2, 'რკინის დაცვა', 'good', `მხოლოდ ${f1(a.ga)} გაშვებული მატჩში`);
  add(r('ga') >= 0.85, 'სუსტი დაცვა', 'bad', `${f1(a.ga)} გაშვებული მატჩში`);
  add(a.ns >= 4 && r('cor') >= 0.8, 'კუთხურების მანქანა', 'hot', `${f1(a.cor)} კუთხური მატჩში`);
  add(a.ns >= 4 && r('cora') >= 0.8, 'ბევრ კუთხურს უშვებს', 'bad', `მეტოქეს ${f1(a.cora)} კუთხურს აძლევს`);
  add(a.ns >= 4 && r('yc') >= 0.8, 'უხეში თამაში', 'bad', `${f1(a.yc)} ყვითელი მატჩში`);
  add(a.ns >= 4 && r('yc') <= 0.15, 'სუფთა თამაში', 'good', `მხოლოდ ${f1(a.yc)} ყვითელი მატჩში`);
  add(a.poss >= 57, 'ბურთის ფლობის გუნდი', 'info', `საშუალოდ ${Math.round(a.poss)}% ფლობა`);
  add(a.poss != null && a.poss <= 44 && a.gf >= 1.2, 'კონტრშეტევის გუნდი', 'info', `${Math.round(a.poss)}% ფლობით ${f1(a.gf)} გოლი`);
  if (a.gForN >= 10) {
    const late = (a.gForB[5]) / a.gForN, second = (a.gForB[3] + a.gForB[4] + a.gForB[5]) / a.gForN, early = a.gForB[0] / a.gForN;
    add(second >= 0.62, 'მეორე ტაიმის გუნდი', 'hot', `გოლების ${P(second)} მე-2 ტაიმშია`);
    add(late >= 0.28, 'ბოლო წუთების გუნდი', 'hot', `გოლების ${P(late)} 76-ე წუთის მერე`);
    add(early >= 0.22, 'სწრაფი სტარტი', 'hot', `გოლების ${P(early)} პირველ 15 წუთში`);
  }
  if (a.gAgN >= 10) add(a.gAgB[5] / a.gAgN >= 0.3, 'გვიან უშვებს', 'bad', `გაშვებულის ${P(a.gAgB[5] / a.gAgN)} 76-ე წუთის მერე`);
  const H = aggregate(rows.filter(r => r.home)), A = aggregate(rows.filter(r => !r.home));
  add(H.n >= 4 && H.ppg >= 2.2, 'შინ ციხესიმაგრე', 'good', `შინ ${f1(H.ppg)} ქულა მატჩში`);
  add(A.n >= 4 && A.ppg <= 0.8, 'გასვლაზე სუსტი', 'bad', `გასვლაზე ${f1(A.ppg)} ქულა მატჩში`);
  add(A.n >= 4 && A.ppg >= 2.0, 'გასვლის სპეციალისტი', 'good', `გასვლაზე ${f1(A.ppg)} ქულა მატჩში`);
  add(a.sfN >= 5 && a.sfWin >= 0.8, 'უპირატესობას ინარჩუნებს', 'good', `პირველი რომ გაიტანს — ${P(a.sfWin)} მოგება`);
  add(a.sfN >= 5 && a.sfWin <= 0.5, 'უპირატესობას კარგავს', 'bad', `პირველი რომ გაიტანს — მხოლოდ ${P(a.sfWin)} მოგება`);
  add(a.comeback >= 3, 'კამბეკის გუნდი', 'hot', `${a.comeback}-ჯერ წაგებული პოზიციიდან ქულა აიღო`);
  add(a.btts >= 0.65, 'BTTS გუნდი', 'hot', `${P(a.btts)} მატჩში ორივემ გაიტანა`);
  add(a.cs >= 0.45, 'ხშირად მშრალად', 'good', `${P(a.cs)} მატჩში მშრალად`);
  if (a.xg != null && a.ns >= 6) {
    add(a.gf - a.xg >= 0.3, 'ზუსტი რეალიზაცია', 'good', `${f1(a.gf)} გოლი ${f1(a.xg)} xG-დან`);
    add(a.xg - a.gf >= 0.3, 'ვერ არეალიზებს', 'bad', `${f1(a.gf)} გოლი ${f1(a.xg)} xG-დან`);
  }
  return out;
}

// ---------- მიგნებები (პატერნები)
export function patterns(tid, before, venue = 'all') {
  const rows = teamRows(tid, before, venue);
  const out = [];
  if (rows.length < 4) return out;
  const where = venue === 'home' ? ' (შინ)' : venue === 'away' ? ' (გასვლაზე)' : '';
  // სერიები
  const streak = (pred) => { let k = 0; for (let i = rows.length - 1; i >= 0 && pred(rows[i]); i--) k++; return k; };
  const S1 = [
    [r => r.res === 'W', 'ზედიზედ იგებს'], [r => r.res !== 'L', 'ზედიზედ არ აგებს'], [r => r.res !== 'W', 'ზედიზედ ვერ იგებს'],
    [r => r.res === 'L', 'ზედიზედ აგებს'], [r => r.gf > 0, 'ზედიზედ იტანს'], [r => r.ga === 0, 'ზედიზედ მშრალად თამაშობს'],
    [r => r.gf + r.ga > 2.5, 'ზედიზედ 2.5-ზე მეტი გოლი'], [r => r.gf + r.ga < 2.5, 'ზედიზედ 2.5-ზე ნაკლები გოლი'],
    [r => r.gf > 0 && r.ga > 0, 'ზედიზედ ორივე იტანს'], [r => r.ga > 0, 'ზედიზედ უშვებს'],
  ];
  for (const [pred, txt] of S1) { const k = streak(pred); if (k >= 4) out.push({ w: k, txt: `${txt}${where}: ${k} მატჩი`, tone: 'hot' }); }
  // სიხშირეები ბოლო 10-ში
  const last = rows.slice(-10), n = last.length;
  const freq = [
    [r => r.h2f != null && r.h2f > 0, 'მე-2 ტაიმში გაიტანა'], [r => r.htf != null && r.htf > 0, '1-ელ ტაიმში გაიტანა'],
    [r => r.hta != null && r.hta > 0, '1-ელ ტაიმში გაუშვა'], [r => r.h2a != null && r.h2a > 0, 'მე-2 ტაიმში გაუშვა'],
    [r => r.gf + r.ga > 1.5, '1.5-ზე მეტი გოლი იყო'], [r => r.first === 'us', 'პირველმა გაიტანა'],
    [r => r.goalsFor && r.goalsFor.some(m => m > 75), '76-ე წუთის მერე გაიტანა'], [r => r.goalsAg && r.goalsAg.some(m => m > 75), '76-ე წუთის მერე გაუშვა'],
  ];
  for (const [pred, txt] of freq) { const k = last.filter(pred).length; if (n >= 6 && k / n >= 0.8) out.push({ w: k / n * 6, txt: `ბოლო ${n}-დან ${k} მატჩში ${txt}${where}`, tone: 'info' }); }
  const lastSt = rows.filter(r => r.st && r.so).slice(-10), ns = lastSt.length;
  if (ns >= 6) {
    const sf = [
      [r => r.st[S.COR] >= 6, '6+ კუთხური აიღო'], [r => r.so[S.COR] >= 6, 'მეტოქეს 6+ კუთხური მისცა'], [r => r.st[S.COR] + r.so[S.COR] >= 10, '10+ კუთხური იყო'],
      [r => (r.st[S.YC] || 0) >= 2, '2+ ყვითელი მიიღო'], [r => (r.st[S.YC] || 0) + (r.so[S.YC] || 0) >= 5, '5+ ყვითელი იყო'],
      [r => (r.st[S.SOT] || 0) >= 5, 'კარში 5+ დარტყმა შეასრულა'], [r => (r.st[S.COR] || 0) <= 3, '3 ან ნაკლები კუთხური აიღო'],
    ];
    for (const [pred, txt] of sf) { const k = lastSt.filter(pred).length; if (k / ns >= 0.8) out.push({ w: k / ns * 5, txt: `ბოლო ${ns}-დან ${k} მატჩში ${txt}${where}`, tone: 'info' }); }
  }
  // თამაშის მდგომარეობა: პირველმა გაიტანა vs პირველი გაუშვა (მატჩის ჯამური სტატებით)
  const sfR = rows.filter(r => r.first === 'us' && r.st), saR = rows.filter(r => r.first === 'them' && r.st);
  if (sfR.length >= 4 && saR.length >= 4) {
    const m = (arr, i) => arr.reduce((s, r) => s + (r.st[i] || 0), 0) / arr.length;
    for (const [i, nm] of [[S.COR, 'კუთხური'], [S.SH, 'დარტყმა'], [S.YC, 'ყვითელი']]) {
      const a = m(sfR, i), b = m(saR, i);
      if (Math.abs(a - b) >= Math.max(0.8, 0.25 * Math.max(a, b))) out.push({ w: 4,
        txt: `როცა პირველი გაუშვებს — ${f1(b)} ${nm} მატჩში, როცა პირველი გაიტანს — ${f1(a)}${where} (${saR.length} და ${sfR.length} მატჩი)`, tone: 'hot' });
    }
    const pa = saR.length, pts = saR.reduce((s, r) => s + (r.res === 'W' ? 3 : r.res === 'D' ? 1 : 0), 0) / pa;
    if (pts >= 1.2) out.push({ w: 3, txt: `პირველი გაშვებული გოლის მერეც ${f1(pts)} ქულას იღებს მატჩში — არ ნებდება`, tone: 'good' });
    if (pts <= 0.25) out.push({ w: 3, txt: `პირველი გოლის გაშვების მერე თითქმის ყოველთვის აგებს (${f1(pts)} ქულა მატჩში)`, tone: 'bad' });
  }
  // ფავორიტი / აუტსაიდერი (ლიგის ცხრილის ზედა/ქვედა ნახევარი)
  const lg = DB.teamLeague[tid];
  if (lg) {
    const tbl = standings(lg, before); const pos = {}; tbl.forEach((x, i) => pos[x.t] = i);
    const half = tbl.length / 2;
    const vsTop = rows.filter(r => pos[r.opp] != null && pos[r.opp] < half && r.c === lg), vsBot = rows.filter(r => pos[r.opp] != null && pos[r.opp] >= half && r.c === lg);
    const ppg = a => a.reduce((s, r) => s + (r.res === 'W' ? 3 : r.res === 'D' ? 1 : 0), 0) / a.length;
    if (vsTop.length >= 4 && vsBot.length >= 4) {
      out.push({ w: 2, txt: `ცხრილის ზედა ნახევრის გუნდებთან ${f1(ppg(vsTop))} ქულა მატჩში, ქვედასთან — ${f1(ppg(vsBot))}`, tone: 'info' });
    }
  }
  return out.sort((a, b) => b.w - a.w).slice(0, 8);
}

// მთავარი მოთამაშეების დაზიანებები
export function keyAbsences(tid, before, fixture) {
  const inj = fixture ? DB.injuries.filter(r => r[3] === fixture.i && r[2] === tid) : injuriesNear(tid, before).list;
  if (!inj.length) return [];
  const tot = playerTotals(playerLines(tid, before));
  const teamGoals = tot.reduce((s, p) => s + p.g, 0) || 1;
  const out = [];
  for (const r of inj) {
    const p = tot.find(x => x.pid === r[0]);
    if (p && (p.g + p.a >= 4 || p.min >= 900)) {
      const share = p.g / teamGoals;
      out.push({ name: r[1], reason: r[6], type: r[5], txt: `${r[1]} არ თამაშობს (${r[6] || r[5]}) — ${p.g} გოლი, ${p.a} ასისტი, ${p.apps} მატჩი${share >= 0.2 ? `; გუნდის გოლების ${P(share)} — დიდი დანაკლისი` : ''}`, big: share >= 0.2 || p.g + p.a >= 8 });
    }
  }
  return out.sort((a, b) => b.big - a.big);
}

// ---------- ცხრილი
export function standings(code, before, roundFilter) {
  const doc = DB.comps[code]?.doc; if (!doc) return [];
  const tbl = {};
  const row = t => tbl[t] ||= { t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
  const grp = DB.comps[code].group;
  if (grp === 'league') for (const t of Object.keys(doc.teams)) row(+t);
  for (const f of DB.fixtures) {
    if (f.c !== code || f.t >= before || f.g[0] == null || !['FT', 'AET', 'PEN'].includes(f.s)) continue;
    if (roundFilter && !roundFilter(f.r)) continue;
    const h = row(f.h), a = row(f.a);
    h.p++; a.p++; h.gf += f.g[0]; h.ga += f.g[1]; a.gf += f.g[1]; a.ga += f.g[0];
    if (f.g[0] > f.g[1]) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
    else if (f.g[0] < f.g[1]) { a.w++; h.l++; a.pts += 3; h.form.push('L'); a.form.push('W'); }
    else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
  }
  return Object.values(tbl).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || tn(x.t).localeCompare(tn(y.t)));
}

// ===================== დასვენება / დატვირთვა =====================
export function restInfo(tid, f) {
  const list = DB.byTeam[tid] || [];
  const prev = [...list].reverse().find(x => x.t < f.t && x.i !== f.i);
  const next = list.find(x => x.t > f.t && x.i !== f.i);
  const last14 = list.filter(x => x.t < f.t && x.t >= f.t - 14 * 864e5).length;
  const days = prev ? (f.t - prev.t) / 864e5 : null, nextDays = next ? (next.t - f.t) / 864e5 : null;
  const tags = [];
  // < 3 დღე — გაფრთხილება; 3–6 — ნორმა (არაფერს ვწერთ); 6+ — კარგად დასვენებული
  if (days != null && days < 3) tags.push({ t: `მხოლოდ ${Math.round(days * 10) / 10} დღე დასვენება`, tone: 'bad' });
  else if (days != null && days >= 6) tags.push({ t: 'კარგად დასვენებული', tone: 'good' });
  if (last14 >= 4) tags.push({ t: `დატვირთული გრაფიკი: ${last14} მატჩი 14 დღეში`, tone: 'bad' });
  if (next && nextDays < 3 && DB.comps[next.c]?.group !== 'league') tags.push({ t: `${Math.round(nextDays)} დღეში ${DB.comps[next.c].name} — შეიძლება როტაცია`, tone: 'hot' });
  const partial = DB.core && !DB.core.has(tid); // ამ გუნდის ეროვნული ლიგა ჩვენს ბაზაში არ არის
  if (partial) return { prev, next, days, nextDays, last14, tags: [], partial };
  return { prev, next, days, nextDays, last14, tags };
}

// ===================== მოტივაცია (ცხრილის მიხედვით) =====================
const EURO_SPOTS = { pl: 5, ll: 5, sa: 4, bl: 4, l1: 3, ed: 2 };
const RELEG = { pl: 3, ll: 3, sa: 3, bl: 2, l1: 2, ed: 2 };
export function motivation(tid, f) {
  const C = DB.comps[f.c]; if (!C) return null;
  if (C.group === 'cup') return { label: 'თასი — ნოკაუტი, დამარცხება = გავარდნა', tone: 'hot', lines: [] };
  if (C.group === 'euro') {
    if (/League Stage/i.test(f.r || '')) {
      const tbl = standings(f.c, f.t, r => /League Stage/i.test(r || '')); const pos = tbl.findIndex(x => x.t === tid) + 1;
      if (!pos) return null;
      const label = pos <= 8 ? 'ტოპ-8 — პირდაპირ 1/8 ფინალისკენ' : pos <= 24 ? 'პლეი-ოფის ზონა (9–24)' : 'გავარდნის ზონა (25+)';
      return { label: `ლიგის ფაზა: ${pos}-ე ადგილი · ${label}`, tone: pos > 24 ? 'bad' : pos <= 8 ? 'good' : 'info', lines: [] };
    }
    return { label: 'ევროთასის ნოკაუტი — მაქსიმალური მოტივაცია', tone: 'hot', lines: [] };
  }
  const tbl = standings(f.c, f.t); const n = tbl.length, i = tbl.findIndex(x => x.t === tid); if (i < 0) return null;
  const me = tbl[i], pos = i + 1;
  const totalRounds = (n - 1) * 2, left = totalRounds - me.p, maxGain = left * 3;
  const eu = EURO_SPOTS[f.c] || 4, rel = RELEG[f.c] || 3;
  const toTop = tbl[0].pts - me.pts, toEuro = tbl[eu - 1].pts - me.pts, toSafe = me.pts - tbl[n - rel - 1]?.pts;
  const lines = [`${pos}-ე ადგილი, ${me.pts} ქულა, დარჩენილია ${left} მატჩი`];
  if (pos > 1) lines.push(`ლიდერამდე: ${toTop} ქულა`);
  if (pos > eu) lines.push(`ჩემპიონთა ლიგის ზონამდე (${eu}-ე ადგილი): ${toEuro} ქულა`);
  if (pos > n - rel) lines.push(`გადარჩენის ზონამდე: ${-toSafe} ქულა`); else if (pos >= n - rel - 3) lines.push(`ჩავარდნის ზონიდან დაშორება: ${toSafe + 0} ქულა`);
  let label, tone = 'info';
  if (left > totalRounds * 0.6) label = 'სეზონის პირველი ნახევარი — მოტივაცია ჩვეულებრივი';
  else if (pos <= 3 && toTop <= Math.min(maxGain, 9)) { label = 'ტიტულისთვის ბრძოლა'; tone = 'hot'; }
  else if (pos > n - rel || (pos >= n - rel - 3 && toSafe <= 6)) { label = 'გადარჩენისთვის ბრძოლა'; tone = 'bad'; }
  else if (Math.abs(toEuro) <= 6 && pos <= eu + 4) { label = 'ევროპული ადგილებისთვის ბრძოლა'; tone = 'good'; }
  else if (left <= 8) { label = 'ცხრილის შუა — მოტივაცია შეიძლება დაბალი იყოს'; tone = 'cold'; }
  else label = 'მოტივაცია ჩვეულებრივი';
  return { label, tone, lines };
}

// ===================== მწვრთნელი =====================
export function coachInfo(tid, before) {
  const c = DB.coaches?.[tid]?.cur; if (!c) return null;
  const [name, start] = c;
  const out = { name, start };
  if (start) {
    const st = Date.parse(start);
    const rows = teamRows(tid, before);
    const after = rows.filter(r => r.t >= st), prior = rows.filter(r => r.t < st);
    if (after.length && prior.length) {
      const A = aggregate(after), B = aggregate(prior);
      out.change = { n: A.n, w: A.w, d: A.d, l: A.l, ppg: A.ppg, ppg0: B.ppg, n0: B.n, gf: A.gf, ga: A.ga, gf0: B.gf, ga0: B.ga };
    }
  }
  return out;
}

// ===================== სცენარები =====================
export function scenarios(tid, before, venue = 'all') {
  const rows = teamRows(tid, before, venue).filter(r => r.f.tl);
  const out = [];
  const pts = r => r.res === 'W' ? 3 : r.res === 'D' ? 1 : 0;
  const avgSt = (arr, i) => { const a = arr.filter(r => r.st); return a.length ? a.reduce((s, r) => s + (r.st[i] || 0), 0) / a.length : null; };
  const add = (title, n, text, tone = 'info') => out.push({ title, n, text, tone });
  // 1. როცა წაგებაზეა
  const tr = rows.filter(r => r.trailed), nt = rows.filter(r => !r.trailed);
  if (tr.length >= 3) {
    const pp = tr.reduce((s, r) => s + pts(r), 0) / tr.length;
    add('როცა წაგებაზეა', tr.length, `${tr.length} მატჩში იყო წაგებაზე → საბოლოოდ ${tr.filter(r => r.res === 'W').length} მოგება, ${tr.filter(r => r.res === 'D').length} ფრე, ${tr.filter(r => r.res === 'L').length} წაგება (${f1(pp)} ქულა/მატჩი). ასეთ მატჩებში: ${f1(avgSt(tr, S.COR))} კუთხური, ${f1(avgSt(tr, S.SH))} დარტყმა, ${f1(avgSt(tr, S.YC))} ყვითელი (სხვა მატჩებში: ${f1(avgSt(nt, S.COR))} / ${f1(avgSt(nt, S.SH))} / ${f1(avgSt(nt, S.YC))}).`, pp >= 1 ? 'good' : 'bad');
  }
  // 2. როცა პირველი იტანს
  const sf = rows.filter(r => r.first === 'us');
  if (sf.length >= 3) {
    const more = sf.filter(r => r.goalsFor.length >= 2).length;
    add('როცა პირველი იტანს', sf.length, `${sf.length} მატჩში გაიტანა პირველმა → ${sf.filter(r => r.res === 'W').length} მოგება, ${sf.filter(r => r.res === 'D').length} ფრე, ${sf.filter(r => r.res === 'L').length} წაგება. ${more}-ში მეორე გოლიც გაიტანა; ${sf.filter(r => r.ga > 0).length}-ში მაინც გაუშვა. კუთხური ასეთ მატჩებში: ${f1(avgSt(sf, S.COR))}, კარში დარტყმა: ${f1(avgSt(sf, S.SOT))}.`, sf.filter(r => r.res === 'W').length / sf.length >= 0.7 ? 'good' : 'bad');
  }
  // 3. ფრე 70-ე წუთზე
  const lvl = rows.filter(r => { const a = r.goalsFor.filter(m => m <= 70).length, b = r.goalsAg.filter(m => m <= 70).length; return a === b; });
  if (lvl.length >= 3) {
    const w = lvl.filter(r => r.res === 'W').length, d = lvl.filter(r => r.res === 'D').length, l = lvl.filter(r => r.res === 'L').length;
    const late = lvl.filter(r => r.goalsFor.some(m => m > 70) || r.goalsAg.some(m => m > 70)).length;
    add('ფრე 70-ე წუთზე', lvl.length, `${lvl.length} მატჩში ანგარიში 70'-ზე თანაბარი იყო → ${w} მოგება, ${d} ფრე, ${l} წაგება; ${late}-ში 70'-ის მერე გოლი გავიდა.`, w > l ? 'good' : l > w ? 'bad' : 'info');
  }
  // 4. წითელი ბარათის მერე
  const red = rows.filter(r => (r.f.ev || []).some(e => e[3] === 'C' && /Red|Second Yellow/i.test(e[4] || '') && e[2] === (r.home ? 0 : 1)));
  if (red.length) {
    const ga = red.map(r => { const m = Math.min(...r.f.ev.filter(e => e[3] === 'C' && /Red|Second Yellow/i.test(e[4] || '') && e[2] === (r.home ? 0 : 1)).map(e => e[0])); return r.goalsAg.filter(x => x >= m).length; });
    add('წითელი ბარათის მიღების მერე', red.length, `${red.length} მატჩში მიიღო წითელი → ${red.filter(r => r.res === 'W').length} მოგება, ${red.filter(r => r.res === 'D').length} ფრე, ${red.filter(r => r.res === 'L').length} წაგება; წითლის მერე საშუალოდ ${f1(ga.reduce((a, b) => a + b, 0) / red.length)} გოლი გაუშვა.`, 'bad');
  }
  // 5. შესვენებაზე წაგებისას
  const htL = rows.filter(r => r.htf != null && r.htf < r.hta);
  if (htL.length >= 2) {
    add('შესვენებაზე წაგებისას', htL.length, `${htL.length}-ჯერ წააგო პირველი ტაიმი → ${htL.filter(r => r.res === 'W').length} მოგება, ${htL.filter(r => r.res === 'D').length} ფრე, ${htL.filter(r => r.res === 'L').length} წაგება; მე-2 ტაიმში საშუალოდ ${f1(htL.reduce((s, r) => s + r.h2f, 0) / htL.length)} გოლი გაიტანა.`, htL.some(r => r.res !== 'L') ? 'good' : 'bad');
  }
  // 6. 2-გოლიანი უპირატესობა
  const two = rows.filter(r => { let us = 0, th = 0; for (const [m, side] of r.f.tl) { if (side === (r.home ? 0 : 1)) us++; else th++; if (us - th >= 2) return true; } return false; });
  if (two.length >= 2) {
    const lost = two.filter(r => r.res !== 'W').length;
    add('2-გოლიანი უპირატესობისას', two.length, `${two.length}-ჯერ დაწინაურდა 2 გოლით → ${two.length - lost} მოგება${lost ? `, ${lost}-ჯერ ვერ მოიგო (უპირატესობა დაკარგა)` : ' — ერთხელაც არ დაუკარგავს'}.`, lost ? 'bad' : 'good');
  }
  // 7. პენალტები
  const allRows = teamRows(tid, before, venue).filter(r => r.f.ev);
  if (allRows.length >= 5) {
    const pen = (r, mine) => r.f.ev.filter(e => e[3] === 'G' && (e[4] === 'Penalty' || e[4] === 'Missed Penalty') && (e[2] === (r.home ? 0 : 1)) === mine && e[0] <= 120).length;
    const won = allRows.reduce((s, r) => s + pen(r, true), 0), con = allRows.reduce((s, r) => s + pen(r, false), 0);
    add('პენალტები', allRows.length, `${allRows.length} მატჩში: მიიღო ${won} პენალტი (${f1(won / allRows.length)}/მატჩი), მისცა ${con} (${f1(con / allRows.length)}/მატჩი).`, won > con ? 'good' : con > won ? 'bad' : 'info');
  }
  return out;
}
