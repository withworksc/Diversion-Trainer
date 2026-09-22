// 航路與出題邏輯。純函式、不碰 DOM：出題器不讀任何表單元素，
// 強制改降場、隨機亂數都用參數注入（ui.js 負責讀表單、compute.js 的測試靠這個重現題目）。
(function(root, factory){
  var Geo, Data, I18n;
  if (typeof module === 'object' && module.exports) {
    Geo = require('./geo.js'); Data = require('./data.js'); I18n = require('./i18n.js');
  } else {
    Geo = root.C8.geo; Data = root.C8.data; I18n = root.C8.i18n;
  }
  var m = factory(Geo, Data, I18n);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.C8 = root.C8 || {}; root.C8.scenario = m; }
})(this, function(Geo, Data, I18n){
'use strict';

var CHAIN = Data.CHAIN, CAPE = Data.CAPE, AD = Data.AD, DEST = Data.DEST;

/* ---------- 方向(v2.2 起南下、北上都有) ----------
   南下是原本的 RCFN → RCKW;北上是回程 RCKW → RCFN。alt 是出題當下的高度:C8 走廊
   南下 3,000 ft、北上 2,500 ft(docs/HANDOFF.md §2.7),姿態訓練的高度表也跟著這個值。 */
// zh/en 的方向字在 js/i18n.js 的 dir.S / dir.N,這裡只留資料
var DIRS = {
  S:{from:'RCFN', to:'RCKW', alt:3000},
  N:{from:'RCKW', to:'RCFN', alt:2500}
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

// 八方位的代號(對應 i18n 的 side.*);描述文字兩種語言都在 i18n
var DIR8 = ['N','NE','E','SE','S','SW','W','NW'];
function compass(from,to){ return DIR8[Math.round(Geo.trueBrg(from,to)/45)%8]; }

// 位置描述用的節點查表(CHAIN + CAPE,用 k 當 key)
var NODES = {};
(function(){
  var i;
  for(i=0;i<CHAIN.length;i++) NODES[CHAIN[i].k]=CHAIN[i];
  for(i=0;i<CAPE.length;i++) NODES[CAPE[i].k]=CAPE[i];
  NODES[Data.HC.k]=Data.HC;
})();

/* 位置的文字描述。出題時只存結構(ref 參考點、side 方位、d 距離),文字在這裡才組出來——
   這樣切換語言時,已經出的題目也會跟著換(v2.2.1a)。
   位置本身學員是看 radial/DME 判斷,這行只是輔助說明(使用者確認過)。 */
function posName(pos,lang){
  var ref=NODES[pos.ref], name=Data.ptName(ref,lang);
  if(pos.side==='on') return I18n.t(lang,'pos.on',{ref:name});
  return I18n.t(lang,'pos.off',{ref:name, side:I18n.t(lang,'side.'+pos.side), d:pos.d.toFixed(0)});
}

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
  var side = (d<1.6) ? 'on' : (fi<0.5 ? compass(ref,me) : (fi>ni?'N':'S'));
  return {k:'XC', ref:ref.k, side:side, d:d, lat:me.lat, lon:me.lon, fi:fi,
          vor:(fi<4.5?'HCN':'GID'), trk:planTrack(me,fi,dir)};
}

/* ---------- 恆春西邊外海 → 直接改降港仔鼻(v2.2.2a) ----------
   使用者:有機會在恆春外海直接改降港仔鼻,但高度要 4,000 ft 以上(直線越過半島上空的
   Hengchun E、HENGCHUN A、HENGCHUNG 限航區,見 data.js 的 PTS.GANGZIHBI)。
   這種題目的起點固定在 Data.HCW 那段海面、目的地固定是港仔鼻;隨機時有 GZB_SHARE 的
   機率出這題,選單指定港仔鼻時一定出這題。一般題目不會抽到港仔鼻(不在 WEIGHT 裡)。 */
var GZB = 'GANGZIHBI', GZB_SHARE = 0.08, GZB_FI = -4;   // fi 給一個「鵝鑾鼻以西」的值:HCN、南端規則
function makeHengchunWestPos(rnd,dir){
  var a=Data.HCW.north, b=Data.HCW.south, t=rnd();
  var me={lat:a.lat+(b.lat-a.lat)*t, lon:a.lon+(b.lon-a.lon)*t};
  var d=Geo.dist(Data.HC,me);
  // 原航線:南下是繞過貓鼻頭往 RCKW 進場,北上是剛從 RCKW 起飛、沿西岸往貓鼻頭
  var nxt = (dir==='N') ? CAPE[0] : AD[DIRS.S.to];
  return {k:'XC', ref:Data.HC.k, side:(d<1.6)?'on':compass(Data.HC,me), d:d, lat:me.lat, lon:me.lon,
          fi:GZB_FI, vor:'HCN', trk:Geo.trueBrg(me,nxt)};
}

function buildRoute(pos,destKey){
  return [pos, DEST[destKey]];
}

// 「另一組答案」的航路(v2.2.2a):改降高雄時,除了直飛(跨中央山脈)之外,再給一條先回恆春、
// 恆春以後直線切到高雄的航路(使用者:高雄西部可以直接切直線)。這段直線會經過外海的
// RCR34 限航區(SFC–14,000 ft),使用者決定答案不提,見 docs/HANDOFF.md。其他目的地回傳 null。
function altRoute(pos,destKey){
  if(destKey!=='RCKH') return null;
  return [pos, Data.HC, AD.RCKH];
}

/* 直線是否跨過中央山脈（只用來提示 MSA，不改航路 —— 出題器故意只飛直線，
   見 docs/HANDOFF.md §3.2）。這是粗略規則，只涵蓋 C8 段本身會遇到的幾種情形；
   RCYU 目的地在某些 fi 的直線實際上仍會切到海岸山脈邊緣，見 §6 未決問題。
   南端(fi<0,鵝鑾鼻以西)另外處理:往東北去 RCFN/RCYU 的直線會切過恆春半島南端
   (不是中央山脈,compute.js 的提示文字也不同);往 RCKH 走西岸外海,不過山。 */
function crossesRidge(pos,destKey){
  var fi=pos.fi;
  // 報告點(池上、成功、長虹橋)從 C8 任何位置直飛都會碰到海岸山脈或都蘭一帶的地形
  // (在航圖上畫線看過),一律提示;地形細節在 data.js 各點的 ridge 欄位
  if(Data.isPoint(destKey)) return true;
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
// v2.2.2 加上三個報告點(使用者:會有機會改降到池上、成功、長虹橋),各 10,
// 合起來大約四分之一的題目。比例是暫定的。
var WEIGHT=[['RCKH',25],['RCLY',25],['RCGI',20],['RCYU',10],
            ['CHISHANG',10],['CHENGGONG',10],['CHANGHONG',10]];

// force：'auto' 或指定 ICAO 代碼；rnd：可注入固定種子的亂數
function pickDest(force,rnd){
  rnd = rnd || Math.random;
  if(force && force!=='auto') return force;
  var tot=0,i;for(i=0;i<WEIGHT.length;i++)tot+=WEIGHT[i][1];
  var r=rnd()*tot;
  for(i=0;i<WEIGHT.length;i++){r-=WEIGHT[i][1];if(r<=0)return WEIGHT[i][0]}
  return WEIGHT[WEIGHT.length-1][0];
}

// 考官給的狀況。只存 id,文字兩種語言都在 js/i18n.js 的 trig.*(用 {ad} 原目的地、
// {dir} 南下/北上 代換),切換語言時已經出的題目也會跟著換。
var TRIGGERS=[
  {id:'wx',         hold:false},
  {id:'instructor', hold:false},
  {id:'coast',      hold:false},
  {id:'notam',      hold:false},
  {id:'runway',     hold:true},
  {id:'pax',        hold:false}
];

// s:makeScenario 的回傳值
function trigText(s,lang){
  return I18n.t(lang,'trig.'+s.trig.id,
    {ad:s.plan.to, dir:I18n.t(lang,'dir.'+s.dir)});
}

function lerp(rng,a,b){return a+rng()*(b-a)}
function pick(a,rng){return a[Math.floor(rng()*a.length)]}

// force：強制改降場（'auto' 或 ICAO 代碼）；rnd：可注入固定種子的亂數
function makeScenario(force,rnd){
  rnd = rnd || Math.random;
  if(force && force!=='auto' && !DEST[force]) force='auto';   // 不認得的代碼當成隨機
  var dir=pickDir(force,rnd), plan=DIRS[dir], pos, destKey;
  if(force===GZB || ((!force||force==='auto') && rnd()<GZB_SHARE)){
    pos=makeHengchunWestPos(rnd,dir); destKey=GZB;
  }else{
    pos=makePos(rnd,dir); destKey=pickDest(force,rnd);
  }
  var trig=pick(TRIGGERS,rnd);
  var hh=Math.floor(lerp(rnd,7,16)), mm=Math.floor(lerp(rnd,0,60));
  var gs=Math.round(lerp(rnd,85,158)/5)*5;
  var lr=rnd()<0.35;
  var fuel=lr?Math.round(lerp(rnd,25.5,32)*10)/10:Math.round(lerp(rnd,17.5,23)*10)/10;
  return {pos:pos,dir:dir,plan:plan,dest:destKey,trig:trig,hh:hh,mm:mm,gs:gs,alt:plan.alt,fuel:fuel,lr:lr};
}

return {WEIGHT:WEIGHT, TRIGGERS:TRIGGERS, DIRS:DIRS, NORTH_SHARE:NORTH_SHARE, CAPE_SHARE:CAPE_SHARE,
  GZB:GZB, GZB_SHARE:GZB_SHARE,
  makePos:makePos, posName:posName, trigText:trigText, buildRoute:buildRoute, altRoute:altRoute,
  crossesRidge:crossesRidge, pickDir:pickDir, pickDest:pickDest, makeScenario:makeScenario};
});
