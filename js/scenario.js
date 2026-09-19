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

var CHAIN = Data.CHAIN, CAPE = Data.CAPE, AD = Data.AD;

/* ---------- 方向(v2.2 起南下、北上都有) ----------
   南下是原本的 RCFN → RCKW;北上是回程 RCKW → RCFN。alt 是出題當下的高度:C8 走廊
   南下 3,000 ft、北上 2,500 ft(docs/HANDOFF.md §2.7),姿態訓練的高度表也跟著這個值。 */
var DIRS = {
  S:{from:'RCFN', to:'RCKW', zh:'南下', alt:3000},
  N:{from:'RCKW', to:'RCFN', zh:'北上', alt:2500}
};
var NORTH_SHARE = 0.5;

// 指定回航場時方向就定了:改降 RCFN 只可能發生在南下(原目的地 RCKW),RCKW 只可能在北上
function pickDir(force,rnd){
  if(force===DIRS.S.from) return 'S';
  if(force===DIRS.N.from) return 'N';
  return rnd()<NORTH_SHARE ? 'N' : 'S';
}

/* ---------- 起始點 ----------
   fi 是航線上的小數索引:0 = 鵝鑾鼻、8.0 = 知本(CHAIN,南→北);負的是南端 CAPE
   (-1 = 鵝鑾鼻南方、-3 = 貓鼻頭)。大部分起始點在東岸(九棚南方 fi 1.2 到知本,知本、
   達仁、港仔鼻一帶);CAPE_SHARE 的比例落在南端,貓鼻頭到鵝鑾鼻外海(v2.2)。
   fi<4.5(達仁以南)用 HCN,北半段用 GID —— 中央山脈在北段會遮蔽 HCN。 */
var FI_MIN = -CAPE.length, FI_MAX = CHAIN.length-1;
var COAST_FI = [1.2, 8.0], CAPE_FI = [FI_MIN, 0.6], CAPE_SHARE = 0.2;
function node(i){ return i>=0 ? CHAIN[i] : CAPE[CAPE.length+i]; }

var DIR8 = ['北','東北','東','東南','南','西南','西','西北'];
function compass(from,to){ return DIR8[Math.round(Geo.trueBrg(from,to)/45)%8]; }

// 原航線在這一點的真航向(改降前機頭指的方向,地圖上的本機符號用)。
// 南下往 fi 變小的方向飛,過了貓鼻頭就是 RCKW;北上反過來,過了知本就是 RCFN。
function planTrack(me,fi,dir){
  var j, nxt;
  if(dir==='N'){ j=Math.floor(fi)+1; nxt = j<=FI_MAX ? node(j) : AD[DIRS.N.to]; }
  else         { j=Math.ceil(fi)-1;  nxt = j>=FI_MIN ? node(j) : AD[DIRS.S.to]; }
  return Geo.trueBrg(me,nxt);
}

// dir:'S' / 'N'(沒給當南下),只影響 trk
function makePos(rnd,dir){
  rnd = rnd || Math.random;
  var R = rnd()<CAPE_SHARE ? CAPE_FI : COAST_FI;
  var fi = R[0]+rnd()*(R[1]-R[0]);
  var i0=Math.min(Math.floor(fi),FI_MAX-1), t=fi-i0;
  var a=node(i0), b=node(i0+1);
  var me={lat:a.lat+(b.lat-a.lat)*t, lon:a.lon+(b.lon-a.lon)*t};
  var ni=Math.max(FI_MIN,Math.min(FI_MAX,Math.round(fi)));
  var ref=node(ni), d=Geo.dist(ref,me);
  // 東岸是南北向,照舊說「北方/南方」;南端海岸是東西向,改用八方位
  var side = fi<0.5 ? compass(ref,me) : (fi>ni?'北':'南');
  var nm = d<1.6 ? ref.n+'外海' : ref.n+side+'方'+d.toFixed(0)+' NM 外海';
  return {k:'XC', n:nm, lat:me.lat, lon:me.lon, fi:fi, vor:(fi<4.5?'HCN':'GID'), trk:planTrack(me,fi,dir)};
}

function buildRoute(pos,destKey){
  return [pos, AD[destKey]];
}

/* 直線是否跨過中央山脈（只用來提示 MSA，不改航路 —— 出題器故意只飛直線，
   見 docs/HANDOFF.md §3.2）。這是粗略規則，只涵蓋 C8 段本身會遇到的幾種情形；
   RCYU 目的地在某些 fi 的直線實際上仍會切到海岸山脈邊緣，見 §6 未決問題。
   南端(fi<0,鵝鑾鼻以西)另外處理:往東北去 RCFN/RCYU 的直線會切過恆春半島南端
   (不是中央山脈,compute.js 的提示文字也不同);往 RCKH 走西岸外海,不過山。 */
function crossesRidge(pos,destKey){
  var fi=pos.fi;
  if(fi<0) return destKey==='RCFN'||destKey==='RCYU';
  if(destKey==='RCGI'||destKey==='RCLY') return false;
  if(destKey==='RCKH') return true;
  if(destKey==='RCFN'||destKey==='RCYU') return fi<3.6;
  if(destKey==='RCKW') return fi>4.7;
  return false;
}

/* ---------- 題目產生 ---------- */
// 隨機只抽這四個。回航(南下回 RCFN、北上回 RCKW)實際上很少考,不放進隨機(v2.2,
// 使用者:通常不太會轉降豐年);選單還是可以指定,指定了方向就跟著定(見 pickDir)。
var WEIGHT=[['RCKH',25],['RCLY',25],['RCGI',20],['RCYU',10]];

// force：'auto' 或指定 ICAO 代碼；rnd：可注入固定種子的亂數
function pickDest(force,rnd){
  rnd = rnd || Math.random;
  if(force && force!=='auto') return force;
  var tot=0,i;for(i=0;i<WEIGHT.length;i++)tot+=WEIGHT[i][1];
  var r=rnd()*tot;
  for(i=0;i<WEIGHT.length;i++){r-=WEIGHT[i][1];if(r<=0)return WEIGHT[i][0]}
  return WEIGHT[WEIGHT.length-1][0];
}

// {AD} = 原目的地(南下 RCKW、北上 RCFN),{DIR} = 南下/北上,出題時代換
var TRIGGERS=[
  {zh:'{AD} 場面 METAR 報 BKN008，低於目視最低條件。', en:'destination weather below VFR minima', hold:false},
  {zh:'考官指示：立即改降。', en:'instructor-directed diversion', hold:false},
  {zh:'前方沿岸雲底降低，繼續{DIR}無法維持 VFR。', en:'deteriorating VFR conditions ahead', hold:false},
  {zh:'{AD} 臨時 NOTAM 場面關閉，時間未定。', en:'destination aerodrome closed by NOTAM', hold:false},
  {zh:'{AD} 現在有跑道入侵處理中，預計 25 分鐘後恢復；燃油充足。', en:'destination temporarily unavailable, expect 25 minutes', hold:true},
  {zh:'後座學員身體不適，要求儘速落地。', en:'passenger discomfort, requesting earliest landing', hold:false}
];

function lerp(rng,a,b){return a+rng()*(b-a)}
function pick(a,rng){return a[Math.floor(rng()*a.length)]}

// force：強制改降場（'auto' 或 ICAO 代碼）；rnd：可注入固定種子的亂數
function makeScenario(force,rnd){
  rnd = rnd || Math.random;
  if(force && force!=='auto' && !AD[force]) force='auto';   // 不認得的代碼當成隨機
  var dir=pickDir(force,rnd), plan=DIRS[dir];
  var pos=makePos(rnd,dir);
  var destKey=pickDest(force,rnd);
  var t=pick(TRIGGERS,rnd);
  var trig={zh:t.zh.replace('{AD}',plan.to).replace('{DIR}',plan.zh), en:t.en, hold:t.hold};
  var hh=Math.floor(lerp(rnd,7,16)), mm=Math.floor(lerp(rnd,0,60));
  var gs=Math.round(lerp(rnd,85,158)/5)*5;
  var lr=rnd()<0.35;
  var fuel=lr?Math.round(lerp(rnd,25.5,32)*10)/10:Math.round(lerp(rnd,17.5,23)*10)/10;
  return {pos:pos,dir:dir,plan:plan,dest:destKey,trig:trig,hh:hh,mm:mm,gs:gs,alt:plan.alt,fuel:fuel,lr:lr};
}

return {WEIGHT:WEIGHT, TRIGGERS:TRIGGERS, DIRS:DIRS, NORTH_SHARE:NORTH_SHARE, CAPE_SHARE:CAPE_SHARE,
  makePos:makePos, buildRoute:buildRoute, crossesRidge:crossesRidge, pickDir:pickDir,
  pickDest:pickDest, makeScenario:makeScenario};
});
