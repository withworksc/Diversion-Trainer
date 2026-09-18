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
  pxPerDeg: 3.6,        // 姿態儀畫面:每度 pitch 對應幾個 px
  deadzone: 0.08,       // 搖桿死區,搖桿沒真的推、只是沒對準中心時不要誤觸

  // 兩個軸用同一套動態(見 stepAxis),只有參數不同。roll 的操縱力道比 pitch 大、
  // 回正力比較弱(飛機本來就是 pitch 靜穩定性比較強、滾轉比較容易被吹歪)。
  pitch: {
    limit: 25,          // deg,顯示上限(超過就是失控,先夾住不讓畫面爆開)
    spring: 0.15,       // 1/s²,配平拉力:越偏離 0 越想被拉回去(模擬靜穩定性)
    idleSpring: 4.0,    // 沒在出題/開關關閉時額外加的拉力,讓指針很快歸零
    gustJitter: 6,      // deg/s²,亂流的隨機擾動強度
    gustDecay: 0.6,     // 1/s,亂流本身會自己衰減,不是永遠往同一個方向跑
    damping: 0.8,       // 1/s,角速度阻尼(跟 spring 搭起來剛好臨界阻尼)
    controlGain: 18     // deg/s²,桿子推到底的修正力道
  },
  // roll 的參數是跑模擬調出來的(見 docs/HANDOFF.md):不操作時 60 秒漂 ±4~5°,
  // 跟 pitch 同一個量級;滿桿 1.5 秒約 22° 坡度。原本 gain 45 太靈敏(滿桿 1.5 秒
  // 就 38°),小修正很難拿捏;spring 也從 0.08 提到 0.18 讓它會慢慢自己回平,
  // 配 damping 0.85 剛好臨界阻尼,不會左右擺盪。
  roll: {
    limit: 60,
    spring: 0.18,
    idleSpring: 4.0,
    gustJitter: 6,
    gustDecay: 0.7,
    damping: 0.85,
    controlGain: 30
  },

  tasKt: 115,           // kt,算 VS 用的假設空速(跟這個工具其他地方的巡航速度量級一致)
  ktToFpm: 101.3,       // 1 kt 的下滑/爬升分量換算成 ft/min 的係數
  bankSinkFpm: 420,     // fpm,坡度造成的掉高係數:升力的垂直分量隨 1/cos(bank) 變差,
                        // 壓坡度不帶桿就會掉高——這正是這個練習要讓人有感的地方
  altBaseline: 2000,    // ft,高度帶的參考起點(跟主工具的改降高度是兩回事,見檔頭註解)
  altPxPerFt: 0.6,      // 高度帶:每英尺對應幾個 px
  vsMax: 2000           // fpm,VSI 滿刻度
};
CFG.pitchLimit = CFG.pitch.limit;   // 畫面與測試在用的簡寫

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
  return {pitch:0, rate:0, gust:0,
          roll:0, rollRate:0, rollGust:0,
          heading:0, alt:CFG.altBaseline, vs:0};
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

// 單一軸的動態:亂流(會自我衰減的隨機漫步)+ 回正力 + 阻尼 + 操縱輸入。
// pitch 跟 roll 共用這一套,只有 CFG 參數不同——不要為了第二個軸複製一份。
// ax:{value,rate,gust};k:CFG.pitch 或 CFG.roll。回傳新的 {value,rate,gust}。
function stepAxis(ax,dt,ctl,active,rnd,k){
  // 亂流本身是會自己衰減的隨機漫步,不是白噪音——不然每個影格都獨立亂跳,畫面上
  // 只會看到抖動,不會有「要顧著修正」的漂移感。衰減乘數要夾住下限:dt 大或
  // gustDecay 調高時,不夾住乘數會變負值,亂流會反過來越滾越大。
  var gust = ax.gust*Math.max(0, 1-k.gustDecay*dt) + (rnd()-0.5)*2*k.gustJitter*dt;
  // 沒在出題或開關關掉時,亂流本身也加速歸零,指針才會真的停平,不是慢慢飄回去。
  if(!active) gust *= Math.max(0, 1-k.gustDecay*4*dt);

  var spring = k.spring + (active?0:k.idleSpring);
  // 阻尼要跟回正力配對:這是彈簧系統,阻尼比 ζ = damping/(2√spring)。出題中的
  // spring/damping 是配好的;停止時把 spring 加上 idleSpring 卻沿用原本的 damping
  // 會變成嚴重欠阻尼(ζ≈0.2),指針像單擺一樣盪過水平再盪回來,十幾秒才停。
  // 所以閒置時改用臨界阻尼 2√spring,直接、不過衝地回到水平。
  var damping = active ? k.damping : 2*Math.sqrt(spring);
  var rate = ax.rate + ((active?gust:0) - ax.value*spring + ctl*k.controlGain)*dt;
  rate *= Math.max(0, 1-damping*dt);
  var next = ax.value + rate*dt;
  // 撞到上下限時把角速度也夾住(anti-windup):不然桿子頂在限制上時 rate 會繼續累積,
  // 之後往回修正還要先把這股累積的速度耗掉才會真的開始回頭,手感會覺得「卡住」。
  if(next> k.limit && rate>0) rate=0;
  if(next<-k.limit && rate<0) rate=0;
  return {value:clamp(next,-k.limit,k.limit), rate:rate, gust:gust};
}

// dt:秒;active:是否在「該顧姿態」的狀態(開關開著 && 目前有題目在跑);
// rnd:可注入固定種子的亂數,測試用來重現同一段亂流。
// input:−1~1 的操縱輸入(已經過死區處理)。給數字 = 只有 pitch(舊的呼叫方式,
// 測試還在用);要兩軸就給 {pitch:…, roll:…}。
function step(state,dt,input,active,rnd){
  rnd = rnd || Math.random;
  var s=clone(state);
  var inp = (input==null) ? {pitch:0,roll:0}
          : (typeof input==='number') ? {pitch:input,roll:0}
          : {pitch:input.pitch||0, roll:input.roll||0};

  var p = stepAxis({value:s.pitch, rate:s.rate, gust:s.gust},
                   dt, active?clamp(inp.pitch,-1,1):0, active, rnd, CFG.pitch);
  s.pitch=p.value; s.rate=p.rate; s.gust=p.gust;

  var r = stepAxis({value:s.roll, rate:s.rollRate||0, gust:s.rollGust||0},
                   dt, active?clamp(inp.roll,-1,1):0, active, rnd, CFG.roll);
  s.roll=r.value; s.rollRate=r.rate; s.rollGust=r.gust;

  // 垂直速度 = pitch 的分量 − 坡度造成的掉高。壓了坡度不帶桿就會掉高度,這是這個
  // 練習最想讓人有感的其中一件事,所以 roll 不只是畫面上轉一轉,會真的反映在高度上。
  s.vs = vsFromPitch(s.pitch) - CFG.bankSinkFpm*(1/Math.cos(clamp(s.roll,-80,80)*D) - 1);
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
// 三級刻度,照使用者給的實機照片:
//   2.5° 一格 → 最短、不標數字
//   5°   一格 → 中等長度、不標數字
//   10°  一格 → 最長、兩邊都標數字(10/20/30/40,每一條等長,不是越外面越長)
// 線本身中間不會斷掉(不留缺口)、也不加端點——單純一條打通的橫線,飛機符號
// 疊在最上層蓋過去就好(z-order 已經是符號在後畫,見 aiSVG),不需要靠留白閃開。
// 文字加黑色描邊(paint-order=stroke)讓數字在天空藍/地面棕上都夠清楚。
var LADDER = {major:29, mid:13, minor:8, labelGap:13};

function ladderSVG(){
  var g='';
  function line(y,half,w){
    return '<line x1="'+(-half)+'" y1="'+y+'" x2="'+half+'" y2="'+y+'" stroke="#fff" stroke-width="'+w+'"/>';
  }
  function label(x,y,text){
    return '<text x="'+x+'" y="'+(y+4.5)+'" font-size="13" font-weight="700" fill="#fff" '+
      'stroke="#000" stroke-width="3" paint-order="stroke" text-anchor="middle">'+text+'</text>';
  }
  // 2.5° 一格畫到 40°;超出面板的會被 clip 掉,不用另外判斷
  for(var i=1;i<=16;i++){
    var d=i*2.5, up=-d*CFG.pxPerDeg, dn=d*CFG.pxPerDeg;
    if(d%10===0){
      var x=LADDER.major+LADDER.labelGap;
      g+=line(up,LADDER.major,2.2)+label(-x,up,d)+label(x,up,d)+
         line(dn,LADDER.major,2.2)+label(-x,dn,d)+label(x,dn,d);
    }else if(d%5===0){
      g+=line(up,LADDER.mid,1.6)+line(dn,LADDER.mid,1.6);
    }else{
      g+=line(up,LADDER.minor,1.4)+line(dn,LADDER.minor,1.4);
    }
  }
  return g;
}

// 傾角刻度(bank scale):繞姿態中心 (120,120)、半徑 ROLL.r 的一段實線弧,±60°,
// 刻度往外放射。這是照使用者給的實機照片重畫的:弧線是連續的一條、刻度沒有數字,
// 30°/60° 比 10°/20°/45° 長。頂點上方的實心倒三角形是固定的 0° 基準,
// 下方的實心正三角形 + 小橫條是 roll 指標與側滑指示,roll 有值時會沿著弧線移動。
var ROLL = {cx:120, cy:120, r:100, ticks:[[10,7],[20,7],[30,12],[45,7],[60,12]]};

function rollPt(deg,r){
  var a=deg*D;
  return [ROLL.cx+r*Math.sin(a), ROLL.cy-r*Math.cos(a)];
}

function rollScaleSVG(state){
  var s=rollPt(-60,ROLL.r), e=rollPt(60,ROLL.r);
  var g='<path d="M'+s[0].toFixed(1)+' '+s[1].toFixed(1)+' A'+ROLL.r+' '+ROLL.r+' 0 0 1 '+
        e[0].toFixed(1)+' '+e[1].toFixed(1)+'" fill="none" stroke="#fff" stroke-width="2"/>';
  ROLL.ticks.forEach(function(t){
    [t[0],-t[0]].forEach(function(deg){
      var a=rollPt(deg,ROLL.r), b=rollPt(deg,ROLL.r+t[1]);
      g+='<line x1="'+a[0].toFixed(1)+'" y1="'+a[1].toFixed(1)+'" x2="'+b[0].toFixed(1)+
         '" y2="'+b[1].toFixed(1)+'" stroke="#fff" stroke-width="2"/>';
    });
  });
  var top=ROLL.cy-ROLL.r;                     // 弧線頂點 y
  // 固定的 0° 基準:實心倒三角形,尖端頂在弧頂
  g+='<polygon points="113,'+(top-12)+' 127,'+(top-12)+' 120,'+top+'" fill="#fff"/>';
  // roll 指標 + 側滑指示:roll 恆為 0 時剛好在正上方。轉的方向(跟機身還是跟地平線)
  // 等真的接上 roll 軸時要拿真機/模擬器確認,現在 roll=0 兩種畫法看起來一樣。
  g+='<g transform="rotate('+state.roll+' '+ROLL.cx+' '+ROLL.cy+')">'+
       '<polygon points="120,'+(top+2)+' 113,'+(top+13)+' 127,'+(top+13)+'" fill="#fff"/>'+
       '<polygon points="114,'+(top+15)+' 126,'+(top+15)+' 124,'+(top+19)+' 116,'+(top+19)+'" fill="#fff"/>'+
     '</g>';
  return g;
}

function aiSVG(state){
  var ty = clamp(state.pitch,-CFG.pitchLimit,CFG.pitchLimit)*CFG.pxPerDeg;
  var horizon='<g transform="translate(120 120) rotate('+(-state.roll)+') translate(0 '+ty.toFixed(1)+')">';
  return ''+
    '<rect x="0" y="0" width="240" height="240" fill="#0B0F12"/>'+
    '<g clip-path="url(#aiFace)">'+
      horizon+
        '<rect x="-200" y="-480" width="640" height="480" fill="#155FC4"/>'+          // 天空
        '<rect x="-200" y="0" width="640" height="480" fill="#3B2415"/>'+             // 地面
        '<line x1="-200" y1="0" x2="440" y2="0" stroke="#fff" stroke-width="2.5"/>'+  // 天地線
      '</g>'+
      // pitch 刻度另外再套一層「面板座標系」的 clip:上緣切在 roll 刻度那一組的下面,
      // 所以不管 pitch 怎麼飄(±25° 會讓整條 ladder 上下移動 ±90px),刻度線都不可能
      // 爬進 bank 指標的範圍——這是 QC 抓到的真問題(pitch −2° 到 −25° 之間會疊到)
      // 的根本解法,不是把 roll 刻度縮小硬閃。真機也是這樣:ladder 到某個高度就切掉。
      '<g clip-path="url(#ladderClip)">'+
        horizon+ladderSVG()+'</g>'+
      '</g>'+
    '</g>'+
    '<rect x="1" y="1" width="238" height="238" fill="none" stroke="#4A5359" stroke-width="1.5"/>'+
    rollScaleSVG(state)+
    // 兩側黃色短橫桿:對齊機身符號的尖端高度(y=120,也就是姿態中心)——使用者更正過
    // 兩次,對齊的是尖端,不是翼尖。圓角、有深色描邊,照實機照片。
    '<g fill="#F4C542" stroke="#6B5A12" stroke-width="1">'+
      '<rect x="5" y="117.5" width="26" height="5" rx="2.5"/>'+
      '<rect x="209" y="117.5" width="26" height="5" rx="2.5"/>'+
    '</g>'+
    // 固定的機身參考符號:兩片很薄的實心「刀刃」,尖端就在姿態中心 (120,120)——
    // 也就是讀 pitch 的基準點,往外、往下斜張開。
    // 形狀比例是照使用者手繪量的(IMG_0354):最寬的地方在「翼尖那一端」,
    // 從那裡一路收成尖的到中央尖端——不是在靠近中央處鼓起來(那是先前畫錯的版本)。
    //   翼展(尖端→翼尖)   74px
    //   垂直落差           26px
    //   第三個頂點         離尖端 0.69 倍翼展處,比翼尖高一點點 → 刀刃在外側最寬
    // 描邊收細,不然這麼薄的刀刃會被自己的黑邊吃掉。
    '<g stroke="#000" stroke-width="1.5" stroke-linejoin="round" fill="#FFD400">'+
      '<polygon points="120,120 46,146 69,145"/>'+
      '<polygon points="120,120 194,146 171,145"/>'+
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
  // 中央讀數框:框要夠寬才放得下四位數的高度——原本只有 18px 寬,數字整個滿出來,
  // 這是渲染出來才看到的。左邊留一個尖角指著刻度,右邊到帶子邊緣。
  g+='<polygon points="'+X+','+cy+' '+(X+9)+','+(cy-11)+' '+(X+W)+','+(cy-11)+' '+
     (X+W)+','+(cy+11)+' '+(X+9)+','+(cy+11)+'" fill="#0B0F12" stroke="#fff" stroke-width="1.5"/>'+
     '<text x="'+(X+W-4)+'" y="'+(cy+4.5)+'" font-size="13" font-weight="700" fill="#fff" text-anchor="end">'+Math.round(state.alt)+'</text>';
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
    '<defs>'+
      '<clipPath id="aiFace"><rect x="0" y="0" width="240" height="240"/></clipPath>'+
      // pitch 刻度的上緣:切在 roll 指標那一組(弧頂 y=20、指標與側滑條到 y=39)下面
      '<clipPath id="ladderClip"><rect x="0" y="42" width="240" height="198"/></clipPath>'+
    '</defs>'+
    aiSVG(state)+altTapeSVG(state)+vsiSVG(state)+
  '</svg>';
}

return {CFG:CFG, applyDeadzone:applyDeadzone, initialState:initialState, resetAlt:resetAlt,
  vsFromPitch:vsFromPitch, step:step, renderSVG:renderSVG};
});
