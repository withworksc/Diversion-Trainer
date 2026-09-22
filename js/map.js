// 平面圖：CAA VFR Chart 裁切的底圖 + 向量疊圖（航路、VOR、距離環、本機符號）。
// 回傳的是字串（img + svg），不直接操作 DOM —— 由 ui.js 的 render() 寫進 innerHTML。
//
// 底圖是獨立的 <img>，不是 SVG 內的 <image>：拉框繪出來的向量樹如果包含一張大點陣圖，
// 捲動時瀏覽器每一影格都要重新光柵化，畫面會撕裂。分開之後點陣圖只解碼一次，
// wrapper 上的 contain:paint 把重繪範圍鎖住。不要把底圖搬回 SVG 裡。
(function(root, factory){
  var Geo, Data, I18n;
  if (typeof module === 'object' && module.exports) {
    Geo = require('./geo.js'); Data = require('./data.js'); I18n = require('./i18n.js');
  } else {
    Geo = root.C8.geo; Data = root.C8.data; I18n = root.C8.i18n;
  }
  var m = factory(Geo, Data, I18n);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.C8 = root.C8 || {}; root.C8.map = m; }
})(this, function(Geo, Data, I18n){
'use strict';

// 底圖裁切範圍：花蓮（RCYU）到蘭嶼／鵝鑾鼻，見 tools/make_chart.py 的 CROP。
// 座標要跟 assets/chart-south.json 的 bounds 一致；換圖時兩邊一起改。
var CHART = {lon0:119.85, lon1:121.90, lat0:21.75, lat1:24.30, src:'assets/chart-south.png'};

// 把需要顯示的點都框進視窗，回傳投影函式 P(lat,lon) -> [x,y]（viewBox 像素）
function makeProj(need,W,H,pad,minSpan){
  var xs=[],ys=[],i;
  for(i=0;i<need.length;i++){xs.push(Geo.wx(need[i].lon));ys.push(Geo.wy(need[i].lat));}
  var x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs);
  var y0=Math.min.apply(null,ys),y1=Math.max.apply(null,ys);
  var cx=(x0+x1)/2, cy=(y0+y1)/2;
  var sx=Math.max(x1-x0,minSpan), sy=Math.max(y1-y0,minSpan);
  var av=(W-2*pad)/(H-2*pad);
  if(sx/sy>av) sy=sx/av; else sx=sy*av;
  sx*=1.20; sy*=1.20;
  var sc=(W-2*pad)/sx;
  return function(lat,lon){
    return [ W/2+(Geo.wx(lon)-cx)*sc , H/2+(Geo.wy(lat)-cy)*sc ];
  };
}

// 「另一組答案」的航路顏色(v2.2.2a)。直飛是紅色 #C41E5A,另一組用橘色,兩條都要看得清楚
var ALT_COLOR='#E07B00';

// s：情境（makeScenario 的回傳值），r：compute() 的回傳值，lang：圖例的語言
function mapSVG(s,r,lang){
  var W=376,H=436,pad=22;
  var need=r.pts.slice();
  if(r.alt) need=need.concat(r.alt.pts);   // 另一組航路也要框進視窗
  need.push(s.pos,Data.DEST[s.dest]);
  var P=makeProj(need,W,H,pad,0.72);
  var g='',i,p;

  var tl=P(CHART.lat1,CHART.lon0), br=P(CHART.lat0,CHART.lon1);
  var bg='<img class="chartbg" alt="" src="'+CHART.src+'" style="left:'+(tl[0]/W*100).toFixed(4)+
     '%;top:'+(tl[1]/H*100).toFixed(4)+'%;width:'+((br[0]-tl[0])/W*100).toFixed(4)+
     '%;height:'+((br[1]-tl[1])/H*100).toFixed(4)+'%">';
  g+='<rect x="0" y="0" width="'+W+'" height="'+H+'" fill="#F4F0E4" opacity="0.22"/>';

  var a=P(s.pos.lat,s.pos.lon), b=P(Data.DEST[s.dest].lat,Data.DEST[s.dest].lon);

  /* 另一組答案的航路（橘色,先畫,紅色直飛疊在上面）*/
  if(r.alt){
    var da='';
    for(i=0;i<r.alt.pts.length;i++){p=P(r.alt.pts[i].lat,r.alt.pts[i].lon);da+=(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)+' ';}
    g+='<path d="'+da+'" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" opacity=".75"/>';
    g+='<path class="alt-route" d="'+da+'" fill="none" stroke="'+ALT_COLOR+'" stroke-width="2.6" stroke-linejoin="round"/>';
    for(i=1;i<r.alt.pts.length-1;i++){
      p=P(r.alt.pts[i].lat,r.alt.pts[i].lon);
      g+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.6" fill="'+ALT_COLOR+'" stroke="#fff" stroke-width="1"/>';
    }
  }

  /* 航路（直線）*/
  var d='';
  for(i=0;i<r.pts.length;i++){p=P(r.pts[i].lat,r.pts[i].lon);d+=(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)+' ';}
  g+='<path d="'+d+'" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" opacity=".75"/>';
  g+='<path d="'+d+'" fill="none" stroke="#C41E5A" stroke-width="2.6" stroke-linejoin="round"/>';
  for(i=1;i<r.pts.length-1;i++){
    p=P(r.pts[i].lat,r.pts[i].lon);
    g+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.4" fill="#C41E5A" stroke="#fff" stroke-width="1"/>';
  }

  /* 改降場 */
  p=P(Data.DEST[s.dest].lat,Data.DEST[s.dest].lon);
  g+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="8.5" fill="none" stroke="#C41E5A" stroke-width="2.4"/>';

  /* 作用中的 VOR */
  var V=Data.VOR[s.pos.vor];p=P(V.lat,V.lon);
  if(p[0]>-40&&p[0]<W+40&&p[1]>-40&&p[1]<H+40){
    g+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="7" fill="none" stroke="#0F4C81" stroke-width="2"/>'+
       '<line x1="'+p[0].toFixed(1)+'" y1="'+p[1].toFixed(1)+'" x2="'+a[0].toFixed(1)+'" y2="'+a[1].toFixed(1)+
       '" stroke="#0F4C81" stroke-width="1.4" stroke-dasharray="6 4" opacity=".9"/>';
  }

  /* 10 NM 距離環 */
  var rr=Math.abs(P(s.pos.lat+10/60,s.pos.lon)[1]-a[1]);
  g+='<circle cx="'+a[0].toFixed(1)+'" cy="'+a[1].toFixed(1)+'" r="'+rr.toFixed(1)+
     '" fill="none" stroke="#0E2732" stroke-width="1" stroke-dasharray="2 5" opacity=".6"/>';

  /* ND 本機符號，指向 divert 前的原航向（南下或北上，見 scenario.js 的 planTrack）*/
  var trk=s.pos.trk;
  g+='<g transform="translate('+a[0].toFixed(1)+','+a[1].toFixed(1)+') rotate('+trk.toFixed(0)+')">'+
     '<path d="M0,-13 L8,9 L0,5 L-8,9 Z" fill="#F4F0E4" stroke="#0E2732" stroke-width="1.8" stroke-linejoin="round"/>'+
     '</g>';

  /* 北標與比例尺 */
  g+='<g transform="translate('+(W-18)+',20)"><line x1="0" y1="10" x2="0" y2="-9" stroke="#0E2732" stroke-width="1.4"/>'+
     '<polygon points="0,-12 3.4,-5 -3.4,-5" fill="#0E2732"/><text x="0" y="22" font-size="9" text-anchor="middle" fill="#0E2732">N</text></g>';
  g+='<g transform="translate(16,'+(H-14)+')"><line x1="0" y1="0" x2="'+rr.toFixed(1)+
     '" y2="0" stroke="#0E2732" stroke-width="1.6"/><line x1="0" y1="-3.5" x2="0" y2="3.5" stroke="#0E2732" stroke-width="1.6"/>'+
     '<line x1="'+rr.toFixed(1)+'" y1="-3.5" x2="'+rr.toFixed(1)+'" y2="3.5" stroke="#0E2732" stroke-width="1.6"/>'+
     '<text x="'+(rr/2).toFixed(1)+'" y="-6" font-size="9" text-anchor="middle" fill="#0E2732">10 NM</text></g>';

  /* 有另一組航路時才畫圖例:紅 = 直飛、橘 = 經恆春 */
  if(r.alt){
    var lg=[['#C41E5A',I18n.t(lang,'map.direct')],[ALT_COLOR,I18n.t(lang,'map.alt')]];
    g+='<g transform="translate(10,12)"><rect x="0" y="0" width="118" height="38" rx="3" fill="#F4F0E4" opacity=".92" stroke="#0E2732" stroke-width=".6"/>';
    for(i=0;i<lg.length;i++){
      g+='<line x1="8" y1="'+(12+i*14)+'" x2="26" y2="'+(12+i*14)+'" stroke="'+lg[i][0]+'" stroke-width="2.6"/>'+
         '<text x="31" y="'+(15+i*14)+'" font-size="9.5" fill="#0E2732">'+lg[i][1]+'</text>';
    }
    g+='</g>';
  }

  return '<div class="mapwrap">'+bg+
    '<svg class="mapfg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+I18n.t(lang,'map.aria')+'">'+g+'</svg></div>';
}

return {CHART:CHART, ALT_COLOR:ALT_COLOR, makeProj:makeProj, mapSVG:mapSVG};
});
