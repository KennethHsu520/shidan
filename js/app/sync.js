const SY = { key: 'gaoqian.sync', file: 'gaoqian-sync.json', busy: false, err: null, lastPush: 0, lastPull: 0, etag: null, pending: null };
const TOKRE = /^(github_pat_[A-Za-z0-9_]{20,250}|ghp_[A-Za-z0-9]{30,60})$/;
function syRead() { try { const c = JSON.parse(localStorage.getItem(SY.key)); return c && typeof c === 'object' ? c : {}; } catch (e) { return {}; } }
function syWrite(c) { try { localStorage.setItem(SY.key, JSON.stringify(c)); } catch (e) { SY.err = '這台裝置存不了同步設定'; } }
function syDev() { const c = syRead(); if (!c.dev) { c.dev = Math.random().toString(36).slice(2, 10); syWrite(c); } return c.dev; }
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + str.length.toString(36); }
function syLocal() {
  const a = localStorage.getItem(KEY) || '';
  const tm = localStorage.getItem('gaoqian.team') || '';
  let ha = a, ht = tm;
  try { const o = JSON.parse(a); delete o.lastSeen; delete o.lastPrices; delete o.coinCache; delete o.peak; delete o.maxDD; ha = JSON.stringify(o); } catch (e) { ha = a; }
  try { const o = JSON.parse(tm); if (o) { o.lastRun = Math.floor((o.lastRun || 0) / 600000); ht = JSON.stringify(o); } } catch (e) { ht = tm; }
  return { a, tm, h: fnv(ha + '|' + ht) };
}
async function gh(path, opt) {
  const c = syRead();
  if (!c.token) throw new Error('notoken');
  const o = Object.assign({ method: 'GET' }, opt || {});
  o.headers = Object.assign({ Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, o.headers || {});
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch('https://api.github.com' + path, Object.assign(o, { signal: ctl.signal, cache: 'no-store' }));
    if (res.status === 401 || res.status === 403) throw new Error('auth');
    return res;
  } finally { clearTimeout(tm); }
}
async function syFetchRemote(useEtag) {
  const c = syRead();
  if (!c.gist) return null;
  const res = await gh('/gists/' + c.gist, useEtag && SY.etag ? { headers: { 'If-None-Match': SY.etag } } : null);
  if (res.status === 304) return 'same';
  if (res.status === 404) return 'gone';
  if (!res.ok) throw new Error('http');
  SY.etag = res.headers.get('ETag');
  const g = await res.json();
  const f = g && g.files && g.files[SY.file];
  if (!f) return 'gone';
  let txt = f.content;
  if (f.truncated && typeof f.raw_url === 'string' && f.raw_url.startsWith('https://gist.githubusercontent.com/')) txt = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
  if (typeof txt !== 'string' || txt.length > 8000000) throw new Error('size');
  const d = JSON.parse(txt);
  if (!d || d.v !== 1 || typeof d.a !== 'string' || typeof d.tm !== 'string' || typeof d.t !== 'number' || typeof d.h !== 'string') throw new Error('bad');
  return d;
}
function syApply(d) {
  try { JSON.parse(d.a); if (d.tm) JSON.parse(d.tm); } catch (e) { SY.err = '雲端資料格式不對，沒有套用'; return false; }
  SY.applying = true;
  localStorage.setItem(KEY, d.a);
  if (d.tm) localStorage.setItem('gaoqian.team', d.tm); else localStorage.removeItem('gaoqian.team');
  const c = syRead(); c.h = d.h; c.t = d.t; c.pushedH = d.h; c.ready = true; syWrite(c);
  return true;
}
function syPayload() {
  const L0 = syLocal();
  const c = syRead();
  return { v: 1, t: c.t || Date.now(), h: L0.h, dev: syDev(), a: L0.a, tm: L0.tm };
}
async function syPush(force) {
  const c = syRead();
  if (!c.token || !c.gist || !c.ready || SY.busy) return;
  const d = syPayload();
  if (!force && c.pushedH === d.h) return;
  SY.busy = true;
  try {
    const r = await syFetchRemote(true);
    if (r && typeof r === 'object' && r.h !== d.h && r.h !== c.pushedH && r.t > (c.t || 0)) {
      SY.busy = false;
      if (syApply(r)) { try { sessionStorage.setItem('gaoqian.synced', '1'); } catch (e) { SY.err = null; } location.reload(); }
      return;
    }
    const res = await gh('/gists/' + c.gist, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: { [SY.file]: { content: JSON.stringify(d) } } }) });
    if (!res.ok) throw new Error('http');
    SY.etag = res.headers.get('ETag') || SY.etag;
    const c2 = syRead(); c2.pushedH = d.h; c2.lastOk = Date.now(); syWrite(c2);
    SY.lastPush = Date.now(); SY.err = null;
  } catch (e) { SY.err = e.message === 'auth' ? 'GitHub 權杖失效或權限不足，請重新連線' : '同步失敗，等一下會再試'; } finally { SY.busy = false; }
}
function syTrack() {
  const c = syRead();
  if (!c.token || !c.gist || !c.ready) return;
  const L0 = syLocal();
  if (L0.h !== c.h) { c.h = L0.h; c.t = Date.now(); syWrite(c); }
  if (c.pushedH !== c.h && Date.now() - SY.lastPush > 20000) syPush(false);
}
async function syPullApply(reason) {
  const c = syRead();
  if (!c.token || !c.gist || !c.ready) return false;
  try {
    const d = await syFetchRemote(true);
    SY.lastPull = Date.now(); SY.err = null;
    if (!d || d === 'same' || d === 'gone') return false;
    const L0 = syLocal();
    if (d.h === L0.h || d.t <= (c.t || 0)) return false;
    if (!syApply(d)) return false;
    if (reason === 'boot') { SY.applying = false; return true; }
    try { sessionStorage.setItem('gaoqian.synced', '1'); } catch (e) { SY.err = null; }
    location.reload();
    return true;
  } catch (e) { SY.err = e.message === 'auth' ? 'GitHub 權杖失效或權限不足，請重新連線' : '讀不到雲端資料，先用這台的資料'; return false; }
}
async function syBoot() {
  const c = syRead();
  if (!c.token || !c.gist || !c.ready) return;
  await Promise.race([syPullApply('boot'), new Promise((r) => setTimeout(r, 6000))]);
}
async function syConnect(tok) {
  const t = String(tok || '').trim();
  if (!TOKRE.test(t)) { SY.err = '格式不對：權杖應該是 github_pat_ 開頭的一長串文字'; return renderSync(); }
  const c = syRead(); c.token = t; delete c.gist; delete c.ready; syWrite(c);
  SY.err = null; SY.busy = true; renderSync('連線中…');
  try {
    let found = null;
    for (let page = 1; page <= 5 && !found; page++) {
      const res = await gh('/gists?per_page=100&page=' + page);
      if (!res.ok) throw new Error('http');
      const list = await res.json();
      if (!Array.isArray(list) || !list.length) break;
      found = list.find((g) => g && g.files && g.files[SY.file]);
    }
    SY.busy = false;
    if (found) {
      const c2 = syRead(); c2.gist = found.id; syWrite(c2);
      const d = await syFetchRemote(false);
      if (d && typeof d === 'object') { SY.pending = d; return renderSync(); }
    }
    SY.busy = true;
    const res = await gh('/gists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: '搞錢 模擬交易同步資料', public: false, files: { [SY.file]: { content: JSON.stringify(syPayload()) } } }) });
    if (!res.ok) throw new Error(res.status === 403 || res.status === 404 ? 'auth' : 'http');
    const g = await res.json();
    const c3 = syRead(); c3.gist = g.id; c3.ready = true; c3.pushedH = syLocal().h; c3.h = c3.pushedH; c3.t = Date.now(); c3.lastOk = Date.now(); syWrite(c3);
    SY.busy = false; SY.err = null;
    toast('已連上 GitHub，這台的資料已存到雲端');
    renderSync();
  } catch (e) {
    SY.busy = false;
    const c4 = syRead(); delete c4.token; delete c4.gist; syWrite(c4);
    SY.err = e.message === 'auth' ? '權杖沒有 Gists 的讀寫權限，或已經失效' : '連不上 GitHub，請稍後再試';
    renderSync();
  }
}
function syEq(aStr) {
  try { const st = E.sanitize(JSON.parse(aStr), Date.now()); return fU(E.equity(st, Object.assign({}, st.lastPrices, S.prices))); } catch (e) { return '—'; }
}
function syncStatus() {
  const c = syRead();
  if (!c.token || !c.gist || !c.ready) return '未連線';
  if (SY.err) return SY.err;
  return '已連線' + (c.lastOk ? '・最後上傳 ' + fHM(c.lastOk) : '');
}
function renderSync(msg) {
  const c = syRead();
  const on = c.token && c.gist && c.ready;
  let body = '<h2>雲端同步</h2><div class="sub">用你的 GitHub 帳號，讓手機和電腦是同一個帳戶。資料存在你 GitHub 裡一個不公開的 Gist。</div>';
  if (SY.pending) {
    const d = SY.pending;
    body += '<p class="say" style="margin-top:16px">雲端已經有資料。要用哪一份？</p><div class="calc"><div><span>雲端（' + esc(fT(d.t)) + ' 更新）</span><b>總資產 ' + syEq(d.a) + '</b></div><div><span>這台裝置</span><b>總資產 ' + fU(E.equity(state, S.prices)) + '</b></div></div>' +
      '<div class="cta"><button class="btn" data-act="syncLocal">用這台覆蓋雲端</button><button class="btn solid" data-act="syncRemote">用雲端的資料</button></div>';
  } else if (on) {
    body += '<div class="list" style="margin-top:16px"><div class="row"><div class="row-main"><span>狀態</span><span class="sub">' + esc(msg || syncStatus()) + '</span></div></div></div>' +
      '<p class="say">有變動時約 20 秒內自動上傳。另一台裝置打開網頁時，會自動換成最新的資料。兩台不要同時開著操作，以最後上傳的那台為準。</p>' +
      '<div class="cta"><button class="btn quiet" data-act="x">關閉</button><button class="btn solid" data-act="syncNow">立即同步</button></div><div class="cta"><button class="btn quiet" data-act="syncOff">這台中斷同步</button></div>';
  } else {
    body += '<div class="field" style="margin-top:16px"><label><span>GitHub 權杖</span><span>只存在這台裝置</span></label><input class="inp" id="syncTok" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" placeholder="github_pat_ 開頭的那串文字" maxlength="260"></div>' +
      (SY.err ? '<p class="say down">' + esc(SY.err) + '</p>' : '') + (msg ? '<p class="say">' + esc(msg) + '</p>' : '') +
      '<p class="say">權杖只需要「Gists：Read and write」權限。它只會存在這台裝置，不會傳給任何人。</p>' +
      '<div class="cta"><button class="btn quiet" data-act="x">取消</button><button class="btn solid" data-act="syncGo"' + (SY.busy ? ' disabled' : '') + '>連線</button></div>';
  }
  if (S.sheetKind === 'sync') patch($('#sheetBody'), body); else openSheet('sync', body);
}
function save() {
  if (SY.applying) return;
  state.lastSeen = Date.now();
  for (const k of Object.keys(S.prices)) if (S.prices[k] > 0) state.lastPrices[k] = S.prices[k];
  const keep = {};
  for (const k of watchList()) if (state.lastPrices[k]) keep[k] = state.lastPrices[k];
  state.lastPrices = keep;
  try { localStorage.setItem(KEY, JSON.stringify(Object.assign({}, state, { everLive: S.everLive }))); } catch (e) { return; }
}
