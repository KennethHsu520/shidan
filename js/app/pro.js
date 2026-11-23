const SLM = { auto: '依波動', p1: '1%', p2: '2%', p3: '3%', off: '不設' };
const TPM = { r15: '1.5R', r2: '2R', r3: '3R', off: '不設' };
const PTABS = { pos: '持倉', ord: '掛單', book: '訂單簿', tape: '成交', hist: '紀錄' };
const ICON = {
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5h12l-1.4-2V10a4.6 4.6 0 0 0-9.2 0v4.5z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>'
};
const fMD = (t) => { const d = new Date(t); return d.getMonth() + 1 + '/' + d.getDate(); };
S.hi = {};
S.lo = {};
S.book = null;
S.tape = [];
S.limitPx = null;
const isFav = (sym) => state.favs.includes(sym);
function curSL(side, ref, sym, lev) {
  const m = state.settings.slMode;
  if (m === 'off') return null;
  let dist = m === 'auto' ? atrDist(sym, ref) : ref * { p1: 0.01, p2: 0.02, p3: 0.03 }[m];
  if (side === 'short' || lev > 1) { const room = ref * (1 / lev - E.MMR) * 0.8; if (lev > 1 && dist > room) dist = room; }
  return dist > 0 ? dist : null;
}
function bracketPrices(side, ref, sym, lev) {
  const long = side === 'long';
  const d = curSL(side, ref, sym, lev);
  const dt = d || atrDist(sym, ref);
  const R = { r15: 1.5, r2: 2, r3: 3 }[state.settings.tpMode];
  const sl = d ? roundP(long ? ref - d : ref + d) : null;
  const tp = R ? roundP(long ? ref + dt * R : ref - dt * R) : null;
  return { sl: sl != null && sl > 0 ? sl : null, tp: tp != null && tp > 0 ? tp : null };
}
function ticketEst(side) {
  const sym = state.settings.sym;
  const limit = state.settings.ordType === 'limit';
  const ref = limit && S.limitPx > 0 ? S.limitPx : S.prices[sym];
  const { amount, lev, eq } = orderAmount();
  if (!(ref > 0) || !(amount > 0)) return null;
  const notional = amount * lev;
  const qty = notional / ref;
  const rate = lev > 1 || side === 'short' ? E.FEE_LEV : E.FEE_SPOT;
  const fee = notional * rate * 2;
  const liq = E.liqPrice(side, ref, lev);
  const br = bracketPrices(side, ref, sym, lev);
  const loss = br.sl != null ? Math.abs(ref - br.sl) * qty + fee : null;
  const gain = br.tp != null ? Math.abs(br.tp - ref) * qty - fee : null;
  return { ref, amount, lev, notional, qty, fee, liq, sl: br.sl, tp: br.tp, loss, gain, eq };
}
function estBlock(side) {
  const e = ticketEst(side);
  if (!e) return '<div class="sub">目前沒有報價</div>';
  const pct = (x) => (e.eq > 0 ? '（總資產 ' + ((x / e.eq) * 100).toFixed(2) + '%）' : '');
  return '<div class="calc tk"><div><span>部位</span><b>' + fQ(e.qty) + ' ' + esc(state.settings.sym) + '　' + fU(e.notional) + ' USDT</b></div>' +
    '<div><span>保證金</span><b>' + fU(e.amount) + ' USDT</b></div>' +
    '<div><span>手續費（進出合計）</span><b>' + fU(e.fee) + '</b></div>' +
    '<div><span>強制平倉價</span><b>' + (e.liq > 0 ? fP(e.liq) : '沒有（不開槓桿的買漲不會被強平）') + '</b></div>' +
    '<div><span>停損</span><b class="down">' + (e.sl != null ? fP(e.sl) + '　最多賠 ' + fU(e.loss) + pct(e.loss) : '不設：沒有最多賠多少的上限') + '</b></div>' +
    '<div><span>停利</span><b class="up">' + (e.tp != null ? fP(e.tp) + '　可賺 ' + fU(e.gain) : '不設') + '</b></div></div>';
}
function openTicket() {
  const st = state.settings;
  const eq = E.equity(state, S.prices);
  const sym = st.sym;
  const cur = S.prices[sym];
  if (st.ordType === 'limit' && !(S.limitPx > 0) && cur > 0) S.limitPx = roundP(cur);
  const seg = (act, map, val) => '<div class="seg wide">' + Object.keys(map).map((k) => '<button data-act="' + act + '" data-id="' + k + '" class="' + (val === k ? 'on' : '') + '">' + map[k] + '</button>').join('') + '</div>';
  const side = S.tkSide === 'short' ? 'short' : 'long';
  const html = '<h2>下單設定　' + esc(sym) + '</h2><div class="sub">設定好之後，按交易頁的「買漲」「買跌」都會照這裡下單。總資產 ' + fU(eq) + ' USDT</div>' +
    '<div class="field"><label><span>類型</span><span>' + (st.ordType === 'limit' ? '到價才成交' : '馬上用現價成交') + '</span></label>' + seg('otype', { market: '市價', limit: '限價' }, st.ordType) + '</div>' +
    (st.ordType === 'limit' ? '<div class="field"><label><span>限價</span><span>現價 ' + fP(cur) + '</span></label><input class="inp" id="limPx" type="text" inputmode="decimal" autocomplete="off" maxlength="18" value="' + (S.limitPx > 0 ? S.limitPx : '') + '" aria-label="限價"><div class="sub" style="margin-top:6px">買漲要低於現價、買跌要高於現價；也可以點訂單簿的價格直接帶入。</div></div>' : '') +
    '<div class="field"><label><span>金額</span><span>總資產的比例</span></label><div class="quick big">' + [0.05, 0.1, 0.25, 0.5, 1].map((p) => '<button data-act="pct" data-id="' + p + '" class="' + (st.amtPct === p ? 'on' : '') + '">' + p * 100 + '%<small>' + fU(eq * p) + '</small></button>').join('') + '</div></div>' +
    '<div class="field"><label><span>槓桿</span><span>部位 = 金額 × 槓桿，最高 ' + E.MAX_LEV + ' 倍</span></label>' + [[1, 2, 3, 5, 10], [20, 50, 75, 100, 125]].map((row, i) => '<div class="seg wide' + (i ? ' lev2' : '') + '">' + row.map((x) => '<button data-act="lev" data-id="' + x + '" class="' + (st.lev === x ? 'on' : '') + '">' + (x === 1 ? '不開' : x + ' 倍') + '</button>').join('') + '</div>').join('') + '<div class="levc"><span>自訂</span><input class="inp" id="levIn" type="text" inputmode="numeric" autocomplete="off" maxlength="3" value="' + st.lev + '" aria-label="自訂槓桿倍數"><span>倍</span><small>' + (st.lev >= 50 ? '價格反向約 ' + ((1 / st.lev - E.MMR) * 100).toFixed(2) + '% 就會強制平倉' : '輸入 1～' + E.MAX_LEV) + '</small></div></div>' +
    '<div class="field"><label><span>停損</span><span>離進場價多遠</span></label>' + seg('slm', SLM, st.slMode) + '</div>' +
    '<div class="field"><label><span>停利</span><span>停損距離的幾倍</span></label>' + seg('tpm', TPM, st.tpMode) + '</div>' +
    '<div class="field"><label><span>預估</span><span>' + seg('tkside', { long: '買漲', short: '買跌' }, side).replace('seg wide', 'seg') + '</span></label>' + estBlock(side) + '</div>' +
    '<div class="cta"><button class="btn up-b" data-act="tbuy" data-id="long">' + (st.ordType === 'limit' ? '掛單買漲' : '買漲') + '</button><button class="btn down-b" data-act="tbuy" data-id="short">' + (st.ordType === 'limit' ? '掛單買跌' : '買跌') + '</button></div><div class="cta"><button class="btn quiet" data-act="x">完成</button></div>';
  if (S.sheetKind === 'ticket') { const b = $('#sheetBody'); const top = b.scrollTop; const f = document.activeElement && document.activeElement.id; patch(b, html); b.scrollTop = top; if (f === 'limPx' || f === 'levIn') { const el = $('#' + f); if (el) { el.focus(); if (f === 'levIn') { const n = el.value.length; el.setSelectionRange(n, n); } } } }
  else openSheet('ticket', html);
}
function refreshTicketEst() {
  if (S.sheetKind !== 'ticket') return;
  const box = $('#sheetBody .calc.tk');
  if (!box) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = estBlock(S.tkSide === 'short' ? 'short' : 'long');
  const nb = tmp.firstElementChild;
  if (nb && nb.classList.contains('tk')) patch(box, nb.innerHTML);
}
function onLimitInput(el) {
  const v = String(el.value || '').replace(/[^0-9.]/g, '');
  if (v !== el.value) el.value = v;
  const n = parseFloat(v);
  S.limitPx = n > 0 && n < 1e9 && isFinite(n) ? n : null;
  refreshTicketEst();
}
function onLevInput(el) {
  const v = String(el.value || '').replace(/[^0-9]/g, '').slice(0, 3);
  if (v !== el.value) el.value = v;
  let n = parseInt(v, 10);
  if (n > E.MAX_LEV) { n = E.MAX_LEV; el.value = String(n); }
  if (!(n >= 1) || n === state.settings.lev) return;
  state.settings.lev = n;
  save();
  openTicket();
  renderBar();
}
function simMarket(sym, px) {
  if (!(px > 0)) return;
  const m = Sim.m[sym];
  if (m) {
    const c = m.c1.slice(-1440);
    let h = 0, l = Infinity;
    for (const k of c) { if (k.h > h) h = k.h; if (k.l < l) l = k.l; }
    S.hi[sym] = h; S.lo[sym] = l;
  }
  const tick = Math.pow(10, -dec(px));
  const step = Math.max(tick, roundP(px * 0.00008));
  const lv = (dir) => Array.from({ length: 12 }, (_, i) => [roundP(px + dir * step * (i + 1)), +(Math.random() * 3 + 0.2 + i * 0.15).toFixed(4) * (1000 / px)]);
  S.book = { t: Date.now(), bids: lv(-1), asks: lv(1) };
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) S.tape.unshift({ t: Date.now(), p: roundP(px + (Math.random() - 0.5) * step * 2), q: (Math.random() * 2 + 0.05) * (500 / px), buy: Math.random() < 0.5 });
  if (S.tape.length > 40) S.tape.length = 40;
}
function subMarket() {
  const ws = Live.ws;
  if (!ws || ws.readyState !== 1) return;
  const s = state.settings.sym.toLowerCase();
  const want = [s + 'usdt@depth20@1000ms', s + 'usdt@aggTrade'];
  if (Live.mSub && Live.mSub[0] === want[0]) return;
  if (Live.mSub) wsSend({ method: 'UNSUBSCRIBE', params: Live.mSub });
  S.book = null;
  S.tape = [];
  if (wsSend({ method: 'SUBSCRIBE', params: want })) Live.mSub = want;
}
function onMarketMsg(m, d) {
  const sym = state.settings.sym;
  if (m.stream && m.stream.indexOf('@depth') > 0) {
    if (m.stream.split('usdt@')[0] !== sym.toLowerCase() || !Array.isArray(d.bids) || !Array.isArray(d.asks)) return true;
    const cv = (a) => a.map((x) => [+x[0], +x[1]]).filter((x) => x[0] > 0 && x[1] > 0 && isFinite(x[0]) && isFinite(x[1])).slice(0, 20);
    S.book = { t: Date.now(), bids: cv(d.bids), asks: cv(d.asks) };
    S.dirty = true;
    return true;
  }
  if (d.e === 'aggTrade') {
    if (d.s !== sym + 'USDT') return true;
    const p = +d.p, q = +d.q;
    if (p > 0 && q > 0) { S.tape.unshift({ t: +d.T || Date.now(), p, q, buy: d.m === false }); if (S.tape.length > 40) S.tape.length = 40; S.dirty = true; }
    return true;
  }
  return false;
}
function checkAlerts(sym, price) {
  if (!state.alerts.length) return;
  const hit = state.alerts.filter((a) => a.sym === sym && (a.dir === 'up' ? price >= a.px : price <= a.px));
  if (!hit.length) return;
  state.alerts = state.alerts.filter((a) => !hit.includes(a));
  for (const a of hit) {
    toast('價格提醒：' + a.sym + (a.dir === 'up' ? ' 漲到 ' : ' 跌到 ') + fP(a.px));
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) { S.vib = false; }
  }
  save();
  if (S.sheetKind === 'alerts') openAlerts();
}
function openAlerts() {
  const sym = state.settings.sym;
  const cur = S.prices[sym];
  const A = state.alerts.slice().sort((a, b) => (a.sym === sym ? 0 : 1) - (b.sym === sym ? 0 : 1) || a.px - b.px);
  const html = '<h2>價格提醒</h2><div class="sub">網頁開著時，價格碰到就跳出提醒並震動。最多 30 個。</div>' +
    '<div class="field"><label><span>' + esc(sym) + ' 到這個價格提醒我</span><span>現價 ' + fP(cur) + '</span></label><div class="inrow"><input class="inp" id="alertPx" type="text" inputmode="decimal" autocomplete="off" maxlength="18" placeholder="輸入價格" aria-label="提醒價格"><button class="btn solid" data-act="alertAdd">新增</button></div>' +
    '<div class="quick" style="margin-top:10px">' + [-0.05, -0.02, 0.02, 0.05].map((x) => '<button data-act="alertQ" data-id="' + x + '">' + (x > 0 ? '+' : '−') + Math.abs(x * 100) + '%</button>').join('') + '</div></div>' +
    (A.length ? '<div class="list">' + A.map((a) => '<div class="row"><div class="row-main"><div><b>' + esc(a.sym) + '</b><span class="tag ' + (a.dir === 'up' ? 'up' : 'down') + '">' + (a.dir === 'up' ? '漲到' : '跌到') + '</span><div class="sub">' + fP(a.px) + (S.prices[a.sym] > 0 ? '　差 ' + fPct(a.px / S.prices[a.sym] - 1) : '') + '</div></div><div class="right"><button class="btn sm" data-act="alertDel" data-id="' + a.id + '">刪除</button></div></div></div>').join('') + '</div>' : '<div class="empty">還沒有提醒。</div>') +
    '<div class="cta"><button class="btn quiet" data-act="x">關閉</button></div>';
  if (S.sheetKind === 'alerts') patch($('#sheetBody'), html); else openSheet('alerts', html);
}
function addAlert(px) {
  const sym = state.settings.sym;
  const cur = S.prices[sym];
  if (!(px > 0) || !isFinite(px) || px > 1e9) return toast('請輸入正確的價格');
  if (!(cur > 0)) return toast('目前沒有報價');
  if (Math.abs(px / cur - 1) < 0.0005) return toast('跟現價太近了');
  if (state.alerts.length >= 30) return toast('最多 30 個提醒，先刪掉一些');
  state.alerts.push({ id: state.nextId++, sym, px: roundP(px), dir: px > cur ? 'up' : 'down', t: Date.now() });
  save();
  toast(sym + (px > cur ? ' 漲到 ' : ' 跌到 ') + fP(roundP(px)) + ' 時提醒你');
  openAlerts();
}
function openInd() {
  const st = state.settings;
  const tg = (k, name, desc) => '<div class="row"><button class="toggle" role="switch" aria-checked="' + !!st[k] + '" data-act="indT" data-id="' + k + '"><span>' + name + '<span class="sub" style="display:block">' + desc + '</span></span><i class="sw"></i></button></div>';
  const html = '<h2>指標</h2><div class="list">' + tg('ma', 'MA20', '最近 20 根的平均價，看短期方向') + tg('ema', 'EMA50', '比較重視最近價格的 50 根均線，看中期方向') + tg('boll', '布林通道', '20 根均線上下 2 個標準差，價格碰到邊緣代表走得比較極端') + tg('fib', '黃金比例 0.618', '用畫面上這段走勢的最高點和最低點畫回檔位置') + '</div>' +
    '<div class="field"><label><span>下方副圖</span><span>成交量一直都在</span></label><div class="seg wide">' + [['none', '不顯示'], ['rsi', 'RSI'], ['macd', 'MACD']].map((x) => '<button data-act="indSub" data-id="' + x[0] + '" class="' + (st.sub === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div><div class="sub" style="margin-top:8px">RSI：70 以上偏熱、30 以下偏冷。MACD：柱子由負轉正代表動能轉強。</div></div>' +
    '<div class="cta"><button class="btn solid" data-act="x">完成</button></div>';
  if (S.sheetKind === 'ind') patch($('#sheetBody'), html); else openSheet('ind', html);
}
function paneHTML() {
  const tab = state.settings.ptab;
  const P = state.positions, O = state.orders;
  const cnt = { pos: P.length, ord: O.length + TS.delegs.length };
  const tabs = '<div class="ptabs" role="tablist">' + Object.keys(PTABS).map((k) => '<button role="tab" aria-selected="' + (tab === k) + '" data-act="ptab" data-id="' + k + '" class="' + (tab === k ? 'on' : '') + '">' + PTABS[k] + (cnt[k] ? '<i>' + cnt[k] + '</i>' : '') + '</button>').join('') + '</div>';
  if (!tab) return tabs;
  let body = '';
  if (tab === 'pos') body = panePos();
  else if (tab === 'ord') body = paneOrd();
  else if (tab === 'book') body = paneBook();
  else if (tab === 'tape') body = paneTape();
  else body = paneHist();
  return tabs + '<div class="pbody">' + body + '</div>';
}
function handBtn(p) { return p.owner === 'team' ? '<button class="btn sm hand" data-act="takeover" data-id="' + p.id + '">改由我管</button>' : '<button class="btn sm hand" data-act="handover" data-id="' + p.id + '">交給團隊管</button>'; }
function panePos() {
  const sym = state.settings.sym;
  const P = state.positions.slice().sort((a, b) => (b.sym === sym) - (a.sym === sym) || (a.owner === 'team') - (b.owner === 'team'));
  if (!P.length) {
    const ns = nextStep();
    return '<div class="pempty"><span>沒有持倉。總資產 ' + fU(E.equity(state, S.prices)) + '，可用 ' + fU(state.cash) + '</span>' + (ns ? '<button class="lnk" data-act="' + (ns.lesson ? 'lesson' : 'go') + '" data-id="' + (ns.lesson || ns.go) + '">' + esc(ns.short || ns.text) + '</button>' : '') + '</div>';
  }
  return P.map((p) => {
    const px = S.prices[p.sym] > 0 ? S.prices[p.sym] : p.entry;
    const v = E.posValue(p, px) - p.margin;
    const r = posR(p, px);
    return '<div class="prow"><button class="pm" data-act="' + (p.sym === sym ? 'book' : 'sym') + '" data-id="' + esc(p.sym) + '"><b>' + esc(p.sym) + '</b><span class="' + (p.side === 'long' ? 'up' : 'down') + '">' + (p.side === 'long' ? '買漲' : '買跌') + (p.lev > 1 ? ' ' + p.lev + 'x' : '') + '</span>' + (p.owner === 'team' ? '<span class="who">' + (p.hand ? '你交給團隊' : '團隊') + '</span>' : '') + '<small>進場 ' + fP(p.entry) + (p.sl != null ? '　停損 ' + fP(p.sl) : '　未設停損') + (p.tp != null ? '　停利 ' + fP(p.tp) : '') + (E.isLev(p) && p.liq > 0 ? '　強平 ' + fP(p.liq) : '') + '</small></button><span class="pv"><b class="' + cls(v) + '">' + fS(v) + '</b><small class="' + cls(v) + '">' + fPct(v / p.margin) + (r != null ? '　' + fR(r) : '') + '</small></span><span class="acts">' + handBtn(p) + '<button class="btn sm" data-act="closeId" data-id="' + p.id + '">平倉</button></span></div>';
  }).join('');
}
function paneOrd() {
  const O = state.orders, D = TS.delegs;
  if (!O.length && !D.length) return '<div class="pempty"><span>沒有掛單。點走勢圖，或在下單設定選「限價」。</span></div>';
  return O.map((o) => '<div class="prow"><span class="pm"><b>' + esc(o.sym) + '</b><span class="' + (o.side === 'long' ? 'up' : 'down') + '">掛單' + (o.side === 'long' ? '買漲' : '買跌') + (o.lev > 1 ? ' ' + o.lev + 'x' : '') + '</span><small>到 ' + fP(o.limit) + ' 成交　金額 ' + fU(o.amount) + (o.sl != null ? '　停損 ' + fP(o.sl) : '') + (o.tp != null ? '　停利 ' + fP(o.tp) : '') + '</small></span><span class="pv"><small>' + (S.prices[o.sym] > 0 ? '差 ' + fPct(o.limit / S.prices[o.sym] - 1) : '') + '</small></span><button class="btn sm" data-act="cancel" data-id="' + o.id + '">取消</button></div>').join('') +
    D.map((d) => '<div class="prow"><span class="pm"><b>' + esc(d.sym) + '</b><span class="who">' + esc(delegLabel(d)) + '</span><small>' + (d.side === 'any' ? '團隊判斷方向' : '團隊等好的進場點') + '　剩 ' + fLeft(d.until - Date.now()) + '</small></span><span class="pv"></span><button class="btn sm" data-act="dcancel" data-id="' + esc(d.id) + '">取消</button></div>').join('');
}
function paneBook() {
  const b = S.book;
  if (!b || !b.bids.length || !b.asks.length) return '<div class="pempty"><span>' + (S.mode === 'live' ? '訂單簿讀取中' : '等行情連上') + '</span></div>';
  const n = 8;
  const asks = b.asks.slice(0, n), bids = b.bids.slice(0, n);
  const mx = Math.max(...asks.map((x) => x[1]), ...bids.map((x) => x[1]));
  const row = (x, side) => '<button class="brow ' + side + '" data-act="bookpx" data-id="' + x[0] + '"><i style="width:' + Math.round((x[1] / mx) * 100) + '%"></i><span>' + fP(x[0]) + '</span><span>' + fQ(x[1]) + '</span></button>';
  const spread = asks[0][0] - bids[0][0];
  const bs = bids.reduce((a, x) => a + x[0] * x[1], 0), as = asks.reduce((a, x) => a + x[0] * x[1], 0);
  return '<div class="bbook"><div class="bcol"><div class="bh"><span>買價</span><span>數量</span></div>' + bids.map((x) => row(x, 'b')).join('') + '</div><div class="bcol"><div class="bh"><span>賣價</span><span>數量</span></div>' + asks.map((x) => row(x, 'a')).join('') + '</div></div><div class="bfoot">價差 ' + fP(spread) + '（' + ((spread / bids[0][0]) * 100).toFixed(3) + '%）　前 ' + n + ' 檔買方 ' + Math.round((bs / (bs + as)) * 100) + '%・賣方 ' + Math.round((as / (bs + as)) * 100) + '%　點價格可以直接掛單' + (S.mode === 'sim' ? '　（練習行情的模擬資料）' : '') + '</div>';
}
function paneTape() {
  const T = S.tape.slice(0, 16);
  if (!T.length) return '<div class="pempty"><span>' + (S.mode === 'live' ? '等待成交資料' : '等行情連上') + '</span></div>';
  const z = (n) => String(n).padStart(2, '0');
  return '<div class="tape"><div class="bh"><span>時間</span><span>價格</span><span>數量</span></div>' + T.map((x) => { const d = new Date(x.t); return '<div class="trow"><span>' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()) + '</span><span class="' + (x.buy ? 'up' : 'down') + '">' + fP(x.p) + '</span><span>' + fQ(x.q) + '</span></div>'; }).join('') + '</div>' + (S.mode === 'sim' ? '<div class="bfoot">練習行情的模擬成交</div>' : '<div class="bfoot">綠色是主動買進、紅色是主動賣出</div>');
}
function paneHist() {
  const T = state.trades.slice(-12).reverse();
  if (!T.length) return '<div class="pempty"><span>還沒有結束的交易。</span><button class="lnk" data-act="go" data-id="stats">看成績</button></div>';
  const all = state.trades.slice(-50);
  const sum = all.reduce((a, t) => a + t.pnl, 0);
  const win = all.filter((t) => t.pnl > 0).length;
  return '<div class="bfoot top">最近 ' + all.length + ' 筆：勝率 ' + Math.round((win / all.length) * 100) + '%　合計 <b class="' + cls(sum) + '">' + fS(sum) + '</b> USDT<button class="lnk" data-act="go" data-id="stats">全部成績</button></div>' + T.map((t) => '<button class="prow h" data-act="trade" data-id="' + t.id + '"><span class="pm"><b>' + esc(t.sym) + '</b><span class="' + (t.side === 'long' ? 'up' : 'down') + '">' + (t.side === 'long' ? '買漲' : '買跌') + (t.lev > 1 ? ' ' + t.lev + 'x' : '') + '</span>' + (t.owner === 'team' ? '<span class="who">團隊</span>' : '') + '<small>' + fT(t.t1) + '　' + (WHY[t.why] || '') + '</small></span><span class="pv"><b class="' + cls(t.pnl) + '">' + fS(t.pnl) + '</b><small>' + (t.r != null ? fR(t.r) : fPct(t.pct)) + '</small></span></button>').join('');
}
function t24HTML() {
  const sym = state.settings.sym;
  const hi = S.hi[sym], lo = S.lo[sym], v = S.vol[sym];
  return '<span class="t24s"><span>高 <b>' + fP(hi) + '</b></span><span>低 <b>' + fP(lo) + '</b></span>' + (v ? '<span>量 <b>' + fVol(v) + '</b></span>' : '') + '</span>';
}
function bellHTML() {
  const na = state.alerts.filter((a) => a.sym === state.settings.sym).length;
  return '<button class="ib' + (na ? ' on' : '') + '" data-act="alerts" aria-label="價格提醒">' + ICON.bell + (na ? '<i>' + na + '</i>' : '') + '</button>';
}
function proAct(act, id, el) {
  switch (act) {
    case 'ticket': S.tkSide = 'long'; openTicket(); return true;
    case 'otype': state.settings.ordType = id === 'limit' ? 'limit' : 'market'; if (id === 'limit') S.limitPx = S.prices[state.settings.sym] > 0 ? roundP(S.prices[state.settings.sym]) : null; save(); openTicket(); renderBar(); return true;
    case 'slm': if (SLM[id]) { state.settings.slMode = id; save(); } openTicket(); return true;
    case 'tpm': if (TPM[id]) { state.settings.tpMode = id; save(); } openTicket(); return true;
    case 'tkside': S.tkSide = id === 'short' ? 'short' : 'long'; openTicket(); return true;
    case 'tbuy': { const el2 = $('#limPx'); if (el2) onLimitInput(el2); closeSheet(); tradeBuy(id === 'short' ? 'short' : 'long', false); return true; }
    case 'ptab': state.settings.ptab = state.settings.ptab === id ? '' : PTABS[id] ? id : 'pos'; save(); patch($('#strip'), paneHTML()); markChart(); return true;
    case 'bookpx': { const p = parseFloat(id); if (p > 0) { state.settings.ordType = 'limit'; S.limitPx = p; save(); renderBar(); openTicket(); } return true; }
    case 'alerts': return openAlerts(), true;
    case 'alertAdd': { const v = $('#alertPx') ? parseFloat(String($('#alertPx').value).replace(/[^0-9.]/g, '')) : NaN; addAlert(v); return true; }
    case 'alertQ': { const cur = S.prices[state.settings.sym]; const x = parseFloat(id); if (cur > 0 && isFinite(x)) addAlert(cur * (1 + x)); return true; }
    case 'alertDel': { const n = parseFloat(id); state.alerts = state.alerts.filter((a) => a.id !== n); save(); openAlerts(); patchT24(); return true; }
    case 'fav': { const s = String(id || state.settings.sym); if (!E.SYM.test(s)) return true; state.favs = isFav(s) ? state.favs.filter((x) => x !== s) : state.favs.concat([s]).slice(-60); save(); toast(isFav(s) ? s + ' 加入自選' : s + ' 移出自選'); const b = $('.favb'); if (b) b.classList.toggle('on', isFav(state.settings.sym)); COIN_CACHE.key = ''; if (S.sheetKind === 'coins') renderCoins(true); renderSide(); return true; }
    case 'ind': return openInd(), true;
    case 'indT': if (['ma', 'ema', 'boll', 'fib'].includes(id)) { state.settings[id] = !state.settings[id]; save(); openInd(); markChart(); render(); } return true;
    case 'indSub': if (['none', 'rsi', 'macd'].includes(id)) { state.settings.sub = id; save(); openInd(); markChart(); } return true;
  }
  return false;
}
function patchT24() { const el = $('#t24'); if (el) patch(el, t24HTML()); const b = $('#bellBox'); if (b) patch(b, bellHTML()); }
function calcInd(all) {
  const c = all.map((k) => k.c);
  const out = {};
  const st = state.settings;
  if (st.ema && c.length >= 50) out.ema = Team.ema(c, 50).map((v, i) => (i >= 49 ? v : null));
  if (st.boll && c.length >= 20) {
    out.bu = []; out.bl = []; out.bm = [];
    for (let i = 0; i < c.length; i++) {
      if (i < 19) { out.bu.push(null); out.bl.push(null); out.bm.push(null); continue; }
      let s = 0; for (let j = i - 19; j <= i; j++) s += c[j];
      const m = s / 20;
      let v = 0; for (let j = i - 19; j <= i; j++) v += (c[j] - m) * (c[j] - m);
      const sd = Math.sqrt(v / 20);
      out.bm.push(m); out.bu.push(m + 2 * sd); out.bl.push(m - 2 * sd);
    }
  }
  if (st.sub === 'rsi' && c.length >= 15) out.rsi = Team.rsi(c, 14);
  if (st.sub === 'macd' && c.length >= 35) {
    const e12 = Team.ema(c, 12), e26 = Team.ema(c, 26);
    const macd = c.map((_, i) => (i >= 25 ? e12[i] - e26[i] : null));
    const sig = new Array(25).fill(null).concat(Team.ema(macd.slice(25), 9));
    out.macd = macd.map((v, i) => (i >= 33 ? v : null));
    out.sig = sig;
    out.hist = out.macd.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null));
  }
  return out;
}
