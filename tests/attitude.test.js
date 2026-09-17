// 姿態訓練(prototype)的自動化測試:只測 js/attitude.js 的純函式部分——
// 搖桿讀取、rAF、DOM 都在 js/ui.js,那些要開瀏覽器才測得到,不在這份測試範圍。
// 執行:npm test(或 node --test tests/attitude.test.js)
const {test,describe}=require('node:test');
const assert=require('node:assert/strict');
const Attitude=require('../js/attitude.js');

describe('applyDeadzone:死區內視為 0,死區外線性重新映射不跳一階',()=>{
  test('死區內回傳 0',()=>{
    assert.equal(Attitude.applyDeadzone(0),0);
    assert.equal(Attitude.applyDeadzone(0.05),0);
    assert.equal(Attitude.applyDeadzone(-0.07),0);
  });
  test('死區邊界剛好是 0(連續,不跳一階)',()=>{
    const dz=Attitude.CFG.deadzone;
    assert.ok(Math.abs(Attitude.applyDeadzone(dz+1e-6))<1e-3);
  });
  test('滿桿(±1)還是回傳 ±1',()=>{
    assert.equal(Attitude.applyDeadzone(1),1);
    assert.equal(Attitude.applyDeadzone(-1),-1);
  });
  test('保留正負號',()=>{
    assert.ok(Attitude.applyDeadzone(0.5)>0);
    assert.ok(Attitude.applyDeadzone(-0.5)<0);
  });
});

test('initialState:全部歸零,水平無亂流,高度在基準值',()=>{
  const s=Attitude.initialState();
  assert.equal(s.pitch,0); assert.equal(s.rate,0); assert.equal(s.gust,0);
  assert.equal(s.alt,Attitude.CFG.altBaseline); assert.equal(s.vs,0);
});

function rng(seed){return function(){seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function run(state,steps,dt,input,active,rnd){
  for(let i=0;i<steps;i++) state=Attitude.step(state,dt,input,active,rnd);
  return state;
}

test('step:沒在出題(active=false)時,亂流跟指針都會自己收斂回水平',()=>{
  const r=rng(1);
  let s={pitch:15,rate:0,gust:8,roll:0,heading:0,alt:2000,vs:0};
  s=run(s,400,0.05,0,false,r); // 20 秒
  assert.ok(Math.abs(s.pitch)<0.5,`20 秒後 pitch=${s.pitch}`);
  assert.ok(Math.abs(s.gust)<0.5,`20 秒後 gust=${s.gust}`);
});

test('step:出題中(active=true)、輸入為 0 時,亂流會讓 pitch 偏離 0(不是死水一灘)',()=>{
  const r=rng(2);
  let s=Attitude.initialState();
  s=run(s,600,0.05,0,true,r); // 30 秒
  assert.ok(Math.abs(s.pitch)>0.5,`30 秒亂流後 pitch 應該有偏移,實際 ${s.pitch}`);
});

test('step:正輸入(拉桿)持續修正,pitch 會被推向正值',()=>{
  const r=rng(3);
  let s=Attitude.initialState();
  s=run(s,200,0.05,1,true,r); // 全力拉桿 10 秒
  assert.ok(s.pitch>3,`持續拉桿 10 秒 pitch=${s.pitch},應該明顯轉正`);
});

test('step:負輸入(推桿)持續修正,pitch 會被推向負值',()=>{
  const r=rng(4);
  let s=Attitude.initialState();
  s=run(s,200,0.05,-1,true,r);
  assert.ok(s.pitch<-3,`持續推桿 10 秒 pitch=${s.pitch},應該明顯轉負`);
});

test('step:pitch 永遠夾在 ±pitchLimit 之內,不會失控爆出畫面',()=>{
  const r=rng(5);
  let s=Attitude.initialState();
  s=run(s,2000,0.05,1,true,r); // 100 秒持續全力拉桿,刻意逼到上限
  assert.ok(s.pitch<=Attitude.CFG.pitchLimit+1e-6);
  assert.ok(s.pitch>=-Attitude.CFG.pitchLimit-1e-6);
});

test('step:同一組種子重現同一段亂流(給定同一個 rnd,結果要一致)',()=>{
  const a=run(Attitude.initialState(),100,0.05,0,true,rng(42));
  const b=run(Attitude.initialState(),100,0.05,0,true,rng(42));
  assert.deepEqual(a,b);
});

test('renderSVG:回傳字串,含 svg 標籤,不會丟例外(邊界值也試一次)',()=>{
  for(const pitch of [0, Attitude.CFG.pitchLimit, -Attitude.CFG.pitchLimit]){
    const svg=Attitude.renderSVG({pitch:pitch,roll:0,rate:0,gust:0,heading:0,alt:2000,vs:0});
    assert.match(svg,/^<svg/);
    assert.match(svg,/<\/svg>$/);
  }
});

describe('vsFromPitch／高度積分:姿態誤差要能反映成看得見的高度偏移',()=>{
  test('pitch=0 時 VS=0',()=>{
    assert.equal(Attitude.vsFromPitch(0),0);
  });
  test('正 pitch(機頭上仰)→ 正 VS(爬升)',()=>{
    assert.ok(Attitude.vsFromPitch(10)>0);
  });
  test('負 pitch(機頭下俯)→ 負 VS(下降)',()=>{
    assert.ok(Attitude.vsFromPitch(-10)<0);
  });
  test('單一影格內,alt 的變化量等於 vs/60*dt(積分公式本身要對,不摻雜姿態動態)',()=>{
    // 注意:step() 裡 pitch 每個影格都會被配平拉力拉動,不會維持定值——這裡只驗算
    // 「給定當下的 pitch,alt 有沒有照 vs/60*dt 正確累積」這件事本身,不是測姿態動態。
    // pitch 本身這個影格也會被配平拉力微調,所以 vs 要用「這個影格算出來的新 pitch」,
    // 不是進來時的舊 pitch——跟 rate 先更新、pitch 再用新 rate 更新是同一個做法(semi-implicit)。
    const s0={pitch:5,rate:0,gust:0,roll:0,heading:0,alt:2000,vs:Attitude.vsFromPitch(5)};
    const dt=0.05;
    const s1=Attitude.step(s0,dt,0,false,()=>0.5);
    const expectDelta=Attitude.vsFromPitch(s1.pitch)/60*dt;
    assert.ok(Math.abs((s1.alt-s0.alt)-expectDelta)<1e-9,
      `一個影格 alt 變化 ${s1.alt-s0.alt},預期 ${expectDelta}`);
    assert.equal(s1.vs,Attitude.vsFromPitch(s1.pitch));
  });
  test('固定 pitch(繞過 step 的姿態動態)持續 5° nose-up 一分鐘,高度確實爬升到位',()=>{
    const vs=Attitude.vsFromPitch(5); // ft/min,固定值
    let alt=2000;
    for(let i=0;i<1200;i++) alt+=vs/60*0.05; // 60 秒
    assert.ok(Math.abs((alt-2000)-vs)<1e-6,`60 秒後應該爬升約 vs=${vs} ft,實際 ${alt-2000}`);
  });
});

test('resetAlt:高度重設回基準值,姿態(pitch/rate/gust)不變',()=>{
  const s={pitch:7,rate:1.2,gust:-2,roll:0,heading:0,alt:2345,vs:99};
  const r=Attitude.resetAlt(s);
  assert.equal(r.alt,Attitude.CFG.altBaseline);
  assert.equal(r.pitch,s.pitch); assert.equal(r.rate,s.rate); assert.equal(r.gust,s.gust);
  assert.equal(r.vs,Attitude.vsFromPitch(s.pitch));
});

test('step:pitch 頂到上限時角速度會被夾住(anti-windup),不會有「鬆桿卡住」的殘留角速度',()=>{
  const r=rng(6);
  let s=Attitude.initialState();
  s=run(s,400,0.05,1,true,r); // 全力拉桿 20 秒,頂到上限
  assert.equal(s.pitch,Attitude.CFG.pitchLimit);
  assert.ok(s.rate<=0+1e-9,`頂到上限時 rate 應該被夾到 <=0,實際 ${s.rate}`);
});
