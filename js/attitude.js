// Prototype：G1000 風格姿態儀（+ 簡化的高度帶／VSI）的「飛機怎麼亂跑」與畫面。
// 純函式、不碰 DOM、不讀搖桿——搖桿輸入由 ui.js 讀好之後當參數傳進來，這樣邏輯可以直接用
// node:test 測、不用開瀏覽器。
//
// 範圍先只做 pitch 一軸（roll/heading 留著參數但固定 0），這是討論階段就講好的：
// 先驗證「亂流model + 搖桿修正」這個機制順不順，之後再擴充到三軸。
//
// 高度／VSI 是配合姿態儀一起加的：單獨看 pitch 角度沒有切身感，接上「這個誤差角度、
// 這個空速，幾秒鐘後會爬升／下降多少」才讓人有感——真實 G1000 PFD 上高度帶跟 VSI
// 本來就是跟姿態儀連動的同一組資訊,不是分開的儀表。這裡的高度是姿態小遊戲自己內部
// 的模擬值，跟主工具的改降情境（s.alt）是兩件事，故意不互相牽動。
(function(root, factory){
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.C8 = root.C8 || {}; root.C8.attitude = m; }
})(this, function(){
'use strict';

// 全部是拍腦袋的起始值，之後要接實體搖桿試飛感覺調——不是量出來的數字，跟 geo.js/data.js
// 那些航圖量測值不是同一個等級的「事實」，純粹是遊戲感手感參數。
var CFG = {
  pxPerDeg: 3.2,        // 姿態儀畫面:每度 pitch 對應幾個 px
  pitchLimit: 25,       // deg,pitch 顯示上限(超過就是失控,先夾住不讓畫面爆開)
  springToTrim: 0.15,   // 1/s²,配平拉力:pitch 越偏離 0 越想被拉回去(模擬靜穩定性)
  idleSpring: 4.0,      // 沒在出題/開關關閉時,額外加這麼多拉力,讓指針很快歸零
  gustJitter: 6,        // deg/s²,亂流的隨機擾動強度
  gustDecay: 0.6,       // 1/s,亂流本身會自己衰減,不是永遠往同一個方向跑
  damping: 0.8,         // 1/s,角速度的阻尼,不然會一直震盪不停
  controlGain: 18,      // deg/s²,搖桿全滿時修正力道
  deadzone: 0.08,       // 搖桿死區,搖桿沒真的推、只是沒對準中心時不要誤觸

  tasKt: 115,           // kt,算 VS 用的假設空速(跟這個工具其他地方的巡航速度量級一致)
  ktToFpm: 101.3,       // 1 kt 的下滑/爬升分量換算成 ft/min 的係數
  altBaseline: 2000,    // ft,高度帶的參考起點(跟主工具的改降高度是兩回事,見檔頭註解)
  altPxPerFt: 0.6,      // 高度帶:每英尺對應幾個 px
  vsMax: 2000           // fpm,VSI 滿刻度
};

function clamp(x,lo,hi){return Math.max(lo,Math.min(hi,x))}
var D=Math.PI/180;

// 搖桿死區處理:|x|<deadzone 視為 0,超過的部分重新映射到 0–1,維持線性、不跳一階
function applyDeadzone(x){
  var dz=CFG.deadzone;
  if(Math.abs(x)<dz) return 0;
  var s=x>0?1:-1;
  return s*(Math.abs(x)-dz)/(1-dz);
}

function initialState(){
  return {pitch:0, rate:0, gust:0, roll:0, heading:0, alt:CFG.altBaseline, vs:0};
}

// 出新題時呼叫:高度歸零重算,姿態本身(pitch/rate/gust)不動——避免換題目時飛機
// 突然「跳」了一下,只是重新開始算這一題造成多少高度偏移。
function resetAlt(state){
  var s=clone(state);
  s.alt=CFG.altBaseline;
  s.vs=vsFromPitch(s.pitch);
  return s;
}

// 用 Object.assign 而不是列欄位名——之後擴充到三軸(見檔頭註解)加新欄位時,
// 這裡不用跟著改,不然漏改一個欄位就會在 step() 跑過一次後悄悄消失,不會報錯。
function clone(state){
  return Object.assign({}, state);
}

// 簡化模型:VS(ft/min) = TAS(kt) × sin(pitch) × 101.3。真實下滑角還要看功率、重量、
// 風,這裡只是要讓「姿態錯多少、高度掉多快」有個數量級對得上的直覺,不是精確換算。
function vsFromPitch(pitchDeg){
  return CFG.tasKt*Math.sin(pitchDeg*D)*CFG.ktToFpm;
}

// dt:秒;input:-1~1 的搖桿修正輸入(已經過死區處理);active:是否在「該顧姿態」的狀態
// (開關開著 && 目前有題目在跑);rnd:可注入固定種子的亂數,測試用來重現同一段亂流。
function step(state,dt,input,active,rnd){
  rnd = rnd || Math.random;
  var s=clone(state);
  var ctl = active ? clamp(input,-1,1) : 0;

  // 亂流本身是會自己衰減的隨機漫步,不是白噪音——不然每個影格都獨立亂跳,
  // 畫面上只會看到抖動,不會有「要顧著修正」的漂移感。衰減乘數跟下面兩個 Math.max(0,…)
  // 一樣要夾住下限:dt 大或 gustDecay 調高時,不夾住乘數會變負值,亂流會反過來越滾越大。
  s.gust = s.gust*Math.max(0, 1-CFG.gustDecay*dt) + (rnd()-0.5)*2*CFG.gustJitter*dt;
  if(!active){
    // 沒在出題或開關關掉時,亂流本身也加速歸零,指針才會真的停平,不是慢慢飄回去。
    s.gust *= Math.max(0, 1-CFG.gustDecay*4*dt);
  }

  var spring = CFG.springToTrim + (active?0:CFG.idleSpring);
  var accel = (active?s.gust:0) - s.pitch*spring + ctl*CFG.controlGain;
  s.rate += accel*dt;
  s.rate *= Math.max(0, 1-CFG.damping*dt);
  var pitchNext = s.pitch+s.rate*dt;
  // 撞到上下限時把角速度也夾住(anti-windup):不然桿子頂在限制上時 rate 會繼續累積,
  // 之後往回修正還要先把這股累積的速度耗掉才會真的開始回頭,手感會覺得「卡住」。
  if(pitchNext>CFG.pitchLimit && s.rate>0) s.rate=0;
  if(pitchNext<-CFG.pitchLimit && s.rate<0) s.rate=0;
  s.pitch = clamp(pitchNext, -CFG.pitchLimit, CFG.pitchLimit);

  s.vs = vsFromPitch(s.pitch);
  s.alt = s.alt + s.vs/60*dt;

  return s;
}

/* ---------- G1000 風格姿態儀 + 高度帶／VSI ---------- */
// 姿態儀 viewBox 240×240,中心 (120,120)。G1000 的 PFD 姿態儀本身是方形面板,不是
// 圓形錶面——只有 roll 刻度那段弧線是彎的,不要整個做成圓形儀表(那是機械式 AI 的長相)。
// 高度帶／VSI 接在右邊,共用同一張 SVG,寬度加到 340。

// 天地線＋pitch ladder,畫在自己的局部座標系(0,0 = 姿態水平時的天地線),
// 外層再用 translate(120,120) 搬到面板中心——不要把「120」寫進這個函式裡面,
// 之前這裡的線跟外面固定的機身符號對不起來就是這個原因(局部/絕對座標混用)。
function ladderSVG(){
  var g='',d;
  for(d=10; d<=20; d+=10){
    var yUp=-d*CFG.pxPerDeg, yDn=d*CFG.pxPerDeg, w= d===10?70:100;
    g+='<line x1="'+(-w/2)+'" y1="'+yUp+'" x2="'+(w/2)+'" y2="'+yUp+'" stroke="#fff" stroke-width="2"/>'+
       '<text x="'+(-w/2-14)+'" y="'+(yUp+4)+'" font-size="11" fill="#fff" text-anchor="middle">'+d+'</text>'+
       '<text x="'+(w/2+14)+'" y="'+(yUp+4)+'" font-size="11" fill="#fff" text-anchor="middle">'+d+'</text>'+
       '<line x1="'+(-w/2)+'" y1="'+yDn+'" x2="'+(w/2)+'" y2="'+yDn+'" stroke="#fff" stroke-width="2"/>'+
       '<text x="'+(-w/2-14)+'" y="'+(yDn+4)+'" font-size="11" fill="#fff" text-anchor="middle">'+d+'</text>'+
       '<text x="'+(w/2+14)+'" y="'+(yDn+4)+'" font-size="11" fill="#fff" text-anchor="middle">'+d+'</text>';
  }
  // 5° 短刻度,不標數字——真實 G1000 在 10° 主刻度中間還有一條沒有字的短線
  [-5,5,-15,15].forEach(function(d){
    var y=-d*CFG.pxPerDeg;
    g+='<line x1="-24" y1="'+y+'" x2="24" y2="'+y+'" stroke="#fff" stroke-width="1.3"/>';
  });
  return g;
}

function aiSVG(state){
  var ty = clamp(state.pitch,-CFG.pitchLimit,CFG.pitchLimit)*CFG.pxPerDeg;
  return ''+
    '<rect x="0" y="0" width="240" height="240" fill="#0B0F12"/>'+
    '<g clip-path="url(#aiFace)">'+
      '<g transform="translate(120 120) rotate('+(-state.roll)+') translate(0 '+ty.toFixed(1)+')">'+
        '<rect x="-200" y="-480" width="640" height="480" fill="#1B5FA8"/>'+          // 天空
        '<rect x="-200" y="0" width="640" height="480" fill="#7B5230"/>'+             // 地面
        '<line x1="-200" y1="0" x2="440" y2="0" stroke="#fff" stroke-width="2.5"/>'+  // 天地線
        ladderSVG()+
      '</g>'+
    '</g>'+
    '<rect x="1" y="1" width="238" height="238" fill="none" stroke="#4A5359" stroke-width="2"/>'+
    // 固定的機身參考符號(G1000 風格:兩片直的「小翅膀」從中央缺口向外、向下斜張,
    // 形狀像中文的「八」字,不是先平後彎的鉤子。黑色描邊,不跟著轉,永遠代表飛機本身。)
    '<g stroke-linecap="round">'+
      '<line x1="102" y1="117" x2="70" y2="132" stroke="#000" stroke-width="8"/>'+
      '<line x1="138" y1="117" x2="170" y2="132" stroke="#000" stroke-width="8"/>'+
      '<line x1="102" y1="117" x2="70" y2="132" stroke="#FFD400" stroke-width="5"/>'+
      '<line x1="138" y1="117" x2="170" y2="132" stroke="#FFD400" stroke-width="5"/>'+
    '</g>'+
    '<circle cx="120" cy="120" r="3.5" fill="#FFD400" stroke="#000" stroke-width="1.5"/>'+
    // roll 指標(prototype 固定在正上方,之後 roll 有值時繞著轉)、固定的傾角刻度弧線——
    // 這一段本來就是彎的,是 G1000 真機的樣子,不是把整個儀表做成圓形
    '<polygon points="120,26 114,38 126,38" fill="#fff"/>'+
    '<g stroke="#fff" stroke-width="1.5">'+
      '<line x1="61.6" y1="49.7" x2="66.4" y2="57.9"/>'+   // -30°
      '<line x1="178.4" y1="49.7" x2="173.6" y2="57.9"/>'+ // +30°
      '<line x1="35" y1="90" x2="41.7" y2="94"/>'+          // -60°
      '<line x1="205" y1="90" x2="198.3" y2="94"/>'+        // +60°
    '</g>';
}

// 高度帶:仿 G1000 的捲動式數字帶,中央黑框顯示目前高度,刻度隨高度捲動。
// 這個高度是姿態小遊戲自己的模擬值(見檔頭註解),不是主工具改降情境的高度。
function altTapeSVG(state){
  var X=246, W=68, H=240, cy=120, px=CFG.altPxPerFt;
  var g='<rect x="'+X+'" y="0" width="'+W+'" height="'+H+'" fill="#0B0F12"/>'+
    '<line x1="'+X+'" y1="0" x2="'+X+'" y2="'+H+'" stroke="#4A5359" stroke-width="1.5"/>';
  var visFt = (H/2)/px + 20;
  var lo=Math.ceil((state.alt-visFt)/20)*20, hi=Math.floor((state.alt+visFt)/20)*20, a;
  for(a=lo; a<=hi; a+=20){
    var y=cy-(a-state.alt)*px, major=(a%100===0);
    g+='<line x1="'+(X+W-(major?16:9))+'" y1="'+y.toFixed(1)+'" x2="'+(X+W)+'" y2="'+y.toFixed(1)+'" stroke="#fff" stroke-width="1.3"/>';
    // 跳過離中央讀數框太近的刻度數字,不然剛好整百時會跟中央框裡的數字疊在一起
    if(major && Math.abs(y-cy)>16) g+='<text x="'+(X+W-20)+'" y="'+(y+4).toFixed(1)+'" font-size="12" fill="#fff" text-anchor="end">'+a+'</text>';
  }
  g+='<polygon points="'+X+','+(cy-11)+' '+(X+10)+','+(cy-11)+' '+(X+18)+','+cy+' '+(X+10)+','+(cy+11)+' '+X+','+(cy+11)+'" fill="#0B0F12" stroke="#fff" stroke-width="1.5"/>'+
     '<text x="'+(X+9)+'" y="'+(cy+4)+'" font-size="13" fill="#fff" text-anchor="middle">'+Math.round(state.alt)+'</text>';
  return g;
}

// VSI:中央 0、上climb/下descend 的簡單長條,指針位置對應目前爬升/下降率。
function vsiSVG(state){
  var X=318, W=22, H=240, cy=120;
  var vs=clamp(state.vs,-CFG.vsMax,CFG.vsMax), y=cy-(vs/CFG.vsMax)*100;
  var g='<rect x="'+X+'" y="0" width="'+W+'" height="'+H+'" fill="#0B0F12"/>'+
    '<line x1="'+X+'" y1="'+cy+'" x2="'+(X+W)+'" y2="'+cy+'" stroke="#4A5359" stroke-width="1.5"/>';
  [500,1000,2000].forEach(function(v){
    var yy=cy-(v/CFG.vsMax)*100;
    g+='<line x1="'+X+'" y1="'+yy.toFixed(1)+'" x2="'+(X+6)+'" y2="'+yy.toFixed(1)+'" stroke="#fff" stroke-width="1"/>';
    var yy2=cy+(v/CFG.vsMax)*100;
    g+='<line x1="'+X+'" y1="'+yy2.toFixed(1)+'" x2="'+(X+6)+'" y2="'+yy2.toFixed(1)+'" stroke="#fff" stroke-width="1"/>';
  });
  g+='<polygon points="'+X+','+y.toFixed(1)+' '+(X+14)+','+(y-6).toFixed(1)+' '+(X+14)+','+(y+6).toFixed(1)+'" fill="#00E03C"/>'+
     '<text x="'+(X+11)+'" y="12" font-size="9" fill="#fff" text-anchor="middle">↑</text>'+
     '<text x="'+(X+11)+'" y="234" font-size="9" fill="#fff" text-anchor="middle">↓</text>';
  return g;
}

function renderSVG(state){
  return '<svg viewBox="0 0 340 240" role="img" aria-label="姿態儀與高度帶(prototype)">'+
    '<defs><clipPath id="aiFace"><rect x="0" y="0" width="240" height="240"/></clipPath></defs>'+
    aiSVG(state)+altTapeSVG(state)+vsiSVG(state)+
  '</svg>';
}

return {CFG:CFG, applyDeadzone:applyDeadzone, initialState:initialState, resetAlt:resetAlt,
  vsFromPitch:vsFromPitch, step:step, renderSVG:renderSVG};
});
