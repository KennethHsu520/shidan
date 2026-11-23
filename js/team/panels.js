function todayRisk() {
  const day = new Date().toDateString();
  const T = E.mine(state).filter((t) => new Date(t.t1).toDateString() === day);
  let sum = 0, streak = 0;
  for (const t of T) sum += t.ret;
  for (let i = T.length - 1; i >= 0 && T[i].pnl <= 0; i--) streak++;
  const lim = state.rules ? state.rules.day : 0.05;
  let verdict = '狀況正常，可以照計畫交易。';
  if (-sum >= lim) verdict = '今天已經賠到上限，建議今天停手，或把單交給團隊。';
  else if (streak >= 5) verdict = '連賠 ' + streak + ' 筆，判斷可能失準了。建議今天先停手，改成「交給團隊」看它怎麼做。';
  else if (streak >= 2) verdict = '連賠 ' + streak + ' 筆，建議先休息 30 分鐘再看。';
  else if (-sum >= lim * 0.6) verdict = '今天已經賠了上限的六成，下一筆把金額縮小。';
  return { n: T.length, sum, streak, lim, verdict };
}
function avgR(T) { const rs = T.filter((t) => t.r != null); return rs.length ? rs.reduce((a, t) => a + t.r, 0) / rs.length : null; }
function compareHTML() {
  const A = E.mine(state), B = state.trades.filter((t) => t.owner === 'team');
  const a = E.statsFor(A), b = E.statsFor(B);
  const ra = avgR(A), rb = avgR(B);
  const sum = (T) => T.reduce((x, t) => x + t.pnl, 0);
  const row = (l, x, y) => '<div class="cmp-row"><span>' + l + '</span><b>' + x + '</b><b>' + y + '</b></div>';
  return '<section><h3>你和團隊</h3><div class="cmp"><div class="cmp-row head"><span></span><b>你</b><b>團隊</b></div>' +
    row('交易筆數', a.n, b.n) + row('勝率', a.n ? Math.round(a.winRate * 100) + '%' : '—', b.n ? Math.round(b.winRate * 100) + '%' : '—') +
    row('平均 R', ra == null ? '—' : fR(ra), rb == null ? '—' : fR(rb)) + row('每筆期望值', a.n ? fPct(a.exp) : '—', b.n ? fPct(b.exp) : '—') +
    row('已實現損益', a.n ? '<span class="' + cls(sum(A)) + '">' + fS(sum(A)) + '</span>' : '—', b.n ? '<span class="' + cls(sum(B)) + '">' + fS(sum(B)) + '</span>' : '—') +
    '</div><div class="sub" style="margin-top:8px">期望值以當時總資產計算。委託給團隊的單算團隊的成績。</div></section>';
}
function newsHTML() {
  if (S.mode !== 'live') return '';
  const list = (NW.items || []).slice().sort((a, b) => b.t - a.t);
  const pick = list.filter((a) => !a.dup && (a.syms.length || a.s !== 0)).slice(0, 8);
  const hh = L.newsHits((NW.items || []).filter((a) => !a.counted));
  const hn = hh.n + ((NW.hist && NW.hist.n) || 0), hk = hh.hit + ((NW.hist && NW.hist.hit) || 0);
  const hitTxt = hn ? '<div class="big">' + Math.round((hk / hn) * 100) + '%<small>好壞判斷的命中率（' + hn + ' 次）</small></div><div class="sub">每則有幣種的新聞，團隊會記下當時價格，1 小時後檢查：判斷好的有沒有漲、判斷壞的有沒有跌（變動小於 0.2% 不算）。' + (hn >= 30 ? (hk / hn >= 0.55 ? '目前判斷有參考價值。' : hk / hn <= 0.45 ? '目前判斷不太準，團隊會自己降低新聞的影響。' : '目前跟擲硬幣差不多，團隊會繼續觀察。') : '滿 30 次才看得出準不準。') + '</div>' : '';
  const lab = (a) => (a.ev ? '<span class="vd vn">' + NEWS_EV[a.ev] + '</span>' : a.s > 0 ? '<span class="vd vy">好</span>' : a.s < 0 ? '<span class="vd vn">壞</span>' : '<span class="vd vo">中</span>');
  const body = pick.length ? '<div class="list">' + pick.map((a) => '<div class="row nrow"><div class="nmeta">' + lab(a) + a.syms.slice(0, 3).map((x) => '<span class="tag">' + esc(x) + '</span>').join('') + '<span class="sub">' + esc(fAgo(Date.now() - a.t)) + (a.src ? '・' + esc(a.src) : '') + (a.copies ? '・共 ' + (a.copies + 1) + ' 家報導' : '') + '</span></div>' + (a.link ? '<a class="ntitle" href="' + esc(a.link) + '" target="_blank" rel="noopener noreferrer">' + esc(a.title) + '</a>' : '<span class="ntitle">' + esc(a.title) + '</span>') + '</div>').join('') + '</div>' : '<div class="empty">' + (NW.ok === false ? '新聞暫時讀不到，團隊照常用其他資料判斷。' : '讀取新聞中。') + '</div>';
  return '<section><h3>新聞</h3>' + hitTxt + body + '<p class="say">團隊每 5 分鐘讀一次新聞，用關鍵字判斷好壞：駭客、下架、起訴這類重大壞消息出現 6 小時內，不買漲那個幣；其他好壞消息交給團隊自己學有沒有用。標題是原文，好壞標籤是團隊的判斷，偶爾會判斷錯。同一件事很多家報導只算一則，但報導越多家越有份量；越新的新聞影響越大。資料來源：' + esc(NW.src || 'cryptocurrency.cv') + '</p></section>';
}
function featTxt(f) {
  if (!f) return '';
  return Object.keys(L.FEATS).filter((k) => f[k] && f[k] !== 'na' && L.FEATS[k][f[k]]).map((k) => L.FEATS[k][f[k]]).join('・');
}
function sigRow(s) {
  const go = s.dec && s.dec.go;
  return '<button class="row sig" data-act="sig" data-id="' + esc(s.id) + '"><span class="body"><b>' + esc(s.sym) + '<span class="tag ' + (s.side === 'long' ? 'up' : 'down') + '">' + SIDE[s.side] + '</span><span class="grade g' + (s.grade || 'N') + '">' + (s.grade || '評估中') + '</span>' + (go ? '<span class="tag who-t">團隊會做</span>' : '') + '</b><span class="sub">' + Team.TYPES[s.type].name + '　' + esc(featTxt(s.f)) + '</span><span class="sub">' + esc(s.dec ? s.dec.why : '') + '</span>' + (s.block ? '<span class="sub down">擋下：' + esc(s.block) + '</span>' : '') + '</span><span class="pr"><b class="' + (s.dec ? cls(s.dec.est) : '') + '">' + (s.dec ? L.fmtR(s.dec.est) : '—') + '</b><small>團隊預估</small></span></button>';
}
function keyRow(res) {
  const st = res.st, mc = res.mc;
  return '<button class="row sig" data-act="tkey" data-id="' + res.key + '"><span class="body"><b>' + Team.TYPES[res.type].name + '<span class="tag ' + (res.side === 'long' ? 'up' : 'down') + '">' + SIDE[res.side] + '</span><span class="grade g' + res.grade + '">' + res.grade + '</span></b><span class="sub">出現 ' + st.n + ' 次　勝率 ' + (st.n ? Math.round(st.wr * 100) + '%' : '—') + '　平均 ' + (st.n ? fR(st.avgR) : '—') + '　最慘連賠 ' + st.maxLoss + ' 次' + (res.oos && res.oos.n ? '　樣本外 ' + fR(res.oos.avgR) : '') + (res.ovf ? '　<b class="down">可能過度擬合</b>' : '') + '</span></span><span class="pr"><b class="' + (mc ? cls(mc.p50) : '') + '">' + (mc ? fR(mc.p50) : '—') + '</b><small>做 50 次的中間結果</small></span></button>';
}
function teamPosRows() {
  const P = teamPos();
  const now = Date.now();
  const rows = P.map((p) => {
    const px = S.prices[p.sym] > 0 ? S.prices[p.sym] : p.entry;
    const v = E.posValue(p, px) - p.margin;
    const r = posR(p, px);
    return '<div class="row"><div class="row-main"><div><b>' + esc(p.sym) + '</b><span class="tag ' + (p.side === 'long' ? 'up' : 'down') + '">' + SIDE[p.side] + (p.lev > 1 ? ' ' + p.lev + 'x' : '') + '</span><span class="tag">' + (p.hand ? '你交給團隊的' : p.ask ? '你請團隊判斷的' : p.src === 'deleg' ? '你委託的' : p.practice ? '練習單' : p.explore ? '試單' : '團隊判斷的') + '</span><div class="sub">進場 ' + fP(p.entry) + '　停損 ' + fP(p.sl) + '　停利 ' + fP(p.tp) + (p.until ? '　剩 ' + fLeft(p.until - now) : '') + '</div>' + thesisLine(p) + '</div><div class="right"><b class="' + cls(v) + '">' + fS(v) + '</b><div class="sub">' + fPct(v / p.margin) + (r != null ? '　' + fR(r) : '') + '</div></div></div><div class="row-actions"><button class="btn sm" data-act="closeId" data-id="' + p.id + '">平倉</button><button class="btn sm" data-act="takeover" data-id="' + p.id + '">改由我管</button>' + (p.sym !== state.settings.sym ? '<button class="btn sm" data-act="sym" data-id="' + esc(p.sym) + '">看圖</button>' : '') + '</div></div>';
  });
  const ds = TS.delegs.map((d) => delegRow(d, now, true));
  return rows.concat(ds).join('');
}
function riskSvg(J) {
  const pts = J.filter((j) => j.risk != null).slice(-30).map((j) => j.risk);
  if (pts.length < 2) return '';
  const W = 300, H = 56, lo = 0.0025, hi = 0.02;
  const x = (i) => 4 + (i / (pts.length - 1)) * (W - 8);
  const y = (v) => 4 + ((hi - v) / (hi - lo)) * (H - 8);
  const d = pts.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  return '<svg class="rsvg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-label="每筆風險變化"><line x1="0" x2="' + W + '" y1="' + y(0.01).toFixed(1) + '" y2="' + y(0.01).toFixed(1) + '" class="g"/><path d="' + d + '" class="l"/><circle cx="' + x(pts.length - 1).toFixed(1) + '" cy="' + y(pts[pts.length - 1]).toFixed(1) + '" r="3" class="c"/></svg><div class="sub rsvg-l"><span>最近 ' + pts.length + ' 筆每筆風險</span><span>虛線 = 1%　範圍 0.25%～2%</span></div>';
}
function journalRows(J) {
  return J.slice(-10).reverse().map((j) => {
    const st = j.cancel ? '<span class="vd vx">不計</span>' : j.r == null ? '<span class="vd vo">進行中</span>' : j.ok ? '<span class="vd vy">對</span>' : '<span class="vd vn">錯</span>';
    return '<div class="row jrow"><div class="row-main"><div>' + st + '<b>' + esc(j.sym) + '</b><span class="tag ' + (j.side === 'long' ? 'up' : 'down') + '">' + SIDE[j.side] + '</span><span class="sub">　' + Team.TYPES[j.type].name + (j.src === 'deleg' ? '・你委託' : j.practice ? '・練習單' : j.explore ? '・試單' : '') + '</span></div><div class="right"><b class="' + (j.r != null ? cls(j.r) : '') + '">' + (j.r != null ? L.fmtR(j.r) : '—') + '</b><div class="sub">預估 ' + (j.est != null ? L.fmtR(j.est) : '—') + (j.risk ? '　風險 ' + (j.risk * 100).toFixed(2) + '%' : '') + '</div></div></div><p class="jw">' + esc(fT(j.t0)) + '　' + esc(featTxt(j.f)) + '</p><p class="jw">為什麼做：' + esc(j.why || '—') + '</p>' + (j.con && j.con.length ? '<p class="jw">反方意見：' + esc(j.con.join('；')) + '</p>' : '') + (j.review ? '<p class="jw jr">檢討：' + esc(j.review) + '</p>' : '') + '</div>';
  }).join('');
}
function ruleRows(list) {
  return list.map((r) => '<div class="row"><div class="row-main"><span>' + esc(L.label(r)) + '</span><span class="sub">' + Math.round(r.n) + ' 份樣本' + (r.live ? '（實戰 ' + r.live + ' 筆）' : '') + '　<b class="' + cls(r.avg) + '">' + L.fmtR(r.avg) + '</b></span></div></div>').join('');
}

function briefHTML() {
  const now = Date.now();
  const ly = layers('long', now);
  const sc = sectors();
  const strong = sc.rows.filter((r) => r.st === 'strong'), weak = sc.rows.filter((r) => r.st === 'weak');
  const ev = MACRO_CAL.filter((e) => e.t + 3600000 > now && e.t < now + DAY);
  const g = guard();
  const fgv = MD.fg.length ? MD.fg[MD.fg.length - 1].v : null;
  const C = closedTeam();
  const d0 = dayStart(now);
  const yd = sumUp(C.filter((j) => j.t1 >= d0 - DAY && j.t1 < d0)), td = sumUp(C.filter((j) => j.t1 >= d0));
  const plan = [];
  if (g.block) plan.push('暫停：' + g.block);
  for (const e of ev) plan.push(fHM(e.t) + '「' + e.name + '」前 30 分鐘到後 1 小時不進場');
  if (ly.known >= 2) {
    if (ly.against === 3) plan.push('三層都偏空：不買漲，只考慮買跌');
    else if (ly.against === 2) plan.push('大方向偏空：買漲減半');
    else if (ly.against === 0 && ly.known === 3) plan.push('三層一致偏多：買漲照常做');
  }
  else if (TS.regime && TS.regime.dir !== 'flat') plan.push('大盤 1 小時' + (TS.regime.dir === 'up' ? '偏多' : '偏空') + '（長期資料還在讀取）');
  if (strong.length) plan.push('優先看 ' + strong.map((r) => r.name).join('、') + ' 板塊的買漲');
  if (weak.length) plan.push(weak.map((r) => r.name).join('、') + ' 板塊偏弱：買漲減碼');
  if (fgv != null && fgv >= 75) plan.push('市場極度貪婪：不追突破');
  if (fgv != null && fgv <= 20) plan.push('市場極度恐懼：買跌減半');
  if (g.wkend) plan.push('週末成交量小：全部半量');
  const ex = exploreState();
  if (ex.on) plan.push('試單期：看到訊號就用最小風險做（' + ex.done + ' / ' + EXPLORE_N + '）');
  const dayTxt = (x) => (x.n ? x.n + ' 筆　勝率 ' + Math.round(x.wr * 100) + '%　合計 <b class="' + cls(x.R) + '">' + L.fmtR(x.R) + '</b>　<span class="' + cls(x.pnl) + '">' + fS(x.pnl) + '</span>' : '沒有結束的單');
  const wd = '日一二三四五六'[new Date(now).getDay()];
  const row = (k, v) => '<div class="row"><div class="row-main"><span>' + k + '</span><span class="sub">' + v + '</span></div></div>';
  return '<section><h3>今日簡報　' + (new Date(now).getMonth() + 1) + '/' + new Date(now).getDate() + '（' + wd + '）</h3><div class="verdict ' + (g.block ? 'down' : '') + '" style="font-size:20px">' + esc(plan[0] || '照常交易，沒有特別要注意的') + '</div>' +
    (plan.length > 1 ? '<ol class="plan">' + plan.slice(1).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ol>' : '') +
    '<div class="list" style="margin-top:12px">' +
    row('大方向', esc(lyVerdict(ly))) +
    row('今天的重大數據', ev.length ? ev.map((e) => esc(fHM(e.t) + ' ' + e.name)).join('、') : '沒有') +
    row('強勢板塊', strong.length ? strong.map((r) => esc(r.name)).join('、') : sc.ok ? '沒有明顯領漲' : '計算中') +
    row('弱勢板塊', weak.length ? weak.map((r) => esc(r.name)).join('、') : sc.ok ? '沒有明顯落後' : '計算中') +
    (fgv != null ? row('市場情緒', '恐懼貪婪 ' + fgv) : '') +
    row('團隊昨天', dayTxt(yd)) + row('團隊今天', dayTxt(td)) +
    row('手上的單', teamPos().length + ' 筆　承擔風險 ' + (g.A > 0 ? ((g.open / g.A) * 100).toFixed(1) : '0.0') + '%') +
    '</div><p class="say">每天第一次打開就是新的一份；內容跟著行情即時更新。上面是團隊今天會照做的事。</p></section>';
}
function sectorHTML() {
  const sc = sectors();
  if (!sc.rows.length) return '<section><h3>板塊輪動</h3><div class="empty">掃描完第一輪後開始計算。</div></section>';
  const st = (r) => (r.st === 'strong' ? '<span class="vd vy">強</span>' : r.st === 'weak' ? '<span class="vd vn">弱</span>' : '<span class="vd vo">中</span>');
  const pc = (x) => (x == null ? '—' : '<span class="' + cls(x) + '">' + fPct(x, 1) + '</span>');
  return '<section><h3>板塊輪動　跟比特幣比</h3><div class="list">' + sc.rows.map((r) => '<div class="row"><div class="row-main"><div>' + st(r) + '<b>' + esc(r.name) + '</b><div class="sub">' + r.coins.slice(0, 6).map(esc).join('・') + (r.coins.length > 6 ? ' 等 ' + r.coins.length + ' 個' : '') + '　上漲比例 ' + Math.round(r.up * 100) + '%</div></div><div class="right"><b>' + pc(r.rel4) + '</b><div class="sub">4 小時・24 小時 ' + pc(r.rel24) + '</div></div></div></div>').join('') + '</div><p class="say">把前 ' + S.coins.length + ' 大幣分成 8 個板塊，算每個板塊平均漲跌減掉比特幣的漲跌（4 小時佔六成、24 小時佔四成）。領先比特幣 0.5% 以上、而且一半以上的幣在漲，就是強勢板塊；反過來就是弱勢。團隊會先掃強勢板塊的幣；弱勢板塊買漲、強勢板塊買跌都減碼四分之一；「順板塊強弱」也當成學習條件，有沒有用由團隊自己學。不在分類裡的幣不受影響。</p></section>';
}
function weekHTML() {
  const now = Date.now();
  const C = closedTeam();
  const w0 = weekStart(now);
  const cur = C.filter((j) => j.t1 >= w0), last = C.filter((j) => j.t1 >= w0 - 7 * DAY && j.t1 < w0);
  const a = sumUp(cur), b = sumUp(last);
  const cell = (x) => (x.n ? '<b class="' + cls(x.R) + '">' + L.fmtR(x.R) + '</b><small>' + x.n + ' 筆　勝率 ' + Math.round(x.wr * 100) + '%<br>' + fS(x.pnl) + ' USDT</small>' : '<b>—</b><small>沒有紀錄</small>');
  const grp = (J, keyOf, nameOf) => { const m = {}; for (const j of J) { const k = keyOf(j); if (k == null) continue; (m[k] = m[k] || []).push(j.r); } return Object.keys(m).map((k) => ({ name: nameOf(k), n: m[k].length, avg: m[k].reduce((x, y) => x + y, 0) / m[k].length })); };
  const base = cur.length >= 5 ? cur : cur.concat(last);
  const bType = grp(base, (j) => j.type + ':' + j.side, (k) => Team.TYPES[k.split(':')[0]].name + SIDE[k.split(':')[1]]).sort((x, y) => y.avg - x.avg);
  const bSec = grp(base, (j) => sectName(j.sym), (k) => k).sort((x, y) => y.avg - x.avg);
  const feats = [];
  for (const j of base) if (j.f) for (const fk of Object.keys(j.f)) if (j.f[fk] !== 'na' && L.FEATS[fk] && L.FEATS[fk][j.f[fk]]) feats.push({ k: fk + ':' + j.f[fk], r: j.r });
  const fg = grp(feats, (x) => x.k, (k) => L.FEATS[k.split(':')[0]][k.split(':')[1]]).filter((x) => x.n >= 3);
  const good = fg.filter((x) => x.avg > 0).sort((x, y) => y.avg - x.avg).slice(0, 3), badF = fg.filter((x) => x.avg < 0).sort((x, y) => x.avg - y.avg).slice(0, 3);
  const thx = base.filter((j) => j.exit === 'thesis');
  const ln = (x) => '<div class="row"><div class="row-main"><span>' + esc(x.name) + '</span><span class="sub">' + x.n + ' 筆　<b class="' + cls(x.avg) + '">平均 ' + L.fmtR(x.avg) + '</b></span></div></div>';
  let say = '';
  if (a.n && b.n) say = a.avg > b.avg + 0.05 ? '這週平均每筆比上週好，目前的守則有效。' : a.avg < b.avg - 0.05 ? '這週平均每筆比上週差，團隊會依資金控制自動減碼。' : '這週和上週差不多。';
  else if (!a.n && !b.n) say = '這兩週還沒有結束的團隊單。';
  const au = auditRun();
  const auHTML = '<h4 class="rh">帳務稽核</h4><div class="verdict ' + (au.ok ? '' : 'down') + '" style="font-size:18px">' + (au.ok ? '帳務全部正確' : '發現問題，請看下面標紅的項目') + '</div><div class="list" style="margin-top:8px">' + au.items.map((x) => '<div class="row"><div class="row-main"><div>' + (x.ok ? '<span class="vd vy">對</span>' : x.warn ? '<span class="vd vo">注意</span>' : '<span class="vd vn">錯</span>') + '<b>' + esc(x.k) + '</b><div class="sub' + (x.ok || x.warn ? '' : ' down') + '">' + esc(x.d) + '</div></div></div></div>').join('') + '</div>';
  const past = TS.weeks.slice(0, 6);
  const pastHTML = past.length ? '<h4 class="rh">過去的週報</h4><div class="list">' + past.map((w) => '<div class="row"><div class="row-main"><span>' + esc(fT(w.w).split(' ')[0]) + ' 那週' + (w.audit ? '' : '<span class="vd vn">帳務有誤</span>') + '</span><span class="sub">' + w.n + ' 筆　勝率 ' + (w.n ? Math.round((w.win / w.n) * 100) : 0) + '%　<b class="' + cls(w.R) + '">' + L.fmtR(w.R) + '</b>　<span class="' + cls(w.pnl) + '">' + fS(w.pnl) + '</span></span></div></div>').join('') + '</div>' : '';
  return '<section><h3>週報　' + esc(fT(w0).split(' ')[0]) + ' 起</h3><div class="acc"><div><label>這週</label>' + cell(a) + '</div><div><label>上週</label>' + cell(b) + '</div><div><label>最好／最差一筆</label>' + (a.n ? '<b class="up">' + L.fmtR(a.best.r) + '</b><small>' + esc(a.best.sym) + '　最差 ' + esc(a.worst.sym) + ' ' + L.fmtR(a.worst.r) + '</small>' : '<b>—</b><small>這週還沒有</small>') + '</div></div>' + (say ? '<p class="say">' + say + '</p>' : '') +
    (base.length ? '<h4 class="rh">哪種訊號賺錢' + (base === cur ? '' : '（這兩週）') + '</h4><div class="list">' + bType.map(ln).join('') + '</div><h4 class="rh">哪個板塊賺錢</h4><div class="list">' + bSec.map(ln).join('') + '</div>' : '') +
    (good.length ? '<h4 class="rh">有效的條件</h4><div class="list">' + good.map(ln).join('') + '</div>' : '') + (badF.length ? '<h4 class="rh">虧錢的條件</h4><div class="list">' + badF.map(ln).join('') + '</div>' : '') +
    (thx.length ? '<p class="say">論點失效提早出場 ' + thx.length + ' 筆，平均 ' + L.fmtR(thx.reduce((x, j) => x + j.r, 0) / thx.length) + '。</p>' : '') +
    auHTML + pastHTML + '<p class="say">週報從週一 0 點算起，每週一自動把上週存進「過去的週報」（最多 12 週）。條件至少 3 筆才列出。帳務稽核每次打開都重算：現金、持倉、掛單加總要等於起點加上之後所有成交的損益，差 0.01 USDT 就會標出來；段位升降或第一次接上即時行情時，對帳起點會重新設定。</p></section>';
}
function thesisLine(p) {
  if (p.src === 'deleg') return '';
  const j = TS.journal.find((x) => x.id === p.id);
  if (!j || !j.th) return '';
  if (!j.th.length) return '<div class="sub">論點：進場時沒有可追蹤的條件</div>';
  const b = j.thb || [];
  return '<div class="sub">論點：' + j.th.map((k) => esc(TH_TXT[k])).join('・') + '　' + (b.length ? '<b class="down">動搖：' + b.map((k) => esc(TH_TXT[k])).join('、') + '變了' + (b.length < 2 && !b.includes('news') ? '（再一項就出場）' : '') + '</b>' : '<b class="up">成立</b>') + '</div>';
}
