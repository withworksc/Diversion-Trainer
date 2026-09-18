// 畫面：讀表單、呼叫 compute.js 組出來的字串、寫進 DOM、跑碼表。
// 這裡不做任何導航或油量計算 —— 要判斷什麼就呼叫 C8.scenario / C8.compute。
(function(){
'use strict';
var Scenario = window.C8.scenario, Compute = window.C8.compute, Attitude = window.C8.attitude;
var ITEMS = Compute.ITEMS;

var S=null;

function render(reveal){
  var r=Compute.compute(S);
  document.getElementById('brief').innerHTML=Compute.briefHTML(S,r);
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
  document.getElementById('brief').innerHTML=
    '<h2>SITUATION</h2><div class="sit">按「出題」開始。題目出現的同時開始計時。</div>';
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

// Gamepad API 的左搖桿 Y 軸:推離身體(向上)= -1,拉向自己(向下)= +1(W3C 標準搖桿映射)。
// 對應到操縱桿的直覺:推出去 = 機頭向下(負), 拉回來 = 機頭向上(正)——軸值不用取反。
// 這一段還沒接過真實搖桿測手感,方向感覺不對就是這裡要改。抓不到可用的搖桿回傳 null。
function readPad(){
  var pads=(navigator.getGamepads&&navigator.getGamepads())||[];
  for(var i=0;i<pads.length;i++){
    var gp=pads[i];
    if(!gp||!gp.axes||gp.axes.length<2) continue;
    return Attitude.applyDeadzone(gp.axes[1]);
  }
  return null;
}

// 鍵盤代打:只在開關開著時攔截方向鍵,不然會擋到頁面正常捲動
var keyPitch=0;
document.addEventListener('keydown',function(e){
  if(!attOn) return;
  if(e.key==='ArrowUp'){ keyPitch=-1; e.preventDefault(); }
  else if(e.key==='ArrowDown'){ keyPitch=1; e.preventDefault(); }
});
document.addEventListener('keyup',function(e){
  if(e.key==='ArrowUp'&&keyPitch<0) keyPitch=0;
  else if(e.key==='ArrowDown'&&keyPitch>0) keyPitch=0;
});

var NOTE_PAD='出題後開始亂流,顯示答案時指針停平。搖桿:左搖桿上下軸修正 pitch。',
    NOTE_KEY='出題後開始亂流,顯示答案時指針停平。未偵測到搖桿——先用 ↑／↓ 鍵代替(↑ 推桿機頭向下、↓ 拉桿機頭向上)。',
    noteState=null;
function setNote(hasPad){
  if(noteState===hasPad) return;
  noteState=hasPad;
  aiNote.textContent = hasPad?NOTE_PAD:NOTE_KEY;
}

// 畫面不需要每個影格都重畫:靜止時(沒出題、指針已經停平)整個 SVG 字串會跟上一次
// 一樣,重畫只是白白拆掉重建 30 幾個節點。用「四捨五入後的值有沒有變」當重畫依據,
// 迴圈本身(讀搖桿、跑 step)還是每影格都跑,只跳過沒必要的 DOM 寫入。
var attLastKey=null;
function attRenderKey(s){return Math.round(s.pitch*20)+'|'+Math.round(s.alt)+'|'+Math.round(s.vs)}

function attTick(t){
  if(attLastT==null) attLastT=t;
  var dt=Math.min((t-attLastT)/1000,0.1);
  attLastT=t;
  var pad=readPad();
  setNote(pad!==null);
  attState=Attitude.step(attState,dt,pad===null?keyPitch:pad,questionActive);
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
