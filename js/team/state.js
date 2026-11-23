const TKEY = 'gaoqian.team';
const SIDE = { long: '買漲', short: '買跌' };
const DELEG_MS = 4 * 3600000;
const TS = { weeks: [], audit: null, hist: {}, rt: {}, loaded: 0, total: 0, loading: false, results: null, signals: [], lastScan: 0, nextScan: 0, regime: null, err: null, auto: true, log: [], delegs: [], journal: [], samples: [], kb: null, rules: [], started: false, loadedAt: 0, scanning: false, cGrade: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function loadTeam() {
  let r = null;
  try { r = JSON.parse(localStorage.getItem(TKEY)); } catch (e) { r = null; }
  TS.auto = r ? r.auto !== false : true;
  TS.practice = r ? r.practice !== false : true;
  const tu = r && r.tune;
  TS.tune = tu && [3, 4].includes(tu.con) && [0.05, 0.1, 0.15].includes(tu.est) ? { con: tu.con, est: tu.est, at: typeof tu.at === 'number' ? tu.at : 0 } : { con: 3, est: 0.1, at: 0 };
  TS.halt = !!(r && r.halt);
  TS.resumeAt = r && typeof r.resumeAt === 'number' && r.resumeAt > 0 ? r.resumeAt : 0;
  TS.lastRun = r && typeof r.lastRun === 'number' && r.lastRun > 0 && r.lastRun <= Date.now() ? r.lastRun : 0;
  if (TS.lastRun && Date.now() - TS.lastRun > GAP_MIN) { TS.gapFrom = TS.lastRun; TS.gapFromOrig = TS.lastRun; }
  TS.log = Array.isArray(r && r.log) ? r.log.filter((x) => x && typeof x.t === 'number' && typeof x.text === 'string').map((x) => ({ t: x.t, text: x.text.slice(0, 160) })).slice(-30) : [];
  const okJ = (j) => j && typeof j.id === 'number' && typeof j.type === 'string' && Team.TYPES[j.type] && (j.side === 'long' || j.side === 'short') && E.SYM.test(j.sym) && (j.r == null || isFinite(j.r)) && (!j.f || typeof j.f === 'object');
  TS.journal = Array.isArray(r && r.journal) ? r.journal.filter(okJ).map((j) => ({ id: j.id, t0: +j.t0 || 0, t1: +j.t1 || null, sym: j.sym, type: j.type, side: j.side, f: j.f ? Object.fromEntries(Object.keys(L.FEATS).filter((k) => typeof j.f[k] === 'string' && L.FEATS[k][j.f[k]]).map((k) => [k, j.f[k]])) : null, est: j.est != null && isFinite(j.est) ? +j.est : null, grade: ['A', 'B', 'C'].includes(j.grade) ? j.grade : null, risk: j.risk != null && isFinite(j.risk) ? +j.risk : null, riskReal: j.riskReal != null && isFinite(j.riskReal) ? +j.riskReal : null, src: j.src === 'deleg' ? 'deleg' : 'auto', why: String(j.why || '').slice(0, 300), review: j.review ? String(j.review).slice(0, 400) : null, r: j.r == null ? null : +j.r, pnl: j.pnl != null && isFinite(j.pnl) ? +j.pnl : null, exit: typeof j.exit === 'string' ? j.exit.slice(0, 10) : null, ok: !!j.ok, cancel: !!j.cancel, explore: !!j.explore, practice: !!j.practice, ask: !!j.ask, th: Array.isArray(j.th) ? j.th.filter((k) => TH_KEYS.includes(k)) : null, thx: typeof j.thx === 'string' ? j.thx.slice(0, 200) : null, con: Array.isArray(j.con) ? j.con.filter((x) => typeof x === 'string').map((x) => x.slice(0, 120)).slice(0, 5) : null })).slice(-300) : [];
  TS.weeks = Array.isArray(r && r.weeks) ? r.weeks.filter((w) => w && typeof w.w === 'number' && Number.isInteger(w.n) && isFinite(w.R) && isFinite(w.pnl)).map((w) => ({ w: w.w, n: w.n, win: Number.isInteger(w.win) ? w.win : 0, R: +w.R, pnl: +w.pnl, audit: w.audit !== false })).slice(0, 12) : [];
  const au = r && r.audit;
  TS.audit = au && typeof au.k === 'string' && isFinite(au.base) && Number.isInteger(au.id) && Array.isArray(au.open) && typeof au.t === 'number' ? { k: au.k.slice(0, 40), base: +au.base, id: au.id, open: au.open.filter((x) => Number.isInteger(x)).slice(0, 200), t: au.t } : null;
  const ch = r && r.coach;
  TS.coach = ch && Array.isArray(ch.rules) ? { rules: ch.rules.filter((x) => x && COACH[x.k] && typeof x.t === 'number').slice(0, 3).map((x) => ({ k: x.k, t: x.t })) } : { rules: [] };
  loadShadow();
  TS.delegs = Array.isArray(r && r.delegs) ? r.delegs.filter((d) => d && E.SYM.test(d.sym) && (d.side === 'long' || d.side === 'short' || d.side === 'any') && typeof d.until === 'number' && typeof d.id === 'string').slice(0, 20) : [];
}
function saveTeam() {
  if (SY.applying) return;
  try { localStorage.setItem(TKEY, JSON.stringify({ v: 4, auto: TS.auto, practice: TS.practice !== false, tune: TS.tune, log: TS.log, delegs: TS.delegs, journal: TS.journal.map((j) => { const o = Object.assign({}, j); delete o.thb; return o; }), lastRun: TS.lastRun || 0, halt: !!TS.halt, resumeAt: TS.resumeAt || 0, weeks: TS.weeks, audit: TS.audit, coach: TS.coach })); } catch (e) { return; }
  saveShadow();
}
