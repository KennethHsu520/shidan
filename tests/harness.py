import threading, functools, http.server, socketserver, json, sys, os, math, time, re
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots') + os.sep
CHROME = os.environ.get('CHROME_PATH', '/usr/bin/google-chrome')
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
class Q(socketserver.TCPServer):
    allow_reuse_address = True
BASE = {'BTC': 68000, 'ETH': 1900, 'SOL': 72, 'XRP': 1.2, 'BNB': 600, 'DOGE': 0.09, 'SUI': 1.4, 'ADA': 0.3, 'TRX': 0.26, 'LINK': 8.3, 'AVAX': 20, 'DOT': 4}
IVM = {'1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080}
def h(n):
    n = (n * 2654435761) & 0xffffffff
    return ((n ^ (n >> 13)) * 1274126177 & 0xffffffff) / 0xffffffff
def price(sym, t):
    b = BASE[sym]; m = t / 60000.0; k = sum(ord(c) for c in sym) % 97
    return b * (1 + 0.04 * math.sin(m / 900 + k) + 0.012 * math.sin(m / 97 + k) + 0.004 * math.sin(m / 13 + k))
def klines(sym, iv, limit, end):
    mins = IVM[iv]; span = mins * 60000
    last = (end // span) * span
    out = []
    for i in range(limit - 1, -1, -1):
        t = last - i * span
        pts = [price(sym, t + j * span / 6) for j in range(7)]
        o, c = pts[0], pts[-1]
        out.append([t, str(o), str(max(pts) * 1.0005), str(min(pts) * 0.9995), str(c), str((1 + h(t // 60000)) * 2e5 * mins / c), t + span - 1, '0', 0, '0', '0', '0'])
    return out

FAKE_WS = r"""
(() => {
  const BASE = %s;
  const px = Object.assign({}, BASE);
  class FWS {
    constructor(url) {
      this.url = url; this.readyState = 0; this.subs = new Set();
      window.__ws = (window.__ws || []).concat([this]);
      setTimeout(() => {
        if (url.includes('fstream') || window.__wsDown) { if (this.onerror) this.onerror(); if (this.readyState !== 3) { this.readyState = 3; if (this.onclose) this.onclose(); } return; }
        this.readyState = 1;
        const m = url.match(/streams=([^&]+)/);
        if (m) m[1].split('/').forEach((s) => this.subs.add(s));
        if (this.onopen) this.onopen();
        this.tm = setInterval(() => this.tick(), 1000);
      }, 60);
    }
    send(x) { const o = JSON.parse(x); if (o.method === 'SUBSCRIBE') o.params.forEach((s) => this.subs.add(s)); if (o.method === 'UNSUBSCRIBE') o.params.forEach((s) => this.subs.delete(s)); }
    close() { if (this.readyState === 3) return; clearInterval(this.tm); this.readyState = 3; if (this.onclose) this.onclose(); }
    emit(stream, data) { if (this.onmessage) this.onmessage({ data: JSON.stringify({ stream, data }) }); }
    tick() {
      for (const s of Array.from(this.subs)) {
        const i = s.indexOf('@'); const pair = s.slice(0, i), kind = s.slice(i + 1);
        const sym = pair.replace(/usdt$/, '').toUpperCase();
        if (!px[sym]) continue;
        const p = px[sym];
        if (kind === 'miniTicker') { const mm = Date.now() / 60000, kk = Array.from(sym).reduce((a, c) => a + c.charCodeAt(0), 0) %% 97; px[sym] = BASE[sym] * (1 + 0.04 * Math.sin(mm / 900 + kk) + 0.012 * Math.sin(mm / 97 + kk) + 0.004 * Math.sin(mm / 13 + kk)); this.emit(s, { e: '24hrMiniTicker', s: sym + 'USDT', c: String(px[sym]), o: String(BASE[sym]), h: String(BASE[sym] * 1.05), l: String(BASE[sym] * 0.95), q: '500000000' }); }
        else if (kind.startsWith('depth')) { const st = p * 0.0001; const L = (d) => Array.from({ length: 20 }, (_, k) => [String(p + d * st * (k + 1)), String(Math.random() * 2 + 0.1)]); this.emit(s, { lastUpdateId: 1, bids: L(-1), asks: L(1) }); }
        else if (kind === 'aggTrade') { this.emit(s, { e: 'aggTrade', s: sym + 'USDT', p: String(p), q: String(sym === 'BTC' ? 40 : 0.5), m: Math.random() < 0.5, T: Date.now() }); }
      }
    }
  }
  FWS.OPEN = 1;
  window.WebSocket = FWS;
})();
""" % json.dumps(BASE)

GIST = {'files': {}, 'patches': []}
def gist_json():
    return {'id': 'g1', 'files': {k: {'content': v, 'truncated': False} for k, v in GIST['files'].items()}}

def handle(route):
    req = route.request; u = urlparse(req.url); q = parse_qs(u.query)
    if u.hostname == '127.0.0.1':
        return route.continue_()
    if u.hostname in ('data-api.binance.vision', 'api.binance.com'):
        if u.path == '/api/v3/klines':
            sym = q['symbol'][0][:-4]
            if sym not in BASE: return route.fulfill(status=400, body='{}')
            end = int(q.get('endTime', [int(time.time() * 1000)])[0])
            lim = int(q.get('limit', ['300'])[0])
            if 'startTime' in q:
                st = int(q['startTime'][0]); span = IVM[q['interval'][0]] * 60000
                end = min(int(time.time() * 1000), st + lim * span)
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(klines(sym, q['interval'][0], min(lim, 1000), min(end, int(time.time() * 1000)))))
        if u.path == '/api/v3/ticker/24hr':
            now = int(time.time() * 1000)
            rows = [{'symbol': s + 'USDT', 'quoteVolume': str(5e8 - i * 1e7), 'lastPrice': str(price(s, now)), 'openPrice': str(BASE[s])} for i, s in enumerate(BASE)]
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(rows))
        return route.fulfill(status=404, body='{}')
    if u.hostname == 'api.github.com':
        if req.method == 'GET' and u.path == '/gists/g1':
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(gist_json()), headers={'ETag': '"e%d"' % len(GIST['patches'])})
        if req.method == 'PATCH' and u.path == '/gists/g1':
            body = json.loads(req.post_data)
            for k, v in body['files'].items(): GIST['files'][k] = v['content']
            GIST['patches'].append((time.time(), list(body['files'].keys())))
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(gist_json()), headers={'ETag': '"e%d"' % len(GIST['patches'])})
        return route.fulfill(status=404, body='{}')
    return route.abort()

def start(W=390, HH=844, port=8771, init=None, url='/index.html', ctx_reuse=None, pw=None):
    srv = Q(('127.0.0.1', port), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    p = pw or sync_playwright().start()
    b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': W, 'height': HH}, device_scale_factor=2)
    ctx.route('**/*', handle)
    ctx.add_init_script(FAKE_WS)
    if init: ctx.add_init_script(init)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror ' + str(e) + ' ' + (e.stack or '')[:400]))
    pg.on('console', lambda m: errs.append('console ' + m.text) if m.type == 'error' and 'net::' not in m.text and 'Failed to load' not in m.text else None)
    pg.goto('http://127.0.0.1:%d%s' % (port, url))
    own = pw is None
    def stop():
        b.close(); srv.shutdown(); srv.server_close()
        if own: p.stop()
    return pg, errs, stop, ctx

def act(pg, a, d=''):
    pg.evaluate('([a,d]) => { const el = document.createElement("button"); el.dataset.act=a; if(d) el.dataset.id=d; onAct(a, d || undefined, el); }', [a, d])
