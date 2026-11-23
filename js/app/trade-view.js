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
    if (pos && pos.owner !== 'team') {
      btns.push('<button class="act down-o" data-act="xsl">設為停損</button>');
      btns.push('<button class="act up-o" data-act="xtp">設為停利</button>');
    }
    if (price && cur && price < cur) btns.push('<button class="act solid" data-act="xlimit" data-id="long">在此掛單買漲</button>');
    else if (price && cur && price > cur) btns.push('<button class="act solid" data-act="xlimit" data-id="short">在此掛單買跌</button>');
    btns.push('<button class="act" data-act="xalert">在此提醒</button>');
    bar.innerHTML = '<div class="crossbar"><span class="cp"><small>十字線</small><b id="crossPx">' + fP(price) + '</b></span>' + btns.join('') + '<button class="x" data-act="xclose" aria-label="關閉十字線">✕</button></div>';
    return;
  }
  S.barMode = 'trade';
  const { amount, lev } = orderAmount();
  const pos = curPos();
  const tj = state.settings.judge === 'team';
  const lim = state.settings.ordType === 'limit';
  const judge = '<div class="seg wide judge"><button data-act="judge" data-id="me" class="' + (tj ? '' : 'on') + '">自己判斷</button><button data-act="judge" data-id="team" class="' + (tj ? 'on' : '') + '">交給團隊</button></div>';
  const amt = '<button class="amt" data-act="ticket" aria-label="下單設定"><small>' + (tj ? '每筆' : lim ? '限價' : '市價') + (lev > 1 ? ' ' + lev + 'x' : '') + '</small><b>' + Math.round(state.settings.amtPct * 100) + '%</b><span id="amtUsd">' + fU(amount) + '</span></button>';
  const flat = pos.length ? '<button class="act flat" data-act="flat">平倉</button>' : '';
  if (tj) {
    bar.innerHTML = judge + '<div class="tradebar">' + amt + '<button class="act solid ask" data-act="askTeam">請團隊判斷 ' + esc(sym) + '<small>漲或跌由團隊決定，沒把握就不做</small></button>' + flat + '</div>' +
      '<div class="dirrow"><span>自己有把握方向時</span><button data-act="buy" data-id="long" class="up-t">委託買漲</button><button data-act="buy" data-id="short" class="down-t">委託買跌</button></div>';
    return;
  }
  bar.innerHTML = judge + '<div class="tradebar">' + amt +
    '<button class="act buy" data-act="buy" data-id="long">' + (lim ? '掛單買漲<small>' + fP(S.limitPx) + '</small>' : '買漲') + '</button>' +
    '<button class="act sell" data-act="buy" data-id="short">' + (lim ? '掛單買跌<small>' + fP(S.limitPx) + '</small>' : '買跌') + '</button>' + flat + '</div>';
}

function tradeBuy(side, confirmed, plan) {
  const sym = state.settings.sym;
  if (!plan && state.settings.judge === 'team') return createDeleg(side);
  if (!canTrade(sym)) return toast(S.mode === 'connecting' ? '行情連線中，請稍等' : '行情連線中斷，暫時不能下單');
  const { amount, lev, eq } = orderAmount();
  if (amount < E.MIN_AMOUNT) return toast(state.positions.length || state.orders.length ? '可用資金不夠，先平倉或取消掛單' : '可用資金不夠');
  const cur = S.prices[sym];
  const limit = !plan && state.settings.ordType === 'limit';
  if (limit) {
    if (!(S.limitPx > 0)) { openTicket(); return toast('先輸入限價'); }
    if (side === 'long' && S.limitPx >= cur) { openTicket(); return toast('掛單買漲的價格要低於現價 ' + fP(cur)); }
    if (side === 'short' && S.limitPx <= cur) { openTicket(); return toast('掛單買跌的價格要高於現價 ' + fP(cur)); }
  }
  const ref = limit ? S.limitPx : cur;
  const br = plan ? { sl: null, tp: null } : bracketPrices(side, ref, sym, lev);
  const ctx = ctxNow();
  if (!confirmed) {
    const w = E.warnings(state, { sym, side, lev, amount, ref, ctx, sl: plan ? 1 : br.sl, tp: br.tp }, S.prices, Date.now()).filter((x) => !(plan ? /停損觸發時|盈虧比/ : /盈虧比/).test(x));
    const heavy = (lev === 1 && amount / eq > 0.5) || (lev > 1 && amount * lev / eq > 1);
    const risky = w.some((x) => /剛賠一筆|單日上限|超過/.test(x));
    if (heavy || risky) {
      S.pendingSide = side;
      S.pendingPlan = plan || null;
      return openSheet('info', '<h2>下單前確認</h2><div class="warns">' + w.map((x) => '<p>' + esc(x) + '</p>').join('') + '</div><div class="cta"><button class="btn quiet" data-act="x">先不要</button><button class="btn solid" data-act="confirmBuy">我知道風險，下單</button></div>');
    }
  }
  if (limit) {
    let r = E.createOrder(state, { sym, side, lev, amount, limit: ref, cur, sl: br.sl, tp: br.tp, reason: null, now: Date.now(), ctx });
    if (!r.ok && (br.sl != null || br.tp != null)) r = E.createOrder(state, { sym, side, lev, amount, limit: ref, cur, reason: null, now: Date.now(), ctx });
    if (!r.ok) return toast(r.err);
    save(); S.cross = null; render();
    return toast('掛單' + (side === 'long' ? '買漲' : '買跌') + ' @ ' + fP(ref) + (r.order.sl != null ? '　停損 ' + fP(r.order.sl) : ''));
  }
  let r = E.openPosition(state, { sym, side, lev, amount, price: cur, sl: br.sl, tp: br.tp, reason: plan ? Team.TYPES[plan.type].reason : null, now: Date.now(), ctx: plan ? null : ctx }, S.prices);
  if (!r.ok && (br.sl != null || br.tp != null)) r = E.openPosition(state, { sym, side, lev, amount, price: cur, reason: null, now: Date.now(), ctx }, S.prices);
  if (!r.ok) return toast(r.err);
  if (plan) {
    const px = S.prices[sym];
    const long = side === 'long';
    const okS = long ? plan.plan.stop < px : plan.plan.stop > px;
    const okT = long ? plan.plan.target > px : plan.plan.target < px;
    const rr = E.setStops(state, r.pos.id, okS ? roundP(plan.plan.stop) : null, okT ? roundP(plan.plan.target) : null, px, true);
    if (!rr.ok || r.pos.sl == null) autoBracket(r.pos);
  }
  save();
  S.cross = null;
  render();
  toast((side === 'long' ? '買漲 ' : '買跌 ') + fQ(r.pos.qty) + ' ' + sym + (lev > 1 ? ' ' + lev + 'x' : '') + ' @ ' + fP(r.pos.entry) + (r.pos.sl != null ? '　停損 ' + fP(r.pos.sl) : '　沒有停損'));
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
  if (act === 'xalert') { hideCross(); return addAlert(price); }
  if (act === 'xlimit') {
    if (!canTrade(sym)) return toast('行情連線中斷，暫時不能下單');
    const { amount, lev } = orderAmount();
    if (amount < E.MIN_AMOUNT) return toast('可用資金不夠');
    const br = bracketPrices(side, price, sym, lev);
    let r = E.createOrder(state, { sym, side, lev, amount, limit: price, cur, sl: br.sl, tp: br.tp, reason: null, now: Date.now(), ctx: ctxNow() });
    if (!r.ok && (br.sl != null || br.tp != null)) r = E.createOrder(state, { sym, side, lev, amount, limit: price, cur, reason: null, now: Date.now(), ctx: ctxNow() });
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
  const st = state.settings;
  const nInd = ['ma', 'ema', 'boll', 'fib'].filter((k) => st[k]).length + (st.sub !== 'none' ? 1 : 0);
  return '<div class="tv">' +
    '<div class="th"><div class="thc"><div class="thl"><button class="symbtn" data-act="coins"><b>' + esc(sym) + '</b><span>USDT</span><i class="caret"></i></button><button class="ib favb' + (isFav(sym) ? ' on' : '') + '" data-act="fav" aria-label="自選">' + ICON.star + '</button><span id="bellBox">' + bellHTML() + '</span></div><div class="t24" id="t24">' + t24HTML() + '</div></div><div class="thp"><b id="px">' + fP(S.prices[sym]) + '</b><span id="chg"></span></div></div>' +
    '<div class="tools"><div class="seg ivs">' + Object.keys(IVS).map((k) => '<button data-act="iv" data-id="' + k + '" class="' + (k === st.interval ? 'on' : '') + '">' + IVS[k][0] + '</button>').join('') + '</div>' +
    '<button class="chip indb' + (nInd ? ' on' : '') + '" data-act="ind">指標' + (nInd ? ' ' + nInd : '') + '</button><span class="sp"></span></div>' +
    '<div class="chartwrap"><canvas id="chart" aria-label="' + esc(sym) + ' K 線圖"></canvas><div class="chartmsg" id="chartMsg">圖表載入中</div></div>' +
    '<div class="strip" id="strip"></div>' +
    '<div class="tbar" id="bar"></div>' + (WIDE.matches ? '<aside class="sidepane" id="side"></aside>' + (XL.matches ? '<aside class="coinpane" id="cpane"></aside>' : '') : '') + '</div>';
}
function stripHTML() { return paneHTML(); }
function hdrEq() {
  const v = $('#eqVal');
  if (!v) return;
  const eq = E.equity(state, S.prices);
  let un = 0;
  for (const p of state.positions) un += E.posValue(p, S.prices[p.sym] > 0 ? S.prices[p.sym] : p.entry) - p.margin;
  v.textContent = fU(eq);
  const sub = $('#eqSub');
  const u2 = Math.round(un * 100) / 100;
  const h = '可用 ' + fU(state.cash) + (state.positions.length ? '　<span class="' + cls(u2) + '">未實現 ' + fS(u2) + '</span>' : '');
  if (sub.dataset.h !== h) { sub.dataset.h = h; sub.innerHTML = h; sub.className = ''; }
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
    patchT24();
    if (S.barMode === 'trade') {
      const a = $('#amtUsd');
      if (a) a.textContent = fU(orderAmount().amount);
      if ((curPos().length > 0) !== !!$('#bar [data-act="flat"]')) renderBar();
    }
  }
  if (S.sheetKind === 'book') renderBook(true);
  if (S.sheetKind === 'coins') renderCoins(true);
  if (S.sheetKind === 'ticket') refreshTicketEst();
}

function nextStep() {
  for (const l of LESSONS) {
    if (lessonDone(l.id)) continue;
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
