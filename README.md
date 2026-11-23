# 搞錢

加密貨幣模擬交易：邊交易邊學習，加上自己的交易團隊（訊號、時光機、風控）。

網站：https://kennethhsu520.github.io/shidan/

## 檔案

純靜態網頁，不用建置。`index.html` 依序載入下面的檔案，全部共用同一個全域範圍，順序不能亂。

- `css/app.css`：全部樣式
- `js/core/`：不碰畫面的核心
  - `engine.js` 帳戶、下單、段位
  - `team-signals.js` 訊號偵測、出場計畫、回測
  - `team-learn.js` 團隊學習、守則、資金控制
  - `lessons.js` 課程與名詞解釋
- `js/app/`：交易畫面
  - `base.js` 常數、格式化、狀態
  - `sync.js` GitHub Gist 雲端同步
  - `market.js` 幣安行情、練習行情、幣種清單
  - `trading.js` 下單輔助
  - `pro.js` 下單設定、訂單簿、成交、指標、價格提醒、自選
  - `chart.js` 走勢圖
  - `trade-view.js` 交易頁
  - `pages.js` 學習、成績、彈窗、課程
  - `actions.js` 按鈕動作
- `js/team/`：交易團隊
  - `state.js` 團隊資料存取
  - `market-data.js` 大盤資料、新聞、數據日曆
  - `sectors-thesis.js` 板塊輪動、論點追蹤
  - `whale.js` 巨鯨觀察員（大單、爆倉、大戶多空比）
  - `shadow.js` 否決紀錄、影子單、團隊動態、冷場練習單
  - `risk.js` 週報、稽核、防守規則、反方審查
  - `replay.js` 離線補跑
  - `runtime.js` 掃描、下單、管單
  - `delegation.js` 請團隊判斷、委託
  - `panels.js`、`analysis.js`、`view.js` 團隊頁
- `js/main.js`：啟動
- `icons/`：網頁與主畫面圖示

## 雲端團隊

- `.github/workflows/team.yml`：每小時執行一次，用無頭瀏覽器打開這個網站，讓團隊用真實行情工作 50 分鐘，資料經由 Gist 同步
- `.github/workflows/keepalive.yml`：每月兩次重新啟用排程，避免 60 天沒更新被停用
- `tools/runner.mjs`：雲端執行程式；需要在 Settings → Secrets → Actions 新增 `GAOQIAN_TOKEN`（只要 Gists 讀寫權限）
- 手機打開網頁時會每分鐘留一次心跳，雲端團隊看到就暫停；手機離開約 2～3 分鐘後雲端接手

## 測試

`python3 tests/run_all.py`：引擎、手機與電腦版全部按鈕、下單、團隊、模擬即時行情、雲端同步，全部通過才上線。
