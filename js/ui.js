// 畫面：讀表單、呼叫 compute.js 組出來的字串、寫進 DOM、跑碼表。
// 這裡不做任何導航或油量計算 —— 要判斷什麼就呼叫 C8.scenario / C8.compute。
(function(){
'use strict';
var Scenario = window.C8.scenario, Compute = window.C8.compute;
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
}

document.getElementById('next').addEventListener('click',newQ);
document.getElementById('reveal').addEventListener('click',function(){
  stopClock();
  this.disabled=true;
  render(true);
});
idle();
})();
