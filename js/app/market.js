function watchList() {
  const set = new Set(S.coins);
  set.add(state.settings.sym);
  for (const p of state.positions) set.add(p.sym);
  for (const o of state.orders) set.add(o.sym);
  return Array.from(set);
}

const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
const Sim = {
  m: {},
  init(now) {
    for (const sym of E.ALL) {
      const seed = state.lastPrices[sym] > 0 ? state.lastPrices[sym] : SEEDS[sym];
      const n = 7260;
      const sig = sym === 'BTC' ? 0.0007 : sym === 'ETH' ? 0.0009 : 0.0012;
      let vm = 1, drift = 0, left = 0;
      const rets = [], vms = [];
      for (let i = 0; i < n; i++) {
        if (left-- <= 0) { drift = (Math.random() - 0.5) * sig * 0.08; left = 120 + Math.floor(Math.random() * 480); }
        vm = Math.max(0.5, Math.min(2.6, vm + (1 - vm) * 0.03 + gauss() * 0.09));
        rets.push(drift + gauss() * sig * vm);
        vms.push(vm);
      }
      const closes = new Array(n);
      closes[n - 1] = seed;
      for (let i = n - 1; i > 0; i--) closes[i - 1] = closes[i] / (1 + rets[i]);
      const t0 = Math.floor(now / 60000) * 60000;
      const base = 1e6 / seed;
      const c1 = [];
      for (let i = 1; i < n; i++) {
        const o = closes[i - 1], c = closes[i];
        const w = sig * vms[i] * 0.45;
        c1.push({ t: t0 - (n - 1 - i) * 60000, o, c, h: Math.max(o, c) * (1 + Math.abs(gauss()) * w), l: Math.min(o, c) * (1 - Math.abs(gauss()) * w), v: base * vms[i] * (0.5 + Math.random()) * (1 + Math.abs(rets[i]) / sig) });
      }
      this.m[sym] = { c1, price: seed, vm, drift, left, sig, base };
    }
  },
  tick(now) {
    const out = {};
    for (const sym of E.ALL) {
      const m = this.m[sym];
      let r = m.drift / 60 + (gauss() * m.sig * m.vm) / Math.sqrt(60);
      if (Math.random() < 0.0008) r += gauss() * m.sig * 5;
      m.price = Math.max(m.price * (1 + r), 1e-8);
      const t = Math.floor(now / 60000) * 60000;
      let k = m.c1[m.c1.length - 1];
      if (k.t !== t) {
        if (m.left-- <= 0) { m.drift = (Math.random() - 0.5) * m.sig * 0.08; m.left = 120 + Math.floor(Math.random() * 480); }
        m.vm = Math.max(0.5, Math.min(2.6, m.vm + (1 - m.vm) * 0.03 + gauss() * 0.09));
        k = { t, o: k.c, h: k.c, l: k.c, c: k.c, v: 0 };
        m.c1.push(k);
        if (m.c1.length > 7400) m.c1.splice(0, 100);
      }
      k.c = m.price;
      if (m.price > k.h) k.h = m.price;
      if (m.price < k.l) k.l = m.price;
      k.v += ((m.base * m.vm) / 60) * (0.3 + Math.random() * 1.4) * (1 + (Math.abs(r) * 8) / m.sig);
      out[sym] = m.price;
      const ref = m.c1[Math.max(0, m.c1.length - 1440)];
      S.chg[sym] = m.price / ref.o - 1;
      S.vol[sym] = m.base * m.price * 1440;
    }
    return out;
  },
  candles(sym, iv) {
    if (!this.m[sym]) return [];
    const mins = IVS[iv][1];
    const c1 = this.m[sym].c1;
    if (mins === 1) return c1.slice(-300);
    const span = mins * 60000;
    const out = [];
    let cur = null;
    for (let i = Math.max(0, c1.length - mins * 301); i < c1.length; i++) {
      const k = c1[i];
      const b = Math.floor(k.t / span) * span;
      if (!cur || cur.t !== b) { cur = { t: b, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v }; out.push(cur); }
      else { if (k.h > cur.h) cur.h = k.h; if (k.l < cur.l) cur.l = k.l; cur.c = k.c; cur.v += k.v; }
    }
    return out.slice(-300);
  }
};

const HOSTS = [
  { ws: 'wss://data-stream.binance.vision', rest: 'https://data-api.binance.vision' },
  { ws: 'wss://stream.binance.com:9443', rest: 'https://api.binance.com' }
];
const Live = { ws: null, host: 0, ok: false, last: 0, retry: 0, kSub: null, tSubs: new Set(), id: 1, tries: 0 };

function makeRL(win, max) {
  const q = [];
  let sum = 0;
  const rl = {
    until: 0,
    async take(n) {
      for (;;) {
        const now = Date.now();
        while (q.length && now - q[0][0] >= win) sum -= q.shift()[1];
        if (now < rl.until) { await sleep(Math.min(5000, rl.until - now)); continue; }
        if (sum + n <= max || !q.length) { q.push([now, n]); sum += n; return; }
        await sleep(Math.max(100, Math.min(5000, win - (now - q[0][0]) + 20)));
      }
    },
    hit(res) {
      if (res.status !== 429 && res.status !== 418) return;
      const ra = +res.headers.get('Retry-After');
      rl.until = Date.now() + (ra > 0 ? Math.min(ra, 600) * 1000 : 60000);
    },
    used() { const now = Date.now(); while (q.length && now - q[0][0] >= win) sum -= q.shift()[1]; return sum; }
  };
  return rl;
}
const RL_SPOT = makeRL(60000, 3600);
const spotWeight = (path) => (path.startsWith('/api/v3/ticker/24hr') && path.indexOf('symbol=') < 0 ? 80 : 2);
async function getJSON(path, ms) {
  await RL_SPOT.take(spotWeight(path));
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), ms || 8000);
  try {
    const res = await fetch(HOSTS[Live.host].rest + path, { signal: ctl.signal });
    if (!res.ok) { RL_SPOT.hit(res); throw new Error('http'); }
    return await res.json();
  } finally { clearTimeout(tm); }
}
function parseKlines(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    if (!Array.isArray(r)) continue;
    const k = { t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] };
    if ([k.t, k.o, k.h, k.l, k.c, k.v].every(isFinite) && k.l > 0 && k.h >= k.l) out.push(k);
  }
  return out;
}
const fetchKlines = async (sym, iv, extra) => parseKlines(await getJSON('/api/v3/klines?symbol=' + sym + 'USDT&interval=' + iv + (extra || '&limit=300')));
let CLK = null;
const TOPN = 250;
const MIN_QV = 1e6;
const MIN_N = 50;
const WS_URL_MAX = 100;
const WS_SUB_BATCH = 100;
const STOCKS = new Set(['NVDAB', 'SOXLB', 'TSLAB', 'AAPLB', 'MSTRB', 'COINB', 'GOOGLB', 'GOOGB', 'AMZNB', 'METAB', 'SPYB', 'QQQB', 'HOODB', 'CRCLB', 'MSFTB', 'AMDB', 'PLTRB', 'NFLXB', 'INTCB', 'ORCLB', 'UBERB', 'SHOPB', 'PYPLB', 'BABAB', 'GMEB', 'AMCB', 'DISB', 'JPMB', 'WMTB', 'COSTB', 'AVGOB', 'TSMB', 'ARMB', 'SMCIB', 'MUB', 'TQQQB', 'SQQQB', 'IWMB', 'GLDB', 'SLVB', 'USOB', 'IBITB', 'CONLB', 'NVDLB', 'TSLLB', 'MSTUB']);
const CGKEY = 'gaoqian.cg3';
const CRYPTO_B = new Set(['BNB', 'ARB', 'TRB', 'BB', 'AB', 'SB', 'XAB', 'MDB', 'TNB', 'KNCB']);
const NOT_CRYPTO = /tokeni[sz]ed|stock|xstock|ondo .*(etf|fund)|wrapped|bridged|staked|liquid staking|gold|silver|treasury|t-bill|\bfund\b|\betf\b/i;
async function cryptoSet() {
  try {
    const c = JSON.parse(localStorage.getItem(CGKEY));
    if (c && Date.now() - c.t < 24 * 3600000 && Array.isArray(c.ok) && c.ok.length > 100 && Array.isArray(c.bad)) return { ok: new Set(c.ok), bad: new Set(c.bad) };
  } catch (e) { S.cgErr = 1; }
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 25000);
  try {
    const rows = [];
    for (const pg of [1, 2, 3, 4]) {
      try {
        if (pg > 1) await sleep(1500);
        const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=' + pg, { signal: ctl.signal });
        if (!res.ok) throw new Error('http');
        const r = await res.json();
        if (Array.isArray(r)) rows.push(...r);
      } catch (e) { if (pg === 1) throw e; break; }
    }
    const ok = [], bad = [];
    for (const x of rows) {
      if (!x || typeof x.symbol !== 'string') continue;
      const sym = x.symbol.toUpperCase();
      if (!E.SYM.test(sym)) continue;
      const name = typeof x.name === 'string' ? x.name : '';
      (NOT_CRYPTO.test(name) || NOT_CRYPTO.test(typeof x.id === 'string' ? x.id.replace(/-/g, ' ') : '') ? bad : ok).push(sym);
    }
    if (ok.length < 100) throw new Error('few');
    const okS = ok.filter((x) => !bad.includes(x));
    try { localStorage.setItem(CGKEY, JSON.stringify({ t: Date.now(), ok: okS, bad })); } catch (e) { S.cgErr = 2; }
    S.cgOk = true;
    return { ok: new Set(okS), bad: new Set(bad) };
  } catch (e) { S.cgOk = false; return null; } finally { clearTimeout(tm); }
}
function isCrypto(base, cg) {
  if (!E.SYM.test(base) || STABLE.has(base) || STOCKS.has(base) || /(UP|DOWN|BULL|BEAR)$/.test(base)) return false;
  if (/^(PAXG|XAUT|XAUM|KAU|KAG)$/.test(base)) return false;
  if (cg && cg.bad.has(base)) return false;
  if (cg) return cg.ok.has(base);
  return !(/^[A-Z]{2,6}B$/.test(base) && !CRYPTO_B.has(base));
}
async function fetchTop() {
  const cg = await cryptoSet();
  const rows = await getJSON('/api/v3/ticker/24hr?type=MINI', 9000);
  if (!Array.isArray(rows)) throw new Error('bad');
  const list = [];
  for (const r of rows) {
    if (!r || typeof r.symbol !== 'string' || !r.symbol.endsWith('USDT')) continue;
    const base = r.symbol.slice(0, -4);
    if (!isCrypto(base, cg)) continue;
    const qv = +r.quoteVolume, last = +r.lastPrice, open = +r.openPrice;
    if (!(qv > 0) || !(last > 0)) continue;
    list.push({ base, qv, last, chg: open > 0 ? last / open - 1 : 0 });
  }
  list.sort((a, b) => b.qv - a.qv);
  const deep = list.filter((x) => x.qv >= MIN_QV);
  const top = (deep.length >= MIN_N ? deep : list).slice(0, deep.length >= MIN_N ? TOPN : MIN_N);
  if (top.length < 5) throw new Error('few');
  for (const x of top) { S.vol[x.base] = x.qv; S.chg[x.base] = x.chg; if (!(S.prices[x.base] > 0)) S.prices[x.base] = x.last; }
  S.coins = top.map((x) => x.base);
  state.coinCache = { t: Date.now(), list: S.coins.slice() };
}
async function loadChart() {
  const sym = state.settings.sym, iv = state.settings.interval;
  if (S.mode === 'sim') { S.candles = Sim.candles(sym, iv); S.chartErr = !S.candles.length; markChart(); return; }
  if (S.mode !== 'live') return;
  S.candles = [];
  S.chartErr = false;
  markChart();
  subKline();
  try {
    const rows = await fetchKlines(sym, iv);
    if (sym !== state.settings.sym || iv !== state.settings.interval) return;
    S.candles = rows;
  } catch (e) { S.chartErr = true; }
  markChart();
}
function wsSend(o) { try { Live.ws.send(JSON.stringify(Object.assign({ id: Live.id++ }, o))); return true; } catch (e) { return false; } }
function subKline() {
  const ws = Live.ws;
  if (!ws || ws.readyState !== 1) return;
  const name = state.settings.sym.toLowerCase() + 'usdt@kline_' + state.settings.interval;
  if (Live.kSub === name) return;
  if (Live.kSub) wsSend({ method: 'UNSUBSCRIBE', params: [Live.kSub] });
  if (wsSend({ method: 'SUBSCRIBE', params: [name] })) Live.kSub = name;
}
function syncTickers() {
  const ws = Live.ws;
  if (!ws || ws.readyState !== 1) return;
  const want = watchList().map((s) => s.toLowerCase() + 'usdt@miniTicker');
  const add = want.filter((n) => !Live.tSubs.has(n));
  if (!add.length || Live.subBusy) return;
  Live.subBusy = true;
  const batches = [];
  for (let i = 0; i < add.length; i += WS_SUB_BATCH) batches.push(add.slice(i, i + WS_SUB_BATCH));
  (async () => {
    try {
      for (const b of batches) {
        if (Live.ws !== ws || ws.readyState !== 1) break;
        if (wsSend({ method: 'SUBSCRIBE', params: b })) for (const n of b) Live.tSubs.add(n);
        await sleep(400);
      }
    } finally {
      Live.subBusy = false;
      if (Live.ws && Live.ws !== ws) syncTickers();
    }
  })();
}
function connect() {
  let ws;
  const host = HOSTS[Live.host];
  const fail = () => {
    Live.tries++;
    if (Live.tries < HOSTS.length) { Live.host = (Live.host + 1) % HOSTS.length; connect(); return; }
    Live.tries = 0;
    if (S.mode === 'connecting' && !S.everLive) { startSim(); return; }
    setMode(Live.ok ? 'live' : 'down', true);
    Live.retry = Math.min(30000, (Live.retry || 2000) * 2);
    setTimeout(connect, Live.retry);
  };
  const names = watchList().map((s) => s.toLowerCase() + 'usdt@miniTicker').slice(0, WS_URL_MAX);
  try { ws = new WebSocket(host.ws + '/stream?streams=' + names.join('/')); } catch (e) { fail(); return; }
  let opened = false;
  const tm = setTimeout(() => { if (!opened) { try { ws.close(); } catch (e) { return; } } }, 5000);
  ws.onopen = () => {
    opened = true;
    clearTimeout(tm);
    Live.ws = ws;
    Live.kSub = null;
    Live.tSubs = new Set(names);
    Live.tries = 0;
    Live.retry = 0;
    const prev = Live.last;
    Live.last = Date.now();
    const first = !Live.ok;
    Live.ok = true;
    onLiveReady(first ? bootSeen : prev, first);
  };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    const d = m && m.data;
    if (!d || typeof d !== 'object') return;
    Live.last = Date.now();
    if (S.stale) setMode('live', false);
    if (d.e === '24hrMiniTicker' && typeof d.s === 'string' && d.s.endsWith('USDT')) {
      const sym = d.s.slice(0, -4);
      const c = +d.c, o = +d.o, q = +d.q;
      if (!E.SYM.test(sym) || !(c > 0) || !isFinite(c)) return;
      if (o > 0) S.chg[sym] = c / o - 1;
      if (q > 0) S.vol[sym] = q;
      onTick(sym, c);
    } else if (d.e === 'kline' && d.k && typeof d.s === 'string') {
      if (d.s !== state.settings.sym + 'USDT' || d.k.i !== state.settings.interval) return;
      const k = parseKlines([[d.k.t, d.k.o, d.k.h, d.k.l, d.k.c, d.k.v]])[0];
      if (!k) return;
      const last = S.candles[S.candles.length - 1];
      if (last && last.t === k.t) S.candles[S.candles.length - 1] = k;
      else if (!last || k.t > last.t) { S.candles.push(k); if (S.candles.length > 320) S.candles.shift(); }
      markChart();
    }
  };
  ws.onclose = () => {
    clearTimeout(tm);
    if (Live.ws === ws) Live.ws = null;
    if (!opened) { fail(); return; }
    setMode('live', true);
    Live.retry = Math.min(30000, (Live.retry || 1000) * 2);
    setTimeout(connect, Live.retry);
  };
  ws.onerror = () => { try { ws.close(); } catch (e) { return; } };
}
function setMode(mode, stale) {
  S.mode = mode;
  S.stale = !!stale;
  const el = $('#feed');
  if (!el) return;
  el.dataset.m = mode === 'live' && !stale ? 'live' : mode === 'down' || stale ? 'down' : mode;
  $('#feedTxt').textContent = mode === 'sim' ? '練習行情' : mode === 'connecting' ? '連線中' : stale || mode === 'down' ? '重新連線' : '即時';
}
async function onLiveReady(from, first) {
  if (first && !S.everLive) {
    if (state.positions.length || state.orders.length) {
      for (const o of state.orders.slice()) E.cancelOrder(state, o.id);
      for (const p of state.positions) state.cash += p.margin + p.feeOpen;
      state.positions = [];
      S.queue.push({ kind: 'info', title: '已接上即時行情', lines: ['之前用練習行情開的持倉和掛單，已經照原本的金額退回。接下來的價格都是真實市場的即時價格。'] });
    }
    S.everLive = true;
    save();
  }
  setMode('live', false);
  syncTickers();
  S.catching = true;
  try { await catchUp(from); } catch (e) { S.catchErr = true; }
  S.catching = false;
  loadChart();
  render();
  flushQueue();
}
async function catchUp(from) {
  const syms = Array.from(new Set(state.positions.map((p) => p.sym).concat(state.orders.map((o) => o.sym))));
  const gap = Date.now() - from;
  if (!syms.length || gap < 90000) return;
  const iv = gap <= 16 * 3600000 ? '1m' : gap <= 40 * 86400000 ? '1h' : '1d';
  const evs = [];
  for (const sym of syms) {
    const rows = await fetchKlines(sym, iv, '&startTime=' + Math.floor(from) + '&limit=1000');
    for (const k of rows) {
      for (const p of state.positions.filter((x) => x.sym === sym && x.owner === 'team' && x.until && k.t + 60000 > x.until)) {
        const r = E.closePosition(state, p.id, k.o, k.t, 'time', S.prices);
        if (r.ok) evs.push({ type: 'time', trade: r.trade });
      }
      for (const ev of E.onCandle(state, sym, k, S.prices)) evs.push(ev);
    }
  }
  for (const ev of evs) if (ev.trade && ev.trade.owner === 'team') teamLog('團隊 ' + ev.trade.sym + ' ' + WHY[ev.trade.why] + '，' + fS(ev.trade.pnl) + ' USDT');
  saveTeam();
  if (evs.length) {
    S.queue.push({ kind: 'info', title: '你不在的時候', lines: evs.map((ev) => (ev.type === 'fill' ? ev.pos.sym + ' 掛單在 ' + fP(ev.pos.entry) + ' 成交' : (ev.trade.owner === 'team' ? '團隊 ' : '') + ev.trade.sym + ' ' + WHY[ev.trade.why] + '，' + (ev.trade.pnl >= 0 ? '賺 ' : '賠 ') + fU(Math.abs(ev.trade.pnl)) + ' USDT')) });
    afterClose();
    save();
  }
}
function startSim() {
  S.coins = E.ALL.slice();
  Sim.init(Date.now());
  for (const sym of E.ALL) S.prices[sym] = Sim.m[sym].price;
  if (!Sim.m[state.settings.sym]) state.settings.sym = 'BTC';
  setMode('sim', false);
  setInterval(() => {
    const px = Sim.tick(Date.now());
    for (const sym of E.ALL) onTick(sym, px[sym], true);
    S.candles = Sim.candles(state.settings.sym, state.settings.interval);
    markChart();
  }, 1000);
  loadChart();
  render();
}

function onTick(sym, price, fromSim) {
  S.prices[sym] = price;
  if (!fromSim && sym === state.settings.sym && S.candles.length) {
    const span = IVS[state.settings.interval][1] * 60000;
    const last = S.candles[S.candles.length - 1];
    const now = Date.now();
    if (now < last.t + span) { last.c = price; if (price > last.h) last.h = price; if (price < last.l) last.l = price; }
    else if (now < last.t + span * 2) S.candles.push({ t: last.t + span, o: price, h: price, l: price, c: price, v: 0 });
    markChart();
  }
  if (!S.catching) {
    const evs = E.onPrice(state, sym, price, Date.now(), S.prices);
    if (evs.length) {
      for (const ev of evs) {
        if (ev.type === 'fill') { autoBracket(ev.pos); toast(ev.pos.sym + ' 掛單在 ' + fP(ev.pos.entry) + ' 成交'); }
        else if (ev.trade.owner === 'team') { teamLog('團隊 ' + ev.trade.sym + ' ' + WHY[ev.trade.why] + '，' + fS(ev.trade.pnl) + ' USDT' + (ev.trade.r != null ? '（' + fR(ev.trade.r) + '）' : '')); toast('團隊 ' + ev.trade.sym + ' ' + WHY[ev.trade.why] + ' ' + fS(ev.trade.pnl)); saveTeam(); }
        else S.queue.push({ kind: 'review', trade: ev.trade });
      }
      afterClose();
      save();
      render();
      flushQueue();
    }
  }
  S.dirty = true;
}
