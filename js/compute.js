// 答案模型：把情境（makeScenario 的回傳值）算成數字結果，再組成畫面用的字串
// （SITUATION 簡報、航段表、八格答案）。字串組裝不碰 DOM，ui.js 只負責把結果塞進 innerHTML。
(function(root, factory){
  var Geo, Data, Scenario, I18n;
  if (typeof module === 'object' && module.exports) {
    Geo = require('./geo.js'); Data = require('./data.js');
    Scenario = require('./scenario.js'); I18n = require('./i18n.js');
  } else {
    Geo = root.C8.geo; Data = root.C8.data; Scenario = root.C8.scenario; I18n = root.C8.i18n;
  }
  var m = factory(Geo, Data, Scenario, I18n);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.C8 = root.C8 || {}; root.C8.compute = m; }
})(this, function(Geo, Data, Scenario, I18n){
'use strict';

// AD 在這裡指「改降目的地」:機場 + 報告點(v2.2.2),用 Data.DEST
var VAR=Data.VAR, BURN=Data.BURN, RESERVE=Data.RESERVE, AD=Data.DEST;
// 所有畫面字串都經過 t():lang 是 'zh'(預設)或 'en',字串本體在 js/i18n.js
function t(lang,key,vars){ return I18n.t(lang,key,vars); }
function adName(key,lang){ return Data.L(AD[key],'n',lang); }
// 兩句接在一起時,中文不用空格,英文要
function join(lang,a,b){ return a+((lang==='en')?' ':'')+b; }
// 航段端點的名字:本機位置用位置描述,其他是機場
function ptLabel(pt,lang){
  if(pt.k==='XC') return Scenario.posName(pt,lang);
  return pt.en ? Data.ptName(pt,lang) : Data.L(pt,'n',lang);   // 報告點用 en,機場用 nEn
}
// 「另一組答案」的區塊:每一格答案底下加一段,標題講清楚是哪一條(地圖上的橘線)
function altBlock(lang,html){ return '<div class="alt"><b>'+t(lang,'alt.title')+'</b>'+html+'</div>'; }
function mag(t){return Geo.mag(t,VAR)}
function fmt3(x){return Geo.fmt3(x)}

function hhmm(h,m){h=(h+Math.floor(m/60))%24;m=((m%60)+60)%60;return ('0'+h).slice(-2)+('0'+m).slice(-2)}

/* ---------- 數字計算 ---------- */
// 一條航路(點的陣列)的航段、總距離時間、油量與 ETA。直飛與「另一組答案」共用。
function routeCalc(s,pts){
  var legs=[],totD=0,totT=0,i;
  for(i=0;i<pts.length-1;i++){
    var tt=Geo.trueBrg(pts[i],pts[i+1]);
    var d=Geo.dist(pts[i],pts[i+1]);
    var t=d/s.gs*60;
    // 存點本身,不存名字:名字要看語言,畫面時才組(見 ptLabel)
    legs.push({fromPt:pts[i],toPt:pts[i+1],d:d,tt:tt,mh:mag(tt),t:t});
    totD+=d;totT+=t;
  }
  var burn=totT/60*BURN;
  return {pts:pts, legs:legs, totD:totD, totT:totT, first:legs[0], multi:legs.length>1,
          burn:burn, req:burn+RESERVE, remain:s.fuel-burn, eta:hhmm(s.hh,s.mm+Math.round(totT))};
}

function compute(s){
  var v=Data.VOR[s.pos.vor];
  var r=routeCalc(s,Scenario.buildRoute(s.pos,s.dest));
  r.radial=fmt3(mag(Geo.trueBrg(v,s.pos)));
  r.dme=Math.round(Geo.dist(v,s.pos));
  r.vor=v;
  r.ridge=Scenario.crossesRidge(s.pos,s.dest);
  r.dirD=Geo.dist(s.pos,AD[s.dest]);
  r.dirTT=Geo.trueBrg(s.pos,AD[s.dest]);
  r.dirMH=mag(r.dirTT);
  var alt=Scenario.altRoute(s.pos,s.dest);
  r.alt = alt ? routeCalc(s,alt) : null;   // 另一組答案(目前只有東部改降高雄:先到恆春,再直飛)
  return r;
}

/* ---------- SITUATION 簡報 ----------
   平面圖不在這裡:版面拆成上排三格之後,地圖有自己的格子,由 ui.js 直接呼叫 Map.mapSVG() 寫進去。 */
function briefHTML(s,r,lang){
  var d=AD[s.dest];
  var speedRow='<div class="row"><dt>'+t(lang,'brief.gs')+'</dt><dd>GS '+s.gs+' kt</dd></div>';
  // 標題列帶出原航線與方向(v2.2 起南下、北上都有)。放標題列不放內容:內容格的高度
  // 在橫帶版面是算好的,多一行會讓整排跳動(見 docs/HANDOFF.md §13)
  var leg=s.plan?' <span class="leg">'+s.plan.from+' → '+s.plan.to+' '+t(lang,'dir.'+s.dir)+'</span>':'';
  return '<h2>SITUATION'+leg+'</h2><dl>'+
    '<div class="row"><dt>'+t(lang,'brief.time')+'</dt><dd>'+hhmm(s.hh,s.mm)+' L</dd></div>'+
    '<div class="row"><dt>'+t(lang,'brief.pos')+'</dt><dd>'+r.vor.n+' '+r.vor.f+'<br>R-'+r.radial+' / '+r.dme+' DME'+
      '<small>'+Scenario.posName(s.pos,lang)+'</small></dd></div>'+
    '<div class="row"><dt>'+t(lang,'brief.alt')+'</dt><dd>'+s.alt.toLocaleString()+' ft</dd></div>'+
    speedRow+
    '<div class="row"><dt>'+t(lang,'brief.fuel')+'</dt><dd>'+s.fuel.toFixed(1)+' gal<small>'+
      t(lang,s.lr?'brief.tankLR':'brief.tankStd')+'</small></dd></div>'+
    '<div class="row dest"><dt>'+t(lang,'brief.dest')+'</dt><dd>'+adName(s.dest,lang)+'</dd></div>'+
    '</dl><div class="sit"><b>'+t(lang,'brief.sitLabel')+'</b>'+Scenario.trigText(s,lang)+'</div>';
}

// 還沒出題時的 SITUATION:跟 briefHTML 同樣六列(標題要跟上面一致),值先空著。
// 讓格子在出題前後維持同一個形狀,版面不會一按出題就整個跳。
// 「位置」出題後固定是三行(VOR、R-/DME、目視位置),空白版在「—」上下各塞一段同樣大小的 .ph:
// 平常 display:none,只有 SITUATION 攤成一條橫帶時才用 visibility:hidden 佔住那三行的高度
// (見 css/style.css),橫帶出題前後才會一樣高;「—」夾在中間,跟其他格的「—」對齊。
function briefBlankHTML(lang){
  var keys=['brief.time','brief.pos','brief.alt','brief.gs','brief.fuel','brief.dest'], h='', i;
  var pos='<span class="ph" aria-hidden="true">R-000 / 00 DME<br></span>—'+
          '<span class="ph" aria-hidden="true"><small>'+t(lang,'brief.blankPos')+'</small></span>';
  for(i=0;i<keys.length;i++){
    h+='<div class="row'+(keys[i]==='brief.dest'?' dest':'')+'"><dt>'+t(lang,keys[i])+'</dt><dd class="nil">'+
       (keys[i]==='brief.pos'?pos:'—')+'</dd></div>';
  }
  return '<h2>SITUATION</h2><dl>'+h+'</dl>'+
    '<div class="sit"><b>'+t(lang,'brief.sitLabel')+'</b>'+t(lang,'brief.blankSit')+'</div>';
}

function legTable(r,lang){
  var h='<table class="legs"><tr><th>'+t(lang,'leg.leg')+'</th><th>TH</th><th class="n">NM</th><th class="n">min</th></tr>';
  for(var i=0;i<r.legs.length;i++){
    var L=r.legs[i];
    h+='<tr><td>'+ptLabel(L.fromPt,lang)+' → '+ptLabel(L.toPt,lang)+'</td><td>'+fmt3(L.tt)+'°</td><td class="n">'+L.d.toFixed(0)+
       '</td><td class="n">'+L.t.toFixed(0)+'</td></tr>';
  }
  h+='<tr class="tot"><td>'+t(lang,'leg.total')+'</td><td></td><td class="n">'+r.totD.toFixed(0)+
     '</td><td class="n">'+r.totT.toFixed(0)+'</td></tr></table>';
  return h;
}

// 八格的標題。中文版大標中文、小標英文;英文版只有英文(小標留空,見 js/ui.js)
function items(lang){
  var out=[],i;
  for(i=1;i<=8;i++) out.push({title:t(lang,'item.'+i), sub:(lang==='en')?'':t('en','item.'+i)});
  return out;
}
var ITEMS_LEN=8;

/* ---------- 八格答案 ---------- */
function answers(s,r,lang){
  var d=AD[s.dest];
  var A=[];

  A[0]='<p class="big">'+hhmm(s.hh,s.mm)+' L</p>'+
    '<p class="note">'+t(lang,'a1.note')+'</p>';

  A[1]='<p class="big">'+r.vor.n+' '+r.vor.f+' <em>R-'+r.radial+' / '+r.dme+' DME</em></p>'+
    '<p class="note">'+join(lang, t(lang,'a2.note',{pos:Scenario.posName(s.pos,lang), alt:s.alt.toLocaleString()}),
      t(lang,s.pos.vor==='GID'?'a2.gid':'a2.hcn'))+'</p>';

  A[2]= s.trig.hold
    ? '<p class="big"><em>HOLD</em></p><p class="note">'+t(lang,'a3.holdNote',{nm:r.totD.toFixed(0)})+'</p>'
    : '<p class="big"><em>TURN</em></p><p class="note">'+t(lang,'a3.turnNote',{hdg:fmt3(r.first.tt)})+'</p>'+
      (r.alt ? altBlock(lang,'<p class="note">'+t(lang,'alt.turn',{hdg:fmt3(r.alt.first.tt)})+'</p>') : '');

  // v2.2.1 起主要答案報真航向(使用者要求)。沒有算風,所以 TH = 圖上量到的 TT;
  // 磁航向還是算給你,放在下面那行,要用磁羅盤/HSI 時換算。
  var hd='<p class="big">TH <em>'+fmt3(r.first.tt)+'°</em>';
  if(r.multi) hd+=' <span style="font-size:14px;font-weight:400">'+
      t(lang,'a4.first',{from:ptLabel(r.first.fromPt,lang), to:ptLabel(r.first.toPt,lang)})+'</span>';
  hd+='</p><p class="note">'+t(lang,'a4.note',{tt:fmt3(r.first.tt), var:VAR, mh:fmt3(r.first.mh)})+'</p>';
  if(r.alt) hd+=altBlock(lang,'<p class="alt-big">TH <em>'+fmt3(r.alt.first.tt)+'°</em></p><p class="note">'+
      t(lang,'alt.hdg',{from:ptLabel(r.alt.first.fromPt,lang), to:ptLabel(r.alt.first.toPt,lang),
        mh:fmt3(r.alt.first.mh)})+'</p>');
  A[3]=hd;

  var pt = (d.kind==='pt');
  var altKey = (pt && d.altMin) ? 'a5.altMin'
             : pt ? 'a5.altPoint'
             : (s.dest==='RCFN'||s.dest==='RCYU') ? 'a5.alt2500'
             : (s.dest==='RCKW'||s.dest==='RCKH') ? 'a5.alt3000' : 'a5.altIsland';
  var al='<p class="big">'+t(lang,altKey,{corr:d.corridor, alt:d.altMin?d.altMin.toLocaleString('en-US'):''})+'</p>'+
    '<p class="note">'+Data.L(d,'note',lang)+'</p>';
  // 報告點沒有機場空域可報,改成提示走廊
  if(!pt) al+='<p class="note">'+t(lang,'a5.airspace',{air:d.air})+'</p>';
  // 報告點的地形各不相同,寫在資料裡;南端(鵝鑾鼻以西)往東北切過的是恆春半島南端的丘陵,
  // 不是中央山脈,不要報大漢山
  if(r.ridge) al+='<p class="note">'+(pt ? Data.L(d,'ridge',lang)
                                         : t(lang,(s.pos.fi<0)?'a5.ridgeCape':'a5.ridge'))+'</p>';
  if(r.alt) al+=altBlock(lang,'<p class="alt-big">'+t(lang,'a5.alt3000')+'</p><p class="note">'+t(lang,'alt.alt')+'</p>');
  A[4]=al;

  var td='<p class="big">'+r.totD.toFixed(0)+' NM · ETE '+r.totT.toFixed(0)+' min · ETA <em>'+r.eta+'</em></p>';
  if(r.multi) td+='<p class="note">'+t(lang,'a6.legs',{gs:s.gs})+'</p>'+legTable(r,lang);
  if(r.alt) td+=altBlock(lang,'<p class="alt-big">'+r.alt.totD.toFixed(0)+' NM · ETE '+r.alt.totT.toFixed(0)+
      ' min · ETA <em>'+r.alt.eta+'</em></p><p class="note">'+t(lang,'a6.legs',{gs:s.gs})+'</p>'+legTable(r.alt,lang));
  A[5]=td;

  // 只報「這趟要燒多少」跟「落地剩多少」。v2.2.1 拿掉「＋保留 3.3 ＝ 需求」那段算式
  // (使用者要求);保留油還是判斷夠不夠的標準,只出現在下面的註解句。
  // 報告點不會落地:「落地剩」改成「到達時剩」
  var fu='<p class="big">'+t(lang,'a7.need')+' <em>'+r.burn.toFixed(1)+' gal</em>'+t(lang,'a7.sep')+
      t(lang,pt?'a7.remainArr':'a7.remain')+' '+r.remain.toFixed(1)+' gal</p>';
  fu+='<p class="note">'+join(lang, t(lang,'a7.note',{min:r.totT.toFixed(0), fuel:s.fuel.toFixed(1),
        tank:t(lang,s.lr?'brief.tankLR':'brief.tankStd'),
        h:Math.floor(s.fuel/BURN), m:Math.round((s.fuel/BURN%1)*60)}),
      (r.remain>=RESERVE
        ? t(lang,pt?'a7.okArr':'a7.ok',{res:RESERVE.toFixed(1)})
        : '<span style="color:var(--red);font-weight:600">'+t(lang,pt?'a7.lowArr':'a7.low',{res:RESERVE.toFixed(1)})+'</span>'))+'</p>';
  if(!pt && !d.lit){
    fu+='<p class="note warn">'+t(lang,'a7.noLight',{ad:adName(s.dest,lang), elev:d.elev,
        rwy:Math.round(+d.rwy.replace(/[^0-9,]/g,'').replace(',',''))/100, eta:r.eta})+'</p>';
  }
  if(r.alt) fu+=altBlock(lang,'<p class="alt-big">'+t(lang,'a7.need')+' <em>'+r.alt.burn.toFixed(1)+' gal</em>'+
      t(lang,'a7.sep')+t(lang,'a7.remain')+' '+r.alt.remain.toFixed(1)+' gal</p>'+
      (r.alt.remain<RESERVE ? '<p class="note" style="color:var(--red);font-weight:600">'+
        t(lang,'a7.low',{res:RESERVE.toFixed(1)})+'</p>' : ''));
  A[6]=fu;

  A[7]='<p class="big">'+t(lang,'a8.big')+'</p>';
  return A;
}

return {compute:compute, briefHTML:briefHTML, briefBlankHTML:briefBlankHTML, legTable:legTable,
  answers:answers, items:items, ITEMS_LEN:ITEMS_LEN, hhmm:hhmm};
});
