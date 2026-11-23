function lessonOpen() {
  return true;
}

function viewLearn() {
  const r = E.RANKS[state.rank];
  const req = E.requirements(state);
  const next = state.rank < 5 ? E.RANKS[state.rank + 1] : null;
  let ladder = '';
  for (let i = 1; i <= 5; i++) ladder += '<i class="' + (i < state.rank ? 'done' : i === state.rank ? 'now' : '') + '"></i>' + (i < 5 ? '<u class="' + (i < state.rank ? 'done' : '') + '"></u>' : '');
  const labels = [1, 2, 3, 4, 5].map((i) => '<span class="' + (i === state.rank ? 'now' : '') + '">' + E.RANKS[i].name + '</span>').join('');
  return (
    '<section style="margin-top:14px"><h3>目前段位</h3><h2>段位 ' + state.rank + '　' + r.name + (state.graduated ? '　已結業' : '') + '</h2><div class="sub">全部功能都已開放：最高 ' + E.MAX_LEV + ' 倍槓桿、買跌、停損停利、限價單、全部幣種。段位是你的成績：升級代表方法和紀律被紀錄證明，資金也會增加。</div><div class="ladder">' + ladder + '</div><div class="ladder-labels">' + labels + '</div></section>' +
    (state.graduated ? '<section><h3>結業</h3><p style="color:var(--ink2);font-size:14px;line-height:1.9">你完成了全部段位。你證明的是方法和紀律，不是未來的獲利。繼續練習，或回頭重看任何一關。</p></section>' :
      '<section><h3>' + (next ? '升上段位 ' + next.n + ' ' + next.name + ' 的條件' : '結業條件') + '</h3><ul class="reqs">' + req.list.map((x) => '<li class="' + (x.done ? 'done' : '') + '">' + esc(x.label) + '<span>' + esc(x.prog) + '</span></li>').join('') + '</ul><div class="cta"><button class="btn solid" data-act="promote"' + (req.ready ? '' : ' disabled') + '>' + (next ? '升上段位 ' + next.n : '完成結業') + '</button></div>' + (next ? '<div class="sub" style="margin-top:10px">升級後：資金增加到 ' + fU(next.cap) + ' USDT</div>' : '') + '</section>') +
    '<section><h3>課程</h3><div class="list">' + LESSONS.map((l) => {
      const done = lessonDone(l.id), open = lessonOpen(l);
      const st = done ? '完成' : open ? (state.lessons[l.id] && state.lessons[l.id].read ? '繼續' : '開始') : l.rank > state.rank ? '段位 ' + l.rank + ' 解鎖' : '先完成上一關';
      return '<button class="row lesson' + (open || done ? '' : ' locked') + '" data-act="lesson" data-id="' + l.id + '"' + (open || done ? '' : ' disabled') + '><span class="no">' + String(l.id).padStart(2, '0') + '</span><span class="body"><b>' + esc(l.title) + '</b><span class="sub">' + esc(l.sub) + '</span></span><span class="st' + (!done && open ? ' go' : '') + '">' + st + '</span></button>';
    }).join('') + '</div></section>' +
    '<section><div class="list"><button class="row lesson" data-act="gloss"><span class="body"><b>名詞小辭典</b><span class="sub">所有術語的白話解釋</span></span><i class="chev"></i></button></div></section>'
  );
}

function viewStats() {
  const sv = state.settings.statsView;
  const T = sv === 'me' ? E.mine(state) : sv === 'team' ? state.trades.filter((t) => t.owner === 'team') : state.trades;
  const st = E.statsFor(T);
  const recent = E.statsFor(E.mine(state).slice(-60));
  const who = sv === 'me' ? '你自己' : sv === 'team' ? '團隊' : '全部';
  const eq = E.equity(state, S.prices);
  const wk = E.weaknesses(state);
  const rs = T.filter((t) => t.r != null);
  const avgR = rs.length ? rs.reduce((a, t) => a + t.r, 0) / rs.length : null;
  let luck, w = 0;
  if (recent.n < 20) luck = '還要 ' + (20 - recent.n) + ' 筆交易才能判斷。筆數太少的時候，賺賠大多是運氣。';
  else {
    w = Math.min(99, Math.round(recent.conf * 100));
    if (recent.exp <= 0) luck = '最近 ' + recent.n + ' 筆平均每筆是賠的。先看下面「最該改的地方」。';
    else if (recent.conf >= 0.9) luck = '照你最近 ' + recent.n + ' 筆的成績，有 ' + w + '% 的把握不是運氣。';
    else luck = '最近 ' + recent.n + ' 筆是賺的，但只有 ' + w + '% 的把握不是運氣。要到 90% 才算穩定。';
  }
  const m = (label, val, c, term) => '<button class="metric" data-act="term" data-t="' + term + '"><label>' + label + '</label><b class="' + (c || '') + '">' + val + '</b></button>';
  return (
    '<section style="margin-top:14px"><h3 class="hrow">總資產<button class="lnk" data-act="funds">調整資金</button></h3><div class="big">' + fU(eq) + '<small>USDT</small></div><div class="sub">約 NT$ ' + Math.round(eq * TWD).toLocaleString('en-US') + '　已實現損益合計 <span class="' + cls(st.pnl) + '">' + fS(st.pnl) + '</span></div><canvas class="spark" id="spark"></canvas></section>' +
    '<div class="seg wide sview" style="margin-top:22px">' + [['all', '全部'], ['me', '我'], ['team', '團隊']].map(([k, l]) => '<button data-act="sview" data-id="' + k + '" class="' + (sv === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>' +
    '<section style="margin-top:18px"><h3>' + who + '的成績</h3><div class="grid">' +
    m('交易筆數', st.n, '', '勝率') + m('勝率', st.n ? Math.round(st.winRate * 100) + '%' : '—', '', '勝率') +
    m('平均每筆賺', st.wins ? fPct(st.avgWin) : '—', 'up', '盈虧比') + m('平均每筆賠', st.losses ? fPct(st.avgLoss) : '—', 'down', '盈虧比') +
    m('期望值（每筆）', st.n ? fPct(st.exp) : '—', st.n ? cls(st.exp) : '', '期望值') + m('平均 R', avgR == null ? '—' : fR(avgR), avgR == null ? '' : cls(avgR), '盈虧比') +
    m('最大回撤', (state.maxDD * 100).toFixed(1) + '%', '', '最大回撤') + m('有停損的比例', st.n ? Math.round(st.slRate * 100) + '%' : '—', '', '停損') +
    '</div><div class="sub" style="margin-top:8px">賺賠的百分比以當時的總資產計算。R 是賺賠除以停損距離。點任何一格看解釋。</div></section>' +
    '<section><h3>是實力還是運氣　只看你自己的單</h3><div class="meter"><i style="width:' + w + '%"></i><u></u></div><p style="font-size:14px;color:var(--ink2);line-height:1.8">' + luck + '</p></section>' +
    '<section><h3>你現在最該改的地方　只看你自己的單</h3>' + (wk.length ? '<div class="list">' + wk.map((x) => '<button class="row lesson" data-act="lesson" data-id="' + x.lesson + '"><span class="body"><b>' + esc(x.title) + '</b><span class="sub">' + esc(x.detail) + '　重看第 ' + x.lesson + ' 關</span></span><i class="chev"></i></button>').join('') + '</div>' : '<div class="empty">' + (T.length < 8 ? '交易滿 8 筆之後，這裡會指出你最常犯的錯。' : '最近 30 筆沒有發現明顯的壞習慣。') + '</div>') + '</section>' +
    (state.rules ? '<section><h3>我的規則</h3><div class="list"><div class="row"><div class="row-main"><span>每筆最多賠</span><b>' + (state.rules.risk * 100).toFixed(0) + '%</b></div></div><div class="row"><div class="row-main"><span>一天最多賠</span><b>' + (state.rules.day * 100).toFixed(0) + '%</b></div></div><div class="row"><div class="row-main"><span>盈虧比最低</span><b>' + state.rules.rr + '</b></div></div></div></section>' : '') +
    '<section><h3>' + who + '的交易紀錄</h3>' + (T.length ? '<div class="list">' + T.slice(-40).reverse().map((t) => '<button class="row" data-act="trade" data-id="' + t.id + '"><div class="row-main"><div><b>' + esc(t.sym) + '</b>' + (t.owner === 'team' ? '<span class="tag who-t">' + (t.src === 'deleg' ? '委託團隊' : '團隊') + '</span>' : '') + '<span class="tag">' + (t.side === 'long' ? '買漲' : '買跌') + (t.lev > 1 ? ' ' + t.lev + 'x' : '') + '</span><div class="sub">' + fT(t.t1) + '　' + WHY[t.why] + '　' + (E.REASONS[t.reason] || '未選理由') + '</div></div><div class="right"><b class="' + cls(t.pnl) + '">' + fS(t.pnl) + '</b><div class="sub">' + fPct(t.pct) + (t.r != null ? '　' + fR(t.r) : '') + '</div></div></div></button>').join('') + '</div>' : '<div class="empty">還沒有完成的交易。</div>') + '</section>' +
    compareHTML() +
    '<section><h3>設定</h3><div class="list"><button class="row" data-act="sync"><div class="row-main"><span>雲端同步（GitHub）</span><span class="sub">' + esc(syncStatus()) + '</span></div></button><div class="row"><button class="toggle" role="switch" aria-checked="' + state.settings.twColors + '" data-act="tw"><span>紅漲綠跌<span class="sub" style="display:block">台股的習慣。預設是綠漲紅跌。</span></span><i class="sw"></i></button></div><div class="row"><div class="row-main"><span>行情來源</span><span class="sub">' + (S.mode === 'live' ? '幣安公開行情（即時）' : S.mode === 'sim' ? '系統模擬（練習用）' : '連線中') + '</span></div></div><div class="row"><div class="row-main"><span>幣種</span><span class="sub">24 小時成交額 100 萬美元以上的加密貨幣（最多 250 個、至少 50 個）</span></div></div><div class="row"><div class="row-main"><span>匯率</span><span class="sub">固定以 1 USDT ≈ ' + TWD + ' 台幣估算</span></div></div><div class="row"><button class="toggle" data-act="reset"><span style="color:var(--down)">清除全部資料，從頭開始</span><i class="chev"></i></button></div></div></section>'
  );
}
function drawSpark() {
  const c = $('#spark');
  if (!c) return;
  const W = c.clientWidth, H = c.clientHeight;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pts = state.eqHist.map((p) => p.e).concat([E.equity(state, S.prices)]);
  const cs = getComputedStyle(document.documentElement);
  if (pts.length < 3) { g.fillStyle = cs.getPropertyValue('--muted'); g.font = '12px ' + cs.getPropertyValue('--font'); g.fillText('完成幾筆交易後，這裡會畫出你的資產變化', 0, H / 2); return; }
  let lo = Math.min(...pts), hi = Math.max(...pts);
  if (hi === lo) { hi += 1; lo -= 1; }
  const x = (i) => (i / (pts.length - 1)) * (W - 6) + 1;
  const y = (v) => 4 + ((hi - v) / (hi - lo)) * (H - 10);
  g.beginPath();
  pts.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
  g.strokeStyle = cs.getPropertyValue('--ink'); g.lineWidth = 1.25; g.stroke();
  g.lineTo(x(pts.length - 1), H); g.lineTo(x(0), H); g.closePath();
  g.globalAlpha = 0.05; g.fillStyle = cs.getPropertyValue('--ink'); g.fill(); g.globalAlpha = 1;
  g.beginPath(); g.arc(x(pts.length - 1), y(pts[pts.length - 1]), 3, 0, 7); g.fillStyle = cs.getPropertyValue('--accent'); g.fill();
}

function render() {
  const v = $('#view');
  const top = v.scrollTop;
  v.classList.toggle('fixed', S.view === 'trade');
  v.innerHTML = S.view === 'trade' ? viewTrade() : S.view === 'team' ? viewTeam() : S.view === 'learn' ? viewLearn() : viewStats();
  v.scrollTop = S.view === 'trade' ? 0 : top;
  $$('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.v === S.view));
  $('#rankPill').textContent = '段位 ' + state.rank + ' ' + E.RANKS[state.rank].name;
  hdrEq();
  document.documentElement.dataset.tw = state.settings.twColors ? '1' : '0';
  setMode(S.mode, S.stale);
  if (S.view === 'trade') { bindChart(); renderBar(); tickUI(); drawChart(); }
  document.documentElement.classList.toggle('wide', !!WIDE.matches);
  if (S.view === 'stats') drawSpark();
}
function go(view) {
  S.view = view;
  S.cross = null;
  render();
  $('#view').scrollTop = 0;
  try { if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view); } catch (e) { return; }
}

function openSheet(kind, html) {
  S.sheetKind = kind;
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false;
  $('#sheetBody').scrollTop = 0;
}
function closeSheet() {
  S.sheetKind = null;
  $('#sheet').hidden = true;
  $('#sheetBody').innerHTML = '';
  setTimeout(flushQueue, 50);
}
let toastT;
function toast(msg) {
  if (CLK != null) return;
  const t = $('#toast');
  t.innerHTML = '<span>' + esc(msg) + '</span>';
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.innerHTML = ''; }, 2600);
}
function showInfo(title, lines, btn) {
  openSheet('info', '<h2>' + esc(title) + '</h2><div class="lines">' + lines.map((l) => '<p>' + esc(l) + '</p>').join('') + '</div><div class="cta"><button class="btn solid" data-act="x">' + (btn || '知道了') + '</button></div>');
}
function showReview(t, fresh) {
  S.reviewId = t.id;
  S.reviewFresh = fresh;
  const lines = E.review(t);
  const pick = !t.reason;
  openSheet('review',
    '<div class="sub">' + esc(t.sym) + '　' + (t.side === 'long' ? '買漲' : '買跌') + '　' + WHY[t.why] + '　' + fT(t.t1) + '</div><h2>' + (t.pnl >= 0 ? '這筆賺了 ' : '這筆賠了 ') + '<span class="' + cls(t.pnl) + '">' + fU(Math.abs(t.pnl)) + '</span> USDT' + (t.r != null ? '<span class="rtag ' + cls(t.r) + '">' + fR(t.r) + '</span>' : '') + '</h2>' +
    (pick ? '<div class="field"><label><span>這筆你為什麼進場？</span><span>選了才會檢討</span></label><div class="quick">' + Object.keys(E.REASONS).map((k) => '<button data-act="reason" data-id="' + k + '">' + E.REASONS[k] + '</button>').join('') + '</div></div>' : '') +
    '<div class="calc"><div><span>進場 → 出場</span><b>' + fP(t.entry) + ' → ' + fP(t.exit) + '</b></div><div><span>投入金額的報酬</span><b class="' + cls(t.pct) + '">' + fPct(t.pct) + '</b></div><div><span>佔當時總資產</span><b class="' + cls(t.ret) + '">' + fPct(t.ret) + '</b></div><div><span>手續費' + (t.funding > 0 ? '＋資金費' : '') + '</span><b>' + fU(t.fees + t.funding) + '</b></div><div><span>持有時間</span><b>' + E.fmtDur(t.t1 - t.t0) + '</b></div>' + (t.reason ? '<div><span>進場理由</span><b>' + E.REASONS[t.reason] + '</b></div>' : '') + '</div>' +
    (lines.length && !pick ? '<h3 style="margin-top:22px">檢討</h3><div class="lines" style="margin-top:0">' + lines.map((l) => '<p>' + esc(l) + '</p>').join('') + '</div>' : '') +
    '<div class="cta"><button class="btn ' + (pick ? 'quiet' : 'solid') + '" data-act="x">' + (pick ? '先不選' : fresh ? '知道了' : '關閉') + '</button></div>');
}
function holdInfo(s) {
  const P = state.positions.filter((p) => p.sym === s);
  const O = state.orders.filter((o) => o.sym === s);
  const D = TS.delegs.filter((d) => d.sym === s);
  if (!P.length && !O.length && !D.length) return '';
  let pnl = 0, margin = 0;
  const parts = [];
  for (const p of P) {
    const px = S.prices[s] > 0 ? S.prices[s] : p.entry;
    pnl += E.posValue(p, px) - p.margin;
    margin += p.margin;
  }
  if (P.length) {
    const sides = Array.from(new Set(P.map((p) => (p.side === 'long' ? '買漲' : '買跌'))));
    const qty = P.reduce((a, p) => a + p.qty, 0);
    parts.push((P.some((p) => p.owner === 'team') ? '<span class="who">團隊</span>' : '') + '<span class="hold-side ' + (P[0].side === 'long' ? 'up' : 'down') + '">' + sides.join('／') + '</span>' + fQ(qty) + ' 顆　<b class="' + cls(pnl) + '">' + fS(pnl) + '</b> <span class="' + cls(pnl) + '">' + fPct(pnl / margin) + '</span>');
  }
  if (O.length) parts.push('掛單 ' + O.length + ' 張');
  if (D.length) parts.push('<span class="who">' + (D[0].side === 'any' ? '請團隊判斷' : '委託團隊') + '</span>' + (D[0].side === 'any' ? '' : '<span class="hold-side ' + (D[0].side === 'long' ? 'up' : 'down') + '">' + SIDE[D[0].side] + '</span>') + '等進場　剩 ' + fLeft(D[0].until - Date.now()));
  return '<span class="hold">' + parts.join('　') + '</span>';
}
const COIN_CACHE = { key: '', t: 0, html: '' };
const coinQ = () => (typeof S.coinQ === 'string' ? S.coinQ : '');
function coinRows() {
  const held = Array.from(new Set(state.positions.map((p) => p.sym).concat(state.orders.map((o) => o.sym), TS.delegs.map((d) => d.sym))));
  const q = coinQ();
  const key = q + '|' + state.settings.sym + '|' + held.join(',') + '|' + state.favs.join(',') + '|' + S.coins.length + '|' + S.coins[0];
  const now = Date.now();
  if (COIN_CACHE.key === key && now - COIN_CACHE.t < 1000) return COIN_CACHE.html;
  const seen = new Set();
  const list = [];
  for (const s of held.concat(state.favs, S.coins, [state.settings.sym])) if (!seen.has(s)) { seen.add(s); list.push(s); }
  const shown = q ? list.filter((s) => s.indexOf(q) >= 0).sort((a, b) => (b.indexOf(q) === 0) - (a.indexOf(q) === 0)) : list;
  if (!shown.length) { COIN_CACHE.key = key; COIN_CACHE.t = now; COIN_CACHE.html = '<div class="empty">找不到「' + esc(q) + '」。團隊只看 24 小時成交額 100 萬美元以上的幣。</div>'; return COIN_CACHE.html; }
  COIN_CACHE.key = key; COIN_CACHE.t = now;
  COIN_CACHE.html = shown.map((s) => {
    const h = holdInfo(s);
    return '<button class="row coin' + (s === state.settings.sym ? ' on' : '') + (h ? ' held' : '') + '" data-act="sym" data-id="' + esc(s) + '"><span class="rk">' + (S.coins.indexOf(s) + 1 || '·') + '</span><span class="nm"><b>' + esc(s) + (isFav(s) ? '<i class="fv">' + ICON.star + '</i>' : '') + '</b><small>' + (S.vol[s] ? '成交額 ' + fVol(S.vol[s]) : '') + '</small>' + h + '</span><span class="pr"><b>' + fP(S.prices[s]) + '</b><small class="' + cls(S.chg[s] || 0) + '">' + (S.chg[s] != null ? fPct(S.chg[s]) : '') + '</small></span></button>';
  }).join('');
  return COIN_CACHE.html;
}
const coinSearch = (id) => '<div class="coinq"><input id="' + id + '" type="search" inputmode="search" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" maxlength="15" placeholder="搜尋幣種，例如 SOL" value="' + esc(coinQ()) + '" aria-label="搜尋幣種"></div>';
function coinsHead() {
  const held = new Set(state.positions.map((p) => p.sym));
  const ords = state.orders.length;
  let pnl = 0;
  for (const p of state.positions) pnl += E.posValue(p, S.prices[p.sym] > 0 ? S.prices[p.sym] : p.entry) - p.margin;
  const dl = TS.delegs.length;
  if (!held.size && !ords && !dl) return '<div class="sub">目前沒有持倉。</div>';
  return '<div class="hold-sum">持倉中 <b>' + held.size + '</b> 個幣' + (ords ? '　掛單 <b>' + ords + '</b> 張' : '') + (dl ? '　委託團隊 <b>' + dl + '</b> 個' : '') + (held.size ? '　未實現 <b class="' + cls(pnl) + '">' + fS(pnl) + '</b>' : '') + '</div>';
}
function renderCoins(soft) {
  if (soft) { const el = $('.coins-list'), h = coinRows(); if (el && el.__h !== h) { patch(el, h); el.__h = h; } patch($('#coinsHead'), coinsHead()); return; }
  openSheet('coins', '<h2>選擇幣種</h2><div class="sub">' + (S.mode === 'sim' ? '練習行情：固定 10 種幣' : '24 小時成交額 100 萬美元以上的加密貨幣共 ' + S.coins.length + ' 個，團隊每 5 分鐘全部檢查一次；排除穩定幣與股票代幣，每 30 分鐘更新') + '</div>' + (S.mode === 'sim' ? '' : coinSearch('coinQ')) + '<div id="coinsHead">' + coinsHead() + '</div><div class="list coins-list">' + coinRows() + '</div><div class="cta"><button class="btn quiet" data-act="x">關閉</button></div>');
}
function renderBook(soft) {
  const html = '<h2>持倉與掛單</h2>' + bookBody() +
    '<div class="cta"><button class="btn solid" data-act="x">關閉</button></div>';
  if (soft) { patch($('#sheetBody'), html); return; }
  openSheet('book', html);
}
function fundsLine() {
  return '<div class="fline"><div><span>總資產</span><b>' + fU(E.equity(state, S.prices)) + '</b></div><div><span>可用</span><b>' + fU(state.cash) + '</b></div><button class="btn sm" data-act="funds">調整資金</button></div>';
}
function openFunds(soft) {
  const eq = E.equity(state, S.prices);
  const F = state.flows || [];
  const add = F.filter((f) => f.amt > 0).reduce((a, f) => a + f.amt, 0), sub = F.filter((f) => f.amt < 0).reduce((a, f) => a - f.amt, 0);
  const team = state.settings.teamPct;
  const html = '<h2>調整資金</h2><div class="sub">模擬資金，想加多少、減多少都可以。加減的錢不算賺賠，成績和回撤照常計算。' + (team > 0 ? '團隊用總資產的 ' + team * 100 + '% 交易，額度會跟著變。' : '') + '</div>' +
    '<div class="calc"><div><span>總資產</span><b>' + fU(eq) + ' USDT</b></div><div><span>可用（能減少的上限）</span><b>' + fU(state.cash) + ' USDT</b></div>' + (F.length ? '<div><span>累計加入／減少</span><b><span class="up">+' + fU(add) + '</span>　<span class="down">−' + fU(sub) + '</span></b></div>' : '') + '</div>' +
    '<div class="field"><label><span>金額</span><span>USDT</span></label><input class="inp" id="fundIn" type="text" inputmode="decimal" autocomplete="off" maxlength="14" placeholder="例如 10000" aria-label="要調整的金額"><div class="quick">' + [1000, 10000, 100000].map((v) => '<button data-act="fundQ" data-id="' + v + '">' + v.toLocaleString('en-US') + '</button>').join('') + '<button data-act="fundQ" data-id="all">全部可用</button></div></div>' +
    '<div class="cta"><button class="btn" data-act="fundGo" data-id="-1">減少</button><button class="btn solid" data-act="fundGo" data-id="1">加入</button></div>' +
    (F.length ? '<h3 style="margin-top:22px">最近調整</h3><div class="list">' + F.slice(-6).reverse().map((f) => '<div class="row"><div class="row-main"><div><b class="' + (f.amt > 0 ? 'up' : 'down') + '">' + (f.amt > 0 ? '加入 ' : '減少 ') + fU(Math.abs(f.amt)) + '</b><div class="sub">' + fT(f.t) + '</div></div></div></div>').join('') + '</div>' : '') +
    '<div class="cta"><button class="btn quiet" data-act="x">完成</button></div>';
  if (soft && S.sheetKind === 'funds') { patch($('#sheetBody'), html); return; }
  openSheet('funds', html);
}
function fundGo(sign) {
  const el = $('#fundIn');
  const v = el ? parseFloat(String(el.value || '').replace(/[^0-9.]/g, '')) : NaN;
  if (!(v > 0)) { toast('先輸入金額'); return; }
  const r = E.adjustFunds(state, sign * v, Date.now(), S.prices);
  if (!r.ok) { toast(r.err); return; }
  save();
  toast((r.amt > 0 ? '已加入 ' : '已減少 ') + fU(Math.abs(r.amt)) + ' USDT');
  openFunds(true);
  tickUI();
  renderBar();
  if (S.view === 'stats') render();
  else if (S.view === 'trade') render();
}
function bookBody() {
  const P = state.positions, O = state.orders;
  return fundsLine() + (P.length ? '<div class="list">' + P.map((p) => {
      const px = S.prices[p.sym] > 0 ? S.prices[p.sym] : p.entry;
      const v = E.posValue(p, px) - p.margin;
      const r = posR(p, px);
      return '<div class="row"><div class="row-main"><div><b>' + esc(p.sym) + '</b>' + (p.owner === 'team' ? '<span class="tag who-t">' + (p.hand ? '你交給團隊' : '團隊管') + '</span>' : '') + '<span class="tag">' + (p.side === 'long' ? '買漲' : '買跌') + (p.lev > 1 ? ' ' + p.lev + 'x' : '') + '</span><div class="sub">' + fQ(p.qty) + ' 顆　進場 ' + fP(p.entry) + '　打平 ' + fP(breakeven(p)) + '</div><div class="sub">' + (p.sl != null ? '停損 ' + fP(p.sl) : '未設停損') + '　' + (p.tp != null ? '停利 ' + fP(p.tp) : '未設停利') + (E.isLev(p) ? '　強平 ' + fP(p.liq) : '') + '</div></div><div class="right"><b class="' + cls(v) + '">' + fS(v) + '</b><div class="sub">' + fPct(v / p.margin) + (r != null ? '　' + fR(r) : '') + '</div></div></div><div class="row-actions"><button class="btn sm" data-act="closeId" data-id="' + p.id + '">平倉</button>' + handBtn(p) + (p.sym !== state.settings.sym ? '<button class="btn sm" data-act="sym" data-id="' + esc(p.sym) + '">看圖</button>' : '') + '</div></div>';
    }).join('') + '</div>' : '<div class="empty">沒有持倉。</div>') +
    (TS.delegs.length ? '<h3 style="margin-top:22px">交給團隊　' + TS.delegs.length + ' 個</h3><div class="list">' + TS.delegs.map((d) => delegRow(d, Date.now(), true)).join('') + '</div>' : '') +
    '<h3 style="margin-top:22px">掛單</h3>' + (O.length ? '<div class="list">' + O.map((o) => '<div class="row"><div class="row-main"><div><b>' + esc(o.sym) + '</b><span class="tag">' + (o.side === 'long' ? '掛單買漲' : '掛單買跌') + (o.lev > 1 ? ' ' + o.lev + 'x' : '') + '</span><div class="sub">到 ' + fP(o.limit) + ' 成交　金額 ' + fU(o.amount) + '</div></div><div class="right"><button class="btn sm" data-act="cancel" data-id="' + o.id + '">取消</button></div></div></div>').join('') + '</div>' : '<div class="empty">沒有掛單。點一下走勢圖就能掛單。</div>') +
    '';
}
function openAmount() { return openTicket(); }

const FIG = {
  candle: '<svg viewBox="0 0 220 170" role="img" aria-label="一根上漲 K 線的四個價格"><g fill="none" stroke="var(--up)" stroke-width="1.5"><line x1="60" y1="14" x2="60" y2="156"/></g><rect x="44" y="50" width="32" height="74" fill="var(--up)"/><g font-size="11" fill="var(--ink2)" font-family="inherit"><text x="96" y="18">最高</text><text x="96" y="54">收盤</text><text x="96" y="128">開盤</text><text x="96" y="160">最低</text><text x="150" y="91" fill="var(--muted)">實體</text><text x="150" y="34" fill="var(--muted)">上影線</text><text x="150" y="146" fill="var(--muted)">下影線</text></g><g stroke="var(--line)"><line x1="66" y1="14" x2="92" y2="14"/><line x1="78" y1="50" x2="92" y2="50"/><line x1="78" y1="124" x2="92" y2="124"/><line x1="66" y1="156" x2="92" y2="156"/></g></svg>'
};
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function buildQuiz(l) {
  const p = S.prices.BTC > 0 ? S.prices.BTC : 68800;
  const onBtc = state.settings.sym === 'BTC';
  const cx = onBtc ? ctxNow() : null;
  const k = onBtc && S.candles.length > 2 ? S.candles[S.candles.length - 2] : null;
  const c = { p, f: fP, q: (x) => fQ(x) + ' 顆', ma: cx ? cx.ma : null, k };
  return l.quiz.map((q) => {
    const o = typeof q === 'function' ? q(c) : q;
    return { q: o.q, opts: shuffle(o.opts.map((t, i) => ({ t, ok: i === o.a }))), why: o.why };
  });
}
function openLesson(id) {
  const l = LESSONS.find((x) => x.id === id);
  if (!l) return;
  if (!(lessonOpen(l) || lessonDone(id))) { toast('第 ' + id + ' 關還沒解鎖'); return; }
  const st = state.lessons[id] || {};
  let phase = 'cards';
  if (st.read && !st.done) phase = l.task ? 'task' : 'quiz';
  S.lesson = { l, phase, i: 0, quiz: null, wrong: 0, picked: null };
  if (phase === 'quiz') S.lesson.quiz = buildQuiz(l);
  $('#page').hidden = false;
  renderLesson();
}
function closePage() {
  S.lesson = null;
  $('#page').hidden = true;
  $('#pageBody').innerHTML = '';
  render();
  setTimeout(flushQueue, 50);
}
function renderLesson() {
  const L = S.lesson;
  if (!L) return;
  const l = L.l;
  const total = l.cards.length + (l.task ? 1 : 0) + l.quiz.length;
  let pos, body, foot;
  if (L.phase === 'cards') {
    const c = l.cards[L.i];
    pos = L.i + 1;
    body = '<div class="card"><small>第 ' + l.id + ' 關　' + esc(l.title) + '</small><h2>' + esc(c.h) + '</h2><p>' + rich(c.p) + '</p>' + (c.fig ? '<div class="fig">' + FIG[c.fig] + '</div>' : '') + '</div>';
    foot = (L.i > 0 ? '<button class="btn quiet" data-act="lprev">上一頁</button>' : '') + '<button class="btn solid" data-act="lnext">' + (L.i === l.cards.length - 1 ? (lessonDone(l.id) ? '完成' : l.task ? '看任務' : '開始測驗') : '下一頁') + '</button>';
  } else if (L.phase === 'task') {
    pos = l.cards.length + 1;
    const done = !!state.flags[l.task.flag];
    let form = '';
    if (l.task.form === 'rules') {
      const cur = state.rules || { risk: 0.02, day: 0.05, rr: 2 };
      const sel = (id, label, arr, val, f) => '<div class="field"><label for="' + id + '"><span>' + label + '</span></label><select id="' + id + '">' + arr.map((v) => '<option value="' + v + '"' + (Math.abs(v - val) < 1e-9 ? ' selected' : '') + '>' + f(v) + '</option>').join('') + '</select></div>';
      form = sel('rRisk', '每筆最多賠掉總資產的', [0.01, 0.02, 0.03], cur.risk, (v) => v * 100 + '%') + sel('rDay', '一天最多賠掉總資產的', [0.03, 0.05, 0.08], cur.day, (v) => v * 100 + '%') + sel('rRr', '盈虧比最低要', [1.5, 2, 3], cur.rr, (v) => v) + '<div class="cta"><button class="btn" data-act="saveRules">' + (done ? '更新我的規則' : '訂下我的規則') + '</button></div>';
    }
    body = '<div class="card"><small>第 ' + l.id + ' 關　任務</small><h2>' + (done ? '任務完成' : '動手做一次') + '</h2><p>' + esc(l.task.text) + '</p>' + form + (done || l.task.form ? '' : '<p style="margin-top:18px;font-size:14px;color:var(--muted)">完成後回到這一關，就可以開始測驗。</p>') + '</div>';
    foot = done ? '<button class="btn solid" data-act="lquiz">開始測驗</button>' : l.task.form ? '' : '<button class="btn solid" data-act="ltrade">去交易頁</button>';
  } else if (L.phase === 'quiz') {
    const q = L.quiz[L.i];
    pos = l.cards.length + (l.task ? 1 : 0) + L.i + 1;
    const picked = L.picked;
    body = '<div class="card"><small>測驗　' + (L.i + 1) + ' / ' + L.quiz.length + '</small><h2 style="font-size:20px;line-height:1.6">' + esc(q.q) + '</h2><div class="opts">' + q.opts.map((o, i) => '<button class="opt' + (picked != null ? (o.ok ? ' right' : i === picked ? ' wrong' : '') : '') + '" data-act="pick" data-id="' + i + '"' + (picked != null ? ' disabled' : '') + '>' + esc(o.t) + '</button>').join('') + '</div>' + (picked != null ? '<p class="why"><b>' + (q.opts[picked].ok ? '答對了。' : '答錯了。') + '</b>' + esc(q.why) + '</p>' : '') + '</div>';
    foot = picked != null ? '<button class="btn solid" data-act="qnext">' + (L.i === L.quiz.length - 1 ? '看結果' : '下一題') + '</button>' : '';
  } else {
    pos = total;
    const pass = L.wrong === 0;
    const ns = pass ? nextStep() : null;
    body = '<div class="card"><small>第 ' + l.id + ' 關</small><h2>' + (pass ? '過關' : '答錯 ' + L.wrong + ' 題') + '</h2><p>' + (pass ? (ns && ns.lesson ? '下一關是「' + esc(LESSONS.find((x) => x.id === ns.lesson).title) + '」。' : '到「學習」頁看看升段的條件還差什麼。') : '全部答對才算過關。題目裡的價格會換成當下的行情，再試一次。') + '</p></div>';
    foot = pass ? '<button class="btn solid" data-act="ldone">好</button>' : '<button class="btn quiet" data-act="lreview">重看內容</button><button class="btn solid" data-act="lretry">再測一次</button>';
  }
  $('#pageBar').style.width = Math.round((pos / total) * 100) + '%';
  $('#pageBody').innerHTML = body;
  $('#pageFoot').innerHTML = foot;
  $('#pageFoot').hidden = !foot;
  $('#pageBody').scrollTop = 0;
}
function lessonAct(act, id) {
  const L = S.lesson;
  if (!L) return;
  const l = L.l;
  const mark = (k) => { state.lessons[l.id] = Object.assign({ read: false, done: false }, state.lessons[l.id], k); save(); };
  if (act === 'lprev') L.i = Math.max(0, L.i - 1);
  else if (act === 'lnext') {
    if (L.i < l.cards.length - 1) L.i++;
    else if (lessonDone(l.id)) return closePage();
    else { mark({ read: true }); L.i = 0; if (l.task) L.phase = 'task'; else { L.phase = 'quiz'; L.quiz = buildQuiz(l); L.wrong = 0; L.picked = null; } }
  } else if (act === 'ltrade') { closePage(); return go('trade'); }
  else if (act === 'lquiz' || act === 'lretry') { L.phase = 'quiz'; L.i = 0; L.quiz = buildQuiz(l); L.wrong = 0; L.picked = null; }
  else if (act === 'lreview') { L.phase = 'cards'; L.i = 0; }
  else if (act === 'pick') { if (L.picked != null) return; L.picked = id; if (!L.quiz[L.i].opts[id].ok) L.wrong++; }
  else if (act === 'qnext') {
    if (L.i < L.quiz.length - 1) { L.i++; L.picked = null; }
    else { L.phase = 'end'; if (L.wrong === 0) mark({ read: true, done: true }); }
  } else if (act === 'ldone') { const nx = nextStep(); closePage(); return go(nx && nx.lesson && LESSONS.find((x) => x.id === nx.lesson).task ? 'learn' : 'trade'); }
  else if (act === 'saveRules') {
    const risk = parseFloat($('#rRisk').value), day = parseFloat($('#rDay').value), rr = parseFloat($('#rRr').value);
    if (![0.01, 0.02, 0.03].includes(risk) || ![0.03, 0.05, 0.08].includes(day) || ![1.5, 2, 3].includes(rr)) return;
    state.rules = { risk, day, rr };
    state.flags.rules = true;
    save();
    toast('規則已儲存');
  }
  renderLesson();
}
function openGloss() {
  S.lesson = null;
  $('#page').hidden = false;
  $('#pageBar').style.width = '0%';
  $('#pageBody').innerHTML = '<div style="padding-top:8px"><h2>名詞小辭典</h2><dl class="gl">' + Object.keys(GLOSSARY).map((k) => '<dt>' + esc(k) + '</dt><dd>' + esc(GLOSSARY[k]) + '</dd>').join('') + '</dl></div>';
  $('#pageFoot').innerHTML = '';
  $('#pageFoot').hidden = true;
}

function switchSym(sym) {
  if (!E.SYM.test(sym)) return;
  if (S.mode === 'sim' && !Sim.m[sym]) return toast('練習行情沒有這個幣');
  state.settings.sym = sym;
  S.off = 0; S.cross = null; S.drag = null; S.candles = []; S.book = null; S.tape = []; S.limitPx = null;
  save();
  syncTickers();
  if (S.sheetKind) { S.sheetKind = null; $('#sheet').hidden = true; }
  go('trade');
  loadChart();
}
