async function boot() {
  try { await syBoot(); } catch (e) { SY.err = '讀不到雲端資料，先用這台的資料'; }
  load();
  loadTeam();
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    e.preventDefault();
    onAct(el.dataset.act, el.dataset.id, el);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('term')) onAct('term', null, e.target);
    if (e.key === 'Enter' && e.target.id === 'syncTok') { e.preventDefault(); onAct('syncGo', null, e.target); }
    if (e.key === 'Enter' && e.target.id === 'alertPx') { e.preventDefault(); onAct('alertAdd', null, e.target); }
    if (e.key === 'Enter' && e.target.id === 'limPx') { e.preventDefault(); e.target.blur(); }
    if (e.key === 'Escape') { if (S.sheetKind) closeSheet(); else if (S.cross) hideCross(); }
    const tg = e.target && e.target.tagName;
    if (e.metaKey || e.ctrlKey || e.altKey || tg === 'INPUT' || tg === 'TEXTAREA' || S.sheetKind || S.lesson || S.view !== 'trade') return;
    const k = (e.key || '').toLowerCase();
    if (k === 'b' || k === 's') {
      const btn = $('#bar [data-act="buy"][data-id="' + (k === 'b' ? 'long' : 'short') + '"]') || $('#bar [data-act="order"][data-id="' + (k === 'b' ? 'long' : 'short') + '"]');
      if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
    }
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el && el.id === 'limPx') { onLimitInput(el); return; }
    if (el && el.id === 'levIn') { onLevInput(el); return; }
    if (!el || (el.id !== 'coinQ' && el.id !== 'coinQs')) return;
    const v = String(el.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
    S.coinQ = v;
    if (S.sheetKind === 'coins') renderCoins(true);
    if (S.view === 'trade') renderSide();
  });
  $('#sheet .backdrop').addEventListener('click', () => closeSheet());
  $$('.tabs a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.v); }));
  $('#rankPill').addEventListener('click', () => go('learn'));
  if (WIDE.addEventListener) WIDE.addEventListener('change', () => { S.hover = null; render(); });
  if (XL.addEventListener) XL.addEventListener('change', () => { S.hover = null; render(); });
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  const h = (location.hash || '').slice(1);
  S.view = ['trade', 'team', 'learn', 'stats'].includes(h) ? h : 'trade';
  for (const k of Object.keys(state.lastPrices)) S.prices[k] = state.lastPrices[k];
  setMode('connecting', false);
  render();
  const fresh = state.coinCache && Date.now() - state.coinCache.t < 3 * 3600000;
  if (!fresh) { try { await fetchTop(); save(); } catch (e) { S.topErr = true; } }
  else setTimeout(() => fetchTop().then(() => { save(); syncTickers(); }).catch(() => { S.topErr = true; }), 1500);
  connect();
  setInterval(() => { fetchTop().then(() => { save(); syncTickers(); if (S.sheetKind === 'coins') renderCoins(true); }).catch(() => { S.topErr = true; }); }, 30 * 60000);
  setInterval(() => {
    if (S.mode === 'live' && !S.stale && Date.now() - Live.last > 15000) { setMode('live', true); try { if (Live.ws) Live.ws.close(); } catch (e) { return; } }
  }, 5000);
  setInterval(() => { E.touchDD(state, S.prices); save(); }, 10000);
  setInterval(teamPulse, 1000);
  setInterval(syTrack, 5000);
  setInterval(syBeat, 60000);
  setTimeout(syBeat, 1500);
  if (RUNNER) { setInterval(runnerTick, 30000); setTimeout(runnerTick, 5000); }
  try { if (sessionStorage.getItem('gaoqian.synced')) { sessionStorage.removeItem('gaoqian.synced'); setTimeout(() => toast('已換成另一台裝置的最新資料'), 600); } } catch (e) { SY.err = null; }
  const loop = () => {
    if (S.chartDirty && S.view === 'trade') { S.chartDirty = false; drawChart(); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  setInterval(() => { if (S.dirty && !G.pts.size) { S.dirty = false; tickUI(); } }, 250);
  window.addEventListener('resize', () => { markChart(); drawSpark(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { S.hiddenAt = Date.now(); save(); saveTeam(); SY.lastPush = 0; syTrack(); return; }
    if (Date.now() - SY.lastPull > 15000) syPullApply('visible');
    syBeat();
    if (S.mode === 'live' && Live.ws && Live.ws.readyState === 1 && S.hiddenAt && Date.now() - S.hiddenAt > 90000) onLiveReady(S.hiddenAt, false);
  });
  window.addEventListener('pagehide', save);
  window.__shidan = { S, G, get state() { return state; }, E, tick: onTick, draw: drawChart, TS, createDeleg, addSignal, teamScan, teamManage, learnRebuild, learnFromClosed, MD, guard, extAt, NW, sectors, SEC, thesisNow, thesisCheck, auditRun, rollWeeks, brainCheck, TA, taAnalyze, coachRun, dataCheck, stressOf, betaOf, evalSamples };
}
boot();
