const DELEG_LABEL = { long: '委託買漲', short: '委託買跌', any: '請團隊判斷' };

function delegLabel(d) { return DELEG_LABEL[d.side] || '委託'; }
function delegTagCls(d) { return d.side === 'long' ? 'up' : d.side === 'short' ? 'down' : ''; }
function delegTxt(d) {
  if (d && d.side === 'any') return '團隊看漲跌兩邊，自己決定方向，沒把握就不做';
  return exploreState().on ? '試單期：出現這方向的訊號就進場' : '等團隊判斷會賺的訊號才進場';
}
function delegDoneTxt(d, sig) {
  return d.side === 'any' ? '團隊判斷 ' + sig.sym + ' 該' + SIDE[sig.side] + '，已進場' : '委託成交：團隊' + SIDE[sig.side] + ' ' + sig.sym;
}

function sigWorthy(s, strict) {
  const dec = s.dec || {};
  const avoid = !!(dec.avoid && dec.avoid.length);
  if (dec.go) return true;
  if (strict && avoid) return false;
  return s.grade === 'A' || s.grade === 'B' || (exploreState().on && !avoid);
}

function delegExpire(now, live) {
  let changed = false;
  for (const d of TS.delegs.slice()) {
    if (now < d.until) continue;
    TS.delegs = TS.delegs.filter((x) => x !== d);
    const why = d.side === 'any' ? '4 小時內團隊沒找到值得做的方向，已取消（沒把握就不做）' : '4 小時內沒有好的' + SIDE[d.side] + '進場點，已取消';
    teamLog('委託到期：' + d.sym + ' ' + why);
    if (live) toast((d.side === 'any' ? '團隊看完 ' + d.sym + '：4 小時內沒有值得做的單' : '委託到期：' + d.sym + ' 沒等到好的進場點'));
    changed = true;
  }
  return changed;
}

function teamView(sym) {
  const now = Date.now();
  const why = [];
  let score = 0;
  const add = (v, txt) => { if (!v) return; score += v; why.push({ v, txt }); };
  const sig = TS.signals.find((s) => s.sym === sym && now - s.barT < 30 * 60000 && sigWorthy(s, true));
  if (sig) add(sig.side === 'long' ? 2 : -2, '剛出現' + Team.TYPES[sig.type].name + SIDE[sig.side] + '訊號');
  const h = MD.h1[sym];
  if (h && Math.abs(now - h.t) < 3 * 3600000) add(h.dir === 'up' ? 1 : h.dir === 'down' ? -1 : 0, sym + ' 1 小時趨勢' + (h.dir === 'up' ? '向上' : '向下'));
  if (sym !== 'BTC' && TS.regime) add(TS.regime.dir === 'up' ? 1 : TS.regime.dir === 'down' ? -1 : 0, '大盤（比特幣）1 小時' + (TS.regime.dir === 'up' ? '偏多' : '偏空'));
  const st = structAt(now);
  if (st) add(st.macro === 'bull' ? 1 : st.macro === 'bear' ? -1 : 0, '比特幣長期結構' + (st.macro === 'bull' ? '偏多' : '偏空'));
  const ss = sectState(sym);
  if (ss) add(ss === 'strong' ? 1 : ss === 'weak' ? -1 : 0, sectName(sym) + ' 板塊' + (ss === 'strong' ? '偏強' : '偏弱'));
  const nv = newsAt(sym, now);
  if (nv && nv.ev) add(-2, '有重大壞消息（' + NEWS_EV[nv.ev.ev] + '）');
  const dir = score >= 2 ? 'long' : score <= -2 ? 'short' : 'flat';
  return { dir, score, why };
}

async function refreshH1(sym) {
  const cur = MD.h1[sym];
  if (cur && Date.now() - cur.t < 3600000) return;
  try {
    const h = S.mode === 'sim' ? simAgg(sym, 60).slice(-60) : S.mode === 'live' ? await fetchKlines(sym, '1h', '&limit=60') : null;
    const d = h1Dir(h);
    if (d) MD.h1[sym] = d;
  } catch (e) { return; }
}

function delegCheck(sym, side) {
  if (side === 'short' && !E.canShort(state)) return '買跌在第 5 關（停損）過關後解鎖';
  if (!canTrade(sym)) return '行情連線中，請稍等';
  if (orderAmount().amount < E.MIN_AMOUNT) return '可用資金不夠';
  if (teamPos().some((p) => p.sym === sym)) return '團隊已經有一筆 ' + sym + ' 在手上';
  const cur = TS.delegs.find((d) => d.sym === sym);
  if (cur) return sym + ' 已經' + (cur.side === 'any' ? '請團隊判斷了' : '有委託在等了') + '，要換請先到持倉取消';
  return null;
}

async function askTeam() {
  const sym = state.settings.sym;
  const err = delegCheck(sym, 'any');
  if (err) return toast(err);
  const now = Date.now();
  const ready = TS.signals.filter((s) => s.sym === sym && now - s.barT < 15 * 60000 && (s.side === 'long' || E.canShort(state)) && sigWorthy(s, true))
    .sort((a, b) => (b.dec && b.dec.go ? 1 : 0) - (a.dec && a.dec.go ? 1 : 0) || (a.grade || 'Z').localeCompare(b.grade || 'Z'))[0];
  if (ready && teamTrade(ready, 'ask')) { toast('團隊判斷 ' + sym + ' 現在就該' + SIDE[ready.side] + '，已進場'); render(); return; }
  TS.delegs.push({ id: 'd' + now, sym, side: 'any', t: now, until: now + DELEG_MS });
  teamLog('你請團隊判斷 ' + sym + '：團隊看漲跌兩邊，最多 4 小時');
  saveTeam();
  if (TS.nextScan > now + 5000) TS.nextScan = now + 2000;
  toast('已交給團隊判斷 ' + sym + '：漲跌由團隊決定，沒把握就不做');
  render();
}

async function createDeleg(side, confirmed) {
  const sym = state.settings.sym;
  const err = delegCheck(sym, side);
  if (err) return toast(err);
  if (!confirmed) {
    if (S.delegBusy) return;
    S.delegBusy = true;
    try { await refreshH1(sym); } finally { S.delegBusy = false; }
    if (state.settings.sym !== sym) return;
    const err2 = delegCheck(sym, side);
    if (err2) return toast(err2);
    const v = teamView(sym);
    const opp = v.dir !== 'flat' && v.dir !== side;
    if (opp) {
      S.pendingDeleg = { sym, side };
      const rs = v.why.filter((x) => (side === 'long' ? x.v < 0 : x.v > 0)).map((x) => x.txt);
      return openSheet('info', '<h2>團隊目前看' + (v.dir === 'long' ? '漲' : '跌') + '</h2><div class="lines"><p>你要委託' + SIDE[side] + ' ' + esc(sym) + '，但團隊現在的判斷相反：</p>' + rs.map((x) => '<p>' + esc(x) + '</p>').join('') + '<p>如果你不確定方向，建議改請團隊判斷，由團隊決定漲或跌。</p></div><div class="cta"><button class="btn quiet" data-act="delegGo">仍要' + SIDE[side] + '</button><button class="btn solid" data-act="askTeam">改請團隊判斷</button></div>');
    }
  }
  const now = Date.now();
  const ready = TS.signals.find((s) => s.sym === sym && s.side === side && now - s.barT < 15 * 60000 && sigWorthy(s));
  if (ready && teamTrade(ready, 'deleg')) { toast('團隊判斷現在就是好時機，已' + SIDE[side] + ' ' + sym); render(); return; }
  TS.delegs.push({ id: 'd' + now, sym, side, t: now, until: now + DELEG_MS });
  teamLog('收到委託：' + sym + ' ' + SIDE[side] + '，等進場點，最多 4 小時');
  saveTeam();
  if (TS.nextScan > now + 5000) TS.nextScan = now + 2000;
  toast('已交給團隊：等 ' + sym + ' 出現' + SIDE[side] + '的好進場點，最多等 4 小時');
  render();
}

function delegRow(d, now, withTxt) {
  return '<div class="row"><div class="row-main"><div><b>' + esc(d.sym) + '</b><span class="tag ' + delegTagCls(d) + '">' + delegLabel(d) + '</span><div class="sub">' + (withTxt ? delegTxt(d) + '　' : '') + '剩 ' + fLeft(d.until - now) + '</div></div><div class="right"><button class="btn sm" data-act="dcancel" data-id="' + esc(d.id) + '">取消</button></div></div></div>';
}
