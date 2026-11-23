const TeamLearn = (() => {
  const T = typeof Team !== 'undefined' ? Team : require('./team-signals.js');
  const FEATS = {
    align: { with: '順大盤', against: '逆大盤', flat: '大盤盤整' },
    vol: { low: '量縮', mid: '量平', high: '爆量' },
    rsi: { low: 'RSI 低檔', mid: 'RSI 中間', high: 'RSI 高檔' },
    sess: { asia: '亞洲盤', eu: '歐洲盤', us: '美洲盤' },
    adx: { low: 'ADX 低（盤整）', mid: 'ADX 中', high: 'ADX 高（強趨勢）' },
    htf: { with: '順這個幣的大趨勢', against: '逆這個幣的大趨勢', flat: '這個幣沒有大趨勢' },
    fund: { long: '多單擁擠（資金費率高）', short: '空單擁擠（資金費率負）', norm: '資金費率正常', na: '沒有資金費率資料' },
    oi: { upDown: '未平倉增加・價格下跌', upUp: '未平倉增加・價格上漲', down: '未平倉減少', flat: '未平倉持平', na: '沒有未平倉資料' },
    fg: { fear: '市場恐懼', neutral: '市場情緒中性', greed: '市場貪婪', na: '沒有恐懼貪婪資料' },
    news: { priced: '好消息但已經漲過（不追）', good: '這個幣有好消息', bad: '這個幣有壞消息', mixed: '這個幣消息好壞都有', quiet: '這個幣最近沒新聞', na: '沒有新聞資料' },
    mnews: { good: '市場新聞偏多', bad: '市場新聞偏空', neutral: '市場新聞中性', na: '沒有市場新聞資料' },
    macro: { bull: '比特幣在 200 日均線上（長期偏多）', bear: '比特幣在 200 日均線下（長期偏空）', mid: '長期方向不明', na: '沒有長期均線資料' },
    flow: { in: '穩定幣 30 天增加（資金進場）', out: '穩定幣 30 天減少（資金離場）', flat: '穩定幣 30 天持平', na: '沒有穩定幣資料' },
    deriv: { crowd: '多頭擁擠（漲、未平倉增、費率高）', flush: '槓桿被洗掉（跌、未平倉減）', squeeze: '軋空機會（費率深度為負、不再破底）', cover: '空單回補（漲、未平倉減）', normal: '期貨市場正常', na: '沒有期貨資料' },
    dom: { up: '比特幣市佔率上升（山寨偏弱）', down: '比特幣市佔率下降（山寨偏強）', flat: '比特幣市佔率持平', na: '沒有市佔率資料' },
    sect: { with: '順板塊強弱（強勢板塊買漲、弱勢板塊買跌）', against: '逆板塊強弱', mid: '板塊強弱普通', na: '沒有板塊資料' },
    liq: { big: '大幣（24 小時成交額 5,000 萬美元以上）', mid: '中型幣（成交額 1,000 萬～5,000 萬美元）', small: '小幣（成交額不到 1,000 萬美元）', na: '沒有成交額資料' },
    whale: { with: '大戶多空比 4 小時往這個方向變', against: '大戶多空比 4 小時往反方向變', flat: '大戶多空比持平', na: '沒有大戶多空比資料' },
    big: { with: '15 分鐘大單跟這個方向同邊', against: '15 分鐘大單跟這個方向反向', none: '15 分鐘沒有明顯大單', na: '沒有大單資料' },
    room: { tight: '前方 1R 內就有擋路的高低點（空間小）', mid: '離前方高低點 1～2.5R', open: '前方 2.5R 內沒有擋路的高低點', na: '沒有空間資料' }
  };
  const EVWIN = { hack: 72, rug: 72, fraud: 72, halt: 72, delist: 168, sue: 24, depeg: 24 };
  const NEG_EVENT = [['hack', /\bhack(ed|er|ers|s)?\b/i], ['hack', /\bexploit(ed|s)?\b/i], ['hack', /\bdrain(ed|s)?\b/i], ['hack', /\bstolen\b/i], ['hack', /\bbreach\b/i], ['rug', /\brug ?pull\b/i], ['delist', /\bdelist(ed|ing|s)?\b/i], ['sue', /\bsues?\b|\blawsuit\b|\bcharged\b|\bindict(ed|ment)\b/i], ['fraud', /\bfraud\b|\bponzi\b|\bscam\b/i], ['halt', /\bhalt(s|ed)? withdrawals?\b|\bsuspend(s|ed)? withdrawals?\b|\binsolven(t|cy)\b|\bbankrupt(cy)?\b/i], ['depeg', /\bde-?peg(s|ged)?\b|\blos(es|t) (its )?peg\b/i]];
  const NEG = /\b(crash(es|ed)?|plunge[sd]?|plummet(s|ed)?|tumble[sd]?|sell-?off|dump(s|ed)?|bearish|outflows?|liquidat(ed|ions?)|ban(s|ned)?|crackdown|slump(s|ed)?|sink(s)?|sank|fears?|warns?|downturn|losses)\b/i;
  const POS = /\b(surge[sd]?|soar(s|ed)?|rall(y|ies|ied)|jump(s|ed)?|bullish|inflows?|record high|all-time high|ath|approv(al|es|ed)|partnership|partners with|adopt(s|ion|ed)|launch(es|ed)?|list(s|ed|ing) on|upgrade[sd]?|integrat(es|ion|ed)|accumulat(es|ion|ed)|buys?|gains?|breakout|reserve)\b/i;
  function newsScore(title, desc, sentiment) {
    const t = String(title || '') + ' ' + String(desc || '').slice(0, 280);
    let ev = null;
    for (const [k, re] of NEG_EVENT) if (re.test(title || '')) { ev = k; break; }
    const doubt = /\b(denies|denied|deny|no evidence|false|fake|rumou?rs?|not hacked|unaffected|safe|recover(s|ed|y)?|returns? (stolen )?funds|bounty|could|might|may|what if|how to|explained|guide|lessons?)\b|\?/i.test(title || '');
    if (ev && doubt) ev = null;
    let sc = 0;
    if (ev) sc -= 2;
    else if (doubt && NEG_EVENT.some(([, re]) => re.test(title || ''))) sc -= 0.5;
    const tt = String(title || '');
    if (NEG.test(tt)) sc -= 1;
    if (POS.test(tt)) sc += 1;
    if (!sc && NEG.test(t)) sc -= 0.5;
    if (!sc && POS.test(t)) sc += 0.5;
    const se = String(sentiment || '').toLowerCase();
    if (/neg|bear/.test(se)) sc = Math.min(sc, -1);
    else if (/pos|bull/.test(se)) sc = Math.max(sc, ev ? sc : 1);
    return { s: Math.max(-2, Math.min(2, sc)), ev };
  }
  const NAMES = { BTC: ['bitcoin'], ETH: ['ethereum', 'ether'], SOL: ['solana'], XRP: ['ripple', 'xrp'], DOGE: ['dogecoin'], ADA: ['cardano'], TRX: ['tron'], LINK: ['chainlink'], AVAX: ['avalanche'], SUI: ['sui'], TON: ['toncoin'], DOT: ['polkadot'], LTC: ['litecoin'], SHIB: ['shiba inu'], PEPE: ['pepe'], NEAR: ['near protocol'], APT: ['aptos'], ARB: ['arbitrum'], OP: ['optimism'], UNI: ['uniswap'], AAVE: ['aave'], HBAR: ['hedera'], XLM: ['stellar'], ZEC: ['zcash'], HYPE: ['hyperliquid'], ENA: ['ethena'], ONDO: ['ondo'], RENDER: ['render network'], FIL: ['filecoin'], ATOM: ['cosmos hub', 'cosmos'], BCH: ['bitcoin cash'], ETC: ['ethereum classic'], ICP: ['internet computer'], WLD: ['worldcoin'], TRUMP: ['trump coin', 'official trump', '$trump'], WLFI: ['world liberty'], PENGU: ['pudgy penguins'], BONK: ['bonk'], WIF: ['dogwifhat'], SEI: ['sei network'], INJ: ['injective'], TIA: ['celestia'], FET: ['fetch.ai'], ALGO: ['algorand'], VET: ['vechain'], XMR: ['monero'], CAKE: ['pancakeswap'], PUMP: ['pump.fun'] };
  function newsCoins(title, desc, tags, syms) {
    const text = String(title || '') + ' ' + String(desc || '').slice(0, 280);
    const low = text.toLowerCase();
    const tg = Array.isArray(tags) ? tags.map((x) => String(x).toLowerCase()) : [];
    const out = [];
    for (const sym of syms) {
      let hit = false;
      if (sym.length >= 3 && new RegExp('(^|[^A-Za-z0-9])\\$?' + sym + '([^A-Za-z0-9]|$)').test(text)) hit = true;
      const nm = NAMES[sym];
      if (!hit && nm) for (const n of nm) { const i = low.indexOf(n); if (i >= 0 && !/[a-z0-9]/.test(low[i - 1] || '') && !/[a-z0-9]/.test(low[i + n.length] || '')) { hit = true; break; } }
      if (!hit && (tg.includes(sym.toLowerCase()) || (nm && nm.some((n) => tg.includes(n))))) hit = true;
      if (hit) out.push(sym);
    }
    if (out.includes('BCH') && !/\bbitcoin(?! cash)/i.test(text)) { const i = out.indexOf('BTC'); if (i >= 0) out.splice(i, 1); }
    if (out.includes('ETC') && !/\bethereum(?! classic)/i.test(text)) { const i = out.indexOf('ETH'); if (i >= 0) out.splice(i, 1); }
    return out;
  }
  function newsW(a, t) { return Math.pow(0.5, (t - a.t) / 7200000) * Math.min(2, 1 + 0.25 * (a.copies || 0)); }
  function newsMood(items, sym, t) {
    if (!items) return null;
    const win = items.filter((a) => !a.dup && a.t <= t && a.t > t - 6 * 3600000);
    const mine = win.filter((a) => a.syms.includes(sym));
    let news;
    if (!mine.length) news = 'quiet';
    else {
      const sum = mine.reduce((x, a) => x + a.s * newsW(a, t), 0);
      const anyNeg = mine.some((a) => a.s < 0), anyPos = mine.some((a) => a.s > 0);
      news = sum >= 0.8 ? 'good' : sum <= -0.8 ? 'bad' : anyNeg && anyPos ? 'mixed' : 'quiet';
    }
    const m = items.filter((a) => !a.dup && a.t <= t && a.t > t - 3 * 3600000);
    let mnews = 'neutral';
    if (m.length >= 5) { const ws = m.reduce((x, a) => x + newsW(a, t), 0); const avg = m.reduce((x, a) => x + a.s * newsW(a, t), 0) / ws; mnews = avg > 0.15 ? 'good' : avg < -0.15 ? 'bad' : 'neutral'; }
    const evs = items.filter((a) => !a.dup && a.ev && a.t <= t && a.syms.includes(sym) && t - a.t < (EVWIN[a.ev] || 6) * 3600000).sort((a, b) => b.t - a.t);
    const ev = evs[0] || null;
    return { news, mnews, ev, n: mine.length, mn: m.length };
  }
  const W_LIVE = 3;
  const PRIOR = 10;

  function regimeSeries(btc5m) {
    const map = new Map();
    if (!btc5m || btc5m.length < 24 * 12) return () => 'flat';
    const H = 3600000;
    const hrs = [];
    let cur = null;
    for (const k of btc5m) {
      const b = Math.floor(k.t / H) * H;
      if (!cur || cur.t !== b) { cur = { t: b, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v }; hrs.push(cur); }
      else { if (k.h > cur.h) cur.h = k.h; if (k.l < cur.l) cur.l = k.l; cur.c = k.c; cur.v += k.v; }
    }
    const c = hrs.map((x) => x.c);
    const e20 = T.ema(c, 20), e50 = T.ema(c, 50);
    for (let n = 60; n < hrs.length; n++) {
      const back = Math.max(0, n - 24);
      const votes = [c[n] > e50[n], e20[n] > e50[n], e50[n] > e50[n - 12], c[n] > c[back]].filter(Boolean).length;
      map.set(hrs[n].t + H, votes >= 3 ? 'up' : votes <= 1 ? 'down' : 'flat');
    }
    return (t) => map.get(Math.floor(t / H) * H) || 'flat';
  }

  function session(t) {
    const h = new Date(t).getUTCHours();
    return h < 8 ? 'asia' : h < 16 ? 'eu' : 'us';
  }

  function trendDir(ind, i) {
    const e = ind.e288 ? ind.e288[i] : null;
    const e0 = ind.e288 && i >= 72 ? ind.e288[i - 72] : null;
    if (e == null || e0 == null) return null;
    const c = ind.c[i];
    if (c > e && e > e0) return 'up';
    if (c < e && e < e0) return 'down';
    return 'flat';
  }

  function derivState(fund, oiChg, pxChg, ind, i) {
    if (fund == null || oiChg == null || pxChg == null) return 'na';
    let low = Infinity;
    for (let j = Math.max(0, i - 48); j < i - 6; j++) low = Math.min(low, ind.c[j]);
    if (pxChg > 0.01 && oiChg > 0.03 && fund >= 0.0003) return 'crowd';
    if (fund <= -0.0003 && isFinite(low) && ind.c[i] > low) return 'squeeze';
    if (pxChg < -0.01 && oiChg < -0.03) return 'flush';
    if (pxChg > 0.01 && oiChg < -0.03) return 'cover';
    return 'normal';
  }
  const LIQ_BIG = 50e6, LIQ_MID = 10e6;
  function liqAt(k, i) {
    if (!k || i == null || i < 0 || i >= k.length) return null;
    const n = Math.min(288, i + 1);
    if (n < 24) return null;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += k[j].v * k[j].c;
    return (s * 288) / n;
  }
  function liqTier(k, i) {
    const q = liqAt(k, i == null && k ? k.length - 1 : i);
    return q == null ? 'na' : q >= LIQ_BIG ? 'big' : q >= LIQ_MID ? 'mid' : 'small';
  }
  function features(ind, k, i, side, dir, volx, ext, p) {
    const r = ind.rsi[i];
    const vx = volx != null ? volx : ind.vavg[i] > 0 ? k[i].v / ind.vavg[i] : 1;
    const ax = ind.adx ? ind.adx[i] : null;
    const x = ext || {};
    const td = x.htf || trendDir(ind, i) || 'flat';
    const pxChg = i >= 48 && ind.c[i - 48] > 0 ? ind.c[i] / ind.c[i - 48] - 1 : null;
    return {
      align: dir === 'flat' || !dir ? 'flat' : (dir === 'up') === (side === 'long') ? 'with' : 'against',
      vol: vx < 1.2 ? 'low' : vx < 2.5 ? 'mid' : 'high',
      rsi: r == null ? 'mid' : r < 35 ? 'low' : r > 65 ? 'high' : 'mid',
      sess: session(k[i].t + 5 * 60000),
      adx: ax == null ? 'mid' : ax < 20 ? 'low' : ax > 30 ? 'high' : 'mid',
      htf: td === 'flat' ? 'flat' : (td === 'up') === (side === 'long') ? 'with' : 'against',
      fund: x.fund == null ? 'na' : x.fund >= 0.0003 ? 'long' : x.fund <= -0.0001 ? 'short' : 'norm',
      oi: x.oiChg == null || pxChg == null ? 'na' : x.oiChg > 0.03 ? (pxChg < 0 ? 'upDown' : 'upUp') : x.oiChg < -0.03 ? 'down' : 'flat',
      fg: x.fg == null ? 'na' : x.fg < 35 ? 'fear' : x.fg > 65 ? 'greed' : 'neutral',
      news: x.news === 'good' && pxChg != null && pxChg > 0.08 ? 'priced' : x.news || 'na',
      mnews: x.mnews || 'na',
      macro: x.macro || 'na',
      flow: x.flow || 'na',
      deriv: derivState(x.fund, x.oiChg, pxChg, ind, i),
      dom: x.dom || 'na',
      sect: x.sect == null ? 'na' : x.sect === 'mid' ? 'mid' : (x.sect === 'strong') === (side === 'long') ? 'with' : 'against',
      liq: liqTier(k, i),
      whale: x.top == null ? 'na' : x.top > 0.05 ? (side === 'long' ? 'with' : 'against') : x.top < -0.05 ? (side === 'long' ? 'against' : 'with') : 'flat',
      big: x.big == null ? 'na' : x.big === 'none' ? 'none' : (x.big === 'buy') === (side === 'long') ? 'with' : 'against',
      room: (() => { const rr = p ? T.roomR(k, i, side, p.dist) : null; return rr == null ? 'na' : rr < 1 ? 'tight' : rr < 2.5 ? 'mid' : 'open'; })()
    };
  }

  function samplesFrom(k, dirAt, extFn) {
    const out = [];
    if (!k || k.length < 120) return out;
    const ind = T.prepare(k);
    const busy = {};
    for (let i = 60; i < k.length - 1; i++) {
      for (const s of T.detect(ind, k, i)) {
        const key = s.type + ':' + s.side;
        if (busy[key] && i <= busy[key]) continue;
        const p = T.plan(ind, k, i, s.side, s.stopRef);
        const res = T.simulate(k, i, p, s.side);
        if (!res) continue;
        out.push({ key, r: res.r, t: k[i].t + (res.bars + 1) * 300000, f: features(ind, k, i, s.side, dirAt ? dirAt(k[i].t) : 'flat', s.volx, extFn ? extFn(k[i].t, ind.c[i]) : null, p) });
        busy[key] = i + res.bars;
      }
    }
    return out;
  }

  function build(samples, journal, shadows) {
    const kb = { key: {}, cell: {} };
    const add = (key, f, r, w) => {
      const a = kb.key[key] || (kb.key[key] = { n: 0, s: 0, live: 0, liveS: 0 });
      a.n += w; a.s += r * w;
      if (w > 1) { a.live += 1; a.liveS += r; }
      for (const fk of Object.keys(FEATS)) {
        if (f[fk] == null || f[fk] === 'na') continue;
        const ck = key + '|' + fk + ':' + f[fk];
        const c = kb.cell[ck] || (kb.cell[ck] = { n: 0, s: 0, live: 0, liveS: 0 });
        c.n += w; c.s += r * w;
        if (w > 1) { c.live += 1; c.liveS += r; }
      }
    };
    for (const x of samples || []) if (x && x.f && isFinite(x.r)) add(x.key, x.f, x.r, 1);
    for (const x of shadows || []) if (x && x.f && x.r != null && isFinite(x.r)) add(x.type + ':' + x.side, x.f, x.r, 1);
    for (const j of journal || []) if (j && j.r != null && isFinite(j.r) && j.f) add(j.type + ':' + j.side, j.f, j.r, j.practice ? 1 : W_LIVE);
    return kb;
  }

  function estimate(kb, key, f) {
    const a = kb.key[key] || { n: 0, s: 0 };
    const base = (a.s + 0) / (a.n + PRIOR);
    const parts = [];
    let sum = 0;
    for (const fk of Object.keys(FEATS)) {
      if (f[fk] == null || f[fk] === 'na') continue;
      const ck = key + '|' + fk + ':' + f[fk];
      const c = kb.cell[ck] || { n: 0, s: 0, live: 0, liveS: 0 };
      const v = (c.s + PRIOR * base) / (c.n + PRIOR);
      parts.push({ fk, val: f[fk], n: c.n, live: c.live, avg: c.n ? c.s / c.n : null, est: v });
      sum += v;
    }
    return { est: parts.length ? sum / parts.length : base, base, n: a.n, parts };
  }

  function rules(kb, minN) {
    const m = minN || 15;
    const out = [];
    for (const ck of Object.keys(kb.cell)) {
      const c = kb.cell[ck];
      if (c.n < m) continue;
      const avg = c.s / c.n;
      const [key, fv] = ck.split('|');
      const [fk, val] = fv.split(':');
      if (avg < -0.1) out.push({ kind: 'avoid', key, fk, val, n: c.n, live: c.live, avg });
      else if (avg > 0.25) out.push({ kind: 'prefer', key, fk, val, n: c.n, live: c.live, avg });
    }
    out.sort((a, b) => (a.kind === b.kind ? (a.kind === 'avoid' ? a.avg - b.avg : b.avg - a.avg) : a.kind === 'avoid' ? -1 : 1));
    return out;
  }

  function hits(rs, key, f) {
    return rs.filter((r) => r.key === key && f[r.fk] === r.val);
  }

  function decide(kb, rs, key, f, replay, estMin) {
    const lim = estMin != null && isFinite(estMin) ? estMin : 0.1;
    const e = estimate(kb, key, f);
    const h = hits(rs, key, f);
    const avoid = h.filter((r) => r.kind === 'avoid');
    const prefer = h.filter((r) => r.kind === 'prefer');
    let go = e.est >= lim && !avoid.length && !(replay && replay.avgR < -0.3);
    let why;
    if (avoid.length) why = '守則避開：' + avoid.map(label).join('、');
    else if (e.est < lim) why = '同類的單預估只有 ' + fmtR(e.est) + '，不夠好';
    else if (replay && replay.avgR < -0.3) why = '時光機重播結果太差（' + fmtR(replay.avgR) + '）';
    else why = '同類的單預估 ' + fmtR(e.est) + (prefer.length ? '，符合偏好：' + prefer.slice(0, 2).map(label).join('、') + (prefer.length > 2 ? ' 等 ' + prefer.length + ' 條' : '') : '');
    return { go, est: e.est, why, avoid, prefer, parts: e.parts };
  }

  function fmtR(r) { return (r >= 0 || Math.abs(r) < 0.005 ? '+' : '−') + Math.abs(r).toFixed(2) + 'R'; }

  function label(r) {
    const [type, side] = r.key.split(':');
    return (T.TYPES[type] ? T.TYPES[type].name : type) + (side === 'long' ? '買漲' : '買跌') + '・' + FEATS[r.fk][r.val];
  }

  function sizing(journal, o) {
    const closed = (journal || []).filter((j) => j.r != null);
    const last = closed.slice(-20);
    const notes = [];
    let m = 1;
    if (last.length >= 5) {
      const avg = last.reduce((a, j) => a + j.r, 0) / last.length;
      if (avg > 0.2) { m *= 1.5; notes.push('最近 ' + last.length + ' 筆平均 ' + fmtR(avg) + '，加碼'); }
      else if (avg > 0) { m *= 1.2; notes.push('最近 ' + last.length + ' 筆平均 ' + fmtR(avg) + '，小加碼'); }
      else { m *= 0.5; notes.push('最近 ' + last.length + ' 筆平均 ' + fmtR(avg) + '，減半'); }
    } else notes.push('筆數還不夠，用標準大小');
    let streak = 0;
    for (let i = closed.length - 1; i >= 0 && closed[i].r <= 0; i--) streak++;
    if (streak >= 3) { m *= 0.5; notes.push('連賠 ' + streak + ' 筆，再減半'); }
    if (o && o.est != null) {
      if (o.est >= 0.4) { m *= 1.3; notes.push('這筆把握高'); }
      else if (o.est >= 0.25) { m *= 1.1; notes.push('這筆把握不錯'); }
      else if (o.est < 0.15) { m *= 0.7; notes.push('這筆把握普通，少放一點'); }
    }
    let risk = 0.01 * m;
    if (o && o.dd > 0.1) { risk = 0.0025; notes.push('團隊回撤超過額度 10%，降到最低'); }
    risk = Math.max(0.0025, Math.min(0.02, risk));
    return { risk, notes };
  }

  function teamDD(journal, alloc) {
    let cum = 0, peak = 0;
    for (const j of journal || []) if (j.pnl != null && isFinite(j.pnl)) { cum += j.pnl; if (cum > peak) peak = cum; }
    return alloc > 0 ? (peak - cum) / alloc : 0;
  }

  function accuracy(journal) {
    const c = (journal || []).filter((j) => j.r != null);
    const f = (a) => (a.length ? { n: a.length, wr: a.filter((j) => j.r > 0).length / a.length, avg: a.reduce((s, j) => s + j.r, 0) / a.length } : { n: 0, wr: 0, avg: 0 });
    return { recent: f(c.slice(-20)), before: f(c.slice(-40, -20)), all: f(c) };
  }

  function newsWords(title) { return new Set(String(title || '').toLowerCase().replace(/[^a-z0-9$ ]/g, ' ').split(/\s+/).filter((w) => w.length > 3)); }
  function newsSame(a, b) {
    const A = newsWords(a), B = newsWords(b);
    if (!A.size || !B.size) return false;
    let k = 0;
    for (const w of A) if (B.has(w)) k++;
    return k / (A.size + B.size - k) >= 0.5;
  }
  function newsHits(items, now) {
    let n = 0, hit = 0;
    for (const a of items || []) {
      if (a.dup || !a.s || !a.chk) continue;
      for (const sym of Object.keys(a.chk)) {
        const mv = a.chk[sym];
        if (typeof mv !== 'number' || Math.abs(mv) < 0.002) continue;
        n++;
        if ((mv > 0) === (a.s > 0)) hit++;
      }
    }
    return { n, hit, rate: n ? hit / n : null };
  }
  return { LIQ_BIG, LIQ_MID, liqAt, liqTier, EVWIN, derivState, newsSame, newsHits, NAMES, newsScore, newsCoins, newsMood, FEATS, W_LIVE, regimeSeries, session, features, samplesFrom, build, estimate, rules, hits, decide, label, sizing, teamDD, accuracy, fmtR };
})();
if (typeof module !== 'undefined') module.exports.Learn = TeamLearn;
