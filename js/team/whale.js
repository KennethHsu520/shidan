const WH = { ws: null, host: -1, subs: new Set(), since: {}, big: {}, liq: [], lws: null, lAt: 0, bAt: 0, fed: {}, id: 1 };
const WH_MAX = 15;
const LIQ_URL = 'wss://fstream.binance.com/ws/!forceOrder@arr';
function fBig(v) { return v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : '$' + Math.round(v / 1e3) + 'K'; }
function bigThr(sym) { const q = S.vol[sym]; return Math.max(1e5, q > 0 ? q * 1e-4 : 0); }
function whaleWant(held) {
  const vol = S.coins.slice().sort((a, b) => (S.vol[b] || 0) - (S.vol[a] || 0));
  const list = ['BTC', 'ETH'].concat(held || [], TS.delegs.map((d) => d.sym), [state.settings.sym], vol);
  const ok = new Set(S.coins.concat(held || []));
  return Array.from(new Set(list.filter((s) => ok.has(s) && E.SYM.test(s)))).slice(0, WH_MAX);
}
function whaleSend(ws, o) { try { ws.send(JSON.stringify(Object.assign({ id: WH.id++ }, o))); return true; } catch (e) { return false; } }
function whaleSync(held) {
  if (S.mode !== 'live' || typeof WebSocket === 'undefined') return;
  const want = whaleWant(held);
  const ws = WH.ws;
  if (!ws || WH.host !== Live.host) {
    if (ws) { try { ws.close(); } catch (e) { WH.ws = null; } }
    whaleOpen(want);
  } else if (ws.readyState === 1) {
    const add = want.filter((s) => !WH.subs.has(s));
    const del = Array.from(WH.subs).filter((s) => !want.includes(s));
    if (add.length && whaleSend(ws, { method: 'SUBSCRIBE', params: add.map((s) => s.toLowerCase() + 'usdt@aggTrade') })) for (const s of add) { WH.subs.add(s); WH.since[s] = Date.now(); }
    if (del.length && whaleSend(ws, { method: 'UNSUBSCRIBE', params: del.map((s) => s.toLowerCase() + 'usdt@aggTrade') })) for (const s of del) { WH.subs.delete(s); delete WH.since[s]; delete WH.big[s]; }
  }
  if (!WH.lws) liqOpen();
}
function whaleOpen(want) {
  if (!want.length) return;
  let ws;
  const host = HOSTS[Live.host];
  try { ws = new WebSocket(host.ws + '/stream?streams=' + want.map((s) => s.toLowerCase() + 'usdt@aggTrade').join('/')); } catch (e) { WH.ws = null; return; }
  WH.ws = ws;
  WH.host = Live.host;
  ws.onopen = () => {
    if (WH.ws !== ws) return;
    WH.subs = new Set(want);
    const now = Date.now();
    WH.since = {};
    for (const s of want) WH.since[s] = now;
    WH.big = {};
    WH.bOk = true;
  };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    const d = m && m.data;
    if (!d || d.e !== 'aggTrade' || typeof d.s !== 'string' || !d.s.endsWith('USDT')) return;
    const sym = d.s.slice(0, -4);
    const usd = +d.p * +d.q;
    if (!(usd > 0) || !isFinite(usd)) return;
    WH.bAt = Date.now();
    const thr = bigThr(sym);
    if (usd < thr) return;
    const t = +d.T || Date.now();
    const arr = WH.big[sym] || (WH.big[sym] = []);
    arr.push({ t, usd, buy: d.m === false });
    while (arr.length && (t - arr[0].t > 3600000 || arr.length > 400)) arr.shift();
    if (usd >= 5 * thr) whaleFeed('b:' + sym, 600000, sym + ' 單筆大單' + (d.m === false ? '買進' : '賣出') + ' ' + fBig(usd) + '（門檻 ' + fBig(thr) + '）');
  };
  ws.onclose = () => { if (WH.ws === ws) { WH.ws = null; WH.subs = new Set(); } };
  ws.onerror = () => { try { ws.close(); } catch (e) { WH.ws = null; } };
}
function liqOpen() {
  if (Date.now() - (WH.lTry || 0) < 60000) return;
  WH.lTry = Date.now();
  let ws;
  try { ws = new WebSocket(LIQ_URL); } catch (e) { WH.lOk = false; return; }
  WH.lws = ws;
  ws.onopen = () => { WH.lOk = true; WH.lSince = WH.lSince || Date.now(); };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    const o = m && m.o;
    if (!m || m.e !== 'forceOrder' || !o || typeof o.s !== 'string' || !o.s.endsWith('USDT')) return;
    let sym = o.s.slice(0, -4);
    if (/^1000+[A-Z]/.test(sym)) sym = sym.replace(/^1000+/, '');
    if (!E.SYM.test(sym)) return;
    const px = +o.ap > 0 ? +o.ap : +o.p;
    const qty = +o.z > 0 ? +o.z : +o.q;
    const usd = px * qty;
    if (!(usd > 0) || !isFinite(usd)) return;
    const t = +o.T || Date.now();
    WH.lAt = Date.now();
    WH.liq.push({ t, sym, side: o.S === 'SELL' ? 'long' : 'short', usd });
    while (WH.liq.length && (t - WH.liq[0].t > 2 * 3600000 || WH.liq.length > 3000)) WH.liq.shift();
    const q15 = WH.liq.filter((x) => x.sym === sym && x.side === (o.S === 'SELL' ? 'long' : 'short') && t - x.t < 900000).reduce((a, x) => a + x.usd, 0);
    if (usd >= 1e6 || q15 >= 3e6) whaleFeed('l:' + sym, 900000, sym + ' ' + (o.S === 'SELL' ? '多單' : '空單') + '被強制平倉，15 分鐘累計 ' + fBig(q15));
  };
  ws.onclose = () => { if (WH.lws === ws) WH.lws = null; };
  ws.onerror = () => { WH.lOk = WH.lOk || false; try { ws.close(); } catch (e) { WH.lws = null; } };
}
function whaleFeed(key, gap, text) {
  const now = Date.now();
  if (WH.fed[key] && now - WH.fed[key] < gap) return;
  WH.fed[key] = now;
  feed('巨鯨觀察員', text);
}
function bigFlow(sym, mins) {
  const w = (mins || 15) * 60000;
  if (!WH.subs.has(sym) || !WH.ws || WH.ws.readyState !== 1) return null;
  const now = Date.now();
  if (!WH.since[sym] || now - WH.since[sym] < w) return null;
  const arr = (WH.big[sym] || []).filter((x) => now - x.t < w);
  let buy = 0, sell = 0, nb = 0, ns = 0;
  for (const x of arr) { if (x.buy) { buy += x.usd; nb++; } else { sell += x.usd; ns++; } }
  const thr = bigThr(sym) * 3;
  const net = buy - sell;
  return { buy, sell, nb, ns, n: arr.length, net, thr, strong: Math.abs(net) >= bigThr(sym) * 10 && arr.length >= 3 };
}
function liqSum(mins) {
  const now = Date.now();
  const X = WH.liq.filter((x) => now - x.t < mins * 60000);
  const out = { long: 0, short: 0, by: {} };
  for (const x of X) { out[x.side] += x.usd; const b = out.by[x.sym] || (out.by[x.sym] = { long: 0, short: 0 }); b[x.side] += x.usd; }
  return out;
}
function topNow(sym) {
  const T = MD.top[sym];
  if (!T || T.length < 5) return null;
  const n = T.length - 1;
  const j = lastAt(T, T[n].t - 4 * 3600000);
  return { v: T[n].v, chg: j >= 0 && j !== n && T[j].v > 0 ? T[n].v / T[j].v - 1 : null, t: T[n].t };
}
function whaleHTML() {
  if (S.mode !== 'live') return '';
  const now = Date.now();
  const flows = Array.from(WH.subs).map((s) => [s, bigFlow(s)]).filter((x) => x[1]);
  const busy = flows.filter((x) => x[1].n).sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net)).slice(0, 6);
  const warm = WH.subs.size && !flows.length;
  const bigRows = busy.map(([s, f]) => '<div class="row"><div class="row-main"><div><b>' + esc(s) + '</b>' + (Math.abs(f.net) >= f.thr ? '<span class="tag ' + (f.net > 0 ? 'up' : 'down') + '">' + (f.net > 0 ? '大單偏買' : '大單偏賣') + '</span>' : '') + '<div class="sub">買 ' + f.nb + ' 筆 ' + fBig(f.buy) + '・賣 ' + f.ns + ' 筆 ' + fBig(f.sell) + '　門檻 ' + fBig(bigThr(s)) + '</div></div><div class="right"><b class="' + cls(f.net) + '">' + (f.net >= 0 ? '+' : '−') + fBig(Math.abs(f.net)) + '</b><div class="sub">淨額</div></div></div></div>').join('');
  const lq = liqSum(60);
  const lqTop = Object.keys(lq.by).map((s) => [s, lq.by[s].long + lq.by[s].short, lq.by[s]]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const lqTxt = WH.lOk ? (lq.long + lq.short > 0 ? '多單被平 ' + fBig(lq.long) + '・空單被平 ' + fBig(lq.short) + (lqTop.length ? '　最多：' + lqTop.map((x) => x[0] + ' ' + fBig(x[1])).join('、') : '') : '過去 1 小時沒有收到爆倉資料') + (WH.lSince && now - WH.lSince < 3600000 ? '（才開始收 ' + fLeft(now - WH.lSince) + '）' : '') : WH.lOk === false ? '連不上幣安期貨爆倉資料' : '連線中';
  const tops = Array.from(new Set(['BTC', 'ETH', state.settings.sym])).map((s) => [s, topNow(s)]).filter((x) => x[1]);
  const topRows = tops.map(([s, t]) => '<div class="row"><div class="row-main"><span>' + esc(s) + '</span><span class="sub">多空比 ' + t.v.toFixed(2) + (t.chg != null ? '　4 小時 ' + fPct(t.chg) + (t.chg > 0.05 ? '，大戶加多' : t.chg < -0.05 ? '，大戶減多' : '，持平') : '') + '</span></div></div>').join('');
  return '<section><h3>巨鯨觀察員</h3><div class="sub">追蹤 ' + WH.subs.size + ' 個幣的大單（BTC、ETH、團隊手上的幣、成交額最大的幣）。大單門檻：24 小時成交額的萬分之一，最少 $100K。</div>' +
    '<h4 class="rh">過去 15 分鐘大單</h4>' + (bigRows ? '<div class="list">' + bigRows + '</div>' : '<div class="empty">' + (warm ? '剛開始收資料，滿 15 分鐘才會計算。' : WH.subs.size ? '追蹤的幣都沒有大單。' : '等行情連上後開始追蹤。') + '</div>') +
    '<h4 class="rh">過去 1 小時爆倉</h4><div class="sub">' + esc(lqTxt) + '</div>' +
    '<h4 class="rh">大戶多空比（幣安期貨前 20% 大戶的持倉）</h4>' + (topRows ? '<div class="list">' + topRows + '</div>' : '<div class="empty">讀取中，每小時更新。</div>') +
    '<p class="say">原則：大單、爆倉、大戶動向只是參考，不當買賣訊號。大單也可能是對沖或內部調度，所以只在 15 分鐘淨額很大、而且跟訊號方向相反時，算一個反方理由；大戶多空比是學習條件，團隊自己學它有沒有用。爆倉資料幣安每秒只送每個幣最新一筆，總額會偏低。鏈上錢包轉帳要付費資料，沒有做。資料來源：幣安。</p></section>';
}
