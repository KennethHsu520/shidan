const E = Engine;
const KEY = 'shidan.v1';
const RUNNER = /[?&]runner=1(&|$)/.test(location.search);
const TWD = 32;
const IVS = { '1m': ['1分', 1], '5m': ['5分', 5], '15m': ['15分', 15], '1h': ['1時', 60], '4h': ['4時', 240], '1d': ['1日', 1440] };
const WHY = { manual: '手動平倉', sl: '停損出場', tp: '停利出場', liq: '強制平倉', demote: '降級平倉', time: '時間到出場', flip: '反向訊號出場', thesis: '論點失效出場' };
const STABLE = new Set(['USDC', 'FDUSD', 'TUSD', 'USDP', 'DAI', 'BUSD', 'EUR', 'EURI', 'AEUR', 'USD1', 'RLUSD', 'PYUSD', 'USDE', 'XUSD', 'BFUSD', 'USDS', 'PAXG', 'XAUT', 'WBTC', 'WBETH', 'BNSOL', 'GBP', 'TRY', 'BRL']);
const SEEDS = { BTC: 68800, ETH: 1935, SOL: 72.4, XRP: 1.21, BNB: 618, DOGE: 0.0963, SUI: 1.42, ADA: 0.318, TRX: 0.262, LINK: 8.31 };

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rich = (s) => esc(s).replace(/\[\[(.+?)\]\]/g, (m, t) => (GLOSSARY[t] ? '<span class="term" role="button" tabindex="0" data-act="term" data-t="' + t + '">' + t + '</span>' : t));
const dec = (p) => (p >= 1000 ? 2 : p >= 10 ? 3 : p >= 1 ? 4 : p >= 0.01 ? 5 : p >= 0.0001 ? 7 : 9);
const fP = (p) => (p > 0 && isFinite(p) ? p.toLocaleString('en-US', { minimumFractionDigits: dec(p), maximumFractionDigits: dec(p) }) : '—');
const fU = (x) => (isFinite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const sgn = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) || x >= 0 ? '+' : '−');
const fS = (x) => (isFinite(x) ? sgn(x, 2) + fU(Math.abs(x)) : '—');
const fPct = (x, d) => { const n = d == null ? 2 : d; return isFinite(x) ? sgn(x * 100, n) + (Math.abs(x) * 100).toFixed(n) + '%' : '—'; };
const fR = (r) => (r == null || !isFinite(r) ? '' : sgn(r, 1) + Math.abs(r).toFixed(1) + 'R');
const fQ = (q) => (q >= 1e6 ? (q / 1e6).toFixed(2) + 'M' : q >= 1000 ? q.toFixed(0) : q >= 100 ? q.toFixed(1) : q >= 1 ? q.toFixed(3) : q >= 0.01 ? q.toFixed(4) : q.toFixed(6));
const fT = (t) => { const d = new Date(t); const z = (n) => String(n).padStart(2, '0'); return d.getMonth() + 1 + '/' + d.getDate() + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); };
const fHM = (t) => { const d = new Date(t); const z = (n) => String(n).padStart(2, '0'); return z(d.getHours()) + ':' + z(d.getMinutes()); };
const fVol = (v) => (v >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : fU(v));
const cls = (x) => (x > 0.000001 ? 'up' : x < -0.000001 ? 'down' : '');
const roundP = (p) => { const d = dec(p); const m = Math.pow(10, d); return Math.round(p * m) / m; };

function morph(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.replaceWith(b.cloneNode(true)); return; }
  if (a.nodeType === 3) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  if (a.nodeType !== 1) return;
  for (const at of Array.from(b.attributes)) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
  for (const at of Array.from(a.attributes)) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
  const ac = a.childNodes, bc = b.childNodes;
  if (ac.length !== bc.length) { a.innerHTML = b.innerHTML; return; }
  for (let i = 0; i < bc.length; i++) morph(ac[i], bc[i]);
}
function patch(el, html) {
  if (!el) return;
  const tmp = document.createElement(el.tagName);
  tmp.innerHTML = html;
  if (el.childNodes.length !== tmp.childNodes.length) { el.innerHTML = html; return; }
  for (let i = 0; i < tmp.childNodes.length; i++) morph(el.childNodes[i], tmp.childNodes[i]);
}

let state;
let bootSeen;
const S = { prices: {}, chg: {}, vol: {}, coins: E.ALL.slice(), mode: 'connecting', stale: false, candles: [], chartErr: false, view: 'trade', lesson: null, catching: false, sheetKind: null, queue: [], vis: 60, off: 0, cross: null, drag: null, barMode: 'trade' };

function load() {
  let r = null;
  try { r = JSON.parse(localStorage.getItem(KEY)); } catch (e) { r = null; }
  state = E.sanitize(r, Date.now());
  bootSeen = state.lastSeen;
  S.everLive = !!(r && r.everLive);
  if (state.coinCache) S.coins = state.coinCache.list.slice();
}
