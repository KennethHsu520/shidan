function viewTeam() {
  const rg = TS.regime;
  const dirTxt = rg ? (rg.dir === 'up' ? '大盤偏多' : rg.dir === 'down' ? '大盤偏空' : '大盤盤整') : '判斷中';
  const votes = rg ? (rg.dir === 'up' ? rg.up : rg.dir === 'down' ? rg.down : Math.max(rg.up, rg.down)) : 0;
  const sigs = TS.signals.filter((s) => (s.dec && s.dec.go) || s.grade === 'A' || s.grade === 'B').slice(0, 15);
  const now = Date.now();
  const next = Math.max(0, Math.round((TS.nextScan - now) / 1000));
  const status = !teamReady() ? '等行情連上才會開始工作' : TS.mdLoading ? '讀取資金費率、未平倉量、恐懼貪婪指數' : TS.replaying ? '正在補跑你不在的時間：讀取 ' + TS.rpDone + ' / ' + TS.rpTotal + ' 個幣' : TS.gapFrom != null ? '時光機讀完資料後，會補跑你不在的時間' : TS.loading ? '時光機讀取 14 天資料 ' + TS.loaded + ' / ' + TS.total + '，同時照常掃描' : TS.scanning ? '正在掃描前 ' + S.coins.length + ' 大幣' : TS.lastScan ? '最後掃描 ' + fHM(TS.lastScan) + '　下次 ' + next + ' 秒後' : '準備掃描';
  const keys = TS.results ? Object.values(TS.results).sort((a, b) => a.grade.localeCompare(b.grade) || (b.mc ? b.mc.p50 : -99) - (a.mc ? a.mc.p50 : -99)) : [];
  const rk = todayRisk();
  const bd = teamBudget();
  const tp = state.settings.teamPct;
  const tRows = teamPosRows();
  const J = TS.journal.filter((j) => !j.cancel);
  const acc = L.accuracy(J);
  const sz = L.sizing(J, { dd: L.teamDD(J, bd.alloc) });
  const avoid = (TS.rules || []).filter((r) => r.kind === 'avoid').slice(0, 6);
  const prefer = (TS.rules || []).filter((r) => r.kind === 'prefer').slice(0, 6);
  const accCell = (a) => (a.n ? '<b>' + Math.round(a.wr * 100) + '%</b><small>' + a.n + ' 筆　平均 ' + L.fmtR(a.avg) + '</small>' : '<b>—</b><small>還沒有紀錄</small>');
  const gd = guard();
  const pc = (x) => (gd.A > 0 ? (x / gd.A) * 100 : 0);
  const gRow = (label, val, lim, bad) => '<div class="row"><div class="row-main"><span>' + label + '</span><b class="' + (bad ? 'down' : '') + '">' + val + '<small class="glim">　' + lim + '</small></b></div></div>';
  const guardHTML = '<section><h3>防守規則</h3><div class="verdict ' + (gd.block ? 'down' : '') + '" style="font-size:20px">' + (gd.block ? esc(gd.block) : gd.mult < 1 ? '照常交易，但' + esc(gd.notes.join('、')) : '一切正常') + '</div>' + (TS.halt ? '<div class="cta" style="margin-top:12px"><button class="btn solid" data-act="tresume">恢復團隊交易</button></div><p class="say">按下去後，回落從現在重新計算。</p>' : '') +
    '<div class="list" style="margin-top:12px">' +
    gRow('今天團隊損益', fS(gd.day), '上限 −3%', -gd.day >= RISK.day * gd.A && gd.A > 0) +
    gRow('最近 7 天', fS(gd.week), '虧 5% 改半量', -gd.week >= RISK.week * gd.A && gd.A > 0) +
    gRow('從高點回落', (gd.dd * 100).toFixed(1) + '%', '15% 全部暫停', TS.halt) +
    gRow('同時承擔的風險', pc(gd.open).toFixed(1) + '%', '上限 5%', pc(gd.open) >= 5) +
    gRow('同方向風險', '漲 ' + pc(gd.side.long).toFixed(1) + '%・跌 ' + pc(gd.side.short).toFixed(1) + '%', '各 3%', Math.max(pc(gd.side.long), pc(gd.side.short)) >= 3) +
    gRow('連賠', gd.streak + ' 筆', '4 筆冷靜 1 小時', gd.coolUntil > Date.now()) +
    gRow('比特幣 15 分鐘波動', (gd.btc * 100).toFixed(2) + '%', '超過 1.5% 小幣暫停', gd.btc > RISK.shock) +
    '</div><p class="say">這些是硬性規定，團隊一定遵守。百分比都是對團隊額度計算。你委託的單用你自己的金額，不受這些限制。</p></section>';
  const brainHTML = '<section><h3>團隊大腦</h3><div class="list">' + [
    ['海龜交易法 Richard Dennis', '用波動決定停損；賺錢的單不急著賣，停損跟著價格移動'],
    ['Paul Tudor Jones', '防守第一、絕不攤平虧損的單、做不好就縮小部位'],
    ['Ed Seykota', '大趨勢第一、小賭注、照規則做、不看新聞'],
    ['Linda Raschke', '聖杯：強趨勢裡第一次拉回 20 均線'],
    ['Van Tharp', '每筆用 R 計算，只看平均每筆賺幾 R'],
    ['加密貨幣專屬', '資金費率、未平倉量、恐懼貪婪指數、比特幣急動時小幣暫停、週末半量'],
    ['你的知識庫：三層判斷', '結構層（200 日、200 週均線）定方向，資金層（穩定幣）確認，觸發層（1 小時線、資金費率、未平倉）抓時機'],
    ['你的知識庫：總經', 'CPI、PCE、FOMC 公布前 30 分鐘到後 1 小時不進場'],
    ['你的知識庫：衍生品', '漲＋未平倉增＋費率高＝多頭擁擠；費率深度為負且不再破底＝軋空；漲但未平倉減＝空單回補'],
    ['你的知識庫：新聞', '駭客、詐騙、停止提款 3 天不買漲；下架 7 天；只有一家報導先減半；好消息已漲過不追；極度貪婪不追突破'],
    ['你的知識庫：山寨', '比特幣市佔率上升時山寨買漲減碼'],
    ['金融助理：市場研究員 → 板塊輪動', '幣種分 8 個板塊跟比特幣比強弱；先掃強勢板塊，弱勢板塊買漲、強勢板塊買跌減碼'],
    ['金融助理：論點追蹤', '進場時記下成立的理由；其中兩項變了（或出現重大壞消息）就提早出場'],
    ['金融助理：會前準備 → 今日簡報', '每天整理大方向、重大數據、強弱板塊、昨天成績和今天的打算'],
    ['金融助理：月結與稽核 → 週報', '每週結算哪種訊號、板塊、條件賺錢；每次都核對帳務'],
    ['研究提示詞：反方審查員', '每筆進場前列出反對理由；找到 3 個以上就不做，理由記進團隊筆記'],
    ['研究提示詞：技術分析師', '日線週線的均線、支撐壓力、三種情境；下單時檢查前方 1R 內有沒有擋路的高低點；太近、而且過去這類單平均賠錢就減碼'],
    ['研究提示詞：回測可信度', '時光機切成前 70% 和最近 30%，前面賺最近賠就當作過度擬合，降成 C 級'],
    ['研究提示詞：交易教練', '檢討你最近 20 筆，分清楚紀錄證明的事和推測，訂 3 條規則並追蹤遵守率'],
    ['研究提示詞：風險管理', '比特幣跌 20% 的壓力測試、集中度、跟比特幣的連動，比較調整方案'],
    ['研究提示詞：資料查核、事件日曆', '每份資料分成已核實、待核實、有誤；重大數據排到 2027 年底，找不到的日期標待確認']
  ].map((x) => '<div class="row"><div class="row-main"><div><b>' + x[0] + '</b><div class="sub">' + x[1] + '</div></div></div></div>').join('') + '</div><p class="say">防守規則一定遵守；其他條件都交給團隊自己學：在加密貨幣有效就變成偏好，沒效就變成避開。</p></section>';
  const fgNow = MD.fg.length ? MD.fg[MD.fg.length - 1].v : null;
  const fgTxt = fgNow == null ? '' : '恐懼貪婪 ' + fgNow + '（' + (fgNow < 25 ? '極度恐懼' : fgNow < 45 ? '恐懼' : fgNow <= 55 ? '中性' : fgNow <= 75 ? '貪婪' : '極度貪婪') + '）';
  const frTxt = MD.fundNow.BTC != null ? '比特幣資金費率 ' + (MD.fundNow.BTC * 100).toFixed(4) + '%' : '';
  const nmk = NW.items && NW.items.length ? L.newsMood(NW.items, '-', Date.now()) : null;
  const nwTxt = nmk ? '新聞 ' + ({ good: '偏多', bad: '偏空', neutral: '中性' }[nmk.mnews]) + '（3 小時 ' + nmk.mn + ' 則）' : '';
  const moodHTML = fgTxt || frTxt || nwTxt ? '<div class="sub">' + [fgTxt, frTxt, nwTxt].filter(Boolean).join('　') + '</div><div class="sub src">資料來源：' + [fgTxt ? 'alternative.me' : '', frTxt ? '幣安期貨' : '', nwTxt ? (NW.src || 'cryptocurrency.cv') : ''].filter(Boolean).join('、') + '</div>' : S.mode === 'live' && MD.t ? '<div class="sub src">市場情緒資料暫時讀不到，團隊只用 K 線判斷</div>' : '';
  const now0 = Date.now();
  const st0 = structAt(now0), fl0 = flowAt(now0), dm0 = domNow();
  const lyL = layers('long', now0);
  const stTxt = st0 ? (st0.macro === 'bull' ? '偏多' : st0.macro === 'bear' ? '偏空' : '不明') + '　比特幣 ' + fP(st0.px) + '／200 日 ' + fP(st0.m200) + (st0.w200 ? '／200 週 ' + fP(st0.w200) : '') : '讀取中';
  const flTxt = fl0 ? (fl0.flow === 'in' ? '資金進場' : fl0.flow === 'out' ? '資金離場' : '持平') + '　穩定幣 30 天 ' + fPct(fl0.chg) + '（$' + (fl0.v / 1e9).toFixed(1) + 'B）' : '讀取中';
  const tgTxt = TS.regime ? (TS.regime.dir === 'up' ? '偏多' : TS.regime.dir === 'down' ? '偏空' : '盤整') + '　比特幣 1 小時線' : '讀取中';
  const verdict = lyVerdict(lyL);
  const nm0 = nextMacro(now0);
  const mw0 = macroWindow(now0);
  const calTxt = mw0 ? '<b class="down">「' + esc(mw0.name) + '」公布前後，團隊暫停進場</b>' : nm0 ? '下一個重大數據：' + esc(nm0.name) + '　' + fT(nm0.t) + '（前 30 分鐘到後 1 小時暫停進場）' : (now0 > CAL_UNTIL ? '數據日曆已過期，需要更新' : '');
  const layersHTML = '<section><h3>三層判斷　大方向</h3><div class="verdict" style="font-size:20px">' + esc(verdict) + '</div><div class="list lyr" style="margin-top:10px">' +
    '<div class="row"><div class="row-main"><span>結構層</span><span class="sub">' + esc(stTxt) + '</span></div></div>' +
    '<div class="row"><div class="row-main"><span>資金層</span><span class="sub">' + esc(flTxt) + '</span></div></div>' +
    '<div class="row"><div class="row-main"><span>觸發層</span><span class="sub">' + esc(tgTxt) + '</span></div></div>' +
    (dm0 ? '<div class="row"><div class="row-main"><span>比特幣市佔率</span><span class="sub">' + dm0.now.toFixed(1) + '%' + (dm0.dom ? '　' + ({ up: '上升，山寨偏弱', down: '下降，山寨偏強', flat: '持平' }[dm0.dom]) : '　累積中') + '</span></div></div>' : '') +
    '</div><p class="say">' + calTxt + '</p><p class="say">結構層決定大方向、資金層確認、觸發層決定時機。三層都相反就不做；兩層相反減半；一層相反減碼四分之一。資料來源：幣安、DefiLlama、CoinGecko</p></section>';
  const ex = exploreState();
  const exHTML = '<section><h3>' + (ex.on ? '試單期' : '學習進度') + '</h3>' + (ex.on ? '<div class="big">' + ex.done + '<small>／ ' + EXPLORE_N + ' 筆完成</small></div><div class="exbar"><i style="width:' + Math.round((ex.done / EXPLORE_N) * 100) + '%"></i></div><p class="say">團隊剛開始沒有自己的紀錄，所以先「亂槍打鳥」：看到訊號就用最小風險 0.25% 做，同時最多 ' + EXPLORE_OPEN + ' 筆。做滿 ' + EXPLORE_N + ' 筆後，改成只做自己判斷會賺的單，另外偶爾小量試單，繼續學。</p>' : '<p class="say">已經做完 ' + ex.done + ' 筆。現在只做預估會賺的單；沒把握的情況，偶爾用 0.25% 小量試，繼續累積經驗。</p>') + '</section>';
  return '<div class="cols"><section style="margin-top:14px"><h3>市場總監</h3><div class="verdict ' + (rg ? (rg.dir === 'up' ? 'up' : rg.dir === 'down' ? 'down' : '') : '') + '">' + dirTxt + '</div><div class="sub">' + (rg ? '比特幣 1 小時線：4 項指標有 ' + votes + ' 項' + (rg.dir === 'flat' ? '同方向，方向不明確' : '同意') + '　24 小時 ' + fPct(rg.chg) + '　每小時波動約 ' + (rg.vol * 100).toFixed(2) + '%' : '讀取比特幣走勢中') + '</div>' + moodHTML + '<div class="sub status">' + esc(status) + (TS.err ? '　' + esc(TS.err) : '') + '</div></section>' +
    briefHTML() + '<section><h3>團隊額度</h3><div class="quick big tq">' + [0, 0.1, 0.25, 0.5, 1].map((p) => '<button data-act="tpct" data-id="' + p + '" class="' + (tp === p ? 'on' : '') + '">' + p * 100 + '%<small>' + fU(bd.eq * p) + '</small></button>').join('') + '</div>' +
    '<div class="sub" style="margin-top:10px">團隊最多動用你總資產的 ' + tp * 100 + '%（' + fU(bd.alloc) + ' USDT），已用 ' + fU(bd.used) + '。自己找單用這個額度；你在交易頁按「請團隊判斷」或委託的單，用你自己的每筆金額，不佔額度。</div>' +
    '<div class="list" style="margin-top:12px"><div class="row"><button class="toggle" role="switch" aria-checked="' + (TS.auto && tp > 0) + '" data-act="tauto"><span>讓團隊自己找單交易<span class="sub" style="display:block">團隊自己判斷前 ' + S.coins.length + ' 大幣哪個值得做，網頁開著才會運作</span></span><i class="sw"></i></button></div></div>' +
    '<h3 style="margin-top:22px">團隊手上的單</h3>' + (tRows ? '<div class="list">' + tRows + '</div>' : '<div class="empty">目前沒有。</div>') + '</section>' +
    layersHTML + calHTML() + sectorHTML() + taHTML() + exHTML + guardHTML + newsHTML() +
    '<section><h3>資金控制</h3><div class="big">' + (sz.risk * 100).toFixed(2) + '%<small>下一筆的基本風險</small></div><div class="sub">約 ' + fU(bd.alloc * sz.risk) + ' USDT：停損打到時大約賠這麼多。' + esc(sz.notes.join('，')) + '。實際下單時再依這筆的把握度乘 0.7～1.3 倍。</div>' + riskSvg(J) + '</section>' +
    '<section><h3>判斷準確率</h3><div class="acc"><div><label>最近 20 筆</label>' + accCell(acc.recent) + '</div><div><label>再之前 20 筆</label>' + accCell(acc.before) + '</div><div><label>全部</label>' + accCell(acc.all) + '</div></div>' + (acc.recent.n && acc.before.n ? '<p class="say">' + (acc.recent.avg > acc.before.avg ? '最近比之前做得好，學到的守則有效。' : acc.recent.avg < acc.before.avg ? '最近比之前差，團隊會自動減碼，並繼續修正守則。' : '跟之前差不多。') + '</p>' : '') + '</section>' + weekHTML() +
    '<section><h3>訊號獵人　前 ' + S.coins.length + ' 大幣</h3>' + (sigs.length ? '<div class="list">' + sigs.map(sigRow).join('') + '</div>' : '<div class="empty">目前沒有值得做的訊號。團隊每分鐘掃描一次' + (TS.cGrade ? '；另有 ' + TS.cGrade + ' 個訊號被團隊判斷為不值得做。' : '。') + '</div>') + '<div class="sub" style="margin-top:8px">右邊是團隊依照回測和自己的實戰紀錄，預估這筆平均能賺幾 R。大於 +0.10R 才會做。</div></section>' +
    '<section><h3>團隊筆記</h3>' + (J.length ? '<div class="list">' + journalRows(TS.journal) + '</div>' : '<div class="empty">還沒有紀錄。團隊每做一筆，就會在這裡寫下為什麼做、結果對還是錯，以及學到什麼。</div>') + '</section>' +
    '<section><h3>團隊守則</h3>' + (avoid.length || prefer.length ? (avoid.length ? '<h4 class="rh">避開</h4><div class="list">' + ruleRows(avoid) + '</div>' : '') + (prefer.length ? '<h4 class="rh">偏好</h4><div class="list">' + ruleRows(prefer) + '</div>' : '') : '<div class="empty">' + (TS.kb ? '目前沒有明顯該避開或偏好的情況。' : '時光機讀完資料後會先從歷史訂出守則，之後每做一筆就修正一次。') + '</div>') + '<div class="sub" style="margin-top:8px">守則從回測和團隊自己的實戰紀錄算出來，實戰的一筆算三份樣本。至少 15 份樣本才會訂守則。</div></section>' +
    '<section><h3>時光機　前 ' + S.coins.length + ' 大幣、過去 14 天</h3>' + (keys.length ? '<div class="list">' + keys.map(keyRow).join('') + '</div><div class="sub" style="margin-top:8px">每種訊號都照同一套規則回測：停損 1R，賺 1R 移到打平，賺 1.5R 後停損跟著最近 6 根移動，停利上限 4R，最多抱 4 小時，已扣手續費。</div>' : '<div class="empty">' + (TS.loading ? '讀取中　' + TS.loaded + ' / ' + TS.total : '等行情連上後開始回測') + '</div>') + '</section>' +
    '<section><h3>風控長　只看你自己的單</h3><div class="list"><div class="row"><div class="row-main"><span>你今天的損益</span><b class="' + cls(rk.sum) + '">' + fPct(rk.sum) + '</b></div></div><div class="row"><div class="row-main"><span>單日虧損上限</span><b>' + (rk.lim * 100).toFixed(0) + '%</b></div></div><div class="row"><div class="row-main"><span>目前連賠</span><b>' + rk.streak + ' 筆</b></div></div></div><p class="say">' + esc(rk.verdict) + '</p></section>' +
    stressHTML() + coachHTML() + dataHTML() + compareHTML() + brainHTML +
    '<p class="say note2">團隊看 K 線、成交量、資金費率、未平倉量、恐懼貪婪指數、新聞和板塊強弱，也只能用你已經解鎖的功能（例如買跌要第 5 關過關）。它學的是「哪些情況比較容易成功」，不是預測未來；筆數少的時候，結果大多是運氣。</p></div>';
}
function sigSheet(s) {
  const res = TS.results && TS.results[s.type + ':' + s.side];
  const rp = s.replay;
  const p = s.plan;
  const pct = (x) => (x * 100).toFixed(0) + '%';
  const can = s.side === 'long' || E.canShort(state);
  const parts = s.dec && s.dec.parts ? s.dec.parts : [];
  const bc = brainCheck(s);
  const con = bc.con || [];
  const naL = Object.keys(s.f || {}).filter((k) => s.f[k] === 'na' && L.FEATS[k]).map((k) => L.FEATS[k].na);
  const conHTML = '<h3 style="margin-top:20px">反方審查</h3>' + (bc.block ? '<p class="say down" style="margin-top:4px">' + esc(bc.block) + '</p>' : '') + (con.length ? '<div class="calc">' + con.map((x, i) => '<div><span>反對理由 ' + (i + 1) + '</span><b>' + esc(x) + '</b></div>').join('') + '</div>' : bc.block ? '' : '<p class="say" style="margin-top:4px">沒找到明顯的反對理由。</p>') + '<p class="say">3 個以上反對理由團隊就不做。這筆會失效的情況：價格碰到停損 ' + fP(s.plan.stop) + '，或進場理由裡有兩項翻轉。</p>';
  const fawHTML = '<h3 style="margin-top:20px">事實・假設・待驗證</h3><div class="calc"><div><span>已知事實</span><b>' + esc(fT(s.barT + 5 * 60000)) + ' 收盤 ' + fP(s.plan.entry) + (res ? '；過去 14 天同樣訊號 ' + res.st.n + ' 次' : '') + '</b></div><div><span>假設</span><b>停損 1R、停利上限 4R、手續費每邊 0.1%、沒算滑價；重播用過去的波動</b></div><div><span>待驗證</span><b>' + esc([res && res.oos ? '樣本外：' + trustTxt(res) : '', naL.length ? '缺資料：' + naL.join('、') : '', '結果出來後寫進團隊筆記'].filter(Boolean).join('；')) + '</b></div></div>';
  openSheet('sig', '<div class="sub">' + esc(s.sym) + '　' + fT(s.barT + 5 * 60000) + ' 的 5 分 K 收盤</div><h2>' + esc(s.sym) + ' ' + SIDE[s.side] + '　' + Team.TYPES[s.type].name + (s.grade ? '<span class="grade g' + s.grade + '">' + s.grade + '</span>' : '') + '</h2><p class="say">' + esc(Team.TYPES[s.type].desc) + '。</p>' +
    '<h3 style="margin-top:20px">團隊判斷：' + (s.dec && s.dec.go ? '<span class="up">做</span>' : '<span class="down">不做</span>') + '</h3><p class="say" style="margin-top:4px">' + esc(s.dec ? s.dec.why : '') + '</p>' +
    (parts.length ? '<div class="calc">' + parts.map((x) => '<div><span>' + L.FEATS[x.fk][x.val] + '<small class="pn">　' + Math.round(x.n) + ' 份樣本' + (x.live ? '・實戰 ' + x.live : '') + '</small></span><b class="' + cls(x.est) + '">' + L.fmtR(x.est) + '</b></div>').join('') + '</div>' : '') +
    conHTML + fawHTML + '<h3 style="margin-top:20px">出場計畫</h3><div class="calc"><div><span>進場</span><b>' + fP(p.entry) + '</b></div><div><span>停損（1R）</span><b class="down">' + fP(p.stop) + '　' + fPct((p.stop - p.entry) / p.entry) + '</b></div><div><span>停利上限（4R）</span><b class="up">' + fP(p.target) + '　' + fPct((p.target - p.entry) / p.entry) + '</b></div><div><span>移動停損</span><b>賺 1R 移到打平，賺 1.5R 後跟著最近 6 根' + (s.side === 'long' ? '低點' : '高點') + '</b></div><div><span>最長持有</span><b>4 小時</b></div></div>' +
    (rp ? '<h3 style="margin-top:20px">時光機：重播一萬次</h3><div class="odds"><div style="width:' + pct(rp.pTarget) + '" class="o-up"></div><div style="width:' + pct(rp.pNone) + '" class="o-mid"></div><div style="width:' + pct(rp.pStop) + '" class="o-down"></div></div><div class="calc"><div><span>碰到停利上限</span><b class="up">' + pct(rp.pTarget) + '</b></div><div><span>停損或移動停損出場</span><b class="down">' + pct(rp.pStop) + '</b></div><div><span>4 小時內都沒到</span><b>' + pct(rp.pNone) + '</b></div><div><span>平均結果（已扣手續費）</span><b class="' + cls(rp.avgR) + '">' + fR(rp.avgR) + '</b></div></div>' : '') +
    (res ? '<h3 style="margin-top:20px">過去 14 天同樣的訊號</h3><div class="calc"><div><span>出現次數</span><b>' + res.st.n + ' 次</b></div><div><span>勝率</span><b>' + (res.st.n ? Math.round(res.st.wr * 100) + '%' : '—') + '</b></div><div><span>平均每次</span><b class="' + cls(res.st.avgR) + '">' + (res.st.n ? fR(res.st.avgR) : '—') + '</b></div></div>' : '') +
    '<p class="say" style="margin-top:14px">這是模擬，不是預測。「我自己照計畫做」由你管這筆單；「交給團隊做」由團隊管出場，並寫進團隊筆記。</p>' +
    '<div class="cta">' + (can ? '<button class="btn" data-act="usePlan" data-id="' + esc(s.id) + '">我自己照計畫做</button><button class="btn solid" data-act="giveSig" data-id="' + esc(s.id) + '">交給團隊做</button>' : '<button class="btn quiet" data-act="x">關閉</button><button class="btn" disabled>買跌第 5 關解鎖</button>') + '</div>');
}
function keySheet(res) {
  const st = res.st, mc = res.mc;
  const syms = Object.keys(res.per).filter((s) => res.per[s] > 0).sort((a, b) => res.per[b] - res.per[a]);
  openSheet('info', '<h2>' + Team.TYPES[res.type].name + ' ' + SIDE[res.side] + '<span class="grade g' + res.grade + '">' + res.grade + '</span></h2><p class="say">' + esc(Team.TYPES[res.type].desc) + '。</p>' +
    '<div class="calc"><div><span>過去 14 天出現</span><b>' + st.n + ' 次</b></div><div><span>勝率</span><b>' + (st.n ? Math.round(st.wr * 100) + '%' : '—') + '</b></div><div><span>平均每次</span><b class="' + cls(st.avgR) + '">' + (st.n ? fR(st.avgR) : '—') + '</b></div><div><span>最慘連賠</span><b>' + st.maxLoss + ' 次</b></div>' +
    '<div><span>獲利因子（賺的 R ÷ 賠的 R）</span><b>' + (st.pf == null ? '—' : st.pf === Infinity ? '沒賠過' : st.pf.toFixed(2)) + '</b></div>' +
    (res.dd != null ? '<div><span>照時間順序做的最大回撤</span><b class="down">' + fR(-res.dd) + '</b></div>' : '') +
    (res.ins ? '<div><span>前 70% 時間（樣本內）</span><b class="' + cls(res.ins.avgR) + '">' + (res.ins.n ? fR(res.ins.avgR) + '　' + res.ins.n + ' 次' : '—') + '</b></div><div><span>最近 30% 時間（樣本外）</span><b class="' + cls(res.oos.avgR) + '">' + (res.oos.n ? fR(res.oos.avgR) + '　' + res.oos.n + ' 次' : '—') + '</b></div><div><span style="white-space:nowrap">可信度</span><b class="' + (res.ovf ? 'down' : '') + '">' + esc(trustTxt(res)) + '</b></div>' : '') +
    (mc ? '<div><span>照做 50 次：中間情況</span><b class="' + cls(mc.p50) + '">' + fR(mc.p50) + '</b></div><div><span>最差 5% / 最好 5%</span><b>' + fR(mc.p5) + ' / ' + fR(mc.p95) + '</b></div><div><span>50 次後還是賠錢的機率</span><b>' + Math.round((1 - mc.pWin) * 100) + '%</b></div><div><span>過程中一般會先回落</span><b>' + fR(-mc.ddMed) + '</b></div>' : '') + '</div>' +
    (syms.length ? '<p class="say" style="margin-top:14px">出現最多的幣：' + syms.slice(0, 5).map((s) => esc(s) + ' ' + res.per[s] + ' 次').join('、') + '</p>' : '') +
    '<p class="say">評級標準（只用回測，團隊實際下單看的是「團隊預估」）：A 級要出現 20 次以上、平均至少 +0.15R、做 50 次後賺錢的機率八成以上；B 級要 12 次以上、平均至少 +0.05R、機率六成五以上。其他都是 C 級，不列入訊號。另外會把 14 天切成前 70% 和最近 30%：前面賺、最近反而賠（而且最近至少 5 次）就當作可能過度擬合，直接降成 C 級。前視偏誤：每次判斷只用當根收盤以前的資料，進場價用收盤價；已扣手續費，沒算滑價。</p>' +
    '<div class="cta"><button class="btn solid" data-act="x">知道了</button></div>');
}
function teamAct(act, id) {
  if (act === 'sig') { const s = TS.signals.find((x) => x.id === id); if (s) sigSheet(s); return true; }
  if (act === 'tkey') { const r = TS.results && TS.results[id]; if (r) keySheet(r); return true; }
  if (act === 'usePlan' || act === 'giveSig') {
    const s = TS.signals.find((x) => x.id === id);
    if (!s) return true;
    if (S.sheetKind) { S.sheetKind = null; $('#sheet').hidden = true; }
    if (act === 'giveSig') {
      if (teamTrade(s, 'deleg')) { toast('已交給團隊：' + SIDE[s.side] + ' ' + s.sym); state.settings.interval = '5m'; switchSym(s.sym); }
      else toast(teamPos().some((p) => p.sym === s.sym) ? '團隊已經有一筆 ' + s.sym + ' 在手上' : '價格已經離開計畫範圍，這個訊號不適合再進場');
      return true;
    }
    if (state.settings.sym !== s.sym || state.settings.interval !== '5m') { state.settings.interval = '5m'; switchSym(s.sym); }
    else go('trade');
    tradeBuy(s.side, false, s);
    return true;
  }
  if (act === 'tauto') { if (state.settings.teamPct <= 0) { toast('先把團隊額度設成大於 0%'); return true; } TS.auto = !TS.auto; saveTeam(); refreshTeam(); toast(TS.auto ? '團隊會用額度自己交易 A、B 級訊號' : '團隊只找訊號，不會自己交易'); return true; }
  if (act === 'tpct') { const v = parseFloat(id); if ([0, 0.1, 0.25, 0.5, 1].includes(v)) { state.settings.teamPct = v; save(); refreshTeam(); toast(v ? '團隊額度：總資產的 ' + v * 100 + '%' : '團隊額度 0%：團隊只找訊號'); } return true; }
  if (act === 'takeover') { const p = state.positions.find((x) => x.id === parseFloat(id)); if (p) { p.owner = 'me'; delete p.until; p.src = null; save(); toast('這筆改由你管，停損停利線可以自己拖'); if (S.sheetKind === 'book') renderBook(true); refreshTeam(); if (S.view === 'trade') render(); } return true; }
  if (act === 'tresume') { TS.halt = false; TS.resumeAt = Date.now(); teamLog('你恢復了團隊交易，回落從現在重新計算'); saveTeam(); toast('團隊恢復交易'); refreshTeam(); return true; }
  if (act === 'dcancel') { TS.delegs = TS.delegs.filter((d) => d.id !== id); teamLog('取消委託'); saveTeam(); toast('委託已取消'); if (S.sheetKind === 'book') renderBook(true); refreshTeam(); if (S.view === 'trade') render(); return true; }
  if (act === 'judge') { state.settings.judge = id === 'team' ? 'team' : 'me'; save(); renderBar(); toast(id === 'team' ? '交給團隊：按「請團隊判斷」由團隊決定漲跌' : '自己判斷：按了馬上成交'); return true; }
  if (act === 'tare') { delete TA.cache[state.settings.sym]; refreshTeam(); return true; }
  if (act === 'coachUse') { const now = Date.now(); TS.coach = { rules: coachRun().picks.map((k) => ({ k, t: now })) }; saveTeam(); refreshTeam(); toast('已採用 3 條規則，之後每筆都會檢查'); return true; }
  if (act === 'coachNew') { TS.coach = { rules: [] }; saveTeam(); refreshTeam(); return true; }
  if (act === 'sview') { if (['all', 'me', 'team'].includes(id)) { state.settings.statsView = id; save(); render(); } return true; }
  return false;
}
