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
  const lit={RCFN:true,RCGI:false,RCLY:false,RCKW:false,RCKH:true,RCYU:true};
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
