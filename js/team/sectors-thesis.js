const SECTORS = { l1: '公鏈', pay: '支付老牌', meme: 'Meme', ai: 'AI', defi: 'DeFi', l2: 'L2 擴容', infra: '基礎建設', game: '遊戲元宇宙' };
const SECT_OF = (() => {
  const m = {};
  const add = (k, list) => { for (const c of list.split(' ')) m[c] = k; };
  add('l1', 'ETH SOL BNB ADA AVAX TRX TON DOT NEAR APT SUI SEI ATOM ALGO HBAR EGLD KAS FTM S XTZ EOS BERA MOVE KAIA');
  add('pay', 'XRP XLM LTC BCH ETC ZEC DASH XMR BSV');
  add('meme', 'DOGE SHIB PEPE BONK WIF FLOKI TRUMP PENGU FARTCOIN BOME MEME NEIRO PNUT TURBO POPCAT BRETT MOG SPX PEOPLE ACT DOGS NOT 1000SATS ORDI MEW BABYDOGE CHEEMS');
  add('ai', 'FET TAO RENDER WLD VIRTUAL AI16Z ARKM IO AGIX OCEAN AIXBT GRASS COOKIE NMR');
  add('defi', 'UNI AAVE MKR SKY LDO CRV PENDLE ENA JUP RAY CAKE COMP SUSHI DYDX GMX ETHFI EIGEN ONDO MORPHO HYPE INJ JTO 1INCH SNX RUNE OM USUAL AERO');
  add('l2', 'ARB OP POL MATIC STRK MNT ZK BLAST MANTA METIS LINEA SCR');
  add('infra', 'LINK FIL AR ICP GRT PYTH STX QNT THETA TIA ZRO W WCT ENS JASMY');
  add('game', 'SAND MANA AXS GALA APE ENJ IMX ILV BEAM PIXEL YGG RON');
  return m;
})();
const SEC = { t: 0, rows: [], map: {}, ok: false };
function ret4h(sym) {
  const k = TS.recent && TS.recent[sym];
  if (!k || k.length < 50) return null;
  const a = k[k.length - 49].c;
  const b = S.prices[sym] > 0 ? S.prices[sym] : k[k.length - 1].c;
  return a > 0 ? b / a - 1 : null;
}
function sectors() {
  if (SEC.t && Date.now() - SEC.t < 30000) return SEC;
  const b4 = ret4h('BTC'), b24 = S.chg.BTC != null && isFinite(S.chg.BTC) ? S.chg.BTC : null;
  const g = {};
  for (const c of S.coins) {
    const k = SECT_OF[c];
    if (!k) continue;
    const r4 = ret4h(c), r24 = S.chg[c] != null && isFinite(S.chg[c]) ? S.chg[c] : null;
    if (r4 == null && r24 == null) continue;
    (g[k] = g[k] || []).push({ c, r4, r24 });
  }
  const avg = (a, f) => { const v = a.map(f).filter((x) => x != null && isFinite(x)); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const rows = Object.keys(g).map((k) => {
    const a = g[k];
    const r4 = avg(a, (x) => x.r4), r24 = avg(a, (x) => x.r24);
    const rel4 = r4 != null && b4 != null ? r4 - b4 : null;
    const rel24 = r24 != null && b24 != null ? r24 - b24 : null;
    const score = rel4 != null && rel24 != null ? 0.6 * rel4 + 0.4 * rel24 : rel4 != null ? rel4 : rel24;
    const up = a.filter((x) => (x.r4 != null ? x.r4 : x.r24) > 0).length / a.length;
    return { k, name: SECTORS[k], coins: a.map((x) => x.c), r4, r24, rel4, rel24, score, up, st: 'mid' };
  }).filter((r) => r.score != null).sort((a, b) => b.score - a.score);
  SEC.ok = rows.length >= 3;
  if (SEC.ok) {
    for (const r of rows.slice(0, 2)) if (r.score > 0.005 && r.up >= 0.5) r.st = 'strong';
    for (const r of rows.slice(-2)) if (r.score < -0.005 && r.up <= 0.5) r.st = 'weak';
  }
  SEC.rows = rows;
  SEC.map = {};
  for (const r of rows) for (const c of r.coins) SEC.map[c] = r.st;
  SEC.t = Date.now();
  return SEC;
}
function sectState(sym) {
  if (CLK != null) return null;
  const sc = sectors();
  return sc.ok && sc.map[sym] ? sc.map[sym] : null;
}
const sectName = (sym) => (sym === 'BTC' ? '比特幣' : SECTORS[SECT_OF[sym]] || '其他');
const TH_KEYS = ['trig', 'struct', 'htf', 'sect', 'news'];
function thesisNow(sym, side) {
  const long = side === 'long';
  const opp = (d) => (long ? d === 'down' : d === 'up');
  const out = [];
  const rg = TS.regime;
  if (rg) out.push({ k: 'trig', ok: !opp(rg.dir), txt: '大盤 1 小時方向不相反', bad: long ? '大盤 1 小時翻空' : '大盤 1 小時翻多' });
  const st = structAt(Date.now());
  if (st) out.push({ k: 'struct', ok: !(long ? st.macro === 'bear' : st.macro === 'bull'), txt: '比特幣長期結構不相反', bad: long ? '比特幣跌破 200 日均線' : '比特幣長期結構轉多' });
  const h = MD.h1[sym];
  if (h && Math.abs(Date.now() - h.t) < 3 * 3600000) out.push({ k: 'htf', ok: !opp(h.dir), txt: sym + ' 自己的 1 小時趨勢不相反', bad: sym + ' 的 1 小時趨勢' + (long ? '轉空' : '轉多') });
  const ss = sectState(sym);
  if (ss) out.push({ k: 'sect', ok: !(long ? ss === 'weak' : ss === 'strong'), txt: sectName(sym) + ' 板塊沒有' + (long ? '轉弱' : '轉強'), bad: sectName(sym) + ' 板塊' + (long ? '轉弱' : '轉強') });
  if (long) {
    const nv = newsAt(sym, Date.now());
    const bad = !!(nv && nv.ev && ((nv.ev.copies || 0) >= 1 || TRUSTED.test(nv.ev.src || '')));
    out.push({ k: 'news', ok: !bad, txt: '沒有重大壞消息', bad: '出現重大壞消息' + (bad ? '（' + NEWS_EV[nv.ev.ev] + '）' : ''), hard: true });
  }
  return out;
}
const TH_TXT = { trig: '大盤 1 小時方向', struct: '比特幣長期結構', htf: '這個幣的 1 小時趨勢', sect: '板塊強弱', news: '沒有重大壞消息' };
function thesisCheck() {
  if (CLK != null || !teamReady() || TS.gapFrom != null || TS.replaying || !TS.lastScan || Date.now() - TS.lastScan > 180000) return false;
  let changed = false;
  for (const p of teamPos()) {
    if (p.src === 'deleg' && !p.ask) continue;
    const j = TS.journal.find((x) => x.id === p.id && x.r == null);
    if (!j || !j.th || !j.th.length) continue;
    const cur = thesisNow(p.sym, p.side);
    const broken = cur.filter((x) => j.th.includes(x.k) && !x.ok);
    const prev = (j.thb || []).join(',');
    j.thb = broken.map((x) => x.k);
    if (j.thb.join(',') !== prev) changed = true;
    const hard = broken.some((x) => x.hard);
    if (!(hard || broken.length >= 2) || (!hard && nowT() - p.t0 < 10 * 60000)) continue;
    const px = S.prices[p.sym];
    if (!(px > 0)) continue;
    j.thx = broken.map((x) => x.bad).join('、');
    const r = E.closePosition(state, p.id, px, nowT(), 'thesis', S.prices);
    if (r.ok) { teamLog('團隊 ' + p.sym + ' 論點失效（' + j.thx + '），提早出場 ' + fS(r.trade.pnl) + ' USDT'); toast('團隊 ' + p.sym + ' 論點失效出場 ' + fS(r.trade.pnl)); changed = true; }
  }
  return changed;
}
function lyVerdict(ly) {
  return ly.known < 2 ? '資料不足' : ly.against === 3 ? '三層都偏空：不買漲' : ly.against === 2 ? '大方向偏空：買漲減半' : ly.against === 1 ? '有一層相反：降低把握度' : ly.known === 3 ? '三層一致偏多' : '目前沒有相反的訊號';
}
