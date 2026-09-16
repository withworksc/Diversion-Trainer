// 導航數學 + 顯示用的 Mercator 投影。純函式、不碰 DOM：瀏覽器用 window.C8.geo，
// Node 測試用 require，兩邊跑的是同一份程式碼（跟 VOR / HSI trainer 的 nav.js 同一個模式）。
//
// 兩套座標系刻意分開，不要合併：
// - 導航（dxy/dist/trueBrg）：本地平面近似，單位 NM。算航向、距離、DME 用這個。
// - 顯示（mercY/wx/wy）：球面 Mercator，單位度，跟航圖的投影一致。只給 map.js 用。
(function(root, factory){
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.C8 = root.C8 || {}; root.C8.geo = m; }
})(this, function(){
'use strict';

function rad(d){return d*Math.PI/180}
function deg(r){return r*180/Math.PI}

// a、b 是 {lat,lon}；回傳 [dLat_NM, dLon_NM]（北、東為正）
function dxy(a,b){
  var dLat=(b.lat-a.lat)*60;
  var dLon=(b.lon-a.lon)*60*Math.cos(rad((a.lat+b.lat)/2));
  return [dLat,dLon];
}
function dist(a,b){var d=dxy(a,b);return Math.hypot(d[0],d[1])}
function trueBrg(a,b){var d=dxy(a,b);return (deg(Math.atan2(d[1],d[0]))+360)%360}

// 真航向 → 磁航向。variation 為西差的度數（正值 = 西差）
function mag(t,variation){return (t+variation+360)%360}

// 三位數格式，航圖 radial／航向慣例：360 而不是 000
function fmt3(x){x=Math.round(x)%360;if(x<=0)x+=360;return ('00'+x).slice(-3)}

// 球面 Mercator northing，單位度，跟航圖一致
function mercY(lat){return 180/Math.PI*Math.log(Math.tan(Math.PI/4+rad(lat)/2))}
function wx(lon){return lon}
function wy(lat){return -mercY(lat)}

return {rad:rad,deg:deg,dxy:dxy,dist:dist,trueBrg:trueBrg,mag:mag,fmt3:fmt3,
  mercY:mercY,wx:wx,wy:wy};
});
