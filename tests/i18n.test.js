// 中英文介面的測試。重點是「英文模式不能漏字」——任何一條沒翻到的字串都會被
// 「英文輸出不得出現中日韓文字」這一條抓到。
const {test,describe}=require('node:test');
const assert=require('node:assert/strict');
const I18n=require('../js/i18n.js');
const Data=require('../js/data.js');
const Scenario=require('../js/scenario.js');
const Compute=require('../js/compute.js');

const CJK=/[一-鿿㐀-䶿　-〿！-～]/;
function rng(seed){return function(){seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

describe('字典',()=>{
  test('預設是中文',()=>{ assert.equal(I18n.DEFAULT,'zh'); });
  test('兩種語言的 key 完全一樣(沒有漏翻、也沒有多餘的 key)',()=>{
    const zh=Object.keys(I18n.STR.zh).sort(), en=Object.keys(I18n.STR.en).sort();
    assert.deepEqual(en,zh);
  });
  // 分隔符號本身就只有空白(中文用全形空格、英文用「 · 」),不受「不可為空」那條限制
  const SEP=new Set(['a7.sep']);
  test('每個 key 兩邊都有值,而且英文那邊不是直接照抄中文',()=>{
    for(const k of Object.keys(I18n.STR.zh)){
      if(SEP.has(k)){
        assert.ok(I18n.STR.zh[k].length&&I18n.STR.en[k].length,`${k} 是空的`);
        assert.ok(!CJK.test(I18n.STR.en[k]),`en ${k} 用了全形符號:${JSON.stringify(I18n.STR.en[k])}`);
        continue;
      }
      assert.ok(I18n.STR.zh[k].trim(),`zh ${k} 是空的`);
      assert.ok(I18n.STR.en[k].trim(),`en ${k} 是空的`);
      if(CJK.test(I18n.STR.zh[k])) assert.ok(!CJK.test(I18n.STR.en[k]),`en ${k} 還是中文:${I18n.STR.en[k]}`);
    }
  });
  test('同一個 key 的變數,兩種語言要一致(不然代換會少東西)',()=>{
    const vars=s=>(s.match(/\{\w+\}/g)||[]).sort().join(',');
    for(const k of Object.keys(I18n.STR.zh))
      assert.equal(vars(I18n.STR.en[k]),vars(I18n.STR.zh[k]),`${k} 的變數對不上`);
  });
  test('t():不認得的語言退回中文,不認得的 key 回傳 key 本身',()=>{
    assert.equal(I18n.t('fr','ui.next'),I18n.STR.zh['ui.next']);
    assert.equal(I18n.t(undefined,'ui.next'),I18n.STR.zh['ui.next']);
    assert.equal(I18n.t('en','no.such.key'),'no.such.key');
  });
  test('t():變數代換,缺變數時原樣留著(不會變成 undefined)',()=>{
    assert.equal(I18n.t('en','a4.first',{from:'A',to:'B'}),'(first leg: A → B)');
    assert.match(I18n.t('en','a4.first',{from:'A'}),/\{to\}/);
  });
});

describe('資料的英文欄位',()=>{
  test('檢查點、南端航點都有英文名,而且不含中文',()=>{
    for(const p of Data.CHAIN.concat(Data.CAPE)){
      assert.ok(p.en,`${p.k} 沒有英文名`);
      assert.ok(!CJK.test(p.en),`${p.k} 的英文名有中文:${p.en}`);
    }
  });
  test('每個機場的名稱、備註、FIS 都有英文版',()=>{
    for(const k of Object.keys(Data.AD)){
      for(const f of ['n','note','fis']){
        const en=Data.L(Data.AD[k],f,'en');
        assert.ok(en,`${k}.${f} 沒有英文`);
        assert.ok(!CJK.test(en),`${k}.${f} 的英文還有中文:${en}`);
      }
    }
  });
  test('L()/ptName():沒給語言或給中文時拿到中文',()=>{
    assert.equal(Data.L(Data.AD.RCGI,'n','zh'),'RCGI 綠島');
    assert.equal(Data.ptName(Data.CHAIN[4],'zh'),'達仁');
    assert.equal(Data.ptName(Data.CHAIN[4],'en'),'Daren');
  });
});

describe('整份畫面文字:英文模式不能漏中文出來',()=>{
  test('2000 題的 SITUATION 與八格答案,英文版完全沒有中文字',()=>{
    const r=rng(77);
    for(let i=0;i<2000;i++){
      const s=Scenario.makeScenario('auto',r), c=Compute.compute(s);
      const out=[Compute.briefHTML(s,c,'en'), ...Compute.answers(s,c,'en'), Compute.legTable(c,'en')].join(' ');
      assert.ok(!CJK.test(out),`第 ${i} 題漏字:${out.match(new RegExp('.{0,30}'+CJK.source+'.{0,30}'))}`);
      assert.doesNotMatch(out,/\{\w+\}/,`第 ${i} 題有沒代換的變數`);
    }
  });
  test('空白的 SITUATION 與八格標題,英文版也沒有中文',()=>{
    const out=[Compute.briefBlankHTML('en'), ...Compute.items('en').map(x=>x.title+' '+x.sub)].join(' ');
    assert.ok(!CJK.test(out),out);
  });
  test('中文版還是中文(預設沒被英文蓋掉)',()=>{
    const s=Scenario.makeScenario('auto',rng(5)), c=Compute.compute(s);
    assert.ok(CJK.test(Compute.briefHTML(s,c,'zh')));
    assert.match(Compute.briefBlankHTML('zh'),/考官給的狀況/);
    assert.equal(Compute.items('zh')[0].title,'現在時間');
    assert.equal(Compute.items('zh')[0].sub,'Current time');
    assert.equal(Compute.items('en')[0].sub,'','英文版不重複顯示小標');
  });
  test('沒給語言 = 中文(舊的呼叫方式還能用)',()=>{
    const s=Scenario.makeScenario('auto',rng(6)), c=Compute.compute(s);
    assert.equal(Compute.briefHTML(s,c),Compute.briefHTML(s,c,'zh'));
    assert.equal(Compute.answers(s,c)[0],Compute.answers(s,c,'zh')[0]);
  });
});
