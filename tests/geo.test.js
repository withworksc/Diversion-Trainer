// 導航數學與顯示投影的單元測試。執行:npm test(或 node --test tests/)
const {test,describe}=require('node:test');
const assert=require('node:assert/strict');
const Geo=require('../js/geo.js');

describe('rad/deg 互為反函式',()=>{
  for(const d of [0,30,90,180,270,359]){
    test(`${d}°`,()=>{assert.ok(Math.abs(Geo.deg(Geo.rad(d))-d)<1e-9)});
  }
});

describe('dxy/dist/trueBrg：對正北、正東位移的基本檢查',()=>{
  test('正北 60 NM → dist≈60,trueBrg≈0',()=>{
    const a={lat:22,lon:121},b={lat:23,lon:121}; // 1° lat = 60 NM
    assert.ok(Math.abs(Geo.dist(a,b)-60)<0.3);
    assert.ok(Math.abs(Geo.trueBrg(a,b)-0)<0.5);
  });
  test('正東位移(用經度校正過緯度收斂)→ trueBrg≈90',()=>{
    const lat=22, dLon=1/Math.cos(Geo.rad(lat)); // 讓東西向位移也是 60 NM
    const a={lat:lat,lon:121},b={lat:lat,lon:121+dLon};
    assert.ok(Math.abs(Geo.dist(a,b)-60)<0.3);
    assert.ok(Math.abs(Geo.trueBrg(a,b)-90)<0.5);
  });
  test('正南、正西 → trueBrg≈180 / 270',()=>{
    const a={lat:22,lon:121};
    assert.ok(Math.abs(Geo.trueBrg(a,{lat:21,lon:121})-180)<0.5);
    const lat=22, dLon=1/Math.cos(Geo.rad(lat));
    assert.ok(Math.abs(Geo.trueBrg(a,{lat:lat,lon:121-dLon})-270)<0.5);
  });
});

test('mag：加上西差、正規化到 0–359',()=>{
  assert.equal(Geo.mag(0,4),4);
  assert.equal(Geo.mag(358,4),2);      // 跨過 360
  assert.equal(Geo.mag(0,0),0);
});

describe('fmt3：航圖慣例,0° 顯示 360 不是 000',()=>{
  const cases=[[0,'360'],[0.4,'360'],[359.6,'360'],[-1,'359'],[360,'360'],[10,'010'],[359,'359']];
  for(const [v,exp] of cases){
    test(`fmt3(${v}) = ${exp}`,()=>{assert.equal(Geo.fmt3(v),exp)});
  }
});

test('mercY/wx/wy：緯度越高,wy 越小(北在上)',()=>{
  const wyLow=Geo.wy(21.75), wyHigh=Geo.wy(24.30);
  assert.ok(wyHigh<wyLow);
  assert.equal(Geo.wx(121.5),121.5); // 經度本身就是 Mercator 的 x,不需轉換
});
