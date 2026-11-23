function onAct(act, idRaw, el) {
  if (teamAct(act, idRaw)) return;
  if (proAct(act, idRaw, el)) return;
  const id = /^-?\d+(\.\d+)?$/.test(idRaw || '') ? parseFloat(idRaw) : idRaw;
  switch (act) {
    case 'x': return closeSheet();
    case 'go': return go(id);
    case 'coins': return renderCoins(false);
    case 'sym': return switchSym(String(idRaw));
    case 'iv': state.settings.interval = id; S.off = 0; S.cross = null; state.flags.interval = true; save(); render(); return loadChart();
    case 'ma': state.settings.ma = !state.settings.ma; save(); return render();
    case 'fib': state.settings.fib = !state.settings.fib; save(); if (state.settings.fib) toast('黃金比例線：用畫面上這段走勢的最高點和最低點畫'); return render();
    case 'book': return renderBook(false);
    case 'sync': SY.pending = null; return renderSync();
    case 'syncGo': { const el = $('#syncTok'); const v = el ? el.value : ''; if (el) el.value = ''; return syConnect(v); }
    case 'syncRemote': { const d = SY.pending; SY.pending = null; if (d && syApply(d)) { try { sessionStorage.setItem('gaoqian.synced', '1'); } catch (e) { SY.err = null; } location.reload(); } return renderSync(); }
    case 'syncLocal': { SY.pending = null; const c = syRead(); c.ready = true; c.t = Date.now(); c.h = syLocal().h; c.pushedH = null; syWrite(c); return syPush(true).then(() => { toast(SY.err ? SY.err : '已用這台的資料覆蓋雲端'); renderSync(); }); }
    case 'syncNow': { save(); saveTeam(); return syPush(true).then(() => syPullApply('manual')).then(() => { toast(SY.err ? SY.err : '已同步'); renderSync(); }); }
    case 'syncOff': { const c = syRead(); delete c.token; delete c.gist; delete c.ready; syWrite(c); SY.err = null; toast('這台已中斷同步，權杖已從這台刪除'); return renderSync(); }
    case 'amount': return openTicket();
    case 'pct': if ([0.05, 0.1, 0.25, 0.5, 1].includes(id)) { state.settings.amtPct = id; save(); } openAmount(); return renderBar();
    case 'lev': if (Number.isInteger(id) && id >= 1 && id <= E.MAX_LEV) { state.settings.lev = id; save(); } openAmount(); return renderBar();
    case 'buy': return tradeBuy(id, false);
    case 'askTeam': if (S.sheetKind) closeSheet(); S.pendingDeleg = null; return askTeam();
    case 'delegGo': { const pd = S.pendingDeleg; S.pendingDeleg = null; closeSheet(); if (pd && pd.sym === state.settings.sym) return createDeleg(pd.side, true); return toast('幣種已經換了，請重新選擇'); }
    case 'confirmBuy': closeSheet(); return tradeBuy(S.pendingSide, true, S.pendingPlan);
    case 'flat': { const P = curPos(); const p = P.find((x) => x.owner !== 'team') || P[0]; if (p) closePos(p); return; }
    case 'closeId': { const p = state.positions.find((x) => x.id === id); if (p) closePos(p); return; }
    case 'cancel': { const r = E.cancelOrder(state, id); if (r.ok) { save(); toast('掛單已取消，資金已退回'); if (S.sheetKind === 'book') renderBook(true); tickUI(); markChart(); } return; }
    case 'xclose': return hideCross();
    case 'xlimit': return crossAct('xlimit', id);
    case 'xsl': return crossAct('xsl');
    case 'xtp': return crossAct('xtp');
    case 'reason': {
      const r = E.setReason(state, S.reviewId, id);
      if (!r.ok) return;
      save();
      const t = state.trades.find((x) => x.id === S.reviewId);
      if (t) showReview(t, S.reviewFresh);
      return;
    }
    case 'lesson': if (S.sheetKind) { S.sheetKind = null; $('#sheet').hidden = true; } return openLesson(id);
    case 'gloss': return openGloss();
    case 'pclose': return closePage();
    case 'term': { const t = el.dataset.t; if (GLOSSARY[t]) showInfo(t, [GLOSSARY[t]]); return; }
    case 'trade': { const t = state.trades.find((x) => x.id === id); if (t) showReview(t, false); return; }
    case 'tw': state.settings.twColors = !state.settings.twColors; save(); return render();
    case 'promote': {
      const r = E.promote(state, Date.now(), S.prices);
      if (!r.ok) return toast(r.err);
      save(); render();
      if (r.graduated) return showInfo('結業', ['你完成了全部段位和條件。', '這代表你有方法、有紀律，而且成績不像是運氣。它不保證真錢會賺。']);
      return showInfo('升上段位 ' + r.rank + '　' + E.RANKS[r.rank].name, ['資金增加 ' + fU(r.added) + ' USDT。', '資金變大，規則不變：每筆最多賠總資產的 2%。']);
    }
    case 'reset': return openSheet('info', '<h2>清除全部資料？</h2><div class="lines"><p>段位、交易紀錄、課程進度都會刪除，而且無法復原。</p></div><div class="cta"><button class="btn quiet" data-act="x">取消</button><button class="btn solid" data-act="doReset">確定清除</button></div>');
    case 'doReset': {
      const keep = S.everLive;
      const cache = state.coinCache;
      state = E.newState(Date.now());
      state.coinCache = cache;
      S.everLive = keep;
      S.queue = [];
      save(); closeSheet(); go('trade'); loadChart();
      return toast('已清除，從頭開始');
    }
    default: return lessonAct(act, id);
  }
}
