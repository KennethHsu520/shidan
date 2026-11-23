const SHKEY = 'gaoqian.shadow';
const SH_MAX = 500;
const FEED_MAX = 150;
const PRACTICE_GAP = 2 * 3600000;
const VETO = { est: '預估不夠好', avoid: '符合避開守則', replay: '重播結果太差', con: '反方審查', brain: '大方向、新聞或數據公布', guard: '防守規則', shock: '比特幣急動', small: '小幣只做 A、B 級', cap: '風險上限', chase: '價格跑掉不追', budget: '團隊額度', short: '買跌還沒解鎖', deleg: '讓給你的委託', off: '自己找單關閉', size: '金額太小', busy: '試單名額已滿', data: '資料有問題', other: '其他' };
const VETO_WHO = { est: '機會獵人', avoid: '團隊守則', replay: '時光機', con: '反方審查', brain: '市場總監', guard: '風控長', shock: '風控長', small: '風控長', cap: '風控長', budget: '風控長', chase: '交易員', short: '交易員', deleg: '交易員', off: '交易員', size: '交易員', busy: '交易員', data: '資料查核員', other: '交易員' };
function cleanF(f) {
  if (!f || typeof f !== 'object') return null;
  return Object.fromEntries(Object.keys(L.FEATS).filter((k) => typeof f[k] === 'string' && L.FEATS[k][f[k]]).map((k) => [k, f[k]]));
}
const finN = (v) => typeof v === 'number' && isFinite(v);
function loadShadow() {
  let r = null;
  try { r = JSON.parse(localStorage.getItem(SHKEY)); } catch (e) { r = null; }
  const okS = (x) => x && typeof x.id === 'string' && E.SYM.test(x.sym) && Team.TYPES[x.type] && (x.side === 'long' || x.side === 'short') && finN(x.barT) && x.plan && [x.plan.entry, x.plan.stop, x.plan.target, x.plan.dist].every(finN) && x.plan.dist > 0 && VETO[x.cat];
  TS.shadows = Array.isArray(r && r.s) ? r.s.filter(okS).map((x) => ({ id: x.id.slice(0, 80), sym: x.sym, type: x.type, side: x.side, barT: x.barT, plan: { entry: x.plan.entry, stop: x.plan.stop, target: x.plan.target, dist: x.plan.dist }, f: cleanF(x.f), est: finN(x.est) ? x.est : null, grade: ['A', 'B', 'C'].includes(x.grade) ? x.grade : null, go: !!x.go, cat: x.cat, why: String(x.why || '').slice(0, 220), r: finN(x.r) ? x.r : null, how: typeof x.how === 'string' ? x.how.slice(0, 8) : null, t1: finN(x.t1) ? x.t1 : null })).slice(-SH_MAX) : [];
  TS.feed = Array.isArray(r && r.feed) ? r.feed.filter((x) => x && finN(x.t) && typeof x.text === 'string' && typeof x.who === 'string').map((x) => ({ t: x.t, who: x.who.slice(0, 10), text: x.text.slice(0, 200) })).slice(-FEED_MAX) : [];
}
function saveShadow() {
  if (SY.applying) return;
  const put = () => localStorage.setItem(SHKEY, JSON.stringify({ v: 1, s: TS.shadows || [], feed: TS.feed || [] }));
  try { put(); } catch (e) {
    TS.shadows = (TS.shadows || []).slice(-200);
    try { put(); } catch (e2) { return; }
  }
}
function logWho(text) {
  const t = String(text || '');
  if (/守則/.test(t)) return '團隊守則';
  if (/論點|進場理由/.test(t)) return '論點追蹤';
  if (/暫停|恢復|回落|冷靜/.test(t)) return '風控長';
  if (/補跑/.test(t)) return '時光機';
  return '交易員';
}
function feed(who, text) {
  if (!text || !TS.feed) return;
  const t = nowT();
  const F = TS.feed;
  if (F.some((x) => x.text === text && Math.abs(t - x.t) < 60000)) return;
  F.push({ t, who: String(who || '團隊').slice(0, 10), text: String(text).slice(0, 200) });
  if (F.length > 1 && F[F.length - 2].t > t) F.sort((a, b) => a.t - b.t);
  if (F.length > FEED_MAX) F.splice(0, F.length - FEED_MAX);
}
function sigName(s) { return s.sym + ' ' + Team.TYPES[s.type].name + SIDE[s.side]; }
function sigDone(sig) {
  if (TS.scanStat && CLK == null) TS.scanStat.trade++;
  return true;
}
function sigSkip(sig, cat, why) {
  const c = VETO[cat] ? cat : 'other';
  sig.skip = { cat: c, why };
  if (CLK != null) return false;
  if (TS.scanStat) TS.scanStat.skip++;
  shadowAdd(sig, c, why);
  const good = (sig.dec && sig.dec.go) || sig.grade === 'A' || sig.grade === 'B';
  if (good && !['held', 'deleg', 'off', 'est'].includes(c)) feed(VETO_WHO[c], sigName(sig) + (sig.grade ? '（' + sig.grade + ' 級）' : '') + ' 沒做：' + why);
  return false;
}
function shadowAdd(sig, cat, why) {
  if (cat === 'held' || !sig.plan || !(sig.plan.dist > 0)) return;
  const S0 = TS.shadows || (TS.shadows = []);
  if (S0.some((x) => x.id === sig.id)) return;
  S0.push({ id: sig.id, sym: sig.sym, type: sig.type, side: sig.side, barT: sig.barT, plan: { entry: sig.plan.entry, stop: sig.plan.stop, target: sig.plan.target, dist: sig.plan.dist }, f: cleanF(sig.f), est: sig.dec && finN(sig.dec.est) ? +sig.dec.est.toFixed(3) : null, grade: sig.grade || null, go: !!(sig.dec && sig.dec.go), cat, why: String(why || '').slice(0, 220), r: null, how: null, t1: null });
  if (S0.length > SH_MAX) S0.splice(0, S0.length - SH_MAX);
}
function shadowResolve() {
  if (CLK != null || !TS.shadows || !TS.shadows.length) return 0;
  const now = Date.now();
  const closed = {};
  let done = 0;
  const drop = new Set();
  for (const x of TS.shadows) {
    if (x.r != null) continue;
    const k = TS.recent && TS.recent[x.sym];
    if (!k || !k.length) { if (now - x.barT > 13 * 3600000) drop.add(x); continue; }
    const kc = closed[x.sym] || (closed[x.sym] = k.filter((b) => b.t + BAR5 <= now));
    const i = kc.findIndex((b) => b.t === x.barT);
    if (i < 0) { if (now - x.barT > 13 * 3600000 || (kc.length && kc[0].t > x.barT)) drop.add(x); continue; }
    const res = Team.simulate(kc, i, x.plan, x.side, true);
    if (!res) continue;
    x.r = +res.r.toFixed(3);
    x.how = res.how;
    x.t1 = kc[i].t + (res.bars + 1) * BAR5;
    done++;
    if (x.go || x.grade === 'A' || x.grade === 'B' || Math.abs(x.r) >= 1.5) feed('影子單', sigName(x) + ' 被「' + VETO[x.cat] + '」擋下，影子結果 ' + L.fmtR(x.r) + (x.r > 0.1 ? '，這次擋錯了' : x.r < 0 ? '，這次擋對了' : ''));
  }
  if (drop.size) TS.shadows = TS.shadows.filter((x) => !drop.has(x));
  if (done && TS.kb) learnRebuild(false);
  return done;
}
function shadowLearn(cut) {
  const from = TS.histAt || 0;
  return (TS.shadows || []).filter((x) => x.r != null && x.f && x.barT + Team.HOLD * BAR5 >= from && (!cut || (x.t1 && x.t1 < cut)));
}
function vetoStats(days) {
  const from = Date.now() - days * DAY;
  const X = (TS.shadows || []).filter((x) => x.r != null && x.barT >= from);
  const by = {};
  for (const x of X) { const b = by[x.cat] || (by[x.cat] = { cat: x.cat, n: 0, sum: 0, win: 0 }); b.n++; b.sum += x.r; if (x.r > 0) b.win++; }
  const rows = Object.values(by).map((b) => Object.assign(b, { avg: b.sum / b.n })).sort((a, b) => b.n - a.n);
  const all = X.length ? X.reduce((a, x) => a + x.r, 0) / X.length : null;
  return { rows, n: X.length, avg: all };
}
function vetoVerdict(b) {
  if (b.n < 10) return { t: '樣本不到 10 筆，先不下結論', c: '' };
  if (b.avg > 0.1) return { t: '可能擋太多：被擋的單平均還賺 ' + L.fmtR(b.avg), c: 'up' };
  if (b.avg < -0.05) return { t: '擋得對：被擋的單平均 ' + L.fmtR(b.avg), c: 'down' };
  return { t: '差不多打平，這一關影響不大', c: '' };
}
function scanFeed(n) {
  const st = TS.scanStat;
  if (!st || CLK != null) return;
  const now = Date.now();
  if (st.sig > 0) {
    TS.lastSigFeed = now;
    feed('掃描器', '掃完 ' + n + ' 個幣：新訊號 ' + st.sig + ' 個，團隊做 ' + st.trade + ' 筆，沒做 ' + st.skip + ' 個（記成影子單）');
    return;
  }
  if (!TS.lastSigFeed) TS.lastSigFeed = now;
  if (now - TS.lastSigFeed >= 30 * 60000) { TS.lastSigFeed = now; feed('掃描器', '過去 30 分鐘掃描 ' + n + ' 個幣，都沒有新訊號'); }
}
function practiceState() {
  const J = TS.journal.filter((j) => !j.cancel && j.src !== 'deleg');
  const last = J.reduce((m, j) => Math.max(m, j.t0 || 0), 0);
  const open = teamPos().some((p) => p.src !== 'deleg');
  const base = Math.max(last, TS.awake || Date.now());
  const P = TS.journal.filter((j) => j.practice && !j.cancel);
  const done = P.filter((j) => j.r != null);
  return { on: TS.practice !== false, last, open, due: base + PRACTICE_GAP, n: P.length, done: done.length, avg: done.length ? done.reduce((a, j) => a + j.r, 0) / done.length : null };
}
function practiceWhy(sig) {
  const ps = practiceState();
  const h = ps.last ? Math.floor((Date.now() - ps.last) / 3600000) : null;
  return '冷場練習：團隊' + (h != null && h >= 2 ? ' ' + h + ' 小時' : '超過 2 小時') + '沒進場，挑當下最好的 ' + (sig.grade || 'B') + ' 級訊號用最小風險做；不算進資金控制和準確率' + (sig.dec && sig.dec.est != null ? '。預估 ' + L.fmtR(sig.dec.est) : '');
}
function practiceCheck() {
  if (CLK != null || TS.practice === false || !TS.auto || state.settings.teamPct <= 0 || !TS.kb || TS.gapFrom != null || !teamReady()) return false;
  const ps = practiceState();
  if (ps.open || Date.now() < ps.due) { TS.practiceMiss = null; return false; }
  const now = Date.now();
  const cand = TS.signals.filter((s) => now - (s.barT + BAR5) < 15 * 60000 && (s.grade === 'A' || s.grade === 'B') && !(s.dec && s.dec.avoid && s.dec.avoid.length) && !TS.delegs.some((d) => d.sym === s.sym)).sort((a, b) => a.grade.localeCompare(b.grade) || (b.dec ? b.dec.est : -9) - (a.dec ? a.dec.est : -9));
  for (const s of cand) {
    if (teamTrade(s, 'practice', false)) {
      s.practice = true;
      TS.practiceMiss = null;
      if (TS.shadows) TS.shadows = TS.shadows.filter((x) => x.id !== s.id);
      return true;
    }
  }
  const why = cand.length ? '有 ' + cand.length + ' 個 B 級以上的候選，但都被擋下（' + (cand[0].block || '條件不符') + '）' : '現在沒有 B 級以上、沒碰到避開守則的訊號';
  if (TS.practiceMiss !== why) { TS.practiceMiss = why; feed('交易員', '冷場 2 小時，想做練習單：' + why); }
  return false;
}
function feedHTML() {
  const F = (TS.feed || []).slice(-14).reverse();
  return '<section><h3>團隊動態</h3>' + (F.length ? '<div class="feedl">' + F.map((x) => '<div class="fr"><span class="ft">' + fHM(x.t) + '</span><span class="fw">' + esc(x.who) + '</span><span class="fx">' + esc(x.text) + '</span></div>').join('') + '</div>' : '<div class="empty">團隊開始掃描後，每個角色做了什麼都會記在這裡。</div>') + '<p class="say">只留最近 ' + FEED_MAX + ' 則，存在這台裝置。</p></section>';
}
function vetoHTML() {
  const now = Date.now();
  const X = TS.shadows || [];
  const d0 = dayStart(now);
  const today = X.filter((x) => x.barT >= d0);
  const pend = X.filter((x) => x.r == null).length;
  const vs = vetoStats(7);
  const C = closedTeam().filter((j) => j.src !== 'deleg' && j.t1 >= now - 7 * DAY);
  const tAvg = C.length ? C.reduce((a, j) => a + j.r, 0) / C.length : null;
  const nSamp = (TS.samples || []).length;
  const nLive = TS.journal.filter((j) => !j.cancel && j.r != null && !j.practice).length;
  const nSh = shadowLearn(TS.sampleCut).length;
  const rows = vs.rows.map((b) => { const v = vetoVerdict(b); return '<div class="row"><div class="row-main"><div><b>' + esc(VETO[b.cat]) + '</b><div class="sub ' + v.c + '">' + esc(v.t) + '</div></div><div class="right"><b class="' + cls(b.avg) + '">' + L.fmtR(b.avg) + '</b><div class="sub">' + b.n + ' 筆　勝率 ' + Math.round((b.win / b.n) * 100) + '%</div></div></div></div>'; }).join('');
  const last = X.slice(-8).reverse().map((x) => '<div class="row"><div class="row-main"><div><b>' + esc(x.sym) + '</b><span class="tag ' + (x.side === 'long' ? 'up' : 'down') + '">' + SIDE[x.side] + '</span><span class="sub">　' + Team.TYPES[x.type].name + (x.grade ? '・' + x.grade + ' 級' : '') + '</span><div class="sub">' + esc(fHM(x.barT + BAR5) + '　' + VETO[x.cat] + '：' + (x.why.length > 56 ? x.why.slice(0, 56) + '…' : x.why)) + '</div></div><div class="right"><b class="' + (x.r != null ? cls(x.r) : '') + '">' + (x.r != null ? L.fmtR(x.r) : '進行中') + '</b><div class="sub">影子結果</div></div></div></div>').join('');
  return '<section><h3>否決紀錄　影子單</h3><div class="big">' + today.length + '<small>今天沒做的訊號</small></div>' +
    '<div class="sub">還在跑 ' + pend + ' 筆　過去 7 天跑完 ' + vs.n + ' 筆' + (vs.avg != null ? '，被擋的單平均 <b class="' + cls(vs.avg) + '">' + L.fmtR(vs.avg) + '</b>' : '') + (tAvg != null ? '；團隊實際做的單平均 <b class="' + cls(tAvg) + '">' + L.fmtR(tAvg) + '</b>（' + C.length + ' 筆）' : '') + '</div>' +
    (rows ? '<h4 class="rh">每一關擋得對不對（過去 7 天）</h4><div class="list">' + rows + '</div>' : '') +
    (last ? '<h4 class="rh">最近沒做的訊號</h4><div class="list">' + last + '</div>' : '<div class="empty" style="margin-top:12px">還沒有。團隊每看到一個訊號但沒做，就會記在這裡。</div>') +
    '<p class="say">目前設定：反方理由 ' + conMax() + ' 個以上不做；預估要 ' + L.fmtR(TS.tune ? TS.tune.est : 0.1) + ' 以上才做。每小時依過去 7 天的影子單自動調整：反方審查擋下的單平均還賺 +0.10R（至少 20 筆）就放寬成 4 個；預估不夠好被擋的單平均還賺 +0.10R（至少 30 筆）門檻降到 +0.05R；團隊實際做的單平均賠 −0.05R 以上（至少 20 筆）就收緊到 +0.15R。</p>' +
    '<p class="say">團隊沒做的每個訊號，都照同一套出場計畫在背後跑完（停損、賺 1R 打平、移動停損、最多 4 小時），不動用資金。某一關擋下的單平均還賺 +0.10R 以上，表示那一關可能擋太多；至少 10 筆才下結論。</p>' +
    '<p class="say">團隊經驗：時光機 ' + nSamp.toLocaleString() + ' 份、實戰 ' + nLive + ' 筆（一筆算 3 份）、影子單 ' + nSh + ' 筆（一筆算 1 份，跟時光機重疊的時間不重複算）。</p></section>';
}
function practiceHTML() {
  const ps = practiceState();
  const now = Date.now();
  let st;
  if (!ps.on) st = '關閉中';
  else if (!TS.auto || state.settings.teamPct <= 0) st = '團隊自己找單是關的，不會做練習單';
  else if (ps.open) st = '團隊手上有單，不需要練習單';
  else if (now < ps.due) st = '團隊再 ' + fLeft(ps.due - now) + '沒進場，就挑一筆 B 級以上的訊號練習';
  else st = TS.practiceMiss || '等下一次掃描挑訊號';
  return '<div class="list" style="margin-top:12px"><div class="row"><button class="toggle" role="switch" aria-checked="' + ps.on + '" data-act="tpractice"><span>冷場練習單<span class="sub" style="display:block">團隊 2 小時沒進場，就用 0.25% 風險做一筆 B 級以上的訊號</span></span><i class="sw"></i></button></div></div><div class="sub" style="margin-top:8px">' + esc(st) + (ps.n ? '　已做 ' + ps.n + ' 筆' + (ps.avg != null ? '，平均 ' + L.fmtR(ps.avg) : '') : '') + '</div><p class="say">練習單照樣遵守防守規則、重大壞消息、數據公布前後暫停和風險上限；反方理由太多也會照做，但會記進筆記。不算進資金控制和判斷準確率，學習時一筆只算一份樣本。</p>';
}
function tuneGates(force) {
  if (CLK != null) return false;
  const t = TS.tune || (TS.tune = { con: 3, est: 0.1, at: 0 });
  const now = Date.now();
  if (!force && now - (t.at || 0) < 3600000) return false;
  t.at = now;
  const by = {};
  for (const r of vetoStats(7).rows) by[r.cat] = r;
  const C = closedTeam().filter((j) => j.src !== 'deleg' && !j.practice && !j.explore && j.t1 >= now - 7 * DAY);
  const tAvg = C.length ? C.reduce((a, j) => a + j.r, 0) / C.length : null;
  let con = t.con, est = t.est;
  const bc = by.con;
  if (bc && bc.n >= 20) { if (bc.avg > 0.1) con = 4; else if (bc.avg < -0.05) con = 3; }
  const be = by.est;
  if (C.length >= 20 && tAvg < -0.05) est = 0.15;
  else if (be && be.n >= 30 && be.avg > 0.1) est = 0.05;
  else if (be && be.n >= 30 && be.avg <= 0) est = 0.1;
  const msg = [];
  if (con !== t.con) msg.push('反方審查改成 ' + con + ' 個反對理由才不做（被擋的單 ' + bc.n + ' 筆平均 ' + L.fmtR(bc.avg) + '）');
  if (est !== t.est) msg.push('預估門檻改成 ' + L.fmtR(est) + (est > t.est ? '（團隊最近 ' + C.length + ' 筆平均 ' + L.fmtR(tAvg) + '，收緊）' : '（因預估不夠好被擋的單 ' + be.n + ' 筆平均 ' + L.fmtR(be.avg) + '，放寬）'));
  t.con = con;
  t.est = est;
  for (const m of msg) teamLog('自動調整：' + m, '團隊大腦');
  return msg.length > 0;
}
