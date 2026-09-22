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
    const d=Geo.dist(s.pos,Data.DEST[s.dest]), tt=Geo.trueBrg(s.pos,Data.DEST[s.dest]);
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
  const hold={...base,trig:{id:'runway',hold:true}}, turn={...base,trig:{id:'instructor',hold:false}};
  const rHold=Compute.compute(hold), rTurn=Compute.compute(turn);
  const aHold=Compute.answers(hold,rHold), aTurn=Compute.answers(turn,rTurn);
  assert.match(aHold[2],/HOLD/);
  assert.match(aTurn[2],/TURN/);
  assert.doesNotMatch(aTurn[2],/HOLD/);
});

test('answers:MSA 提示只在 r.ridge 為真時出現(大漢山字樣)',()=>{
  const trig={id:'instructor',hold:false};
  const s1={pos:{lat:22.20,lon:120.90,fi:3.0,ref:'DR',side:'on',d:0.4,vor:'HCN'},dest:'RCFN',hh:10,mm:0,gs:110,alt:2500,fuel:20,lr:false,trig};
  const s2={pos:{lat:22.55,lon:120.98,fi:6.5,ref:'JL',side:'on',d:0.4,vor:'GID'},dest:'RCFN',hh:10,mm:0,gs:110,alt:2500,fuel:20,lr:false,trig};
  const r1=Compute.compute(s1), r2=Compute.compute(s2);
  assert.equal(r1.ridge,true); assert.equal(r2.ridge,false);
  assert.match(Compute.answers(s1,r1)[4],/大漢山/);
  assert.doesNotMatch(Compute.answers(s2,r2)[4],/大漢山/);
});

test('answers:無跑道燈的場才會出現日間限定警語',()=>{
  const trig={id:'instructor',hold:false};
  const litDest={pos:{lat:22.20,lon:120.90,fi:3.0,ref:'DR',side:'on',d:0.4,vor:'HCN'},dest:'RCFN',hh:10,mm:0,gs:110,alt:2500,fuel:20,lr:false,trig};
  const darkDest={...litDest,dest:'RCLY'};
  assert.match(Compute.answers(darkDest,Compute.compute(darkDest))[6],/日間限定/);
  assert.doesNotMatch(Compute.answers(litDest,Compute.compute(litDest))[6],/日間限定/);
});

test('answers:油量不足時,燃油答案要出現紅字警告',()=>{
  const trig={id:'instructor',hold:false};
  // 故意擺一個很遠的目的地、油量給很低,逼出 fuel<req 的分支
  const s={pos:{lat:22.05,lon:120.90,fi:1.5,ref:'DR',side:'on',d:0.4,vor:'HCN'},dest:'RCKH',hh:10,mm:0,gs:90,alt:3000,fuel:1.0,lr:false,trig};
  const r=Compute.compute(s);
  assert.ok(s.fuel<r.req);
  assert.match(Compute.answers(s,r)[6],/不可接受/);
});

describe('v2.2:方向與南端起始點',()=>{
  const trig={id:'instructor',hold:false};
  const north={pos:{lat:21.93,lon:120.76,fi:-2,ref:'NW',side:'on',d:0.5,vor:'HCN',trk:80},dir:'N',
               plan:Scenario.DIRS.N,dest:'RCFN',hh:10,mm:0,gs:110,alt:2500,fuel:25,lr:true,trig};
  test('SITUATION 標題帶出原航線與方向',()=>{
    const h=Compute.briefHTML(north,Compute.compute(north));
    assert.match(h,/RCKW → RCFN 北上/);
  });
  test('南端往 RCFN:MSA 提示說的是恆春半島,不是大漢山',()=>{
    const s={...north,dir:'S',plan:Scenario.DIRS.S,alt:3000};
    const A=Compute.answers(s,Compute.compute(s));
    assert.match(A[4],/恆春半島/); assert.doesNotMatch(A[4],/大漢山/);
  });
  test('東岸往 RCFN 的 MSA 提示照舊是大漢山',()=>{
    const s={...north,pos:{lat:22.20,lon:120.90,fi:3.0,ref:'DR',side:'on',d:0.4,vor:'HCN',trk:190},dir:'S',plan:Scenario.DIRS.S,alt:3000};
    const A=Compute.answers(s,Compute.compute(s));
    assert.match(A[4],/大漢山/);
  });
});

describe('v2.2.1:油量答案只報需要與剩餘',()=>{
  const trig={id:'instructor',hold:false};
  const base={dir:'S',plan:Scenario.DIRS.S,pos:{lat:22.20,lon:120.90,fi:3.0,ref:'DR',side:'on',d:0.4,vor:'HCN',trk:190},dir:'S',plan:Scenario.DIRS.S,
              dest:'RCLY',hh:10,mm:0,gs:110,alt:3000,fuel:20,lr:false,trig};
  test('大字只有「需要 X gal」跟「落地剩 Y gal」,沒有保留油的算式',()=>{
    const r=Compute.compute(base), big=Compute.answers(base,r)[6].match(/<p class="big">.*?<\/p>/)[0];
    assert.match(big,/需要 <em>[\d.]+ gal<\/em>/);
    assert.match(big,/落地剩 [\d.]+ gal/);
    assert.doesNotMatch(big,/保留|＋|＝/);
  });
  test('大字的需要 = 這趟燒的油(不含保留油)',()=>{
    const r=Compute.compute(base), big=Compute.answers(base,r)[6].match(/<p class="big">.*?<\/p>/)[0];
    assert.ok(big.includes(r.burn.toFixed(1)+' gal'),`burn=${r.burn.toFixed(1)} big=${big}`);
    assert.ok(!big.includes(r.req.toFixed(1)+' gal'));
  });
  test('保留油還是判斷夠不夠的標準:剩油低於 3.3 gal 要出紅字',()=>{
    const low={...base,dest:'RCKH',fuel:5.0};
    const r=Compute.compute(low);
    assert.ok(r.remain<Data.RESERVE);
    assert.match(Compute.answers(low,r)[6],/不可接受/);
  });
});

describe('v2.2.1:航向報真航向',()=>{
  const trig={id:'instructor',hold:false};
  const s={pos:{lat:22.20,lon:120.90,fi:3.0,ref:'DR',side:'on',d:0.4,vor:'HCN',trk:190},dir:'S',plan:Scenario.DIRS.S,
           dest:'RCLY',hh:10,mm:0,gs:110,alt:3000,fuel:20,lr:false,trig};
  test('第 4 格大字是 TH,值等於第一段的真航跡',()=>{
    const r=Compute.compute(s), A=Compute.answers(s,r);
    const big=A[3].match(/<p class="big">.*?<\/p>/)[0];
    assert.match(big,/TH <em>\d{3}°<\/em>/);
    assert.ok(big.includes(Geo.fmt3(r.first.tt)),`TT=${Geo.fmt3(r.first.tt)} big=${big}`);
    assert.doesNotMatch(big,/MH/);
  });
  test('磁航向還是算給你,放在下面的說明裡',()=>{
    const r=Compute.compute(s), A=Compute.answers(s,r);
    assert.match(A[3],new RegExp('MH '+Geo.fmt3(r.first.mh)+'°'));
    assert.match(A[3],/VAR 4°W/);
  });
  test('TURN 的初始概略轉向也是真航向',()=>{
    const r=Compute.compute(s), A=Compute.answers(s,r);
    assert.ok(A[2].includes('初始概略轉向 '+Geo.fmt3(r.first.tt)+'°'),A[2]);
  });
  test('航段表的欄位是 TH',()=>{
    const r=Compute.compute(s);
    const t=Compute.legTable(r);
    assert.match(t,/<th>TH<\/th>/);
    assert.ok(t.includes(Geo.fmt3(r.legs[0].tt)+'°'));
  });
});

describe('v2.2.2:報告點的答案',()=>{
  const trig={id:'instructor',hold:false};
  const mk=dest=>({pos:{lat:22.60,lon:121.03,fi:7.0,ref:'TML',side:'on',d:0.5,vor:'GID',trk:20},dir:'N',
    plan:Scenario.DIRS.N,dest,hh:10,mm:0,gs:110,alt:2500,fuel:22,lr:false,trig});
  for(const k of ['CHISHANG','CHENGGONG','CHANGHONG']){
    test(`${k}:高度講走廊、沒有機場空域與跑道燈、油量說「到達時剩」`,()=>{
      const s=mk(k), r=Compute.compute(s), A=Compute.answers(s,r,'zh');
      assert.match(A[4],/2,500 ft 或以下，沿 C(6|12) 走廊/);
      assert.doesNotMatch(A[4],/目的地空域/);
      assert.match(A[4],/MSA/);
      assert.match(A[6],/到達時剩/); assert.doesNotMatch(A[6],/落地剩|無跑道燈/);
    });
    test(`${k}:英文版沒有中文,也用 on arrival`,()=>{
      const s=mk(k), r=Compute.compute(s);
      const out=[Compute.briefHTML(s,r,'en'),...Compute.answers(s,r,'en')].join(' ');
      assert.doesNotMatch(out,/[一-鿿]/);
      assert.match(out,/on arrival/); assert.match(out,/reporting point/);
    });
  }
  test('長虹橋的地形提示是 5,520 ft,池上、成功是 3,906 ft',()=>{
    const A=k=>Compute.answers(mk(k),Compute.compute(mk(k)),'zh')[4];
    assert.match(A('CHANGHONG'),/5,520 ft/);
    assert.match(A('CHISHANG'),/3,906 ft/);
    assert.match(A('CHENGGONG'),/3,906 ft/);
  });
});
