import json, os, sys, subprocess, time
from playwright.sync_api import sync_playwright
import harness as H

ROOT = H.ROOT
os.makedirs(H.OUT, exist_ok=True)
RESULTS = []
def check(name, ok, info=''):
    RESULTS.append((name, bool(ok), info))
    print(('通過 ' if ok else '失敗 ') + name + ('　' + str(info)[:300] if info and not ok else ''), flush=True)

SIM = "window.__wsDown = true;"
TOK = 'ghp_' + 'a' * 36
SYNC = "try{ if(!localStorage.getItem('gaoqian.sync')) localStorage.setItem('gaoqian.sync', JSON.stringify({token:'%s', gist:'g1', ready:true, t:0})); }catch(e){}" % TOK
pw = sync_playwright().start()

def engine_tests():
    js = r"""
const E = require('%s/js/core/engine.js');
const out = {};
const s = E.newState(Date.now());
out.short10 = E.openPosition(s, { sym: 'BTC', side: 'short', lev: 10, amount: 100, price: 100, sl: 101, tp: 95, now: Date.now() }, { BTC: 100 }).ok;
out.lev11 = E.openPosition(s, { sym: 'BTC', side: 'long', lev: 126, amount: 100, price: 100, now: Date.now() }, { BTC: 100 }).ok;
out.lev125 = E.openPosition(s, { sym: 'SOL', side: 'long', lev: 125, amount: 100, price: 100, sl: 99.8, now: Date.now() }, { SOL: 100 });
out.lev125far = E.openPosition(s, { sym: 'XRP', side: 'long', lev: 125, amount: 100, price: 100, sl: 99, now: Date.now() }, { XRP: 100 }).ok;
out.slRank1 = E.openPosition(s, { sym: 'ETH', side: 'long', lev: 1, amount: 50, price: 10, sl: 9, tp: 12, now: Date.now() }, { ETH: 10 }).ok;
out.demote = E.checkDemotion(s, Date.now(), {});
const s2 = E.sanitize(JSON.parse(JSON.stringify(Object.assign(s, { favs: ['BTC', 'bad sym', 'ETH'], alerts: [{ id: 99, sym: 'BTC', px: 100, dir: 'up', t: 1 }, { id: 'x' }] }))), Date.now());
out.funds = (() => { const f = E.newState(Date.now()); const pk = f.peak; const a = E.adjustFunds(f, 5000, 1, {}); const eqA = E.equity(f, {}); const b = E.adjustFunds(f, -7000, 2, {}); const c = E.adjustFunds(f, -6000, 3, {}); const d = E.adjustFunds(f, 0, 4, {}); const f2 = E.sanitize(JSON.parse(JSON.stringify(f)), Date.now()); return { a: a.ok, eqA, b: b.ok, c: c.ok, cash: f.cash, d: d.ok, dd: f.maxDD, peak: f.peak, flows: f2.flows.length, cash2: f2.cash }; })(); out.keep125 = s2.positions.some((p) => p.lev === 125); out.favs = s2.favs; out.alerts = s2.alerts.length; out.nextId = s2.nextId > 99;
const eq0 = E.equity(s2, { BTC: 100, ETH: 10 });
out.eqOk = Math.abs(eq0 - E.equity(s, { BTC: 100, ETH: 10 })) < 1e-9;
console.log(JSON.stringify(out));
""" % ROOT
    r = json.loads(subprocess.check_output(['node', '-e', js]).decode())
    check('引擎：買跌 10 倍可以下單', r['short10'])
    check('引擎：超過 125 倍會擋下', not r['lev11'])
    check('引擎：125 倍可以下單，強平價正確', r['lev125']['ok'] and abs(r['lev125']['pos']['liq'] - 100 * (1 - 1/125 + 0.005)) < 1e-9, r['lev125'])
    check('引擎：125 倍時停損比強平遠會擋下', not r['lev125far'])
    check('引擎：125 倍持倉存回讀出還在', r['keep125'])
    fd = r['funds']
    check('引擎：資金可以加減、不能減到超過可用、加減不算回撤', fd['a'] and fd['eqA'] == 6000 and not fd['b'] and fd['c'] and fd['cash'] == 0 and not fd['d'] and fd['dd'] == 0 and fd['flows'] == 2 and fd['cash2'] == 0, fd)
    check('引擎：段位 1 也能設停損停利', r['slRank1'])
    check('引擎：不會再強制降級平倉', r['demote'] is None)
    check('引擎：自選與提醒資料驗證', r['favs'] == ['BTC', 'ETH'] and r['alerts'] == 1 and r['nextId'], r)
    check('引擎：資料存回讀出總資產不變', r['eqOk'])

def ui_tests(W, Hh, port):
    pg, errs, stop, ctx = H.start(W, Hh, port, init=SIM, pw=pw)
    pg.wait_for_function('() => window.__shidan && window.__shidan.S.mode === "sim"', timeout=60000)
    pg.wait_for_timeout(2500)
    tag = '%d' % W
    seq = [('book', ''), ('x', ''), ('coins', ''), ('x', ''), ('ticket', ''), ('otype', 'limit'), ('otype', 'market'), ('slm', 'p2'), ('tpm', 'r3'), ('tkside', 'short'), ('x', ''), ('ind', ''), ('indT', 'ma'), ('indT', 'ema'), ('indT', 'boll'), ('indSub', 'rsi'), ('indSub', 'macd'), ('x', '')]
    for iv in ['5m', '15m', '1h', '4h', '1d', '1m']: seq.append(('iv', iv))
    for t in ['book', 'tape', 'hist', 'ord', 'pos', 'pos', 'pos']: seq.append(('ptab', t))
    seq += [('alerts', ''), ('x', ''), ('fav', ''), ('fav', ''), ('judge', 'team'), ('askTeam', ''), ('x', ''), ('judge', 'me'), ('sync', ''), ('x', '')]
    bad = []
    for a, d in seq:
        try: H.act(pg, a, d); pg.wait_for_timeout(120)
        except Exception as e: bad.append((a, str(e)[:120]))
    check(tag + '：所有按鈕都能按，沒有錯誤', not bad and not errs, bad or errs[:3])
    est = pg.evaluate('''() => { state.settings.slMode = 'p2'; state.settings.tpMode = 'r2'; state.settings.lev = 3; state.settings.amtPct = 0.1; const e = ticketEst('long'); const q = e.notional / e.ref; return { e, liqOk: Math.abs(e.liq - E.liqPrice('long', e.ref, 3)) < 1e-9, lossOk: Math.abs(e.loss - (Math.abs(e.ref - e.sl) * q + e.fee)) < 1e-6, slPct: (e.ref - e.sl) / e.ref, tpR: (e.tp - e.ref) / (e.ref - e.sl) }; }''')
    check(tag + '：下單預估（強平價、最多賠、2% 停損、2R 停利）', est['liqOk'] and est['lossOk'] and abs(est['slPct'] - 0.02) < 0.001 and abs(est['tpR'] - 2) < 0.02, est)
    r = pg.evaluate('''() => { const n = state.positions.length; tradeBuy('short', true); const p = state.positions[state.positions.length - 1]; return { added: state.positions.length - n, side: p && p.side, lev: p && p.lev, sl: p && p.sl > p.entry, tp: p && p.tp < p.entry }; }''')
    check(tag + '：買跌 3 倍，停損在上、停利在下', r['added'] == 1 and r['side'] == 'short' and r['lev'] == 3 and r['sl'] and r['tp'], r)
    r = pg.evaluate('''() => { const sym = state.settings.sym; const cur = S.prices[sym]; state.settings.ordType = 'limit'; S.limitPx = roundP(cur * 0.995); const n = state.orders.length; tradeBuy('long', true); const o = state.orders[state.orders.length - 1]; const bad = (S.limitPx = roundP(cur * 1.01), tradeBuy('long', true), state.orders.length); state.settings.ordType = 'market'; closeSheet(); return { added: n + 1 === bad, sl: o && o.sl < o.limit, tp: o && o.tp > o.limit }; }''')
    check(tag + '：限價單（價格錯邊會擋下、帶停損停利）', r['added'] and r['sl'] and r['tp'], r)
    r = pg.evaluate('''() => { const sym = state.settings.sym; const cur = S.prices[sym]; addAlert(cur * 1.0006); const a = state.alerts[state.alerts.length - 1]; checkAlerts(sym, cur * 1.001); closeSheet(); return { made: !!a, gone: !state.alerts.some((x) => x.id === a.id) }; }''')
    check(tag + '：價格提醒新增與觸發', r['made'] and r['gone'], r)
    pg.evaluate("() => { closeSheet(); onAct('amount', ''); }"); pg.wait_for_timeout(200)
    nb = pg.evaluate("() => [...document.querySelectorAll('#sheetBody [data-act=\"lev\"]')].map((b) => b.dataset.id)")
    H.act(pg, 'lev', '100'); pg.wait_for_timeout(150)
    l100 = pg.evaluate('() => state.settings.lev')
    pg.fill('#levIn', ''); pg.type('#levIn', '25'); pg.wait_for_timeout(200)
    l25 = pg.evaluate('() => ({ lev: state.settings.lev, focus: document.activeElement && document.activeElement.id, on: [...document.querySelectorAll("#sheetBody [data-act=lev].on")].length })')
    pg.fill('#levIn', ''); pg.type('#levIn', '999'); pg.wait_for_timeout(150)
    l999 = pg.evaluate('() => ({ lev: state.settings.lev, v: document.querySelector("#levIn").value })')
    check(tag + '：槓桿按鈕到 125 倍、可以自訂倍數、超過會變成 125', nb == ['1','2','3','5','10','20','50','75','100','125'] and l100 == 100 and l25['lev'] == 25 and l25['focus'] == 'levIn' and l25['on'] == 0 and l999['lev'] == 125 and l999['v'] == '125', [nb, l100, l25, l999])
    r = pg.evaluate("""() => { closeSheet(); state.settings.lev = 50; state.settings.slMode = 'off'; state.settings.tpMode = 'off'; state.settings.amtPct = 0.05; const n = state.positions.length; tradeBuy('long', true); const p = state.positions[state.positions.length - 1]; state.settings.slMode = 'auto'; state.settings.tpMode = 'r2'; state.settings.lev = 1; return { added: state.positions.length - n, id: p.id, lev: p.lev, sl: p.sl, owner: p.owner }; }""")
    pg.evaluate("() => { state.settings.ptab = 'pos'; go('trade'); render(); }"); pg.wait_for_timeout(300)
    sel = '[data-act="handover"][data-id="%s"]' % r['id']
    vis = pg.evaluate('s => [...document.querySelectorAll(s)].some((b) => b.offsetParent)', sel)
    pg.evaluate('s => [...document.querySelectorAll(s)].find((b) => b.offsetParent).click()', sel); pg.wait_for_timeout(200)
    h = pg.evaluate('id => { const p = state.positions.find((x) => x.id === id); return { owner: p.owner, src: p.src, hand: p.hand, until: p.until > Date.now(), slOk: p.sl != null && p.sl < p.entry && p.sl > p.liq, btn: !!document.querySelector(\'[data-act="takeover"][data-id="\' + id + \'"]\') }; }', r['id'])
    check(tag + '：50 倍自己的單按「交給團隊管」，團隊補上比強平近的停損', r['added'] == 1 and r['lev'] == 50 and r['sl'] is None and vis and h['owner'] == 'team' and h['src'] == 'deleg' and h['hand'] and h['until'] and h['slOk'] and h['btn'], [r, vis, h])
    pg.evaluate('id => document.querySelector(\'[data-act="takeover"][data-id="\' + id + \'"]\').click()', r['id']); pg.wait_for_timeout(200)
    b = pg.evaluate('id => { const p = state.positions.find((x) => x.id === id); return { owner: p.owner, hand: !!p.hand, until: p.until == null, btn: !!document.querySelector(\'[data-act="handover"][data-id="\' + id + \'"]\') }; }', r['id'])
    pg.evaluate('id => onAct("handover", String(id))', r['id']); pg.wait_for_timeout(100)
    c = pg.evaluate('id => { const p = state.positions.find((x) => x.id === id); p.until = Date.now() - 1000; const nj = TS.journal.length; teamManage(); learnFromClosed(); const t = state.trades.find((x) => x.id === id); return { closed: !state.positions.some((x) => x.id === id), owner: t && t.owner, src: t && t.src, mine: E.mine(state).some((x) => x.id === id), nj: TS.journal.length - nj }; }', r['id'])
    check(tag + '：再改回我管、再交給團隊，團隊時間到會出場且不算進團隊學習', b['owner'] == 'me' and not b['hand'] and b['until'] and b['btn'] and c['closed'] and c['owner'] == 'team' and c['src'] == 'deleg' and not c['mine'] and c['nj'] == 0, [b, c])
    pg.evaluate("() => { const n = state.positions.length; state.settings.amtPct = 0.05; tradeBuy('long', true); const p = state.positions[state.positions.length - 1]; onAct('handover', String(p.id)); window.__hid = p.id; save(); }")
    pg.evaluate("() => { closeSheet(); onAct('book', ''); }"); pg.wait_for_timeout(200)
    pg.click('#sheetBody [data-act="funds"]'); pg.wait_for_timeout(200)
    e0 = pg.evaluate('() => E.equity(state, S.prices)')
    pg.fill('#fundIn', ''); pg.type('#fundIn', '12345.67'); pg.click('#sheetBody [data-act="fundGo"][data-id="1"]'); pg.wait_for_timeout(200)
    e1 = pg.evaluate('() => ({ e: E.equity(state, S.prices), dd: state.maxDD, flows: state.flows.length, list: document.querySelector("#sheetBody").innerText.includes("加入 12,345.67") })')
    pg.click('#sheetBody [data-act="fundQ"][data-id="all"]'); pg.click('#sheetBody [data-act="fundGo"][data-id="-1"]'); pg.wait_for_timeout(200)
    e2 = pg.evaluate('() => ({ cash: state.cash, pos: state.positions.length })')
    pg.fill('#fundIn', '1'); pg.click('#sheetBody [data-act="fundGo"][data-id="-1"]'); pg.wait_for_timeout(200)
    e3 = pg.evaluate('() => state.cash')
    pg.click('#sheetBody [data-act="fundQ"][data-id="100000"]'); pg.click('#sheetBody [data-act="fundGo"][data-id="1"]'); pg.wait_for_timeout(200)
    e4 = pg.evaluate('() => state.cash')
    pg.evaluate('() => closeSheet()')
    check(tag + '：調整資金（加入、全部減少、超過可用會擋、再加回）', abs(e1['e'] - e0 - 12345.67) < 0.02 and e1['flows'] >= 1 and e1['list'] and e2['cash'] < 0.01 and e2['pos'] >= 1 and e3 < 0.01 and abs(e4 - 100000 - e3) < 0.01, [e0, e1, e2, e3, e4])
    pg.evaluate("() => { onAct('fav', 'ETH'); save(); }")
    pg.reload()
    pg.wait_for_function('() => window.__shidan && window.__shidan.S.mode === "sim"', timeout=60000)
    pg.wait_for_timeout(1500)
    r = pg.evaluate('() => ({ favs: state.favs, ind: [state.settings.ema, state.settings.boll, state.settings.sub], orders: state.orders.length, hand: state.positions.some((p) => p.hand && p.owner === "team" && p.until) })')
    check(tag + '：重新整理後自選、指標、掛單、交給團隊的單都還在', 'ETH' in r['favs'] and r['ind'] == [True, True, 'macd'] and r['orders'] >= 1 and r['hand'], r)
    for v in ['team', 'learn', 'stats', 'trade']:
        pg.evaluate('v => go(v)', v); pg.wait_for_timeout(500); pg.screenshot(path=H.OUT + tag + '-' + v + '.png')
    check(tag + '：四個分頁都能打開', not errs, errs[:3])
    stop()

def team_tests(port):
    pg, errs, stop, ctx = H.start(390, 844, port, init=SIM, pw=pw)
    pg.wait_for_function('() => window.__shidan && window.__shidan.TS.loadedAt > 0 && window.__shidan.TS.lastScan > 0', timeout=240000)
    r = pg.evaluate('''() => {
      const out = {};
      const k = simAgg('ETH', 5); const ind = Team.prepare(k); let n = 0, ok = 0;
      for (let i = k.length - 130; i < k.length - 60 && n < 20; i++) for (const s of Team.detect(ind, k, i)) { const pl = Team.plan(ind, k, i, s.side, s.stopRef); const full = Team.simulate(k, i, pl, s.side); const sig = { id: 'T' + i + s.type + s.side, sym: 'ETH', type: s.type, side: s.side, plan: pl, barT: k[i].t, f: {}, dec: { go: false } }; shadowAdd(sig, 'est', 't'); TS.recent.ETH = k; shadowResolve(); const x = TS.shadows.find((z) => z.id === sig.id); n++; if (x && full && x.r === +full.r.toFixed(3)) ok++; }
      out.shadow = [n, ok];
      out.lev = [teamLev(10, 0.005, 1000, 'long'), teamLev(10, 0.005, 400, 'long'), teamLev(10, 0.005, 100, 'long'), teamLev(10, 0.15, 100, 'long')];
      TS.tune = { con: 3, est: 0.1, at: 0 };
      const base = Date.now();
      for (let i = 0; i < 25; i++) TS.shadows.push({ id: 'c' + i, sym: 'BTC', type: 'pullback', side: 'long', barT: base - 3600000, plan: { entry: 1, stop: 0.9, target: 1.4, dist: 0.1 }, f: {}, cat: 'con', why: '', r: 0.5, t1: base });
      tuneGates(true); out.con = conMax();
      TS.halt = true; out.halt = guard().block; TS.halt = false;
      const kb0 = JSON.stringify(L.build([], TS.journal.filter((j) => !j.cancel && j.src !== 'deleg'), [])); const nj = TS.journal.length;
      for (let i = 0; i < 40; i++) TS.journal.push({ id: 900000 + i, t0: base - 7200000, t1: base - 3600000, sym: 'BTC', type: 'pullback', side: 'long', f: { align: Object.keys(L.FEATS.align)[0] }, est: 0.1, src: 'deleg', r: -3, pnl: -10, why: '', cancel: false });
      learnRebuild(true);
      const kb1 = JSON.stringify(L.build([], TS.journal.filter((j) => !j.cancel && j.src !== 'deleg'), []));
      const usedKb = JSON.stringify(TS.kb) === JSON.stringify(L.build(TS.samples || [], TS.journal.filter((j) => !j.cancel && j.src !== 'deleg'), shadowLearn(TS.sampleCut)));
      out.sep = { same: kb0 === kb1, usedKb };
      TS.journal.splice(nj);
      return out;
    }''')
    check('團隊：影子單結果和時光機一致', r['shadow'][0] > 0 and r['shadow'][0] == r['shadow'][1], r['shadow'])
    lv = r['lev']
    check('團隊：槓桿只用剛好放得下的倍數、最多 5 倍', lv[0]['lev'] == 2 and lv[1]['lev'] == 5 and lv[2]['lev'] == 5 and lv[2]['amount'] <= 100 and lv[3]['lev'] == 1, lv)
    check('團隊：反方審查會依影子單自動放寬', r['con'] == 4, r['con'])
    check('團隊：防守規則照常擋下', bool(r['halt']), r['halt'])
    check('團隊：你委託或交給團隊的單不進團隊學習', r['sep']['same'] and r['sep']['usedKb'], r['sep'])
    check('團隊：沒有錯誤', not errs, errs[:3])
    stop()

def live_tests(port):
    pg, errs, stop, ctx = H.start(390, 844, port, pw=pw)
    pg.wait_for_function('() => window.__shidan && window.__shidan.S.mode === "live" && !window.__shidan.S.catching', timeout=60000)
    pg.wait_for_timeout(4000)
    r = pg.evaluate('() => ({ book: S.book && S.book.bids.length, tape: S.tape.length, hi: S.hi[state.settings.sym] > 0, coins: S.coins.length })')
    check('即時：訂單簿、成交、24 小時高低都有資料', r['book'] == 20 and r['tape'] > 0 and r['hi'], r)
    pg.evaluate("() => switchSym('ETH')"); pg.wait_for_timeout(2500)
    r = pg.evaluate("() => ({ sub: Live.mSub, tape: S.tape.every((x) => true), book: !!S.book })")
    check('即時：換幣後訂單簿跟著換', r['sub'] and r['sub'][0].startswith('ethusdt'), r)
    pg.wait_for_function('() => window.__shidan.TS.loadedAt > 0', timeout=240000)
    pg.wait_for_timeout(70000)
    r = pg.evaluate('() => ({ scans: TS.lastScan > 0, sig: TS.feed.filter((x) => x.who === "掃描器").length, err: TS.err })')
    check('即時：團隊照常掃描', r['scans'] and not r['err'], r)
    check('即時：沒有錯誤', not errs, errs[:3])
    stop()

def runner_tests(portA, portB):
    H.GIST['files'].clear(); H.GIST['patches'].clear()
    A, ea, stopA, _ = H.start(390, 844, portA, init=SYNC, pw=pw)
    A.wait_for_function('() => window.__shidan && window.__shidan.S.mode === "live" && !window.__shidan.S.catching', timeout=60000)
    A.wait_for_timeout(1500)
    H.act(A, 'buy', 'long'); A.wait_for_timeout(300)
    A.evaluate('async () => { save(); saveTeam(); const c = syRead(); c.t = Date.now(); c.h = syLocal().h; syWrite(c); await syPush(true); }')
    B, eb, stopB, _ = H.start(1280, 900, portB, init=SYNC, url='/index.html?runner=1', pw=pw)
    B.wait_for_function('() => window.__shidan && window.__shidan.S.mode === "live" && SY.runnerOk', timeout=90000)
    B.wait_for_timeout(2000)
    check('雲端：雲端團隊讀到手機的資料', B.evaluate('() => state.positions.some((p) => p.owner === "me")'))
    A.evaluate('async () => { await syBeat(); }')
    B.evaluate('async () => { await runnerTick(); }')
    n = len(H.GIST['patches'])
    B.evaluate('async () => { save(); saveTeam(); syTrack(); await syPush(true); }')
    check('雲端：手機在用時雲端暫停、不上傳', B.evaluate('() => TS.yield') and len(H.GIST['patches']) == n)
    hb = json.loads(H.GIST['files']['gaoqian-hb.json'])
    H.GIST['files']['gaoqian-hb.json'] = json.dumps({'dev': hb['dev'], 't': int(time.time() * 1000) - 200000})
    try: B.evaluate('async () => { await runnerTick(); }')
    except Exception: pass
    B.wait_for_timeout(2500)
    B.wait_for_function('() => window.__shidan && SY.runnerOk', timeout=60000)
    n = len(H.GIST['patches'])
    B.evaluate('async () => { state.flags.cloudtest = true; save(); saveTeam(); syTrack(); await new Promise((r) => setTimeout(r, 300)); await syPush(false); }')
    check('雲端：手機離開後雲端接手並上傳', not B.evaluate('() => !!TS.yield') and len(H.GIST['patches']) == n + 1 and json.loads(H.GIST['files']['gaoqian-sync.json'])['dev'] == 'runner')
    check('雲端：雲端團隊從不切到練習行情', B.evaluate('() => S.mode') == 'live')
    check('雲端：沒有錯誤', not ea and not eb, (ea + eb)[:3])
    stopB()
    stopA()

port = 8801
for fn, args in [(engine_tests, ()), (ui_tests, (390, 844)), (ui_tests, (1440, 900)), (team_tests, ()), (live_tests, ()), (runner_tests, ())]:
    try:
        if fn is runner_tests: p0 = port; port += 2; fn(p0, p0 + 1)
        elif fn is engine_tests: fn()
        else: p0 = port; port += 1; fn(*args, p0)
    except Exception as e:
        check(fn.__name__ + ' 執行', False, repr(e)[:300])
pw.stop()
fail = [r for r in RESULTS if not r[1]]
print('\n共 %d 項，通過 %d 項，失敗 %d 項' % (len(RESULTS), len(RESULTS) - len(fail), len(fail)))
sys.exit(1 if fail else 0)
