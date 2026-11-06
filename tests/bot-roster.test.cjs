const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../template/framework/panel/src/lib/botRoster.ts');
const config=(name,state='applied',index=0)=>({bot:{index,name,title:'Declared title',model:'claude/declared'},state});
const native=(id,name)=>({id,name,title:'Native title',modelSelection:{instanceId:'codex',model:'live'}});
test('one row per native bot, including chief and native-only bots',async()=>{
  const {botRoster}=await load();
  const rows=botRoster([config('Architect')],[native('chief','MausBot'),native('architect','Architect'),native('new','Native only')]);
  assert.deepEqual(rows.map(r=>r.name),['MausBot','Architect','Native only']);
  assert.equal(rows[1].model,'codex/live');
  assert.equal(rows[1].configuration.bot.index,0);
  assert.equal(rows[0].configuration,undefined);
});
test('pending drafts stay visible without duplicating their matching native bot',async()=>{
  const {botRoster}=await load();
  const rows=botRoster([config('Architect','pending'),config('New draft','new',1)],[native('architect','Architect')]);
  assert.equal(rows.length,2);
  assert.equal(rows[0].title,'Declared title');
  assert.equal(rows[1].configuration.state,'new');
});
test('native deletion removes unchanged declarations and ambiguous names do not pick a form',async()=>{
  const {botRoster}=await load();
  assert.deepEqual(botRoster([config('Removed')],[]),[]);
  const rows=botRoster([config('Same')],[native('one','Same'),native('two','Same')]);
  assert.equal(rows.length,2);
  assert.ok(rows.every(r=>!r.configuration));
});
test('configuration remains usable before native discovery and in mock mode',async()=>{
  const {botRoster}=await load();
  const rows=botRoster([config('Architect')],null);
  assert.equal(rows.length,1);
  assert.equal(rows[0].model,'claude/declared');
});
test('version badges require committed evidence and keep snapshots distinct from declarations',async()=>{
  const {versionStatus}=await load();
  const row={key:'native',name:'Native bot',team:''};
  const saved={commit:'abc',bots:[{name:'Native bot',team:'',project:false,snapshot:true}]};
  assert.equal(versionStatus(row,undefined),'unknown');
  assert.equal(versionStatus(row,{commit:null,bots:[]}),'unknown');
  assert.equal(versionStatus(row,{commit:'abc',bots:[]}),'native');
  assert.equal(versionStatus(row,saved),'snapshot');
  assert.equal(versionStatus({...row,ambiguous:true},saved),'unknown');
  assert.equal(versionStatus(row,{...saved,bots:[{...saved.bots[0],project:true}]}),'project');
});
