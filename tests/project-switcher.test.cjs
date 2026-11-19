const {test}=require('node:test'),assert=require('node:assert/strict');
const here='https://panel.skalo.example.test/#/setup';
test('switcher items keep named http(s) links and mark the current project',async()=>{
  const {switcherItems}=await import('../template/framework/panel/src/lib/projectSwitcher.ts');
  assert.deepEqual(switcherItems({items:[
    {name:' Skalo ',url:'https://panel.skalo.example.test/'},
    {name:'EMOS',url:'https://panel.emos.example.test/'},
    {name:'Local',url:'/other'},
  ]},here),[
    {name:'Skalo',url:'https://panel.skalo.example.test/',current:true},
    {name:'EMOS',url:'https://panel.emos.example.test/',current:false},
    {name:'Local',url:'https://panel.skalo.example.test/other',current:true},
  ]);
});
test('switcher items drop script links, credentials and malformed answers',async()=>{
  const {switcherItems,MAX_SWITCHER_ITEMS}=await import('../template/framework/panel/src/lib/projectSwitcher.ts');
  assert.deepEqual(switcherItems({items:[
    {name:'x',url:'javascript:alert(1)'},{name:'x',url:'data:text/html,hi'},{name:'x',url:'https://u:p@a.test/'},
    {name:'',url:'https://a.test/'},{name:'x'},{url:'https://a.test/'},null,'https://a.test/',
  ]},here),[]);
  for (const bad of [null,[],'x',{},{items:'x'}]) assert.deepEqual(switcherItems(bad,here),[]);
  const many={items:Array.from({length:MAX_SWITCHER_ITEMS+5},(_,i)=>({name:`p${i}`,url:`https://p${i}.test/`}))};
  assert.equal(switcherItems(many,here).length,MAX_SWITCHER_ITEMS);
});
test('the session cookie is sent cross-origin only to the declared list',async()=>{
  const {switcherRequest}=await import('../template/framework/panel/src/lib/projectSwitcher.ts');
  assert.deepEqual(switcherRequest('/hub/environments.json',here),{url:'https://panel.skalo.example.test/hub/environments.json',credentials:'same-origin'});
  assert.deepEqual(switcherRequest('https://portal.example.test/environments.json',here),{url:'https://portal.example.test/environments.json',credentials:'include'});
});
