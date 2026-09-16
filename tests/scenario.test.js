// 出題邏輯的自動化測試:擺位範圍、改降場加權分布、VOR 切換、MSA 提示規則。
// 執行:npm test(或 node --test tests/)
const {test,describe}=require('node:test');
const assert=require('node:assert/strict');
const Data=require('../js/data.js');
const Scenario=require('../js/scenario.js');

// 固定種子的亂數(mulberry32),失敗時可以重現同一題
function rng(seed){return function(){seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

test('makePos:fi 落在 1.2–8.0,VOR 選擇跟 fi<4.5 一致',()=>{
  const r=rng(1);
  for(let i=0;i<5000;i++){
    const p=Scenario.makePos(r);
    assert.ok(p.fi>=1.2&&p.fi<=8.0,`fi=${p.fi}`);
    assert.equal(p.vor,p.fi<4.5?'HCN':'GID');
  }
});

test('pickDest:強制指定的改降場優先於權重',()=>{
  const r=rng(2);
  for(const k of ['RCKH','RCLY','RCFN','RCGI','RCYU']){
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
    const expAlt=(s.dest==='RCFN'||s.dest==='RCYU'||s.dest==='RCGI')?2500:3000;
    assert.equal(s.alt,expAlt);
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
