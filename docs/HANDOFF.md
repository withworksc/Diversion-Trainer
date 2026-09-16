# C8 Diversion Trainer — 交接文件

給接手的 Claude Code。這份文件說明專案的設計決策、領域資料的來源、檔案結構，以及
已知的缺口與下一步。原始版本（單一 HTML 檔、圖片內嵌 base64）已拆成多檔案，存在
`docs/HANDOFF-original.md`，不再更新。

---

## 1. 這是什麼

練習「diversion drill」的網頁工具：RCFN → RCKW 這條 C8 VFR 走廊的越野航線上，
考官會在半路臨時要求改降，學員要在很短時間內口頭答出八件事。按「出題」出一個情境，
在自己的板子上算；按「顯示答案」看模型答案，兩者對照看漏了什麼。**沒有判分**——這是
使用者刻意的選擇，工具只給答案，不判對錯。

八格答案固定，來自學校教的口訣：

1. Current time（現在時間）
2. Current position（現在位置）
3. Turn or Hold（轉向或待命）
4. Heading（航向）
5. Altitude（高度）
6. Time and distance（時間與距離）
7. Fuel required & remain（所需與剩餘油量）
8. Revise to ATC and Brief to IP（通報與提示）

出題同時開始計時，按「顯示答案」停表：3 分鐘內綠色、3–5 分鐘琥珀色、超過 5 分鐘紅色。

---

## 2. 領域資料 —— 重建成本最高的部分

這個工具的價值大半在航空資料，不是程式碼。好幾個數字是從航圖 PDF 上量出來的，
量出來之後還修正過原本錯誤的版本。改動前務必先讀這一節。

### 2.1 航圖georeference

底圖是 *VFR Chart – ICAO – Taipei FIR 1:500,000，20 Sep 2025* 的裁切。主圖（台灣本島
那張）用其圖廓經緯度標籤的位置做線性擬合，`tools/make_chart.py` 用 PyMuPDF 從 PDF
文字層抓出標籤座標，跑最小二乘法：

```
x_pt = -72920.278905 + 631.125227 · lon
y_pt =  16811.751311 - 627.537717 · Ymerc(lat)

Ymerc(lat) = (180/π) · ln( tan(π/4 + lat/2) )      # 球面, 度
```

殘差對全部 7 個經度標籤、8 個緯度標籤都在 0.12 pt 以內（4309 × 3033 pt 的圖上）。x、y
兩個尺度差 0.57%，圖有輕微的各向異性——不影響：底圖用四角對應（corner-fitting）貼上去，
這個誤差會被完全吸收（見 §5.3）。

裁切範圍：`lon 119.85–121.90`、`lat 21.75–24.30`，涵蓋北邊 RCYU 到南邊 RCLY、鵝鑾鼻，
留有餘裕。

**重新產生底圖**：換新的 AIRAC 週期時，把新的 PDF 放進專案資料夾（不要進 git，見
`.gitignore`），跑：

```bash
python3 tools/make_chart.py "新檔名.pdf" -o assets/
```

看它印出來的殘差；超過 1 pt 就表示圖廓版面變了，要檢查 `tools/make_chart.py` 的面板篩選
邏輯（`best_cluster`）還對不對。

### 2.2 VOR 台——一個重要更正

**HCN（恆春 VOR，113.7）不在恆春機場。** 它的羅盤玫瑰在鵝鑾鼻附近，量出來的中心是
**21.930 N / 120.840 E**，跟 RCKW（恆春機場）差約 **9 NM**。舊版工具曾經直接用機場座標，
整份文件裡每一個 HCN 的 radial/DME 都因此算錯過。已經用航圖底圖比對過，中心點壓在圖上
的羅盤玫瑰上（見專案交接時的驗證截圖）。

GID（綠島 VOR，116.9）在綠島機場，**22.673 N / 121.465 E**，同樣比對過。

VOR 選台規則（`js/scenario.js` 的 `makePos`）：位置在達仁以南（`fi<4.5`）用 HCN，以北用
GID，因為中央山脈會遮蔽北段收到 HCN。

### 2.3 磁差

圖上的等磁差線在恆春半島是 3.5°W，再往北是 4.0°W。工具固定用 **4°W**（`Data.VAR`），
UI 的說明文字裡有講。逐點內插會更準確，是合理的加強項目，但不是學校教的做法。

### 2.4 C8 鏈

九個沿海檢查點，南到北，存在 `js/data.js` 的 `CHAIN`（陸地座標）：

| key | 名稱 | lat | lon | 對應 VOR |
|---|---|---|---|---|
| ELB | 鵝鑾鼻 | 21.900 | 120.850 | HCN |
| JLS | 佳樂水 | 22.033 | 120.850 | HCN |
| JP | 九棚 | 22.100 | 120.883 | HCN |
| XH | 旭海 | 22.183 | 120.867 | HCN |
| DR | 達仁 | 22.275 | 120.867 | HCN |
| DW | 大武 | 22.350 | 120.892 | GID |
| JL | 金崙 | 22.533 | 120.967 | GID |
| TML | 太麻里 | 22.608 | 121.008 | GID |
| ZB | 知本 | 22.700 | 121.050 | GID |

`js/data.js` 載入時會把每個點往海側平移 `OFFSHORE`（1 NM），沿著鄰近兩點連線的法線、
順時針轉 90°，因為 C8 是貼著海岸線外側飛，不進陸地。南端鵝鑾鼻附近轉彎大，用鄰點做法
線也能轉得對。

出題位置是沿這條鏈的**連續**小數索引 `fi`（1.2 到 8.0），不吸附到檢查點，用最近的點加
距離描述：「大武外海」、「旭海南方 2 NM 外海」。

### 2.5 機場

數字取自航圖的資料方塊（`標高 - 跑道百公尺數`，`L` = 有燈）：

| ICAO | 圖上資料 | 標高 ft | 最長跑道 | 燈 | 空域 |
|---|---|---|---|---|---|
| RCFN 豐年 | `143 L H24` | 143 | 2,400 m | 有 | Taitung D GND-3000 |
| RCGI 綠島 | `28 - H9` | 28 | 900 m | **無** | Ludao E GND-2500 |
| RCLY 蘭嶼 | `44 - H11` | 44 | 1,100 m | **無** | Lanyu E GND-2500 |
| RCKW 恆春 | `46 - H17` | 46 | 1,700 m | **無** | Hengchun E GND-2500 |
| RCKH 高雄 | `31 L H32` | 31 | 3,200 m | 有 | Kaohsiung D GND-5000 |
| RCYU 花蓮 | `51 L H28` | 51 | 2,800 m | 有 | Hualien D GND-3000 |

三個無燈的場是**日間限定**。答案裡的燃油答案會提醒，但**還沒算日沒時間**，見 §7。

### 2.6 VFR 走廊（讀圖抄下來的）

| 走廊 | 路線 |
|---|---|
| C8 | RCFN ↔ 太麻里 ↔ 大武 ↔ 港仔鼻 ↔ 恆春（本題的越野航線） |
| C9 | 恆春 ↔ 楓港 ↔ 枋寮 ↔ 東港 ↔ RCKH（西岸） |
| C12 | RCFN 往北到 RCYU |
| C14 | RCFN ↔ RCGI |
| C16／C22 | 台東地區 ↔ RCLY —— 圖上兩條線，見 §7 未決問題 |
| C18 | RCKW ↔ RCLY |
| C20 | RCGI ↔ RCLY |

C8 走廊高度：南下 3,000 ft 或以下，北上 2,500 ft 或以下（使用者自己的筆記，非讀圖）。

### 2.7 飛機與油量模型

DA40-NG。油量規劃用 **6.6 gal/hr**、**30 分鐘保留油 = 3.3 gal**，跟使用者在 ICAO 飛行
計畫上用的 endurance 規則一致（加侖 ÷ 6.6）。改降當下的剩油產生範圍是標準油箱
17.5–23 gal（約 65% 的題目）、long range 油箱 25.5–32 gal。

---

## 3. 檔案結構

```
index.html          頁面骨架、選改降場、出題/顯示答案按鈕
css/style.css        樣式（單一亮色主題，見 §6）
js/geo.js            導航數學 + 顯示用 Mercator 投影（純函式，無其他依賴）
js/data.js            CHAIN／VOR／AD／WPT／走廊，載入時做離岸平移（依賴 geo.js）
js/scenario.js        出題:makePos／pickDest／makeScenario／crossesRidge（依賴 geo+data）
js/map.js             平面圖 SVG + 底圖定位（依賴 geo+data）
js/compute.js          答案模型:compute() 算數字，briefHTML/answers 組字串（依賴以上全部）
js/ui.js               render()、碼表、事件綁定 —— 唯一碰 DOM 的檔案
assets/chart-south.png 底圖裁切（外部檔案，不是 base64）
assets/chart-south.json 底圖的經緯度範圍 + 擬合殘差(供 tools/make_chart.py 參考,頁面本身不讀取)
tools/make_chart.py    重新產生底圖用(需要 pymupdf、pillow)
tests/*.test.js         自動化測試(node:test)
tests/report.js         抽樣出題表 + 統計,給人看合不合理
docs/HANDOFF.md         這份文件
docs/HANDOFF-original.md 從 Chat 交接過來的原始版本(封存,已移除校名)
package.json            只有 scripts,沒有 dependencies
```

**依賴方向**：`geo → data → scenario → map → compute → ui`。`js/compute.js` 依賴
`js/map.js`（`briefHTML()` 內嵌 `mapSVG()` 的輸出），其餘照這個順序在 `index.html` 用
`<script>` 依序載入。

**每個模組同一個 UMD 包法**（跟另一個專案 VOR / HSI Radial Trainer 的 `nav.js` 同一個
模式）：瀏覽器掛在 `window.C8.<模組名>`，Node 用 `require`。原因一樣——`file://` 下
ES modules 會被 CORS 擋掉，工具要能直接點兩下 `index.html` 開啟。

**底圖的 JSON 側車檔不在執行期被讀取。** `assets/chart-south.json` 只給
`tools/make_chart.py` 和人看，記錄裁切範圍、AIRAC 來源、擬合殘差。頁面裡的邊界常數是
寫死在 `js/map.js` 的 `CHART`（`lon0/lon1/lat0/lat1`），因為 `fetch()` 讀本機檔案在
`file://` 下一樣會被擋——跟不能用 ES modules 是同一個限制。**換底圖時兩邊的邊界要一起
改**，`npm run report` 不會幫你檢查這件事，肉眼對一下 `chart-south.json` 就好。

---

## 4. 領域邏輯的分工（改動前先想清楚放哪個檔案）

- **航路永遠是兩點直線**（`js/scenario.js` 的 `buildRoute`）：使用者明確要求這樣——
  練習的是計算，不是地形迴避。`js/compute.js` 的 `legs`／`legTable`／`r.multi` 都還在，
  多點航路的顯示邏輯留著沒拆，但目前 `r.multi` 恆為 `false`（`tests/compute.test.js`
  鎖住這件事）。真的要做多點迴避航路，這是要動的地方。
- **`crossesRidge()` 只加一句 MSA 提示，不影響航路**，故意的簡化。目前規則涵蓋
  C8 段本身會遇到的幾種情形（RCKH 全程跨山、RCFN/RCYU 在 `fi<3.6` 時跨山、RCKW 在
  `fi>4.7` 時跨山）。**驗證時發現**：對 RCYU 目的地、`fi` 在 4.5–8.0 之間（達仁以北）的
  直線，在成功（23.10°N）附近仍會偏進海岸山脈邊緣約 8–9 NM（不是中央山脈，海岸山脈
  高度較低），目前的規則沒有標記這個情形。這不影響任何測試（`crossesRidge` 的行為跟
  它自己的規則一致），但代表 RCYU 的 MSA 提示可能不夠完整——列進 §7 未決問題，需要飛行
  教官判斷海岸山脈這段是否需要額外提示。
- **答案字串（`briefHTML`／`legTable`／`answers`／`ITEMS`）都在 `js/compute.js`**，不在
  `js/ui.js`。這些是「模型答案的內容」，不是 DOM 操作——純字串組裝，`js/ui.js` 只負責
  把結果塞進 `innerHTML`。這樣測試可以直接呼叫 `Compute.answers(s,r)` 檢查文字內容，不
  需要開瀏覽器。

---

## 5. 平面圖繪製

在 `js/map.js`。跟 §3 提到的另一個專案（VOR / HSI Radial Trainer）同一個理由：

**底圖是獨立的 `<img>`，不是 SVG 內的 `<image>`。** 拉框繪出來的向量樹如果包含一張大
點陣圖，捲動時瀏覽器每一影格都要重新光柵化，畫面會撕裂。分開之後點陣圖只解碼一次，
`.mapwrap` 的 `contain:paint` 把重繪範圍鎖住。**不要把底圖搬回 SVG 裡。**

`makeProj()` 依情境的所有點（起點、改降場）算出視窗範圍，圖片用投影兩個對角座標、換算
成 SVG viewBox 的百分比來定位。因為投影在 `(lon, Ymerc)` 是線性的、航圖本身在同一組座標
下也是線性的，四角對應對任何內部點都是幾何上精確的——包括 §2.1 提到的 0.57% 各向異性。

疊圖內容：本機符號（指向 divert 前的原航向）、10 NM 距離環、到作用中 VOR 的虛線、
改降航路（洋紅實線）、改降場圓圈、北標、比例尺。沒有額外的地名標籤——航圖底下已經全部
標好了。

---

## 6. 主題

單一亮色主題，配色直接取自航圖本身，讓底圖不會顯得突兀：紙白、面板用航圖米色
`#F4F0E4`、海面藍 `#DCE9EF`，字用航圖墨綠 `#0E2732`，重點色是航圖藍 `#0F4C81`，答案的
關鍵數字用單一洋紅 `#C41E5A`。全部寫死在 `css/style.css` 的 `:root`，**沒有暗色模式**——
跟另一個 VOR 專案不同，這是設計上刻意只做一種主題，不是漏做。

---

## 7. 未決問題

不要用猜的，問使用者或教官。

1. **C16 vs C22**：航圖上台東地區到蘭嶼有兩條線。原始交接文件就沒確認過是哪一條對應
   RCFN 的越野航線，`js/data.js` 的 `CORRIDORS.C16`/`CORRIDORS.C22` 目前兩個都寫，含糊
   帶過。
2. **RCYU 的 MSA 提示可能不完整**：見 §4，`fi` 在達仁以北時直線可能切進海岸山脈邊緣，
   目前 `crossesRidge()` 沒標記。需要教官判斷海岸山脈那段高度夠不夠、要不要加提示。
3. **磁差**：固定 4°W，還是南段內插到 3.5°W？
4. **地速範圍**：目前 85–160 kt，5 kt 一階，前一版交接時使用者確認過合理。

---

## 8. 建議下一步

依對使用者的價值排序（沿用原始交接文件的排序和內容，重建成本高的判斷還是有效）：

1. **日沒檢查**：三個無燈場只能日間用。情境已經帶了當地時間，算日沒時間可以把「這個
   場日間限定」從備註變成真正的決斷點。22°N 的日沒是封閉式公式，不需要額外套件。
2. **作答紀錄**：每題的作答時間、改降場、距離，讓使用者看出有沒有變快。`localStorage`
   在 GitHub Pages 這種純靜態網站上就夠用。
3. **可列印的板夾練習單**：印刷樣式排出 N 題空白情境跟地圖，背面印答案。
4. **其他航路**：架構目前綁死 C8，但不深——新走廊需要新的 `CHAIN`、機場表，可能需要
   不同的底圖裁切。`js/data.js` 是要改的地方。

---

## 9. 測試

需要 Node 18 以上，不用 `npm install`（`pymupdf`/`Pillow` 只有重新產生底圖才需要，見
§2.1）。

```bash
npm test          # 53 項自動化測試：geo/data/scenario/compute 各一份
npm run report    # 抽樣題目 + 兩萬題統計，用飛行員的角度看合不合理
npm start         # 本機預覽 http://localhost:8766
```

`npm test` 涵蓋：
- `geo.js`：三角函式互為反函式、南北東西位移的距離與航向、`mag`／`fmt3` 的邊界（含航圖
  慣例的 360 而非 000）、Mercator 投影的方向性。
- `data.js`：VOR 座標不是舊版的錯誤座標、機場燈光表、離岸平移的距離與方向、VOR 選台
  切換點跟 `CHAIN` 自己標的欄位一致。
- `scenario.js`：`makePos` 的範圍與 VOR 選台、`pickDest` 的加權分布（2 萬題）、
  `crossesRidge` 的每一種規則、`makeScenario` 的欄位範圍（2 萬題）。
- `compute.js`：油量算式、ETA 進位（跨 60 分、跨午夜）、`r.multi` 恆為 false、HOLD/TURN
  切換、MSA 提示、日間限定警語、油量不足警告。

## 10. 部署

GitHub Pages，檔案放 repo 根目錄：

```
Settings → Pages → Source: Deploy from a branch
Branch: main / (root)
```

沒有 build、沒有 Actions。來源 PDF（23 MB，CAA 出版品）跟封存的原始單檔 prototype
（1.1 MB，含內嵌 base64）都在 `.gitignore` 裡，不會進 repo——只有 `assets/chart-south.png`
這張裁切過、量化過的圖會上去。

## 11. 改動時的檢查清單

- [ ] 改過 `js/geo.js`、`js/data.js`、`js/scenario.js`、`js/compute.js` → `npm test` 全過
- [ ] 改過出題範圍或油量模型 → 另外跑 `npm run report`，用飛行員的眼光看抽樣表
- [ ] 改過底圖（新 AIRAC）→ `tools/make_chart.py` 重新產生，`js/map.js` 的 `CHART` 邊界
      跟 `assets/chart-south.json` 的 `bounds` 要一致
- [ ] 導航與領域邏輯只在 `js/geo.js`／`js/data.js`／`js/scenario.js`／`js/compute.js`，
      `js/ui.js` 沒有自己算
- [ ] 仍無外部依賴、無 build，直接點開 `index.html` 可用（`file://` 下測一次）
