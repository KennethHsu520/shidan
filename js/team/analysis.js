const TA = { cache: {}, busy: null };
function taEnsure(sym) {
  const c = TA.cache[sym];
  if (TA.busy || (c && c.mode === S.mode && Date.now() - c.t < (c.err ? 120000 : 3600000))) return;
  taLoad(sym);
}
async function taLoad(sym) {
  TA.busy = sym;
  try {
    const live = S.mode === 'live';
    const d = live ? await fetchKlines(sym, '1d', '&limit=250') : simAgg(sym, 1440);
    const w = live ? await fetchKlines(sym, '1w', '&limit=120') : simAgg(sym, 10080);
    TA.cache[sym] = { t: Date.now(), mode: S.mode, a: taAnalyze(d, w, S.prices[sym]) };
  } catch (e) { TA.cache[sym] = { t: Date.now(), mode: S.mode, err: true }; }
  TA.busy = null;
  refreshTeam();
}
function taLevels(d, px) {
  const W = 3, piv = [];
  for (let j = Math.max(W, d.length - 180); j < d.length - W; j++) {
    let hi = true, lo = true;
    for (let q = j - W; q <= j + W; q++) { if (q === j) continue; if (d[q].h > d[j].h) hi = false; if (d[q].l < d[j].l) lo = false; }
    if (hi) piv.push(d[j].h);
    if (lo) piv.push(d[j].l);
  }
  piv.sort((a, b) => a - b);
  const cl = [];
  for (const v of piv) { const g = cl[cl.length - 1]; if (g && v / g.v - 1 < 0.015) { g.n++; g.v = (g.v * (g.n - 1) + v) / g.n; } else cl.push({ v, n: 1 }); }
  return { sup: cl.filter((x) => x.v < px * 0.998).sort((a, b) => b.v - a.v).slice(0, 2), res: cl.filter((x) => x.v > px * 1.002).sort((a, b) => a.v - b.v).slice(0, 2) };
}
function taAnalyze(d, w, pxNow) {
  if (!d || d.length < 30) return { short: true, n: d ? d.length : 0 };
  const px = pxNow > 0 ? pxNow : d[d.length - 1].c;
  const c = d.map((x) => x.c);
  const avgN = (a, n) => (a.length >= n ? a.slice(-n).reduce((x, y) => x + y, 0) / n : null);
  const m20 = avgN(c, 20), m50 = avgN(c, 50), m200 = avgN(c, 200);
  const wc = w && w.length ? w.map((x) => x.c) : [];
  const w20 = avgN(wc, 20);
  const r = Team.rsi(c, 14), ax = Team.adx(d, 14);
  const rsiV = r[r.length - 1], adxV = ax.adx[ax.adx.length - 1];
  const n = Math.min(30, c.length);
  const ys = c.slice(-n);
  const xm = (n - 1) / 2, ym = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - xm) * (ys[i] - ym); den += (i - xm) * (i - xm); }
  const slope = den > 0 && ym > 0 ? num / den / ym : null;
  const lv = taLevels(d, px);
  let score = 0, known = 0;
  for (const m of [m20, m50, m200, w20]) if (m != null) { known++; score += px > m ? 1 : -1; }
  if (rsiV != null) { known++; score += rsiV > 55 ? 1 : rsiV < 45 ? -1 : 0; }
  const lean = known < 3 ? null : score >= 3 ? 'bull' : score <= -3 ? 'bear' : 'range';
  return { px, m20, m50, m200, w20, rsi: rsiV, adx: adxV, slope, sup: lv.sup, res: lv.res, lean, n: d.length, wn: wc.length };
}
function taHTML() {
  const sym = state.settings.sym;
  taEnsure(sym);
  const c = TA.cache[sym];
  const head = '<section><h3>技術分析師　' + esc(sym) + '　日線・週線</h3>';
  const foot = '<p class="say">看的是目前圖表上的幣，換幣就會重新分析，每小時更新。這是情境整理，不是預測，也不替三種情境指定機率。團隊下單時會用同樣的想法檢查「前方離擋路的高低點還有多遠」。</p></section>';
  if (!c || (TA.busy === sym && !c.a)) return head + '<div class="empty">讀取日線和週線中。</div>' + foot;
  if (c.err) return head + '<div class="empty">日線資料讀取失敗，2 分鐘後再試。</div>' + foot;
  const a = c.a;
  if (a.short) return head + '<div class="empty">' + (c.mode === 'live' ? '這個幣上市太短' : '模擬行情的歷史太短') + '（只有 ' + a.n + ' 根日線），日線分析無法計算。</div>' + foot;
  const vs = (m, name) => '<div><span>' + name + '</span><b>' + (m == null ? '資料不夠，無法計算' : fP(m) + '　' + (a.px > m ? '<span class="up">價格在上方</span>' : '<span class="down">價格在下方</span>')) + '</b></div>';
  const lvTxt = (arr) => arr.map((x) => fP(x.v) + '（' + fPct(x.v / a.px - 1, 1) + (x.n > 1 ? '，碰過 ' + x.n + ' 次' : '') + '）').join('、');
  const R1 = a.res[0] ? a.res[0].v : null, S1 = a.sup[0] ? a.sup[0].v : null;
  const leanTxt = { bull: '偏多', bear: '偏空', range: '盤整' }[a.lean] || '指標不夠，無法判斷';
  const sc = (name, on, ok, bad, watch) => '<div class="tasc' + (on ? ' on' : '') + '"><b>' + name + (on ? '<span class="vd vo">目前比較接近</span>' : '') + '</b><p class="jw">成立條件：' + ok + '</p><p class="jw">失效條件：' + bad + '</p><p class="jw">要追蹤：' + watch + '</p></div>';
  const r1t = R1 ? fP(R1) : '180 天高點';
  const s1t = S1 ? fP(S1) : '180 天低點';
  return head + '<div class="verdict ' + (a.lean === 'bull' ? 'up' : a.lean === 'bear' ? 'down' : '') + '" style="font-size:20px">' + leanTxt + '</div><div class="sub">價格 ' + fP(a.px) + '　日線 ' + a.n + ' 根、週線 ' + a.wn + ' 根</div>' +
    '<div class="calc">' + vs(a.m20, '20 日均線') + vs(a.m50, '50 日均線') + vs(a.m200, '200 日均線') + vs(a.w20, '20 週均線') +
    '<div><span>日線 RSI（動能）</span><b>' + (a.rsi == null ? '無法計算' : a.rsi.toFixed(0) + (a.rsi > 70 ? '　過熱' : a.rsi < 30 ? '　超賣' : a.rsi > 50 ? '　偏強' : '　偏弱')) + '</b></div>' +
    '<div><span>日線 ADX（趨勢強度）</span><b>' + (a.adx == null ? '無法計算' : a.adx.toFixed(0) + (a.adx >= 25 ? '　有趨勢' : a.adx < 20 ? '　盤整' : '　普通')) + '</b></div>' +
    '<div><span>30 天趨勢線</span><b class="' + (a.slope != null ? cls(a.slope) : '') + '">' + (a.slope == null ? '無法計算' : '每天 ' + fPct(a.slope, 2)) + '</b></div>' +
    '<div><span>上方壓力</span><b>' + (a.res.length ? lvTxt(a.res) : '180 天內沒有，正在高檔') + '</b></div>' +
    '<div><span>下方支撐</span><b>' + (a.sup.length ? lvTxt(a.sup) : '180 天內沒有，正在低檔') + '</b></div></div>' +
    '<h4 class="rh">三種情境</h4>' +
    sc('偏多', a.lean === 'bull', '日線收盤站上 ' + r1t + '，而且 RSI 守在 50 以上', '日線收盤跌破 ' + s1t, '突破那天成交量有沒有放大、站上後回測會不會守住') +
    sc('盤整', a.lean === 'range', '價格留在 ' + s1t + '～' + r1t + ' 之間，ADX 低於 20', '任何一邊收盤突破', '碰到上下緣有沒有被擋回來') +
    sc('偏空', a.lean === 'bear', '日線收盤跌破 ' + s1t + '，而且 RSI 在 50 以下', '日線重新收回 ' + s1t + ' 之上', '跌破那天成交量、反彈會不會被 20 日均線壓回') +
    '<div class="cta" style="margin-top:12px"><button class="btn quiet" data-act="tare">重新分析</button></div>' + foot;
}

const COACH = {
  nosl: { t: '每筆下單前先設停損', fact: (n) => n + ' 筆沒有設停損', how: '每筆成交後檢查：有沒有停損線', chk: (t) => !!t.hadSL },
  over: { t: '碰到停損就出場，不把停損拉遠', fact: (n) => n + ' 筆賠超過 1.3R（停損被拉遠、沒照做，或跳空）', how: '每筆結束後檢查：虧損有沒有超過 1.3R', chk: (t) => !(t.r != null && t.r < -1.3) },
  revenge: { t: '賠錢後 15 分鐘內不下新單', fact: (n) => n + ' 筆是賠錢後 15 分鐘內又下的單', how: '每筆檢查：上一筆賠錢的話，距離有沒有超過 15 分鐘', chk: (t, prev) => !(prev && prev.pnl < 0 && t.t0 - prev.t1 < 15 * 60000) },
  heavy: { t: '每筆風險不超過總資產 2%', fact: (n) => n + ' 筆風險超過總資產 2%（或押超過一半資產）', how: '每筆檢查：停損距離 × 部位 ÷ 總資產 ≤ 2%', chk: (t) => (t.riskPct != null ? t.riskPct <= 0.02 + 1e-9 : !(t.sizePct > 0.5)) },
  gut: { t: '每筆都選進場理由，不憑感覺', fact: (n) => n + ' 筆沒選理由或憑感覺', how: '每筆檢查：有沒有選理由、是不是「憑感覺」', chk: (t) => !!t.reason && t.reason !== 'gut' },
  cutwin: { t: '有設停利就讓它跑到停利或停損', fact: (n) => n + ' 筆賺錢但沒到停利就手動出場', how: '每筆檢查：有停利的單是不是手動提早出場', chk: (t) => !(t.why === 'manual' && t.pnl > 0 && t.tp != null) },
  fees: { t: '價差沒超過手續費 3 倍不出場（停損除外）', fact: (n) => n + ' 筆價差不到手續費 3 倍就出場', how: '每筆檢查：價差 ÷ 手續費 ≥ 3，或是停損出場', chk: (t) => t.why === 'sl' || t.why === 'liq' || Math.abs(t.gross) >= t.fees * 3 },
  trend: { t: '只順著均線方向進場', fact: (n) => n + ' 筆逆著均線方向進場', how: '每筆檢查：買漲時價格在均線上、買跌時在均線下', chk: (t) => !(t.ctx && t.ctx.above != null) || (t.side === 'long') === !!t.ctx.above }
};
function coachRun() {
  const all = E.mine(state);
  const T = all.slice(-20);
  const prevOf = (t) => { const i = all.indexOf(t); return i > 0 ? all[i - 1] : null; };
  const avg = (a) => (a.length ? a.reduce((x, t) => x + (t.r != null ? t.r : 0), 0) / a.length : null);
  const facts = [];
  for (const k of Object.keys(COACH)) {
    const bad = T.filter((t) => !COACH[k].chk(t, prevOf(t)));
    if (!bad.length) continue;
    const good = T.filter((t) => COACH[k].chk(t, prevOf(t)));
    const ab = avg(bad.filter((t) => t.r != null)), ag = avg(good.filter((t) => t.r != null));
    const cmp = bad.filter((t) => t.r != null).length >= 3 && good.filter((t) => t.r != null).length >= 3 ? '這些單平均 ' + L.fmtR(ab) + '，其他單平均 ' + L.fmtR(ag) : '';
    facts.push({ k, n: bad.length, share: bad.length / T.length, txt: COACH[k].fact(bad.length), cmp, w: bad.length / T.length + (ab != null && ag != null && ab < ag ? 0.2 : 0) });
  }
  facts.sort((a, b) => b.w - a.w);
  const guess = [];
  const wT = T.filter((t) => t.pnl > 0), lT = T.filter((t) => t.pnl <= 0);
  const hold = (a) => a.reduce((x, t) => x + (t.t1 - t.t0), 0) / a.length;
  if (wT.length >= 3 && lT.length >= 3 && hold(lT) > hold(wT) * 2) guess.push('賠錢的單平均抱 ' + E.fmtDur(hold(lT)) + '，賺錢的只抱 ' + E.fmtDur(hold(wT)) + '：可能是不想認賠、太早獲利了結（處置效應）');
  const after = T.filter((t) => { const p = prevOf(t); return p && p.pnl < 0 && t.t0 - p.t1 < 15 * 60000; });
  if (after.length >= 3) guess.push('賠錢後很快又下單 ' + after.length + ' 次：可能想把錢贏回來（情緒性交易）');
  const chase = T.filter((t) => t.ctx && t.ctx.chg != null && ((t.side === 'long' && t.ctx.chg > 0.015) || (t.side === 'short' && t.ctx.chg < -0.015)));
  if (chase.length >= 3) guess.push('急漲急跌後才進場 ' + chase.length + ' 次：可能怕錯過（FOMO）');
  const picks = facts.filter((f) => f.n >= 2).slice(0, 3).map((f) => f.k);
  for (const k of ['nosl', 'heavy', 'gut']) if (picks.length < 3 && !picks.includes(k)) picks.push(k);
  return { T, n: T.length, facts, guess, picks };
}
function coachTrack(rule) {
  const all = E.mine(state);
  const after = all.filter((t) => t.t0 >= rule.t);
  const prevOf = (t) => { const i = all.indexOf(t); return i > 0 ? all[i - 1] : null; };
  const ok = after.filter((t) => COACH[rule.k].chk(t, prevOf(t)));
  return { n: after.length, ok: ok.length };
}
function coachHTML() {
  const cr = coachRun();
  const head = '<section><h3>交易教練　' + (cr.n >= 5 ? '檢討你最近 ' + Math.min(20, cr.n) + ' 筆' : '檢討你自己的單') + '</h3>';
  if (cr.n < 5) return head + '<div class="empty">你自己的單還不到 5 筆（目前 ' + cr.n + ' 筆），先多做幾筆再檢討。</div></section>';
  const warn = cr.n < 20 ? '<p class="say down">只有 ' + cr.n + ' 筆，樣本不夠，下面的結論可能是運氣，參考就好。</p>' : '';
  const factHTML = cr.facts.length ? '<div class="list">' + cr.facts.slice(0, 5).map((f) => '<div class="row"><div class="row-main"><div><b>' + esc(f.txt) + '</b>' + (f.cmp ? '<div class="sub">' + esc(f.cmp) + '</div>' : '') + '</div><span class="sub">' + Math.round(f.share * 100) + '%</span></div></div>').join('') + '</div>' : '<div class="empty">紀錄裡沒有找到重複出現的錯誤。</div>';
  const guessHTML = cr.guess.length ? '<div class="list">' + cr.guess.map((g) => '<div class="row"><div class="row-main"><span class="sub">' + esc(g) + '</span></div></div>').join('') + '</div>' : '<div class="empty">沒有明顯的行為偏誤跡象。</div>';
  const adopted = TS.coach && TS.coach.rules && TS.coach.rules.length ? TS.coach.rules : null;
  let ruleHTML;
  if (adopted) {
    ruleHTML = '<div class="list">' + adopted.map((r) => { const tr = coachTrack(r); return '<div class="row"><div class="row-main"><div><b>' + esc(COACH[r.k].t) + '</b><div class="sub">' + esc(COACH[r.k].how) + '</div></div><span class="sub">' + (tr.n ? '遵守 ' + tr.ok + ' / ' + tr.n + ' 筆' : '採用後還沒交易') + '</span></div></div>'; }).join('') + '</div><p class="say">從 ' + fT(adopted[0].t) + ' 採用。遵守率是照紀錄算的，不代表一定能提高獲利。</p><div class="cta"><button class="btn quiet" data-act="coachNew">重新檢討、換新規則</button></div>';
  } else {
    ruleHTML = '<div class="list">' + cr.picks.map((k) => '<div class="row"><div class="row-main"><div><b>' + esc(COACH[k].t) + '</b><div class="sub">檢核方式：' + esc(COACH[k].how) + '</div></div></div></div>').join('') + '</div><div class="cta"><button class="btn solid" data-act="coachUse">採用這 3 條，開始追蹤</button></div>';
  }
  return head + warn + '<h4 class="rh">紀錄證明的事</h4>' + factHTML + '<h4 class="rh">推測（紀錄看不到你的想法，只是可能）</h4>' + guessHTML + '<p class="say">錯失的機會：紀錄只有你做過的單，看不出你沒做的好機會，所以不判斷。</p><h4 class="rh">你的 3 條交易規則</h4>' + ruleHTML + '</section>';
}

function betaOf(sym) {
  if (sym === 'BTC') return { b: 1, est: false };
  const a = TS.recent && TS.recent[sym], bk = TS.recent && TS.recent.BTC;
  if (a && bk && a.length > 40 && bk.length > 40) {
    const m = new Map(bk.map((x) => [x.t, x.c]));
    const xs = [], ys = [];
    for (let i = 1; i < a.length; i++) { const p0 = m.get(a[i - 1].t), p1 = m.get(a[i].t); if (p0 > 0 && p1 > 0 && a[i - 1].c > 0) { xs.push(p1 / p0 - 1); ys.push(a[i].c / a[i - 1].c - 1); } }
    if (xs.length >= 40) {
      const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
      let cv = 0, vr = 0;
      for (let i = 0; i < xs.length; i++) { cv += (xs[i] - mx) * (ys[i] - my); vr += (xs[i] - mx) * (xs[i] - mx); }
      if (vr > 0) return { b: Math.min(3, Math.max(0.3, cv / vr)), est: false };
    }
  }
  return { b: 1.3, est: true };
}
function stressOf(P, move, scale) {
  let gap = 0, stop = 0;
  for (const p of P) {
    const f = scale ? scale(p) : 1;
    if (!(f > 0)) continue;
    const px = S.prices[p.sym] > 0 ? S.prices[p.sym] : p.entry;
    const long = p.side === 'long';
    const np = px * (1 + Math.max(-0.95, move * betaOf(p.sym).b));
    const floor = -(p.margin + E.posPnl(p, px));
    const d1 = Math.max(floor, (np - px) * p.qty * (long ? 1 : -1)) * f;
    let np2 = np;
    if (p.sl != null && (long ? p.sl < px : p.sl > px)) np2 = long ? Math.max(np, p.sl) : Math.min(np, p.sl);
    if (p.tp != null && (long ? p.tp > px : p.tp < px)) np2 = long ? Math.min(np2, p.tp) : Math.max(np2, p.tp);
    const d2 = Math.max(floor, (np2 - px) * p.qty * (long ? 1 : -1)) * f;
    gap += d1; stop += d2;
  }
  return { gap, stop };
}
function stressHTML() {
  const P = state.positions;
  const head = '<section><h3>壓力測試　整個帳戶</h3>';
  if (!P.length) return head + '<div class="empty">目前沒有持倉，沒有要測的部位。有單之後會模擬「比特幣跌 20%」整個帳戶會怎樣。</div></section>';
  const eq = E.equity(state, S.prices);
  const val = (p) => (S.prices[p.sym] > 0 ? S.prices[p.sym] : p.entry) * p.qty;
  const tot = P.reduce((a, p) => a + val(p), 0);
  const bySym = {}, bySect = {}, side = { long: 0, short: 0 };
  for (const p of P) { bySym[p.sym] = (bySym[p.sym] || 0) + val(p); const sn = sectName(p.sym); bySect[sn] = (bySect[sn] || 0) + val(p); side[p.side] += val(p); }
  const top = Object.entries(bySym).sort((a, b) => b[1] - a[1])[0];
  const topS = Object.entries(bySect).sort((a, b) => b[1] - a[1])[0];
  const s0 = stressOf(P, -0.2);
  const big = P.slice().sort((a, b) => val(b) - val(a))[0];
  const sA = stressOf(P, -0.2, (p) => (p === big ? 0.5 : 1));
  const sB = stressOf(P, -0.2, () => 0.5);
  const feeOf = (list, f) => list.reduce((a, p) => a + val(p) * f * E.feeRate(p), 0);
  const pe = (x) => fU(x) + '（' + fPct(eq > 0 ? x / eq : 0, 1) + '）';
  const betas = Array.from(new Set(P.map((p) => p.sym))).map((s) => { const b = betaOf(s); return esc(s) + ' ' + b.b.toFixed(2) + (b.est ? '（估計）' : ''); }).join('、');
  const row = (k, v, c) => '<div><span>' + k + '</span><b class="' + (c || '') + '">' + v + '</b></div>';
  return head + '<div class="verdict ' + cls(s0.gap) + '" style="font-size:20px">比特幣跌 20%：' + fS(s0.stop) + ' USDT</div><div class="sub">停損照價成交的情況；占總資產 ' + fPct(eq > 0 ? s0.stop / eq : 0, 1) + '</div>' +
    '<div class="calc">' + row('目前持倉', P.length + ' 筆，總部位 ' + fU(tot) + ' USDT（總資產的 ' + Math.round(eq > 0 ? (tot / eq) * 100 : 0) + '%）') +
    row('停損照價成交', pe(s0.stop), cls(s0.stop)) + row('停損失效（跳空、交易所卡住）', pe(s0.gap), cls(s0.gap)) +
    row('最大單一幣', esc(top[0]) + ' 佔總資產 ' + Math.round(eq > 0 ? (top[1] / eq) * 100 : 0) + '%') +
    row('最集中的板塊', esc(topS[0]) + ' 佔持倉 ' + Math.round(tot > 0 ? (topS[1] / tot) * 100 : 0) + '%') +
    row('方向', '買漲 ' + Math.round(tot > 0 ? (side.long / tot) * 100 : 0) + '%・買跌 ' + Math.round(tot > 0 ? (side.short / tot) * 100 : 0) + '%') +
    row('跟比特幣的連動（β）', betas) + '</div>' +
    '<h4 class="rh">調整方案比較（停損失效的情況）</h4><div class="calc">' +
    row('不動', pe(s0.gap), cls(s0.gap)) +
    row(esc(big.sym) + ' 減半', pe(sA.gap) + '　手續費約 ' + fU(feeOf([big], 0.5)), cls(sA.gap)) +
    row('全部減半', pe(sB.gap) + '　手續費約 ' + fU(feeOf(P, 0.5)), cls(sB.gap)) + '</div>' +
    '<p class="say">β 用最近約 12 小時的 5 分 K 跟比特幣比；資料不夠的幣先用 1.3 估計。真的大跌時幣跟幣會一起跌得更兇，實際可能更糟。這只是假設情境，不保證避開虧損；要不要調整由你決定。</p></section>';
}

function dataCheck() {
  const now = Date.now();
  const age = (t) => (t ? now - t : Infinity);
  const ago = (t) => (t ? fAgo(Math.max(60000, now - t)) : '還沒讀到');
  const it = [];
  const add = (k, st, d) => it.push({ k, st, d });
  if (S.mode === 'live' && !S.stale) add('即時價格', 'ok', '幣安即時連線正常');
  else if (S.mode === 'sim') add('即時價格', 'wait', '目前是練習行情，不是真實價格');
  else add('即時價格', 'bad', S.stale ? '超過 15 秒沒收到報價，團隊暫停進場' : '連線中');
  const badPx = state.positions.filter((p) => !(S.prices[p.sym] > 0));
  add('持倉報價', badPx.length ? 'bad' : 'ok', badPx.length ? badPx.map((p) => p.sym).join('、') + ' 沒有報價' : state.positions.length ? state.positions.length + ' 筆持倉都有報價' : '目前沒有持倉');
  add('掃描用 5 分 K', age(TS.lastScan) < 180000 ? 'ok' : TS.lastScan ? 'bad' : 'wait', TS.lastScan ? '最後掃描 ' + ago(TS.lastScan) : '還沒掃描');
  add('時光機回測', TS.results ? 'ok' : 'wait', TS.results ? (TS.samples || []).length + ' 份樣本，' + ago(TS.loadedAt) + '讀完' : '還在讀取');
  if (S.mode === 'live') {
    add('資金費率', MD.ok.fund === true ? 'ok' : MD.ok.fund === false ? 'bad' : 'wait', MD.ok.fund === false ? '幣安期貨讀取失敗，相關條件不列入' : MD.ok.fund ? '幣安期貨，' + ago(MD.t) + '更新' : '讀取中');
    add('未平倉量', MD.ok.oi === true ? 'ok' : MD.ok.oi === false ? 'bad' : 'wait', MD.ok.oi === false ? '讀取失敗，相關條件不列入' : MD.ok.oi ? '幣安期貨' : '讀取中');
    const fg = MD.fg.length ? MD.fg[MD.fg.length - 1] : null;
    add('恐懼貪婪指數', fg && age(fg.t) < 2 * 86400000 ? 'ok' : MD.ok.fg === false ? 'bad' : 'wait', fg ? 'alternative.me，資料日期 ' + fYMD(fg.t) : '讀取中');
    const bd = MD.btcD ? MD.btcD[MD.btcD.length - 1] : null;
    add('比特幣日線、週線', bd && age(bd.t) < 2 * 86400000 ? 'ok' : bd ? 'bad' : 'wait', bd ? MD.btcD.length + ' 根日線' : '讀取中');
    add('穩定幣總市值', flowAt(now) ? 'ok' : MD.ok.stable === false ? 'bad' : 'wait', flowAt(now) ? 'DefiLlama' : MD.ok.stable === false ? '讀取失敗，資金層不列入' : '讀取中或資料太舊');
    const dm = MD.dom && MD.dom.hist && MD.dom.hist.length ? MD.dom.hist[MD.dom.hist.length - 1] : null;
    add('比特幣市佔率', dm && age(dm.t) < 2 * 3600000 ? 'ok' : dm ? 'wait' : 'wait', dm ? 'CoinGecko，' + ago(dm.t) + '記錄，需要累積 20 小時才判斷' : '讀取中');
  }
  add('新聞', NW.items && age(NW.t) < 15 * 60000 ? 'ok' : NW.ok === false ? 'bad' : 'wait', NW.items ? (NW.src || 'cryptocurrency.cv') + '，' + ago(NW.t) + '更新' : '讀取中');
  add('重大數據日曆', now < CAL_UNTIL ? 'ok' : 'bad', now < CAL_UNTIL ? '已排到 ' + fYMD(MACRO_CAL[MACRO_CAL.length - 1].t) + '，有幾個日期待確認（見事件日曆）' : '日曆過期，需要更新');
  return it;
}
function dataHTML() {
  const it = dataCheck();
  const grp = (st, name) => { const a = it.filter((x) => x.st === st); return a.length ? '<h4 class="rh">' + name + '（' + a.length + '）</h4><div class="list lyr">' + a.map((x) => '<div class="row"><div class="row-main"><span>' + esc(x.k) + '</span><span class="sub">' + esc(x.d) + '</span></div></div>').join('') + '</div>' : ''; };
  const bad = it.filter((x) => x.st === 'bad').length;
  return '<section><h3>資料查核員</h3><div class="verdict ' + (bad ? 'down' : '') + '" style="font-size:20px">' + (bad ? bad + ' 項資料有問題' : '資料都正常或讀取中') + '</div>' + grp('bad', '有誤') + grp('wait', '待核實') + grp('ok', '已核實') + '<p class="say">讀不到的資料，團隊會標成「沒有資料」不列入判斷，不會自己補數字。讀不到不代表那邊出事，只是這次沒拿到。</p></section>';
}
function calHTML() {
  const now = Date.now();
  const ev = MACRO_CAL.filter((e) => e.t + 3600000 > now).slice(0, 6);
  return '<section><h3>事件日曆</h3>' + (ev.length ? '<div class="list lyr">' + ev.map((e) => '<div class="row"><div class="row-main"><span>' + esc(fYMD(e.t) + ' ' + fHM(e.t)) + '</span><span class="sub">' + esc(e.name) + '<br>' + esc(calSrc(e.name)) + '</span></div></div>').join('') + '</div>' : '<div class="empty">日曆已過期，需要更新。</div>') +
    '<p class="say">待確認（找不到官方日期，不列入暫停）：' + esc(CAL_TBD.join('、')) + '。</p><p class="say">每週檢查：事實（數據公布值、官方公告）和市場猜測（「預期會降息」）分開看；事件不一定是利多，團隊不會在沒有證據時預測價格反應，只在公布前 30 分鐘到後 1 小時暫停進場。</p></section>';
}
