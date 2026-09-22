// 介面文字（中／英）。純資料 + 一個 t()，不碰 DOM、不依賴其他模組。
//
// 規則
// - **預設中文**（DEFAULT）。英文是 v2.2.1a 加的初版。
// - 整句一個 key，用 {變數} 代換；**不要把句子拆成片段再拼**，英文拼出來會很怪。
// - 航空術語、機場代碼、G1000 上的字（TH、DME、BKN008、ENG TEMP…）兩種語言都維持原樣。
// - 地名、機場名、機場備註不在這裡，是資料，放 js/data.js 的 en 欄位。
(function(root, factory){
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.C8 = root.C8 || {}; root.C8.i18n = m; }
})(this, function(){
'use strict';

var LANGS = ['zh','en'], DEFAULT = 'zh';

var STR = {
zh: {
  'ui.sub':'RCFN ⇄ RCKW · 底圖：CAA VFR Chart ICAO Taipei FIR 1:500,000 (20 Sep 2025)',
  'ui.clock':'計時',
  'ui.next':'出題',
  'ui.reveal':'顯示答案',
  'ui.destLabel':'改降場',
  'ui.destAuto':'依實際機率隨機',
  'ui.attToggle':'姿態訓練（prototype）',
  'ui.attHint1':'接搖桿請用 Chrome、Edge、Brave 等 Chromium 核心瀏覽器；',
  'ui.attHint2':'Safari 讀不到飛行搖桿。',
  'ui.chart':'CHART',
  'ui.attTitle':'姿態訓練',
  'ui.turb':'亂流',
  'ui.turbEasy':'易',
  'ui.turbMedium':'中',
  'ui.turbHard':'難',
  'ui.aiNoteIdle':'出題後開始亂流。',
  'ui.mapIdle':'出題後顯示改降航路',
  'ui.tip':'這個工具只給答案，不判對錯。距離與航向由圖上座標推算，誤差約 1–2 NM / 2–3°，正式作業請以航圖實量為準。',
  'ui.padNone':'未偵測到搖桿——請先按一下搖桿上的任一按鈕（瀏覽器要按過按鈕才會把搖桿交出來）。也可以先用方向鍵：↑↓ 控 pitch、←→ 控坡度。',
  'ui.padSafari':'你現在用的是 Safari，讀不到飛行搖桿——請改用 Chrome、Edge 或 Brave。暫時可以用方向鍵：↑↓ 控 pitch、←→ 控坡度。',
  'ui.padFound':'搖桿：{id}  （{n} 軸）\n{axes}　　目前用 ax1 控 pitch、ax0 控坡度',

  'brief.time':'時間',
  'brief.pos':'位置',
  'brief.alt':'高度',
  'brief.gs':'地速',
  'brief.fuel':'剩油',
  'brief.dest':'改降',
  'brief.sitLabel':'考官給的狀況',
  'brief.blankSit':'按「出題」開始。題目出現的同時開始計時。',
  'brief.blankPos':'達仁外海',
  'brief.tankLR':'Long Range tank',
  'brief.tankStd':'Standard tank',

  'dir.S':'南下',
  'dir.N':'北上',

  'item.1':'現在時間',   'item.2':'現在位置', 'item.3':'轉向或待命',   'item.4':'航向',
  'item.5':'高度',       'item.6':'時間與距離','item.7':'所需與剩餘油量','item.8':'通報與提示',

  'a1.note':'這是 ETE 的起算點，記在板子上。所有後面的 ETA、油量都從這個時間往前推。',
  'a2.note':'目視對照：{pos}，高度 {alt} ft。',
  'a2.gid':'這一段用 GID，因為中央山脈會遮蔽 HCN。',
  'a2.hcn':'大武以南 HCN 收得到，用 HCN 比較直觀。',
  'a3.holdNote':'狀況是暫時性的、有明確恢復時間，油量也夠。在現在位置或指定點待命比立刻飛 {nm} NM 到別的場合理。待命時要報 ATC、設定 holding 高度、算出「最晚決斷時間」——也就是油量剩到只夠飛改降場加保留油的那一刻。',
  'a3.turnNote':'先用大概的方向把機頭轉出去，再低頭精算。不要停在原航向上算完才轉——這是考官最常抓的點。初始概略轉向 {hdg}°。',
  'a4.first':'（第一段：{from} → {to}）',
  'a4.note':'圖上量到的真航跡 TT {tt}°，沒有算風差，所以 TH 就是這個值。要磁航向的話：TT ＋ VAR {var}°W ＝ MH {mh}°。',
  'a5.alt2500':'2,500 ft 或以下',
  'a5.alt3000':'3,000 ft 或以下',
  'a5.altIsland':'3,000–3,500 ft，進場前降至 2,500 以下',
  'a5.altPoint':'2,500 ft 或以下，沿 {corr} 走廊',
  'a5.altMin':'{alt} ft 以上',
  'a5.airspace':'目的地空域 {air}。',
  'a5.ridge':'直線通過中央山脈南段，圖上該帶最高標高 5,538 ft（大漢山）。練習飛直線，但 MSA 要一起報出來。',
  'a5.ridgeCape':'直線會切過恆春半島南端的丘陵地。練習飛直線，但 MSA 要一起報出來（標高請在圖上確認）。',
  'a6.legs':'分段計算，GS {gs} kt：',
  'a7.note':'以 6.6 gal/hr × {min} min 計。現有 {fuel} gal（{tank}），約可續航 {h} 小時 {m} 分。',
  'a7.ok':'落地剩的油還在 30 分鐘保留油（{res} gal）之上，油量不是限制因素。',
  'a7.low':'落地剩的油低於 30 分鐘保留油（{res} gal）——這個改降場不可接受，要換一個或宣告狀況。',
  'a7.noLight':'{ad} 無跑道燈（圖上標示 {elev} - H{rwy}），日間限定。ETA {eta} 要和當天日沒時間對一次。',
  'a7.need':'需要',
  'a7.sep':'　',
  'a7.remain':'落地剩',
  'a7.remainArr':'到達時剩',
  'a7.okArr':'到達時剩的油還在 30 分鐘保留油（{res} gal）之上，油量不是限制因素。',
  'a7.lowArr':'到達時剩的油低於 30 分鐘保留油（{res} gal）——這個改降點不可接受，要換一個或宣告狀況。',
  'a8.big':'Revise and briefed',

  'leg.leg':'航段', 'leg.total':'合計',

  'alt.title':'另一組答案：先到恆春，再直飛高雄（地圖上的橘線）',
  'alt.turn':'走經恆春這組的話，初始概略轉向 {hdg}°。',
  'alt.hdg':'第一段：{from} → {to}（MH {mh}°）。',
  'alt.alt':'先回恆春，再直線切到高雄，不跨中央山脈。注意恆春到高雄這段直線會經過外海的 RCR34 限航區（SFC–14,000 ft），啟用時要靠岸沿 C9 繞開。',
  'map.aria':'本機位置與改降航路',
  'map.direct':'直飛',
  'map.alt':'經恆春',

  'trig.wx':'{ad} 場面 METAR 報 BKN008，低於目視最低條件。',
  'trig.instructor':'考官指示：立即改降。',
  'trig.coast':'前方沿岸雲底降低，繼續{dir}無法維持 VFR。',
  'trig.notam':'{ad} 臨時 NOTAM 場面關閉，時間未定。',
  'trig.runway':'{ad} 現在有跑道入侵處理中，預計 25 分鐘後恢復；燃油充足。',
  'trig.pax':'後座學員身體不適，要求儘速落地。',

  'pos.on':'{ref}外海',
  'pos.off':'{ref}{side}方{d} NM 外海',
  'side.N':'北', 'side.NE':'東北', 'side.E':'東', 'side.SE':'東南',
  'side.S':'南', 'side.SW':'西南', 'side.W':'西', 'side.NW':'西北'
},
en: {
  'ui.sub':'RCFN ⇄ RCKW · Base chart: CAA VFR Chart ICAO Taipei FIR 1:500,000 (20 Sep 2025)',
  'ui.clock':'Timer',
  'ui.next':'New question',
  'ui.reveal':'Show answers',
  'ui.destLabel':'Divert to',
  'ui.destAuto':'Random (weighted)',
  'ui.attToggle':'Attitude drill (prototype)',
  // 結尾留一個空格:這兩段在畫面上是相鄰的兩個 <span>(見 index.html),中文用全形分號
  // 不需要空格,英文需要。.att-hint span 是 nowrap,空格不會被吃掉。
  'ui.attHint1':'For a flight stick use a Chromium-based browser — Chrome, Edge or Brave; ',
  'ui.attHint2':'Safari cannot read flight sticks.',
  'ui.chart':'CHART',
  'ui.attTitle':'Attitude drill',
  'ui.turb':'Turbulence',
  'ui.turbEasy':'Low',
  'ui.turbMedium':'Med',
  'ui.turbHard':'High',
  'ui.aiNoteIdle':'Turbulence starts once a question is drawn.',
  'ui.mapIdle':'The diversion route appears once a question is drawn',
  'ui.tip':'This tool gives model answers only; it does not grade you. Distances and headings are derived from coordinates and are good to about 1–2 NM / 2–3°. For real operations, measure on the chart.',
  'ui.padNone':'No joystick detected — press any button on the stick first (browsers only release a gamepad after a button press). Meanwhile you can use the arrow keys: ↑↓ for pitch, ←→ for bank.',
  'ui.padSafari':'You are on Safari, which cannot read flight sticks — please use Chrome, Edge or Brave. Meanwhile you can use the arrow keys: ↑↓ for pitch, ←→ for bank.',
  'ui.padFound':'Stick: {id}  ({n} axes)\n{axes}    ax1 drives pitch, ax0 drives bank',

  'brief.time':'Time',
  'brief.pos':'Position',
  'brief.alt':'Altitude',
  'brief.gs':'Ground speed',
  'brief.fuel':'Fuel',
  'brief.dest':'Divert to',
  'brief.sitLabel':'Examiner’s situation',
  'brief.blankSit':'Press “New question” to start. The clock starts with the question.',
  'brief.blankPos':'off Daren',
  'brief.tankLR':'Long Range tank',
  'brief.tankStd':'Standard tank',

  'dir.S':'southbound',
  'dir.N':'northbound',

  'item.1':'Current time', 'item.2':'Current position', 'item.3':'Turn or Hold', 'item.4':'Heading',
  'item.5':'Altitude',     'item.6':'Time and distance','item.7':'Fuel required & remain',
  'item.8':'Revise to ATC & Brief to IP',

  'a1.note':'This is where the ETE starts. Write it on the kneeboard — every ETA and fuel figure below is worked forward from it.',
  'a2.note':'Visual reference: {pos}, altitude {alt} ft.',
  'a2.gid':'Use GID on this stretch: the Central Mountain Range shadows HCN.',
  'a2.hcn':'South of Dawu HCN is receivable, and it is the more intuitive station here.',
  'a3.holdNote':'The problem is temporary, has a stated recovery time, and fuel is adequate. Holding here or at a nominated point makes more sense than flying {nm} NM to another field right now. While holding: tell ATC, set a holding altitude, and work out the latest divert time — the moment fuel is down to what the diversion plus reserve needs.',
  'a3.turnNote':'Turn onto a rough heading first, then do the precise work head-down. Do not sit on the original heading until the sums are finished — that is what examiners catch most often. Initial rough turn: {hdg}°.',
  'a4.first':'(first leg: {from} → {to})',
  'a4.note':'True track measured off the chart is TT {tt}°. No wind correction is applied, so TH is the same figure. For a magnetic heading: TT + VAR {var}°W = MH {mh}°.',
  'a5.alt2500':'2,500 ft or below',
  'a5.alt3000':'3,000 ft or below',
  'a5.altIsland':'3,000–3,500 ft, descending below 2,500 before the approach',
  'a5.altPoint':'2,500 ft or below, along corridor {corr}',
  'a5.altMin':'{alt} ft or above',
  'a5.airspace':'Destination airspace {air}.',
  'a5.ridge':'The direct track crosses the southern Central Mountain Range; the highest spot elevation on that band is 5,538 ft (Dahanshan). Fly the straight line for practice, but state the MSA as well.',
  'a5.ridgeCape':'The direct track cuts across the hills at the southern end of the Hengchun peninsula. Fly the straight line for practice, but state the MSA as well (check the spot elevations on the chart).',
  'a6.legs':'By leg, GS {gs} kt:',
  'a7.note':'Based on 6.6 gal/hr × {min} min. On board {fuel} gal ({tank}), about {h} h {m} min of endurance.',
  'a7.ok':'Fuel on landing stays above the 30-minute reserve ({res} gal), so fuel is not the limiting factor.',
  'a7.low':'Fuel on landing falls below the 30-minute reserve ({res} gal) — this alternate is not acceptable; pick another one or declare.',
  'a7.noLight':'{ad} has no runway lighting (charted {elev} - H{rwy}), so it is daylight only. Check the ETA {eta} against sunset for the day.',
  'a7.need':'Required',
  'a7.sep':' · ',
  'a7.remain':'on landing',
  'a7.remainArr':'on arrival',
  'a7.okArr':'Fuel on arrival stays above the 30-minute reserve ({res} gal), so fuel is not the limiting factor.',
  'a7.lowArr':'Fuel on arrival falls below the 30-minute reserve ({res} gal) — this diversion point is not acceptable; pick another one or declare.',
  'a8.big':'Revise and briefed',

  'leg.leg':'Leg', 'leg.total':'Total',

  'alt.title':'Alternative: to Hengchun first, then direct to Kaohsiung (orange line on the map)',
  'alt.turn':'For the via-Hengchun option, initial rough turn {hdg}°.',
  'alt.hdg':'First leg: {from} → {to} (MH {mh}°).',
  'alt.alt':'Back to Hengchun first, then a straight line to Kaohsiung, which avoids the Central Range. Note that the straight leg from Hengchun to Kaohsiung passes through the offshore RCR34 restricted area (SFC-14,000 ft); when it is active, keep close to the coast along C9 to avoid it.',
  'map.aria':'Aircraft position and diversion route',
  'map.direct':'Direct',
  'map.alt':'Via Hengchun',

  'trig.wx':'{ad} is reporting BKN008, below VFR minima.',
  'trig.instructor':'Instructor directs an immediate diversion.',
  'trig.coast':'The cloud base is lowering along the coast ahead; VFR cannot be maintained {dir}.',
  'trig.notam':'{ad} is closed by a short-notice NOTAM, duration unknown.',
  'trig.runway':'{ad} has a runway incursion being worked, expected clear in 25 minutes; fuel is adequate.',
  'trig.pax':'The student in the back seat is unwell and asks to land as soon as possible.',

  'pos.on':'off {ref}',
  'pos.off':'{d} NM {side} of {ref}, offshore',
  'side.N':'north', 'side.NE':'northeast', 'side.E':'east', 'side.SE':'southeast',
  'side.S':'south', 'side.SW':'southwest', 'side.W':'west', 'side.NW':'northwest'
}
};

function langOf(lang){ return (STR[lang]) ? lang : DEFAULT; }

// t('en','a2.note',{pos:'…',alt:'2,500'})。缺 key 時退回中文,再退回 key 本身——
// 畫面寧可出現一句沒翻到的中文,也不要變成空白或炸掉。
function t(lang,key,vars){
  var s = STR[langOf(lang)][key];
  if(s==null) s = STR[DEFAULT][key];
  if(s==null) return key;
  if(vars) s = s.replace(/\{(\w+)\}/g, function(m,k){ return (vars[k]==null) ? m : vars[k]; });
  return s;
}

return {LANGS:LANGS, DEFAULT:DEFAULT, STR:STR, t:t, langOf:langOf};
});
