const Engine = (() => {
  const ALL = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'SUI', 'ADA', 'TRX', 'LINK'];
  const SYM = /^[A-Z0-9]{2,15}$/;
  const RANKS = [
    null,
    { n: 1, name: '新手', cap: 1000, maxLev: 1, syms: ['BTC', 'ETH'] },
    { n: 2, name: '學徒', cap: 3000, maxLev: 1, syms: ['BTC', 'ETH'] },
    { n: 3, name: '交易員', cap: 10000, maxLev: 1, syms: ALL },
    { n: 4, name: '進階', cap: 30000, maxLev: 3, syms: ALL },
    { n: 5, name: '專業', cap: 100000, maxLev: 10, syms: ALL }
  ];
  const FEE_SPOT = 0.001;
  const FEE_LEV = 0.0005;
  const MMR = 0.005;
  const FUND_8H = 0.0001;
  const MIN_AMOUNT = 10;
  const MAX_LEV = 10;
  const REASONS = {
    trend: '順著趨勢',
    dip: '跌深反彈',
    breakout: '突破關鍵價',
    support: '支撐或壓力',
    news: '看到消息',
    gut: '憑感覺'
  };

  const fin = (x) => typeof x === 'number' && isFinite(x);
  const pos = (x) => fin(x) && x > 0;

  function newState(now) {
    return {
      v: 1,
      rank: 1,
      cash: 1000,
      positions: [],
      orders: [],
      trades: [],
      lessons: {},
      flags: {},
      rules: null,
      peak: 1000,
      maxDD: 0,
      eqHist: [{ t: now, e: 1000 }],
      nextId: 1,
      rankAt: 0,
      rankLog: [{ t: now, rank: 1 }],
      graduated: false,
      refills: 0,
      lastSeen: now,
      lastPrices: {},
      settings: { twColors: false, ma: false, sym: 'BTC', interval: '1m', amtPct: 0.1, lev: 1, gestured: false, teamPct: 0.25, judge: 'me', statsView: 'all', ordType: 'market', slMode: 'auto', tpMode: 'r2', ema: false, boll: false, sub: 'none', ptab: 'pos' },
      favs: [],
      alerts: [],
      coinCache: null
    };
  }

  function isLev(p) {
    return p.lev > 1 || p.side === 'short';
  }

  function feeRate(p) {
    return isLev(p) ? FEE_LEV : FEE_SPOT;
  }

  function liqPrice(side, entry, lev) {
    if (side === 'long') {
      if (lev <= 1) return 0;
      return entry * (1 - 1 / lev + MMR);
    }
    return entry * (1 + 1 / lev - MMR);
  }

  function posPnl(p, price) {
    return (price - p.entry) * p.qty * (p.side === 'long' ? 1 : -1);
  }

  function posValue(p, price) {
    return Math.max(0, p.margin + posPnl(p, price));
  }

  function equity(s, prices) {
    let e = s.cash;
    for (const o of s.orders) e += o.reserve;
    for (const p of s.positions) {
      const px = pos(prices[p.sym]) ? prices[p.sym] : p.entry;
      e += posValue(p, px);
    }
    return e;
  }

  function touchDD(s, prices) {
    const e = equity(s, prices);
    if (e > s.peak) s.peak = e;
    if (s.peak > 0) {
      const dd = (s.peak - e) / s.peak;
      if (dd > s.maxDD) s.maxDD = dd;
    }
    return e;
  }

  function validateStops(side, ref, sl, tp, lev) {
    if (sl != null) {
      if (!pos(sl)) return '停損價要是大於 0 的數字';
      if (side === 'long' && sl >= ref) return '買進的停損價要低於進場價';
      if (side === 'short' && sl <= ref) return '做空的停損價要高於進場價';
      const liq = liqPrice(side, ref, lev);
      if (side === 'long' && liq > 0 && sl <= liq) return '停損價比強制平倉價還遠，等於沒設。請設得更靠近進場價';
      if (side === 'short' && sl >= liq) return '停損價比強制平倉價還遠，等於沒設。請設得更靠近進場價';
    }
    if (tp != null) {
      if (!pos(tp)) return '停利價要是大於 0 的數字';
      if (side === 'long' && tp <= ref) return '買進的停利價要高於進場價';
      if (side === 'short' && tp >= ref) return '做空的停利價要低於進場價';
    }
    return null;
  }

  function canShort() {
    return true;
  }

  function checkOrderInput(s, o) {
    if (typeof o.sym !== 'string' || !SYM.test(o.sym)) return '幣種不正確';
    if (o.side !== 'long' && o.side !== 'short') return '方向不正確';
    if (!Number.isInteger(o.lev) || o.lev < 1 || o.lev > MAX_LEV) return '槓桿倍數要在 1～' + MAX_LEV + ' 倍之間';
    if (!pos(o.amount)) return '請輸入金額';
    if (o.amount < MIN_AMOUNT) return '最少要下 ' + MIN_AMOUNT + ' USDT';
    if (o.reason != null && !REASONS[o.reason]) return '理由不正確';
    return null;
  }

  function costOf(o) {
    const rate = o.lev > 1 || o.side === 'short' ? FEE_LEV : FEE_SPOT;
    return o.amount + o.amount * o.lev * rate;
  }

  function maxAmount(cash, lev, side) {
    const rate = lev > 1 || side === 'short' ? FEE_LEV : FEE_SPOT;
    return Math.floor((cash / (1 + lev * rate)) * 100) / 100;
  }

  function openPosition(s, o, prices) {
    const err = checkOrderInput(s, o);
    if (err) return { ok: false, err };
    if (!pos(o.price)) return { ok: false, err: '目前沒有報價，請稍後再試' };
    const sl = o.sl == null ? null : o.sl;
    const tp = o.tp == null ? null : o.tp;
    const e2 = validateStops(o.side, o.price, sl, tp, o.lev);
    if (e2) return { ok: false, err: e2 };
    const cost = costOf(o);
    if (cost > s.cash + 1e-9) return { ok: false, err: '可用資金不夠（含手續費需要 ' + cost.toFixed(2) + ' USDT）' };
    const eq0 = equity(s, prices) + (o.fromReserve || 0);
    const notional = o.amount * o.lev;
    const fee = cost - o.amount;
    const qty = notional / o.price;
    s.cash -= cost;
    const p = {
      id: s.nextId++,
      sym: o.sym,
      side: o.side,
      lev: o.lev,
      qty,
      entry: o.price,
      margin: o.amount,
      feeOpen: fee,
      sl,
      tp,
      reason: o.reason || null,
      t0: o.now,
      eq0,
      sizePct: o.amount / eq0,
      riskPct: sl != null ? (Math.abs(o.price - sl) * qty) / eq0 : null,
      hadSL: sl != null,
      liq: liqPrice(o.side, o.price, o.lev),
      r0: sl != null ? Math.abs(o.price - sl) * qty : null,
      ctx: o.ctx || null,
      owner: o.owner === 'team' ? 'team' : 'me',
      afterLoss: o.owner === 'team' ? null : recentLoss(s, o.now)
    };
    if (o.src) p.src = String(o.src).slice(0, 12);
    s.positions.push(p);
    if (p.owner === 'me') markOpenFlags(s, p);
    return { ok: true, pos: p };
  }

  const OWN = (t) => t.owner !== 'team';
  function mine(s) {
    return s.trades.filter(OWN);
  }

  function recentLoss(s, now) {
    const M = mine(s);
    const t = M[M.length - 1];
    if (!t || t.pnl >= 0) return null;
    if (now - t.t1 > 5 * 60000) return null;
    return { sizePct: t.sizePct };
  }

  function markOpenFlags(s, p) {
    s.flags.opened = true;
    if (p.sl != null) s.flags.slSet = true;
    if (p.sl != null && p.tp != null) {
      const rr = Math.abs(p.tp - p.entry) / Math.abs(p.entry - p.sl);
      if (rr >= 1.5 - 1e-9) s.flags.rr = true;
    }
    if (p.riskPct != null && p.riskPct <= 0.02 + 1e-9) s.flags.risk2 = true;
  }

  function setReason(s, id, reason) {
    if (!REASONS[reason]) return { ok: false, err: '理由不正確' };
    const t = s.trades.find((x) => x.id === id);
    if (!t) return { ok: false, err: '找不到這筆交易' };
    t.reason = reason;
    if (reason === 'trend' && t.ctx && t.ctx.above != null && ((t.side === 'long' && t.ctx.above) || (t.side === 'short' && !t.ctx.above))) s.flags.trendTrade = true;
    return { ok: true };
  }

  function modifyOrder(s, id, limit, cur) {
    const o = s.orders.find((x) => x.id === id);
    if (!o) return { ok: false, err: '找不到這張掛單' };
    if (!pos(limit) || !pos(cur)) return { ok: false, err: '價格不正確' };
    if (o.side === 'long' && limit >= cur) return { ok: false, err: '買漲的掛單價要低於現價' };
    if (o.side === 'short' && limit <= cur) return { ok: false, err: '買跌的掛單價要高於現價' };
    if (o.sl != null || o.tp != null) {
      const e2 = validateStops(o.side, limit, o.sl, o.tp, o.lev);
      if (e2) return { ok: false, err: e2 };
    }
    o.limit = limit;
    return { ok: true };
  }

  function createOrder(s, o) {
    const err = checkOrderInput(s, o);
    if (err) return { ok: false, err };
    if (!pos(o.limit)) return { ok: false, err: '請輸入限價' };
    if (!pos(o.cur)) return { ok: false, err: '目前沒有報價，請稍後再試' };
    if (o.side === 'long' && o.limit >= o.cur) return { ok: false, err: '買進的限價要低於現價。想馬上成交請用市價' };
    if (o.side === 'short' && o.limit <= o.cur) return { ok: false, err: '做空的限價要高於現價。想馬上成交請用市價' };
    const sl = o.sl == null ? null : o.sl;
    const tp = o.tp == null ? null : o.tp;
    const e2 = validateStops(o.side, o.limit, sl, tp, o.lev);
    if (e2) return { ok: false, err: e2 };
    const cost = costOf(o);
    if (cost > s.cash + 1e-9) return { ok: false, err: '可用資金不夠（含手續費需要 ' + cost.toFixed(2) + ' USDT）' };
    s.cash -= cost;
    const ord = {
      id: s.nextId++,
      sym: o.sym,
      side: o.side,
      lev: o.lev,
      amount: o.amount,
      limit: o.limit,
      sl,
      tp,
      reason: o.reason || null,
      t: o.now,
      reserve: cost,
      ctx: o.ctx || null,
      owner: o.owner === 'team' ? 'team' : 'me'
    };
    s.orders.push(ord);
    s.flags.limitPlaced = true;
    return { ok: true, order: ord };
  }

  function cancelOrder(s, id) {
    const i = s.orders.findIndex((x) => x.id === id);
    if (i < 0) return { ok: false, err: '找不到這張掛單' };
    s.cash += s.orders[i].reserve;
    s.orders.splice(i, 1);
    return { ok: true };
  }

  function setStops(s, id, sl, tp, price, auto) {
    const p = s.positions.find((x) => x.id === id);
    if (!p) return { ok: false, err: '找不到這筆持倉' };
    if (!pos(price)) return { ok: false, err: '目前沒有報價，請稍後再試' };
    if (sl != null) {
      if (!pos(sl)) return { ok: false, err: '停損價要是大於 0 的數字' };
      if (p.side === 'long' && sl >= price) return { ok: false, err: '停損價要低於現價，不然會馬上觸發' };
      if (p.side === 'short' && sl <= price) return { ok: false, err: '停損價要高於現價，不然會馬上觸發' };
      if (p.side === 'long' && p.liq > 0 && sl <= p.liq) return { ok: false, err: '停損價比強制平倉價還遠，等於沒設' };
      if (p.side === 'short' && sl >= p.liq) return { ok: false, err: '停損價比強制平倉價還遠，等於沒設' };
    }
    if (tp != null) {
      if (!pos(tp)) return { ok: false, err: '停利價要是大於 0 的數字' };
      if (p.side === 'long' && tp <= price) return { ok: false, err: '停利價要高於現價，不然會馬上觸發' };
      if (p.side === 'short' && tp >= price) return { ok: false, err: '停利價要低於現價，不然會馬上觸發' };
    }
    p.sl = sl;
    p.tp = tp;
    if (sl != null) {
      if (p.r0 == null) p.r0 = Math.abs(p.entry - sl) * p.qty;
      if (!auto) p.hadSL = true;
      if (p.riskPct == null || !auto) {
        const adverse = p.side === 'long' ? p.entry - sl : sl - p.entry;
        p.riskPct = Math.max(0, adverse * p.qty) / p.eq0;
      }
    }
    if (auto) p.autoSL = sl != null;
    else if (p.owner !== 'team') markOpenFlags(s, p);
    return { ok: true };
  }

  function closePosition(s, id, price, now, why, prices) {
    const i = s.positions.findIndex((x) => x.id === id);
    if (i < 0) return { ok: false, err: '找不到這筆持倉' };
    if (!pos(price)) return { ok: false, err: '目前沒有報價，請稍後再試' };
    const p = s.positions[i];
    const rate = feeRate(p);
    const gross = posPnl(p, price);
    const hours = Math.max(0, now - p.t0) / 3600000;
    const funding = isLev(p) ? p.qty * p.entry * FUND_8H * (hours / 8) : 0;
    let feeClose = p.qty * price * rate;
    let payout = p.margin + gross - feeClose - funding;
    let reason = why;
    if (why === 'liq' || payout <= 0) {
      payout = 0;
      feeClose = 0;
      if (isLev(p)) reason = 'liq';
    }
    const pnl = payout - p.margin - p.feeOpen;
    s.cash += payout;
    s.positions.splice(i, 1);
    const t = {
      id: p.id,
      sym: p.sym,
      side: p.side,
      lev: p.lev,
      qty: p.qty,
      entry: p.entry,
      exit: price,
      margin: p.margin,
      gross,
      fees: p.feeOpen + feeClose,
      funding,
      pnl,
      ret: pnl / p.eq0,
      pct: pnl / p.margin,
      t0: p.t0,
      t1: now,
      why: reason,
      reason: p.reason,
      hadSL: p.hadSL || !!p.autoSL,
      r: p.r0 > 0 ? pnl / p.r0 : null,
      sl: p.sl,
      tp: p.tp,
      sizePct: p.sizePct,
      riskPct: p.riskPct,
      ctx: p.ctx,
      afterLoss: p.afterLoss,
      rank: s.rank,
      owner: p.owner === 'team' ? 'team' : 'me',
      src: p.src || null
    };
    s.trades.push(t);
    if (s.trades.length > 2000) {
      const cut = s.trades.length - 2000;
      s.trades.splice(0, cut);
      s.rankAt = Math.max(0, s.rankAt - cut);
    }
    s.flags.closed = true;
    const px = Object.assign({}, prices);
    px[p.sym] = price;
    const e = touchDD(s, px);
    s.eqHist.push({ t: now, e });
    if (s.eqHist.length > 400) s.eqHist.splice(0, s.eqHist.length - 400);
    return { ok: true, trade: t };
  }

  function processRange(s, sym, lo, hi, last, now, prices, exact) {
    const events = [];
    for (const o of s.orders.slice()) {
      if (o.sym !== sym) continue;
      const hit = o.side === 'long' ? lo <= o.limit : hi >= o.limit;
      if (!hit) continue;
      s.orders.splice(s.orders.indexOf(o), 1);
      s.cash += o.reserve;
      const saved = s.flags.limitPlaced;
      const r = openPosition(
        s,
        { sym, side: o.side, lev: o.lev, amount: o.amount, price: o.limit, sl: o.sl, tp: o.tp, reason: o.reason, now, ctx: o.ctx, owner: o.owner },
        prices
      );
      s.flags.limitPlaced = saved;
      if (r.ok) {
        r.pos.fresh = true;
        r.pos.fromLimit = true;
        events.push({ type: 'fill', pos: r.pos });
      }
    }
    for (const p of s.positions.slice()) {
      if (p.sym !== sym) continue;
      if (p.fresh) {
        delete p.fresh;
        if (!exact) continue;
      }
      const long = p.side === 'long';
      let px = null;
      let why = null;
      const liqHit = long ? p.liq > 0 && lo <= p.liq : hi >= p.liq;
      const slHit = p.sl != null && (long ? lo <= p.sl : hi >= p.sl);
      const tpHit = p.tp != null && (long ? hi >= p.tp : lo <= p.tp);
      if (slHit) {
        why = 'sl';
        px = exact ? last : p.sl;
      } else if (liqHit) {
        why = 'liq';
        px = p.liq;
      } else if (tpHit) {
        why = 'tp';
        px = p.tp;
      }
      if (!why) continue;
      const r = closePosition(s, p.id, px, now, why, prices);
      if (r.ok) events.push({ type: r.trade.why, trade: r.trade });
    }
    return events;
  }

  function onPrice(s, sym, price, now, prices) {
    if (!pos(price)) return [];
    return processRange(s, sym, price, price, price, now, prices, true);
  }

  function onCandle(s, sym, c, prices) {
    if (!c || !pos(c.l) || !pos(c.h) || c.h < c.l) return [];
    return processRange(s, sym, c.l, c.h, c.c, c.t, prices, false);
  }

  function lgamma(x) {
    const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += g[j] / ++y;
    return -tmp + Math.log((2.5066282746310005 * ser) / x);
  }

  function betacf(a, b, x) {
    const FPMIN = 1e-300;
    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let c = 1;
    let d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 200; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 3e-12) break;
    }
    return h;
  }

  function ibeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
    return 1 - (bt * betacf(b, a, 1 - x)) / b;
  }

  function tcdf(t, df) {
    const x = df / (df + t * t);
    const p = 0.5 * ibeta(df / 2, 0.5, x);
    return t > 0 ? 1 - p : p;
  }

  function statsFor(trades) {
    const n = trades.length;
    const out = { n, wins: 0, losses: 0, winRate: 0, avgWin: 0, avgLoss: 0, exp: 0, pf: null, pnl: 0, conf: null, slRate: 0, payoff: null };
    if (!n) return out;
    let sw = 0;
    let sl = 0;
    let gw = 0;
    let gl = 0;
    let sum = 0;
    let withSL = 0;
    for (const t of trades) {
      sum += t.ret;
      out.pnl += t.pnl;
      if (t.hadSL) withSL++;
      if (t.pnl > 0) {
        out.wins++;
        sw += t.ret;
        gw += t.pnl;
      } else {
        out.losses++;
        sl += t.ret;
        gl += -t.pnl;
      }
    }
    out.winRate = out.wins / n;
    out.avgWin = out.wins ? sw / out.wins : 0;
    out.avgLoss = out.losses ? sl / out.losses : 0;
    out.exp = sum / n;
    out.pf = gl > 0 ? gw / gl : gw > 0 ? Infinity : null;
    out.payoff = out.avgLoss < 0 && out.wins ? out.avgWin / -out.avgLoss : null;
    out.slRate = withSL / n;
    if (n >= 20) {
      let v = 0;
      for (const t of trades) v += (t.ret - out.exp) * (t.ret - out.exp);
      const sd = Math.sqrt(v / (n - 1));
      if (sd > 0) out.conf = tcdf(out.exp / (sd / Math.sqrt(n)), n - 1);
      else out.conf = out.exp > 0 ? 1 : 0;
    }
    return out;
  }

  function curveDD(trades) {
    let e = 1;
    let peak = 1;
    let dd = 0;
    for (const t of trades) {
      e *= 1 + t.ret;
      if (e > peak) peak = e;
      dd = Math.max(dd, (peak - e) / peak);
    }
    return dd;
  }

  function levTrades(s) {
    return mine(s).filter((t) => t.lev > 1 || t.side === 'short');
  }

  function lessonsDone(s, ids) {
    return ids.every((i) => s.lessons[i] && s.lessons[i].done);
  }

  function requirements(s) {
    const T = mine(s);
    const n = T.length;
    const req = [];
    const lessonReq = (ids) => {
      const done = ids.filter((i) => s.lessons[i] && s.lessons[i].done).length;
      req.push({ label: '完成第 ' + ids[0] + '～' + ids[ids.length - 1] + ' 關', done: done === ids.length, prog: done + ' / ' + ids.length });
    };
    if (s.rank === 1) {
      lessonReq([1, 2, 3, 4]);
    } else if (s.rank === 2) {
      lessonReq([5, 6, 7]);
      req.push({ label: '累積 20 筆交易', done: n >= 20, prog: Math.min(n, 20) + ' / 20' });
      const st = statsFor(T.slice(-20));
      req.push({ label: '最近 20 筆有九成設了停損', done: n >= 20 && st.slRate >= 0.9 - 1e-9, prog: n ? Math.round(st.slRate * 100) + '%' : '尚無紀錄' });
    } else if (s.rank === 3) {
      lessonReq([8, 9, 10, 11]);
      req.push({ label: '累積 40 筆交易', done: n >= 40, prog: Math.min(n, 40) + ' / 40' });
      const st = statsFor(T.slice(-40));
      req.push({ label: '最近 40 筆的期望值為正', done: n >= 40 && st.exp > 0, prog: n ? (st.exp >= 0 ? '+' : '') + (st.exp * 100).toFixed(2) + '%' : '尚無紀錄' });
    } else if (s.rank === 4) {
      req.push({ label: '累積 60 筆交易', done: n >= 60, prog: Math.min(n, 60) + ' / 60' });
      const st = statsFor(T.slice(-60));
      const ok = n >= 60 && st.exp > 0 && st.conf != null && st.conf >= 0.9;
      req.push({ label: '最近 60 筆穩定獲利，九成把握不是運氣', done: ok, prog: st.conf == null ? '樣本不夠' : Math.round(st.conf * 100) + '% 把握' });
      const lt = levTrades(s).filter((t) => t.t1 >= rankTime(s, 4));
      const noLiq = lt.slice(-10).every((t) => t.why !== 'liq');
      req.push({ label: '完成 10 筆槓桿或做空交易，而且沒有被強制平倉', done: lt.length >= 10 && noLiq, prog: Math.min(lt.length, 10) + ' / 10' });
    } else if (s.rank === 5) {
      const d12 = !!(s.lessons[12] && s.lessons[12].done);
      req.push({ label: '完成第 12 關', done: d12, prog: (d12 ? 1 : 0) + ' / 1' });
      const lt = levTrades(s).slice(-50);
      req.push({ label: '累積 50 筆槓桿或做空交易', done: lt.length >= 50, prog: lt.length + ' / 50' });
      const dd = curveDD(lt);
      req.push({ label: '這 50 筆的最大回撤低於 20%', done: lt.length >= 50 && dd < 0.2, prog: lt.length ? (dd * 100).toFixed(1) + '%' : '尚無紀錄' });
      const st = statsFor(lt);
      req.push({ label: '這 50 筆的期望值為正', done: lt.length >= 50 && st.exp > 0, prog: lt.length ? (st.exp >= 0 ? '+' : '') + (st.exp * 100).toFixed(2) + '%' : '尚無紀錄' });
    }
    return { list: req, ready: req.length > 0 && req.every((r) => r.done) };
  }

  function rankTime(s, rank) {
    for (let i = s.rankLog.length - 1; i >= 0; i--) if (s.rankLog[i].rank === rank) return s.rankLog[i].t;
    return 0;
  }

  function promote(s, now, prices) {
    const r = requirements(s);
    if (!r.ready) return { ok: false, err: '升級條件還沒全部達成' };
    if (s.rank >= 5) {
      if (s.graduated) return { ok: false, err: '你已經結業了' };
      s.graduated = true;
      return { ok: true, graduated: true };
    }
    const add = RANKS[s.rank + 1].cap - RANKS[s.rank].cap;
    s.rank += 1;
    s.cash += add;
    s.peak = equity(s, prices);
    s.rankAt = s.trades.length;
    s.rankLog.push({ t: now, rank: s.rank });
    s.eqHist.push({ t: now, e: s.peak });
    return { ok: true, rank: s.rank, added: add };
  }

  function checkDemotion() {
    return null;
  }

  function warnings(s, o, prices, now) {
    const w = [];
    const eq = equity(s, prices);
    const size = o.amount / eq;
    const lev = o.lev || 1;
    if (pos(o.amount) && lev === 1 && size > 0.5) w.push('這筆押了總資產的 ' + Math.round(size * 100) + '%。一次押超過一半，看錯一次就很傷。');
    if (pos(o.amount) && lev > 1 && size * lev > 1) w.push('這筆的實際部位是總資產的 ' + (size * lev).toFixed(1) + ' 倍，漲跌都會被放大。');
    if (o.sl == null) w.push('這筆沒有設停損。沒有停損，就沒有「最多賠多少」的上限。');
    if (o.sl != null && pos(o.amount) && pos(o.ref)) {
      const risk = ((Math.abs(o.ref - o.sl) / o.ref) * o.amount * lev) / eq;
      const lim = s.rules ? s.rules.risk : 0.02;
      if (risk > lim + 1e-9) w.push('停損觸發時會賠掉總資產的 ' + (risk * 100).toFixed(1) + '%，超過' + (s.rules ? '你自己訂的' : '建議的') + ' ' + (lim * 100).toFixed(0) + '%。');
    }
    if (s.rules && o.sl != null && o.tp != null && pos(o.ref)) {
      const rr = Math.abs(o.tp - o.ref) / Math.abs(o.ref - o.sl);
      if (rr < s.rules.rr - 1e-9) w.push('盈虧比只有 ' + rr.toFixed(1) + '，低於你自己訂的 ' + s.rules.rr + '。');
    }
    if (lev > 1 && pos(o.ref)) w.push('槓桿 ' + lev + ' 倍：價格反向約 ' + ((1 / lev - MMR) * 100).toFixed(1) + '% 就會被強制平倉，保證金全部賠光。');
    if (o.ctx && o.ctx.chg != null) {
      if (o.side === 'long' && o.ctx.chg > 0.015) w.push('價格剛在短時間內漲了 ' + (o.ctx.chg * 100).toFixed(1) + '%。現在買可能是追高。');
      if (o.side === 'short' && o.ctx.chg < -0.015) w.push('價格剛在短時間內跌了 ' + (-o.ctx.chg * 100).toFixed(1) + '%。現在做空可能是追空。');
    }
    const M = mine(s);
    const last = M[M.length - 1];
    if (last && last.pnl < 0 && now - last.t1 < 5 * 60000) w.push('你 5 分鐘內才剛賠一筆。先確認這筆不是為了把錢贏回來。');
    if (s.rules) {
      const day = new Date(now).toDateString();
      let lost = 0;
      for (const t of M) if (new Date(t.t1).toDateString() === day) lost += t.ret;
      if (lost <= -s.rules.day) w.push('今天已經賠了總資產的 ' + (-lost * 100).toFixed(1) + '%，到了你自己訂的單日上限。建議今天先休息。');
    }
    return w;
  }

  function fmtDur(ms) {
    const m = Math.round(ms / 60000);
    if (m < 1) return '不到 1 分鐘';
    if (m < 60) return m + ' 分鐘';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' 小時 ' + (m % 60) + ' 分';
    return Math.floor(h / 24) + ' 天 ' + (h % 24) + ' 小時';
  }

  function review(t) {
    const L = [];
    const long = t.side === 'long';
    const win = t.pnl > 0;
    const c = t.ctx;
    if (!t.reason) L.push('選一個進場理由，檢討會更具體。');
    else if (t.reason === 'trend') {
      if (c && c.above != null) {
        const aligned = long ? c.above : !c.above;
        L.push(aligned ? '進場時價格在均線' + (long ? '上方' : '下方') + '，方向和你說的「順著趨勢」一致。' : '你選了「順著趨勢」，但進場時價格在均線' + (long ? '下方' : '上方') + '，這其實是逆勢。');
      } else L.push('你的理由是順著趨勢。下次進場前，先確認價格在均線的哪一邊。');
    } else if (t.reason === 'dip') {
      if (c && c.chg != null) L.push(c.chg <= -0.01 ? '進場前確實跌了 ' + (-c.chg * 100).toFixed(1) + '%，符合「跌深」。但跌深不代表會馬上反彈。' : '進場前只跌了 ' + (Math.max(0, -c.chg) * 100).toFixed(1) + '%，不算跌深。這比較像是覺得便宜就買。');
    } else if (t.reason === 'breakout') {
      if (c && c.volR != null) L.push(c.volR >= 1.5 ? '突破時成交量是平均的 ' + c.volR.toFixed(1) + ' 倍，有量的突破比較可信。' : '突破時成交量只有平均的 ' + c.volR.toFixed(1) + ' 倍。沒有量的突破，很容易是假突破。');
    } else if (t.reason === 'support') {
      L.push('你的理由是支撐或壓力。' + (t.hadSL ? '停損放在關鍵價的另一邊，是正確的做法。' : '這種單最需要停損：關鍵價被穿過，理由就不成立了。'));
    } else if (t.reason === 'news') {
      L.push('你是看到消息才下單。消息傳到你這裡時，價格通常已經反應過了。');
    } else if (t.reason === 'gut') {
      L.push('這筆是憑感覺下的。憑感覺的單沒辦法檢討，賺了也沒辦法重複。');
    }
    if (t.why === 'sl') L.push(win ? '停損價已經移到獲利區，被掃到也還是賺。' : '停損把這筆虧損擋在計畫之內。賠錢，但做法正確。');
    else if (t.why === 'tp') L.push('照計畫在停利價出場。');
    else if (t.why === 'liq') L.push('這筆被強制平倉，保證金全部賠光。槓桿 ' + t.lev + ' 倍時，價格反向約 ' + ((1 / t.lev - MMR) * 100).toFixed(1) + '% 就會這樣。');
    else if (t.why === 'demote') L.push('因為降級，系統用當時的價格幫你平倉。');
    else if (win && t.tp != null) L.push('還沒到停利價你就手動出場了。如果常常這樣，會變成賺少賠多。');
    else if (!win && !t.hadSL && t.rank >= 2) L.push('這筆沒有停損，賠多少全看你什麼時候受不了。');
    else if (!win && t.sl != null) L.push('還沒碰到停損你就先出場了。如果是進場理由消失了，這樣做沒有問題。');
    if (t.lev === 1 && t.sizePct > 0.5) L.push('這筆押了總資產的 ' + Math.round(t.sizePct * 100) + '%，太重了。');
    if (t.riskPct != null && t.riskPct > 0.03) L.push('這筆的停損距離乘上部位，等於拿總資產的 ' + (t.riskPct * 100).toFixed(1) + '% 去賭，建議壓在 2% 以內。');
    if (t.afterLoss && t.sizePct > t.afterLoss.sizePct * 1.3) L.push('這筆是在賠錢後 5 分鐘內加碼下的，很像想把錢贏回來。');
    if (t.why !== 'liq' && Math.abs(t.gross) < t.fees) L.push('價差是 ' + t.gross.toFixed(2) + '，手續費就花了 ' + t.fees.toFixed(2) + '。進出太快，光手續費就會吃掉獲利。');
    return L;
  }

  function weaknesses(s) {
    const T = mine(s).slice(-30);
    const out = [];
    if (T.length < 8) return out;
    const st = statsFor(T);
    const share = (f) => T.filter(f).length / T.length;
    if (st.slRate < 0.8) out.push({ key: 'nosl', title: '常常沒設停損', detail: '最近 ' + T.length + ' 筆只有 ' + Math.round(st.slRate * 100) + '% 有設停損。', lesson: 5, score: 1 - st.slRate + 0.5 });
    const heavy = share((t) => (t.lev === 1 && t.sizePct > 0.5) || (t.riskPct != null && t.riskPct > 0.05));
    if (heavy >= 0.2) out.push({ key: 'size', title: '部位押太重', detail: '最近有 ' + Math.round(heavy * 100) + '% 的交易押得太重。', lesson: 7, score: heavy + 0.4 });
    if (st.wins >= 3 && st.losses >= 3 && st.winRate >= 0.5 && st.avgWin < -st.avgLoss * 0.8) out.push({ key: 'smallwin', title: '賺少賠多', detail: '平均每筆賺 ' + (st.avgWin * 100).toFixed(2) + '%，平均每筆賠 ' + (-st.avgLoss * 100).toFixed(2) + '%。贏的次數多，錢卻沒留下來。', lesson: 6, score: 0.8 });
    const wT = T.filter((t) => t.pnl > 0);
    const lT = T.filter((t) => t.pnl <= 0);
    if (wT.length >= 3 && lT.length >= 3) {
      const avg = (a) => a.reduce((x, t) => x + (t.t1 - t.t0), 0) / a.length;
      if (avg(lT) > avg(wT) * 2 && avg(lT) > 120000) out.push({ key: 'hold', title: '賠錢的單抱太久', detail: '賠錢的單平均抱 ' + fmtDur(avg(lT)) + '，賺錢的單只抱 ' + fmtDur(avg(wT)) + '。', lesson: 5, score: 0.7 });
    }
    const rev = share((t) => t.afterLoss && t.sizePct > t.afterLoss.sizePct * 1.3);
    if (rev >= 0.1) out.push({ key: 'revenge', title: '賠錢後馬上加碼', detail: '最近有 ' + Math.round(rev * 100) + '% 的交易是賠錢後 5 分鐘內加碼下的。', lesson: 7, score: rev + 0.6 });
    const chase = T.filter((t) => t.ctx && t.ctx.chg != null && ((t.side === 'long' && t.ctx.chg > 0.015) || (t.side === 'short' && t.ctx.chg < -0.015)));
    if (chase.length >= 3 && chase.filter((t) => t.pnl <= 0).length / chase.length >= 0.6) out.push({ key: 'chase', title: '常常追高', detail: '急漲後才進場的 ' + chase.length + ' 筆裡，有 ' + chase.filter((t) => t.pnl <= 0).length + ' 筆賠錢。', lesson: 9, score: 0.65 });
    const gut = share((t) => t.reason === 'gut');
    if (gut >= 0.3) out.push({ key: 'gut', title: '太常憑感覺下單', detail: '最近有 ' + Math.round(gut * 100) + '% 的交易理由是「憑感覺」。', lesson: 10, score: gut });
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 2);
  }

  function sanitize(raw, now) {
    const base = newState(now);
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return base;
    const s = base;
    const num = (x, d) => (fin(x) ? x : d);
    s.rank = Number.isInteger(raw.rank) && raw.rank >= 1 && raw.rank <= 5 ? raw.rank : 1;
    s.cash = Math.max(0, num(raw.cash, RANKS[s.rank].cap));
    const okPos = (p) => p && SYM.test(p.sym) && (p.side === 'long' || p.side === 'short') && pos(p.qty) && pos(p.entry) && pos(p.margin) && pos(p.eq0) && Number.isInteger(p.lev) && p.lev >= 1 && p.lev <= 10 && fin(p.t0);
    s.positions = Array.isArray(raw.positions) ? raw.positions.filter(okPos) : [];
    for (const p of s.positions) p.owner = p.owner === 'team' ? 'team' : 'me';
    s.orders = Array.isArray(raw.orders) ? raw.orders.filter((o) => o && SYM.test(o.sym) && pos(o.amount) && pos(o.limit) && pos(o.reserve) && Number.isInteger(o.lev)) : [];
    s.trades = Array.isArray(raw.trades) ? raw.trades.filter((t) => t && typeof t.sym === 'string' && SYM.test(t.sym) && fin(t.pnl) && fin(t.ret) && fin(t.t0) && fin(t.t1)) : [];
    for (const t of s.trades) t.owner = t.owner === 'team' ? 'team' : 'me';
    for (const o of s.orders) o.owner = o.owner === 'team' ? 'team' : 'me';
    if (raw.lessons && typeof raw.lessons === 'object') for (const k of Object.keys(raw.lessons)) if (/^\d+$/.test(k) && raw.lessons[k] && typeof raw.lessons[k] === 'object') s.lessons[k] = { read: !!raw.lessons[k].read, done: !!raw.lessons[k].done };
    if (raw.flags && typeof raw.flags === 'object') for (const k of Object.keys(raw.flags)) if (/^[a-zA-Z0-9]+$/.test(k)) s.flags[k] = !!raw.flags[k];
    if (raw.rules && pos(raw.rules.risk) && pos(raw.rules.day) && pos(raw.rules.rr)) s.rules = { risk: Math.min(0.2, raw.rules.risk), day: Math.min(0.5, raw.rules.day), rr: Math.min(10, raw.rules.rr) };
    s.peak = Math.max(1, num(raw.peak, s.cash));
    s.maxDD = Math.min(1, Math.max(0, num(raw.maxDD, 0)));
    s.eqHist = Array.isArray(raw.eqHist) ? raw.eqHist.filter((p) => p && fin(p.t) && fin(p.e)).slice(-400) : base.eqHist;
    if (!s.eqHist.length) s.eqHist = base.eqHist;
    s.nextId = Number.isInteger(raw.nextId) && raw.nextId > 0 ? raw.nextId : 1;
    for (const p of s.positions) if (p.id >= s.nextId) s.nextId = p.id + 1;
    for (const o of s.orders) if (o.id >= s.nextId) s.nextId = o.id + 1;
    s.rankAt = Number.isInteger(raw.rankAt) ? Math.min(Math.max(0, raw.rankAt), s.trades.length) : 0;
    s.rankLog = Array.isArray(raw.rankLog) ? raw.rankLog.filter((r) => r && fin(r.t) && Number.isInteger(r.rank)).slice(-50) : base.rankLog;
    s.graduated = !!raw.graduated;
    s.refills = Number.isInteger(raw.refills) ? raw.refills : 0;
    s.lastSeen = num(raw.lastSeen, now);
    if (raw.lastPrices && typeof raw.lastPrices === 'object') for (const k of Object.keys(raw.lastPrices).slice(0, 60)) if (SYM.test(k) && pos(raw.lastPrices[k])) s.lastPrices[k] = raw.lastPrices[k];
    const st = raw.settings || {};
    const lev = Number.isInteger(st.lev) && st.lev >= 1 && st.lev <= MAX_LEV ? st.lev : 1;
    s.settings = {
      twColors: !!st.twColors,
      ma: !!st.ma,
      sym: typeof st.sym === 'string' && SYM.test(st.sym) ? st.sym : 'BTC',
      interval: ['1m', '5m', '15m', '1h', '4h', '1d'].includes(st.interval) ? st.interval : '1m',
      amtPct: [0.05, 0.1, 0.25, 0.5, 1].includes(st.amtPct) ? st.amtPct : 0.1,
      lev,
      gestured: !!st.gestured,
      fib: !!st.fib,
      teamPct: [0, 0.1, 0.25, 0.5, 1].includes(st.teamPct) ? st.teamPct : 0.25,
      judge: st.judge === 'team' ? 'team' : 'me',
      statsView: ['all', 'me', 'team'].includes(st.statsView) ? st.statsView : 'all',
      ordType: st.ordType === 'limit' ? 'limit' : 'market',
      slMode: ['auto', 'p1', 'p2', 'p3', 'off'].includes(st.slMode) ? st.slMode : 'auto',
      tpMode: ['r15', 'r2', 'r3', 'off'].includes(st.tpMode) ? st.tpMode : 'r2',
      ema: !!st.ema,
      boll: !!st.boll,
      sub: ['none', 'rsi', 'macd'].includes(st.sub) ? st.sub : 'none',
      ptab: ['pos', 'ord', 'book', 'tape', 'hist', ''].includes(st.ptab) ? st.ptab : 'pos'
    };
    s.favs = Array.isArray(raw.favs) ? Array.from(new Set(raw.favs.filter((x) => typeof x === 'string' && SYM.test(x)))).slice(0, 60) : [];
    s.alerts = Array.isArray(raw.alerts) ? raw.alerts.filter((a) => a && Number.isInteger(a.id) && typeof a.sym === 'string' && SYM.test(a.sym) && pos(a.px) && (a.dir === 'up' || a.dir === 'down') && fin(a.t)).slice(0, 30).map((a) => ({ id: a.id, sym: a.sym, px: a.px, dir: a.dir, t: a.t })) : [];
    for (const a of s.alerts) if (a.id >= s.nextId) s.nextId = a.id + 1;
    if (raw.coinCache && fin(raw.coinCache.t) && Array.isArray(raw.coinCache.list)) {
      const list = raw.coinCache.list.filter((x) => typeof x === 'string' && SYM.test(x)).slice(0, 300);
      if (list.length >= 5) s.coinCache = { t: raw.coinCache.t, list };
    }
    return s;
  }

  return {
    ALL, SYM, RANKS, MAX_LEV, mine, FEE_SPOT, FEE_LEV, MMR, MIN_AMOUNT, REASONS, canShort, setReason, modifyOrder, feeRate,
    newState, equity, touchDD, liqPrice, posPnl, posValue, isLev, maxAmount, costOf,
    openPosition, createOrder, cancelOrder, setStops, closePosition,
    onPrice, onCandle, statsFor, curveDD, levTrades, requirements, promote, checkDemotion,
    warnings, review, weaknesses, sanitize, tcdf, fmtDur, lessonsDone
  };
})();
if (typeof module !== 'undefined') module.exports = Engine;
