// 答案模型的自動化測試:油量算式、ETA 進位、MSA/日間限定提示文字。
// 執行:npm test(或 node --test tests/)
const {test,describe}=require('node:test');
const assert=require('node:assert/strict');
const Geo=require('../js/geo.js');
const Data=require('../js/data.js');
const Scenario=require('../js/scenario.js');
const Compute=require('../js/compute.js');

function rng(seed){return function(){seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

test('compute:油量算式 req=burn+reserve,remain=fuel-burn',()=>{
  const r=rng(10);
  for(let i=0;i<2000;i++){
    const s=Scenario.makeScenario('auto',r), res=Compute.compute(s);
    assert.ok(Math.abs(res.req-(res.burn+Data.RESERVE))<1e-9);
    assert.ok(Math.abs(res.remain-(s.fuel-res.burn))<1e-9);
    assert.ok(res.burn>0);
  }
});

test('compute:距離與航向跟 Geo 直接算的結果一致(不是另外抄一份公式)',()=>{
  const r=rng(11);
  for(let i=0;i<2000;i++){
    const s=Scenario.makeScenario('auto',r), res=Compute.compute(s);
    const d=Geo.dist(s.pos,Data.AD[s.dest]), tt=Geo.trueBrg(s.pos,Data.AD[s.dest]);
    assert.ok(Math.abs(res.dirD-d)<1e-9);
    assert.ok(Math.abs(res.dirTT-tt)<1e-9);
    assert.ok(Math.abs(res.totD-d)<1e-9); // buildRoute 目前永遠是兩點直線
  }
});

test('compute:目前航路永遠是兩點直線,r.multi 恆為 false',()=>{
  // buildRoute 改成多點連線時,這個測試會失敗,提醒要一起檢查 legTable/answers 的分段顯示
  const r=rng(12);
  for(let i=0;i<2000;i++){
    const s=Scenario.makeScenario('auto',r), res=Compute.compute(s);
    assert.equal(res.multi,false);
    assert.equal(res.legs.length,1);
  }
});

describe('compute:ETA 進位跨過 60 分與跨過午夜',()=>{
  test('mm 加總超過 60 分要進位到下一個小時',()=>{
    assert.equal(Compute.hhmm(10,75),'1115');
  });
  test('跨過午夜要回到 00 開頭',()=>{
    assert.equal(Compute.hhmm(23,90),'0030');
  });
});

test('answers:HOLD 觸發只在考題標記 hold 時出現',()=>{
  const pos=Scenario.makePos(rng(20));
  const base={pos,dest:'RCFN',hh:10,mm:0,gs:110,alt:2500,fuel:20,lr:false};
  const hold={...base,trig:{zh:'x',hold:true}}, turn={...base,trig:{zh:'x',hold:false}};
  const rHold=Compute.compute(hold), rTurn=Compute.compute(turn);
  const aHold=Compute.answers(hold,rHold), aTurn=Compute.answers(turn,rTurn);
  assert.match(aHold[2],/HOLD/);
  assert.match(aTurn[2],/TURN/);
  assert.doesNotMatch(aTurn[2],/HOLD/);
});

test('answers:MSA 提示只在 r.ridge 為真時出現(大漢山字樣)',()=>{
  const trig={zh:'x',hold:false};
  const s1={pos:{lat:22.20,lon:120.90,fi:3.0,n:'x',vor:'HCN'},dest:'RCFN',hh:10,mm:0,gs:110,alt:2500,fuel:20,lr:false,trig};
  const s2={pos:{lat:22.55,lon:120.98,fi:6.5,n:'x',vor:'GID'},dest:'RCFN',hh:10,mm:0,gs:110,alt:2500,fuel:20,lr:false,trig};
  const r1=Compute.compute(s1), r2=Compute.compute(s2);
  assert.equal(r1.ridge,true); assert.equal(r2.ridge,false);
  assert.match(Compute.answers(s1,r1)[4],/大漢山/);
  assert.doesNotMatch(Compute.answers(s2,r2)[4],/大漢山/);
});

test('answers:無跑道燈的場才會出現日間限定警語',()=>{
  const trig={zh:'x',hold:false};
  const litDest={pos:{lat:22.20,lon:120.90,fi:3.0,n:'x',vor:'HCN'},dest:'RCFN',hh:10,mm:0,gs:110,alt:2500,fuel:20,lr:false,trig};
  const darkDest={...litDest,dest:'RCLY'};
  assert.match(Compute.answers(darkDest,Compute.compute(darkDest))[6],/日間限定/);
  assert.doesNotMatch(Compute.answers(litDest,Compute.compute(litDest))[6],/日間限定/);
});

test('answers:油量不足時,燃油答案要出現紅字警告',()=>{
  const trig={zh:'x',hold:false};
  // 故意擺一個很遠的目的地、油量給很低,逼出 fuel<req 的分支
  const s={pos:{lat:22.05,lon:120.90,fi:1.5,n:'x',vor:'HCN'},dest:'RCKH',hh:10,mm:0,gs:90,alt:3000,fuel:1.0,lr:false,trig};
  const r=Compute.compute(s);
  assert.ok(s.fuel<r.req);
  assert.match(Compute.answers(s,r)[6],/不可接受/);
});
