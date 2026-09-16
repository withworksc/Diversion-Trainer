# C8 Diversion Trainer

一個練習「diversion drill」的網頁工具，給飛越野航線 RCFN → RCKW（沿 C8 VFR 走廊）
的飛行學員使用。考官會在半路臨時要求改降，這個工具出情境、給模型答案，讓學員在自己
的板子上練習口頭作答的完整流程。

**不判分**——工具只給答案，不判對錯，這是刻意的設計。

## 練什麼

按「出題」的瞬間開始計時，題目給：現在時間、位置（VOR/DME）、高度、地速、剩油、改降場
與考官給的狀況。學員在自己的板子上依序算出八件事：

1. Current time — 現在時間
2. Current position — 現在位置
3. Turn or Hold — 轉向或待命
4. Heading — 航向
5. Altitude — 高度
6. Time and distance — 時間與距離
7. Fuel required & remain — 所需與剩餘油量
8. Revise to ATC and Brief to IP — 通報與提示

按「顯示答案」看模型答案並停表：3 分鐘內綠色、3–5 分鐘琥珀色，超過 5 分鐘紅色。答案旁
附一張根據當下位置畫出的平面圖（CAA VFR 航圖裁切 + 航路疊圖），方便對照。

「改降場」可以指定固定的改降場練習，或維持「依實際機率隨機」讓工具依機率抽。

## 怎麼用

直接用瀏覽器打開 `index.html`，不需要網路，也不用安裝任何東西。

或啟動本機預覽伺服器（需要 Python 3）：

```bash
npm start
```

然後開 http://localhost:8766

## 專案結構

```
index.html          頁面
css/style.css        樣式
js/geo.js             導航數學 + 顯示投影（純函式，可單獨測試）
js/data.js             航點、VOR、機場、走廊資料
js/scenario.js         出題邏輯
js/map.js              平面圖繪製
js/compute.js          答案模型
js/ui.js               畫面與碼表
assets/chart-south.png 底圖（CAA VFR 航圖裁切）
tools/make_chart.py    從新的 AIRAC PDF 重新產生底圖
tests/                 自動化測試 + 抽樣出題表
docs/HANDOFF.md         開發文件：設計決策、領域資料來源、已知限制與下一步
```

沒有框架、沒有 build step、沒有外部依賴。

## 測試

需要 Node 18 以上，不用安裝套件。

```bash
npm test          # 導航數學、領域資料、出題、答案模型的自動化測試
npm run report    # 抽樣出題表，檢查答案合不合理
```

## 部署

GitHub Pages：Settings → Pages → Source: Deploy from a branch → `main` / `(root)`。

## 資料來源與限制

底圖是民航局（MOTC）出版的 *VFR Chart – ICAO – Taipei FIR 1:500,000*（2025-09-20 生效）
裁切而來，僅供個人訓練練習使用。距離與航向由座標推算，不是從圖上量的，誤差約
1–2 NM／2–3°。**這是練習工具，不是飛行計畫工具**，任何數字都不應該用在實際飛行上。

目前的限制：直線航路（不做地形迴避）、磁差固定 4°W（不隨位置內插）、沒有日沒時間計算、
沒有作答紀錄。完整清單與後續規劃見 [docs/HANDOFF.md](docs/HANDOFF.md)。
