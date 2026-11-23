function afterClose() {
  const d = E.checkDemotion(state, Date.now(), S.prices);
  if (!d) return;
  if (d.type === 'refill') S.queue.push({ kind: 'info', title: '資金已補回 1,000 USDT', lines: ['你的總資產跌到起始資金的六成以下，系統幫你重新開始。', '回頭看「成績」頁的交易紀錄，找出賠最多的那幾筆做錯了什麼。'] });
  else S.queue.push({ kind: 'info', title: '段位降為 ' + state.rank + ' ' + E.RANKS[state.rank].name, lines: [d.cause === 'liq' ? '最近 10 筆裡有 2 筆被強制平倉，代表槓桿用得太大。' : '總資產跌到這個段位資金的六成以下。', '所有持倉已經平倉，資金重設為 ' + fU(E.RANKS[state.rank].cap) + ' USDT。重新達成條件就能再升回去。'] });
}
function flushQueue() {
  if (S.sheetKind || S.lesson || !S.queue.length) return;
  const q = S.queue.shift();
  if (q.kind === 'review') showReview(q.trade, true);
  else showInfo(q.title, q.lines);
}
const canTrade = (sym) => S.prices[sym] > 0 && (S.mode === 'sim' || (S.mode === 'live' && !S.stale && !S.catching));
const lessonDone = (id) => !!(state.lessons[id] && state.lessons[id].done);
const limitOK = () => true;
const curPos = () => state.positions.filter((p) => p.sym === state.settings.sym);

function ctxNow() {
  const k = S.candles;
  if (k.length < 22) return null;
  const p = S.prices[state.settings.sym];
  const n = k.length;
  let sum = 0;
  for (let i = n - 20; i < n; i++) sum += k[i].c;
  let vs = 0;
  for (let i = n - 22; i < n - 2; i++) vs += k[i].v;
  const va = vs / 20;
  return { above: p > sum / 20, chg: p / k[n - 21].c - 1, volR: va > 0 ? Math.max(k[n - 1].v, k[n - 2].v) / va : null, ma: sum / 20 };
}
function atrDist(sym, price) {
  const k = sym === state.settings.sym && S.candles.length >= 15 ? S.candles : (TS.recent && TS.recent[sym]) || (TS.hist[sym] ? TS.hist[sym].slice(-20) : []);
  let d = 0;
  if (k.length >= 15) { for (let i = k.length - 15; i < k.length - 1; i++) d += k[i].h - k[i].l; d /= 14; }
  else d = price * 0.003;
  return Math.max(d * 1.5, price * 0.002);
}
function autoBracket(p) {
  if (p.sl != null || p.owner === 'team') return;
  const px = S.prices[p.sym] || p.entry;
  let dist = atrDist(p.sym, px);
  if (E.isLev(p) && p.lev > 1) { const room = p.entry * (1 / p.lev - E.MMR) * 0.8; if (dist > room) dist = room; }
  const long = p.side === 'long';
  const sl = roundP(long ? p.entry - dist : p.entry + dist);
  const tp = roundP(long ? p.entry + dist * 2 : p.entry - dist * 2);
  const okSl = long ? sl < px : sl > px;
  const okTp = long ? tp > px : tp < px;
  E.setStops(state, p.id, okSl ? sl : null, okTp ? tp : null, px, true);
}
function breakeven(p) {
  const f = E.feeRate(p);
  return p.side === 'long' ? p.entry * (1 + f) / (1 - f) : p.entry * (1 - f) / (1 + f);
}
function posR(p, px) {
  if (!(p.r0 > 0)) return null;
  return E.posPnl(p, px) / p.r0;
}
function orderAmount() {
  const eq = E.equity(state, S.prices);
  const lev = Math.max(1, Math.min(state.settings.lev, E.MAX_LEV));
  const want = Math.floor(eq * state.settings.amtPct * 100) / 100;
  return { amount: Math.min(want, E.maxAmount(state.cash, lev, 'long')), lev, eq };
}
