# C8 Diversion Trainer

一個練習「diversion drill」的網頁工具，給飛越野航線 RCFN ⇄ RCKW（沿 C8 VFR 走廊，南下、北上都有）
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

「改降場」可以指定固定的改降場練習，或維持「依實際機率隨機」讓工具依機率抽。除了機場，
也會出改降到目視報告點的題目：池上（C12 縱谷）、成功與長虹橋（C6 海岸），約佔四分之一；
另外約 8% 是「恆春西邊外海直接改降港仔鼻」，直線越過半島上空的限航區，高度要 4,000 ft 以上。隨機不會抽到
回航場（南下回 RCFN、北上回 RCKW），要練可以在選單指定。

題目一半南下（RCFN → RCKW，起始高度 3,000 ft）、一半北上（RCKW → RCFN，2,500 ft），
起始點大多在東岸（知本、達仁、港仔鼻一帶），約兩成在南端的鵝鑾鼻、南灣、貓鼻頭外海。

## 語言

介面預設中文，控制列上可以切換成英文（EN）。切換立刻生效、不用重新出題，下次打開會記得
上次的選擇。航空術語、機場代碼、G1000 上的字兩種語言都維持原樣。

## 怎麼用

直接用瀏覽器打開 `index.html`，不需要網路，也不用安裝任何東西。

或啟動本機預覽伺服器（需要 Python 3）：

```bash
npm start
```

然後開 http://localhost:8766

## 姿態訓練（prototype）

改降時學員是低頭算板子，但飛機還在飛。按「姿態訓練（prototype）」打開一個 G1000 風格的
姿態儀、高度帶與 VSI：出題後開始有亂流，要一邊算、一邊用搖桿守住姿態與 3000 ft 的高度。
壓坡度不帶桿，機頭會下沉、高度會掉。只在電腦／平板顯示。

- **接飛行搖桿請用 Chrome、Edge、Brave 等 Chromium 核心的瀏覽器。Safari 讀不到飛行搖桿**
  （iPad 上的瀏覽器底層都是 Safari 的引擎，很可能也讀不到）。
- 瀏覽器要**先按一下搖桿上的任一按鈕**才會偵測到搖桿。
- 沒有搖桿可以用方向鍵：↑↓ 控 pitch、←→ 控坡度。
- 面板右上角可以選亂流大小：易／中／難（預設「中」），會記住上次的選擇。
- 搖桿沒反應時，打開 `tools/gamepad-test.html` 看瀏覽器有沒有抓到裝置。

## 專案結構

```
index.html          頁面
css/style.css        樣式
js/i18n.js            介面字串（中／英）
js/geo.js             導航數學 + 顯示投影（純函式，可單獨測試）
js/data.js             航點、VOR、機場、走廊資料
js/scenario.js         出題邏輯
js/map.js              平面圖繪製
js/compute.js          答案模型
js/attitude.js         姿態訓練：姿態／高度模擬與 G1000 風格畫面
js/ui.js               畫面、碼表、搖桿輸入
assets/chart-south.png 底圖（CAA VFR 航圖裁切）
tools/make_chart.py    從新的 AIRAC PDF 重新產生底圖
tools/gamepad-test.html 搖桿偵測測試頁
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

航向答案報真航向（TH，不算風差）；磁航向附在說明裡。

目前的限制：直線航路（不做地形迴避）、磁差固定 4°W（不隨位置內插）、沒有日沒時間計算、
沒有作答紀錄。完整清單與後續規劃見 [docs/HANDOFF.md](docs/HANDOFF.md)。
