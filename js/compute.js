// 答案模型：把情境（makeScenario 的回傳值）算成數字結果，再組成畫面用的字串
// （SITUATION 簡報、航段表、八格答案）。字串組裝不碰 DOM，ui.js 只負責把結果塞進 innerHTML。
(function(root, factory){
  var Geo, Data, Scenario;
  if (typeof module === 'object' && module.exports) {
    Geo = require('./geo.js'); Data = require('./data.js');
    Scenario = require('./scenario.js');
  } else {
    Geo = root.C8.geo; Data = root.C8.data; Scenario = root.C8.scenario;
  }
  var m = factory(Geo, Data, Scenario);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.C8 = root.C8 || {}; root.C8.compute = m; }
})(this, function(Geo, Data, Scenario){
'use strict';

var VAR=Data.VAR, BURN=Data.BURN, RESERVE=Data.RESERVE, AD=Data.AD;
function mag(t){return Geo.mag(t,VAR)}
function fmt3(x){return Geo.fmt3(x)}

function hhmm(h,m){h=(h+Math.floor(m/60))%24;m=((m%60)+60)%60;return ('0'+h).slice(-2)+('0'+m).slice(-2)}

/* ---------- 數字計算 ---------- */
function compute(s){
  var v=Data.VOR[s.pos.vor];
  var r={};
  r.radial=fmt3(mag(Geo.trueBrg(v,s.pos)));
  r.dme=Math.round(Geo.dist(v,s.pos));
  r.vor=v;

  var pts=Scenario.buildRoute(s.pos,s.dest);
  var legs=[],totD=0,totT=0,i;
  for(i=0;i<pts.length-1;i++){
    var tt=Geo.trueBrg(pts[i],pts[i+1]);
    var d=Geo.dist(pts[i],pts[i+1]);
    var t=d/s.gs*60;
    legs.push({from:pts[i].n||pts[i].k,to:pts[i+1].n,d:d,tt:tt,mh:mag(tt),t:t});
    totD+=d;totT+=t;
  }
  r.legs=legs;r.totD=totD;r.totT=totT;r.pts=pts;
  r.first=legs[0];
  r.ridge=Scenario.crossesRidge(s.pos,s.dest);
  r.dirD=Geo.dist(s.pos,AD[s.dest]);
  r.dirTT=Geo.trueBrg(s.pos,AD[s.dest]);
  r.dirMH=mag(r.dirTT);

  r.burn=r.totT/60*BURN;
  r.req=r.burn+RESERVE;
  r.remain=s.fuel-r.burn;

  var em=s.mm+Math.round(totT);
  r.eta=hhmm(s.hh,em);
  r.multi=legs.length>1;
  return r;
}

/* ---------- SITUATION 簡報 ----------
   平面圖不在這裡:版面拆成上排三格之後,地圖有自己的格子,由 ui.js 直接呼叫 Map.mapSVG() 寫進去。 */
function briefHTML(s,r){
  var d=AD[s.dest];
  var speedRow='<div class="row"><dt>地速</dt><dd>GS '+s.gs+' kt</dd></div>';
  // 標題列帶出原航線與方向(v2.2 起南下、北上都有)。放標題列不放內容:內容格的高度
  // 在橫帶版面是算好的,多一行會讓整排跳動(見 docs/HANDOFF.md §13)
  var leg=s.plan?' <span class="leg">'+s.plan.from+' → '+s.plan.to+' '+s.plan.zh+'</span>':'';
  return '<h2>SITUATION'+leg+'</h2><dl>'+
    '<div class="row"><dt>時間</dt><dd>'+hhmm(s.hh,s.mm)+' L</dd></div>'+
    '<div class="row"><dt>位置</dt><dd>'+r.vor.n+' '+r.vor.f+'<br>R-'+r.radial+' / '+r.dme+' DME'+
      '<small>'+s.pos.n+'</small></dd></div>'+
    '<div class="row"><dt>高度</dt><dd>'+s.alt.toLocaleString()+' ft</dd></div>'+
    speedRow+
    '<div class="row"><dt>剩油</dt><dd>'+s.fuel.toFixed(1)+' gal<small>'+(s.lr?'Long Range tank':'Standard tank')+'</small></dd></div>'+
    '<div class="row dest"><dt>改降</dt><dd>'+d.n+'</dd></div>'+
    '</dl><div class="sit"><b>考官給的狀況</b>'+s.trig.zh+'</div>';
}

// 還沒出題時的 SITUATION:跟 briefHTML 同樣六列(標題要跟上面一致),值先空著。
// 讓格子在出題前後維持同一個形狀,版面不會一按出題就整個跳。
// 「位置」出題後固定是三行(VOR、R-/DME、目視位置),空白版在「—」上下各塞一段同樣大小的 .ph:
// 平常 display:none,只有 SITUATION 攤成一條橫帶時才用 visibility:hidden 佔住那三行的高度
// (見 css/style.css),橫帶出題前後才會一樣高;「—」夾在中間,跟其他格的「—」對齊。
function briefBlankHTML(){
  var labels=['時間','位置','高度','地速','剩油','改降'], h='', i;
  var pos='<span class="ph" aria-hidden="true">R-000 / 00 DME<br></span>—'+
          '<span class="ph" aria-hidden="true"><small>達仁外海</small></span>';
  for(i=0;i<labels.length;i++){
    h+='<div class="row'+(labels[i]==='改降'?' dest':'')+'"><dt>'+labels[i]+'</dt><dd class="nil">'+
       (labels[i]==='位置'?pos:'—')+'</dd></div>';
  }
  return '<h2>SITUATION</h2><dl>'+h+'</dl>'+
    '<div class="sit"><b>考官給的狀況</b>按「出題」開始。題目出現的同時開始計時。</div>';
}

function legTable(r){
  var h='<table class="legs"><tr><th>航段</th><th>MH</th><th class="n">NM</th><th class="n">min</th></tr>';
  for(var i=0;i<r.legs.length;i++){
    var L=r.legs[i];
    h+='<tr><td>'+L.from+' → '+L.to+'</td><td>'+fmt3(L.mh)+'°</td><td class="n">'+L.d.toFixed(0)+
       '</td><td class="n">'+L.t.toFixed(0)+'</td></tr>';
  }
  h+='<tr class="tot"><td>合計</td><td></td><td class="n">'+r.totD.toFixed(0)+
     '</td><td class="n">'+r.totT.toFixed(0)+'</td></tr></table>';
  return h;
}

var ITEMS=[
  ['Current time','現在時間'],
  ['Current position','現在位置'],
  ['Turn or Hold','轉向或待命'],
  ['Heading','航向'],
  ['Altitude','高度'],
  ['Time and distance','時間與距離'],
  ['Fuel required & remain','所需與剩餘油量'],
  ['Revise to ATC & Brief to IP','通報與提示']
];

/* ---------- 八格答案 ---------- */
function answers(s,r){
  var d=AD[s.dest];
  var A=[];

  A[0]='<p class="big">'+hhmm(s.hh,s.mm)+' L</p>'+
    '<p class="note">這是 ETE 的起算點，記在板子上。所有後面的 ETA、油量都從這個時間往前推。</p>';

  A[1]='<p class="big">'+r.vor.n+' '+r.vor.f+' <em>R-'+r.radial+' / '+r.dme+' DME</em></p>'+
    '<p class="note">目視對照：'+s.pos.n+'，高度 '+s.alt.toLocaleString()+' ft。'+
    (s.pos.vor==='GID'?'這一段用 GID，因為中央山脈會遮蔽 HCN。':'大武以南 HCN 收得到，用 HCN 比較直觀。')+'</p>';

  var holdTxt;
  if(s.trig.hold){
    holdTxt='<p class="big"><em>HOLD</em></p>'+
      '<p class="note">狀況是暫時性的、有明確恢復時間，油量也夠。在現在位置或指定點待命比立刻飛 '+r.totD.toFixed(0)+
      ' NM 到別的場合理。待命時要報 ATC、設定 holding 高度、算出「最晚決斷時間」——也就是油量剩到只夠飛改降場加保留油的那一刻。</p>';
  }else{
    holdTxt='<p class="big"><em>TURN</em></p>'+
      '<p class="note">先用大概的方向把機頭轉出去，再低頭精算。不要停在原航向上算完才轉——這是考官最常抓的點。初始概略轉向 '+
      fmt3(r.first.mh)+'°。</p>';
  }
  A[2]=holdTxt;

  var hd='<p class="big">MH <em>'+fmt3(r.first.mh)+'°</em>';
  if(r.multi) hd+=' <span style="font-size:14px;font-weight:400">（第一段：'+r.first.from+' → '+r.first.to+'）</span>';
  hd+='</p>';
  hd+='<p class="note">TT '+fmt3(r.first.tt)+'° ＋ VAR '+VAR+'°W ＝ MH '+fmt3(r.first.mh)+'°。</p>';
  A[3]=hd;

  var al;
  if(s.dest==='RCFN'||s.dest==='RCYU'){
    al='<p class="big">2,500 ft 或以下</p>';
  }else if(s.dest==='RCKW'||s.dest==='RCKH'){
    al='<p class="big">3,000 ft 或以下</p>';
  }else{
    al='<p class="big">3,000–3,500 ft，進場前降至 2,500 以下</p>';
  }
  al+='<p class="note">'+d.note+'</p>';
  al+='<p class="note">目的地空域 '+d.air+'。</p>';
  if(r.ridge && s.pos.fi<0){
    // 南端(鵝鑾鼻以西)往東北的直線切過的是恆春半島南端的丘陵,不是中央山脈,不要報大漢山
    al+='<p class="note">直線會切過恆春半島南端的丘陵地。練習飛直線，但 MSA 要一起報出來（標高請在圖上確認）。</p>';
  }else if(r.ridge){
    al+='<p class="note">直線通過中央山脈南段，圖上該帶最高標高 5,538 ft（大漢山）。練習飛直線，但 MSA 要一起報出來。</p>';
  }
  A[4]=al;

  var td='<p class="big">'+r.totD.toFixed(0)+' NM · ETE '+r.totT.toFixed(0)+' min · ETA <em>'+r.eta+'</em></p>';
  if(r.multi){
    td+='<p class="note">分段計算，GS '+s.gs+' kt：</p>'+legTable(r);
  }
  A[5]=td;

  var fu='<p class="big">需要 '+r.burn.toFixed(1)+' ＋ 保留 3.3 ＝ <em>'+r.req.toFixed(1)+' gal</em>　落地剩 '+r.remain.toFixed(1)+' gal</p>';
  fu+='<p class="note">以 6.6 gal/hr × '+r.totT.toFixed(0)+' min 計。現有 '+s.fuel.toFixed(1)+' gal（'+
      (s.lr?'Long Range':'Standard')+' tank），約可續航 '+Math.floor(s.fuel/BURN)+' 小時 '+
      Math.round((s.fuel/BURN%1)*60)+' 分。'+
      (s.fuel>=r.req
        ? '扣掉需求後還有 '+(s.fuel-r.req).toFixed(1)+' gal 餘裕，油量不是限制因素。'
        : '<span style="color:var(--red);font-weight:600">不足以安全抵達加保留油——這個改降場不可接受，要換一個或宣告狀況。</span>')+'</p>';
  if(!d.lit){
    fu+='<p class="note warn">'+d.n+' 無跑道燈（圖上標示 '+d.elev+' - H'+Math.round(+d.rwy.replace(/[^0-9,]/g,'').replace(',',''))/100+'），日間限定。ETA '+r.eta+
        ' 要和當天日沒時間對一次。</p>';
  }
  A[6]=fu;

  A[7]='<p class="big">Revise and briefed</p>';
  return A;
}

return {compute:compute, briefHTML:briefHTML, briefBlankHTML:briefBlankHTML, legTable:legTable, answers:answers, ITEMS:ITEMS, hhmm:hhmm};
});
