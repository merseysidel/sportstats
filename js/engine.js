// ===================== SportStats — ანალიზის ძრავა =====================
// ყველაფერი ითვლება ბრაუზერში, მხოლოდ არჩეულ თარიღამდე არსებული მონაცემებით.

export const S = { SOT: 0, SOFF: 1, SH: 2, BLK: 3, INB: 4, OUTB: 5, FOUL: 6, COR: 7, OFF: 8, POSS: 9,
  YC: 10, RC: 11, SAVE: 12, PASS: 13, PACC: 14, PPCT: 15, XG: 16, GP: 17 };
const FIN = new Set(['FT', 'AET', 'PEN']);
export const isFin = f => FIN.has(f.s) && f.g[0] != null;

export const DB = { comps: {}, cfg: null, fixtures: [], byId: {}, byTeam: {}, teams: {}, players: { names: {}, m: {} },
  injuries: [], teamLeague: {}, refs: {}, disp: {} };

// -------------------------------------------------- ინდექსები
export function indexData(cfg, compDocs, playerDocs, injuryDocs) {
  DB.cfg = cfg;
  // ძირითადი გუნდები = ჩვენი 6 ლიგის გუნდები; ეროვნულ თასებში მხოლოდ მათი მატჩები გვაინტერესებს
  const core = new Set();
  for (const c of cfg.competitions) if (c.group === 'league' && compDocs[c.code]) for (const id of Object.keys(compDocs[c.code].teams)) core.add(+id);
  DB.core = core;
  for (const c of cfg.competitions) {
    const doc = compDocs[c.code]; if (!doc) continue;
    DB.comps[c.code] = { ...c, doc };
    if (c.group === 'cup') { const keep = new Set(doc.fixtures.filter(f => core.has(f.h) || core.has(f.a)).flatMap(f => [String(f.h), String(f.a)])); doc.teams = Object.fromEntries(Object.entries(doc.teams).filter(([id]) => keep.has(id))); }
    for (const [id, t] of Object.entries(doc.teams)) {
      if (!DB.teams[id]) DB.teams[id] = { id: +id, name: t[0], logo: t[1], comps: new Set() };
      DB.teams[id].comps.add(c.code);
      if (c.group === 'league' && !DB.teamLeague[id]) DB.teamLeague[id] = c.code;
    }
    if (c.group === 'cup') doc.fixtures = doc.fixtures.filter(f => core.has(f.h) || core.has(f.a));
    for (const f of doc.fixtures) {
      f.c = c.code; f.t = Date.parse(f.d) - 5 * 60 * 1000; // 5 წუთით ადრე: 00:00-იანი მატჩი წინა დღეს ეკუთვნის (23:55)
      DB.fixtures.push(f); DB.byId[f.i] = f;
    }
  }
  DB.fixtures.sort((a, b) => a.t - b.t);
  for (const f of DB.fixtures) {
    (DB.byTeam[f.h] ||= []).push(f); (DB.byTeam[f.a] ||= []).push(f);
    f.tl = timeline(f);
  }
  for (const code in playerDocs) {
    const p = playerDocs[code];
    Object.assign(DB.players.names, p.names);
    Object.assign(DB.players.m, p.m);
  }
  for (const code in injuryDocs) for (const r of injuryDocs[code]) DB.injuries.push(r);
  estimateDispersion();
}

// გოლების თანმიმდევრობა [[წუთი, მხარე(0/1)], ...] — თუ საბოლოო ანგარიშს არ ემთხვევა, null
function timeline(f) {
  if (!isFin(f) || !f.ev) return null;
  const goals = f.ev.filter(e => e[3] === 'G' && e[4] !== 'Missed Penalty');
  const mk = flipOG => goals.map(e => [e[0] + (e[0] >= 90 || e[0] === 45 ? 0 : 0), (e[4] === 'Own Goal' && flipOG) ? 1 - e[2] : e[2], e[1] || 0]);
  for (const flip of [false, true]) {
    const tl = mk(flip);
    // მხოლოდ ძირითადი დრო (≤120) — პენალტების სერიის გარეშე
    const reg = tl.filter(x => x[0] <= 120);
    const h = reg.filter(x => x[1] === 0).length, a = reg.filter(x => x[1] === 1).length;
    const fh = f.s === 'PEN' || f.s === 'AET' ? null : f.g;
    if (!fh || (h === fh[0] && a === fh[1])) return reg.sort((x, y) => x[0] - y[0] || x[2] - y[2]);
  }
  return null;
}

// -------------------------------------------------- გუნდის პერსპექტივა
export function persp(f, tid) {
  const home = f.h === tid, s = home ? 0 : 1, o = 1 - s;
  const gf = f.g[s], ga = f.g[o];
  const r = { f, home, opp: home ? f.a : f.h, gf, ga, res: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
    htf: f.ht?.[s], hta: f.ht?.[o], st: f.st ? f.st[s] : null, so: f.st ? f.st[o] : null, c: f.c, t: f.t };
  if (f.s === 'PEN' || f.s === 'AET') r.res = 'D'; // 90 წუთის შედეგი ცნობილი არ არის — ფრედ ითვლება
  if (f.tl) {
    let us = 0, them = 0, trailed = false, led = false;
    r.first = f.tl.length ? (f.tl[0][1] === s ? 'us' : 'them') : null;
    r.goalsFor = []; r.goalsAg = [];
    for (const [m, side] of f.tl) {
      if (side === s) { us++; r.goalsFor.push(m); } else { them++; r.goalsAg.push(m); }
      if (us < them) trailed = true; if (us > them) led = true;
    }
    r.trailed = trailed; r.led = led;
  }
  r.h2f = r.htf != null ? r.gf - r.htf : null; r.h2a = r.hta != null ? r.ga - r.hta : null;
  return r;
}

// გუნდის მატჩები არჩეულ დრომდე
export function teamRows(tid, before, venue = 'all', opts = {}) {
  const list = DB.byTeam[tid] || [];
  const out = [];
  for (const f of list) {
    if (f.t >= before) break;
    if (!isFin(f)) continue;
    if (opts.comp && f.c !== opts.comp) continue;
    if (opts.leagueOnly && DB.comps[f.c].group !== 'league') continue;
    const r = persp(f, tid);
    if (venue === 'home' && !r.home) continue;
    if (venue === 'away' && r.home) continue;
    out.push(r);
  }
  return out;
}

// -------------------------------------------------- აგრეგატები
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const pct = (rows, fn) => rows.length ? rows.filter(fn).length / rows.length : null;

export function aggregate(rows) {
  const n = rows.length, st = rows.filter(r => r.st && r.so);
  const sv = (i, own = true) => avg(st.map(r => (own ? r.st : r.so)[i]).filter(v => v != null));
  const tot = rows.map(r => r.gf + r.ga);
  const tl = rows.filter(r => r.goalsFor);
  const gFor = tl.flatMap(r => r.goalsFor), gAg = tl.flatMap(r => r.goalsAg);
  const bucket = ms => { const b = [0, 0, 0, 0, 0, 0]; for (const m of ms) b[Math.min(5, Math.floor((Math.min(m, 90) - 1) / 15))]++; return b; };
  const sf = tl.filter(r => r.first === 'us'), sa = tl.filter(r => r.first === 'them');
  const pts = r => r.res === 'W' ? 3 : r.res === 'D' ? 1 : 0;
  return {
    n, w: rows.filter(r => r.res === 'W').length, d: rows.filter(r => r.res === 'D').length, l: rows.filter(r => r.res === 'L').length,
    ppg: n ? rows.reduce((s, r) => s + pts(r), 0) / n : null,
    gf: avg(rows.map(r => r.gf)), ga: avg(rows.map(r => r.ga)), tg: avg(tot),
    o15: pct(rows, r => r.gf + r.ga > 1.5), o25: pct(rows, r => r.gf + r.ga > 2.5), o35: pct(rows, r => r.gf + r.ga > 3.5),
    btts: pct(rows, r => r.gf > 0 && r.ga > 0), cs: pct(rows, r => r.ga === 0), fts: pct(rows, r => r.gf === 0),
    ns: st.length,
    xg: sv(S.XG), xga: sv(S.XG, false), sh: sv(S.SH), sha: sv(S.SH, false), sot: sv(S.SOT), sota: sv(S.SOT, false),
    cor: sv(S.COR), cora: sv(S.COR, false), foul: sv(S.FOUL), foula: sv(S.FOUL, false),
    yc: sv(S.YC), yca: sv(S.YC, false), rc: avg(st.map(r => (r.st[S.RC] || 0))), off: sv(S.OFF), offa: sv(S.OFF, false),
    poss: sv(S.POSS), blk: sv(S.BLK), inb: sv(S.INB), pass: sv(S.PASS), ppct: sv(S.PPCT), save: sv(S.SAVE),
    totCor: avg(st.map(r => (r.st[S.COR] || 0) + (r.so[S.COR] || 0))),
    totYc: avg(st.map(r => (r.st[S.YC] || 0) + (r.so[S.YC] || 0))),
    totFoul: avg(st.map(r => (r.st[S.FOUL] || 0) + (r.so[S.FOUL] || 0))),
    ntl: tl.length, gForB: bucket(gFor), gAgB: bucket(gAg), gForN: gFor.length, gAgN: gAg.length,
    g1: avg(rows.filter(r => r.htf != null).map(r => r.htf)), g2: avg(rows.filter(r => r.h2f != null).map(r => r.h2f)),
    c1: avg(rows.filter(r => r.hta != null).map(r => r.hta)), c2: avg(rows.filter(r => r.h2a != null).map(r => r.h2a)),
    sfN: sf.length, saN: sa.length, sfWin: sf.length ? sf.filter(r => r.res === 'W').length / sf.length : null,
    saPts: sa.length ? sa.reduce((s, r) => s + pts(r), 0) / sa.length : null,
    firstPct: tl.length ? sf.length / tl.length : null,
    comeback: tl.filter(r => r.trailed && r.res !== 'L').length, blown: tl.filter(r => r.led && r.res !== 'W').length,
    form: rows.slice(-5).map(r => r.res),
  };
}

// -------------------------------------------------- ლიგის საშუალოები
const cacheLg = new Map();
export function compAverages(code, before) {
  const key = code + '|' + Math.floor(before / 864e5);
  if (cacheLg.has(key)) return cacheLg.get(key);
  let fx = DB.fixtures.filter(f => f.t < before && isFin(f) && (!code || f.c === code));
  if (fx.length < 40) fx = DB.fixtures.filter(f => f.t < before && isFin(f));
  if (fx.length < 40) fx = DB.fixtures.filter(isFin); // სეზონის დასაწყისი — მთელი სეზონის საშუალო
  const st = fx.filter(f => f.st);
  const m = (fn, arr = fx) => avg(arr.map(fn).filter(v => v != null && !isNaN(v)));
  const r = {
    n: fx.length, hg: m(f => f.g[0]) || 1.5, ag: m(f => f.g[1]) || 1.2,
    hxg: m(f => f.st[0][S.XG], st) || 1.5, axg: m(f => f.st[1][S.XG], st) || 1.2,
    cor: m(f => f.st[0][S.COR], st) || 5, corH: m(f => f.st[0][S.COR], st) || 5.3, corA: m(f => f.st[1][S.COR], st) || 4.5,
    yc: m(f => f.st[0][S.YC], st) || 2, ycH: m(f => f.st[0][S.YC], st) || 1.9, ycA: m(f => f.st[1][S.YC], st) || 2.1,
    foulH: m(f => f.st[0][S.FOUL], st) || 11, foulA: m(f => f.st[1][S.FOUL], st) || 11,
    offH: m(f => f.st[0][S.OFF], st) || 2, offA: m(f => f.st[1][S.OFF], st) || 2,
    sotH: m(f => f.st[0][S.SOT], st) || 4.5, sotA: m(f => f.st[1][S.SOT], st) || 3.8,
    shH: m(f => f.st[0][S.SH], st) || 13, shA: m(f => f.st[1][S.SH], st) || 11,
    rc: m(f => (f.st[0][S.RC] || 0) + (f.st[1][S.RC] || 0), st) || 0.15,
    ht: m(f => f.ht[0] != null ? (f.ht[0] + f.ht[1]) / Math.max(1, f.g[0] + f.g[1]) : null, fx.filter(f => f.g[0] + f.g[1] > 0)) || 0.44,
  };
  cacheLg.set(key, r); return r;
}

// სტატების დისპერსია (ვარიაცია/საშუალო) — უარყოფითი ბინომიალისთვის
function estimateDispersion() {
  const st = DB.fixtures.filter(f => isFin(f) && f.st);
  const disp = (fn) => {
    const v = st.map(fn).filter(x => x != null);
    if (v.length < 30) return 1.3;
    const m = avg(v), va = avg(v.map(x => (x - m) ** 2));
    return Math.max(1.0, Math.min(3, va / m));
  };
  DB.disp = {
    cor: disp(f => f.st[0][S.COR]), yc: disp(f => f.st[0][S.YC]), foul: disp(f => f.st[0][S.FOUL]),
    off: disp(f => f.st[0][S.OFF]), sot: disp(f => f.st[0][S.SOT]), sh: disp(f => f.st[0][S.SH]),
  };
}

// -------------------------------------------------- მსაჯები
export function refereeStats(name, before) {
  if (!name) return null;
  const fx = DB.fixtures.filter(f => f.ref === name && f.t < before && isFin(f) && f.st);
  if (!fx.length) return { name, n: 0 };
  const s = i => avg(fx.map(f => (f.st[0][i] || 0) + (f.st[1][i] || 0)));
  return { name, n: fx.length, foul: s(S.FOUL), yc: s(S.YC), rc: s(S.RC), pen: avg(fx.map(f => (f.ev || []).filter(e => e[3] === 'G' && (e[4] === 'Penalty' || e[4] === 'Missed Penalty')).length)) };
}

// -------------------------------------------------- ალბათობები
function pois(l, k) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
function poisArr(l, max = 12) { const a = []; for (let k = 0; k <= max; k++) a.push(pois(l, k)); return a; }
// უარყოფითი ბინომიალი საშუალოთი m და ვარიაცია/საშუალო = d
function nbArr(m, d, max = 40) {
  if (d <= 1.02) return poisArr(m, max);
  const p = 1 / d, r = m * p / (1 - p);
  const a = []; let pr = Math.pow(p, r); a.push(pr);
  for (let k = 1; k <= max; k++) { pr = pr * (k - 1 + r) / k * (1 - p); a.push(pr); }
  return a;
}
const conv = (a, b) => { const o = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => o[i + j] += x * y)); return o; };
const over = (arr, line) => arr.reduce((s, p, k) => s + (k > line ? p : 0), 0);
const cmp3 = (a, b) => { let h = 0, d = 0, w = 0; a.forEach((x, i) => b.forEach((y, j) => { if (i > j) h += x * y; else if (i === j) d += x * y; else w += x * y; })); return [h, d, w]; };

const W_HALF = 120; // დღე — ძველი მატჩები ნაკლებ წონას იღებს
function wAvg(rows, fn, prior, k, before) {
  let s = prior * k, w = k;
  for (const r of rows) { const v = fn(r); if (v == null || isNaN(v)) continue; const wt = Math.pow(0.5, (before - r.t) / 864e5 / W_HALF); s += v * wt; w += wt; }
  return s / w;
}
const blendG = (r, own) => {
  const g = own ? r.gf : r.ga, x = r.st && r.so ? (own ? r.st : r.so)[S.XG] : null;
  return x != null ? 0.55 * g + 0.45 * x : g;
};

// მოსალოდნელი მნიშვნელობა გუნდისთვის: (საკუთარი "for" + მეტოქის "against") ფარდობითად ლიგის საშუალოსთან
function expStat(hRows, aRows, idx, avgH, avgA, before) {
  const f = (rows, own, prior) => wAvg(rows.filter(r => r.st && r.so), r => (own ? r.st : r.so)[idx], prior, 4, before);
  const hFor = f(hRows, true, avgH), aAg = f(aRows, false, avgH);
  const aFor = f(aRows, true, avgA), hAg = f(hRows, false, avgA);
  return [Math.max(0.1, hFor * aAg / avgH), Math.max(0.1, aFor * hAg / avgA)];
}

export function predict(f) {
  const before = f.t;
  const L = compAverages(f.c, before);
  const hAll = teamRows(f.h, before), aAll = teamRows(f.a, before);
  const hH = hAll.filter(r => r.home), aA = aAll.filter(r => !r.home);
  const allG = (L.hg + L.ag) / 2;
  // ვენიუს მიხედვით, შეკუმშული მთლიან საშუალოზე
  // გუნდები, რომელთა ლიგაც ჩვენს ბაზაში არ არის (მაგ. სპორტინგი), მცირე მონაცემით ფასდება — უფრო ძლიერ ვკუმშავთ საშუალოსკენ
  const kOf = tid => DB.core && !DB.core.has(tid) ? 10 : 4;
  const venue = (vRows, all, own, base, k) => {
    const overall = wAvg(all, r => blendG(r, own), allG, k - 1, before) * base / allG;
    return wAvg(vRows, r => blendG(r, own), overall, k, before);
  };
  const kh = kOf(f.h), ka = kOf(f.a);
  const hAtt = venue(hH, hAll, true, L.hg, kh) / L.hg, hDef = venue(hH, hAll, false, L.ag, kh) / L.ag;
  const aAtt = venue(aA, aAll, true, L.ag, ka) / L.ag, aDef = venue(aA, aAll, false, L.hg, ka) / L.hg;
  const lh = Math.max(0.15, L.hg * hAtt * aDef), la = Math.max(0.1, L.ag * aAtt * hDef);
  const htr = Math.min(0.5, Math.max(0.38, L.ht));
  const h1 = poisArr(lh * htr), a1 = poisArr(la * htr), h2 = poisArr(lh * (1 - htr)), a2 = poisArr(la * (1 - htr));
  const hF = poisArr(lh), aF = poisArr(la);
  const M = []; let sum = 0;
  for (let i = 0; i <= 10; i++) { M[i] = []; for (let j = 0; j <= 10; j++) { M[i][j] = hF[i] * aF[j]; sum += M[i][j]; } }
  const P = (fn) => { let s = 0; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) if (fn(i, j)) s += M[i][j]; return s / sum; };
  const tot = conv(hF, aF);
  const [p1, px, p2] = cmp3(hF, aF);
  const [ht1, htx, ht2] = cmp3(h1, a1);
  const [sh1, shx, sh2] = cmp3(h2, a2);
  // ტაიმი/მატჩი
  const htft = {};
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const pHT = h1[i] * a1[j]; if (pHT < 1e-6) continue;
    const ht = i > j ? '1' : i === j ? 'X' : '2';
    for (let k = 0; k <= 8; k++) for (let l = 0; l <= 8; l++) {
      const p = pHT * h2[k] * a2[l]; if (p < 1e-7) continue;
      const ft = i + k > j + l ? '1' : i + k === j + l ? 'X' : '2';
      htft[ht + '/' + ft] = (htft[ht + '/' + ft] || 0) + p;
    }
  }
  const t1 = conv(h1, a1), t2 = conv(h2, a2);
  const [moreH1, eqH, moreH2] = cmp3(t1, t2);
  const scores = [];
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) scores.push([i + ':' + j, M[i][j] / sum]);
  scores.sort((a, b) => b[1] - a[1]);

  // ---- სტატები
  const D = DB.disp;
  const [ch, ca] = expStat(hH.length >= 3 ? hH : hAll, aA.length >= 3 ? aA : aAll, S.COR, L.corH, L.corA, before);
  const [yh0, ya0] = expStat(hAll, aAll, S.YC, L.ycH, L.ycA, before);
  const [fh0, fa0] = expStat(hAll, aAll, S.FOUL, L.foulH, L.foulA, before);
  const [oh, oa] = expStat(hAll, aAll, S.OFF, L.offH, L.offA, before);
  const [sth, sta] = expStat(hH.length >= 3 ? hH : hAll, aA.length >= 3 ? aA : aAll, S.SOT, L.sotH, L.sotA, before);
  const [shh, sha] = expStat(hH.length >= 3 ? hH : hAll, aA.length >= 3 ? aA : aAll, S.SH, L.shH, L.shA, before);
  const ref = refereeStats(f.ref, before);
  // მსაჯის კორექცია ბარათებსა და ჯარიმებზე
  let yh = yh0, ya = ya0, fh = fh0, fa = fa0;
  if (ref && ref.n >= 3) {
    const wr = ref.n / (ref.n + 6);
    const ycT = yh0 + ya0, ycR = ycT * (1 - wr) + ref.yc * wr; yh *= ycR / ycT; ya *= ycR / ycT;
    const fT = fh0 + fa0, fR = fT * (1 - wr) + ref.foul * wr; fh *= fR / fT; fa *= fR / fT;
  }
  const corH = nbArr(ch, D.cor), corA = nbArr(ca, D.cor), corT = conv(corH, corA);
  const ycH = nbArr(yh, D.yc), ycA = nbArr(ya, D.yc), ycT = conv(ycH, ycA);
  const flT = conv(nbArr(fh, D.foul, 45), nbArr(fa, D.foul, 45));
  const ofT = conv(nbArr(oh, D.off), nbArr(oa, D.off));
  const sotH = nbArr(sth, D.sot), sotA = nbArr(sta, D.sot), sotT = conv(sotH, sotA);
  const shT = conv(nbArr(shh, D.sh, 50), nbArr(sha, D.sh, 50));
  const possH = (() => {
    const a = aggregate(hAll).poss, b = aggregate(aAll).poss;
    if (a == null || b == null) return 50;
    return Math.max(25, Math.min(75, (a + (100 - b)) / 2));
  })();
  const rcRate = (() => {
    const base = L.rc, t = [aggregate(hAll).rc, aggregate(aAll).rc].filter(x => x != null);
    let m = t.length ? t.reduce((s, x) => s + x, 0) : base;
    if (ref && ref.n >= 3) m = m * 0.5 + ref.rc * 0.5;
    return 1 - Math.exp(-Math.max(0.03, m));
  })();

  return {
    f, lh, la, L, ref, hAll, aAll, hH, aA,
    p1, px, p2, ht1, htx, ht2, sh1, shx, sh2, htft, scores, tot, hF, aF, h1, a1, h2, a2, t1, t2, moreH1, eqH, moreH2,
    P, corH, corA, corT, ch, ca, ycH, ycA, ycT, yh, ya, flT, fh, fa, ofT, oh, oa, sotH, sotA, sotT, sth, sta, shT, shh, sha,
    possH, rcRate, over,
  };
}

// -------------------------------------------------- მოთამაშეები
export function playerLines(tid, before) {
  // [{pid, f, line}] — გუნდის მოთამაშეების სტრიქონები არჩეულ თარიღამდე
  const out = [];
  for (const f of DB.byTeam[tid] || []) {
    if (f.t >= before) break;
    const m = DB.players.m[f.i]; if (!m) continue;
    const side = f.h === tid ? 0 : 1;
    for (const l of m) if (l[1] === side) out.push({ pid: l[0], f, l, side });
  }
  return out;
}
export function playerTotals(lines) {
  const by = {};
  for (const { pid, f, l, side } of lines) {
    const p = by[pid] ||= { pid, name: DB.players.names[pid]?.[0] || '#' + pid, pos: DB.players.names[pid]?.[1], apps: 0, min: 0, g: 0, a: 0, yc: 0, rc: 0, sh: 0, sot: 0, rt: [], cs: 0, last: 0 };
    p.apps++; p.min += l[2]; p.g += l[3]; p.a += l[4]; p.yc += l[5]; p.rc += l[6]; p.sh += l[7]; p.sot += l[8];
    if (l[9]) p.rt.push(l[9]);
    const conceded = f.g[1 - side];
    if (conceded === 0 && l[2] >= 60) p.cs++;
    p.last = Math.max(p.last, f.t);
  }
  for (const p of Object.values(by)) p.rating = p.rt.length ? p.rt.reduce((a, b) => a + b, 0) / p.rt.length : null;
  return Object.values(by);
}
export function injuredFor(f, tid) {
  return DB.injuries.filter(r => r[3] === f.i && r[2] === tid);
}
// ბოლო ცნობილი დაზიანებები გუნდზე არჩეულ თარიღამდე/შემდეგ უახლოეს მატჩზე
export function injuriesNear(tid, before) {
  const next = (DB.byTeam[tid] || []).find(f => f.t >= before);
  if (next) { const r = injuredFor(next, tid); if (r.length) return { f: next, list: r }; }
  const prev = (DB.byTeam[tid] || []).filter(f => f.t < before).slice(-1)[0];
  return prev ? { f: prev, list: injuredFor(prev, tid) } : { f: null, list: [] };
}

export function scorerProbs(pr, tid, side) {
  const before = pr.f.t;
  const lines = playerLines(tid, before);
  const teamRowsAll = side === 0 ? pr.hAll : pr.aAll;
  const teamGoals = teamRowsAll.reduce((s, r) => s + r.gf, 0) || 1;
  const recent = teamRowsAll.slice(-3).map(r => r.f.i);
  const inj = new Set(injuredFor(pr.f, tid).map(r => r[0]));
  const tot = playerTotals(lines).filter(p => p.apps >= 2 && !inj.has(p.pid));
  const lam = side === 0 ? pr.lh : pr.la;
  const out = [];
  for (const p of tot) {
    const played = lines.filter(x => x.pid === p.pid && recent.includes(x.f.i)).length;
    if (!played) continue;
    const mpg = p.min / p.apps;
    const share = (p.g + 1 * 0.2) / (teamGoals + 2); // მცირე შეკუმშვა
    const per90 = p.sot / Math.max(90, p.min) * 90;
    const pg = 1 - Math.exp(-lam * share * Math.min(1, mpg / 90) * 1.05);
    const pyc = 1 - Math.exp(-(p.yc / Math.max(90, p.min) * 90) * Math.min(1, mpg / 90));
    const psot = 1 - Math.exp(-per90 * Math.min(1, mpg / 90));
    const pa = 1 - Math.exp(-(p.a / Math.max(90, p.min) * 90) * Math.min(1, mpg / 90));
    out.push({ ...p, pg, pyc, psot, pa, mpg });
  }
  return out;
}
