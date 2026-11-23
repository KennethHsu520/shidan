const nowT = () => (CLK != null ? CLK : Date.now());
function teamLog(text, who) { TS.log.push({ t: nowT(), text }); if (TS.log.length > 30) TS.log.splice(0, TS.log.length - 30); feed(who || logWho(text), text); }
const teamPos = () => state.positions.filter((p) => p.owner === 'team');
function teamBudget() {
  const eq = E.equity(state, S.prices);
  const alloc = eq * state.settings.teamPct;
  let used = 0;
  for (const p of teamPos()) if (p.src !== 'deleg') used += p.margin;
  return { eq, alloc, used, room: Math.max(0, alloc - used) };
}
function simAgg(sym, mins) {
  if (!Sim.m[sym]) return [];
  const c1 = Sim.m[sym].c1;
  if (mins === 1) return c1.slice();
  const span = mins * 60000;
  const out = [];
  let cur = null;
  for (const k of c1) {
    const b = Math.floor(k.t / span) * span;
    if (!cur || cur.t !== b) { cur = { t: b, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v }; out.push(cur); }
    else { if (k.h > cur.h) cur.h = k.h; if (k.l < cur.l) cur.l = k.l; cur.c = k.c; cur.v += k.v; }
  }
  return out;
}
const L = TeamLearn;
async function pool(items, n, fn) {
  let idx = 0;
  const run = async () => { while (idx < items.length) { const my = items[idx++]; await fn(my); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
}
async function teamHistory(sym) {
  if (S.mode === 'sim') return simAgg(sym, 5);
  let out = [];
  let end = Date.now();
  for (let p = 0; p < 5; p++) {
    const rows = await fetchKlines(sym, '5m', '&limit=1000&endTime=' + end);
    if (!rows.length) break;
    out = rows.concat(out);
    end = rows[0].t - 1;
    if (rows.length < 1000) break;
    await sleep(60);
  }
  const seen = new Set();
  return out.filter((k) => (seen.has(k.t) ? false : (seen.add(k.t), true))).sort((a, b) => a.t - b.t);
}
function curveStats(arr) {
  let eq = 0, peak = 0, dd = 0;
  for (const x of arr) { eq += x.r; if (eq > peak) peak = eq; if (peak - eq > dd) dd = peak - eq; }
  return { dd, total: eq };
}
function evalSamples(samples, symsOf) {
  const res = {};
  let t0 = Infinity, t1 = 0;
  for (const x of samples) if (x.t > 0) { if (x.t < t0) t0 = x.t; if (x.t > t1) t1 = x.t; }
  const cut = t1 > 0 ? t0 + (t1 - t0) * 0.7 : 0;
  for (const key of Team.KEYS) {
    const [type, side] = key.split(':');
    const xs = samples.filter((x) => x.key === key).sort((a, b) => (a.t || 0) - (b.t || 0));
    const rs = xs.map((x) => x.r);
    const st = Team.stats(rs);
    const mc = Team.monteCarlo(rs, { runs: 10000 });
    const per = {};
    for (const x of xs) per[x.sym] = (per[x.sym] || 0) + 1;
    const ins = Team.stats(xs.filter((x) => !(x.t >= cut)).map((x) => x.r));
    const oos = Team.stats(xs.filter((x) => x.t >= cut).map((x) => x.r));
    const cv = curveStats(xs);
    let grade = Team.grade(st, mc);
    const ovf = oos.n >= 5 && oos.avgR < 0 && ins.avgR > 0;
    const thin = st.n < 30;
    if (ovf && grade !== 'C') grade = 'C';
    res[key] = { key, type, side, st, mc, grade, per, ins, oos, dd: cv.dd, ovf, thin, cut };
  }
  return res;
}
function trustTxt(res) {
  if (!res || !res.st.n) return '沒有樣本';
  if (res.ovf) return '可能過度擬合：前 70% 時間賺、最近 30% 賠，降成 C 級';
  if (res.oos && res.oos.n < 5) return '最近 30% 時間只有 ' + res.oos.n + ' 次，樣本外還看不出來';
  if (res.thin) return '樣本不到 30 次，結果大多可能是運氣';
  return res.oos.avgR >= 0 ? '前後兩段結果一致，可信度較高' : '前後兩段都偏弱';
}
async function loadAllHistory() {
  if (TS.loading) return;
  TS.loading = true;
  TS.err = null;
  const histAt = Date.now();
  const coins = S.coins.slice();
  TS.total = coins.length;
  TS.loaded = 0;
  TS.mdLoading = true;
  refreshTeam();
  try { await Promise.all([loadMarket(coins), loadNews()]); } catch (e) { MD.t = Date.now(); }
  TS.mdLoading = false;
  const hist = {};
  let failed = 0;
  if (coins.includes('BTC')) { try { hist.BTC = await teamHistory('BTC'); } catch (e) { failed++; } TS.loaded++; }
  const dirAt = L.regimeSeries(hist.BTC || []);
  const samples = [];
  const take = (sym, k) => {
    if (k.length <= 200) return;
    TS.rt[sym] = Team.ratios(k.slice(-3000));
    for (const x of L.samplesFrom(k, dirAt, (t) => extAt(sym, t))) { x.sym = sym; samples.push(x); }
  };
  if (hist.BTC) take('BTC', hist.BTC);
  await pool(coins.filter((c) => c !== 'BTC'), S.mode === 'sim' ? 1 : 6, async (sym) => {
    try { take(sym, await teamHistory(sym)); } catch (e) { failed++; }
    TS.loaded++;
    refreshTeam();
    await sleep(10);
  });
  if (failed) TS.err = failed + ' 個幣的歷史資料讀取失敗';
  TS.samples = samples;
  TS.histAt = histAt;
  TS.results = evalSamples(samples);
  learnRebuild(true);
  for (const s of TS.signals) { const res = TS.results[s.type + ':' + s.side]; s.grade = res ? res.grade : 'C'; }
  TS.loadedAt = Date.now();
  TS.loading = false;
  TS.nextScan = 0;
  refreshTeam();
}
function ruleId(r) { return r.kind + '|' + r.key + '|' + r.fk + ':' + r.val; }
function learnRebuild(silent) {
  const before = new Set((TS.rules || []).map(ruleId));
  const cut = TS.sampleCut;
  TS.kb = L.build(cut ? (TS.samples || []).filter((x) => !x.t || x.t < cut) : TS.samples || [], TS.journal.filter((j) => !j.cancel && j.src !== 'deleg'), shadowLearn(cut));
  TS.rules = L.rules(TS.kb);
  const after = new Set(TS.rules.map(ruleId));
  const added = TS.rules.filter((r) => !before.has(ruleId(r)));
  const removed = Array.from(before).filter((x) => !after.has(x));
  if (!silent) {
    for (const r of added) teamLog((r.kind === 'avoid' ? '新守則：避開 ' : '新守則：偏好 ') + L.label(r) + '（平均 ' + L.fmtR(r.avg) + '）');
    for (const x of removed) { const [kind, key, fv] = x.split('|'); const [fk, val] = fv.split(':'); teamLog('取消守則：' + (kind === 'avoid' ? '避開 ' : '偏好 ') + L.label({ key, fk, val })); }
  }
  return { added, removed };
}
const teamReady = () => S.mode === 'sim' || (S.mode === 'live' && !S.stale && !S.catching);
async function teamScan() {
  if (TS.scanning || !teamReady()) return;
  TS.scanning = true;
  try {
    const btc = S.mode === 'sim' ? simAgg('BTC', 60).slice(-150) : await fetchKlines('BTC', '1h', '&limit=150');
    TS.regime = Team.regime(btc);
    const dir = TS.regime ? TS.regime.dir : 'flat';
    try {
      const b5 = S.mode === 'sim' ? simAgg('BTC', 5).slice(-8) : await fetchKlines('BTC', '5m', '&limit=8');
      const cl = b5.slice(0, -1);
      if (cl.length >= 4) TS.btcMove = Math.abs(cl[cl.length - 1].c / cl[cl.length - 4].c - 1);
    } catch (e) { TS.btcMove = 0; }
    const held = teamPos().map((p) => p.sym);
    if (S.mode === 'live') await pool(Array.from(new Set(held)), 4, async (c) => { try { const h = await fetchKlines(c, '1h', '&limit=60'); const d = h1Dir(h); if (d) MD.h1[c] = d; } catch (e) { return; } });
    SEC.t = 0;
    const sc = sectors();
    const rk = (c) => (sc.map[c] === 'strong' ? 0 : sc.map[c] === 'weak' ? 2 : 1);
    const syms = Array.from(new Set(TS.delegs.map((d) => d.sym).concat(held, S.coins.slice().sort((a, b) => rk(a) - rk(b)))));
    TS.recent = TS.recent || {};
    TS.scanStat = { sig: 0, trade: 0, skip: 0, bar: Math.floor(Date.now() / BAR5) };
    if (S.mode === 'live') whaleSync(held);
    await pool(syms, S.mode === 'sim' ? 1 : 8, async (sym) => {
      try {
        const k = S.mode === 'sim' ? simAgg(sym, 5).slice(-150) : await fetchKlines(sym, '5m', '&limit=150');
        if (k.length > 20) TS.recent[sym] = k;
        const ls = Team.latest(k, dir, 3, (t) => extAt(sym, t, true));
        for (const s of ls) addSignal(sym, s, k, ls.some((x) => x.side !== s.side && x.barT === s.barT));
      } catch (e) { TS.scanErr = (TS.scanErr || 0) + 1; }
    });
    const now = Date.now();
    TS.signals = TS.signals.filter((s) => now - s.barT < 30 * 60000);
    TS.cGrade = TS.signals.filter((s) => !(s.dec && s.dec.go) && s.grade === 'C').length;
    teamManage();
    shadowResolve();
    tuneGates();
    practiceCheck();
    scanFeed(syms.length);
    TS.lastScan = now;
    SEC.t = 0;
    TS.err = null;
  } catch (e) { TS.err = '這次掃描失敗，下一分鐘會再試'; }
  TS.scanning = false;
  if (!TS.err) TS.lastRun = Date.now();
  const nowS = Date.now();
  const bar = 5 * 60000;
  TS.nextScan = Math.min(nowS + 60000, Math.floor(nowS / bar) * bar + bar + 4000);
  save();
  saveTeam();
  refreshTeam();
}
function addSignal(sym, s, k, mixed) {
  const id = sym + '-' + s.type + '-' + s.side + '-' + s.barT;
  if (TS.signals.some((x) => x.id === id)) return;
  if (CLK != null && TS.journal.some((j) => j.sym === sym && j.type === s.type && j.side === s.side && Math.abs(j.t0 - (s.barT + BAR5)) < 15 * 60000)) return;
  const key = s.type + ':' + s.side;
  const res = TS.results && TS.results[key];
  const rt = TS.rt[sym] || Team.ratios(k);
  const replay = s.replay || Team.replay(rt, s.plan, s.side, { runs: 10000 });
  const f = s.f || { align: 'flat', vol: 'mid', rsi: 'mid', sess: L.session(s.barT) };
  const dec = TS.kb ? L.decide(TS.kb, TS.rules || [], key, f, replay, TS.tune ? TS.tune.est : 0.1) : { go: false, est: 0, why: '時光機還在讀資料', avoid: [], prefer: [] };
  const sig = { id, sym, type: s.type, side: s.side, plan: s.plan, barT: s.barT, seen: nowT(), grade: res ? res.grade : null, replay, volx: s.volx, f, dec };
  TS.signals.unshift(sig);
  if (TS.scanStat && CLK == null) TS.scanStat.sig++;
  if (mixed) sig.mixed = true;
  const strong = !mixed && dec.go && (sig.grade === 'A' || sig.grade === 'B');
  for (const p of teamPos().filter((x) => x.sym === sym && x.side !== s.side && strong && nowT() - x.t0 >= FLIP_MIN && !(x.src === 'deleg' && !x.ask && !x.hand))) {
    const px = S.prices[sym];
    if (!(px > 0)) continue;
    const r = E.closePosition(state, p.id, px, nowT(), 'flip', S.prices);
    if (r.ok) { teamLog('團隊 ' + sym + ' 出現反方向訊號，提早出場 ' + fS(r.trade.pnl) + ' USDT'); toast('團隊 ' + sym + ' 反向訊號出場 ' + fS(r.trade.pnl)); afterClose(); }
  }
  if (mixed) return sigSkip(sig, 'mixed', '同一根 K 線同時出現買漲和買跌訊號，方向不明不做');
  const d = TS.delegs.find((x) => x.sym === sym && (x.side === s.side || x.side === 'any'));
  if (d && sigWorthy(sig, d.side === 'any')) {
    if (teamTrade(sig, d.side === 'any' ? 'ask' : 'deleg')) { TS.delegs = TS.delegs.filter((x) => x !== d); if (CLK == null) toast(delegDoneTxt(d, sig)); return sigDone(sig); }
    return sigSkip(sig, sig.bcat || 'deleg', sig.block || '你的委託在等，但這個訊號沒有成交');
  }
  if (TS.delegs.some((x) => x.sym === sym)) return sigSkip(sig, 'deleg', '這個幣有你的委託在等，團隊自己不碰');
  if (!TS.auto || state.settings.teamPct <= 0) return sigSkip(sig, 'off', '團隊自己找單是關的');
  if (dec.go) return teamTrade(sig, 'auto', false) ? sigDone(sig) : sigSkip(sig, sig.bcat || 'other', sig.block || '沒有成交');
  const ex = exploreState();
  if (ex.on) {
    if (ex.open >= EXPLORE_OPEN) return sigSkip(sig, 'busy', '試單已經有 ' + EXPLORE_OPEN + ' 筆在場上');
    sig.explore = true;
    return teamTrade(sig, 'auto', true) ? sigDone(sig) : sigSkip(sig, sig.bcat || 'other', sig.block || '沒有成交');
  }
  if (ex.open < 2 && !(dec.avoid && dec.avoid.length) && dec.est != null && dec.est > -0.15 && Math.random() < 0.2) { sig.explore = true; if (teamTrade(sig, 'auto', true)) return sigDone(sig); }
  return sigSkip(sig, decCat(dec), dec.why);
}
function decCat(dec) { return dec.avoid && dec.avoid.length ? 'avoid' : dec.est != null && dec.est < (TS.tune ? TS.tune.est : 0.1) ? 'est' : 'replay'; }
const FLIP_MIN = 15 * 60000;
const SMALL_MULT = 0.5;
const SMALL_NOTE = '小幣滑價大，風險減半';
const smallCoin = (sig) => !!(sig && sig.f && sig.f.liq === 'small');
const EXPLORE_N = 30;
const EXPLORE_OPEN = 6;
const EXPLORE_RISK = 0.0025;
function exploreState() {
  const done = TS.journal.filter((j) => !j.cancel && j.src !== 'deleg' && !j.practice && j.r != null).length;
  const open = teamPos().filter((p) => p.explore).length;
  const n = TS.exN != null ? TS.exN : typeof window.__gqExN === 'number' ? window.__gqExN : EXPLORE_N;
  return { on: done < n, done, open };
}
function teamTrade(sig, mode, explore) {
  const deleg = mode === 'deleg' || mode === 'ask';
  const ask = mode === 'ask';
  const practice = mode === 'practice';
  const no = (cat, txt) => { sig.bcat = cat; sig.block = txt; return false; };
  sig.bcat = null;
  sig.block = null;
  if (teamPos().some((p) => p.sym === sig.sym)) return no('held', '團隊手上已經有一筆 ' + sig.sym);
  if (sig.side === 'short' && !E.canShort(state)) return no('short', '買跌還沒解鎖（第 5 關過關才能做）');
  if (CLK == null && S.mode === 'live' && !(S.prices[sig.sym] > 0)) return no('data', '沒有 ' + sig.sym + ' 的即時報價，資料有問題先不進場');
  const px = S.prices[sig.sym] || sig.plan.entry;
  const long = sig.side === 'long';
  const { stop, target } = sig.plan;
  if (long ? !(px > stop && px < target) : !(px < stop && px > target)) return no('chase', '價格已經離開停損到停利的範圍');
  if (Math.abs(px - sig.plan.entry) > 0.5 * Math.abs(sig.plan.entry - stop)) return no('chase', '價格離進場價超過 0.5R，不追');
  let amount, risk = null, notes = [], lev = 1;
  const b = teamBudget();
  if (mode === 'deleg') amount = Math.min(orderAmount().amount, E.maxAmount(state.cash, 1, sig.side));
  else {
    if (!ask && (state.settings.teamPct <= 0 || b.room < E.MIN_AMOUNT)) return no('budget', state.settings.teamPct <= 0 ? '團隊額度是 0%' : '團隊額度已經用完');
    const g = guard();
    if (g.block) return no('guard', g.block);
    const bc = brainCheck(sig);
    sig.con = bc.con || [];
    if (bc.block && !(practice && bc.conBlock)) return no(bc.conBlock ? 'con' : 'brain', bc.block);
    if (sig.sym !== 'BTC' && g.btc > RISK.shock) return no('shock', '比特幣 15 分鐘內動了 ' + (g.btc * 100).toFixed(1) + '%，小幣先不進場');
    const small = smallCoin(sig);
    if (small && sig.grade !== 'A' && sig.grade !== 'B') return no('small', '小幣（24 小時成交額不到 1,000 萬美元）只做 A、B 級訊號');
    if (ask) {
      const mult = Math.max(0.25, g.mult * bc.mult) * (small ? SMALL_MULT : 1);
      notes = mult < 1 ? g.notes.concat(bc.notes, small ? [SMALL_NOTE] : []) : [];
      amount = Math.floor(Math.min(orderAmount().amount * mult, E.maxAmount(state.cash, 1, sig.side)) * 100) / 100;
    } else {
      if (practice) { risk = EXPLORE_RISK; notes = ['冷場練習單用最小風險 0.25%'].concat(bc.conBlock ? ['反方理由 ' + sig.con.length + ' 個，練習單照做但記下來'] : []); }
      else if (explore) { risk = EXPLORE_RISK; notes = ['試單用最小風險 0.25%']; }
      else {
        const sz = L.sizing(TS.journal.filter((j) => !j.cancel && !j.explore && !j.practice && j.src !== 'deleg'), { est: sig.dec ? sig.dec.est : 0.1, dd: L.teamDD(teamClosed(), b.alloc) });
        risk = sz.risk; notes = sz.notes;
      }
      if (g.mult < 1) { risk = Math.max(EXPLORE_RISK, risk * g.mult); notes = notes.concat(g.notes); }
      if (bc.mult < 1) { risk = Math.max(EXPLORE_RISK, risk * bc.mult); notes = notes.concat(bc.notes); }
      if (small) { risk *= SMALL_MULT; notes = notes.concat([SMALL_NOTE]); }
      const add = b.alloc * risk;
      if (g.open + add > RISK.open * b.alloc + 1e-9) return no('cap', '團隊同時承擔的風險已到額度的 5%');
      if (g.side[sig.side] + add > RISK.side * b.alloc + 1e-9) return no('cap', '同方向（' + SIDE[sig.side] + '）的風險已到額度的 3%，幣跟幣會一起漲跌');
      const lz = teamLev(b.alloc * risk, Math.abs(px - stop) / px, Math.min(b.room, state.cash), sig.side);
      lev = lz.lev;
      amount = lz.amount;
    }
  }
  if (!(amount >= E.MIN_AMOUNT)) return no('size', '算出來的金額太小，低於最小下單金額');
  const r = E.openPosition(state, { sym: sig.sym, side: sig.side, lev, amount, price: px, reason: Team.TYPES[sig.type].reason, now: nowT(), ctx: null, owner: 'team', src: deleg ? 'deleg' : 'auto' }, S.prices);
  if (!r.ok) return no('other', '下單失敗：' + (r.err || '帳戶條件不符'));
  E.setStops(state, r.pos.id, roundP(stop), roundP(target), px, true);
  r.pos.until = nowT() + Team.HOLD * 5 * 60000;
  r.pos.sig = sig.type;
  if (explore) r.pos.explore = true;
  if (practice) r.pos.practice = true;
  if (ask) r.pos.ask = true;
  const actualRisk = b.alloc > 0 ? (Math.abs(px - stop) * r.pos.qty) / b.alloc : null;
  const tracked = mode !== 'deleg';
  const th = tracked && CLK == null ? thesisNow(sig.sym, sig.side).filter((x) => x.ok).map((x) => x.k) : null;
  const why = ask ? '你請團隊判斷 ' + sig.sym + '，團隊選擇' + SIDE[sig.side] + '：' + (sig.dec ? sig.dec.why : Team.TYPES[sig.type].name) : practice ? practiceWhy(sig) : explore ? exploreWhy(sig) : sig.dec ? sig.dec.why : '';
  TS.journal.push({ con: tracked && sig.con && sig.con.length ? sig.con.slice(0, 5) : null, th, id: r.pos.id, t0: nowT(), sym: sig.sym, type: sig.type, side: sig.side, f: sig.f, est: sig.dec ? sig.dec.est : null, grade: sig.grade, risk: deleg ? null : risk, riskReal: actualRisk, src: deleg ? 'deleg' : 'auto', ask, explore: !!explore, practice, why: why + (notes.length ? '。資金：' + notes.join('，') : ''), r: null });
  if (TS.journal.length > 300) TS.journal.splice(0, TS.journal.length - 300);
  teamLog((ask ? '請團隊判斷成交：' : deleg ? '委託成交：' : practice ? '冷場練習單：' : explore ? '試單：' : '') + '團隊' + SIDE[sig.side] + ' ' + sig.sym + ' @ ' + fP(px) + '（' + Team.TYPES[sig.type].name + (risk ? '，風險 ' + (risk * 100).toFixed(2) + '%' : '') + (lev > 1 ? '，' + lev + ' 倍' : '') + '）');
  if (!deleg && CLK == null) toast('團隊' + SIDE[sig.side] + ' ' + sig.sym + ' @ ' + fP(px));
  if (CLK != null) { TS.rpOpen.add(r.pos.id); return true; }
  save();
  saveTeam();
  if (S.view === 'trade') { tickUI(); drawChart(); }
  return true;
}
const TEAM_MAX_LEV = 5;
function teamLev(riskUsd, distPct, room, side) {
  if (!(distPct > 0) || !(riskUsd > 0) || !(room > 0)) return { lev: 1, amount: 0 };
  const notional = riskUsd / distPct;
  let lev = 1;
  while (lev < TEAM_MAX_LEV && notional / lev > room) lev++;
  while (lev > 1 && distPct >= (1 / lev - E.MMR) * 0.6) lev--;
  const amount = Math.floor(Math.min(notional / lev, room, E.maxAmount(room, lev, side)) * 100) / 100;
  return { lev, amount };
}
function exploreWhy(sig) {
  const ex = exploreState();
  return (ex.on ? '試單期（已完成 ' + ex.done + ' / ' + EXPLORE_N + ' 筆）：先小量什麼訊號都做，累積經驗' : '探索：這類的單還沒把握，小量做來驗證') + (sig.dec && sig.dec.est != null ? '。目前預估 ' + L.fmtR(sig.dec.est) : '');
}
function learnFromClosed() {
  let changed = false;
  for (const j of TS.journal) {
    if (j.r != null || j.cancel) continue;
    if (state.positions.some((p) => p.id === j.id && p.owner === 'team')) continue;
    const t = state.trades.find((x) => x.id === j.id);
    if (!t || t.owner !== 'team') { j.cancel = true; j.review = '改由你管，不列入團隊學習'; changed = true; continue; }
    j.r = t.r != null ? t.r : t.pnl > 0 ? 0.5 : -0.5;
    j.pnl = t.pnl;
    j.t1 = t.t1;
    j.exit = t.why;
    j.ok = j.r > 0;
    if (j.src === 'deleg') { j.review = '你委託的單：結果 ' + L.fmtR(j.r) + '。團隊和你完全分開，這筆不列入團隊學習。'; changed = true; continue; }
    const prev = TS.journal.filter((x) => x !== j && x.r != null && !x.cancel && x.src !== 'deleg' && x.type === j.type && x.side === j.side && x.f && j.f && x.f.align === j.f.align);
    const pAvg = prev.length ? prev.reduce((a, x) => a + x.r, 0) / prev.length : null;
    let txt = (j.exit === 'thesis' && j.thx ? '進場理由不成立（' + j.thx + '），提早出場。' : '') + (j.ok ? '判斷正確' : '判斷錯誤') + '：預估 ' + (j.est != null ? L.fmtR(j.est) : '—') + '，結果 ' + L.fmtR(j.r) + '（' + (WHY[j.exit] || '出場') + '）。';
    txt += prev.length ? '同類（' + Team.TYPES[j.type].name + SIDE[j.side] + '・' + L.FEATS.align[j.f.align] + '）之前 ' + prev.length + ' 次平均 ' + L.fmtR(pAvg) + '。' : '這是團隊第一次做這類單。';
    const ch = learnRebuild(false);
    if (ch.added.length || ch.removed.length) txt += '學到：' + ch.added.map((r) => (r.kind === 'avoid' ? '以後避開' : '以後偏好') + L.label(r)).concat(ch.removed.length ? ['取消 ' + ch.removed.length + ' 條舊守則'] : []).join('、') + '。';
    else txt += j.ok ? '符合預期，守則不變，繼續照做。' : '樣本還不夠改守則，先記下來，下次同類的單預估會再調低。';
    j.review = txt;
    teamLog((j.ok ? '對：' : '錯：') + j.sym + ' ' + Team.TYPES[j.type].name + SIDE[j.side] + ' ' + L.fmtR(j.r));
    changed = true;
  }
  if (changed) { saveTeam(); refreshTeam(); }
}
function teamManage() {
  const now = nowT();
  let changed = false;
  for (const p of teamPos()) {
    const px = S.prices[p.sym];
    if (!(px > 0)) continue;
    if (p.until && now >= p.until) {
      const r = E.closePosition(state, p.id, px, now, 'time', S.prices);
      if (r.ok) { teamLog('團隊 ' + p.sym + ' 抱滿 4 小時出場，' + fS(r.trade.pnl) + ' USDT'); changed = true; }
      continue;
    }
    if (!p.be && p.r0 > 0 && E.posPnl(p, px) >= p.r0) {
      const be = roundP(breakeven(p));
      const ok = p.side === 'long' ? be < px : be > px;
      if (ok && E.setStops(state, p.id, be, p.tp, px, true).ok) { p.be = true; teamLog('團隊 ' + p.sym + ' 已賺 1R，停損移到打平價 ' + fP(be)); changed = true; }
    }
    const rk = TS.recent && TS.recent[p.sym];
    if (rk && rk.length > 8 && trailPos(p, px, rk.slice(-1 - Team.TRAIL_N, -1))) changed = true;
  }
  if (delegExpire(now, true)) changed = true;
  if (thesisCheck()) changed = true;
  if (changed) { afterClose(); save(); saveTeam(); if (S.view === 'trade') { tickUI(); drawChart(); } }
}
function handOver(id) {
  const p = state.positions.find((x) => x.id === id);
  if (!p || p.owner === 'team') return false;
  const px = S.prices[p.sym];
  if (!(px > 0)) { toast(p.sym + ' 目前沒有報價，等行情回來再交給團隊'); return false; }
  const long = p.side === 'long';
  if (p.sl == null) {
    let d = atrDist(p.sym, px);
    if (E.isLev(p) && p.liq > 0) { const room = Math.abs(px - p.liq) * 0.6; if (!(d > 0) || d > room) d = room; }
    if (!(d > 0)) d = px * 0.02;
    const sl = roundP(long ? px - d : px + d);
    const r = E.setStops(state, p.id, sl, p.tp, px, true);
    if (!r.ok) { toast('團隊設不了停損：' + r.err); return false; }
  }
  p.owner = 'team';
  p.src = 'deleg';
  p.hand = true;
  p.until = nowT() + Team.HOLD * 5 * 60000;
  p.be = false; p.trail = false; p.fav = 0;
  teamLog('你把 ' + p.sym + ' ' + SIDE[p.side] + (p.lev > 1 ? ' ' + p.lev + ' 倍' : '') + '交給團隊管：停損 ' + fP(p.sl) + '，賺 1R 移到打平、1.5R 開始跟著移，最多抱 ' + fLeft(p.until - nowT()));
  save();
  saveTeam();
  toast('這筆交給團隊管了，不算進團隊成績');
  if (S.sheetKind === 'book') renderBook(true);
  refreshTeam();
  if (S.view === 'trade') { render(); drawChart(); }
  return true;
}
function trailPos(p, px, bars) {
  if (!(p.r0 > 0) || !(p.qty > 0) || p.sl == null) return false;
  const dist = p.r0 / p.qty;
  const long = p.side === 'long';
  const fav = long ? px - p.entry : p.entry - px;
  p.fav = Math.max(p.fav || 0, fav);
  if (p.fav < Team.TRAIL_R * dist || bars.length < Team.TRAIL_N) return false;
  const ex = long ? Math.min(...bars.map((b) => b.l)) : Math.max(...bars.map((b) => b.h));
  const ns = roundP(ex);
  if (long ? !(ns > p.sl && ns < px) : !(ns < p.sl && ns > px)) return false;
  if (!E.setStops(state, p.id, ns, p.tp, px, true).ok) return false;
  if (!p.trail) { p.trail = true; teamLog('團隊 ' + p.sym + ' 已賺 1.5R，停損開始跟著最近 6 根' + (long ? '低點' : '高點') + '移動'); }
  return true;
}
function fLeft(ms) { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + ' 小時 ' + (m % 60) + ' 分' : m + ' 分'; }
function refreshTeam() {
  if (CLK != null) return;
  if (S.view === 'team' && !S.lesson) patch($('#view'), viewTeam());
}
function teamPulse() {
  if (TS.yield || (RUNNER && !SY.runnerOk) || !teamReady()) return;
  if (!TS.started) { TS.started = true; TS.awake = Date.now(); loadAllHistory(); return; }
  if (!TS.loading && TS.loadedAt && Date.now() - TS.loadedAt > 6 * 3600000) { loadAllHistory(); return; }
  if (TS.lastRun && !TS.replaying && TS.gapFrom == null && Date.now() - TS.lastRun > GAP_MIN && S.mode === 'live') { TS.gapFrom = TS.lastRun; TS.gapFromOrig = TS.lastRun; }
  if (TS.gapFrom != null) { if (TS.kb && !TS.loading) teamReplay(); teamManage(); learnFromClosed(); refreshTeam(); return; }
  if (S.mode === 'live' && MD.t && !MD.loading && !TS.loading && Date.now() - MD.t > 3600000) loadMarket(S.coins.slice());
  if (S.mode === 'live' && !NW.loading && Date.now() - NW.t > 300000) loadNews();
  if (!TS.scanning && Date.now() >= TS.nextScan) teamScan();
  else teamManage();
  learnFromClosed();
  rollWeeks();
  refreshTeam();
}
