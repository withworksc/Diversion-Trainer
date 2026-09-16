// 抽樣出題給人檢查答案合不合理。執行:npm run report(或 node tests/report.js [題數] [種子])
const Data=require('../js/data.js');
const Scenario=require('../js/scenario.js');
const Compute=require('../js/compute.js');
const count=+process.argv[2]||12,seed=+process.argv[3]||2026;

function rng(s){return function(){s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

const rnd=rng(seed);
console.log(`抽樣 ${count} 題(種子 ${seed})\n`);
console.log('| # | 位置 | 改降場 | 距離/ETE/ETA | 油量需求/剩餘 | MSA | 狀況 |');
console.log('|---|---|---|---|---|---|---|');
for(let n=1;n<=count;n++){
  const s=Scenario.makeScenario('auto',rnd), r=Compute.compute(s);
  console.log(`| ${n} | ${s.pos.n}(R-${r.radial}/${r.dme} ${r.vor.n}) | ${Data.AD[s.dest].n} | `+
    `${r.totD.toFixed(0)} NM / ${r.totT.toFixed(0)} min / ${r.eta} | `+
    `${r.req.toFixed(1)} gal 需求,剩 ${r.remain.toFixed(1)} gal${s.fuel<r.req?' ⚠️不足':''} | `+
    `${r.ridge?'跨山脊':'—'} | ${s.trig.hold?'HOLD candidate':'TURN'} |`);
}

console.log('');
const N=20000, byDest={};
const r2=rng(seed+1);
for(let n=0;n<N;n++){
  const s=Scenario.makeScenario('auto',r2), r=Compute.compute(s);
  const o=byDest[s.dest]=byDest[s.dest]||{d:[1e9,0],t:[1e9,0],fuelShort:0,n:0};
  o.n++; o.d=[Math.min(o.d[0],r.totD),Math.max(o.d[1],r.totD)];
  o.t=[Math.min(o.t[0],r.totT),Math.max(o.t[1],r.totT)];
  if(s.fuel<r.req) o.fuelShort++;
}
console.log(`各改降場統計(${N} 題,種子 ${seed+1})：`);
for(const k in byDest){
  const o=byDest[k];
  console.log(`  ${k}: 抽到 ${o.n} 次(${(o.n/N*100).toFixed(1)}%)　距離 ${o.d[0].toFixed(0)}–${o.d[1].toFixed(0)} NM　`+
    `ETE ${o.t[0].toFixed(0)}–${o.t[1].toFixed(0)} min　油量不足 ${o.fuelShort} 次(${(o.fuelShort/o.n*100).toFixed(1)}%)`);
}
