const Team = (() => {
  const TYPES = {
    breakout: { name: '突破', reason: 'breakout', desc: '收盤突破前 20 根高點（跌破低點），而且成交量放大' },
    pullback: { name: '拉回', reason: 'trend', desc: '趨勢中拉回 20 均線，收盤重新站回趨勢方向' },
    reversal: { name: '反彈', reason: 'dip', desc: '超賣（超買）後第一根轉向的 K 線' },
    fib: { name: '0.618 回檔', reason: 'support', desc: '一段漲勢（跌勢）回檔到黃金比例 0.5～0.786 之間，收盤重新站回 0.618 之上（之下），停損放在 0.786 外面' },
    grail: { name: '聖杯', reason: 'trend', desc: 'Linda Raschke 的聖杯：ADX 曾在 30 以上的強趨勢中，第一次拉回碰到 20 均線，收盤重新站回趨勢方向' }
  };
  const TREND = { breakout: 1, pullback: 1, grail: 1 };
  const TGT = 4;
  const BE_R = 1;
  const TRAIL_R = 1.5;
  const TRAIL_N = 6;
  const KEYS = [];
  for (const t of Object.keys(TYPES)) for (const s of ['long', 'short']) KEYS.push(t + ':' + s);
  const HOLD = 48;
  const FEE = 0.001;

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function ema(v, n) {
    const out = new Array(v.length).fill(null);
    const k = 2 / (n + 1);
    let e = null;
    for (let i = 0; i < v.length; i++) {
      e = e == null ? v[i] : v[i] * k + e * (1 - k);
      if (i >= n - 1) out[i] = e;
    }
    return out;
  }

  function rsi(c, n) {
    const out = new Array(c.length).fill(null);
    let g = 0, l = 0;
    for (let i = 1; i < c.length; i++) {
      const d = c[i] - c[i - 1];
      const up = d > 0 ? d : 0, dn = d < 0 ? -d : 0;
      if (i <= n) {
        g += up; l += dn;
        if (i === n) { g /= n; l /= n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
      } else {
        g = (g * (n - 1) + up) / n;
        l = (l * (n - 1) + dn) / n;
        out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
      }
    }
    return out;
  }

  function atr(k, n) {
    const out = new Array(k.length).fill(null);
    let a = 0;
    for (let i = 1; i < k.length; i++) {
      const tr = Math.max(k[i].h - k[i].l, Math.abs(k[i].h - k[i - 1].c), Math.abs(k[i].l - k[i - 1].c));
      if (i <= n) { a += tr; if (i === n) { a /= n; out[i] = a; } }
      else { a = (a * (n - 1) + tr) / n; out[i] = a; }
    }
    return out;
  }

  function adx(k, n) {
    const len = k.length;
    const out = { adx: new Array(len).fill(null), pdi: new Array(len).fill(null), mdi: new Array(len).fill(null) };
    let tr = 0, pd = 0, md = 0, ax = 0, cnt = 0;
    for (let i = 1; i < len; i++) {
      const up = k[i].h - k[i - 1].h, dn = k[i - 1].l - k[i].l;
      const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
      const t = Math.max(k[i].h - k[i].l, Math.abs(k[i].h - k[i - 1].c), Math.abs(k[i].l - k[i - 1].c));
      if (i <= n) { tr += t; pd += p; md += m; if (i < n) continue; }
      else { tr = tr - tr / n + t; pd = pd - pd / n + p; md = md - md / n + m; }
      const pdi = tr > 0 ? (100 * pd) / tr : 0, mdi = tr > 0 ? (100 * md) / tr : 0;
      const dx = pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
      out.pdi[i] = pdi; out.mdi[i] = mdi;
      cnt++;
      if (cnt < n) { ax += dx; continue; }
      ax = cnt === n ? (ax + dx) / n : (ax * (n - 1) + dx) / n;
      out.adx[i] = ax;
    }
    return out;
  }

  function prepare(k) {
    const n = k.length;
    const c = k.map((x) => x.c);
    const dm = adx(k, 14);
    const ind = { c, e20: ema(c, 20), e50: ema(c, 50), e288: ema(c, 288), rsi: rsi(c, 14), atr: atr(k, 14), adx: dm.adx, pdi: dm.pdi, mdi: dm.mdi, hh: new Array(n).fill(null), ll: new Array(n).fill(null), vavg: new Array(n).fill(null) };
    for (let i = 20; i < n; i++) {
      let hh = -Infinity, ll = Infinity, vs = 0;
      for (let j = i - 20; j < i; j++) { if (k[j].h > hh) hh = k[j].h; if (k[j].l < ll) ll = k[j].l; vs += k[j].v; }
      ind.hh[i] = hh; ind.ll[i] = ll; ind.vavg[i] = vs / 20;
    }
    return ind;
  }

  function swing(k, i, look) {
    let hi = -Infinity, lo = Infinity, hiI = -1, loI = -1;
    for (let j = Math.max(0, i - look); j < i - 1; j++) {
      if (k[j].h > hi) { hi = k[j].h; hiI = j; }
      if (k[j].l < lo) { lo = k[j].l; loI = j; }
    }
    return { hi, lo, hiI, loI };
  }

  function fibLevels(hi, lo, up) {
    const R = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    return R.map((r) => ({ r, p: up ? hi - r * (hi - lo) : lo + r * (hi - lo) }));
  }

  function fibAt(ind, k, i) {
    const a = ind.atr[i];
    if (a == null) return null;
    const w = swing(k, i, 60);
    if (w.hiI < 0 || w.loI < 0) return null;
    const rng = w.hi - w.lo;
    if (!(rng >= 4 * a)) return null;
    const b = k[i];
    if (w.loI < w.hiI && i - w.hiI >= 3) {
      const z5 = w.hi - 0.5 * rng, z618 = w.hi - 0.618 * rng, z786 = w.hi - 0.786 * rng;
      let lowest = Infinity;
      for (let j = w.hiI + 1; j <= i; j++) lowest = Math.min(lowest, k[j].l);
      if (lowest >= z786 - 0.1 * a && b.l <= z5 && b.l >= z786 - 0.1 * a && b.c > z618 && b.c > b.o) return { side: 'long', stopRef: z786, hi: w.hi, lo: w.lo };
    }
    if (w.hiI < w.loI && i - w.loI >= 3) {
      const z5 = w.lo + 0.5 * rng, z618 = w.lo + 0.618 * rng, z786 = w.lo + 0.786 * rng;
      let highest = -Infinity;
      for (let j = w.loI + 1; j <= i; j++) highest = Math.max(highest, k[j].h);
      if (highest <= z786 + 0.1 * a && b.h >= z5 && b.h <= z786 + 0.1 * a && b.c < z618 && b.c < b.o) return { side: 'short', stopRef: z786, hi: w.hi, lo: w.lo };
    }
    return null;
  }

  function detect(ind, k, i) {
    if (i < 60 || i >= k.length) return [];
    const b = k[i];
    const { e20, e50, rsi: r, hh, ll, vavg } = ind;
    if ([e20[i], e50[i], e50[i - 10], r[i], r[i - 1], hh[i], vavg[i], ind.atr[i]].some((x) => x == null)) return [];
    const green = b.c > b.o, red = b.c < b.o;
    const volx = vavg[i] > 0 ? b.v / vavg[i] : 0;
    const out = [];
    const longs = [], shorts = [];
    if (b.c > hh[i] && volx >= 1.8 && b.c > e50[i] && green) longs.push('breakout');
    if (b.c < ll[i] && volx >= 1.8 && b.c < e50[i] && red) shorts.push('breakout');
    const ax = ind.adx[i];
    let axHi = 0;
    for (let j = Math.max(0, i - 6); j <= i; j++) if (ind.adx[j] != null && ind.adx[j] > axHi) axHi = ind.adx[j];
    const grailOk = ax != null && axHi >= 30 && ax >= 25 && i > 0 && e20[i - 1] != null;
    if (grailOk && ind.pdi[i] > ind.mdi[i] && k[i - 1].l > e20[i - 1] && b.l <= e20[i] && b.c > e20[i] && green) longs.push('grail');
    if (grailOk && ind.mdi[i] > ind.pdi[i] && k[i - 1].h < e20[i - 1] && b.h >= e20[i] && b.c < e20[i] && red) shorts.push('grail');
    if (e20[i] > e50[i] && e50[i] > e50[i - 10] && b.l <= e20[i] && b.c > e20[i] && green && r[i] >= 40 && r[i] <= 65) longs.push('pullback');
    if (e20[i] < e50[i] && e50[i] < e50[i - 10] && b.h >= e20[i] && b.c < e20[i] && red && r[i] >= 35 && r[i] <= 60) shorts.push('pullback');
    if (r[i - 1] < 25 && r[i] > r[i - 1] && green) longs.push('reversal');
    if (r[i - 1] > 75 && r[i] < r[i - 1] && red) shorts.push('reversal');
    const chop = ax == null || ax < 20;
    if (chop) { for (const L of [longs, shorts]) for (let j = L.length - 1; j >= 0; j--) if (TREND[L[j]]) L.splice(j, 1); }
    const f = fibAt(ind, k, i);
    const fl = f && f.side === 'long', fs = f && f.side === 'short';
    if (fl) out.push({ type: 'fib', side: 'long', volx, stopRef: f.stopRef });
    else if (longs.length) out.push({ type: longs[0], side: 'long', volx });
    if (fs) out.push({ type: 'fib', side: 'short', volx, stopRef: f.stopRef });
    else if (shorts.length) out.push({ type: shorts[0], side: 'short', volx });
    return out;
  }

  function plan(ind, k, i, side, stopRef) {
    const entry = k[i].c;
    const a = ind.atr[i];
    const long = side === 'long';
    let sw = long ? Infinity : -Infinity;
    if (stopRef != null) sw = stopRef;
    else for (let j = Math.max(0, i - 2); j <= i; j++) sw = long ? Math.min(sw, k[j].l) : Math.max(sw, k[j].h);
    const raw = long ? entry - sw + 0.25 * a : sw - entry + 0.25 * a;
    const dist = Math.max(entry * 0.005, Math.min(3 * a, Math.max(0.8 * a, raw)));
    return { entry, dist, stop: long ? entry - dist : entry + dist, target: long ? entry + TGT * dist : entry - TGT * dist };
  }

  function rCost(p) {
    return (FEE * 2 * p.entry) / p.dist;
  }

  function beStop(p, long) {
    const c = FEE * 2 * p.entry;
    return long ? p.entry + c : p.entry - c;
  }

  function trailStop(p, long, stop, fav, lows) {
    let s = stop;
    if (fav >= BE_R * p.dist) { const be = beStop(p, long); s = long ? Math.max(s, be) : Math.min(s, be); }
    if (fav >= TRAIL_R * p.dist && lows.length >= TRAIL_N) {
      const ex = long ? Math.min(...lows.slice(-TRAIL_N)) : Math.max(...lows.slice(-TRAIL_N));
      s = long ? Math.max(s, ex) : Math.min(s, ex);
    }
    return s;
  }

  function simulate(k, i, p, side, partial) {
    const long = side === 'long';
    const end = i + HOLD;
    if (end >= k.length && !partial) return null;
    let stop = p.stop, fav = 0;
    const ext = [];
    for (let j = Math.max(0, i - TRAIL_N + 1); j <= i; j++) ext.push(long ? k[j].l : k[j].h);
    for (let j = i + 1; j <= Math.min(end, k.length - 1); j++) {
      const b = k[j];
      const hitS = long ? b.l <= stop : b.h >= stop;
      const hitT = long ? b.h >= p.target : b.l <= p.target;
      if (hitS) {
        const r = ((stop - p.entry) / p.dist) * (long ? 1 : -1) - rCost(p);
        return { r, bars: j - i, how: stop === p.stop ? 'stop' : r > 0.05 ? 'trail' : 'be' };
      }
      if (hitT) return { r: Math.abs(p.target - p.entry) / p.dist - rCost(p), bars: j - i, how: 'target' };
      fav = Math.max(fav, long ? b.h - p.entry : p.entry - b.l);
      ext.push(long ? b.l : b.h);
      stop = trailStop(p, long, stop, fav, ext);
    }
    if (end >= k.length) return null;
    const exit = k[end].c;
    return { r: ((exit - p.entry) / p.dist) * (long ? 1 : -1) - rCost(p), bars: HOLD, how: 'time' };
  }

  function backtest(k) {
    const out = {};
    for (const key of KEYS) out[key] = [];
    if (!k || k.length < 120) return out;
    const ind = prepare(k);
    const busy = {};
    for (let i = 60; i < k.length - 1; i++) {
      for (const s of detect(ind, k, i)) {
        const key = s.type + ':' + s.side;
        if (busy[key] && i <= busy[key]) continue;
        const p = plan(ind, k, i, s.side, s.stopRef);
        const res = simulate(k, i, p, s.side);
        if (!res) continue;
        out[key].push(res.r);
        busy[key] = i + res.bars;
      }
    }
    return out;
  }

  function stats(rs) {
    const n = rs.length;
    const st = { n, wins: 0, wr: 0, avgR: 0, pf: null, maxLoss: 0 };
    if (!n) return st;
    let gw = 0, gl = 0, run = 0, sum = 0;
    for (const r of rs) {
      sum += r;
      if (r > 0) { st.wins++; gw += r; run = 0; }
      else { gl -= r; run++; if (run > st.maxLoss) st.maxLoss = run; }
    }
    st.wr = st.wins / n;
    st.avgR = sum / n;
    st.pf = gl > 0 ? gw / gl : gw > 0 ? Infinity : null;
    return st;
  }

  function monteCarlo(rs, opts) {
    const o = Object.assign({ runs: 10000, len: 50, seed: 19 }, opts || {});
    if (!rs.length) return null;
    const rand = rng(o.seed);
    const totals = new Float64Array(o.runs);
    const dds = new Float64Array(o.runs);
    let losers = 0;
    for (let r = 0; r < o.runs; r++) {
      let eq = 0, peak = 0, dd = 0;
      for (let j = 0; j < o.len; j++) {
        eq += rs[Math.floor(rand() * rs.length)];
        if (eq > peak) peak = eq;
        if (peak - eq > dd) dd = peak - eq;
      }
      totals[r] = eq;
      dds[r] = dd;
      if (eq < 0) losers++;
    }
    totals.sort();
    dds.sort();
    const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
    return { runs: o.runs, len: o.len, p5: q(totals, 0.05), p50: q(totals, 0.5), p95: q(totals, 0.95), pWin: 1 - losers / o.runs, ddMed: q(dds, 0.5), dd95: q(dds, 0.95) };
  }

  function grade(st, mc) {
    if (!mc) return 'C';
    if (st.n >= 20 && st.avgR >= 0.15 && mc.pWin >= 0.8) return 'A';
    if (st.n >= 12 && st.avgR >= 0.05 && mc.pWin >= 0.65) return 'B';
    return 'C';
  }

  function evaluate(series, opts) {
    const pooled = {};
    const per = {};
    for (const key of KEYS) pooled[key] = [];
    for (const sym of Object.keys(series)) {
      const bt = backtest(series[sym]);
      per[sym] = {};
      for (const key of KEYS) { pooled[key] = pooled[key].concat(bt[key]); per[sym][key] = bt[key].length; }
    }
    const res = {};
    for (const key of KEYS) {
      const [type, side] = key.split(':');
      const st = stats(pooled[key]);
      const mc = monteCarlo(pooled[key], opts);
      res[key] = { key, type, side, st, mc, grade: grade(st, mc), per: Object.fromEntries(Object.keys(per).map((s) => [s, per[s][key]])) };
    }
    return res;
  }

  function ratios(k) {
    const out = [];
    for (let i = 1; i < k.length; i++) {
      const p = k[i - 1].c;
      if (!(p > 0)) continue;
      out.push([k[i].h / p, k[i].l / p, k[i].c / p]);
    }
    return out;
  }

  function replay(rt, p, side, opts) {
    const o = Object.assign({ runs: 10000, bars: HOLD, block: 2, seed: 19 }, opts || {});
    if (!rt || rt.length < o.block + 1) return null;
    const rand = rng(o.seed);
    const long = side === 'long';
    let tgt = 0, stp = 0, none = 0;
    const finals = new Float64Array(o.runs);
    for (let r = 0; r < o.runs; r++) {
      let px = p.entry, done = false, step = 0, stop = p.stop, fav = 0;
      const ext = [];
      while (step < o.bars && !done) {
        const s = Math.floor(rand() * (rt.length - o.block + 1));
        for (let b = 0; b < o.block && step < o.bars; b++, step++) {
          const [h, l, c] = rt[s + b];
          const hi = px * h, lo = px * l;
          if (long ? lo <= stop : hi >= stop) { stp++; done = true; finals[r] = ((stop - p.entry) / p.dist) * (long ? 1 : -1); break; }
          if (long ? hi >= p.target : lo <= p.target) { tgt++; done = true; finals[r] = Math.abs(p.target - p.entry) / p.dist; break; }
          fav = Math.max(fav, long ? hi - p.entry : p.entry - lo);
          ext.push(long ? lo : hi);
          stop = trailStop(p, long, stop, fav, ext);
          px *= c;
        }
      }
      if (!done) { none++; finals[r] = ((px - p.entry) / p.dist) * (long ? 1 : -1); }
    }
    let sum = 0;
    for (let r = 0; r < o.runs; r++) sum += finals[r];
    const cost = rCost(p);
    return { runs: o.runs, pTarget: tgt / o.runs, pStop: stp / o.runs, pNone: none / o.runs, avgR: sum / o.runs - cost };
  }

  function regime(k) {
    if (!k || k.length < 60) return null;
    const ind = prepare(k);
    const n = k.length - 1;
    const c = ind.c[n];
    const back = Math.max(0, n - 24);
    const votes = [
      c > ind.e50[n] ? 1 : -1,
      ind.e20[n] > ind.e50[n] ? 1 : -1,
      ind.e50[n] > ind.e50[n - 12] ? 1 : -1,
      c > ind.c[back] ? 1 : -1
    ];
    const up = votes.filter((v) => v > 0).length;
    const down = 4 - up;
    const dir = up >= 3 ? 'up' : down >= 3 ? 'down' : 'flat';
    return { dir, up, down, chg: c / ind.c[back] - 1, vol: ind.atr[n] / c, price: c };
  }

  function latest(k, dir, back, extFn) {
    if (!k || k.length < 70) return [];
    const ind = prepare(k);
    const out = [];
    for (let b = Math.max(1, back || 1); b >= 1; b--) {
      const i = k.length - 1 - b;
      if (i < 60) continue;
      for (const s of detect(ind, k, i)) { const pl = plan(ind, k, i, s.side, s.stopRef); out.push(Object.assign(s, { plan: pl, barT: k[i].t, rsi: ind.rsi[i], f: typeof TeamLearn !== 'undefined' ? TeamLearn.features(ind, k, i, s.side, dir, s.volx, extFn ? extFn(k[i].t) : null, pl) : null })); }
    }
    return out;
  }

  function roomR(k, i, side, dist) {
    if (!(dist > 0) || i < 20) return null;
    const long = side === 'long';
    const px = k[i].c;
    const W = 6;
    let best = null;
    for (let j = Math.max(W, i - 288); j <= i - W; j++) {
      const v = long ? k[j].h : k[j].l;
      if (long ? v <= px : v >= px) continue;
      let piv = true;
      for (let q = j - W; q <= j + W && piv; q++) if (q !== j && (long ? k[q].h > v : k[q].l < v)) piv = false;
      if (!piv) continue;
      const d = Math.abs(v - px);
      if (best == null || d < best) best = d;
    }
    return best == null ? Infinity : best / dist;
  }

  function riskSize(eq, cash, p, riskPct, capPct) {
    const distPct = p.dist / p.entry;
    let amt = (eq * riskPct) / distPct;
    amt = Math.min(amt, eq * capPct, cash / (1 + 0.001));
    return Math.floor(amt * 100) / 100;
  }

  return { TREND, TGT, BE_R, TRAIL_R, TRAIL_N, beStop, trailStop, adx, swing, fibLevels, fibAt, TYPES, KEYS, HOLD, FEE, rng, ema, rsi, atr, prepare, detect, plan, simulate, backtest, stats, monteCarlo, grade, evaluate, ratios, replay, regime, latest, riskSize, rCost, roomR };
})();
if (typeof module !== 'undefined') module.exports = Team;
