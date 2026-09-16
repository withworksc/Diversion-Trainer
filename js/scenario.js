// 航路與出題邏輯。純函式、不碰 DOM：出題器不讀任何表單元素，
// 強制改降場、隨機亂數都用參數注入（ui.js 負責讀表單、compute.js 的測試靠這個重現題目）。
(function(root, factory){
  var Geo, Data;
  if (typeof module === 'object' && module.exports) {
    Geo = require('./geo.js'); Data = require('./data.js');
  } else {
    Geo = root.C8.geo; Data = root.C8.data;
  }
  var m = factory(Geo, Data);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.C8 = root.C8 || {}; root.C8.scenario = m; }
})(this, function(Geo, Data){
'use strict';

var CHAIN = Data.CHAIN, AD = Data.AD;

/* 沿 C8 連續取一點：fi 是鏈上的小數索引（1.2 = 九棚南方一點，8.0 = 知本）。
   南半段（fi<4.5，達仁以南）用 HCN，北半段用 GID —— 中央山脈在北段會遮蔽 HCN。 */
function makePos(rnd){
  rnd = rnd || Math.random;
  var fi=1.2+rnd()*6.8;
  var i0=Math.min(Math.floor(fi),CHAIN.length-2), t=fi-i0;
  var a=CHAIN[i0], b=CHAIN[i0+1];
  var lat=a.lat+(b.lat-a.lat)*t, lon=a.lon+(b.lon-a.lon)*t;
  var me={lat:lat,lon:lon};
  var ni=Math.round(fi); if(ni>CHAIN.length-1)ni=CHAIN.length-1;
  var ref=CHAIN[ni], d=Geo.dist(ref,me);
  var nm = d<1.6 ? ref.n+'外海'
         : ref.n+(fi>ni?'北方':'南方')+d.toFixed(0)+' NM 外海';
  return {k:'XC', n:nm, lat:lat, lon:lon, fi:fi, vor:(fi<4.5?'HCN':'GID')};
}

function buildRoute(pos,destKey){
  return [pos, AD[destKey]];
}

/* 直線是否跨過中央山脈（只用來提示 MSA，不改航路 —— 出題器故意只飛直線，
   見 docs/HANDOFF.md §3.2）。這是粗略規則，只涵蓋 C8 段本身會遇到的幾種情形；
   RCYU 目的地在某些 fi 的直線實際上仍會切到海岸山脈邊緣，見 §6 未決問題。 */
function crossesRidge(pos,destKey){
  var fi=pos.fi;
  if(destKey==='RCGI'||destKey==='RCLY') return false;
  if(destKey==='RCKH') return true;
  if(destKey==='RCFN'||destKey==='RCYU') return fi<3.6;
  if(destKey==='RCKW') return fi>4.7;
  return false;
}

/* ---------- 題目產生 ---------- */
var WEIGHT=[['RCKH',25],['RCLY',25],['RCFN',20],['RCGI',20],['RCYU',10]];

// force：'auto' 或指定 ICAO 代碼；rnd：可注入固定種子的亂數
function pickDest(force,rnd){
  rnd = rnd || Math.random;
  if(force && force!=='auto') return force;
  var tot=0,i;for(i=0;i<WEIGHT.length;i++)tot+=WEIGHT[i][1];
  var r=rnd()*tot;
  for(i=0;i<WEIGHT.length;i++){r-=WEIGHT[i][1];if(r<=0)return WEIGHT[i][0]}
  return 'RCFN';
}

var TRIGGERS=[
  {zh:'RCKW 場面 METAR 報 BKN008，低於目視最低條件。', en:'destination weather below VFR minima', hold:false},
  {zh:'考官指示：立即改降。', en:'instructor-directed diversion', hold:false},
  {zh:'前方沿岸雲底降低，繼續南下無法維持 VFR。', en:'deteriorating VFR conditions ahead', hold:false},
  {zh:'RCKW 臨時 NOTAM 場面關閉，時間未定。', en:'destination aerodrome closed by NOTAM', hold:false},
  {zh:'RCKW 現在有跑道入侵處理中，預計 25 分鐘後恢復；燃油充足。', en:'destination temporarily unavailable, expect 25 minutes', hold:true},
  {zh:'後座學員身體不適，要求儘速落地。', en:'passenger discomfort, requesting earliest landing', hold:false}
];

function lerp(rng,a,b){return a+rng()*(b-a)}
function pick(a,rng){return a[Math.floor(rng()*a.length)]}

// force：強制改降場（'auto' 或 ICAO 代碼）；rnd：可注入固定種子的亂數
function makeScenario(force,rnd){
  rnd = rnd || Math.random;
  var pos=makePos(rnd);
  var destKey=pickDest(force,rnd);
  if(AD[destKey]===undefined) destKey='RCFN';
  var trig=pick(TRIGGERS,rnd);
  var hh=Math.floor(lerp(rnd,7,16)), mm=Math.floor(lerp(rnd,0,60));
  var gs=Math.round(lerp(rnd,85,158)/5)*5;
  var alt=(destKey==='RCFN'||destKey==='RCYU'||destKey==='RCGI')?2500:3000;
  var lr=rnd()<0.35;
  var fuel=lr?Math.round(lerp(rnd,25.5,32)*10)/10:Math.round(lerp(rnd,17.5,23)*10)/10;
  return {pos:pos,dest:destKey,trig:trig,hh:hh,mm:mm,gs:gs,alt:alt,fuel:fuel,lr:lr};
}

return {WEIGHT:WEIGHT, TRIGGERS:TRIGGERS, makePos:makePos, buildRoute:buildRoute,
  crossesRidge:crossesRidge, pickDest:pickDest, makeScenario:makeScenario};
});
