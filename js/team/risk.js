const DAY = 86400000;
function dayStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function weekStart(t) { const d = new Date(dayStart(t)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
const closedTeam = () => TS.journal.filter((j) => !j.cancel && j.r != null && j.t1);
function sumUp(J) {
  const n = J.length;
  const R = J.reduce((a, j) => a + j.r, 0);
  const pnl = J.reduce((a, j) => a + (j.pnl || 0), 0);
  const win = J.filter((j) => j.r > 0).length;
  let best = null, worst = null;
  for (const j of J) { if (!best || j.r > best.r) best = j; if (!worst || j.r < worst.r) worst = j; }
  return { n, R, pnl, win, wr: n ? win / n : 0, avg: n ? R / n : 0, best, worst };
}
function rollWeeks() {
  if (TS.weekChk && Date.now() - TS.weekChk < 600000) return;
  TS.weekChk = Date.now();
  const C = closedTeam();
  const w0 = weekStart(Date.now());
  let added = false;
  for (let i = 1; i <= 8; i++) {
    const ws = weekStart(w0 - i * 7 * DAY + DAY);
    if (TS.weeks.some((x) => x.w === ws)) continue;
    const J = C.filter((j) => j.t1 >= ws && j.t1 < ws + 7 * DAY);
    if (!J.length) continue;
    const s0 = sumUp(J);
    TS.weeks.push({ w: ws, n: s0.n, win: s0.win, R: +s0.R.toFixed(3), pnl: +s0.pnl.toFixed(2), audit: auditRun().ok });
    added = true;
  }
  if (added) { TS.weeks.sort((a, b) => b.w - a.w); TS.weeks = TS.weeks.slice(0, 12); saveTeam(); }
}
function auditRun() {
  const items = [];
  const fin = (x) => typeof x === 'number' && isFinite(x);
  let lhs = state.cash;
  for (const o of state.orders) lhs += o.reserve;
  for (const p of state.positions) lhs += p.margin + p.feeOpen;
  const key = [state.rank, state.rankLog.length, state.refills, S.everLive ? 1 : 0].join(':');
  const maxId = state.trades.reduce((m, t) => Math.max(m, t.id || 0), 0);
  let A = TS.audit;
  if (!A || A.k !== key || maxId < A.id || !fin(A.base)) {
    A = TS.audit = { k: key, base: lhs, id: maxId, open: state.positions.map((p) => p.id), t: Date.now() };
    saveTeam();
  }
  const since = state.trades.filter((t) => t.id > A.id || A.open.includes(t.id));
  const exp = A.base + since.reduce((a, t) => a + t.pnl, 0);
  const diff = lhs - exp;
  items.push({ ok: fin(diff) && Math.abs(diff) < 0.01, k: '現金對帳', d: fin(diff) && Math.abs(diff) < 0.01 ? '從 ' + fT(A.t) + ' 起 ' + since.length + ' 筆交易，現金、持倉、掛單加起來和損益完全對得上' : '帳面差了 ' + (fin(diff) ? diff.toFixed(2) : '?') + ' USDT' });
  const bad = state.positions.filter((p) => !(fin(p.entry) && p.entry > 0 && fin(p.qty) && p.qty > 0 && fin(p.margin) && p.margin > 0));
  items.push({ ok: fin(state.cash) && state.cash >= 0 && !bad.length, k: '數值檢查', d: !bad.length && fin(state.cash) && state.cash >= 0 ? '現金與每筆持倉的數字都正常' : '有 ' + bad.length + ' 筆持倉數字異常' });
  let mis = 0, chk = 0;
  for (const j of closedTeam()) {
    const t = state.trades.find((x) => x.id === j.id);
    if (!t || j.pnl == null) continue;
    chk++;
    if (t.owner !== 'team' || Math.abs(t.pnl - j.pnl) > 0.005) mis++;
  }
  items.push({ ok: !mis, k: '團隊筆記 vs 成交紀錄', d: mis ? mis + ' 筆筆記的損益和成交紀錄不同' : chk + ' 筆已結束的團隊單，筆記和成交紀錄一致' });
  const P = teamPos();
  const noJ = P.filter((p) => p.src !== 'deleg' && !TS.journal.some((j) => j.id === p.id));
  items.push({ ok: !noJ.length, k: '每筆團隊單都有筆記', d: noJ.length ? noJ.map((p) => p.sym).join('、') + ' 沒有筆記' : P.length ? P.length + ' 筆團隊單都有記下為什麼做' : '目前沒有團隊單' });
  const noSL = P.filter((p) => p.sl == null);
  items.push({ ok: !noSL.length, k: '每筆團隊單都有停損', d: noSL.length ? noSL.map((p) => p.sym).join('、') + ' 沒有停損' : '全部都有停損' });
  const bd = teamBudget();
  const over = bd.used > bd.alloc * 1.001 + 0.01;
  items.push({ ok: !over, warn: over, k: '團隊額度', d: over ? '已用 ' + fU(bd.used) + '，超過額度 ' + fU(bd.alloc) + '（通常是你調降了額度，舊單會照常管完，不會再開新單）' : '已用 ' + fU(bd.used) + ' ／ 額度 ' + fU(bd.alloc) });
  const ok = items.every((x) => x.ok || x.warn);
  return { ok, items, t: Date.now() };
}
function layers(side, t) {
  const st = structAt(t), fl = flowAt(t), rg = TS.regime;
  const L3 = [
    { k: '結構層', v: st ? st.macro : null, against: st ? (side === 'long' ? st.macro === 'bear' : st.macro === 'bull') : false },
    { k: '資金層', v: fl ? fl.flow : null, against: fl ? (side === 'long' ? fl.flow === 'out' : fl.flow === 'in') : false },
    { k: '觸發層', v: rg ? rg.dir : null, against: rg ? (side === 'long' ? rg.dir === 'down' : rg.dir === 'up') : false }
  ];
  return { L3, against: L3.filter((x) => x.against).length, known: L3.filter((x) => x.v).length };
}
function brainCheck(sig) {
  const t = nowT();
  const f = sig.f || {};
  const long = sig.side === 'long';
  const notes = [];
  let mult = 1;
  const mw = macroWindow(t);
  if (mw) return { block: '重大數據「' + mw.name + '」公布前後，暫停進場', mult, notes };
  const nev = long ? newsAt(sig.sym, t) : null;
  if (nev && nev.ev) {
    const sure = (nev.ev.copies || 0) >= 1 || TRUSTED.test(nev.ev.src || '');
    if (sure) return { block: '新聞有重大壞消息（' + NEWS_EV[nev.ev.ev] + '，' + fAgo(t - nev.ev.t) + '），先不買漲', mult, notes };
    mult *= 0.5; notes.push('有' + NEWS_EV[nev.ev.ev] + '傳聞但只有一家報導，半量');
  }
  const ly = layers(sig.side, t);
  if (ly.known === 3 && ly.against === 3) return { block: '結構、資金、觸發三層都跟這個方向相反', mult, notes };
  if (ly.against >= 2) { mult *= 0.5; notes.push('三層裡有 ' + ly.against + ' 層方向相反，半量'); }
  const fgv = MD.fg.length ? MD.fg[MD.fg.length - 1].v : null;
  if (long && fgv != null && fgv >= 75 && sig.type === 'breakout') return { block: '市場極度貪婪，不追高突破', mult, notes };
  if (!long && fgv != null && fgv <= 20) { mult *= 0.5; notes.push('極度恐懼時追空容易被軋，半量'); }
  if (long && f.news === 'priced' && (sig.type === 'breakout' || sig.type === 'grail')) return { block: '好消息已經漲過，不追', mult, notes };
  if (long && f.deriv === 'crowd') { mult *= 0.5; notes.push('多頭擁擠，提防回檔清算，半量'); }
  if (!long && f.deriv === 'squeeze') { mult *= 0.5; notes.push('軋空風險高，半量'); }
  if (ly.against === 1) { mult *= 0.75; notes.push(ly.L3.find((x) => x.against).k + '方向相反，減碼'); }
  if (long && sig.sym !== 'BTC' && f.dom === 'up') { mult *= 0.75; notes.push('比特幣市佔率上升，山寨買漲減碼'); }
  const ss = sectState(sig.sym);
  if (long && ss === 'weak') { mult *= 0.75; notes.push(sectName(sig.sym) + ' 板塊偏弱，買漲減碼'); }
  if (!long && ss === 'strong') { mult *= 0.75; notes.push(sectName(sig.sym) + ' 板塊偏強，買跌減碼'); }
  const rp = f.room === 'tight' && sig.dec && sig.dec.parts ? sig.dec.parts.find((x) => x.fk === 'room') : null;
  if (rp && rp.n >= 15 && rp.avg != null && rp.avg < -0.1) { mult *= 0.75; notes.push('前方 1R 內就有' + (long ? '壓力' : '支撐') + '，這類單過去平均 ' + L.fmtR(rp.avg) + '，減碼'); }
  const wp = f.whale === 'against' && sig.dec && sig.dec.parts ? sig.dec.parts.find((x) => x.fk === 'whale') : null;
  if (wp && wp.n >= 15 && wp.avg != null && wp.avg < -0.1) { mult *= 0.75; notes.push('大戶多空比 4 小時往反方向變，這類單過去平均 ' + L.fmtR(wp.avg) + '，減碼'); }
  const con = notes.slice();
  const bf = CLK == null ? bigFlow(sig.sym) : null;
  if (bf && bf.strong && (bf.net > 0) !== long) con.push('巨鯨觀察員：15 分鐘大單淨' + (bf.net > 0 ? '買進' : '賣出') + ' ' + fBig(Math.abs(bf.net)) + '，跟這個方向相反（大單也可能是對沖或內部調度，只當參考）');
  if (sig.dec && sig.dec.avoid && sig.dec.avoid.length) con.push('符合團隊「避開」守則：' + L.label(sig.dec.avoid[0]));
  if ((long && f.news === 'bad') || (!long && f.news === 'good')) con.push('這個幣最近的新聞跟這個方向相反');
  const lastSame = TS.journal.filter((j) => !j.cancel && j.sym === sig.sym && j.r != null && j.t1 && t - j.t1 < 86400000).pop();
  if (lastSame && lastSame.r < 0) con.push('團隊 24 小時內做 ' + sig.sym + ' 剛賠過（' + L.fmtR(lastSame.r) + '）');
  if (sig.dec && sig.dec.parts && sig.dec.parts.length && sig.dec.parts.every((x) => x.n < 15)) con.push('同類樣本都不到 15 份，預估不可靠');
  if (con.length >= conMax()) return { block: '反方審查：找到 ' + con.length + ' 個反對理由（' + con.slice(0, 3).join('；') + '），不做', mult: Math.max(0.25, mult), notes, con, conBlock: true };
  return { block: null, mult: Math.max(0.25, mult), notes, con };
}
const CON_MAX = 3;
const conMax = () => (TS.tune && TS.tune.con >= 3 && TS.tune.con <= 4 ? TS.tune.con : CON_MAX);
const RISK = { day: 0.03, week: 0.05, halt: 0.15, open: 0.05, side: 0.03, streak: 4, cool: 3600000, shock: 0.015 };
function riskOf(p) {
  if (p.sl == null) return p.margin;
  return Math.max(0, (p.side === 'long' ? p.entry - p.sl : p.sl - p.entry) * p.qty);
}
function teamClosed() {
  return TS.journal.filter((j) => !j.cancel && j.r != null && j.pnl != null && j.src !== 'deleg' && j.t1 && (!TS.resumeAt || j.t1 >= TS.resumeAt));
}
function guard() {
  const now = nowT();
  const A = teamBudget().alloc;
  const C = teamClosed();
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const sum = (a) => a.reduce((x, j) => x + j.pnl, 0);
  const day = sum(C.filter((j) => j.t1 >= d0.getTime()));
  const week = sum(C.filter((j) => j.t1 >= now - 7 * 86400000));
  const dd = L.teamDD(C, A);
  let streak = 0;
  for (let i = C.length - 1; i >= 0 && C[i].r <= 0; i--) streak++;
  const last = C.length ? C[C.length - 1].t1 : 0;
  const coolUntil = streak >= RISK.streak ? last + RISK.cool : 0;
  const P = teamPos().filter((p) => p.src !== 'deleg');
  const side = { long: 0, short: 0 };
  let open = 0;
  for (const p of P) { const r = riskOf(p); open += r; side[p.side] += r; }
  const wd = new Date(now).getUTCDay();
  const wkend = wd === 0 || wd === 6;
  if (A > 0 && dd >= RISK.halt && !TS.halt) { TS.halt = true; teamLog('團隊從高點回落超過額度的 15%，全部暫停，等你按「恢復」'); saveTeam(); }
  let block = null;
  const noPx = CLK == null ? teamPos().filter((p) => !(S.prices[p.sym] > 0)).map((p) => p.sym) : [];
  if (TS.halt) block = '回落超過 15%，全部暫停中';
  else if (noPx.length) block = '資料查核員：' + noPx.join('、') + ' 沒有報價，資料有問題先暫停進場';
  else if (A > 0 && -day >= RISK.day * A) block = '今天已虧損額度的 3%，停到明天';
  else if (coolUntil > now) block = '連賠 ' + streak + ' 筆，冷靜到 ' + fHM(coolUntil);
  let mult = 1;
  const notes = [];
  if (A > 0 && -week >= RISK.week * A) { mult *= 0.5; notes.push('最近 7 天虧超過 5%，半量'); }
  if (wkend) { mult *= 0.5; notes.push('週末成交量小，半量'); }
  if (CLK == null && typeof CAL_UNTIL !== 'undefined' && now > CAL_UNTIL) { mult *= 0.5; notes.push('重大數據日曆過期，看不到數據公布時間，半量'); }
  return { A, day, week, dd, streak, coolUntil, open, side, wkend, block, mult, notes, btc: TS.btcMove || 0 };
}
