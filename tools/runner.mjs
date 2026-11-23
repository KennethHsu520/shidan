import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(process.cwd());
const TOKEN = process.env.GAOQIAN_TOKEN || '';
const RUN_MIN = Math.max(1, Math.min(56, Number(process.env.RUN_MIN) || 50));
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const FILE = 'gaoqian-sync.json';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (!/^(github_pat_[A-Za-z0-9_]{20,250}|ghp_[A-Za-z0-9]{30,60})$/.test(TOKEN)) {
  log('沒有設定 GAOQIAN_TOKEN（或格式不對），這次不執行。請照說明到 Settings → Secrets 新增。');
  process.exit(0);
}

async function api(p) {
  const res = await fetch((process.env.GH_API || 'https://api.github.com') + p, { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (res.status === 401 || res.status === 403) throw new Error('權杖失效或沒有 Gists 權限');
  if (!res.ok) throw new Error('GitHub API ' + res.status);
  return res.json();
}

async function findGist() {
  for (let page = 1; page <= 5; page++) {
    const list = await api('/gists?per_page=100&page=' + page);
    if (!Array.isArray(list) || !list.length) break;
    const g = list.find((x) => x && x.files && x.files[FILE]);
    if (g) return g.id;
  }
  return null;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
function serve() {
  const srv = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
    if (p === '/') p = '/index.html';
    const full = path.resolve(ROOT, '.' + p);
    if (!full.startsWith(ROOT + path.sep) || full.includes(path.sep + '.git') || full.includes(path.sep + 'node_modules')) { res.writeHead(404); return res.end(); }
    fs.readFile(full, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

const STATUS = () => ({
  mode: S.mode, stale: S.stale, yield: !!TS.yield, ok: !!SY.runnerOk,
  eq: Math.round(E.equity(state, S.prices) * 100) / 100,
  team: state.positions.filter((p) => p.owner === 'team').map((p) => p.sym + ' ' + p.side + (p.lev > 1 ? ' ' + p.lev + 'x' : '')),
  journal: TS.journal.length, shadows: (TS.shadows || []).length, loaded: TS.loaded + '/' + TS.total,
  replay: TS.gapFrom != null, err: TS.err || null, sync: SY.err || null
});

async function main() {
  const gist = await findGist();
  if (!gist) { log('找不到雲端同步資料。請先在網站「成績 → 設定 → 雲端同步」連上 GitHub。'); return; }
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(({ tok, gid }) => {
    try { if (!localStorage.getItem('gaoqian.sync')) localStorage.setItem('gaoqian.sync', JSON.stringify({ token: tok, gist: gid, ready: true, t: 0 })); } catch (e) { return; }
  }, { tok: TOKEN, gid: gist });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('網頁錯誤：', String(e.message || e).slice(0, 300)));
  page.on('crash', () => { log('網頁當掉，重新載入'); page.reload().catch(() => {}); });
  const url = 'http://127.0.0.1:' + port + '/index.html?runner=1#team';
  await page.goto(url, { waitUntil: 'load' });
  const t0 = Date.now();
  let st = null;
  while (Date.now() - t0 < 4 * 60000) {
    await page.waitForTimeout(5000);
    try { st = await page.evaluate(STATUS); } catch (e) { st = null; continue; }
    if (st && st.mode === 'live' && st.ok) break;
  }
  if (!st || st.mode !== 'live' || !st.ok) {
    log('沒有接上真實行情或讀不到雲端資料，這次不交易也不上傳。狀態：', JSON.stringify(st));
    await browser.close(); srv.close(); return;
  }
  log('已接上真實行情，開始運作', RUN_MIN, '分鐘。', JSON.stringify(st));
  const end = t0 + RUN_MIN * 60000;
  let last = 0;
  while (Date.now() < end) {
    await page.waitForTimeout(15000);
    if (Date.now() - last >= 5 * 60000) {
      last = Date.now();
      try { log(JSON.stringify(await page.evaluate(STATUS))); } catch (e) { log('讀不到狀態，可能正在重新載入'); }
    }
  }
  try {
    const fin = await page.evaluate(async () => {
      if (TS.yield || !SY.runnerOk) return { pushed: false, why: TS.yield ? '手機正在使用' : '沒有讀到雲端資料' };
      save(); saveTeam(); syTrack();
      await new Promise((r) => setTimeout(r, 1500));
      await syPush(false);
      return { pushed: !SY.err, err: SY.err || null };
    });
    log('結束：', JSON.stringify(fin), JSON.stringify(await page.evaluate(STATUS)));
  } catch (e) { log('結束時上傳失敗：', String(e.message || e)); }
  await browser.close();
  srv.close();
}

main().catch((e) => { log('執行失敗：', String(e && e.message ? e.message : e)); process.exit(0); });
