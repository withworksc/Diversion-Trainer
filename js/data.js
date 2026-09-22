// 領域資料：常數、C8 檢查點鏈、航點、VOR、機場。純資料 + 一次性的離岸平移，不碰 DOM。
// 每個數字的來源見 docs/HANDOFF.md 第 2 節；改動前先讀那份文件。
(function(root, factory){
  var deps = (typeof module === 'object' && module.exports) ? require('./geo.js') : root.C8.geo;
  var m = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.C8 = root.C8 || {}; root.C8.data = m; }
})(this, function(Geo){
'use strict';

var VAR = 4;             // 圖上南部等磁差線介於 3.5°W 與 4°W 之間，取 4°W（一律，不做內插）
var BURN = 6.6;          // gal/hr，DA40-NG
var RESERVE = 3.3;       // 30 分鐘保留油

/* ---------- C8 東海岸段檢查點，南→北（陸地座標，載入時會離岸平移）---------- */
var CHAIN = [
  {k:'ELB', n:'鵝鑾鼻', lat:21.900, lon:120.850, en:'Eluanbi', vor:'HCN'},
  {k:'JLS', n:'佳樂水', lat:22.033, lon:120.850, en:'Jialeshuei', vor:'HCN'},
  {k:'JP',  n:'九棚',   lat:22.100, lon:120.883, en:'Jioupeng', vor:'HCN'},
  {k:'XH',  n:'旭海',   lat:22.183, lon:120.867, en:'Syuhai', vor:'HCN'},
  {k:'DR',  n:'達仁',   lat:22.275, lon:120.867, en:'Daren', vor:'HCN'},
  {k:'DW',  n:'大武',   lat:22.350, lon:120.892, en:'Dawu', vor:'GID'},
  {k:'JL',  n:'金崙',   lat:22.533, lon:120.967, en:'Jinlun', vor:'GID'},
  {k:'TML', n:'太麻里', lat:22.608, lon:121.008, en:'Taimali', vor:'GID'},
  {k:'ZB',  n:'知本',   lat:22.700, lon:121.050, en:'Jhihben', vor:'GID'}
];

/* ---------- 南端(v2.2):貓鼻頭 → 南灣 → 鵝鑾鼻南方,西→東,接在 CHAIN[0] 前面 ----------
   讓起始點可以落在貓鼻頭、鵝鑾鼻外海。出題器把它當成 CHAIN 的負索引(-1 = 鵝鑾鼻南方、
   -3 = 貓鼻頭),不併進 CHAIN:CHAIN 的索引(fi)在 VOR 切換、MSA 規則、測試都有用到,
   插在前面會整串位移。這幾個點直接給海上的座標,不像 CHAIN 載入時才離岸平移——南岸轉彎
   太急,用鄰點法線平移會切過鵝鑾鼻的岬角。座標是對著航圖底圖目視擺的,見 docs/HANDOFF.md。 */
var CAPE = [
  {k:'MBT',  n:'貓鼻頭', lat:21.905, lon:120.715, en:'Maobitou', vor:'HCN'},
  {k:'NW',   n:'南灣',   lat:21.925, lon:120.775, en:'Nanwan', vor:'HCN'},
  {k:'ELBS', n:'鵝鑾鼻', lat:21.878, lon:120.845, en:'Eluanbi', vor:'HCN'}
];

var WPT = {
  FL:{n:'枋寮', lat:22.363, lon:120.593},
  DG:{n:'東港', lat:22.467, lon:120.450},
  CG:{n:'成功', lat:23.100, lon:121.375},
  CB:{n:'長濱', lat:23.320, lon:121.462},
  FB:{n:'豐濱', lat:23.600, lon:121.517}
};

var VOR = {
  HCN:{n:'HENGCHUN', f:'113.7', lat:21.930, lon:120.840},
  GID:{n:'LUDAO',    f:'116.9', lat:22.673, lon:121.465}
};

var AD = {
  RCFN:{n:'RCFN 豐年', nEn:'RCFN Fongnian', lat:22.755, lon:121.103, elev:143, rwy:'2,400 m', lit:true,
        air:'Taitung D GND-3000', fis:'台東近場 119.5',
        note:'北上維持 2,500 ft 以下，同時在 TAITUNG 軍訓空域 3,500 底高之下。注意 HUATUNG A/B 超輕型航路。',
        noteEn:'Northbound stay at or below 2,500 ft, which also keeps you under the 3,500 ft base of the TAITUNG military training area. Watch for the HUATUNG A/B microlight routes.', fisEn:'Taitung Approach 119.5'},
  RCGI:{n:'RCGI 綠島', nEn:'RCGI Ludao', lat:22.673, lon:121.465, elev:28, rwy:'900 m', lit:false,
        air:'Ludao E GND-2500', fis:'台東近場 119.5',
        note:'全程越海（對應走廊 C14）。建議爬到 3,000–3,500 ft 延伸滑翔與通信距離，進場前降至 2,500 以下進入 Ludao E。',
        noteEn:'Entirely over water (corridor C14). Climb to 3,000-3,500 ft for glide range and radio coverage, then descend below 2,500 ft before entering Ludao E on the approach.', fisEn:'Taitung Approach 119.5'},
  RCLY:{n:'RCLY 蘭嶼', nEn:'RCLY Lanyu', lat:22.040, lon:121.535, elev:44, rwy:'1,100 m', lit:false,
        air:'Lanyu E GND-2500', fis:'台東近場 119.5',
        note:'全程越海、無備降（對應走廊 C16／C22，南端為 C18）。爬高有利滑翔與通信；注意 NANWAN 限航區 13,000/3,000。',
        noteEn:'Entirely over water with no alternate (corridors C16/C22, C18 at the south end). Height helps glide range and radio coverage. Note the NANWAN restricted area, 13,000/3,000.', fisEn:'Taitung Approach 119.5'},
  RCKW:{n:'RCKW 恆春', nEn:'RCKW Hengchun', lat:22.041, lon:120.730, elev:46, rwy:'1,700 m', lit:false,
        air:'Hengchun E GND-2500', fis:'高雄近場 119.5',
        note:'南下 3,000 ft 以下，進場前降入 Hengchun E。注意 HENGCHUN A/B 超輕型空域 2,500。',
        noteEn:'Southbound stay at or below 3,000 ft and descend into Hengchun E before the approach. Note the HENGCHUN A/B microlight areas up to 2,500 ft.', fisEn:'Kaohsiung Approach 119.5'},
  RCKH:{n:'RCKH 高雄', nEn:'RCKH Kaohsiung', lat:22.578, lon:120.348, elev:31, rwy:'3,200 m', lit:true,
        air:'Kaohsiung D GND-5000', fis:'高雄近場 119.5',
        note:'直線跨越中央山脈，高度要能過地障。落地前依序經過 Pingtung D GND-3000 與 Kaohsiung D GND-5000，進入前須取得許可。',
        noteEn:'The direct track crosses the Central Mountain Range, so the altitude has to clear terrain. Inbound you pass Pingtung D GND-3000 and then Kaohsiung D GND-5000; clearance is required before entering.', fisEn:'Kaohsiung Approach 119.5'},
  RCYU:{n:'RCYU 花蓮', nEn:'RCYU Hualien', lat:24.023, lon:121.618, elev:51, rwy:'2,800 m', lit:true,
        air:'Hualien D GND-3000', fis:'花蓮近場 119.5',
        note:'沿東海岸北上（對應走廊 C12）。距離長，油量與日照是主要限制，不是航向問題。',
        noteEn:'North along the east coast (corridor C12). It is a long leg - fuel and daylight are the limits here, not the heading.', fisEn:'Hualien Approach 119.5'}
};

/* ---------- 目視報告點當改降目的地(v2.2.2)----------
   考官也會叫你改去報告點,不一定是機場:池上、成功、長虹橋。座標是在航圖底圖上量三角形
   符號的中心,再畫回去確認落在符號上(誤差 < 0.3 NM)。kind:'pt' 讓答案模型知道這不是機場
   (沒有跑道、燈光、機場空域)。
   高度:沿用北上 C8 的「2,500 ft 以下」並留在 TAITUNG 限航區(底 3,500 ft)下方——這是
   推的,沒有使用者確認過,見 docs/HANDOFF.md §7。
   ridge:直飛一定會碰到的地形(畫線在航圖上看過,三個點從 C8 任何位置直飛都會過),
   答案用它提示 MSA 並指出實際該走的走廊。 */
var PTS = {
  CHISHANG:{kind:'pt', n:'池上（報告點）', nEn:'Chishang (reporting point)', lat:23.121, lon:121.219,
    corridor:'C12',
    note:'花東縱谷裡的報告點，C12 走廊（鹿野 → 池上 → 玉里）。東邊是 TAITUNG 限航區（3,500–9,500 ft），高度留在它的底之下。',
    noteEn:'A reporting point in the East Rift Valley on corridor C12 (Luye - Chishang - Yuli). The TAITUNG restricted area (3,500-9,500 ft) lies to the east; stay below its base.',
    ridge:'直線經台東、鹿野進縱谷，途中有 3,906 ft 的標高點（都蘭山一帶）。實際要沿 C12 走廊飛縱谷。練習飛直線，但 MSA 要一起報出來。',
    ridgeEn:'The direct track passes Taitung and Luye into the valley, near a 3,906 ft spot height (around Dulan). In practice you would follow corridor C12 up the valley. Fly the straight line for practice, but state the MSA as well.'},
  CHENGGONG:{kind:'pt', n:'成功（報告點）', nEn:'Chenggong (reporting point)', lat:23.102, lon:121.387,
    corridor:'C6',
    note:'東海岸的報告點，C6 走廊（東河 → 成功 → 長虹橋）。西邊是 TAITUNG 限航區（3,500–9,500 ft），高度留在它的底之下。',
    noteEn:'A reporting point on the east coast, corridor C6 (Donghe - Chenggong - Changhong Bridge). The TAITUNG restricted area (3,500-9,500 ft) lies to the west; stay below its base.',
    ridge:'直線切過海岸山脈南端（都蘭一帶，圖上標高 3,906 ft）。實際要沿 C6 海岸走廊飛。練習飛直線，但 MSA 要一起報出來。',
    ridgeEn:'The direct track cuts across the southern end of the Coastal Range (around Dulan, 3,906 ft charted). In practice you would follow the coastal corridor C6. Fly the straight line for practice, but state the MSA as well.'},
  CHANGHONG:{kind:'pt', n:'長虹橋（報告點）', nEn:'Changhong Bridge (reporting point)', lat:23.465, lon:121.510,
    corridor:'C6',
    note:'秀姑巒溪出海口的報告點，C6 海岸走廊。距離長，油量是主要考量。',
    noteEn:'A reporting point at the mouth of the Xiuguluan River on the coastal corridor C6. It is a long leg, so fuel is the main consideration.',
    ridge:'直線橫越海岸山脈，圖上最高標高 5,520 ft。實際要沿 C6 海岸走廊飛。練習飛直線，但 MSA 要一起報出來。',
    ridgeEn:'The direct track crosses the Coastal Range, with spot heights up to 5,520 ft. In practice you would follow the coastal corridor C6. Fly the straight line for practice, but state the MSA as well.'},
  // v2.2.2a:只出現在「恆春西邊外海直接改降港仔鼻」這種題目(見 scenario.js 的 GZB)。
  // 直線要越過整個恆春半島,所以高度是 altMin 4,000 ft 以上,不是一般的 2,500/3,000。
  GANGZIHBI:{kind:'pt', n:'港仔鼻（報告點）', nEn:'Gangzihbi (reporting point)', lat:22.140, lon:120.896,
    corridor:'C8', altMin:4000,
    note:'東岸 C8 走廊上的報告點。港仔鼻東邊緊鄰 NANWAN 限航區（3,000–13,000 ft），以 4,000 ft 到達時不要再往東。',
    noteEn:'A reporting point on the east coast, on corridor C8. The NANWAN restricted area (3,000-13,000 ft) begins just east of Gangzihbi; arriving at 4,000 ft, do not continue east.',
    ridge:'直線越過恆春半島：底下有 Hengchun E（GND–2,500）、HENGCHUN A（2,500 ft）與 HENGCHUNG 限航區（SFC–2,500），北邊有 3,484 ft 的標高點，所以要在 4,000 ft 以上飛。',
    ridgeEn:'The direct track crosses the Hengchun peninsula over Hengchun E (GND-2,500), HENGCHUN A (2,500 ft) and the HENGCHUNG restricted area (SFC-2,500), with a 3,484 ft spot height to the north, so fly at 4,000 ft or above.'}
};

/* 「恆春西邊外海」起始段(v2.2.2a,只給直接改降港仔鼻的題目用)。在航圖上挑的海面,
   Hengchun E 空域圈裡、半島西岸外約 2 NM;HC 是航圖上「Hengchun」報告點的三角形,
   位置描述以它為參考(「恆春西方 5 NM 外海」)。 */
var HCW = {north:{lat:22.095, lon:120.653}, south:{lat:21.987, lon:120.653}};
var HC = {k:'HC', n:'恆春', en:'Hengchun', lat:22.012, lon:120.741};


// 所有可以當改降目的地的東西:機場(kind 沒寫 = 機場)+ 報告點。出題、答案、地圖都查這張
var DEST = {};
(function(){
  var k;
  for(k in AD)  if(Object.prototype.hasOwnProperty.call(AD,k))  DEST[k]=AD[k];
  for(k in PTS) if(Object.prototype.hasOwnProperty.call(PTS,k)) DEST[k]=PTS[k];
})();
function isPoint(key){ return !!(DEST[key] && DEST[key].kind==='pt'); }

var CORRIDORS = {
  C8:  '恆春 ↔ 港仔鼻 ↔ 大武 ↔ 太麻里 ↔ RCFN（本題的 XC 航路）',
  C9:  '恆春 ↔ 楓港 ↔ 枋寮 ↔ 東港 ↔ RCKH（西岸）',
  C12: 'RCFN 往北到 RCYU',
  C14: 'RCFN ↔ RCGI',
  C16: '台東地區 ↔ RCLY（與 C22 並列，見 docs/HANDOFF.md §6 未決問題）',
  C18: 'RCKW ↔ RCLY',
  C20: 'RCGI ↔ RCLY',
  C22: '台東地區 ↔ RCLY（見 C16）'
};

/* C8 實際是沿海岸線外側飛，不進陸地：把檢查點往海側平移。
   法線方向取相鄰兩點連線，順時針轉 90°（= 北向切線的海側），
   這樣南端的轉彎（鵝鑾鼻附近）平移方向也會對。*/
var OFFSHORE = 1.0; // NM
(function(){
  var base=[],i;
  for(i=0;i<CHAIN.length;i++) base.push({lat:CHAIN[i].lat,lon:CHAIN[i].lon});
  for(i=0;i<CHAIN.length;i++){
    var a=base[Math.max(i-1,0)], b=base[Math.min(i+1,base.length-1)];
    var d=Geo.dxy(a,b), L=Math.hypot(d[0],d[1])||1;
    var ue=d[1]/L, un=d[0]/L;   // 沿岸北向單位向量
    var se=un, sn=-ue;         // 順時針轉 90° = 海側
    CHAIN[i].lat=base[i].lat+sn*OFFSHORE/60;
    CHAIN[i].lon=base[i].lon+se*OFFSHORE/(60*Math.cos(Geo.rad(base[i].lat)));
  }
})();

/* 取某個欄位的語言版本:英文沒寫就退回中文(寧可出現中文也不要空白)。
   欄位命名慣例:中文放 n / note / fis,英文放 nEn / noteEn / fisEn。 */
function L(obj,field,lang){
  if(!obj) return '';
  var en=obj[field+'En'];
  return (lang==='en' && en) ? en : (obj[field]||'');
}
// 檢查點、南端航點的名字(CHAIN/CAPE 用 en 欄位)
function ptName(pt,lang){ return (lang==='en' && pt && pt.en) ? pt.en : (pt?pt.n:''); }

return {VAR:VAR, BURN:BURN, RESERVE:RESERVE, OFFSHORE:OFFSHORE, L:L, ptName:ptName,
  CHAIN:CHAIN, CAPE:CAPE, HCW:HCW, HC:HC, WPT:WPT, VOR:VOR, AD:AD, PTS:PTS, DEST:DEST, isPoint:isPoint,
  CORRIDORS:CORRIDORS};
});
