function markChart() { S.chartDirty = true; }
const G = { pts: new Map(), lines: [], geom: null };
function drawChart() {
  const cvs = $('#chart');
  if (!cvs) return;
  const msg = $('#chartMsg');
  const wrap = cvs.parentElement;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (cvs.width !== Math.round(W * dpr) || cvs.height !== Math.round(H * dpr)) { cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr); }
  const g = cvs.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  G.lines = [];
  const all = S.candles;
  if (all.length < 2) { G.geom = null; msg.hidden = false; msg.textContent = S.chartErr ? '圖表資料載入失敗，價格仍會更新' : '圖表載入中'; return; }
  msg.hidden = true;
  const cs = getComputedStyle(document.documentElement);
  const col = (n) => cs.getPropertyValue(n).trim();
  const up = col('--up'), down = col('--down'), line = col('--line'), muted = col('--muted'), ink = col('--ink'), accent = col('--accent'), bg = col('--bg');
  const font = cs.getPropertyValue('--font');
  const maxVis = Math.max(20, Math.min(240, all.length));
  if (S.vis > maxVis) S.vis = maxVis;
  S.off = Math.max(0, Math.min(S.off, all.length - Math.min(S.vis, all.length)));
  const end = all.length - S.off;
  const start = Math.max(0, end - S.vis);
  const k = all.slice(start, end);
  const N = k.length;
  const lastP = all[all.length - 1].c;
  const padR = 66, padT = 26, volH = 34, padB = 20;
  const pw = W - padR, ph = H - padT - volH - padB - 8;
  let lo = Infinity, hi = -Infinity, vmax = 0;
  for (const c of k) { if (c.l < lo) lo = c.l; if (c.h > hi) hi = c.h; if (c.v > vmax) vmax = c.v; }
  let ma = null;
  if (state.settings.ma && state.rank >= 3 && all.length >= 20) {
    ma = [];
    for (let i = start; i < end; i++) {
      if (i < 19) { ma.push(null); continue; }
      let s = 0;
      for (let j = i - 19; j <= i; j++) s += all[j].c;
      ma.push(s / 20);
      lo = Math.min(lo, s / 20); hi = Math.max(hi, s / 20);
    }
  }
  const pad = (hi - lo) * 0.1 || hi * 0.001;
  lo -= pad; hi += pad;
  const y = (p) => padT + ((hi - p) / (hi - lo)) * ph;
  const yToP = (yy) => hi - ((yy - padT) / ph) * (hi - lo);
  const step = pw / (S.vis + 4);
  const x0 = (S.vis - N) * step;
  const bw = Math.max(1, Math.min(14, step * 0.64));
  const span = IVS[state.settings.interval][1] * 60000;
  const xOfT = (t) => { for (let i = N - 1; i >= 0; i--) if (t >= k[i].t) return t < k[i].t + span || i === N - 1 ? x0 + i * step + step / 2 : null; return null; };
  G.geom = { y, yToP, padT, ph, pw, W, H, step, x0, N };
  g.font = '10px ' + font;
  g.textBaseline = 'middle';
  g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const p = lo + ((hi - lo) * i) / 4;
    const yy = Math.round(y(p)) + 0.5;
    g.strokeStyle = line;
    g.beginPath(); g.moveTo(0, yy); g.lineTo(pw, yy); g.stroke();
    if (Math.abs(yy - y(lastP)) > 12) { g.fillStyle = muted; g.fillText(fP(p), pw + 6, yy); }
  }
  g.fillStyle = muted;
  g.textAlign = 'center';
  for (let i = N - 1; i >= 0; i -= Math.max(1, Math.round(70 / step))) g.fillText(fHM(k[i].t), x0 + i * step + step / 2, H - padB / 2);
  g.textAlign = 'left';
  k.forEach((c, i) => {
    const cx = x0 + i * step + step / 2;
    const rise = c.c >= c.o;
    g.strokeStyle = g.fillStyle = rise ? up : down;
    g.beginPath(); g.moveTo(Math.round(cx) + 0.5, y(c.h)); g.lineTo(Math.round(cx) + 0.5, y(c.l)); g.stroke();
    const yo = y(c.o), yc = y(c.c);
    g.fillRect(cx - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
    if (vmax > 0) { const vh = (c.v / vmax) * volH; g.globalAlpha = 0.3; g.fillRect(cx - bw / 2, H - padB - vh, bw, vh); g.globalAlpha = 1; }
  });
  if (ma) {
    g.strokeStyle = accent; g.lineWidth = 1.25; g.beginPath();
    let st = false;
    ma.forEach((v, i) => { if (v == null) return; const cx = x0 + i * step + step / 2; if (!st) { g.moveTo(cx, y(v)); st = true; } else g.lineTo(cx, y(v)); });
    g.stroke(); g.lineWidth = 1;
  }
  const sym = state.settings.sym;
  const tri = (cx, cy, upDir, color) => { g.fillStyle = color; g.beginPath(); if (upDir) { g.moveTo(cx, cy); g.lineTo(cx - 5, cy + 8); g.lineTo(cx + 5, cy + 8); } else { g.moveTo(cx, cy); g.lineTo(cx - 5, cy - 8); g.lineTo(cx + 5, cy - 8); } g.closePath(); g.fill(); };
  for (const t of state.trades.slice(-30)) {
    if (t.sym !== sym) continue;
    const xe = xOfT(t.t0), xx = xOfT(t.t1);
    if (xe != null && t.entry > lo && t.entry < hi) { g.globalAlpha = 0.45; tri(xe, t.side === 'long' ? y(t.entry) + 3 : y(t.entry) - 3, t.side === 'long', t.side === 'long' ? up : down); g.globalAlpha = 1; }
    if (xx != null && t.exit > lo && t.exit < hi) { g.strokeStyle = t.pnl >= 0 ? up : down; g.lineWidth = 1.5; g.beginPath(); g.arc(xx, y(t.exit), 3.5, 0, 7); g.stroke(); g.lineWidth = 1; }
  }
  const tagBox = (yy, text, color, fill) => {
    g.font = '600 10px ' + font;
    const w = Math.max(padR - 4, g.measureText(text).width + 10);
    g.fillStyle = fill ? color : bg;
    g.fillRect(pw + 2, yy - 9, w, 18);
    if (!fill) { g.strokeStyle = color; g.strokeRect(pw + 2.5, yy - 8.5, w - 1, 17); }
    g.fillStyle = fill ? '#fff' : color;
    g.fillText(text, pw + 7, yy);
    g.font = '10px ' + font;
  };
  const hline = (p, color, dash, label, kind, id) => {
    const inside = p > lo && p < hi;
    const yy = inside ? Math.round(y(p)) + 0.5 : p >= hi ? padT + 6.5 : padT + ph - 5.5;
    g.strokeStyle = color;
    g.setLineDash(dash);
    g.globalAlpha = inside ? 1 : 0.5;
    g.beginPath(); g.moveTo(0, yy); g.lineTo(pw, yy); g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    if (label) {
      g.font = '600 10px ' + font;
      const tw = g.measureText(label).width;
      g.fillStyle = bg; g.fillRect(6, yy - 16, tw + 8, 13);
      g.fillStyle = color; g.fillText(label, 10, yy - 9.5);
      g.font = '10px ' + font;
    }
    if (!(kind === 'entry' && Math.abs(yy - y(lastP)) < 19)) tagBox(yy, fP(p), color, kind === 'entry');
    if (kind && kind !== 'entry') {
      const hx = pw - 18;
      g.fillStyle = bg; g.strokeStyle = color; g.lineWidth = 1.25;
      g.beginPath(); g.roundRect ? g.roundRect(hx - 13, yy - 9, 26, 18, 9) : g.rect(hx - 13, yy - 9, 26, 18); g.fill(); g.stroke();
      g.beginPath(); for (const dy of [-3, 0, 3]) { g.moveTo(hx - 5, yy + dy); g.lineTo(hx + 5, yy + dy); } g.stroke();
      g.lineWidth = 1;
      G.lines.push({ kind, id, y: yy, price: p });
    }
  };
  for (const o of state.orders) {
    if (o.sym !== sym) continue;
    const p = S.drag && S.drag.kind === 'ord' && S.drag.id === o.id ? S.drag.price : o.limit;
    hline(p, accent, [4, 3], '掛單' + (o.side === 'long' ? '買漲 ' : '買跌 ') + fU(o.amount) + '　按住可拖', 'ord', o.id);
  }
  for (const p of curPos()) {
    const eq = E.equity(state, S.prices);
    const xe = xOfT(p.t0);
    if (xe != null && p.entry > lo && p.entry < hi) tri(xe, p.side === 'long' ? y(p.entry) + 3 : y(p.entry) - 3, p.side === 'long', p.side === 'long' ? up : down);
    const isT = p.owner === 'team';
    hline(p.entry, ink, [2, 3], (isT ? '團隊進場 ' : '進場 ') + (p.side === 'long' ? '買漲' : '買跌'), 'entry', p.id);
    if (isT) {
      if (p.sl != null) hline(p.sl, down, [6, 4], '團隊停損' + (p.be ? '（已移到打平）' : ''), null, p.id);
      if (p.tp != null) hline(p.tp, up, [6, 4], '團隊停利', null, p.id);
    } else if (state.rank >= 2) {
      const sl = S.drag && S.drag.kind === 'sl' && S.drag.id === p.id ? S.drag.price : p.sl;
      const tp = S.drag && S.drag.kind === 'tp' && S.drag.id === p.id ? S.drag.price : p.tp;
      if (sl != null) { const loss = Math.abs(p.entry - sl) * p.qty; hline(sl, down, [6, 4], '停損 −' + fU(loss) + '（總資產 ' + (loss / eq * 100).toFixed(2) + '%）', 'sl', p.id); }
      if (tp != null) { const gain = Math.abs(tp - p.entry) * p.qty; const rr = sl != null && sl !== p.entry ? '　盈虧比 ' + (Math.abs(tp - p.entry) / Math.abs(p.entry - sl)).toFixed(1) : ''; hline(tp, up, [6, 4], '停利 +' + fU(gain) + rr, 'tp', p.id); }
    }
  }
  if (state.settings.fib && N >= 10) {
    let fh = -Infinity, fl = Infinity, hI = 0, lI = 0;
    k.forEach((c, i) => { if (c.h > fh) { fh = c.h; hI = i; } if (c.l < fl) { fl = c.l; lI = i; } });
    const upTrend = lI < hI;
    for (const lv of Team.fibLevels(fh, fl, upTrend)) {
      const yy = Math.round(y(lv.p)) + 0.5;
      const key = lv.r === 0.618;
      g.strokeStyle = accent; g.globalAlpha = key ? 0.9 : 0.35; g.setLineDash(key ? [] : [2, 4]); g.lineWidth = key ? 1.25 : 1;
      g.beginPath(); g.moveTo(0, yy); g.lineTo(pw, yy); g.stroke();
      g.setLineDash([]); g.lineWidth = 1; g.globalAlpha = 1;
      g.font = (key ? '600 ' : '') + '10px ' + font; g.fillStyle = accent;
      g.fillText(String(lv.r) + (key ? '　黃金比例 ' + fP(lv.p) : ''), pw - (key ? 150 : 34), yy - 7);
    }
    g.font = '10px ' + font;
    const ax = x0 + Math.min(hI, lI) * step + step / 2, bx = x0 + Math.max(hI, lI) * step + step / 2;
    g.strokeStyle = accent; g.globalAlpha = 0.5; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(ax, y(upTrend ? fl : fh)); g.lineTo(bx, y(upTrend ? fh : fl)); g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
  }
  const yl = Math.round(y(lastP)) + 0.5;
  if (lastP > lo && lastP < hi) {
    g.strokeStyle = ink; g.setLineDash([1, 3]); g.beginPath(); g.moveTo(0, yl); g.lineTo(pw, yl); g.stroke(); g.setLineDash([]);
    tagBox(yl, fP(lastP), ink, true);
  }
  const CR = S.cross || S.hover;
  if (CR) {
    const cx = Math.max(0, Math.min(pw, CR.x));
    const cy = Math.max(padT, Math.min(padT + ph, CR.y));
    let idx = Math.floor((cx - x0) / step);
    idx = Math.max(0, Math.min(N - 1, idx));
    const kc = k[idx];
    const sx = x0 + idx * step + step / 2;
    const price = roundP(yToP(cy));
    CR.price = price;
    g.strokeStyle = muted; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(sx + 0.5, padT); g.lineTo(sx + 0.5, H - padB); g.stroke();
    g.beginPath(); g.moveTo(0, Math.round(cy) + 0.5); g.lineTo(pw, Math.round(cy) + 0.5); g.stroke();
    g.setLineDash([]);
    tagBox(Math.round(cy) + 0.5, fP(price), accent, true);
    g.font = '600 10px ' + font;
    const tl = fT(kc.t);
    const tw = g.measureText(tl).width + 10;
    g.fillStyle = accent; g.fillRect(Math.min(pw - tw, Math.max(0, sx - tw / 2)), H - padB + 1, tw, padB - 2);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(tl, Math.min(pw - tw / 2, Math.max(tw / 2, sx)), H - padB / 2); g.textAlign = 'left';
    const rise = kc.c >= kc.o;
    let xx = 2;
    g.font = '10px ' + font;
    for (const [lab, v] of [['開', kc.o], ['高', kc.h], ['低', kc.l], ['收', kc.c]]) {
      g.fillStyle = muted; g.fillText(lab, xx, 11); xx += g.measureText(lab).width + 3;
      g.fillStyle = rise ? up : down; const t = fP(v); g.fillText(t, xx, 11); xx += g.measureText(t).width + 8;
    }
    g.fillStyle = rise ? up : down; g.fillText(fPct(kc.c / kc.o - 1), xx, 11);
  } else if (!state.settings.gestured) {
    g.fillStyle = muted; g.font = '11px ' + font;
    g.fillText(WIDE.matches ? '滾輪縮放　拖曳看紀錄　點圖鎖定價格　拖線改停損停利　快捷鍵 B 買漲、S 買跌' : '點圖看價格　左右滑看紀錄　兩指縮放　按住線可拖', 2, 11);
  }
}

function bindChart() {
  const c = $('#chart');
  if (!c || c.dataset.bound) return;
  c.dataset.bound = '1';
  const T = { mode: null, sx: 0, sy: 0, off0: 0, moved: false, timer: 0, d0: 1, vis0: 60, wasCross: false };
  const rel = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const dist = () => { const a = Array.from(G.pts.values()); return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1; };
  const gestured = () => { if (!state.settings.gestured) { state.settings.gestured = true; save(); } };
  c.addEventListener('pointerdown', (e) => {
    S.hover = null;
    const p = rel(e);
    G.pts.set(e.pointerId, p);
    try { c.setPointerCapture(e.pointerId); } catch (err) { T.cap = false; }
    clearTimeout(T.timer);
    if (G.pts.size === 2) { T.mode = 'pinch'; T.d0 = dist(); T.vis0 = S.vis; S.drag = null; return; }
    if (G.pts.size > 2) return;
    T.sx = p.x; T.sy = p.y; T.moved = false; T.off0 = S.off; T.wasCross = !!S.cross;
    const hit = G.geom && !S.cross ? G.lines.slice().sort((a, b) => Math.abs(a.y - p.y) - Math.abs(b.y - p.y)).find((l) => Math.abs(l.y - p.y) <= 24) : null;
    if (hit) { T.mode = 'drag'; S.drag = { kind: hit.kind, id: hit.id, price: hit.price }; markChart(); return; }
    if (S.cross) { T.mode = 'cross'; return; }
    T.mode = 'pan';
    T.timer = setTimeout(() => { if (!T.moved && T.mode === 'pan') { T.mode = 'cross'; S.cross = { x: T.sx, y: T.sy }; gestured(); drawChart(); renderBar(); } }, 380);
  });
  let hovRaf = 0;
  c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && S.hover) { S.hover = null; c.style.cursor = ''; drawChart(); } });
  c.addEventListener('pointermove', (e) => {
    if (!G.pts.has(e.pointerId)) {
      if (e.pointerType !== 'mouse' || S.cross || !G.geom) return;
      const hp = rel(e);
      S.hover = { x: hp.x, y: hp.y };
      const near = G.lines.some((l) => Math.abs(l.y - hp.y) <= 10);
      c.style.cursor = near ? 'ns-resize' : 'crosshair';
      if (!hovRaf) hovRaf = requestAnimationFrame(() => { hovRaf = 0; drawChart(); });
      return;
    }
    const p = rel(e);
    G.pts.set(e.pointerId, p);
    const n = S.candles.length;
    if (!G.geom || n < 2) return;
    if (Math.abs(p.x - T.sx) > 7 || Math.abs(p.y - T.sy) > 7) T.moved = true;
    if (T.mode === 'pinch' && G.pts.size >= 2) { S.vis = Math.max(20, Math.min(Math.max(20, Math.min(240, n)), Math.round((T.vis0 * T.d0) / dist()))); gestured(); markChart(); }
    else if (T.mode === 'drag') { S.drag.price = roundP(G.geom.yToP(Math.max(G.geom.padT, Math.min(G.geom.padT + G.geom.ph, p.y)))); markChart(); }
    else if (T.mode === 'cross') { if (T.moved || !T.wasCross) { S.cross = { x: p.x, y: p.y }; drawChart(); const el = $('#crossPx'); if (el) el.textContent = fP(S.cross.price); } }
    else if (T.mode === 'pan' && T.moved) { clearTimeout(T.timer); S.off = Math.max(0, Math.min(Math.max(0, n - S.vis), T.off0 + Math.round((p.x - T.sx) / G.geom.step))); gestured(); markChart(); }
  });
  const up = (e) => {
    if (!G.pts.has(e.pointerId)) return;
    G.pts.delete(e.pointerId);
    clearTimeout(T.timer);
    if (T.mode === 'pinch') { if (G.pts.size === 0) T.mode = null; return; }
    if (T.mode === 'drag') { commitDrag(); T.mode = null; return; }
    if (T.mode === 'cross') { if (T.wasCross && !T.moved) hideCross(); else renderBar(); }
    else if (T.mode === 'pan' && !T.moved) { S.cross = { x: T.sx, y: T.sy }; gestured(); drawChart(); renderBar(); }
    T.mode = null;
  };
  c.addEventListener('pointerup', up);
  c.addEventListener('pointercancel', up);
  c.addEventListener('dblclick', () => { S.vis = 60; S.off = 0; hideCross(); markChart(); });
  c.addEventListener('wheel', (e) => { e.preventDefault(); S.vis = Math.max(20, Math.min(240, Math.round(S.vis * (e.deltaY > 0 ? 1.1 : 0.9)))); markChart(); }, { passive: false });
  c.addEventListener('contextmenu', (e) => e.preventDefault());
}
function hideCross() { S.cross = null; renderBar(); markChart(); }
function commitDrag() {
  const d = S.drag;
  S.drag = null;
  if (!d) return;
  const cur = S.prices[state.settings.sym];
  let r;
  if (d.kind === 'ord') r = E.modifyOrder(state, d.id, d.price, cur);
  else {
    const p = state.positions.find((x) => x.id === d.id);
    if (!p) return markChart();
    r = E.setStops(state, p.id, d.kind === 'sl' ? d.price : p.sl, d.kind === 'tp' ? d.price : p.tp, cur);
  }
  if (!r.ok) toast(r.err);
  else { save(); toast(d.kind === 'ord' ? '掛單改到 ' + fP(d.price) : (d.kind === 'sl' ? '停損' : '停利') + '改到 ' + fP(d.price)); }
  markChart();
  tickUI();
}
