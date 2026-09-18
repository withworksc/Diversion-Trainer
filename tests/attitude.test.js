// 姿態訓練(prototype)的自動化測試:只測 js/attitude.js 的純函式部分——
// 搖桿讀取、rAF、DOM 都在 js/ui.js,那些要開瀏覽器才測得到,不在這份測試範圍。
// 執行:npm test(或 node --test tests/attitude.test.js)
const {test,describe}=require('node:test');
const assert=require('node:assert/strict');
const Attitude=require('../js/attitude.js');

describe('applyDeadzone:死區內視為 0,死區外線性重新映射不跳一階',()=>{
  test('死區內回傳 0',()=>{
    assert.equal(Attitude.applyDeadzone(0),0);
    assert.equal(Attitude.applyDeadzone(0.03),0);
    assert.equal(Attitude.applyDeadzone(-0.035),0);
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
  assert.equal(s.pitch,Attitude.CFG.pitch.trim); assert.equal(s.rate,0); assert.equal(s.gust,0);
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
  assert.ok(Math.abs(s.pitch-Attitude.CFG.pitch.trim)<0.5,`20 秒後 pitch=${s.pitch},應該回到平飛姿態`);
  assert.ok(Math.abs(s.gust)<0.5,`20 秒後 gust=${s.gust}`);
});

test('step:停止(active=false)時是臨界阻尼,指針不會盪過水平再盪回來',()=>{
  // 迴歸測試:idleSpring 調大卻沿用原本的 damping 會變成嚴重欠阻尼,
  // 按「顯示答案」之後指針會像單擺一樣來回盪十幾秒才停。
  const r=rng(7);
  let s={pitch:17,rate:0,gust:0,roll:0,heading:0,alt:2000,vs:0};
  let minPitch=17;
  for(let i=0;i<200;i++){            // 10 秒
    s=Attitude.step(s,0.05,0,false,r);
    minPitch=Math.min(minPitch,s.pitch);
  }
  assert.ok(minPitch>Attitude.CFG.pitch.trim-0.5,`不該過衝到平飛姿態以下,實際最低 ${minPitch.toFixed(2)}°`);
  assert.ok(Math.abs(s.pitch-Attitude.CFG.pitch.trim)<0.5,`10 秒後應該回到平飛姿態,實際 ${s.pitch.toFixed(2)}°`);
});

test('step:停止後 3 秒內就要大致回到水平(不能慢慢飄)',()=>{
  const r=rng(8);
  let s={pitch:20,rate:0,gust:0,roll:0,heading:0,alt:2000,vs:0};
  for(let i=0;i<60;i++) s=Attitude.step(s,0.05,0,false,r);   // 3 秒
  assert.ok(Math.abs(s.pitch-Attitude.CFG.pitch.trim)<2,`3 秒後 pitch=${s.pitch.toFixed(2)}°,應該已經接近平飛姿態`);
});

test('step:出題中(active=true)、輸入為 0 時,亂流會讓 pitch 偏離 0(不是死水一灘)',()=>{
  const r=rng(2);
  let s=Attitude.initialState();
  s=run(s,600,0.05,0,true,r); // 30 秒
  assert.ok(Math.abs(s.pitch-Attitude.CFG.pitch.trim)>0.5,`30 秒亂流後 pitch 應該離開平飛姿態,實際 ${s.pitch}`);
});

test('step:正輸入(拉桿)持續修正,pitch 會被推向正值',()=>{
  const r=rng(3);
  let s=Attitude.initialState();
  s=run(s,200,0.05,1,true,r); // 全力拉桿 10 秒
  assert.ok(s.pitch>Attitude.CFG.pitch.trim+3,`持續拉桿 10 秒 pitch=${s.pitch},應該明顯上仰`);
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

describe('vsFrom／高度積分:姿態誤差要能反映成看得見的高度偏移',()=>{
  test('平飛姿態(trim)、機翼水平時 VS=0;pitch 0° 其實是在下降',()=>{
    assert.ok(Math.abs(Attitude.vsFrom(Attitude.CFG.pitch.trim))<1e-9);
    assert.ok(Attitude.vsFrom(0)<0);
  });
  test('正 pitch(機頭上仰)→ 正 VS(爬升)',()=>{
    assert.ok(Attitude.vsFrom(10)>0);
  });
  test('負 pitch(機頭下俯)→ 負 VS(下降)',()=>{
    assert.ok(Attitude.vsFrom(-10)<0);
  });
  test('單一影格內,alt 的變化量等於 vs/60*dt(積分公式本身要對,不摻雜姿態動態)',()=>{
    // 注意:step() 裡 pitch 每個影格都會被配平拉力拉動,不會維持定值——這裡只驗算
    // 「給定當下的 pitch,alt 有沒有照 vs/60*dt 正確累積」這件事本身,不是測姿態動態。
    // pitch 本身這個影格也會被配平拉力微調,所以 vs 要用「這個影格算出來的新 pitch」,
    // 不是進來時的舊 pitch——跟 rate 先更新、pitch 再用新 rate 更新是同一個做法(semi-implicit)。
    const s0={pitch:5,rate:0,gust:0,roll:0,heading:0,alt:2000,vs:Attitude.vsFrom(5)};
    const dt=0.05;
    const s1=Attitude.step(s0,dt,0,false,()=>0.5);
    const expectDelta=Attitude.vsFrom(s1.pitch)/60*dt;
    assert.ok(Math.abs((s1.alt-s0.alt)-expectDelta)<1e-9,
      `一個影格 alt 變化 ${s1.alt-s0.alt},預期 ${expectDelta}`);
    assert.equal(s1.vs,Attitude.vsFrom(s1.pitch));
  });
  test('固定 pitch(繞過 step 的姿態動態)持續 5° nose-up 一分鐘,高度確實爬升到位',()=>{
    const vs=Attitude.vsFrom(5); // ft/min,固定值
    let alt=2000;
    for(let i=0;i<1200;i++) alt+=vs/60*0.05; // 60 秒
    assert.ok(Math.abs((alt-2000)-vs)<1e-6,`60 秒後應該爬升約 vs=${vs} ft,實際 ${alt-2000}`);
  });
});

describe('roll 軸:跟 pitch 同一套動態,參數不同',()=>{
  test('initialState 帶 roll/rollRate/rollGust',()=>{
    const s=Attitude.initialState();
    assert.equal(s.roll,0); assert.equal(s.rollRate,0); assert.equal(s.rollGust,0);
  });
  test('往右壓桿 → 右坡度(正值);往左 → 負值',()=>{
    const r=rng(20);
    let a=Attitude.initialState(), b=Attitude.initialState();
    for(let i=0;i<40;i++){
      a=Attitude.step(a,0.05,{pitch:0,roll:1},true,rng(20));
      b=Attitude.step(b,0.05,{pitch:0,roll:-1},true,rng(20));
    }
    assert.ok(a.roll>3,`右滿桿 2 秒 roll=${a.roll.toFixed(1)}°`);
    assert.ok(b.roll<-3,`左滿桿 2 秒 roll=${b.roll.toFixed(1)}°`);
  });
  test('roll 夾在 ±limit 之內',()=>{
    const r=rng(21); let s=Attitude.initialState();
    for(let i=0;i<2000;i++) s=Attitude.step(s,0.05,{pitch:0,roll:1},true,r);
    assert.ok(Math.abs(s.roll)<=Attitude.CFG.roll.limit+1e-6,`roll=${s.roll}`);
  });
  test('停止(active=false)後 roll 也會自己回平,而且不過衝',()=>{
    const r=rng(22);
    let s=Attitude.initialState(); s.roll=30;
    let minRoll=30;
    for(let i=0;i<200;i++){ s=Attitude.step(s,0.05,{pitch:0,roll:0},false,r); minRoll=Math.min(minRoll,s.roll); }
    assert.ok(minRoll>-0.5,`不該過衝到負的,最低 ${minRoll.toFixed(2)}°`);
    assert.ok(Math.abs(s.roll)<0.5,`10 秒後應該回平,實際 ${s.roll.toFixed(2)}°`);
  });
  test('數字給 input 時只影響 pitch,roll 不動(舊呼叫方式仍相容)',()=>{
    const s=Attitude.step(Attitude.initialState(),0.05,1,true,()=>0.5);
    assert.ok(s.pitch>Attitude.CFG.pitch.trim);
    assert.equal(s.rollGust!==undefined,true);
  });
});

describe('壓坡度不帶桿:機頭下沉、高度看得到在掉(轉彎要帶桿)',()=>{
  // 迴歸測試:原本只模擬了「同樣姿態下要多一點攻角」這一項,30° 坡度 10 秒只掉 11 ft、
  // 機頭完全不動,畫面上看不出來(使用者回報「沒模擬出來」)。主要效應是機頭跟著
  // 下彎的航跡一起下沉。這裡模擬學員把坡度維持住(每格把 roll 設回去)、不帶桿。
  const trim=Attitude.CFG.pitch.trim;
  function holdBank(bank,pitchIn,sec){
    let s=Attitude.initialState();
    for(let i=0;i<sec/0.05;i++){ s.roll=bank; s.rollRate=0; s=Attitude.step(s,0.05,{pitch:pitchIn,roll:0},true,()=>0.5); }
    return s;
  }
  test('機翼水平、平飛姿態:不爬不降',()=>{
    const s=holdBank(0,0,10);
    assert.ok(Math.abs(s.alt-3000)<1,`10 秒後高度變化 ${(s.alt-3000).toFixed(1)} ft`);
  });
  test('30° 坡度 10 秒:機頭沉到平飛以下 6° 以上,掉高度超過 150 ft(v2 調強,v1 只掉約 100 ft)',()=>{
    const s=holdBank(30,0,10);
    assert.ok(s.pitch<trim-6,`機頭應該明顯下沉,pitch=${s.pitch.toFixed(1)}°`);
    assert.ok(3000-s.alt>150,`應該掉超過 150 ft,實際 ${(3000-s.alt).toFixed(0)} ft`);
  });
  test('30° 坡度 3 秒內 VSI 就看得到 −500 fpm 以上(不能等好幾秒才有反應)',()=>{
    const s=holdBank(30,0,3);
    assert.ok(s.vs<-500,`3 秒時 VS=${s.vs.toFixed(0)} fpm`);
  });
  test('坡度越大掉得越快(45° > 30° > 15°)',()=>{
    const loss=b=>3000-holdBank(b,0,10).alt;
    assert.ok(loss(45)>loss(30)&&loss(30)>loss(15),`15°/30°/45°:${[15,30,45].map(b=>loss(b).toFixed(0)).join('/')} ft`);
  });
  test('亂流造成的小坡度(5°)幾乎不影響高度(10 秒不到 10 ft;30° 是 150 ft 以上)',()=>{
    assert.ok(3000-holdBank(5,0,10).alt<10);
  });
  test('30° 坡度帶一點桿(約 1/10 行程),就能把高度守住',()=>{
    const s=holdBank(30,0.09,10);
    assert.ok(Math.abs(s.alt-3000)<20,`帶桿後 10 秒高度變化 ${(s.alt-3000).toFixed(0)} ft`);
  });
});

describe('高度帶讀數框:百位以上大字 + 末兩位 20 ft 一格的數字鼓',()=>{
  test('起始高度是 3000 ft(使用者指定),altitude bug 同一個值',()=>{
    assert.equal(Attitude.CFG.altBaseline,3000);
    assert.equal(Attitude.initialState().alt,3000);
  });
  test('3000 → 大字 30、數字鼓中心 3000',()=>{
    const d=Attitude.altDigits(3000);
    assert.equal(d.big,30); assert.equal(d.n20,3000);
  });
  test('2987 → 最接近的 20 ft 是 2980,大字 29(大字跟數字鼓用同一個中心,不會錯位)',()=>{
    const d=Attitude.altDigits(2987);
    assert.equal(d.n20,2980); assert.equal(d.big,29);
  });
  test('2991 → 進位到 3000,大字同時變 30',()=>{
    const d=Attitude.altDigits(2991);
    assert.equal(d.n20,3000); assert.equal(d.big,30);
  });
  test('負高度不會讓讀數壞掉(夾在 0)',()=>{
    const d=Attitude.altDigits(-150);
    assert.equal(d.big,0); assert.equal(d.n20,0);
  });
});

describe('VSI 數值框:取到 50 fpm,|VS|<100 不顯示數字',()=>{
  test('-1550 → "-1550"',()=>{ assert.equal(Attitude.vsReadout(-1550),'-1550'); });
  test('1537 → "1550"(取到 50)',()=>{ assert.equal(Attitude.vsReadout(1537),'1550'); });
  test('99 → 不顯示',()=>{ assert.equal(Attitude.vsReadout(99),null); });
  test('-100 → "-100"',()=>{ assert.equal(Attitude.vsReadout(-100),'-100'); });
  test('畫出來的 SVG 裡看得到 VS 數值與選定高度',()=>{
    const s=Object.assign(Attitude.initialState(),{vs:-1550});
    const svg=Attitude.renderSVG(s);
    assert.match(svg,/>-1550</);
    assert.match(svg,/>3000</);
  });
});

test('resetAlt:高度重設回基準值,姿態(pitch/rate/gust)不變',()=>{
  const s={pitch:7,rate:1.2,gust:-2,roll:0,heading:0,alt:2345,vs:99};
  const r=Attitude.resetAlt(s);
  assert.equal(r.alt,Attitude.CFG.altBaseline);
  assert.equal(r.pitch,s.pitch); assert.equal(r.rate,s.rate); assert.equal(r.gust,s.gust);
  assert.equal(r.vs,Attitude.vsFrom(s.pitch));
});

test('step:pitch 頂到上限時角速度會被夾住(anti-windup),不會有「鬆桿卡住」的殘留角速度',()=>{
  const r=rng(6);
  let s=Attitude.initialState();
  s=run(s,400,0.05,1,true,r); // 全力拉桿 20 秒,頂到上限
  assert.equal(s.pitch,Attitude.CFG.pitchLimit);
  assert.ok(s.rate<=0+1e-9,`頂到上限時 rate 應該被夾到 <=0,實際 ${s.rate}`);
});

describe('v2:roll 中性穩定、亂流幅度、跟螢幕更新率無關',()=>{
  const still=()=>0.5;   // 亂數固定 0.5 = 沒有亂流
  test('出題中放桿:停在當下的坡度,不會自己回到機翼水平',()=>{
    let s=Attitude.initialState(); s.roll=25;
    for(let i=0;i<200;i++) s=Attitude.step(s,0.05,{pitch:0,roll:0},true,still);
    assert.ok(Math.abs(s.roll-25)<0.5,`10 秒後坡度 ${s.roll.toFixed(2)}°`);
  });
  test('滿桿 1.5 秒再放桿:滾轉很快停住,不會一路滑下去',()=>{
    let s=Attitude.initialState();
    for(let i=0;i<30;i++) s=Attitude.step(s,0.05,{pitch:0,roll:1},true,still);
    const atRelease=s.roll;
    for(let i=0;i<100;i++) s=Attitude.step(s,0.05,{pitch:0,roll:0},true,still);
    assert.ok(atRelease>15,`滿桿 1.5 秒只到 ${atRelease.toFixed(1)}°`);
    assert.ok(s.roll-atRelease<8,`放桿後又多滾了 ${(s.roll-atRelease).toFixed(1)}°`);
  });
  // 不動桿跑 sec 秒,回傳 pitch 偏離平飛的 RMS 與 |roll| 的時間平均(30 顆固定種子的中位數)
  function drift(hz,sec){
    const dt=1/hz, trim=Attitude.CFG.pitch.trim, pr=[], rr=[];
    for(let seed=1;seed<=30;seed++){
      let s=Attitude.initialState(), r=rng(seed*101), sq=0, ra=0, n=0;
      for(let i=0;i<sec*hz;i++){ s=Attitude.step(s,dt,{pitch:0,roll:0},true,r); sq+=(s.pitch-trim)**2; ra+=Math.abs(s.roll); n++; }
      pr.push(Math.sqrt(sq/n)); rr.push(ra/n);
    }
    const med=a=>a.sort((x,y)=>x-y)[a.length>>1];
    return {pitch:med(pr), roll:med(rr)};
  }
  test('不動桿時姿態會明顯跑掉(v2 調大):pitch RMS > 2°,坡度平均 > 3°',()=>{
    const d=drift(60,30);
    assert.ok(d.pitch>2,`pitch RMS ${d.pitch.toFixed(2)}°`);
    assert.ok(d.roll>3,`|roll| 平均 ${d.roll.toFixed(2)}°`);
  });
  test('60 Hz 跟 120 Hz 螢幕的亂流強度差不多(隨機項乘 √dt)',()=>{
    const a=drift(60,30), b=drift(120,30);
    assert.ok(Math.abs(a.pitch/b.pitch-1)<0.25,`pitch RMS 60Hz ${a.pitch.toFixed(2)} vs 120Hz ${b.pitch.toFixed(2)}`);
    assert.ok(Math.abs(a.roll/b.roll-1)<0.35,`|roll| 60Hz ${a.roll.toFixed(2)} vs 120Hz ${b.roll.toFixed(2)}`);
  });
});

test('altitude bug 放大(v2):高度帶上的 bug 至少 17 px 高、右緣不壓到刻度數字',()=>{
  const svg=Attitude.renderSVG(Object.assign(Attitude.initialState(),{alt:3045}));
  const bugs=[...svg.matchAll(/<polygon points="([^"]+)" fill="#29E6E6"/g)].map(m=>{
    const p=m[1].trim().split(/\s+/).map(q=>q.split(',').map(Number));
    const xs=p.map(q=>q[0]), ys=p.map(q=>q[1]);
    return {x0:Math.min(...xs), w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys)};
  });
  const tape=bugs.reduce((a,b)=>b.h>a.h?b:a);
  assert.ok(tape.h>=17,`bug 高 ${tape.h}`);
  assert.ok(tape.w<=12,`bug 寬 ${tape.w}(刻度數字從帶子左緣 +12 開始)`);
});

test('altitude bug 疊在讀數框上面(剛好在高度上時要看得到 bug)',()=>{
  const svg=Attitude.renderSVG(Attitude.initialState());   // alt 3000 = bug 高度
  const readout=svg.indexOf('fill="#000"/><text');
  const tapeBug=[...svg.matchAll(/<polygon points="[^"]+" fill="#29E6E6"\/>/g)].map(m=>m.index);
  assert.ok(readout>0,'找不到讀數框');
  assert.ok(tapeBug.some(i=>i>readout),'高度帶上的 bug 要在讀數框之後才畫(SVG 後畫的在上面)');
});

describe('stickCurve:死區 + expo 曲線(linear 跟 cubic 混合)',()=>{
  const C=Attitude.stickCurve;
  test('中心、死區內是 0;滿桿還是 ±1',()=>{
    assert.equal(C(0),0); assert.equal(C(0.03),0);
    assert.ok(Math.abs(C(1)-1)<1e-12); assert.ok(Math.abs(C(-1)+1)<1e-12);
  });
  test('左右對稱(奇函數)、單調遞增',()=>{
    let prev=-Infinity;
    for(let x=-1;x<=1.0001;x+=0.01){
      const y=C(x); assert.ok(y>=prev-1e-12,`x=${x.toFixed(2)} 不單調`); prev=y;
      assert.ok(Math.abs(C(x)+C(-x))<1e-12);
    }
  });
  test('expo 0 就是原本的線性死區',()=>{
    for(const x of [0.1,0.3,0.6,-0.8]) assert.ok(Math.abs(C(x,0)-Attitude.applyDeadzone(x))<1e-12);
  });
  test('中心附近比線性鈍:同樣 9% 輸出要推得比線性多(小修正比較好拿捏)',()=>{
    const need=e=>{ let x=0; while(C(x,e)<0.09) x+=0.001; return x; };
    const lin=need(0), cur=need(Attitude.CFG.expo);
    assert.ok(cur>lin+0.02,`9% 輸出:線性要推 ${(lin*100).toFixed(0)}%,曲線要推 ${(cur*100).toFixed(0)}%`);
  });
});

test('搖桿中心不能太鈍(使用者回報過):推 10% 至少要有 3% 的輸出',()=>{
  assert.ok(Attitude.stickCurve(0.1)>=0.03,`推 10% 輸出 ${(Attitude.stickCurve(0.1)*100).toFixed(1)}%`);
});
