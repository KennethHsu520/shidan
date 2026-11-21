const BAR5 = 5 * 60000;
const MD = { fund: {}, oi: {}, fg: [], fundNow: {}, fsym: {}, h1: {}, t: 0, loading: false, ok: { fund: null, oi: null, fg: null } };
const FAPI = 'https://fapi.binance.com';
const RL_FUND = makeRL(300000, 420);
const RL_OI = makeRL(300000, 850);
const RL_FAPI = makeRL(60000, 1800);
function fapiRL(url) {
  if (url.indexOf('fapi.binance.com') < 0) return null;
  if (url.indexOf('/fapi/v1/fundingRate') >= 0) return [RL_FUND, 1];
  if (url.indexOf('/futures/data/') >= 0) return [RL_OI, 1];
  return [RL_FAPI, url.indexOf('/fapi/v1/premiumIndex') >= 0 && url.indexOf('symbol=') < 0 ? 10 : 1];
}
async function getAbs(url, ms) {
  const rl = fapiRL(url);
  if (rl) await rl[0].take(rl[1]);
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), ms || 8000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) { if (rl) rl[0].hit(res); throw new Error('http'); }
    return await res.json();
  } finally { clearTimeout(tm); }
}
const lastAt = (arr, t) => {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
};
const sma = (arr, n, i) => { if (i < n - 1) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) s += arr[j].c; return s / n; };
function structAt(t) {
  const D = MD.btcD;
  if (!D) return null;
  const i = lastAt(D, t - 86400000);
  if (i < 200) return null;
  const px = D[i].c, m200 = sma(D, 200, i), m50 = sma(D, 50, i);
  let w200 = null;
  if (MD.btcW) { const j = lastAt(MD.btcW, t - 7 * 86400000); if (j >= 199) w200 = sma(MD.btcW, 200, j); }
  const macro = px > m200 && m50 > m200 ? 'bull' : px < m200 ? 'bear' : 'mid';
  return { macro, px, m200, m50, w200 };
}
function flowAt(t) {
  const A = MD.stable;
  if (!A || !A.length) return null;
  const i = lastAt(A, t), j = lastAt(A, t - 30 * 86400000);
  if (i < 0 || j < 0 || t - A[i].t > 3 * 86400000) return null;
  const chg = A[i].v / A[j].v - 1;
  return { flow: chg > 0.01 ? 'in' : chg < -0.01 ? 'out' : 'flat', chg, v: A[i].v };
}
function domNow() {
  const d = MD.dom;
  if (!d || !d.hist || d.hist.length < 2) return null;
  const h = d.hist;
  const ref = h.find((x) => x.t <= Date.now() - 20 * 3600000) || null;
  if (!ref) return { dom: null, now: d.now };
  const ch = d.now - ref.v;
  return { dom: ch > 0.3 ? 'up' : ch < -0.3 ? 'down' : 'flat', now: d.now, ch };
}
function extAt(sym, t, live) {
  const out = {};
  const st = structAt(t);
  if (st) out.macro = st.macro;
  const fl = flowAt(t);
  if (fl) out.flow = fl.flow;
  if (live && sym !== 'BTC') { const dm = domNow(); if (dm && dm.dom) out.dom = dm.dom; }
  const F = MD.fund[sym];
  if (F && F.length) { const i = lastAt(F, t); if (i >= 0 && t - F[i].t < 9 * 3600000) out.fund = F[i].v; }
  if (out.fund == null && MD.fundNow[sym] != null && Math.abs(Date.now() - t) < 9 * 3600000) out.fund = MD.fundNow[sym];
  const O = MD.oi[sym];
  if (O && O.length) {
    const i = lastAt(O, t), j = lastAt(O, t - 4 * 3600000);
    if (i >= 0 && j >= 0 && t - O[i].t < 2 * 3600000 && O[j].v > 0) out.oiChg = O[i].v / O[j].v - 1;
  }
  if (MD.fg.length) { const i = lastAt(MD.fg, t); if (i >= 0 && t - MD.fg[i].t < 2 * 86400000) out.fg = MD.fg[i].v; }
  const nm = newsAt(sym, t);
  if (nm) { out.news = nm.news; out.mnews = nm.mnews; }
  const h = MD.h1[sym];
  if (live && h && Math.abs(t - h.t) < 2 * 3600000) out.htf = h.dir;
  if (live) { const ss = sectState(sym); if (ss) out.sect = ss; }
  return out;
}
function h1Dir(h) {
  if (!h || h.length < 40) return null;
  const e = Team.ema(h.map((x) => x.c), 24);
  const n = h.length - 2;
  return { t: h[n].t + 3600000, dir: h[n].c > e[n] && e[n] > e[n - 6] ? 'up' : h[n].c < e[n] && e[n] < e[n - 6] ? 'down' : 'flat' };
}
async function loadMarket(coins) {
  if (MD.loading || S.mode !== 'live') return;
  MD.loading = true;
  try {
    try {
      const rows = await getAbs(FAPI + '/fapi/v1/premiumIndex', 9000);
      const have = {};
      for (const r of Array.isArray(rows) ? rows : []) if (r && typeof r.symbol === 'string' && r.symbol.endsWith('USDT')) have[r.symbol] = +r.lastFundingRate;
      for (const c of coins) {
        const f = have[c + 'USDT'] != null ? c + 'USDT' : have['1000' + c + 'USDT'] != null ? '1000' + c + 'USDT' : null;
        if (f) { MD.fsym[c] = f; if (isFinite(have[f])) MD.fundNow[c] = have[f]; }
      }
      MD.ok.fund = true;
    } catch (e) { MD.ok.fund = false; }
    try {
      const r = await getAbs('https://api.alternative.me/fng/?limit=60', 8000);
      const d = r && Array.isArray(r.data) ? r.data : [];
      MD.fg = d.map((x) => ({ t: +x.timestamp * 1000, v: +x.value })).filter((x) => x.t > 0 && x.v >= 0 && x.v <= 100).sort((a, b) => a.t - b.t);
      MD.ok.fg = MD.fg.length > 0;
    } catch (e) { MD.ok.fg = false; }
    let okO = 0;
    await pool(coins, 8, async (c) => {
      try {
        const d = h1Dir(await fetchKlines(c, '1h', '&limit=60'));
        if (d) MD.h1[c] = d;
      } catch (e) { MD.h1[c] = null; }
      const f = MD.fsym[c];
      if (!f || !MD.ok.fund) return;
      try {
        const fr = await getAbs(FAPI + '/fapi/v1/fundingRate?symbol=' + f + '&limit=100', 8000);
        if (Array.isArray(fr)) MD.fund[c] = fr.map((x) => ({ t: +x.fundingTime, v: +x.fundingRate })).filter((x) => x.t > 0 && isFinite(x.v)).sort((a, b) => a.t - b.t);
      } catch (e) { MD.fund[c] = MD.fund[c] || null; }
      try {
        const oi = await getAbs(FAPI + '/futures/data/openInterestHist?symbol=' + f + '&period=1h&limit=500', 8000);
        if (Array.isArray(oi)) { MD.oi[c] = oi.map((x) => ({ t: +x.timestamp, v: +x.sumOpenInterest })).filter((x) => x.t > 0 && x.v > 0).sort((a, b) => a.t - b.t); okO++; }
      } catch (e) { MD.oi[c] = MD.oi[c] || null; }
    });
    MD.ok.oi = okO > 0;
    try {
      const d = await fetchKlines('BTC', '1d', '&limit=400');
      if (d.length > 210) MD.btcD = d;
      const w = await fetchKlines('BTC', '1w', '&limit=230');
      if (w.length > 200) MD.btcW = w;
    } catch (e) { MD.btcD = MD.btcD || null; }
    try {
      const r = await getAbs('https://stablecoins.llama.fi/stablecoincharts/all', 12000);
      if (Array.isArray(r)) MD.stable = r.map((x) => ({ t: +x.date * 1000, v: x && x.totalCirculatingUSD ? +x.totalCirculatingUSD.peggedUSD : NaN })).filter((x) => x.t > 0 && x.v > 0).sort((a, b) => a.t - b.t).slice(-200);
      MD.ok.stable = !!(MD.stable && MD.stable.length > 40);
    } catch (e) { MD.ok.stable = false; }
    try {
      const g = await getAbs('https://api.coingecko.com/api/v3/global', 8000);
      const v = g && g.data && g.data.market_cap_percentage ? +g.data.market_cap_percentage.btc : NaN;
      if (v > 0 && v < 100) {
        let h = [];
        try { h = JSON.parse(localStorage.getItem('gaoqian.dom')) || []; } catch (e) { h = []; }
        h = (Array.isArray(h) ? h : []).filter((x) => x && x.t > Date.now() - 8 * 86400000 && x.v > 0);
        if (!h.length || Date.now() - h[h.length - 1].t > 3000000) h.push({ t: Date.now(), v });
        try { localStorage.setItem('gaoqian.dom', JSON.stringify(h)); } catch (e) { h = h.slice(-50); }
        MD.dom = { now: v, hist: h };
      }
    } catch (e) { MD.dom = MD.dom || null; }
    MD.t = Date.now();
  } finally { MD.loading = false; }
}
const NEWS_EV = { hack: '駭客攻擊', rug: '捲款跑路', delist: '下架', sue: '官司或起訴', fraud: '詐騙', halt: '停止提款或破產' };
const fAgo = (ms) => (ms < 3600000 ? Math.max(1, Math.round(ms / 60000)) + ' 分鐘前' : Math.round(ms / 3600000) + ' 小時前');
const NW = { key: 'gaoqian.news', items: null, t: 0, ok: null, loading: false, start: 0 };
function newsLoadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(NW.key));
    if (c && Array.isArray(c.items)) {
      NW.items = c.items.filter((a) => a && typeof a.t === 'number' && typeof a.title === 'string' && Array.isArray(a.syms) && typeof a.s === 'number').slice(-400);
      NW.hist = c.hist && typeof c.hist.n === 'number' ? c.hist : { n: 0, hit: 0 };
      NW.start = typeof c.start === 'number' ? c.start : (NW.items[0] ? NW.items[0].t : 0);
    }
  } catch (e) { NW.items = null; }
}
function cleanText(x, n) { return typeof x === 'string' ? x.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : ''; }
async function loadNews() {
  if (NW.loading || S.mode !== 'live') return;
  NW.loading = true;
  try {
    let r = null;
    for (const u of ['https://cryptocurrency.cv/api/news?limit=100', 'https://free-crypto-news.vercel.app/api/news?limit=100']) {
      try { r = await getAbs(u, 9000); if (r && Array.isArray(r.articles) && r.articles.length) { NW.src = u.split('/')[2]; break; } } catch (e) { r = null; }
    }
    const arr = r && Array.isArray(r.articles) ? r.articles : [];
    if (!NW.items) newsLoadCache();
    const have = new Map((NW.items || []).map((a) => [a.id, a]));
    const syms = Array.from(new Set(S.coins.concat(['BTC', 'ETH'])));
    for (const x of arr) {
      if (!x || typeof x.title !== 'string') continue;
      const t = Date.parse(x.pubDate);
      if (!isFinite(t) || t > Date.now() + 600000) continue;
      const title = cleanText(x.title, 220);
      const desc = cleanText(x.description, 300);
      const id = cleanText(x.id, 80) || title.slice(0, 80);
      if (!title || have.has(id)) continue;
      const sc = L.newsScore(title, desc, x.sentiment);
      const link = typeof x.link === 'string' && /^https:\/\/[^\s"'<>]+$/.test(x.link) ? x.link.slice(0, 400) : '';
      const it = { id, t: Math.min(t, Date.now()), title, src: cleanText(x.source, 40), link, s: sc.s, ev: sc.ev, syms: L.newsCoins(title, desc, x.tags, syms) };
      const orig = Array.from(have.values()).find((a) => !a.dup && Math.abs(a.t - it.t) < 12 * 3600000 && L.newsSame(a.title, it.title));
      if (orig) { it.dup = orig.id; orig.copies = (orig.copies || 0) + 1; for (const c of it.syms) if (!orig.syms.includes(c)) orig.syms.push(c); }
      else if (Date.now() - it.t < 30 * 60000) { it.p0 = {}; for (const c of it.syms) if (S.prices[c] > 0) it.p0[c] = S.prices[c]; }
      have.set(id, it);
    }
    for (const a of have.values()) {
      if (!a.p0 || a.chk || Date.now() - a.t < 3600000) continue;
      if (Date.now() - a.t > 3 * 3600000) { a.chk = {}; continue; }
      a.chk = {};
      for (const c of Object.keys(a.p0)) if (S.prices[c] > 0 && a.p0[c] > 0) a.chk[c] = S.prices[c] / a.p0[c] - 1;
    }
    const cut = Date.now() - 48 * 3600000;
    NW.items = Array.from(have.values()).filter((a) => a.t > cut || (a.ev && !a.dup && a.t > Date.now() - 7 * 86400000)).sort((a, b) => a.t - b.t).slice(-450);
    if (!NW.start || NW.start < cut) NW.start = NW.items.length ? Math.max(cut, Math.min(NW.start || Date.now(), NW.items[0].t)) : Date.now();
    NW.hist = NW.hist || { n: 0, hit: 0 };
    for (const a of have.values()) if (a.chk && !a.counted && a.t <= cut + 3600000) { const h = L.newsHits([a]); NW.hist.n += h.n; NW.hist.hit += h.hit; a.counted = true; }
    try { localStorage.setItem(NW.key, JSON.stringify({ start: NW.start, items: NW.items, hist: NW.hist })); } catch (e) { NW.items = NW.items.slice(-200); }
    NW.ok = arr.length > 0; NW.t = Date.now();
  } catch (e) { NW.ok = false; NW.t = Date.now(); } finally { NW.loading = false; }
}
function newsAt(sym, t) {
  if (!NW.items || !NW.items.length || !NW.start) return null;
  if (Math.abs(Date.now() - t) > 600000 && t < NW.start + 3600000) return null;
  return L.newsMood(NW.items, sym, t);
}
const MACRO_CAL = [
  { t: Date.UTC(2026, 10, 18, 19, 0), name: 'FOMC 會議紀要' },
  { t: Date.UTC(2026, 10, 25, 13, 30), name: '美國 PCE 物價' },
  { t: Date.UTC(2026, 11, 9, 19, 0), name: 'FOMC 利率決議' },
  { t: Date.UTC(2026, 11, 10, 13, 30), name: '美國 11 月 CPI' },
  { t: Date.UTC(2027, 0, 13, 13, 30), name: '美國 12 月 CPI' },
  { t: Date.UTC(2027, 0, 27, 19, 0), name: 'FOMC 利率決議' },
  { t: Date.UTC(2027, 1, 11, 13, 30), name: '美國 1 月 CPI' },
  { t: Date.UTC(2027, 1, 25, 13, 30), name: '美國 1 月 PCE 物價' },
  { t: Date.UTC(2027, 2, 10, 13, 30), name: '美國 2 月 CPI' },
  { t: Date.UTC(2027, 2, 17, 18, 0), name: 'FOMC 利率決議' },
  { t: Date.UTC(2027, 2, 31, 12, 30), name: '美國 2 月 PCE 物價' },
  { t: Date.UTC(2027, 3, 13, 12, 30), name: '美國 3 月 CPI' },
  { t: Date.UTC(2027, 3, 28, 18, 0), name: 'FOMC 利率決議' },
  { t: Date.UTC(2027, 4, 12, 12, 30), name: '美國 4 月 CPI' },
  { t: Date.UTC(2027, 4, 27, 12, 30), name: '美國 4 月 PCE 物價' },
  { t: Date.UTC(2027, 5, 9, 18, 0), name: 'FOMC 利率決議' },
  { t: Date.UTC(2027, 5, 10, 12, 30), name: '美國 5 月 CPI' },
  { t: Date.UTC(2027, 6, 14, 12, 30), name: '美國 6 月 CPI' },
  { t: Date.UTC(2027, 6, 28, 18, 0), name: 'FOMC 利率決議' },
  { t: Date.UTC(2027, 6, 29, 12, 30), name: '美國 6 月 PCE 物價' },
  { t: Date.UTC(2027, 7, 11, 12, 30), name: '美國 7 月 CPI' },
  { t: Date.UTC(2027, 7, 25, 12, 30), name: '美國 7 月 PCE 物價' },
  { t: Date.UTC(2027, 8, 14, 12, 30), name: '美國 8 月 CPI' },
  { t: Date.UTC(2027, 8, 15, 18, 0), name: 'FOMC 利率決議' },
  { t: Date.UTC(2027, 8, 30, 12, 30), name: '美國 8 月 PCE 物價' },
  { t: Date.UTC(2027, 9, 14, 12, 30), name: '美國 9 月 CPI' },
  { t: Date.UTC(2027, 10, 10, 13, 30), name: '美國 10 月 CPI' },
  { t: Date.UTC(2027, 10, 17, 19, 0), name: 'FOMC 利率決議' },
  { t: Date.UTC(2027, 10, 24, 13, 30), name: '美國 10 月 PCE 物價' },
  { t: Date.UTC(2027, 11, 10, 13, 30), name: '美國 11 月 CPI' },
  { t: Date.UTC(2027, 11, 22, 13, 30), name: '美國 11 月 PCE 物價' }
];
const CAL_UNTIL = Date.UTC(2027, 11, 23);
const CAL_TBD = ['FOMC 會議紀要（決議後約 3 週）', 'PCE（2026 年 11、12 月與 2027 年 3、5、9 月的數據）公布日'];
const fYMD = (t) => { const d = new Date(t); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); };
const calSrc = (n) => (/FOMC/.test(n) ? '聯準會（日期官方標示暫定）' : /CPI/.test(n) ? '美國勞工統計局 BLS' : /PCE/.test(n) ? '美國經濟分析局 BEA' : '');
function macroWindow(t) { return MACRO_CAL.find((e) => t >= e.t - 30 * 60000 && t <= e.t + 60 * 60000) || null; }
function nextMacro(t) { return MACRO_CAL.find((e) => e.t + 60 * 60000 > t) || null; }
const TRUSTED = /coindesk|the ?block|decrypt|cointelegraph|reuters|bloomberg|cnbc|blockworks|wsj|financial times|ft\.com|theblock/i;
