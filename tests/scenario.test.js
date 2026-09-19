// 出題邏輯的自動化測試:擺位範圍、改降場加權分布、VOR 切換、MSA 提示規則。
// 執行:npm test(或 node --test tests/)
const {test,describe}=require('node:test');
const assert=require('node:assert/strict');
const Data=require('../js/data.js');
const Scenario=require('../js/scenario.js');

// 固定種子的亂數(mulberry32),失敗時可以重現同一題
function rng(seed){return function(){seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

test('makePos:fi 落在東岸 1.2–8.0 或南端 −3–0.6,VOR 選擇跟 fi<4.5 一致',()=>{
  const r=rng(1);
  for(let i=0;i<5000;i++){
    const p=Scenario.makePos(r);
    assert.ok((p.fi>=1.2&&p.fi<=8.0)||(p.fi>=-3&&p.fi<=0.6),`fi=${p.fi}`);
    assert.equal(p.vor,p.fi<4.5?'HCN':'GID');
  }
});

test('makePos:南端(貓鼻頭到鵝鑾鼻)的起始點約佔 CAPE_SHARE(2 萬題,容差 ±2 個百分點)',()=>{
  const r=rng(11),N=20000;let cape=0;
  for(let i=0;i<N;i++) if(Scenario.makePos(r).fi<1) cape++;
  const pct=cape/N*100, exp=Scenario.CAPE_SHARE*100;
  assert.ok(Math.abs(pct-exp)<2,`南端 ${pct.toFixed(1)}%,預期約 ${exp}%`);
});

test('makePos:南端的位置名稱是鵝鑾鼻、南灣、貓鼻頭外海,不會出現「北方/南方」以外的東岸說法錯置',()=>{
  const r=rng(12);
  for(let i=0;i<3000;i++){
    const p=Scenario.makePos(r);
    if(p.fi<0) assert.match(p.n,/^(鵝鑾鼻|南灣|貓鼻頭)(外海|(北|東北|東|東南|南|西南|西|西北)方\d+ NM 外海)$/,p.n);
  }
});

test('makePos:原航向跟方向一致——東岸南下往南飛、北上往北飛',()=>{
  const r=rng(13);
  for(let i=0;i<3000;i++){
    const s=Scenario.makePos(r,'S'), n=Scenario.makePos(r,'N');
    if(s.fi>=1.2) assert.ok(s.trk>90&&s.trk<270,`南下 fi=${s.fi.toFixed(2)} trk=${s.trk.toFixed(0)}`);
    if(n.fi>=1.2) assert.ok(n.trk<90||n.trk>270,`北上 fi=${n.fi.toFixed(2)} trk=${n.trk.toFixed(0)}`);
  }
});

test('makePos:南端沿岸南下往西(往貓鼻頭、RCKW)、北上往東(往鵝鑾鼻)',()=>{
  const r=rng(14);let n=0;
  for(let i=0;i<5000&&n<300;i++){
    const s=Scenario.makePos(r,'S'); if(s.fi>=-2.9&&s.fi<=-1.1){ n++; assert.ok(s.trk>180&&s.trk<360,`南下 fi=${s.fi.toFixed(2)} trk=${s.trk.toFixed(0)}`); }
    const m=Scenario.makePos(r,'N'); if(m.fi>=-2.9&&m.fi<=-1.1) assert.ok(m.trk>0&&m.trk<180,`北上 fi=${m.fi.toFixed(2)} trk=${m.trk.toFixed(0)}`);
  }
  assert.ok(n>50,'抽到的南端樣本太少');
});

test('pickDest:強制指定的改降場優先於權重',()=>{
  const r=rng(2);
  for(const k of ['RCKH','RCLY','RCFN','RCGI','RCYU','RCKW']){
    assert.equal(Scenario.pickDest(k,r),k);
  }
});

test('pickDest:auto 模式的分布大致符合 WEIGHT(2 萬題,容差 ±20% 相對誤差)',()=>{
  const r=rng(3),N=20000,count={};
  for(let i=0;i<N;i++){const k=Scenario.pickDest('auto',r);count[k]=(count[k]||0)+1;}
  const tot=Scenario.WEIGHT.reduce((s,[,w])=>s+w,0);
  for(const [k,w] of Scenario.WEIGHT){
    const exp=N*w/tot, got=count[k]||0;
    assert.ok(Math.abs(got-exp)/exp<0.2,`${k}: 抽到 ${got},預期約 ${exp.toFixed(0)}`);
  }
});

describe('crossesRidge:MSA 提示規則',()=>{
  const cases=[
    ['RCKH',{fi:-2},false],['RCKW',{fi:-2},false],['RCGI',{fi:-1},false],
    ['RCFN',{fi:-2},true],['RCYU',{fi:-1},true],
    ['RCGI',{fi:2},false],['RCLY',{fi:7},false],
    ['RCKH',{fi:2},true],['RCKH',{fi:7},true],
    ['RCFN',{fi:3.0},true],['RCFN',{fi:4.0},false],
    ['RCYU',{fi:3.0},true],['RCYU',{fi:4.0},false],
    ['RCKW',{fi:5.0},true],['RCKW',{fi:4.0},false]
  ];
  for(const [dest,pos,exp] of cases){
    test(`${dest} @ fi=${pos.fi} → ${exp}`,()=>{assert.equal(Scenario.crossesRidge(pos,dest),exp)});
  }
});

test('makeScenario:欄位範圍(距台、地速、油量、高度)都符合 docs/HANDOFF.md §2.7 的設定',()=>{
  const r=rng(4),N=20000;
  for(let i=0;i<N;i++){
    const s=Scenario.makeScenario('auto',r);
    assert.ok(s.hh>=7&&s.hh<16,`hh=${s.hh}`);
    assert.ok(s.mm>=0&&s.mm<60,`mm=${s.mm}`);
    assert.equal(s.gs%5,0);
    assert.ok(s.gs>=85&&s.gs<=160,`gs=${s.gs}`);
    assert.ok(Data.AD[s.dest],`未知改降場 ${s.dest}`);
    assert.equal(s.alt,s.dir==='N'?2500:3000,`${s.dir} 的高度 ${s.alt}`);
    assert.notEqual(s.dest,s.plan.to,'不會改降到原目的地');
    if(s.lr) assert.ok(s.fuel>=25.5&&s.fuel<=32,`long range fuel=${s.fuel}`);
    else assert.ok(s.fuel>=17.5&&s.fuel<=23,`standard fuel=${s.fuel}`);
  }
});

test('makeScenario:long range 油箱比例大約 35%(2 萬題,容差 ±3 個百分點)',()=>{
  const r=rng(5),N=20000;let lr=0;
  for(let i=0;i<N;i++) if(Scenario.makeScenario('auto',r).lr) lr++;
  const pct=lr/N*100;
  assert.ok(Math.abs(pct-35)<3,`long range 比例 ${pct.toFixed(1)}%`);
});

describe('v2.2:南下/北上、回航場不進隨機',()=>{
  test('隨機(auto)不會抽到 RCFN、RCKW(2 萬題)',()=>{
    const r=rng(21);
    for(let i=0;i<20000;i++){
      const s=Scenario.makeScenario('auto',r);
      assert.ok(s.dest!=='RCFN'&&s.dest!=='RCKW',`抽到 ${s.dest}`);
    }
  });
  test('指定 RCFN 一定是南下(RCFN → RCKW)、指定 RCKW 一定是北上',()=>{
    const r=rng(22);
    for(let i=0;i<500;i++){
      const a=Scenario.makeScenario('RCFN',r), b=Scenario.makeScenario('RCKW',r);
      assert.equal(a.dir,'S'); assert.equal(a.dest,'RCFN'); assert.equal(a.alt,3000);
      assert.equal(b.dir,'N'); assert.equal(b.dest,'RCKW'); assert.equal(b.alt,2500);
    }
  });
  test('南下、北上各約一半(2 萬題,容差 ±2 個百分點)',()=>{
    const r=rng(23),N=20000;let north=0;
    for(let i=0;i<N;i++) if(Scenario.makeScenario('auto',r).dir==='N') north++;
    const pct=north/N*100;
    assert.ok(Math.abs(pct-Scenario.NORTH_SHARE*100)<2,`北上 ${pct.toFixed(1)}%`);
  });
  test('狀況文字照方向代換:原目的地與「南下/北上」都對',()=>{
    const r=rng(24);
    for(let i=0;i<3000;i++){
      const s=Scenario.makeScenario('auto',r);
      assert.doesNotMatch(s.trig.zh,/\{AD\}|\{DIR\}/);
      const other=s.plan.to==='RCKW'?'RCFN':'RCKW';
      assert.ok(!s.trig.zh.includes(other),`${s.dir}:${s.trig.zh}`);
      if(s.trig.zh.includes('繼續')) assert.ok(s.trig.zh.includes('繼續'+s.plan.zh),s.trig.zh);
    }
  });
  test('不認得的改降場代碼當成隨機,不會壞掉',()=>{
    const s=Scenario.makeScenario('XXXX',rng(25));
    assert.ok(Data.AD[s.dest]); assert.notEqual(s.dest,'XXXX');
  });
});
