const GAP_MIN = 12 * 60000;
const GAP_MAX = 3 * 86400000;
async function fetchRange(sym, start, end) {
  let out = [];
  let t = start;
  for (let p = 0; p < 6 && t < end; p++) {
    const rows = await fetchKlines(sym, '5m', '&limit=1000&startTime=' + Math.floor(t) + '&endTime=' + Math.floor(end));
    if (!rows.length) break;
    out = out.concat(rows);
    t = rows[rows.length - 1].t + BAR5;
    if (rows.length < 1000) break;
    await sleep(40);
  }
  const seen = new Set();
  return out.filter((k) => (seen.has(k.t) ? false : (seen.add(k.t), true))).sort((a, b) => a.t - b.t);
}
function scopedCandle(sym, k, ids) {
  const keep = state.positions.filter((p) => !ids.has(p.id));
  const ords = state.orders;
  state.positions = state.positions.filter((p) => ids.has(p.id));
  state.orders = [];
  let evs = [];
  try { evs = E.onCandle(state, sym, k, S.prices); } finally {
    state.positions = state.positions.concat(keep);
    state.orders = ords;
  }
  return evs;
}
async function teamReplay() {
  if (TS.replaying || TS.gapFrom == null) return;
  if (S.mode !== 'live') { TS.gapFrom = null; return; }
  TS.replaying = true;
  const realNow = Date.now();
  const from = Math.max(TS.gapFrom, realNow - GAP_MAX);
  const end = Math.floor(realNow / BAR5) * BAR5;
  TS.rpTotal = 0; TS.rpDone = 0;
  const data = {};
  try {
    const syms = Array.from(new Set(['BTC'].concat(teamPos().map((p) => p.sym), TS.delegs.map((d) => d.sym), S.coins)));
    TS.rpTotal = syms.length;
    refreshTeam();
    await pool(syms, 6, async (sym) => {
      try { data[sym] = await fetchRange(sym, (sym === 'BTC' ? from - 4 * 86400000 : from - 400 * BAR5), end); } catch (e) { data[sym] = null; }
      TS.rpDone++;
      refreshTeam();
    });
  } catch (e) { data.err = true; }
  const stats = runReplay(data, from, end);
  TS.replaying = false;
  TS.gapFrom = null;
  TS.lastRun = end;
  TS.nextScan = 0;
  learnRebuild(true);
  save();
  saveTeam();
  const hrs = (end - from) / 3600000;
  const lines = ['團隊補跑了你不在的 ' + (hrs >= 24 ? (hrs / 24).toFixed(1) + ' 天' : hrs.toFixed(1) + ' 小時') + '，用的是當時幣安的真實 K 線。'];
  if (stats.opened || stats.closed) {
    lines.push('新開 ' + stats.opened + ' 筆、結束 ' + stats.closed + ' 筆：對 ' + stats.win + ' 筆、錯 ' + stats.loss + ' 筆，合計 ' + fS(stats.pnl) + ' USDT。');
    lines.push('每一筆都寫進了團隊筆記，守則也照順序更新過。');
  } else lines.push('這段時間沒有值得做的訊號，團隊沒有出手。');
  if (from > TS.gapFromOrig) lines.push('超過 3 天的部分太舊，沒有補。');
  if (stats.miss) lines.push('有 ' + stats.miss + ' 個幣讀不到資料，這些幣沒有補。');
  S.queue.push({ kind: 'info', title: '你不在的時候', lines });
  flushQueue();
  refreshTeam();
  if (S.view === 'trade') { tickUI(); drawChart(); }
}
function runReplay(data, from, end) {
  const st = { opened: 0, closed: 0, win: 0, loss: 0, pnl: 0, miss: 0 };
  const btc = data.BTC || [];
  const dirAt = L.regimeSeries(btc);
  const cs = {};
  for (const sym of Object.keys(data)) {
    const k = data[sym];
    if (!Array.isArray(k) || k.length < 80) { if (sym !== 'err') st.miss++; continue; }
    const idx = new Map();
    k.forEach((x, i) => idx.set(x.t, i));
    cs[sym] = { k, ind: Team.prepare(k), idx };
  }
  const saved = S.prices;
  S.prices = Object.assign({}, saved);
  for (const sym of Object.keys(cs)) {
    const c = cs[sym];
    let last = null;
    for (const x of c.k) { if (x.t < from) last = x; else break; }
    if (last) S.prices[sym] = last.c;
  }
  TS.rpOpen = new Set(teamPos().map((p) => p.id));
  TS.sampleCut = from;
  learnRebuild(true);
  const tradesBefore = new Set(state.trades.map((t) => t.id));
  const sigKeep = TS.signals;
  TS.signals = [];
  try {
    for (let t = Math.floor(from / BAR5) * BAR5; t + BAR5 <= end; t += BAR5) {
      CLK = t + BAR5;
      const dir = dirAt(t);
      const bars = [];
      for (const sym of Object.keys(cs)) {
        const c = cs[sym];
        const i = c.idx.get(t);
        if (i == null) continue;
        bars.push([sym, c, i]);
        const k = c.k[i];
        scopedCandle(sym, k, TS.rpOpen);
        S.prices[sym] = k.c;
        for (const p of teamPos().filter((x) => x.sym === sym && TS.rpOpen.has(x.id))) {
          if (p.until && CLK >= p.until) { E.closePosition(state, p.id, k.c, CLK, 'time', S.prices); continue; }
          const ext = p.side === 'long' ? k.h : k.l;
          if (!p.be && p.r0 > 0 && E.posPnl(p, ext) >= p.r0) {
            const be = roundP(breakeven(p));
            if ((p.side === 'long' ? be < k.c : be > k.c) && E.setStops(state, p.id, be, p.tp, k.c, true).ok) p.be = true;
          }
          if (i >= Team.TRAIL_N) { p.fav = Math.max(p.fav || 0, p.side === 'long' ? k.h - p.entry : p.entry - k.l); trailPos(p, k.c, c.k.slice(i - Team.TRAIL_N + 1, i + 1)); }
        }
      }
      const bc = cs.BTC;
      if (bc) { const bi = bc.idx.get(t), bj = bc.idx.get(t - 3 * BAR5); TS.btcMove = bi != null && bj != null ? Math.abs(bc.k[bi].c / bc.k[bj].c - 1) : 0; }
      delegExpire(CLK, false);
      learnFromClosed();
      for (const [sym, c, i] of bars) {
        if (i < 70) continue;
        for (const s of Team.detect(c.ind, c.k, i)) {
          const pl = Team.plan(c.ind, c.k, i, s.side, s.stopRef);
          const f = L.features(c.ind, c.k, i, s.side, dir, s.volx, extAt(sym, c.k[i].t), pl);
          const rt = TS.rt[sym] || Team.ratios(c.k.slice(Math.max(0, i - 2000), i + 1));
          if (!TS.rt[sym]) TS.rt[sym] = rt;
          const rp = Team.replay(rt, pl, s.side, { runs: 400 });
          addSignal(sym, Object.assign(s, { plan: pl, barT: c.k[i].t, f, replay: rp }), c.k);
        }
      }
      TS.signals = TS.signals.filter((x) => CLK - x.barT < 30 * 60000);
    }
  } finally {
    CLK = null;
    TS.sampleCut = null;
    const now = Date.now();
    TS.signals = sigKeep.concat(TS.signals).filter((x) => now - x.barT < 30 * 60000);
    for (const sym of Object.keys(saved)) if (saved[sym] > 0) S.prices[sym] = saved[sym];
    const px = S.prices;
    S.prices = saved;
    for (const sym of Object.keys(px)) if (!(saved[sym] > 0)) saved[sym] = px[sym];
    TS.rpOpen = null;
  }
  learnFromClosed();
  state.trades.sort((a, b) => a.t1 - b.t1);
  TS.journal.sort((a, b) => a.t0 - b.t0);
  for (const t of state.trades) {
    if (tradesBefore.has(t.id) || t.owner !== 'team') continue;
    st.closed++; st.pnl += t.pnl;
    if (t.pnl > 0) st.win++; else st.loss++;
  }
  st.opened = TS.journal.filter((j) => j.t0 >= from && j.t0 < end && j.src !== 'deleg').length + TS.journal.filter((j) => j.t0 >= from && j.t0 < end && j.src === 'deleg').length;
  return st;
}
