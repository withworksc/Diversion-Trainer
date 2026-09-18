// 畫面：讀表單、呼叫 compute.js 組出來的字串、寫進 DOM、跑碼表。
// 這裡不做任何導航或油量計算 —— 要判斷什麼就呼叫 C8.scenario / C8.compute。
(function(){
'use strict';
var Scenario = window.C8.scenario, Compute = window.C8.compute, Attitude = window.C8.attitude,
    Chart = window.C8.map;
var ITEMS = Compute.ITEMS;

var S=null;

function render(reveal){
  var r=Compute.compute(S);
  document.getElementById('brief').innerHTML=Compute.briefHTML(S,r);
  document.getElementById('map').innerHTML=Chart.mapSVG(S,r);
  var A=reveal?Compute.answers(S,r):null;
  var h='';
  for(var i=0;i<ITEMS.length;i++){
    h+='<div class="item"><span class="num">'+(i+1)+'</span>'+
       '<h3>'+ITEMS[i][1]+'<span class="en">'+ITEMS[i][0]+'</span></h3>'+
       (A?'<div class="ans">'+A[i]+'</div>':'<div class="blank"></div>')+
       '</div>';
  }
  document.getElementById('sheet').innerHTML=h;
}

/* ---------- 計時 ---------- */
var t0=0,timer=null;
function paint(s){
  var e=document.getElementById('stopwatch');
  e.textContent=('0'+Math.floor(s/60)).slice(-2)+':'+('0'+(s%60)).slice(-2);
  e.className = s===null?'':(s<180?'t-ok':(s<300?'t-mid':'t-late'));
}
function tick(){paint(Math.floor((Date.now()-t0)/1000))}
function startClock(){clearInterval(timer);t0=Date.now();tick();timer=setInterval(tick,500)}
function stopClock(){clearInterval(timer)}

function blankSheet(){
  var h='',i;
  for(i=0;i<ITEMS.length;i++){
    h+='<div class="item"><span class="num">'+(i+1)+'</span>'+
       '<h3>'+ITEMS[i][1]+'<span class="en">'+ITEMS[i][0]+'</span></h3><div class="blank"></div></div>';
  }
  document.getElementById('sheet').innerHTML=h;
}
function idle(){
  document.getElementById('brief').innerHTML=Compute.briefBlankHTML();
  // 地圖格先放一張同尺寸的空白底,出題前後格子大小不變
  document.getElementById('map').innerHTML='<div class="mapwrap map-idle"><span>出題後顯示改降航路</span></div>';
  blankSheet();
  document.getElementById('reveal').disabled=true;
  var e=document.getElementById('stopwatch');e.textContent='00:00';e.className='';
}

function newQ(){
  var force=document.getElementById('destPick').value;
  S=Scenario.makeScenario(force);
  render(false);
  document.getElementById('reveal').disabled=false;
  startClock();
  questionActive=true;
  attState=Attitude.resetAlt(attState); // 高度歸零重算,姿態(pitch)本身不重置
}

document.getElementById('next').addEventListener('click',newQ);
document.getElementById('reveal').addEventListener('click',function(){
  stopClock();
  this.disabled=true;
  render(true);
  questionActive=false;
});

/* ---------- 姿態訓練(prototype) ----------
   開關預設關閉、手機版整個隱藏(見 css/style.css)。邏輯全部在 js/attitude.js,
   這裡只負責:讀輸入、跑 rAF 迴圈、把結果畫進 #aiHost。
   亂流只看「開關有開 && 目前有題目在跑」,不再看有沒有接搖桿——之前用搖桿在不在
   當開關,結果沒接搖桿的人按了出題完全看不到動靜,不知道是壞了還是沒啟動。
   沒搖桿時用 ↑/↓ 鍵代打(↑ = 推桿機頭向下、↓ = 拉桿機頭向上,跟飛行模擬器一致)。 */
var attOn=false, questionActive=false, attState=Attitude.initialState(), attRAF=null, attLastT=null;
var aiHost=document.getElementById('aiHost'), attToggle=document.getElementById('attToggle'),
    attPanel=document.getElementById('attitude'), colsEl=document.querySelector('.cols'),
    aiNote=document.getElementById('aiNote');

// 搖桿:軸 0 = 左右(roll)、軸 1 = 前後(pitch),這是絕大多數操縱桿(含 HOTAS)的慣例。
// 方向:推離身體 = −1 → 機頭向下;拉向自己 = +1 → 機頭向上。往右壓 = +1 → 右坡度。
// 兩個都不用取反,軸值直接就是我們要的修正方向。
//
// 注意瀏覽器的規則:Gamepad API 在「使用者按過搖桿上的按鈕」之前不會把裝置吐出來
// (防指紋追蹤)。只推搖桿、不按按鈕的話 getGamepads() 會一直是空的——所以下面
// 會把偵測狀態顯示出來,不要讓人以為是程式壞了。
// 選裝置:HOTAS 常常是「搖桿本體」跟「油門座」兩個獨立的 USB 裝置,瀏覽器會列成兩台。
// 只抓第一個有 2 軸的會抓到油門座(它軸更多、而且常常排在前面),推桿就沒反應。
// 所以先挑名字看起來像搖桿的,其次才退回第一個可用的。
// Airbus 側桿(Thrustmaster TCA Sidestick)常跟 TCA 油門座(Quadrant)一起接,所以
// quadrant/q-eng 也要排除;airbus/a320/pilot/yoke 列為優先。TCA 系列實際回報的裝置
// 名稱沒有在實機上確認過——選錯的話,姿態儀下方的狀態列會直接顯示抓到哪一台。
// 不放「flight」:Saitek 的 Pro Flight Switch/Radio/Multi Panel 也叫 flight,會被當成搖桿。
// T.Flight Hotas 這類一體機靠「hotas」抓(Warthog 的油門座也有 hotas,但先被 throttle 排除)。
// panel 是開關/無線電面板;crosswind 是 MFG 的踏板,名字裡沒有 pedal。
var PAD_SKIP=/throttle|rudder|pedal|crosswind|quadrant|q-eng|tpr|tfrp|panel/,
    PAD_PREFER=/joystick|stick|hotas|warthog|t\.16000|sidewinder|airbus|a320|pilot|yoke/;
function pickPad(pads){
  var fallback=null,i,gp,id;
  for(i=0;i<pads.length;i++){
    gp=pads[i];
    if(!gp||!gp.axes||gp.axes.length<2) continue;
    id=(gp.id||'').toLowerCase();
    if(PAD_SKIP.test(id)) continue;              // 明顯不是拿來控姿態的
    if(PAD_PREFER.test(id)) return gp;
    if(!fallback) fallback=gp;
  }
  return fallback;
}

// Safari 讀不到一般的飛行搖桿(在使用者的 Mac 上實測:macOS 認得 HOTAS Warthog,Chrome
// 讀得到,Safari 連網路上的 joystick tester 都讀不到)。確切是 WebKit 哪一條規則擋掉的
// 沒有追到原始碼,但結論很穩定,所以直接提示改用 Chromium 核心的瀏覽器。
// macOS 上的 Chrome/Edge/Brave 的 UA 也含「Safari」,要先排除掉它們。
var IS_SAFARI=/^((?!chrome|chromium|crios|edg|opr|fxios|android).)*safari/i.test(navigator.userAgent);

var padInfo=null;   // {id, axes:[…]},沒抓到就是 null
function readPad(){
  var pads=(navigator.getGamepads&&navigator.getGamepads())||[];
  var gp=pickPad(pads);
  if(!gp){ padInfo=null; return null; }
  padInfo={id:gp.id, axes:Array.prototype.slice.call(gp.axes)};
  return {pitch:Attitude.stickCurve(gp.axes[1]),   // 死區 + expo 曲線
          roll: Attitude.stickCurve(gp.axes[0])};
}

// 鍵盤代打:只在開關開著時攔截方向鍵,不然會擋到頁面正常捲動
var keyPitch=0, keyRoll=0;
document.addEventListener('keydown',function(e){
  if(!attOn) return;
  if(e.key==='ArrowUp'){ keyPitch=-1; e.preventDefault(); }
  else if(e.key==='ArrowDown'){ keyPitch=1; e.preventDefault(); }
  else if(e.key==='ArrowLeft'){ keyRoll=-1; e.preventDefault(); }
  else if(e.key==='ArrowRight'){ keyRoll=1; e.preventDefault(); }
});
document.addEventListener('keyup',function(e){
  if(e.key==='ArrowUp'&&keyPitch<0) keyPitch=0;
  else if(e.key==='ArrowDown'&&keyPitch>0) keyPitch=0;
  else if(e.key==='ArrowLeft'&&keyRoll<0) keyRoll=0;
  else if(e.key==='ArrowRight'&&keyRoll>0) keyRoll=0;
});

// 搖桿狀態列:直接把偵測到的裝置名稱跟前四軸的即時數值印出來。接了 HOTAS 卻沒反應時,
// 一眼就能看出是「根本沒偵測到」還是「偵測到了但我們讀錯軸」。
var NOTE_KEY = IS_SAFARI
  ? '你現在用的是 Safari,讀不到飛行搖桿——請改用 Chrome、Edge 或 Brave。'+
    '暫時可以用方向鍵:↑↓ 控 pitch、←→ 控坡度。'
  : '未偵測到搖桿——請先按一下搖桿上的任一按鈕(瀏覽器要按過按鈕才會把搖桿交出來)。'+
    '也可以先用方向鍵:↑↓ 控 pitch、←→ 控坡度。';
document.getElementById('attHint').classList.toggle('warn',IS_SAFARI);
function setNote(){
  var t;
  if(padInfo){
    var ax=padInfo.axes.slice(0,4).map(function(v,i){return 'ax'+i+' '+v.toFixed(2)}).join('  ');
    t='搖桿:'+padInfo.id.slice(0,34)+'  ('+padInfo.axes.length+' 軸)\n'+
      ax+'　　目前用 ax1 控 pitch、ax0 控坡度';
  }else{
    t=NOTE_KEY;
  }
  if(aiNote.textContent!==t) aiNote.textContent=t;
}

// 亂流大小(v2.1):易/中/難,強度定義在 attitude.js 的 CFG.turbulence。記在 localStorage,
// 下次打開還是同一檔——這只是個人偏好,讀寫失敗(私密瀏覽、封鎖網站資料)就用預設,
// 不影響功能。飛行中切換立刻生效,不重設姿態。
var TURB_KEY='c8.turbulence', turbPick=document.getElementById('turbPick');
function isLevel(v){ return !!v && Object.prototype.hasOwnProperty.call(Attitude.CFG.turbulence,v); }
var attLevel=(function(){
  try{ var v=localStorage.getItem(TURB_KEY); if(isLevel(v)) return v; }catch(e){}
  return Attitude.CFG.defaultTurbulence;
})();
function paintTurb(){
  var bs=turbPick.querySelectorAll('button[data-level]');
  for(var i=0;i<bs.length;i++) bs[i].setAttribute('aria-pressed', bs[i].getAttribute('data-level')===attLevel);
}
turbPick.addEventListener('click',function(e){
  var b=e.target.closest('button[data-level]');
  if(!b||!isLevel(b.getAttribute('data-level'))) return;
  attLevel=b.getAttribute('data-level');
  paintTurb();
  try{ localStorage.setItem(TURB_KEY,attLevel); }catch(err){}
});
paintTurb();

// 瀏覽器把搖桿交出來的那一刻會發這個事件,借它立刻更新狀態列
window.addEventListener('gamepadconnected',function(){ setNote(); });
window.addEventListener('gamepaddisconnected',function(){ padInfo=null; setNote(); });

// 畫面不需要每個影格都重畫:靜止時(沒出題、指針已經停平)整個 SVG 字串會跟上一次
// 一樣,重畫只是白白拆掉重建 30 幾個節點。用「四捨五入後的值有沒有變」當重畫依據,
// 迴圈本身(讀搖桿、跑 step)還是每影格都跑,只跳過沒必要的 DOM 寫入。
var attLastKey=null;
function attRenderKey(s){
  return Math.round(s.pitch*20)+'|'+Math.round(s.roll*20)+'|'+Math.round(s.alt)+'|'+Math.round(s.vs);
}

function attTick(t){
  if(attLastT==null) attLastT=t;
  var dt=Math.min((t-attLastT)/1000,0.1);
  attLastT=t;
  var pad=readPad();
  setNote();
  attState=Attitude.step(attState,dt,pad||{pitch:keyPitch,roll:keyRoll},questionActive,null,attLevel);
  var key=attRenderKey(attState);
  if(key!==attLastKey){ aiHost.innerHTML=Attitude.renderSVG(attState); attLastKey=key; }
  attRAF=requestAnimationFrame(attTick);
}

attToggle.addEventListener('click',function(){
  attOn=!attOn;
  this.setAttribute('aria-pressed',attOn);
  attPanel.hidden=!attOn;
  colsEl.classList.toggle('att-on',attOn);
  if(attOn){
    attState=Attitude.initialState();
    aiHost.innerHTML=Attitude.renderSVG(attState);
    attLastKey=attRenderKey(attState);
    attLastT=null;
    attRAF=requestAnimationFrame(attTick);
  }else if(attRAF){
    cancelAnimationFrame(attRAF);
    attRAF=null;
  }
});

idle();
})();
