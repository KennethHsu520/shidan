function renderBar() {
  const bar = $('#bar');
  if (!bar) return;
  const sym = state.settings.sym;
  if (S.cross) {
    S.barMode = 'cross';
    const pos = curPos()[0];
    const price = S.cross.price || 0;
    const cur = S.prices[sym];
    const btns = [];
    if (pos && state.rank >= 2) {
      btns.push('<button class="act down-o" data-act="xsl">設為停損</button>');
      btns.push('<button class="act up-o" data-act="xtp">設為停利</button>');
    }
    if (!limitOK()) btns.push('<button class="act" data-act="xlocked">掛單（第 3 關）</button>');
    else if (price && cur && price < cur) btns.push('<button class="act solid" data-act="xlimit" data-id="long">在此掛單買漲</button>');
    else if (price && cur && price > cur) btns.push(E.canShort(state) ? '<button class="act solid" data-act="xlimit" data-id="short">在此掛單買跌</button>' : '<button class="act" data-act="xlocked2">掛單買跌（第 5 關）</button>');
    bar.innerHTML = '<div class="crossbar"><span class="cp"><small>十字線</small><b id="crossPx">' + fP(price) + '</b></span>' + btns.join('') + '<button class="x" data-act="xclose" aria-label="關閉十字線">✕</button></div>';
    return;
  }
  S.barMode = 'trade';
  const { amount, lev } = orderAmount();
  const pos = curPos();
  const short = E.canShort(state);
  const tj = state.settings.judge === 'team';
  const judge = '<div class="seg wide judge"><button data-act="judge" data-id="me" class="' + (tj ? '' : 'on') + '">自己判斷</button><button data-act="judge" data-id="team" class="' + (tj ? 'on' : '') + '">交給團隊</button></div>';
  const amt = '<button class="amt" data-act="amount"><small>每筆' + (lev > 1 ? ' ' + lev + 'x' : '') + '</small><b>' + Math.round(state.settings.amtPct * 100) + '%</b><span id="amtUsd">' + fU(amount) + '</span></button>';
  const flat = pos.length ? '<button class="act flat" data-act="flat">平倉</button>' : '';
  if (tj) {
    bar.innerHTML = judge + '<div class="tradebar">' + amt + '<button class="act solid ask" data-act="askTeam">請團隊判斷 ' + esc(sym) + '<small>漲或跌由團隊決定，沒把握就不做</small></button>' + flat + '</div>' +
      '<div class="dirrow"><span>自己有把握方向時</span><button data-act="buy" data-id="long" class="up-t">委託買漲</button><button data-act="buy" data-id="short" class="down-t' + (short ? '' : ' locked') + '">委託買跌' + (short ? '' : '（第 5 關）') + '</button></div>';
    return;
  }
  bar.innerHTML = judge + '<div class="tradebar">' + amt +
    '<button class="act buy" data-act="buy" data-id="long">買漲</button>' +
    '<button class="act sell' + (short ? '' : ' locked') + '" data-act="buy" data-id="short">買跌' + (short ? '' : '<small>第 5 關解鎖</small>') + '</button>' + flat + '</div>';
}

function tradeBuy(side, confirmed, plan) {
  const sym = state.settings.sym;
  if (!plan && state.settings.judge === 'team') return createDeleg(side);
  if (side === 'short' && !E.canShort(state)) return toast('買跌在第 5 關（停損）過關後解鎖');
  if (!canTrade(sym)) return toast(S.mode === 'connecting' ? '行情連線中，請稍等' : '行情連線中斷，暫時不能下單');
  const { amount, lev, eq } = orderAmount();
  if (amount < E.MIN_AMOUNT) return toast(state.positions.length || state.orders.length ? '可用資金不夠，先平倉或取消掛單' : '可用資金不夠');
  const ctx = ctxNow();
  if (!confirmed) {
    const w = E.warnings(state, { sym, side, lev, amount, ref: S.prices[sym], ctx, sl: 1 }, S.prices, Date.now()).filter((x) => !/停損觸發時|盈虧比/.test(x));
    const heavy = (lev === 1 && amount / eq > 0.5) || (lev > 1 && amount * lev / eq > 1);
    const risky = w.some((x) => /剛賠一筆|單日上限/.test(x));
    if (heavy || risky) {
      S.pendingSide = side;
      S.pendingPlan = plan || null;
      return openSheet('info', '<h2>下單前確認</h2><div class="warns">' + w.map((x) => '<p>' + esc(x) + '</p>').join('') + '</div><div class="cta"><button class="btn quiet" data-act="x">先不要</button><button class="btn solid" data-act="confirmBuy">我知道風險，下單</button></div>');
    }
  }
  const r = E.openPosition(state, { sym, side, lev, amount, price: S.prices[sym], reason: plan ? Team.TYPES[plan.type].reason : null, now: Date.now(), ctx: plan ? null : ctx }, S.prices);
  if (!r.ok) return toast(r.err);
  if (plan && state.rank >= 2) {
    const px = S.prices[sym];
    const long = side === 'long';
    const okS = long ? plan.plan.stop < px : plan.plan.stop > px;
    const okT = long ? plan.plan.target > px : plan.plan.target < px;
    const rr = E.setStops(state, r.pos.id, okS ? roundP(plan.plan.stop) : null, okT ? roundP(plan.plan.target) : null, px, true);
    if (!rr.ok || r.pos.sl == null) autoBracket(r.pos);
  } else autoBracket(r.pos);
  save();
  S.cross = null;
  render();
  toast((side === 'long' ? '買漲 ' : '買跌 ') + fQ(r.pos.qty) + ' ' + sym + ' @ ' + fP(r.pos.entry) + (r.pos.sl != null ? '　停損 ' + fP(r.pos.sl) : ''));
  const chase = ctx && ((side === 'long' && ctx.chg > 0.015) || (side === 'short' && ctx.chg < -0.015));
  if (chase) setTimeout(() => toast(side === 'long' ? '提醒：價格剛急漲 ' + (ctx.chg * 100).toFixed(1) + '%，這筆可能是追高' : '提醒：價格剛急跌 ' + (-ctx.chg * 100).toFixed(1) + '%，這筆可能是追空'), 2700);
}
function closePos(p) {
  if (!canTrade(p.sym)) return toast('行情連線中斷，暫時不能交易');
  const r = E.closePosition(state, p.id, S.prices[p.sym], Date.now(), 'manual', S.prices);
  if (!r.ok) return toast(r.err);
  afterClose();
  save();
  if (S.sheetKind) { S.sheetKind = null; $('#sheet').hidden = true; }
  render();
  showReview(r.trade, true);
}
function crossAct(act, side) {
  const sym = state.settings.sym;
  const price = S.cross && S.cross.price;
  const cur = S.prices[sym];
  if (!price || !cur) return;
  if (act === 'xlimit') {
    if (!canTrade(sym)) return toast('行情連線中斷，暫時不能下單');
    const { amount, lev } = orderAmount();
    if (amount < E.MIN_AMOUNT) return toast('可用資金不夠');
    const r = E.createOrder(state, { sym, side, lev, amount, limit: price, cur, reason: null, now: Date.now(), ctx: ctxNow() });
    if (!r.ok) return toast(r.err);
    save(); S.cross = null; render();
    return toast('掛單' + (side === 'long' ? '買漲' : '買跌') + ' @ ' + fP(price) + '，按住線可以拖');
  }
  const p = curPos()[0];
  if (!p) return;
  const r = E.setStops(state, p.id, act === 'xsl' ? price : p.sl, act === 'xtp' ? price : p.tp, cur);
  if (!r.ok) return toast(r.err);
  save(); hideCross(); tickUI();
  toast((act === 'xsl' ? '停損' : '停利') + '設在 ' + fP(price));
}

const WIDE = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : { matches: false, addEventListener() {} };
const XL = window.matchMedia ? window.matchMedia('(min-width: 1680px)') : { matches: false, addEventListener() {} };
const coinsBox = () => '<div class="sidebox"><h3>幣種　' + S.coins.length + ' 個</h3>' + coinSearch('coinQs') + '<div id="sideHead">' + coinsHead() + '</div><div class="list side-coins">' + coinRows() + '</div></div>';
function sideHTML() {
  return '<div class="sidebox"><h3>持倉與掛單</h3>' + bookBody() + '</div>' + (XL.matches ? '' : coinsBox());
}
function renderSide() {
  const el = $('#side');
  if (!el || !WIDE.matches) return;
  patch(el, sideHTML());
  const cp = $('#cpane');
  if (cp && XL.matches) patch(cp, coinsBox());
}
function viewTrade() {
  const sym = state.settings.sym;
  return '<div class="tv">' +
    '<div class="th"><button class="symbtn" data-act="coins"><b>' + esc(sym) + '</b><span>USDT</span><i class="caret"></i></button><div class="thp"><b id="px">' + fP(S.prices[sym]) + '</b><span id="chg"></span></div></div>' +
    '<div class="tools"><div class="seg">' + Object.keys(IVS).map((k) => '<button data-act="iv" data-id="' + k + '" class="' + (k === state.settings.interval ? 'on' : '') + '">' + IVS[k][0] + '</button>').join('') + '</div>' +
    (state.rank >= 3 ? '<button class="chip' + (state.settings.ma ? ' on' : '') + '" data-act="ma">MA20</button>' : '') + '<button class="chip' + (state.settings.fib ? ' on' : '') + '" data-act="fib">0.618</button><span class="sp"></span></div>' +
    '<div class="chartwrap"><canvas id="chart" aria-label="' + esc(sym) + ' K 線圖"></canvas><div class="chartmsg" id="chartMsg">圖表載入中</div></div>' +
    '<div class="strip" id="strip"></div>' +
    '<div class="tbar" id="bar"></div>' + (WIDE.matches ? '<aside class="sidepane" id="side"></aside>' + (XL.matches ? '<aside class="coinpane" id="cpane"></aside>' : '') : '') + '</div>';
}
function stripHTML() {
  const pos = curPos().slice().sort((a, b) => (a.owner === 'team') - (b.owner === 'team'));
  const others = state.positions.length - pos.length;
  const ords = state.orders.length;
  const dl = TS.delegs.find((d) => d.sym === state.settings.sym);
  if (!pos.length && dl) return '<button class="strip-in" data-act="book"><span class="sl"><span><span class="side ' + delegTagCls(dl) + '">' + delegLabel(dl) + '</span>' + esc(dl.sym) + '</span><small>' + (dl.side === 'any' ? '團隊在判斷方向' : '團隊在等好的進場點') + '　剩 ' + fLeft(dl.until - Date.now()) + '</small></span><span class="sr"><b class="wait">等待中</b><small>點這裡可以取消</small></span></button>';
  if (pos.length) {
    const p = pos[0];
    const px = S.prices[p.sym] > 0 ? S.prices[p.sym] : p.entry;
    const v = E.posValue(p, px) - p.margin;
    const r = posR(p, px);
    const extra = [pos.length > 1 ? '同幣還有 ' + (pos.length - 1) + ' 筆' : '', others ? '其他持倉 ' + others : '', ords ? '掛單 ' + ords : ''].filter(Boolean).join('　');
    return '<button class="strip-in" data-act="book"><span class="sl"><span>' + (p.owner === 'team' ? '<span class="who">團隊</span>' : '') + '<span class="side ' + (p.side === 'long' ? 'up' : 'down') + '">' + (p.side === 'long' ? '買漲' : '買跌') + (p.lev > 1 ? ' ' + p.lev + 'x' : '') + '</span>' + fQ(p.qty) + ' ' + esc(p.sym) + '</span><small>進場 ' + fP(p.entry) + '　打平 ' + fP(breakeven(p)) + (extra ? '　' + extra : '') + '</small></span><span class="sr"><b class="' + cls(v) + '">' + fS(v) + '</b><small class="' + cls(v) + '">' + fPct(v / p.margin) + (r != null ? '　' + fR(r) : '') + '</small></span></button>';
  }
  const eq = E.equity(state, S.prices);
  const ns = nextStep();
  return '<div class="strip-in idle"><button class="sl" data-act="book"><span>總資產 <b>' + fU(eq) + '</b></span><small>可用 ' + fU(state.cash) + (others ? '　持倉 ' + others : '') + (ords ? '　掛單 ' + ords : '') + (TS.delegs.length ? '　委託 ' + TS.delegs.length : '') + '</small></button>' + (ns ? '<button class="nx" data-act="' + (ns.lesson ? 'lesson' : 'go') + '" data-id="' + (ns.lesson || ns.go) + '"><small>' + esc(ns.small) + '</small><span>' + esc(ns.short || ns.text) + '</span></button>' : '') + '</div>';
}
function hdrEq() {
  const v = $('#eqVal');
  if (!v) return;
  const eq = E.equity(state, S.prices);
  let un = 0;
  for (const p of state.positions) un += E.posValue(p, S.prices[p.sym] > 0 ? S.prices[p.sym] : p.entry) - p.margin;
  v.textContent = fU(eq);
  const sub = $('#eqSub');
  const t = '可用 ' + fU(state.cash) + (state.positions.length ? '　未實現 ' + fS(un) : '');
  if (sub.textContent !== t) sub.textContent = t;
  const c = state.positions.length ? cls(un) : '';
  if (sub.dataset.c !== c) { sub.dataset.c = c; sub.className = c; }
}
function tickUI() {
  hdrEq();
  if (S.view === 'trade') renderSide();
  if (S.view === 'trade' && $('#px')) {
    const sym = state.settings.sym;
    $('#px').textContent = fP(S.prices[sym]);
    const c = S.chg[sym];
    const ce = $('#chg');
    ce.textContent = c == null ? '' : fPct(c);
    ce.className = c == null ? '' : cls(c);
    patch($('#strip'), stripHTML());
    if (S.barMode === 'trade') {
      const a = $('#amtUsd');
      if (a) a.textContent = fU(orderAmount().amount);
      if ((curPos().length > 0) !== !!$('#bar [data-act="flat"]')) renderBar();
    }
  }
  if (S.sheetKind === 'book') renderBook(true);
  if (S.sheetKind === 'coins') renderCoins(true);
}

function nextStep() {
  for (const l of LESSONS) {
    if (lessonDone(l.id)) continue;
    if (l.rank > state.rank) break;
    if (!(l.id === 1 || lessonDone(l.id - 1))) break;
    const st = state.lessons[l.id];
    if (st && st.read && l.task && !state.flags[l.task.flag]) return { small: '第 ' + l.id + ' 關任務', text: l.task.text, short: '看任務', lesson: l.id };
    return { small: '下一步', text: '第 ' + l.id + ' 關　' + l.title, short: '第 ' + l.id + ' 關 ' + l.title, lesson: l.id };
  }
  const r = E.requirements(state);
  if (r.ready) return { small: '可以升級了', text: state.rank >= 5 ? '完成結業' : '升上段位 ' + (state.rank + 1), go: 'learn' };
  const u = r.list.find((x) => !x.done);
  if (u) return { small: '升段進度', text: u.label + '　' + u.prog, short: u.prog, go: 'learn' };
  return null;
}
