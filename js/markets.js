// ===================== ფსონების კატალოგი + AI ფსონები (შაბლონური ტექსტით) =====================
import { CALIB } from './calib.js?v=202611261408';
import { DB, S, scorerProbs } from './engine.js?v=202611261408';

const fmt1 = x => x == null ? '—' : (Math.round(x * 10) / 10).toString();
export const tn = id => DB.teams[id]?.name || '#' + id;

// item: {label, p, fam, dir, line, ev:{pred, phrase, who}, note}
export function buildMarkets(pr) {
  const f = pr.f, H = tn(f.h), A = tn(f.a);
  const o = (arr, l) => pr.over(arr, l), u = (arr, l) => 1 - pr.over(arr, l);
  const R = [], ST = [], OT = [];
  const g = (list, title, items) => list.push({ title, items: items.filter(Boolean) });
  const tot = r => r.gf + r.ga;

  // ---------------- შედეგი
  g(R, 'მატჩის შედეგი (1X2)', [
    { label: `1 · ${H}`, p: pr.p1, fam: '1x2', ev: { pred: r => r.res === 'W', who: 'h', phrase: 'მოიგო' }, ev2: { pred: r => r.res === 'L', who: 'a', phrase: 'წააგო' } },
    { label: 'X · ფრე', p: pr.px, fam: '1x2', ev: { pred: r => r.res === 'D', who: 'both', phrase: 'ფრე იყო' } },
    { label: `2 · ${A}`, p: pr.p2, fam: '1x2', ev: { pred: r => r.res === 'L', who: 'h', phrase: 'წააგო' }, ev2: { pred: r => r.res === 'W', who: 'a', phrase: 'მოიგო' } },
  ]);
  g(R, 'ორმაგი შანსი', [
    { label: `1X · ${H} ან ფრე`, p: pr.p1 + pr.px, fam: 'dc', ev: { pred: r => r.res !== 'L', who: 'h', phrase: 'არ წააგო' }, ev2: { pred: r => r.res !== 'W', who: 'a', phrase: 'ვერ მოიგო' } },
    { label: `X2 · ${A} ან ფრე`, p: pr.px + pr.p2, fam: 'dc', ev: { pred: r => r.res !== 'W', who: 'h', phrase: 'ვერ მოიგო' }, ev2: { pred: r => r.res !== 'L', who: 'a', phrase: 'არ წააგო' } },
    { label: '12 · ფრე არ იქნება', p: pr.p1 + pr.p2, fam: 'dc', ev: { pred: r => r.res !== 'D', who: 'both', phrase: 'გამარჯვებული გამოვლინდა' } },
  ]);
  g(R, 'ფრეს გარეშე (DNB)', [
    { label: H, p: pr.p1 / (pr.p1 + pr.p2), fam: 'dnb' }, { label: A, p: pr.p2 / (pr.p1 + pr.p2), fam: 'dnb' },
  ]);
  const goalLines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
  g(R, `გოლები სულ (მოსალოდნელი ${fmt1(pr.lh + pr.la)})`, goalLines.flatMap(l => [
    { label: `მეტი ${l}`, p: o(pr.tot, l), fam: 'goals', dir: 'o', line: l, ev: { pred: r => tot(r) > l, who: 'both', phrase: `${l}-ზე მეტი გოლი იყო` } },
    { label: `ნაკლები ${l}`, p: u(pr.tot, l), fam: 'goals', dir: 'u', line: l, ev: { pred: r => tot(r) < l, who: 'both', phrase: `${l}-ზე ნაკლები გოლი იყო` } },
  ]));
  g(R, `${H} — გოლები (მოსალოდნელი ${fmt1(pr.lh)})`, [0.5, 1.5, 2.5].flatMap(l => [
    { label: `მეტი ${l}`, p: o(pr.hF, l), fam: 'hgoals', dir: 'o', line: l, ev: { pred: r => r.gf > l, who: 'h', phrase: `${l}-ზე მეტი გაიტანა` }, ev2: { pred: r => r.ga > l, who: 'a', phrase: `${l}-ზე მეტი გაუშვა` } },
    { label: `ნაკლები ${l}`, p: u(pr.hF, l), fam: 'hgoals', dir: 'u', line: l },
  ]));
  g(R, `${A} — გოლები (მოსალოდნელი ${fmt1(pr.la)})`, [0.5, 1.5, 2.5].flatMap(l => [
    { label: `მეტი ${l}`, p: o(pr.aF, l), fam: 'agoals', dir: 'o', line: l, ev: { pred: r => r.ga > l, who: 'h', phrase: `${l}-ზე მეტი გაუშვა` }, ev2: { pred: r => r.gf > l, who: 'a', phrase: `${l}-ზე მეტი გაიტანა` } },
    { label: `ნაკლები ${l}`, p: u(pr.aF, l), fam: 'agoals', dir: 'u', line: l },
  ]));
  const btts = (1 - pr.hF[0]) * (1 - pr.aF[0]);
  g(R, 'ორივე გაიტანს (BTTS)', [
    { label: 'კი', p: btts, fam: 'btts', ev: { pred: r => r.gf > 0 && r.ga > 0, who: 'both', phrase: 'ორივემ გაიტანა' } },
    { label: 'არა', p: 1 - btts, fam: 'btts', ev: { pred: r => !(r.gf > 0 && r.ga > 0), who: 'both', phrase: 'ერთ-ერთმა მაინც ვერ გაიტანა' } },
    { label: 'კი + მეტი 2.5', p: pr.P((i, j) => i > 0 && j > 0 && i + j > 2), fam: 'bttso' },
  ]);
  g(R, 'ზუსტი ანგარიში (ყველაზე სავარაუდო)', pr.scores.slice(0, 8).map(([s, p]) => ({ label: s, p, fam: 'cs' })));
  g(R, 'გოლების ზუსტი რაოდენობა', [0, 1, 2, 3, 4].map(k => ({ label: k === 4 ? '4+' : String(k), p: k === 4 ? o(pr.tot, 3.5) : pr.tot[k], fam: 'exg' })));
  g(R, '1-ლი ტაიმის შედეგი', [
    { label: `1 · ${H}`, p: pr.ht1, fam: 'ht' }, { label: 'X · ფრე', p: pr.htx, fam: 'ht', ev: { pred: r => r.htf != null && r.htf === r.hta, who: 'both', phrase: 'პირველი ტაიმი ფრედ დასრულდა' } }, { label: `2 · ${A}`, p: pr.ht2, fam: 'ht' },
  ]);
  const t1 = pr.t1, t2 = pr.t2;
  g(R, '1-ლი ტაიმის გოლები', [0.5, 1.5, 2.5].flatMap(l => [
    { label: `მეტი ${l}`, p: o(t1, l), fam: 'htg', dir: 'o', line: l, ev: { pred: r => r.htf != null && r.htf + r.hta > l, who: 'both', phrase: `1-ელ ტაიმში ${l}-ზე მეტი გოლი იყო` } },
    { label: `ნაკლები ${l}`, p: u(t1, l), fam: 'htg', dir: 'u', line: l, ev: { pred: r => r.htf != null && r.htf + r.hta < l, who: 'both', phrase: `1-ელ ტაიმში ${l}-ზე ნაკლები გოლი იყო` } },
  ]));
  g(R, 'მე-2 ტაიმის გოლები', [0.5, 1.5, 2.5].flatMap(l => [
    { label: `მეტი ${l}`, p: o(t2, l), fam: 'h2g', dir: 'o', line: l, ev: { pred: r => r.h2f != null && r.h2f + r.h2a > l, who: 'both', phrase: `მე-2 ტაიმში ${l}-ზე მეტი გოლი იყო` } },
    { label: `ნაკლები ${l}`, p: u(t2, l), fam: 'h2g', dir: 'u', line: l },
  ]));
  g(R, 'მე-2 ტაიმის შედეგი', [{ label: `1 · ${H}`, p: pr.sh1, fam: 'h2r' }, { label: 'X', p: pr.shx, fam: 'h2r' }, { label: `2 · ${A}`, p: pr.sh2, fam: 'h2r' }]);
  g(R, 'ტაიმი / მატჩი', Object.entries(pr.htft).sort((a, b) => b[1] - a[1]).map(([k, p]) => ({ label: k, p, fam: 'htft' })));
  g(R, 'უფრო გოლიანი ტაიმი', [{ label: '1-ლი', p: pr.moreH1, fam: 'hh' }, { label: 'თანაბარი', p: pr.eqH, fam: 'hh' }, { label: 'მე-2', p: pr.moreH2, fam: 'hh' }]);
  g(R, 'ფორა (აზიური)', [
    { label: `${H} −1.5`, p: pr.P((i, j) => i - j >= 2), fam: 'ah' }, { label: `${A} +1.5`, p: pr.P((i, j) => i - j < 2), fam: 'ah' },
    { label: `${A} −1.5`, p: pr.P((i, j) => j - i >= 2), fam: 'ah' }, { label: `${H} +1.5`, p: pr.P((i, j) => j - i < 2), fam: 'ah' },
    { label: `${H} −2.5`, p: pr.P((i, j) => i - j >= 3), fam: 'ah' }, { label: `${A} −2.5`, p: pr.P((i, j) => j - i >= 3), fam: 'ah' },
  ]);
  g(R, 'გამარჯვება მშრალად', [
    { label: H, p: pr.P((i, j) => i > j && j === 0), fam: 'wtn' }, { label: A, p: pr.P((i, j) => j > i && i === 0), fam: 'wtn' },
  ]);
  g(R, 'მშრალი მატჩი (clean sheet)', [
    { label: H, p: pr.aF[0], fam: 'cs1', ev: { pred: r => r.ga === 0, who: 'h', phrase: 'მშრალად ითამაშა' } },
    { label: A, p: pr.hF[0], fam: 'cs1', ev: { pred: r => r.ga === 0, who: 'a', phrase: 'მშრალად ითამაშა' } },
  ]);
  g(R, 'პირველი გოლი', (() => { const n = 1 - pr.tot[0], s = pr.lh / (pr.lh + pr.la); return [
    { label: H, p: n * s, fam: 'fg', ev: { pred: r => r.first === 'us', who: 'h', phrase: 'პირველმა გაიტანა' } },
    { label: A, p: n * (1 - s), fam: 'fg', ev: { pred: r => r.first === 'us', who: 'a', phrase: 'პირველმა გაიტანა' } },
    { label: 'გოლი არ იქნება', p: pr.tot[0], fam: 'fg' }]; })());
  g(R, 'კენტი / ლუწი', [{ label: 'კენტი', p: pr.tot.reduce((s, p, k) => s + (k % 2 ? p : 0), 0), fam: 'oe' }, { label: 'ლუწი', p: pr.tot.reduce((s, p, k) => s + (k % 2 ? 0 : p), 0), fam: 'oe' }]);

  // ---------------- სტატისტიკა
  const ss = (r, i) => r.st && r.so ? (r.st[i] || 0) + (r.so[i] || 0) : null;
  const own = (r, i) => r.st ? r.st[i] : null, opp = (r, i) => r.so ? r.so[i] : null;
  g(ST, `კუთხურები სულ (მოსალოდნელი ${fmt1(pr.ch + pr.ca)})`, [7.5, 8.5, 9.5, 10.5, 11.5, 12.5].flatMap(l => [
    { label: `მეტი ${l}`, p: o(pr.corT, l), fam: 'cor', dir: 'o', line: l, ev: { pred: r => ss(r, S.COR) != null && ss(r, S.COR) > l, who: 'both', phrase: `${l}-ზე მეტი კუთხური იყო` } },
    { label: `ნაკლები ${l}`, p: u(pr.corT, l), fam: 'cor', dir: 'u', line: l, ev: { pred: r => ss(r, S.COR) != null && ss(r, S.COR) < l, who: 'both', phrase: `${l}-ზე ნაკლები კუთხური იყო` } },
  ]));
  g(ST, `${H} — კუთხურები (მოსალოდნელი ${fmt1(pr.ch)})`, [2.5, 3.5, 4.5, 5.5, 6.5, 7.5].flatMap(l => [
    { label: `მეტი ${l}`, p: o(pr.corH, l), fam: 'hcor', dir: 'o', line: l, ev: { pred: r => own(r, S.COR) != null && own(r, S.COR) > l, who: 'h', phrase: `${l}-ზე მეტი კუთხური აიღო` }, ev2: { pred: r => opp(r, S.COR) != null && opp(r, S.COR) > l, who: 'a', phrase: `მეტოქეს ${l}-ზე მეტი კუთხური მისცა` } },
    { label: `ნაკლები ${l}`, p: u(pr.corH, l), fam: 'hcor', dir: 'u', line: l },
  ]));
  g(ST, `${A} — კუთხურები (მოსალოდნელი ${fmt1(pr.ca)})`, [2.5, 3.5, 4.5, 5.5, 6.5].flatMap(l => [
    { label: `მეტი ${l}`, p: o(pr.corA, l), fam: 'acor', dir: 'o', line: l, ev: { pred: r => own(r, S.COR) != null && own(r, S.COR) > l, who: 'a', phrase: `${l}-ზე მეტი კუთხური აიღო` } },
    { label: `ნაკლები ${l}`, p: u(pr.corA, l), fam: 'acor', dir: 'u', line: l },
  ]));
  const [c1, cx, c2] = (() => { let h = 0, d = 0, w = 0; pr.corH.forEach((x, i) => pr.corA.forEach((y, j) => { if (i > j) h += x * y; else if (i === j) d += x * y; else w += x * y; })); return [h, d, w]; })();
  g(ST, 'მეტი კუთხური (1X2)', [{ label: H, p: c1, fam: 'cor1x2' }, { label: 'თანაბარი', p: cx, fam: 'cor1x2' }, { label: A, p: c2, fam: 'cor1x2' }]);
  const refTxt = pr.ref && pr.ref.n ? ` · მსაჯი ${pr.ref.name}: ${fmt1(pr.ref.yc)} ყვითელი/მატჩი` : '';
  g(ST, `ყვითელი ბარათები სულ (მოსალოდნელი ${fmt1(pr.yh + pr.ya)}${refTxt})`, [2.5, 3.5, 4.5, 5.5, 6.5].flatMap(l => [
    { label: `მეტი ${l}`, p: o(pr.ycT, l), fam: 'yc', dir: 'o', line: l, ev: { pred: r => ss(r, S.YC) != null && ss(r, S.YC) > l, who: 'both', phrase: `${l}-ზე მეტი ყვითელი იყო` } },
    { label: `ნაკლები ${l}`, p: u(pr.ycT, l), fam: 'yc', dir: 'u', line: l, ev: { pred: r => ss(r, S.YC) != null && ss(r, S.YC) < l, who: 'both', phrase: `${l}-ზე ნაკლები ყვითელი იყო` } },
  ]));
  g(ST, 'გუნდის ყვითელი ბარათები', [0.5, 1.5, 2.5].flatMap(l => [
    { label: `${H} მეტი ${l}`, p: o(pr.ycH, l), fam: 'hyc', dir: 'o', line: l, ev: { pred: r => own(r, S.YC) != null && own(r, S.YC) > l, who: 'h', phrase: `${l}-ზე მეტი ყვითელი მიიღო` } },
    { label: `${A} მეტი ${l}`, p: o(pr.ycA, l), fam: 'ayc', dir: 'o', line: l, ev: { pred: r => own(r, S.YC) != null && own(r, S.YC) > l, who: 'a', phrase: `${l}-ზე მეტი ყვითელი მიიღო` } },
  ]));
  g(ST, 'წითელი ბარათი მატჩში', [{ label: 'კი', p: pr.rcRate, fam: 'rc' }, { label: 'არა', p: 1 - pr.rcRate, fam: 'rc' }]);
  g(ST, `ჯარიმები (ფოლები) სულ (მოსალოდნელი ${fmt1(pr.fh + pr.fa)})`, [18.5, 20.5, 22.5, 24.5, 26.5, 28.5].flatMap(l => [
    { label: `მეტი ${l}`, p: o(pr.flT, l), fam: 'foul', dir: 'o', line: l, ev: { pred: r => ss(r, S.FOUL) != null && ss(r, S.FOUL) > l, who: 'both', phrase: `${l}-ზე მეტი ჯარიმა იყო` } },
    { label: `ნაკლები ${l}`, p: u(pr.flT, l), fam: 'foul', dir: 'u', line: l },
  ]));
  g(ST, `ოფსაიდები სულ (მოსალოდნელი ${fmt1(pr.oh + pr.oa)})`, [1.5, 2.5, 3.5, 4.5, 5.5].flatMap(l => [
    { label: `მეტი ${l}`, p: o(pr.ofT, l), fam: 'off', dir: 'o', line: l, ev: { pred: r => ss(r, S.OFF) != null && ss(r, S.OFF) > l, who: 'both', phrase: `${l}-ზე მეტი ოფსაიდი იყო` } },
    { label: `ნაკლები ${l}`, p: u(pr.ofT, l), fam: 'off', dir: 'u', line: l },
  ]));
  g(ST, `კარში დარტყმები სულ (მოსალოდნელი ${fmt1(pr.sth + pr.sta)})`, [6.5, 7.5, 8.5, 9.5, 10.5].flatMap(l => [
    { label: `მეტი ${l}`, p: o(pr.sotT, l), fam: 'sot', dir: 'o', line: l, ev: { pred: r => ss(r, S.SOT) != null && ss(r, S.SOT) > l, who: 'both', phrase: `კარში ${l}-ზე მეტი დარტყმა იყო` } },
    { label: `ნაკლები ${l}`, p: u(pr.sotT, l), fam: 'sot', dir: 'u', line: l },
  ]));
  g(ST, 'გუნდის კარში დარტყმები', [2.5, 3.5, 4.5, 5.5].flatMap(l => [
    { label: `${H} მეტი ${l}`, p: o(pr.sotH, l), fam: 'hsot', dir: 'o', line: l, ev: { pred: r => own(r, S.SOT) != null && own(r, S.SOT) > l, who: 'h', phrase: `კარში ${l}-ზე მეტი დარტყმა შეასრულა` } },
    { label: `${A} მეტი ${l}`, p: o(pr.sotA, l), fam: 'asot', dir: 'o', line: l, ev: { pred: r => own(r, S.SOT) != null && own(r, S.SOT) > l, who: 'a', phrase: `კარში ${l}-ზე მეტი დარტყმა შეასრულა` } },
  ]));
  g(ST, `დარტყმები სულ (მოსალოდნელი ${fmt1(pr.shh + pr.sha)})`, [19.5, 21.5, 23.5, 25.5, 27.5].flatMap(l => [
    { label: `მეტი ${l}`, p: o(pr.shT, l), fam: 'shots', dir: 'o', line: l }, { label: `ნაკლები ${l}`, p: u(pr.shT, l), fam: 'shots', dir: 'u', line: l },
  ]));
  g(ST, `ბურთის ფლობა (მოსალოდნელი ${Math.round(pr.possH)}% – ${Math.round(100 - pr.possH)}%)`, [
    { label: `${H} 50%+`, p: 1 / (1 + Math.exp(-(pr.possH - 50) / 4.5)), fam: 'poss' }, { label: `${A} 50%+`, p: 1 - 1 / (1 + Math.exp(-(pr.possH - 50) / 4.5)), fam: 'poss' },
  ]);
  ST.push({ title: 'აუტები და ჩაწოდებები', items: [], note: 'ეს სტატები API-Football-ში არ არის, ამიტომ პროგნოზი ვერ ითვლება.' });

  for (const gr of ST) for (const it of gr.items) { if (it.ev) it.ev.st = 1; if (it.ev2) it.ev2.st = 1; }

  // ---------------- სხვა (მოთამაშეები)
  const hs = scorerProbs(pr, f.h, 0), as = scorerProbs(pr, f.a, 1);
  const top = (arr, key, n) => arr.filter(p => p[key] > 0.02).sort((a, b) => b[key] - a[key]).slice(0, n);
  g(OT, 'გაიტანს მატჩში (ნებისმიერ დროს)', [...top(hs, 'pg', 5).map(p => ({ label: `${p.name} (${H})`, p: p.pg, fam: 'ps', pl: p })), ...top(as, 'pg', 5).map(p => ({ label: `${p.name} (${A})`, p: p.pg, fam: 'ps', pl: p }))].sort((a, b) => b.p - a.p));
  g(OT, 'გააკეთებს ასისტს', [...top(hs, 'pa', 4), ...top(as, 'pa', 4)].sort((a, b) => b.pa - a.pa).map(p => ({ label: p.name, p: p.pa, fam: 'pa', pl: p })));
  g(OT, 'კარში დარტყმა 1+', [...top(hs, 'psot', 5), ...top(as, 'psot', 5)].sort((a, b) => b.psot - a.psot).map(p => ({ label: p.name, p: p.psot, fam: 'psot', pl: p })));
  g(OT, 'მიიღებს ყვითელს', [...top(hs, 'pyc', 4), ...top(as, 'pyc', 4)].sort((a, b) => b.pyc - a.pyc).map(p => ({ label: p.name, p: p.pyc, fam: 'pyc', pl: p })));
  for (const gr of [...R, ...ST, ...OT]) for (const it of gr.items) {
    it.raw = it.p; it.p = calibrate(it.fam, it.p);
    // მოდელი + ბუკმეკერი: საბოლოო = 65% მოდელი + 35% ბუკმეკერი (მარჟის გარეშე). მოდელის საკუთარი შეფასება ინახება it.pm-ში
    const o = oddsFor(pr.f, it);
    if (o && o.odd && o.fair) { it.pm = it.p; it.pb = Math.min(0.99, o.fair); it.p = BLEND_W * it.pm + (1 - BLEND_W) * it.pb; }
  }
  return { R, ST, OT, hs, as };
}

// -------------------------------------------------- დაკალიბრება (2025-2026 სეზონის 2,400 მატჩით შემოწმებული)
// 1) მოთამაშეების ბაზრები: isotonic ცხრილი (მოდელი აქ ზედმეტად თავდაჯერებული იყო, მაგ. „კარში დარტყმა 1+“ 70%+ → რეალურად 60%)
// 2) 85%-ზე მაღალი ალბათობები ოდნავ იკუმშება (90–95% რეალურად ~87%-ით მართლდებოდა)
// 3) 1X2 და BTTS ცენტრისკენ იკუმშება (76% → რეალურად ~67%)
export const BLEND_W = 0.65;
const PLAYER_FAMS = new Set(['ps', 'pa', 'psot', 'pyc']);
export function calibrate(fam, p) {
  if (PLAYER_FAMS.has(fam) && CALIB.groups.players) {
    const t = CALIB.groups.players, x = Math.max(0, Math.min(1, p)) / CALIB.grid_step;
    const i = Math.floor(x), fr = x - i;
    p = i >= t.length - 1 ? t[t.length - 1] : t[i] * (1 - fr) + t[i + 1] * fr;
  }
  if (fam === '1x2' || fam === 'btts') p = 0.5 + (p - 0.5) * 0.8;
  if (p > 0.85) p = 0.85 + (p - 0.85) * 0.5;
  return Math.max(0.001, Math.min(0.999, p));
}

// -------------------------------------------------- ბუკმეკერის კოეფიციენტები
// აბრუნებს: undefined — ამ მატჩზე/ბაზარზე მონაცემი არ არის; {absent:true} — ბუკმეკერი ამ ხაზს არ სთავაზობს (ზედმეტად აშკარაა);
// {odd, book} — კოეფიციენტი
function oddsRaw(f, it) {
  const rec = DB.odds?.[f.i]; if (!rec) return undefined;
  const [book, M] = rec, H = tn(f.h), L = it.label;
  // fair: ბუკმეკერის ალბათობა მარჟის გარეშე (წყვილის/სამეულის ნორმალიზაციით)
  const ou = (bet, prefix = '') => {
    const b = M[bet]; if (!b) return undefined;
    const k = `${it.dir === 'o' ? 'Over' : 'Under'} ${it.line}`, k2 = `${it.dir === 'o' ? 'Under' : 'Over'} ${it.line}`;
    if (b[k] == null) return { absent: true };
    const fair = b[k2] ? (1 / b[k]) / (1 / b[k] + 1 / b[k2]) : (1 / b[k]) / 1.07;
    return { odd: b[k], book, fair };
  };
  const pick = (bet, key) => {
    const b = M[bet]; if (!b) return undefined; if (b[key] == null) return { absent: true };
    const vals = Object.values(b), inv = vals.reduce((s, o) => s + 1 / o, 0);
    let fair;
    if (bet === 'Double Chance') fair = (1 / b[key]) / (inv / 2);
    else if (vals.length >= 2 && vals.length <= 3) fair = (1 / b[key]) / inv;
    else fair = (1 / b[key]) / 1.08;
    return { odd: b[key], book, fair };
  };
  const side = L.startsWith(H) ? 'Home' : 'Away';
  switch (it.fam) {
    case '1x2': return pick('Match Winner', { '1': 'Home', 'X': 'Draw', '2': 'Away' }[L[0]]);
    case 'dc': return pick('Double Chance', { '1X': 'Home/Draw', 'X2': 'Draw/Away', '12': 'Home/Away' }[L.slice(0, 2)]);
    case 'dnb': return pick('Draw No Bet', side);
    case 'goals': return ou('Goals Over/Under');
    case 'hgoals': return ou('Total - Home');
    case 'agoals': return ou('Total - Away');
    case 'btts': return pick('Both Teams Score', L === 'კი' ? 'Yes' : 'No');
    case 'htg': return ou('Goals Over/Under First Half');
    case 'h2g': return ou('Goals Over/Under - Second Half');
    case 'ht': return pick('First Half Winner', { '1': 'Home', 'X': 'Draw', '2': 'Away' }[L[0]]);
    case 'cor': return ou('Corners Over Under');
    case 'hcor': return ou('Home Corners Over/Under');
    case 'acor': return ou('Away Corners Over/Under');
    case 'yc': return ou('Cards Over/Under');
    case 'sot': return ou('Total ShotOnGoal');
    case 'foul': return ou('Fouls. Over/Under');
    case 'off': return ou('Offsides Over/Under');
    case 'cs1': return pick(`Clean Sheet - ${side}`, 'Yes');
    case 'wtn': return pick(`Win to Nil - ${side}`, 'Yes');
    case 'oe': return pick('Odd/Even', L === 'კენტი' ? 'Odd' : 'Even');
    case 'cs': return pick('Exact Score', L);
    case 'htft': { const m = { '1': 'Home', 'X': 'Draw', '2': 'Away' }; const [a, b] = L.split('/'); return pick('HT/FT Double', `${m[a]}/${m[b]}`); }
    case 'ah': { const m = L.match(/([−+])(\d\.5)$/); if (!m) return undefined; return pick('Asian Handicap', `${side} ${m[1] === '−' ? '-' : '+'}${m[2]}`); }
    case 'ps': {
      const b = M['Anytime Goal Scorer']; if (!b || !it.pl) return undefined;
      const last = it.pl.name.split(' ').pop().toLowerCase();
      const k = Object.keys(b).find(x => x.toLowerCase().split(' ').pop() === last);
      return k ? { odd: b[k], book, fair: (1 / b[k]) / 1.15 } : undefined;
    }
  }
  return undefined;
}

// Crystalbet-ის კოეფიციენტის შეფასება Bet365-იდან.
// 26.11.2026: 90 მატჩი (9 ტურნირი), 900 შედარება; საშ. ცდომილება ~3.2%.
// ძირითად ბაზრებს თავისი კოეფიციენტი აქვს, დანარჩენს — ზოგადი ფორმულა (სპეციალურ ბაზრებზე დამატებით −5%).
const CB_K = { '1': 0.0695, 'X': 0.1372, '2': 0.0888, '1X': -0.0029, '12': 0.0042, 'X2': -0.0211,
  over: 0.0328, under: 0.0545, yes: 0.0474, no: 0.0672 }, CB_SLOPE = -0.1365;
const MAIN_FAMS = new Set(['1x2', 'dc', 'dnb', 'goals', 'btts', 'ht', 'htg', 'h2g']);
export const BOOK = { mode: 'cb' };
try { BOOK.mode = localStorage.getItem('ss_book') || 'cb'; } catch (e) { }
function cbKey(it) {
  if (!it) return null;
  if (it.fam === '1x2') return it.label[0];
  if (it.fam === 'dc') return it.label.slice(0, 2);
  if (it.fam === 'goals') return it.dir === 'o' ? 'over' : 'under';
  if (it.fam === 'btts') return it.label === 'კი' ? 'yes' : 'no';
  return null;
}
export function cbOdd(odd, fam, it) {
  const k = cbKey(it || { fam });
  let r;
  if (k && CB_K[k] != null) r = Math.exp(CB_K[k] + CB_SLOPE * Math.log(odd));
  else { r = Math.exp(0.0082 - 0.0834 * Math.log(odd)); if (!MAIN_FAMS.has(fam)) r *= 0.95; }
  return Math.max(1.01, Math.min(odd, Math.round(odd * r * 100) / 100));
}
export function oddsFor(f, it) {
  const o = oddsRaw(f, it);
  if (!o || !o.odd || BOOK.mode !== 'cb') return o;
  return { ...o, raw: o.odd, rawBook: o.book, odd: cbOdd(o.odd, it.fam, it), book: `Crystalbet ≈ (${o.book} ${o.odd.toFixed(2)})` };
}

// -------------------------------------------------- AI ფსონები
const NO_PICK = new Set(['cs', 'exg', 'htft', 'hh', 'oe', 'bttso', 'poss', 'h2r', 'ht', 'fg', 'rc', 'dnb', 'ah', 'cs1', 'wtn']); // ah/cs1/wtn: 2025-26-ზე 40–50%-ით მართლდებოდა
export function aiPicks(mk, min = 0.7, max = 8, f = null) {
  const all = [...mk.R, ...mk.ST, ...mk.OT].flatMap(gr => gr.items.map(it => ({ ...it, group: gr.title })));
  const best = {};
  const minOdd = DB.cfg?.min_odds || 1.02;
  for (const it of all) {
    if (it.p < min || NO_PICK.has(it.fam) || it.p > 0.98) continue;
    if (f) {
      const o = oddsFor(f, it);
      if (o && o.absent) continue;                 // ბუკმეკერი ამ ხაზს არც კი სთავაზობს
      if (o && o.odd < minOdd) continue;           // კოეფიციენტი ზედმეტად დაბალია
      if (o && (it.pm ?? it.p) * o.odd > 1.8) continue; // მოდელი ბუკმეკერს 80%-ზე მეტად ეწინააღმდეგება — სავარაუდოდ მოდელის შეცდომა
      if (o) { it.odd = o.odd; it.book = o.book; it.value = (it.pm ?? it.p) * o.odd - 1; }
      // კოეფიციენტი უცნობია: სამართლიანი კოეფიციენტი = 1 / ალბათობა; თუ ის ზღვარზე დაბალია — ფსონი ზედმეტად აშკარაა
      else if (1 / it.p < minOdd) continue;
      else it.est = 1 / it.p;
    }
    if (it.fam === 'ah' && it.label.includes('+')) continue; // „+1.5“ ფორა ორმაგ შანსს იმეორებს
    const k = it.fam + (it.dir || '') + (it.fam === 'ps' || it.fam === 'psot' || it.fam === 'pyc' ? it.label : '');
    const b = best[k];
    if (!b) { best[k] = it; continue; }
    if (it.dir === 'o' ? it.line > b.line : it.dir === 'u' ? it.line < b.line : it.p > b.p) best[k] = it;
  }
  let picks = Object.values(best);
  // 1X2 ძლიერია → ორმაგ შანსს აღარ ვაჩვენებთ
  if (picks.some(p => p.fam === '1x2')) picks = picks.filter(p => p.fam !== 'dc' && p.fam !== 'dnb');
  else if (picks.some(p => p.fam === 'dc')) picks = picks.filter(p => p.fam !== 'dnb');
  return picks.sort((a, b) => b.p - a.p).slice(0, max);
}

// ტექსტი: რატომ — ბოლო მატჩების მტკიცებულება
export function explain(pr, it) {
  const H = tn(pr.f.h), A = tn(pr.f.a);
  const parts = [];
  const one = (ev) => {
    if (!ev) return;
    const side = (rows, name, where) => {
      const last = rows.filter(r => !ev.st || (r.st && r.so)).slice(-10);
      if (last.length < 3) return;
      const k = last.filter(ev.pred).length;
      parts.push(`${name}-ის ბოლო ${last.length} ${where} ${k}-ში ${ev.phrase}`);
    };
    if (ev.who === 'h' || ev.who === 'both') side(pr.hH.length >= 4 ? pr.hH : pr.hAll, H, pr.hH.length >= 4 ? 'საშინაო მატჩიდან' : 'მატჩიდან');
    if (ev.who === 'a' || ev.who === 'both') side(pr.aA.length >= 4 ? pr.aA : pr.aAll, A, pr.aA.length >= 4 ? 'გასვლიდან' : 'მატჩიდან');
  };
  one(it.ev); one(it.ev2);
  let s = parts.length ? parts.join('; ') + '.' : '';
  if (it.pl) s = `${it.pl.name}-ს ამ სეზონში ${it.pl.g} გოლი აქვს ${it.pl.apps} მატჩში (საშუალოდ ${Math.round(it.pl.mpg)} წუთი).`;
  const exp = { goals: `მოსალოდნელი გოლები: ${fmt1(pr.lh)} – ${fmt1(pr.la)}.`, cor: `მოსალოდნელი კუთხურები: ${fmt1(pr.ch)} – ${fmt1(pr.ca)}.`,
    yc: `მოსალოდნელი ყვითლები: ${fmt1(pr.yh + pr.ya)}${pr.ref?.n ? ` (მსაჯი ${pr.ref.name} საშუალოდ ${fmt1(pr.ref.yc)}-ს აჩვენებს)` : ''}.`,
    foul: `მოსალოდნელი ჯარიმები: ${fmt1(pr.fh + pr.fa)}${pr.ref?.n ? ` (მსაჯის საშუალო ${fmt1(pr.ref.foul)})` : ''}.` }[it.fam];
  return (s + (exp ? ' ' + exp : '')).trim() || 'მოდელის შეფასება ორივე გუნდის სეზონის მაჩვენებლებზეა დაფუძნებული.';
}

// -------------------------------------------------- შედეგის შემოწმება (დასრულებულ მატჩზე)
export function checkItem(f, it) {
  if (!f || f.g[0] == null || !['FT', 'AET', 'PEN'].includes(f.s)) return null;
  const H = tn(f.h), A = tn(f.a);
  // 90 წუთის შედეგი: AET/PEN-ზე ძირითადი დრო ფრე იყო
  const g = (f.s === 'AET' || f.s === 'PEN') ? [Math.min(f.g[0], f.g[1]), Math.min(f.g[0], f.g[1])] : f.g;
  const tot = g[0] + g[1], st = f.st;
  const L = it.label, cmp = (v) => v == null ? null : it.dir === 'o' ? v > it.line : v < it.line;
  const sv = (i, side) => !st ? null : side == null ? (st[0][i] || 0) + (st[1][i] || 0) : (st[side][i] || 0);
  const res = g[0] > g[1] ? '1' : g[0] < g[1] ? '2' : 'X';
  switch (it.fam) {
    case '1x2': return L.startsWith(res + ' ');
    case 'dc': return L.slice(0, 2).includes(res);
    case 'dnb': return res === 'X' ? null : (L === H) === (res === '1');
    case 'goals': return cmp(tot);
    case 'hgoals': return cmp(g[0]);
    case 'agoals': return cmp(g[1]);
    case 'btts': return L === 'კი' ? g[0] > 0 && g[1] > 0 : !(g[0] > 0 && g[1] > 0);
    case 'htg': return f.ht[0] == null ? null : cmp(f.ht[0] + f.ht[1]);
    case 'h2g': return f.ht[0] == null ? null : cmp(tot - f.ht[0] - f.ht[1]);
    case 'cs1': return L === H ? g[1] === 0 : g[0] === 0;
    case 'wtn': return L === H ? g[0] > g[1] && g[1] === 0 : g[1] > g[0] && g[0] === 0;
    case 'ah': { const m = L.match(/([−+])(\d\.5)$/); if (!m) return null; const hcp = (m[1] === '−' ? -1 : 1) * parseFloat(m[2]); const home = L.startsWith(H);
      const d = home ? g[0] - g[1] : g[1] - g[0]; return d + hcp > 0; }
    case 'cor': return cmp(sv(7));
    case 'hcor': return cmp(sv(7, 0));
    case 'acor': return cmp(sv(7, 1));
    case 'yc': return cmp(sv(10));
    case 'hyc': return cmp(sv(10, 0));
    case 'ayc': return cmp(sv(10, 1));
    case 'foul': return cmp(sv(6));
    case 'off': return cmp(sv(8));
    case 'sot': return cmp(sv(0));
    case 'hsot': return cmp(sv(0, 0));
    case 'asot': return cmp(sv(0, 1));
    case 'shots': return cmp(sv(2));
    case 'ps': case 'psot': case 'pyc': case 'pa': {
      const m = DB.players.m[f.i]; if (!m || !it.pl) return null;
      const l = m.find(x => x[0] === it.pl.pid); if (!l) return false;
      return it.fam === 'ps' ? l[3] > 0 : it.fam === 'psot' ? l[8] > 0 : it.fam === 'pyc' ? l[5] > 0 : l[4] > 0;
    }
  }
  return null;
}

// მოკლე სახელი ჩიპებისთვის: „კუთხ. მეტი 9.5“, „Arsenal გოლები მეტი 1.5“
export function pickName(p) {
  const g = p.group.replace(/\s*\(.*\)$/, '');
  if (/^მატჩის შედეგი|^ორმაგი შანსი|^ფორა|^გამარჯვება მშრალად|^ფრეს გარეშე/.test(g)) return p.label.replace(/^(1|2|X) · /, '');
  const short = { 'გოლები სულ': 'გოლები', 'ორივე გაიტანს': 'BTTS', 'კუთხურები სულ': 'კუთხ.', 'ყვითელი ბარათები სულ': 'ყვით.', 'ჯარიმები': 'ჯარიმ.', 'ოფსაიდები სულ': 'ოფს.',
    'კარში დარტყმები სულ': 'კარში დარტ.', 'დარტყმები სულ': 'დარტ.', '1-ლი ტაიმის გოლები': '1-ლი ტაიმი', 'მე-2 ტაიმის გოლები': 'მე-2 ტაიმი',
    'მშრალი მატჩი': 'მშრალი:', 'გუნდის ყვითელი ბარათები': 'ყვით.', 'გუნდის კარში დარტყმები': 'კარში დარტ.', 'გაიტანს მატჩში': 'გაიტანს:',
    'გააკეთებს ასისტს': 'ასისტი:', 'კარში დარტყმა 1+': 'კარში დარტ. 1+:', 'მიიღებს ყვითელს': 'ყვითელი:' };
  for (const [k, v] of Object.entries(short)) if (g.startsWith(k)) return `${v} ${p.label}`;
  const m = g.match(/^(.*) — (გოლები|კუთხურები)$/);
  if (m) return `${m[1]} ${m[2] === 'გოლები' ? 'გოლები' : 'კუთხ.'} ${p.label}`;
  return `${g}: ${p.label}`;
}

// -------------------------------------------------- 💎 Value ფსონები
// კოეფიციენტი 1.50–2.50, საბოლოო ალბათობა ≥55%, მოდელი ბუკმეკერზე 4–80%-ით მაღალს ხედავს
export function valuePicks(mk, f, max = 6) {
  if (!f || !DB.odds?.[f.i]) return [];
  const SKIP = new Set(['cs', 'exg', 'htft', 'hh', 'oe', 'bttso', 'poss', 'h2r', 'rc', 'cs1', 'wtn', 'ps', 'pa', 'psot', 'pyc']);
  const best = {};
  for (const gr of [...mk.R, ...mk.ST, ...mk.OT]) for (const it0 of gr.items) {
    if (SKIP.has(it0.fam) || it0.p < 0.55) continue;          // საბოლოო (შერწყმული) ალბათობა ≥55%
    const o = oddsFor(f, it0); if (!o || !o.odd) continue;
    if (o.odd < 1.5 || o.odd > 2.5) continue;
    const ev = (it0.pm ?? it0.p) * o.odd;                        // value — მოდელის საკუთარი შეფასებით (მიგნებები არ იჩაგრება)
    if (ev < 1.04 || ev > 1.80) continue; // +80%-ზე მეტი უთანხმოება — სავარაუდოდ მოდელის შეცდომა
    const it = { ...it0, group: gr.title, odd: o.odd, book: o.book, value: ev - 1 };
    const k = it.fam + (it.dir || '');
    if (!best[k] || ev > best[k].p * best[k].odd) best[k] = it;
  }
  return Object.values(best).sort((a, b) => b.value - a.value).slice(0, max);
}
