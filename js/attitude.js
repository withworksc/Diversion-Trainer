// Prototype：G1000 風格姿態儀（+ 簡化的高度帶／VSI）的「飛機怎麼亂跑」與畫面。
// 純函式、不碰 DOM、不讀搖桿——搖桿輸入由 ui.js 讀好之後當參數傳進來，這樣邏輯可以直接用
// node:test 測、不用開瀏覽器。
//
// 模擬 pitch 與 bank 兩軸（heading 留著欄位、固定 0）。兩軸共用同一套動態（stepAxis），
// 另外有兩個跨軸的效應:平飛姿態是 2°(巡航攻角),以及壓坡度不帶桿機頭會下沉、掉高度。
// 設計與調參數的依據見 docs/HANDOFF.md「姿態訓練(prototype)」一節。
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
  // 搖桿死區,搖桿沒真的推、只是沒對準中心時不要誤觸。v2 從 0.08 降到 0.04(使用者:中間
  // 太鈍)——Warthog 是霍爾感測器,放開時軸值幾乎是 0,不需要那麼大的死區。其他桿子
  // 回中不準的話,姿態儀下方的狀態列看得到靜止時的軸值,超過 0.04 再調回來。
  deadzone: 0.04,
  // 搖桿曲線:輸出 = (1−expo)·x + expo·x³(x 是扣掉死區後的 0~1)。0 = 線性、1 = 純 cubic。
  // v2 加的,讓小修正比較好拿捏;滿桿還是 100%。先試 0.5(加上死區 0.08),使用者回報中間
  // 太鈍,改成 0.3(死區 0.04):推 10% 輸出約 4.4%(0.5 時只有 1.1%),推 40% 約 28%
  // (線性 35%)。純 cubic 中心更鈍,不要用。
  expo: 0.3,

  // 兩個軸用同一套動態(見 stepAxis),只有參數不同。pitch 有靜穩定性(放桿會慢慢回到
  // 平飛姿態);roll 是中性的(放桿就停在當下的坡度,不會自己回到機翼水平)——跟真的
  // 飛機一樣。
  pitch: {
    // 平飛姿態:DA40 巡航平飛時機頭約上仰 2°(使用者提供)。這 2° 是巡航攻角,所以
    // 姿態 2° 時航跡角是 0、不爬不降(見 vsFrom)。回正力、初始值、停止時歸位都朝它。
    trim: 2,
    limit: 25,          // deg,顯示上限(超過就是失控,先夾住不讓畫面爆開)
    spring: 0.15,       // 1/s²,配平拉力:越偏離 trim 越想被拉回去(模擬靜穩定性)
    idleSpring: 4.0,    // 沒在出題/開關關閉時額外加的拉力,讓指針很快歸位
    gustDecay: 0.6,     // 1/s,亂流本身會自己衰減,不是永遠往同一個方向跑
    damping: 0.8,       // 1/s,角速度阻尼(跟 spring 搭起來剛好臨界阻尼)
    controlGain: 18,    // deg/s²,桿子推到底的修正力道
    // 壓坡度不帶桿時機頭往下掉的力道(deg/s²,乘上負載因數多出來的部分 1/cos−1)。
    // 升力傾斜後垂直分量不夠撐住重量,航跡往下彎,機頭跟著航跡往下沉——這是「轉彎要
    // 帶桿」要練的東西,也是學員要在姿態儀上看得到的。v2 從 5 調到 10(使用者:轉彎掉
    // 高度要更明顯),數字見 docs/HANDOFF.md 姿態訓練一節;亂流的 ±5° 小坡度幾乎沒影響。
    bankDrop: 10
  },
  // roll 的參數是跑模擬調出來的(見 docs/HANDOFF.md 姿態訓練一節)。
  // spring 0 = 中性穩定:出題中放桿就停在當下的坡度,不會自己回到機翼水平(v1 是 0.18,
  // 會慢慢自己回平——使用者指出真的飛機不會這樣)。所以桿子控制的是「滾轉速率」:
  // 滿桿約 18°/s(1.5 秒約 21° 坡度),放桿後再多滾約 5° 就停住——damping 要夠大
  // (滾轉阻尼,時間常數約 0.3 秒),不然放桿後會一路滑到 50° 以上。亂流吹歪的坡度也
  // 一樣不會自己回來,不修就會越漂越大(亂流強度見 CFG.turbulence)。
  // 停止出題時靠 idleSpring 回平,那是畫面歸位,不是飛機的性質。
  roll: {
    limit: 60,
    spring: 0,
    idleSpring: 4.0,
    gustDecay: 0.7,
    damping: 3,
    controlGain: 55
  },

  // 亂流大小(v2.1 起可選):亂流隨機擾動的強度(乘 √dt,見 stepAxis),三檔就是前三版
  // 調過的值——易 = v1、中 = v2.0.2、難 = v2。只有亂流強度不同;放桿不回平、轉彎掉高度
  // 這些飛機本身的性質三檔都一樣。不動桿時(60 Hz、60 顆種子的中位數):
  //   易:pitch 偏離平飛 RMS 約 1.2°、坡度 30 秒約 0.6°
  //   中:約 1.5°、約 2.4°(v2.0.1 的 pitch 1.2 約 2.0°,v2.0.2 使用者要垂直再低一點)
  //   難:約 2.6°、約 4°(最差一成 11°)
  // v2.2.1:使用者要坡度的亂流「統一小一點,少三分之一」,三檔的 roll 一起乘 2/3
  // (1/4/7 → 0.7/2.7/4.7),等距關係不變;pitch 沒有動。
  // v1 的 roll 還有回正力,坡度漂不遠;「易」的 roll 原本取 1,讓 30 秒的漂移跟 v1 差不多,
  // 剛好也跟中、難等距(1 / 4 / 7)。
  turbulence: {
    easy:   {pitch:0.8,  roll:0.7},
    medium: {pitch:1.05, roll:2.7},
    hard:   {pitch:1.6,  roll:4.7}
  },
  defaultTurbulence: 'medium',

  tasKt: 115,           // kt,算 VS 用的假設空速(跟這個工具其他地方的巡航速度量級一致)
  ktToFpm: 101.3,       // 1 kt 的下滑/爬升分量換算成 ft/min 的係數
  // 起始高度 3000 ft,altitude bug 也設在 3000(使用者指定)——學員要守的就是出題那一刻
  // 的高度,所以 bug 跟起始高度是同一個值,不另外設。跟主工具的改降高度是兩回事。
  altBaseline: 3000,    // 還沒出題時的預設;出題後照題目的高度(南下 3000、北上 2500,v2.2)
  altPxPerFt: 0.36,     // 高度帶:每英尺幾 px。照實機照片的比例,帶子高度約看得到 ±270 ft
  trendSec: 6,          // 洋紅趨勢線:顯示幾秒後會到的高度(G1000 是 6 秒)
  vsMax: 2000           // fpm,VSI 滿刻度
};

// 整張 PFD 的版面(viewBox 單位)。姿態儀本身是左邊 240×240 的正方形(中心 120,120);
// 高度帶與 VSI 在右邊。跟 G1000 一樣,天空/地面一路延伸到高度帶底下,高度帶與 VSI
// 是半透明的深色疊層、白色細框,不是另外一塊黑底——照使用者給的實機照片。
// 各尺寸是照那張照片量的比例換算過來的。
var PFD = {w:346, h:240};
var ALT = {x:244, w:60, top:22, bot:218, cy:120,  // 高度帶本體(中心對齊姿態中心)
           selTop:4, baroH:16,                    // 上方選定高度框、下方氣壓框
           drumPxPerFt:0.9};                      // 讀數框裡捲動數字:每 20 ft 間隔 18px
var VSI = {x0:304, x1:330, top:29, bot:210, cy:120,
           pxPer1000:40,                          // 每 1000 fpm 幾 px(±2000 滿刻度)
           notchApex:306, notchHalf:14.5};        // 右緣往內的 V 形缺口,尖端在 0 的位置
var COLOR = {cyan:'#29E6E6', magenta:'#E040E0', tick:'#E8E8E8', label:'#D9D9D9', frame:'#CFCFCF'};
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

// 搖桿原始軸值 → 操縱輸入:先扣死區,再套 expo 曲線(見 CFG.expo)。
// 奇函數、單調、±1 還是 ±1。鍵盤代打是 0/±1,套不套曲線結果都一樣。
function stickCurve(x,expo){
  var k=(expo==null)?CFG.expo:expo, v=applyDeadzone(x);
  return (1-k)*v + k*v*v*v;
}

// alt:起始高度,也是 altitude bug(target)。沒給就用 CFG.altBaseline。
function initialState(alt){
  var a=(alt==null)?CFG.altBaseline:alt;
  return {pitch:CFG.pitch.trim, rate:0, gust:0,
          roll:0, rollRate:0, rollGust:0,
          heading:0, alt:a, target:a, vs:0};
}

// 出新題時呼叫:高度歸零重算,姿態本身(pitch/rate/gust)不動——避免換題目時飛機
// 突然「跳」了一下,只是重新開始算這一題造成多少高度偏移。
// alt:這一題的高度(南下 3000、北上 2500),高度與 bug 都設成它;沒給就沿用原本的 bug。
function resetAlt(state,alt){
  var s=clone(state);
  s.target=(alt!=null)?alt:(s.target!=null?s.target:CFG.altBaseline);
  s.alt=s.target;
  s.vs=vsFrom(s.pitch,s.roll);
  return s;
}

// 用 Object.assign 而不是列欄位名——之後擴充到三軸(見檔頭註解)加新欄位時,
// 這裡不用跟著改,不然漏改一個欄位就會在 step() 跑過一次後悄悄消失,不會報錯。
function clone(state){
  return Object.assign({}, state);
}

// 坡度的負載因數多出來的部分:1/cos(bank) − 1。0° 時是 0,30° 約 0.15,45° 約 0.41。
// 夾在 ±80° 避免接近 90° 時爆掉(roll 本身限制在 ±60°,這只是防呆)。
function loadExcess(rollDeg){
  return 1/Math.cos(clamp(rollDeg,-80,80)*D) - 1;
}

// 垂直速度。航跡角 = pitch 姿態 − 攻角;平飛時攻角約等於 trim(2°),坡度時要撐住重量
// 需要的攻角變成 trim/cos(bank)。所以:
//   VS(ft/min) = TAS(kt) × sin(pitch − trim/cos(bank)) × 101.3
// 姿態 2°、機翼水平 → VS=0。真實情況還要看功率、重量、風,這裡只是要讓「姿態錯多少、
// 高度掉多快」有個數量級對得上的直覺,不是精確換算。
function vsFrom(pitchDeg,rollDeg){
  var aoa=CFG.pitch.trim*(1+loadExcess(rollDeg||0));
  return CFG.tasKt*Math.sin((pitchDeg-aoa)*D)*CFG.ktToFpm;
}

// 單一軸的動態:亂流(會自我衰減的隨機漫步)+ 回正力 + 阻尼 + 操縱輸入 + 外力。
// 亂流檔位 → {pitch, roll} 強度。不認得的值(舊的 localStorage、打錯字)退回預設,
// 不要讓畫面因為一個設定值壞掉。
function turbulenceFor(level){
  return (level && Object.prototype.hasOwnProperty.call(CFG.turbulence,level))
    ? CFG.turbulence[level] : CFG.turbulence[CFG.defaultTurbulence];
}

// pitch 跟 roll 共用這一套,只有 CFG 參數不同——不要為了第二個軸複製一份。
// ax:{value,rate,gust};k:CFG.pitch 或 CFG.roll(回正的目標是 k.trim,沒設就是 0);
// jitter:亂流強度(CFG.turbulence 裡那一檔、這個軸的值);
// extra:其他軸帶來的角加速度(deg/s²),目前只有「坡度讓機頭下沉」用到。
// 回傳新的 {value,rate,gust}。
function stepAxis(ax,dt,ctl,active,rnd,k,extra,jitter){
  // 亂流本身是會自己衰減的隨機漫步,不是白噪音——不然每個影格都獨立亂跳,畫面上
  // 只會看到抖動,不會有「要顧著修正」的漂移感。衰減乘數要夾住下限:dt 大或
  // gustDecay 調高時,不夾住乘數會變負值,亂流會反過來越滾越大。
  // 隨機項乘的是 √dt 不是 dt:每格乘 dt 的話,每秒累積的變異數跟影格長度成正比,
  // 120 Hz 螢幕的亂流會比 60 Hz 弱約 30%(v1 就是這樣)。√dt 才跟更新率無關。
  var gust = ax.gust*Math.max(0, 1-k.gustDecay*dt) + (rnd()-0.5)*2*jitter*Math.sqrt(dt);
  // 沒在出題或開關關掉時,亂流本身也加速歸零,指針才會真的停平,不是慢慢飄回去。
  if(!active) gust *= Math.max(0, 1-k.gustDecay*4*dt);

  var spring = k.spring + (active?0:k.idleSpring);
  // 阻尼要跟回正力配對:這是彈簧系統,阻尼比 ζ = damping/(2√spring)。出題中的
  // spring/damping 是配好的;停止時把 spring 加上 idleSpring 卻沿用原本的 damping
  // 會變成嚴重欠阻尼(ζ≈0.2),指針像單擺一樣盪過水平再盪回來,十幾秒才停。
  // 所以閒置時改用臨界阻尼 2√spring,直接、不過衝地回到水平。
  var damping = active ? k.damping : 2*Math.sqrt(spring);
  var push = active ? gust + ctl*k.controlGain + (extra||0) : 0;
  var rate = ax.rate + (push - (ax.value-(k.trim||0))*spring)*dt;
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
// level:亂流大小 'easy' / 'medium' / 'hard'(見 CFG.turbulence),沒給或不認得就用預設。
function step(state,dt,input,active,rnd,level){
  rnd = rnd || Math.random;
  var turb = turbulenceFor(level);
  var s=clone(state);
  var inp = (input==null) ? {pitch:0,roll:0}
          : (typeof input==='number') ? {pitch:input,roll:0}
          : {pitch:input.pitch||0, roll:input.roll||0};

  // 坡度讓機頭下沉:用「這一格開始時」的坡度算,跟 rate 先更新、角度再更新是同一個做法
  var p = stepAxis({value:s.pitch, rate:s.rate, gust:s.gust},
                   dt, active?clamp(inp.pitch,-1,1):0, active, rnd, CFG.pitch,
                   -CFG.pitch.bankDrop*loadExcess(s.roll||0), turb.pitch);
  s.pitch=p.value; s.rate=p.rate; s.gust=p.gust;

  var r = stepAxis({value:s.roll, rate:s.rollRate||0, gust:s.rollGust||0},
                   dt, active?clamp(inp.roll,-1,1):0, active, rnd, CFG.roll, 0, turb.roll);
  s.roll=r.value; s.rollRate=r.rate; s.rollGust=r.gust;

  // 坡度影響高度有兩條路,都在上面:機頭下沉(stepAxis 的 extra),以及同樣姿態下需要
  // 更多攻角(vsFrom 的 trim/cos)。前者是主要、看得到的那一個;後者很小。
  s.vs = vsFrom(s.pitch,s.roll);
  s.alt = s.alt + s.vs/60*dt;

  return s;
}

/* ---------- G1000 風格姿態儀 + 高度帶／VSI ---------- */
// 姿態儀 viewBox 240×240,中心 (120,120)。G1000 的 PFD 姿態儀本身是方形面板,不是
// 圓形錶面——只有 roll 刻度那段弧線是彎的,不要整個做成圓形儀表(那是機械式 AI 的長相)。
// 高度帶／VSI 接在右邊,共用同一張 SVG,整張寬 PFD.w(見上方版面常數)。

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
  // 天空/地面蓋滿整張 PFD(包括右邊高度帶底下),而且要夠大:姿態中心在 (120,120),
  // 離它最遠的面板角落約 260px,坡度 60° 轉過去時也不能露出空白。
  return ''+
    '<rect x="0" y="0" width="'+PFD.w+'" height="'+PFD.h+'" fill="#0B0F12"/>'+
    '<g clip-path="url(#aiFace)">'+
      horizon+
        '<rect x="-400" y="-600" width="800" height="600" fill="#155FC4"/>'+          // 天空
        '<rect x="-400" y="0" width="800" height="600" fill="#3B2415"/>'+             // 地面
        '<line x1="-400" y1="0" x2="400" y2="0" stroke="#fff" stroke-width="2.5"/>'+  // 天地線
      '</g>'+
      // pitch 刻度另外再套一層「面板座標系」的 clip:上緣切在 roll 刻度那一組的下面,
      // 所以不管 pitch 怎麼飄(±25° 會讓整條 ladder 上下移動 ±90px),刻度線都不可能
      // 爬進 bank 指標的範圍——這是 QC 抓到的真問題(pitch −2° 到 −25° 之間會疊到)
      // 的根本解法,不是把 roll 刻度縮小硬閃。真機也是這樣:ladder 到某個高度就切掉。
      '<g clip-path="url(#ladderClip)">'+
        horizon+ladderSVG()+'</g>'+
      '</g>'+
    '</g>'+
    '<rect x="1" y="1" width="'+(PFD.w-2)+'" height="'+(PFD.h-2)+'" fill="none" stroke="#4A5359" stroke-width="1.5"/>'+
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

/* ---------- 高度帶 ---------- */
// 仿 G1000,照使用者給的實機照片:
//   · 帶子本體半透明、白色細框;刻度在左緣往右伸(100 ft 長、20 ft 短),數字靠左
//   · 中央讀數框:左邊尖角指著刻度;百位以上用大字,末兩位是捲動的數字鼓(20 ft 一格)
//   · 上方黑框:青色 altitude bug 圖示 + 選定高度;下方黑框:氣壓設定
//   · 帶子左緣:青色 altitude bug 標在選定高度,超出可見範圍就停在帶子邊上
//   · 帶子左緣:洋紅趨勢線,從目前高度畫到 trendSec 秒後會到的高度
// 這個高度是姿態小遊戲自己的模擬值(見檔頭註解),不是主工具改降情境的高度。

// altitude bug:青色方塊,朝刻度那一側切一個 V 形缺口。基本尺寸 6.5 寬 × 10 高,
// scale 放大。v2 把高度帶上的 bug 放大到 1.8 倍(使用者:bug 要大一些),而且改成
// 疊在讀數框「上面」畫(跟實機一樣)——v1 先畫 bug 再畫讀數框,剛好在高度上時 bug
// 整個被讀數框蓋掉,看不到「正在 bug 上」。
var BUG = {tape:1.8, sel:1.25, w:6.5, h:5, notchX:4, notchH:2};  // w 6.5:放大後右緣停在刻度數字(x0+12)左邊
function bugSVG(x,y,scale){
  var k=scale||1, w=BUG.w*k, h=BUG.h*k, nx=BUG.notchX*k, nh=BUG.notchH*k,
      pt=function(dx,dy){ return (x+dx).toFixed(1)+','+(y+dy).toFixed(1); };
  return '<polygon points="'+[pt(0,-h),pt(w,-h),pt(w,-nh),pt(nx,0),pt(w,nh),pt(w,h),pt(0,h)].join(' ')+
    '" fill="'+COLOR.cyan+'"/>';
}

// 讀數框的數字:末兩位取「最接近的 20 ft」為中心,上下各兩格一起捲;
// 百位以上跟著同一個中心值,不會出現大字已經進位、數字鼓還沒到的錯位。
function altDigits(alt){
  var a=Math.max(0,alt), n20=Math.round(a/20)*20;
  return {a:a, n20:n20, big:Math.floor(n20/100)};
}

function altReadoutSVG(alt){
  var A=ALT, cy=A.cy, x1=A.x+A.w, d=altDigits(alt);
  var tip=A.x+2.5, body=A.x+8, drumL=x1-21.5, drumR=x1-2;
  var g='<polygon points="'+tip+','+cy+' '+body+','+(cy-12.5)+' '+drumL+','+(cy-12.5)+' '+
      drumL+','+(cy-19)+' '+drumR+','+(cy-19)+' '+drumR+','+(cy+19)+' '+drumL+','+(cy+19)+' '+
      drumL+','+(cy+12.5)+' '+body+','+(cy+12.5)+'" fill="#000"/>'+
    '<text x="'+(drumL-1)+'" y="'+(cy+5)+'" font-size="14" font-weight="700" fill="#fff" '+
      'text-anchor="end">'+d.big+'</text>'+
    '<g clip-path="url(#drumClip)">';
  for(var k=-2;k<=2;k++){
    var v=d.n20+k*20, y=cy-(v-d.a)*A.drumPxPerFt;
    g+='<text x="'+(drumR-1)+'" y="'+(y+4).toFixed(1)+'" font-size="11.5" font-weight="700" fill="#fff" '+
       'text-anchor="end">'+('0'+(((v%100)+100)%100)).slice(-2)+'</text>';
  }
  return g+'</g>';
}

function altTapeSVG(state){
  var A=ALT, px=CFG.altPxPerFt, alt=state.alt, x0=A.x, h=A.bot-A.top,
      target=(state.target!=null)?state.target:CFG.altBaseline;
  var g='<rect x="'+x0+'" y="'+A.top+'" width="'+A.w+'" height="'+h+'" fill="#000" fill-opacity="0.32" '+
        'stroke="'+COLOR.frame+'" stroke-width="1"/>'+
        '<g clip-path="url(#altClip)">';
  var visFt=(A.cy-A.top)/px+20;
  for(var a=Math.ceil((alt-visFt)/20)*20; a<=alt+visFt; a+=20){
    var y=A.cy-(a-alt)*px, major=(a%100===0);
    g+='<line x1="'+x0+'" y1="'+y.toFixed(1)+'" x2="'+(x0+(major?9:5))+'" y2="'+y.toFixed(1)+'" '+
       'stroke="'+COLOR.tick+'" stroke-width="1.2"/>';
    if(major) g+='<text x="'+(x0+12)+'" y="'+(y+4).toFixed(1)+'" font-size="11" fill="'+COLOR.label+'">'+a+'</text>';
  }
  var trend=A.cy-(state.vs*CFG.trendSec/60)*px;
  if(Math.abs(trend-A.cy)>1){
    g+='<rect x="'+(x0+0.5)+'" y="'+Math.min(A.cy,trend).toFixed(1)+'" width="3" '+
       'height="'+Math.abs(trend-A.cy).toFixed(1)+'" fill="'+COLOR.magenta+'"/>';
  }
  // bug 最後畫,疊在讀數框上面(見 bugSVG 的註解);不放進 altClip,位置本來就夾在帶子內
  var bugH=BUG.h*BUG.tape;
  g+='</g>'+altReadoutSVG(alt)+
     bugSVG(x0, clamp(A.cy-(target-alt)*px, A.top+bugH, A.bot-bugH), BUG.tape);

  // 上方選定高度框、下方氣壓框(氣壓固定 1013 hPa,照實機照片)
  var sh=A.top-A.selTop;
  g+='<rect x="'+x0+'" y="'+A.selTop+'" width="'+A.w+'" height="'+sh+'" fill="#000" stroke="'+COLOR.frame+'" stroke-width="1"/>'+
     bugSVG(x0+3, A.selTop+sh/2, BUG.sel)+
     '<text x="'+(x0+A.w-3)+'" y="'+(A.selTop+sh/2+4.5)+'" font-size="13" font-weight="700" '+
       'fill="'+COLOR.cyan+'" text-anchor="end">'+target+'</text>'+
     '<rect x="'+x0+'" y="'+A.bot+'" width="'+A.w+'" height="'+A.baroH+'" fill="#000" stroke="'+COLOR.frame+'" stroke-width="1"/>'+
     // 「1013」跟「HPA」分開各自定位:用兩個 tspan 靠 text-anchor 一起對齊,有的渲染器
     // 只對齊第一段,HPA 會跑出框外(實際渲染出來才看到的)
     '<text x="'+(x0+A.w-18)+'" y="'+(A.bot+A.baroH/2+4)+'" font-size="11" font-weight="700" '+
       'fill="'+COLOR.cyan+'" text-anchor="end">1013</text>'+
     '<text x="'+(x0+A.w-3)+'" y="'+(A.bot+A.baroH/2+4)+'" font-size="7.5" font-weight="700" '+
       'fill="'+COLOR.cyan+'" text-anchor="end">HPA</text>';
  return g;
}

/* ---------- VSI ---------- */
// 照實機照片:半透明窄條、白色細框,右緣在 0 的位置往內切一個 V 形缺口;刻度在左緣,
// ±1000/±2000 標 1、2,±500/±1500 是沒有字的短刻度。指針是黑底白框、尖角朝左的
// 數值框,數值取到 50 fpm;|VS|<100 時跟 G1000 一樣只剩箭頭、不顯示數字。
function vsReadout(vs){
  return Math.abs(vs)>=100 ? String(Math.round(vs/50)*50) : null;
}

function vsiSVG(state){
  var V=VSI, cy=V.cy, k=V.pxPer1000/1000;
  var g='<path d="M'+V.x0+' '+V.top+' L'+V.x1+' '+V.top+' L'+V.x1+' '+(cy-V.notchHalf)+' L'+V.notchApex+' '+cy+
        ' L'+V.x1+' '+(cy+V.notchHalf)+' L'+V.x1+' '+V.bot+' L'+V.x0+' '+V.bot+' Z" '+
        'fill="#000" fill-opacity="0.32" stroke="'+COLOR.frame+'" stroke-width="1"/>';
  [500,1000,1500,2000].forEach(function(v){
    var major=(v%1000===0);
    [cy-v*k, cy+v*k].forEach(function(y){
      g+='<line x1="'+V.x0+'" y1="'+y+'" x2="'+(V.x0+(major?10:6))+'" y2="'+y+'" stroke="'+COLOR.tick+'" stroke-width="1.2"/>';
      if(major) g+='<text x="'+(V.x0+18)+'" y="'+(y+3.5)+'" font-size="9.5" fill="'+COLOR.label+'" '+
                   'text-anchor="middle">'+(v/1000)+'</text>';
    });
  });
  var y=(cy-clamp(state.vs,-CFG.vsMax,CFG.vsMax)*k).toFixed(1), ya=+y, label=vsReadout(state.vs);
  if(label){
    var x=V.notchApex, r=PFD.w-5;
    g+='<polygon points="'+x+','+y+' '+(x+5)+','+(ya-6)+' '+r+','+(ya-6)+' '+r+','+(ya+6)+' '+(x+5)+','+(ya+6)+'" '+
       'fill="#000" stroke="#fff" stroke-width="1"/>'+
       '<text x="'+(r-2)+'" y="'+(ya+3.3).toFixed(1)+'" font-size="9" font-weight="700" fill="#fff" '+
         'text-anchor="end">'+label+'</text>';
  }else{
    g+='<polygon points="'+V.notchApex+','+y+' '+(V.notchApex+7)+','+(ya-5)+' '+(V.notchApex+7)+','+(ya+5)+'" fill="#fff"/>';
  }
  return g;
}

function renderSVG(state){
  var drumX=ALT.x+ALT.w-21.5;
  return '<svg viewBox="0 0 '+PFD.w+' '+PFD.h+'" role="img" aria-label="姿態儀與高度帶(prototype)" '+
         'font-family="Helvetica Neue, Arial, sans-serif">'+
    '<defs>'+
      '<clipPath id="aiFace"><rect x="0" y="0" width="'+PFD.w+'" height="'+PFD.h+'"/></clipPath>'+
      // pitch 刻度的上緣:切在 roll 指標那一組(弧頂 y=20、指標與側滑條到 y=39)下面
      '<clipPath id="ladderClip"><rect x="0" y="42" width="240" height="198"/></clipPath>'+
      '<clipPath id="altClip"><rect x="'+ALT.x+'" y="'+ALT.top+'" width="'+ALT.w+'" height="'+(ALT.bot-ALT.top)+'"/></clipPath>'+
      '<clipPath id="drumClip"><rect x="'+drumX+'" y="'+(ALT.cy-19)+'" width="19.5" height="38"/></clipPath>'+
    '</defs>'+
    aiSVG(state)+altTapeSVG(state)+vsiSVG(state)+
  '</svg>';
}

return {CFG:CFG, applyDeadzone:applyDeadzone, stickCurve:stickCurve, turbulenceFor:turbulenceFor, initialState:initialState, resetAlt:resetAlt,
  vsFrom:vsFrom, loadExcess:loadExcess, step:step, renderSVG:renderSVG,
  altDigits:altDigits, vsReadout:vsReadout};
});
