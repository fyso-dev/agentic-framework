// The platform MCP server (D33) over stdio against a fake Dagu API.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http'), path=require('node:path'), fs=require('node:fs'), os=require('node:os');
const {spawn}=require('node:child_process');
const server=path.resolve(__dirname,'../template/framework/scripts/fyso-mcp.cjs');

// Fake Dagu: records enqueues; runs of `failing` DAGs fail with a step error.
// It also speaks Dagu's MCP at /mcp when `mcpTools` is given: sessions, tools/list, echoing tools/call.
const DAGU_TOOLS=[{name:'dagu_read',description:'Read Dagu state',inputSchema:{type:'object',properties:{target:{type:'string'}}},annotations:{readOnlyHint:true}},
  {name:'dagu_execute',description:'Execute',inputSchema:{type:'object'}},{name:'dagu_change',description:'Change',inputSchema:{type:'object'}},{name:'other_tool',description:'x',inputSchema:{type:'object'}}];
function fakeDagu(outputs,mcpTools) {
  const calls=[],mcpCalls=[],state={sessions:new Set(),opened:0,sse:false};
  const srv=http.createServer((req,res)=>{
    let body='';req.on('data',c=>body+=c);req.on('end',()=>{
      const send=v=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));};
      if(req.headers.authorization!=='Basic '+Buffer.from('admin:pw').toString('base64')){res.statusCode=401;return res.end('no');}
      if(req.url==='/mcp'&&mcpTools){
        const msg=JSON.parse(body),sid=req.headers['mcp-session-id'];
        if(msg.method==='initialize'){const id=`s${++state.opened}`;state.sessions.add(id);res.setHeader('Mcp-Session-Id',id);return send({jsonrpc:'2.0',id:msg.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'dagu',version:'t'}}});}
        if(!state.sessions.has(sid)){res.statusCode=404;return res.end('session not found');}
        if(msg.id===undefined){res.statusCode=202;return res.end();}
        const result=msg.method==='tools/list'?{tools:mcpTools}:{content:[{type:'text',text:'Dagu done.'},{type:'resource_link',uri:'dagu://runs/x/1',name:'dag_run'}],structuredContent:{echo:msg.params}};
        if(msg.method==='tools/call')mcpCalls.push({...msg.params,session:sid});
        if(state.sse){res.setHeader('Content-Type','text/event-stream');return res.end(`event: message\ndata: ${JSON.stringify({jsonrpc:'2.0',method:'notifications/progress',params:{}})}\n\nevent: message\ndata: ${JSON.stringify({jsonrpc:'2.0',id:msg.id,result})}\n\n`);}
        return send({jsonrpc:'2.0',id:msg.id,result});
      }
      let m;
      if((m=/^\/api\/v1\/dags\/([^/]+)\/enqueue$/.exec(req.url))){calls.push({dag:decodeURIComponent(m[1]),params:body?JSON.parse(JSON.parse(body).params||'{}'):{}});return send({dagRunId:`run-${calls.length}`});}
      if((m=/^\/api\/v1\/dag-runs\/([^/]+)\/([^/]+)\/outputs$/.exec(req.url)))return send({outputs:outputs[decodeURIComponent(m[1])]||{}});
      if((m=/^\/api\/v1\/dag-runs\/([^/]+)\/([^/]+)$/.exec(req.url))){
        const dag=decodeURIComponent(m[1]);
        return send({dagRunDetails:dag==='failing'||outputs[dag]===undefined?{statusLabel:'failed',nodes:[{error:'step exploded'}]}:{statusLabel:'succeeded'}});
      }
      res.statusCode=404;res.end();
    });
  });
  return new Promise(r=>srv.listen(0,'127.0.0.1',()=>r({srv,calls,mcpCalls,state,port:srv.address().port})));
}

function mcp(port,extra={},args=[]) {
  const child=spawn(process.execPath,[server,...args],{env:{...process.env,FYSO_DAGU_PORT:String(port),FYSO_ADMIN_USER:'admin',FYSO_ADMIN_PASSWORD:'pw',...extra}});
  let buf='',seq=0;const waiting=new Map();
  child.stdout.on('data',d=>{buf+=d;for(let i;(i=buf.indexOf('\n'))>=0;){const msg=JSON.parse(buf.slice(0,i));buf=buf.slice(i+1);waiting.get(msg.id)?.(msg);}});
  const call=(method,params)=>new Promise(r=>{const id=++seq;waiting.set(id,r);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  const notify=method=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',method})+'\n');
  return {call,notify,close:()=>child.stdin.end()};
}

test('handshake and tool list follow MCP',async()=>{
  const {srv,port}=await fakeDagu({});const c=mcp(port);
  try {
    const init=await c.call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'t',version:'0'}});
    assert.equal(init.result.protocolVersion,'2025-06-18');assert.equal(init.result.serverInfo.name,'fyso');assert.ok(init.result.capabilities.tools);
    c.notify('notifications/initialized');
    const names=(await c.call('tools/list')).result.tools.map(t=>t.name);
    for(const n of ['fyso_status','fyso_check','fyso_doctor','fyso_connections','fyso_bots_list','fyso_bot_plan','fyso_bot_apply','fyso_ext_search','fyso_ext_install','fyso_snapshot'])assert.ok(names.includes(n),n);
    assert.equal((await c.call('ping')).result&&true,true);
    assert.equal((await c.call('nope/method')).error.code,-32601);
  } finally {c.close();srv.close();}
});

test('connection discovery uses the same native architect workflow as the panel',async()=>{
  const catalog={servers:[{name:'dagu',enabled:null,portable:true,verification:'not-tested'}]};
  const {srv,calls,port}=await fakeDagu({'fyso-bot-architect':{result:JSON.stringify(catalog)}});const c=mcp(port);
  try {
    const response=(await c.call('tools/call',{name:'fyso_connections',arguments:{}})).result;
    assert.deepEqual(response.structuredContent,catalog);
    assert.deepEqual(calls.at(-1),{dag:'fyso-bot-architect',params:{OP:'connections'}});
  } finally {c.close();srv.close();}
});

test('tools run the panel workflows with their params and return parsed outputs',async()=>{
  const {srv,calls,port}=await fakeDagu({
    'fyso-ext-install':{result:JSON.stringify({id:'sample',mode:'add',version:'v1.0.0',commit:'abc1234'})},
    'fyso-bot-architect':{result:JSON.stringify({planId:'p1',action:'create',preview:['create Support']})},
    'fyso-ext-catalog':{catalog:JSON.stringify({catalogs:[{name:'Fyso'}],extensions:[{id:'sample',name:'Sample',description:'demo',tags:['demo']},{id:'netbird',name:'NetBird',description:'network',tags:[]}]})},
  });
  const c=mcp(port);
  try {
    const install=(await c.call('tools/call',{name:'fyso_ext_install',arguments:{id:'sample',mode:'add'}})).result;
    assert.equal(install.isError,undefined);assert.deepEqual(install.structuredContent,{id:'sample',mode:'add',version:'v1.0.0',commit:'abc1234'});
    assert.deepEqual(calls.at(-1),{dag:'fyso-ext-install',params:{ID:'sample',MODE:'add'}});
    const plan=(await c.call('tools/call',{name:'fyso_bot_plan',arguments:{action:'create',bot:{name:'Support',model:'claude/claude-sonnet-5'}}})).result;
    assert.equal(plan.structuredContent.planId,'p1');
    const sent=calls.at(-1).params;assert.equal(sent.OP,'plan');assert.equal(sent.ACTION,'create');
    assert.deepEqual(JSON.parse(Buffer.from(sent.BOT_B64,'base64').toString()),{name:'Support',model:'claude/claude-sonnet-5'});
    const search=(await c.call('tools/call',{name:'fyso_ext_search',arguments:{query:'network'}})).result.structuredContent;
    assert.deepEqual(search.extensions.map(e=>e.id),['netbird']);
  } finally {c.close();srv.close();}
});

test('workflow failures and bad arguments come back as tool errors, not crashes',async()=>{
  const {srv,calls,port}=await fakeDagu({});const c=mcp(port);
  try {
    const failed=(await c.call('tools/call',{name:'fyso_snapshot',arguments:{}})).result;
    assert.equal(failed.isError,true);assert.match(failed.content[0].text,/fyso-snapshot failed .*step exploded/);
    const bad=(await c.call('tools/call',{name:'fyso_ext_install',arguments:{id:'x',mode:'remove'}})).result;
    assert.equal(bad.isError,true);assert.match(bad.content[0].text,/mode must be one of add, update/);
    const extra=(await c.call('tools/call',{name:'fyso_bot_apply',arguments:{plan_id:'p',force:true}})).result;
    assert.match(extra.content[0].text,/unknown argument: force/);
    assert.equal(calls.filter(x=>x.dag!=='fyso-snapshot').length,0);
    assert.equal((await c.call('tools/call',{name:'fyso_rm_rf',arguments:{}})).error.code,-32602);
  } finally {c.close();srv.close();}
});

test('observability returns the collected data the workflow writes, not only its refresh summary',async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-mcp-'));
  fs.mkdirSync(path.join(data,'panel'));
  fs.writeFileSync(path.join(data,'panel/observability.json'),JSON.stringify({collectedAt:'t',usage:{totals:{turns:3}},traces:[{id:'x'}],runs:[],alerts:[]}));
  const {srv,port}=await fakeDagu({'fyso-observability':{summary:JSON.stringify({collectedAt:'t',records:3})}});const c=mcp(port,{FYSO_DATA:data});
  try {
    const out=(await c.call('tools/call',{name:'fyso_observability',arguments:{}})).result.structuredContent;
    assert.deepEqual(out.refresh,{collectedAt:'t',records:3});assert.equal(out.usage.totals.turns,3);assert.deepEqual(out.traces,[{id:'x'}]);
  } finally {c.close();srv.close();fs.rmSync(data,{recursive:true,force:true});}
});

// No HTTP fixture: framework guidance must work before Dagu is running.
test('framework context reaches desktop clients at initialize and remains available offline', async () => {
  const c = mcp(1);
  try {
    const init = (await c.call('initialize', {protocolVersion: '2025-06-18'})).result;
    assert.match(init.instructions, /Ownership and isolation/);
    assert.match(init.instructions, /forwarded by the platform MCP/);
    assert.match(init.instructions, /## This project: /);
    const tools = (await c.call('tools/list')).result.tools;
    assert.equal(tools.find(t => t.name === 'fyso_context').annotations.readOnlyHint, true);
    const result = (await c.call('tools/call', {name: 'fyso_context', arguments: {}})).result;
    assert.equal(result.isError, undefined);
    assert.ok(init.instructions.startsWith(result.structuredContent.guide));
    assert.match(result.structuredContent.guide, /fyso_bot_plan/);
  } finally { c.close(); }
});

// D57: understanding and coverage.
const projectMap=require('../template/framework/scripts/project-map.cjs');
function sampleProject() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-map-'));
  const put=(file,text)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text);};
  put('AGENTS.md','# Demo');put('framework/agent-context.md','guide');put('framework/workflows/snapshot.yaml','description: Save\n');
  put('project/bots/team.yaml','version: 1\nbots:\n  - name: Support\n    title: Answers customers\n    model: claude/x\n');
  put('project/workflows/orders.yaml','description: Sync orders\nschedule: "0 * * * *"\nparams:\n  - SHOP: main\n');
  put('project/workflows/ext-sample-check.yaml','description: Check\n');
  fs.symlinkSync('../../framework/workflows/snapshot.yaml',path.join(root,'project/workflows/fyso-snapshot.yaml'));
  put('project/apps/shop/app.yaml','id: shop\nname: {es: Tienda, en: Shop}\n');
  put('project/wiki/customers/onboarding.md','# Onboarding');put('project/mcp.json','{"mcpServers":{"crm":{}}}');
  put('project/auth/tinyauth.yaml','users: []');put('project/api-token.txt','t');put('project/logo.bin',Buffer.from([1,0,2]));
  put('.copier-answers.ext-sample.yml','_commit: v1.2.0\n');put('extensions/sample/README.md','# Sample');
  put('extensions/sample/skills/help/SKILL.md','Help');put('extensions/sample/mcp.json','{"mcpServers":{"sample":{}}}');
  put('secrets.enc.yaml','x: ENC');put('.data/panel/project.json','{}');put('outside.txt','no');
  fs.symlinkSync(path.join(root,'..'),path.join(root,'project/escape'));
  return root;
}

test('the project map says what the project contains, from the repository alone',()=>{
  const root=sampleProject();
  try {
    const m=projectMap.map(root,{FYSO_PROJECT_NAME:'Demo',FYSO_PROJECT:'demo'});
    assert.deepEqual(m.project,{name:'Demo',slug:'demo'});
    assert.deepEqual(m.workflows.map(w=>[w.name,w.owner]),[['ext-sample-check','extension'],['fyso-snapshot','framework'],['orders','project']]);
    assert.deepEqual(m.extensions.map(e=>[e.id,e.readme,e.skills,e.mcpServers]),[['sample','extensions/sample/README.md',['extensions/sample/skills/help/SKILL.md'],['sample']]]);
    assert.deepEqual(Object.keys(m.mcpServers).sort(),['crm','sample']);
    assert.deepEqual(m.wiki,{folder:'project/wiki',pages:1,paths:['customers/onboarding']});
    assert.ok(m.guides.includes('AGENTS.md')&&m.guides.includes('extensions/sample/README.md'));
    // Parsed fields need the pinned yaml package (mise); without it the map still lists names.
    if(m.bots.declared.length) {
      assert.deepEqual(m.bots.declared,[{name:'Support',title:'Answers customers',model:'claude/x'}]);
      assert.deepEqual(m.workflows[2],{name:'orders',owner:'project',description:'Sync orders',schedule:'0 * * * *',params:['SHOP']});
      assert.deepEqual(m.apps,[{id:'shop',name:'Tienda',file:'project/apps/shop/app.yaml'}]);
      assert.equal(m.extensions[0].version,'v1.2.0');
    }
    const brief=projectMap.brief(root,{FYSO_PROJECT_NAME:'Demo',FYSO_PROJECT:'demo'});
    assert.match(brief,/## This project: Demo \(demo\)/);assert.match(brief,/Project workflows: orders; 2 framework\/extension/);assert.match(brief,/Extensions: sample/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('files are read-only and confined: no secrets, logins, runtime data, hidden files or paths outside the project',()=>{
  const root=sampleProject();
  try {
    assert.deepEqual(projectMap.read(root,'project/workflows/orders.yaml').content.split('\n')[0],'description: Sync orders');
    assert.equal(projectMap.read(root,'./project/workflows/fyso-snapshot.yaml').content,'description: Save\n');   // symlink inside the project
    assert.ok(projectMap.list(root).entries.some(e=>e.path==='project'&&e.type==='dir'));
    const listed=projectMap.list(root,'project').entries.map(e=>e.path);
    assert.ok(listed.includes('project/wiki/customers/onboarding.md'));
    for(const hidden of ['project/auth/tinyauth.yaml','project/api-token.txt'])assert.ok(!listed.includes(hidden),hidden);
    for(const denied of ['secrets.enc.yaml','.data/panel/project.json','outside.txt','project/auth/tinyauth.yaml','project/api-token.txt','project/../secrets.enc.yaml','../x','/etc/hosts','project/escape/x','.copier-answers.ext-sample.yml','framework/scripts/x.cjs'])
      assert.throws(()=>projectMap.read(root,denied),/not readable|relative to the project|not found/,denied);
    assert.throws(()=>projectMap.read(root,'project/logo.bin'),/not a text file/);
    assert.throws(()=>projectMap.read(root,'project'),/folder/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('Dagu\'s own MCP tools are forwarded unchanged, with session recovery and event-stream answers',async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-mcp-'));
  const {srv,mcpCalls,state,port}=await fakeDagu({},DAGU_TOOLS);const c=mcp(port,{FYSO_DATA:data});
  try {
    const tools=(await c.call('tools/list')).result.tools;
    assert.deepEqual(tools.filter(t=>!t.name.startsWith('fyso_')).map(t=>t.name),['dagu_read','dagu_execute','dagu_change']);   // only dagu_*
    assert.deepEqual(tools.find(t=>t.name==='dagu_read'),DAGU_TOOLS[0]);
    const args={action:'start',name:'orders',params:{SHOP:'main'},wait:true};
    const run=(await c.call('tools/call',{name:'dagu_execute',arguments:args})).result;
    assert.deepEqual(run,{content:[{type:'text',text:'Dagu done.'},{type:'resource_link',uri:'dagu://runs/x/1',name:'dag_run'}],structuredContent:{echo:{name:'dagu_execute',arguments:args}}});
    state.sessions.clear();state.sse=true;   // Dagu restarted: the session is gone; answers now come as an event stream
    const read=(await c.call('tools/call',{name:'dagu_read',arguments:{target:'dags'}})).result;
    assert.equal(read.isError,undefined);assert.deepEqual(read.structuredContent.echo.arguments,{target:'dags'});
    assert.equal(state.opened,2);assert.notEqual(mcpCalls[0].session,mcpCalls[1].session);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data,'panel/dagu-mcp-tools.json'),'utf8')).map(t=>t.name),['dagu_read','dagu_execute','dagu_change']);
  } finally {c.close();srv.close();}
  // Dagu down at session start: the last known definitions are still listed; a call says why it failed.
  const down=mcp(1,{FYSO_DATA:data});
  try {
    assert.ok((await down.call('tools/list')).result.tools.some(t=>t.name==='dagu_change'));
    const failed=(await down.call('tools/call',{name:'dagu_read',arguments:{target:'dags'}})).result;
    assert.equal(failed.isError,true);assert.match(failed.content[0].text,/Dagu is not reachable.*mise run up/);
  } finally {down.close();fs.rmSync(data,{recursive:true,force:true});}
});

test('--no-dagu keeps the Dagu tools out where the Dagu MCP is its own server (.mcp.json)',async()=>{
  const {srv,mcpCalls,port}=await fakeDagu({},DAGU_TOOLS);const c=mcp(port,{},['--no-dagu']);
  try {
    assert.ok(!(await c.call('tools/list')).result.tools.some(t=>t.name.startsWith('dagu_')));
    assert.equal((await c.call('tools/call',{name:'dagu_read',arguments:{}})).error.code,-32602);
    assert.equal(mcpCalls.length,0);
    const entry=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../template/framework/mcp.json'),'utf8')).mcpServers.fyso;
    assert.ok(entry.args.includes('--no-dagu'));
  } finally {c.close();srv.close();}
});

test('application access and connector preferences run the panel workflows',async()=>{
  const {srv,calls,port}=await fakeDagu({
    'fyso-app-access':{result:JSON.stringify({planId:'a'.repeat(64),changes:{gmail:'read'}})},
    'fyso-connector-preferences':{result:JSON.stringify({features:{claudeUserMcp:true,claudeUserSkills:false},versioned:true})},
  });
  const c=mcp(port);
  const tool=async(name,args)=>(await c.call('tools/call',{name,arguments:args})).result;
  try {
    await tool('fyso_app_access',{bot_id:'b1'});assert.deepEqual(calls.at(-1),{dag:'fyso-app-access',params:{OP:'read',BOT_ID:'b1'}});
    const plan=await tool('fyso_app_access_plan',{bot_id:'b1',revision:'r1',changes:{gmail:'read'}});
    assert.equal(plan.structuredContent.planId,'a'.repeat(64));
    const sent=calls.at(-1).params;assert.equal(sent.OP,'plan');assert.equal(sent.REVISION,'r1');
    assert.deepEqual(JSON.parse(Buffer.from(sent.CHANGES_B64,'base64').toString()),{gmail:'read'});
    await tool('fyso_app_access_apply',{plan_id:'a'.repeat(64)});assert.deepEqual(calls.at(-1),{dag:'fyso-app-access',params:{OP:'apply',PLAN_ID:'a'.repeat(64)}});
    await tool('fyso_connector_preferences',{});assert.deepEqual(calls.at(-1),{dag:'fyso-connector-preferences',params:{OP:'read'}});
    const saved=await tool('fyso_connector_preferences_save',{claudeUserMcp:true});
    assert.equal(saved.structuredContent.versioned,true);
    assert.deepEqual(JSON.parse(Buffer.from(calls.at(-1).params.SETTINGS_B64,'base64').toString()),{claudeUserMcp:true});
    const before=calls.length;
    assert.match((await tool('fyso_connector_preferences_save',{})).content[0].text,/claudeUserMcp, claudeUserSkills or both/);
    assert.match((await tool('fyso_connector_preferences_save',{claudeUserMcp:'yes'})).content[0].text,/must be true or false/);
    assert.match((await tool('fyso_logs',{process:'dagu',lines:'5'})).content[0].text,/lines must be an integer/);
    assert.match((await tool('fyso_app_access_plan',{bot_id:'b1',revision:'r1'})).content[0].text,/missing argument: changes/);
    assert.equal(calls.length,before);
    const local=await tool('fyso_file_read',{path:'secrets.enc.yaml'});assert.equal(local.isError,true);
    assert.match((await tool('fyso_file_read',{path:'framework/agent-context.md'})).structuredContent.content,/Ownership and isolation/);
  } finally {c.close();srv.close();}
});

// The coverage figures of docs/agent-surface.md come from this inventory: every tool it names must exist.
test('the action inventory is covered by tools that exist',async()=>{
  const {actions}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/agent-coverage.json'),'utf8'));
  const {srv,port}=await fakeDagu({},DAGU_TOOLS);const c=mcp(port,{FYSO_DATA:fs.mkdtempSync(path.join(os.tmpdir(),'fyso-mcp-'))});
  try {
    const names=new Set((await c.call('tools/list')).result.tools.map(t=>t.name));
    for(const a of actions) {
      if(a.tool)assert.ok(names.has(a.tool),`${a.action}: ${a.tool}`);
      else assert.ok(['person','gap'].includes(a.by),a.action);
      if(a.before)assert.ok(a.tool&&a.tool.startsWith('fyso_'),a.action);
    }
    const scope=actions.filter(a=>a.by!=='person');
    assert.deepEqual({total:actions.length,person:actions.length-scope.length,before:actions.filter(a=>a.before).length,after:scope.filter(a=>a.tool).length,gaps:scope.filter(a=>!a.tool).length},
      {total:35,person:7,before:12,after:26,gaps:2});
  } finally {c.close();srv.close();}
});
