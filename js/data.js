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
  {k:'ELB', n:'鵝鑾鼻', lat:21.900, lon:120.850, vor:'HCN'},
  {k:'JLS', n:'佳樂水', lat:22.033, lon:120.850, vor:'HCN'},
  {k:'JP',  n:'九棚',   lat:22.100, lon:120.883, vor:'HCN'},
  {k:'XH',  n:'旭海',   lat:22.183, lon:120.867, vor:'HCN'},
  {k:'DR',  n:'達仁',   lat:22.275, lon:120.867, vor:'HCN'},
  {k:'DW',  n:'大武',   lat:22.350, lon:120.892, vor:'GID'},
  {k:'JL',  n:'金崙',   lat:22.533, lon:120.967, vor:'GID'},
  {k:'TML', n:'太麻里', lat:22.608, lon:121.008, vor:'GID'},
  {k:'ZB',  n:'知本',   lat:22.700, lon:121.050, vor:'GID'}
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
  RCFN:{n:'RCFN 豐年', lat:22.755, lon:121.103, elev:143, rwy:'2,400 m', lit:true,
        air:'Taitung D GND-3000', fis:'台東近場 119.5',
        note:'北上維持 2,500 ft 以下，同時在 TAITUNG 軍訓空域 3,500 底高之下。注意 HUATUNG A/B 超輕型航路。'},
  RCGI:{n:'RCGI 綠島', lat:22.673, lon:121.465, elev:28, rwy:'900 m', lit:false,
        air:'Ludao E GND-2500', fis:'台東近場 119.5',
        note:'全程越海（對應走廊 C14）。建議爬到 3,000–3,500 ft 延伸滑翔與通信距離，進場前降至 2,500 以下進入 Ludao E。'},
  RCLY:{n:'RCLY 蘭嶼', lat:22.040, lon:121.535, elev:44, rwy:'1,100 m', lit:false,
        air:'Lanyu E GND-2500', fis:'台東近場 119.5',
        note:'全程越海、無備降（對應走廊 C16／C22，南端為 C18）。爬高有利滑翔與通信；注意 NANWAN 限航區 13,000/3,000。'},
  RCKW:{n:'RCKW 恆春', lat:22.041, lon:120.730, elev:46, rwy:'1,700 m', lit:false,
        air:'Hengchun E GND-2500', fis:'高雄近場 119.5',
        note:'南下 3,000 ft 以下，進場前降入 Hengchun E。注意 HENGCHUN A/B 超輕型空域 2,500。'},
  RCKH:{n:'RCKH 高雄', lat:22.578, lon:120.348, elev:31, rwy:'3,200 m', lit:true,
        air:'Kaohsiung D GND-5000', fis:'高雄近場 119.5',
        note:'直線跨越中央山脈，高度要能過地障。落地前依序經過 Pingtung D GND-3000 與 Kaohsiung D GND-5000，進入前須取得許可。'},
  RCYU:{n:'RCYU 花蓮', lat:24.023, lon:121.618, elev:51, rwy:'2,800 m', lit:true,
        air:'Hualien D GND-3000', fis:'花蓮近場 119.5',
        note:'沿東海岸北上（對應走廊 C12）。距離長，油量與日照是主要限制，不是航向問題。'}
};

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

return {VAR:VAR, BURN:BURN, RESERVE:RESERVE, OFFSHORE:OFFSHORE,
  CHAIN:CHAIN, WPT:WPT, VOR:VOR, AD:AD, CORRIDORS:CORRIDORS};
});
