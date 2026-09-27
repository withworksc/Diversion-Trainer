// 領域資料的迴歸測試：VOR 位置、機場資料、離岸平移。執行:npm test
const {test,describe}=require('node:test');
const assert=require('node:assert/strict');
const Geo=require('../js/geo.js');
const Data=require('../js/data.js');

test('HCN 在鵝鑾鼻附近的羅盤玫瑰,不是恆春機場(docs/HANDOFF.md §2.2 的更正)',()=>{
  assert.equal(Data.VOR.HCN.lat,21.930);
  assert.equal(Data.VOR.HCN.lon,120.840);
  // 跟恆春機場(22.041,120.730)明顯不同一點(舊版錯誤座標曾經直接等於機場,距離 0)
  // 實際約 9 NM(docs/HANDOFF.md §2.2 寫「約 11 NM」是概略描述)
  const d=Geo.dist(Data.VOR.HCN,Data.AD.RCKW);
  assert.ok(d>5,`HCN 距 RCKW ${d.toFixed(1)} NM,應明顯大於 0`);
});

test('GID 在綠島機場',()=>{
  assert.equal(Data.VOR.GID.lat,22.673);
  assert.equal(Data.VOR.GID.lon,121.465);
  assert.ok(Geo.dist(Data.VOR.GID,Data.AD.RCGI)<0.5);
});

describe('機場資料：燈光與空域',()=>{
  const lit={RCFN:true,RCGI:false,RCLY:false,RCKW:false,RCKH:true,RCYU:true,RCMQ:true,RCSS:true};
  for(const k in lit){
    test(`${k} lit=${lit[k]}`,()=>{assert.equal(Data.AD[k].lit,lit[k])});
  }
});

test('離岸平移:每個檢查點離原始陸地座標約 1 NM(OFFSHORE)',()=>{
  const base=[
    {lat:21.900,lon:120.850},{lat:22.033,lon:120.850},{lat:22.100,lon:120.883},
    {lat:22.183,lon:120.867},{lat:22.275,lon:120.867},{lat:22.350,lon:120.892},
    {lat:22.533,lon:120.967},{lat:22.608,lon:121.008},{lat:22.700,lon:121.050}
  ];
  assert.equal(Data.CHAIN.length,base.length);
  for(let i=0;i<base.length;i++){
    const d=Geo.dist(base[i],Data.CHAIN[i]);
    assert.ok(Math.abs(d-Data.OFFSHORE)<0.05,`點 ${i} 離岸 ${d.toFixed(3)} NM,預期約 ${Data.OFFSHORE}`);
  }
});

test('離岸方向是海側(向東),不是誤植到陸地那一側',()=>{
  // 平移後的經度都應該比陸地原點更大(C8 這一段海岸線大致南北走向,海在東邊)
  const base=[120.850,120.850,120.883,120.867,120.867,120.892,120.967,121.008,121.050];
  for(let i=0;i<base.length;i++){
    assert.ok(Data.CHAIN[i].lon>base[i],`點 ${i} 平移後經度 ${Data.CHAIN[i].lon} 應大於陸地原點 ${base[i]}`);
  }
});

test('VOR 選擇的切換點跟 CHAIN 自己標的 vor 欄位一致(達仁→HCN,大武→GID)',()=>{
  const dr=Data.CHAIN.find(c=>c.k==='DR'), dw=Data.CHAIN.find(c=>c.k==='DW');
  assert.equal(dr.vor,'HCN');
  assert.equal(dw.vor,'GID');
});

describe('v2.2.3:台中、松山的資料方塊照航圖',()=>{
  // 航圖:CINGCYUANGANG (RCMQ) 665 L H 37、Taichung D GND - 3500;SONGSHAN (RCSS) 18 L H 26、Songshan C GND - 7000
  const exp={RCMQ:{elev:665,rwy:'3,700 m',air:'Taichung D GND-3500'},RCSS:{elev:18,rwy:'2,600 m',air:'Songshan C GND-7000'}};
  for(const k in exp) test(k,()=>{
    for(const f in exp[k]) assert.equal(Data.AD[k][f],exp[k][f],`${k}.${f}`);
    assert.ok(Data.AD[k].ridge&&Data.AD[k].ridgeEn,`${k} 要有 ridge 提示`);
  });
  test('座標跟公告座標差不到 0.3 NM(航圖上量機場符號)',()=>{
    const pub={RCMQ:{lat:24.2642,lon:120.6206},RCSS:{lat:25.0694,lon:121.5522}};
    for(const k in pub){ const d=Geo.dist(pub[k],Data.AD[k]); assert.ok(d<0.3,`${k} 差 ${d.toFixed(2)} NM`); }
  });
});

describe('底圖範圍',()=>{
  const Map=require('../js/map.js');
  const C=Map.CHART;
  test('js/map.js 的 CHART 跟 assets/chart-south.json 的 bounds 一致(換底圖時兩邊要一起改)',()=>{
    const json=require('../assets/chart-south.json');
    for(const f of ['lon0','lon1','lat0','lat1']) assert.equal(C[f],json.bounds[f],f);
  });
  test('每個改降目的地、檢查點、VOR 都在底圖裡,離邊界至少 0.1°',()=>{
    const pts=Object.entries(Data.DEST).concat(Data.CHAIN.map(p=>[p.k,p]),Data.CAPE.map(p=>[p.k,p]),Object.entries(Data.VOR));
    for(const [k,p] of pts){
      assert.ok(p.lon-C.lon0>=0.1&&C.lon1-p.lon>=0.1&&p.lat-C.lat0>=0.1&&C.lat1-p.lat>=0.1,`${k} (${p.lat},${p.lon}) 太靠近底圖邊界`);
    }
  });
});
