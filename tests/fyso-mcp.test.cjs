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
        const result=msg.method==='tools/list'?{tools:mcpTools}:msg.params?.arguments?.type==='upsert_wiki_page'?{content:[{type:'text',text:'saved'}],structuredContent:{applied:true}}:msg.params?.arguments?.target==='runs'?{content:[{type:'text',text:'Dagu read completed.'}],structuredContent:{data:{items:[{name:'orders',dagRunId:'r1'},{name:'orders-secret',dagRunId:'r2'}]},target:'runs'}}:{content:[{type:'text',text:'Dagu done.'},{type:'resource_link',uri:'dagu://runs/x/1',name:'dag_run'}],structuredContent:{echo:msg.params}};
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

test('feedback records separate project wiki pages through Dagu, even with --no-dagu',async()=>{
  const {srv,mcpCalls,port}=await fakeDagu({},DAGU_TOOLS);const c=mcp(port,{},['--no-dagu']);
  try {
    const submit=()=>c.call('tools/call',{name:'fyso_feedback',arguments:{title:'Broken workflow',description:'Expected success; got an error.',component:'Dagu'}});
    const first=(await submit()).result.structuredContent, second=(await submit()).result.structuredContent;
    assert.notEqual(first.id,second.id);assert.equal(first.status,'saved');assert.equal(first.notification,'none');
    const sent=mcpCalls[0];assert.equal(sent.name,'dagu_change');assert.equal(sent.arguments.type,'upsert_wiki_page');assert.equal(sent.arguments.mode,'apply');assert.equal(sent.arguments.path,`feedback/${first.id}`);
    assert.match(sent.arguments.content,/Broken workflow/);assert.match(sent.arguments.content,/Expected success/);
    assert.equal((await c.call('tools/call',{name:'fyso_feedback',arguments:{title:' ',description:'x'}})).result.isError,true);
    assert.equal((await c.call('tools/call',{name:'fyso_feedback',arguments:{title:'x',description:'x'.repeat(16001)}})).result.isError,true);
    assert.equal(mcpCalls.length,2);
  } finally {c.close();srv.close();}
});

test('tools run the panel workflows with their params and return parsed outputs',async()=>{
  const {srv,calls,port}=await fakeDagu({
    'fyso-ext-install':{result:JSON.stringify({id:'sample',mode:'add',version:'v1.0.0',commit:'abc1234'})},
    'fyso-bot-architect':{result:JSON.stringify({planId:'p1',action:'create',preview:['create Support']})},
    'fyso-skills-catalog':{catalog:JSON.stringify({preview:{name:'pdf',skillMd:'text'}})},
    'fyso-skills-install':{result:JSON.stringify({op:'add',name:'pdf',commit:'abc1234',skill:{name:'pdf',state:'review'}})},
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
    // Third-party skills (D64): search and install only; confirming stays with a person in the panel.
    const skills=(await c.call('tools/call',{name:'fyso_skill_search',arguments:{source:'anthropics/skills',skill:'pdf'}})).result;
    assert.equal(skills.structuredContent.preview.name,'pdf');
    assert.deepEqual(calls.at(-1),{dag:'fyso-skills-catalog',params:{QUERY:'',SRC:'anthropics/skills',SKILL:'pdf',COMMIT:''}});
    const planned=(await c.call('tools/call',{name:'fyso_skill_plan',arguments:{mode:'add',source:'anthropics/skills',skill:'pdf'}})).result;
    assert.equal(planned.isError,undefined);
    assert.deepEqual(calls.at(-1),{dag:'fyso-skills-catalog',params:{OP:'add',SRC:'anthropics/skills',SKILL:'pdf',NAME:'',COMMIT:''}});
    const added=(await c.call('tools/call',{name:'fyso_skill_install',arguments:{planId:'abc'}})).result;
    assert.equal(added.structuredContent.skill.state,'review');
    assert.deepEqual(calls.at(-1),{dag:'fyso-skills-install',params:{OP:'apply-plan',PLAN_ID:'abc'}});
    const refused=(await c.call('tools/call',{name:'fyso_skill_install',arguments:{source:'anthropics/skills'}})).result;
    assert.equal(refused.isError,true);
    assert.ok(!(await c.call('tools/list')).result.tools.some(t=>/skill.*(confirm|enable|remove)/.test(t.name)));
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
  // Allowed names that point at excluded files inside the project.
  fs.symlinkSync('auth/tinyauth.yaml',path.join(root,'project/guide.yaml'));
  fs.symlinkSync('../.data/panel/project.json',path.join(root,'project/runtime.json'));
  fs.symlinkSync('../secrets.enc.yaml',path.join(root,'project/settings.yaml'));
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
      assert.deepEqual(m.workflows[2],{name:'orders',owner:'project',class:'project',description:'Sync orders',schedule:'0 * * * *',params:['SHOP']});
      assert.deepEqual(m.workflows.map(w=>w.class),['system','system','project']);assert.deepEqual(m.workflowScopes,[]);
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
    for(const hidden of ['project/auth/tinyauth.yaml','project/api-token.txt','project/guide.yaml','project/runtime.json','project/settings.yaml'])assert.ok(!listed.includes(hidden),hidden);
    assert.ok(listed.includes('project/workflows/fyso-snapshot.yaml'));   // framework workflow link stays listed
    for(const denied of ['project/guide.yaml','project/runtime.json','project/settings.yaml','secrets.enc.yaml','.data/panel/project.json','outside.txt','project/auth/tinyauth.yaml','project/api-token.txt','project/../secrets.enc.yaml','../x','/etc/hosts','project/escape/x','.copier-answers.ext-sample.yml','framework/scripts/x.cjs'])
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
      {total:37,person:7,before:12,after:28,gaps:2});
  } finally {c.close();srv.close();}
});

// D60: workflow scopes.
const scopesLib=require('../template/framework/scripts/workflow-scopes.cjs');
const {guard}=require('../template/framework/scripts/dagu-scope.cjs');
const hasYaml=(()=>{try{scopesLib.workflows(path.resolve(__dirname,'../template'));return true;}catch{return false;}})();
const {execFileSync}=require('node:child_process');

test('a workflow scope allows reading and running its workflows and refuses everything else',()=>{
  const names=new Map([['orders',{name:'orders',class:'project',description:'Sync'}],['fyso-dev-task',{name:'fyso-dev-task',class:'system'}]]);
  const g=guard('/nowhere','ventas',['fyso-dev-task'],()=>names);
  const ok=(tool,args)=>assert.doesNotThrow(()=>g.check(tool,args),JSON.stringify(args));
  const no=(tool,args,why)=>assert.throws(()=>g.check(tool,args),why||/not in scope|not available|only dagu:|accepts only/,JSON.stringify(args));
  assert.deepEqual(g.tools([{name:'dagu_read'},{name:'dagu_execute'},{name:'dagu_change'},{name:'other'}]).map(t=>t.name),['dagu_read','dagu_execute']);
  // The list comes from the repository, not from Dagu.
  assert.deepEqual(g.check('dagu_read',{target:'dags'}).structuredContent.data.items.map(i=>[i.name,i.class]),[['orders','project'],['fyso-dev-task','system']]);
  for(const args of [{target:'dag_spec',name:'orders'},{target:'run',name:'orders',dagRunId:'r'},{target:'step_log',name:'orders',dagRunId:'r',stepName:'s',query:'tail=50'},{target:'runs',name:'fyso-dev-task'},
    {target:'references'},{target:'reference',name:'authoring'},{uri:'dagu://dags/orders/spec'},{uri:'dagu://runs/orders/r1/logs'},{uri:'dagu://reference/authoring'}])ok('dagu_read',args);
  for(const args of [{action:'start',name:'orders',params:{A:'1'},wait:true},{action:'enqueue',name:'fyso-dev-task',params:'{"TASK":"x"}'},{action:'stop',name:'orders',dagRunId:'r'},{action:'approve',name:'orders',dagRunId:'r',stepName:'s',attemptId:'a',inputs:{}}])ok('dagu_execute',args);
  for(const args of [{target:'dag_spec',name:'hello'},{target:'dag_spec',name:'fyso-snapshot'},{target:'dag_spec'},{target:'runs'},{target:'runs',name:'orders',query:'name=hello'},{target:'dags',query:'page=2'},
    {target:'dag_search',search:'x'},{target:'wiki',workspace:'all'},{target:'wiki_page',workspace:'default',path:'x'},{target:'workbook',path:'/etc/passwd'},{target:'dag_profile',name:'orders'},{target:'made_up',name:'orders'},
    {target:'run_logs',name:'orders',dagRunId:'r',query:'name=hello'},{target:'dag_spec',name:'orders',workspace:'all'},{target:'dag_spec',name:'orders',uri:'dagu://dags/hello/spec'},
    {uri:'dagu://dags/hello/spec'},{uri:'dagu://dags/orders/../hello/spec'},{uri:'dagu://dags/orders%2F..%2Fhello/spec'},{uri:'dagu://wiki/default/x'},{uri:'dagu://dags/orders/spec?x=1'},{uri:'https://example.com'},{}])no('dagu_read',args);
  for(const args of [{action:'start',name:'hello'},{action:'start',name:'fyso-snapshot'},{action:'start'},{action:'start',name:'orders',spec:'steps: []'},{action:'start',name:'orders',targetType:'inline_spec'},
    {action:'enqueue',name:'orders',queue:'other'},{action:'start',name:'orders',labels:['workspace=ops']},{action:'start',name:'orders',somethingNew:true}])no('dagu_execute',args);
  no('dagu_change',{mode:'apply',name:'orders',spec:'x'},/does not change/);no('dagu_anything',{});
  // Run lists: only the requested workflow goes to Dagu and comes back; an unknown shape is refused.
  assert.deepEqual(g.rewrite('dagu_read',{target:'runs',name:'orders'}),{target:'runs',query:'name=orders'});
  const shaped=g.shape('dagu_read',{target:'runs',name:'orders'},{structuredContent:{data:{items:[{name:'orders'},{name:'orders-secret'}]}}});
  assert.deepEqual(shaped.structuredContent.data.items,[{name:'orders'}]);assert.ok(!shaped.content[0].text.includes('secret'));
  assert.throws(()=>g.shape('dagu_read',{target:'runs',name:'orders'},{content:[{type:'text',text:'everything'}]}),/unexpected run list/);
});

function scopeProject() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-scope-'));
  const put=(file,text)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text);};
  put('framework/mcp.json','{"mcpServers":{"dagu":{"type":"http","url":"http://127.0.0.1:1/mcp"}}}');
  fs.mkdirSync(path.join(root,'framework/scripts'),{recursive:true});
  fs.copyFileSync(path.resolve(__dirname,'../template/framework/scripts/check-paths.sh'),path.join(root,'framework/scripts/check-paths.sh'));fs.chmodSync(path.join(root,'framework/scripts/check-paths.sh'),0o755);
  put('framework/workflows/snapshot.yaml','description: Save\nlabels:\n  - workspace=ventas\n');   // a label on a system workflow is ignored
  put('project/workflows/orders.yaml','# keep this comment\ndescription: Sync orders\nlabels:\n  - team=sales\nsteps:\n  - command: echo hi\n');
  put('project/workflows/invoices.yaml','description: Invoices\nsteps:\n  - command: echo hi\n');
  put('project/workflows/ext-sample-check.yaml','description: Check\n');
  fs.symlinkSync('../../framework/workflows/snapshot.yaml',path.join(root,'project/workflows/fyso-snapshot.yaml'));
  put('project/bots/team.yaml','version: 1\nbots:\n  - name: All\n    tools: { allow: ["native:*", "mcp:dagu:*"] }\n');
  const git=(...a)=>execFileSync('git',['-c','user.name=T','-c','user.email=t@example.invalid',...a],{cwd:root});
  git('init','-q','-b','main');git('add','.');git('commit','-qm','init');
  // The commits made by save/remove need an identity in this repository.
  git('config','user.name','T');git('config','user.email','t@example.invalid');
  return {root,put,git};
}

test('scopes are saved as Dagu labels plus a project MCP entry, committed, and removed again',{skip:!hasYaml&&'needs the pinned yaml package (mise)'},()=>{
  const {root,put,git}=scopeProject();
  try {
    assert.deepEqual(scopesLib.read(root).system,['ext-sample-check','fyso-snapshot']);
    assert.deepEqual(scopesLib.read(root).unscoped.map(w=>w.name),['invoices','orders']);
    const saved=scopesLib.save(root,{scope:'ventas',workflows:['orders'],system:['fyso-snapshot']});
    assert.deepEqual([saved.server,saved.workflows,saved.system,saved.bots],['dagu-ventas',['orders'],['fyso-snapshot'],[]]);
    const text=fs.readFileSync(path.join(root,'project/workflows/orders.yaml'),'utf8');
    assert.match(text,/# keep this comment/);assert.match(text,/- team=sales\n  - workspace=ventas/);
    const entry=JSON.parse(fs.readFileSync(path.join(root,'project/mcp.json'),'utf8')).mcpServers['dagu-ventas'];
    assert.deepEqual(entry,{type:'stdio',command:'node',args:['framework/scripts/fyso-mcp.cjs','--scope','ventas','--system','fyso-snapshot']});   // no mise: bots have no decrypted secrets
    assert.ok(JSON.parse(fs.readFileSync(path.join(root,'.mcp.json'),'utf8')).mcpServers['dagu-ventas']);
    assert.equal(String(git('status','--porcelain','--','project')),'');assert.match(String(git('log','-1','--format=%s')),/workflows: scope ventas/);
    // The label of a system workflow never puts it in a scope; only the grant does.
    assert.deepEqual([...scopesLib.allowed(root,'ventas',[]).keys()],['orders']);
    assert.deepEqual([...scopesLib.allowed(root,'ventas',['fyso-snapshot','invoices']).keys()],['fyso-snapshot','orders']);
    // Replacing the scope moves the label; a workflow is in one scope at most.
    scopesLib.save(root,{scope:'ventas',workflows:['invoices']});
    assert.deepEqual(scopesLib.read(root).scopes[0].workflows,['invoices']);assert.doesNotMatch(fs.readFileSync(path.join(root,'project/workflows/orders.yaml'),'utf8'),/workspace=/);
    assert.deepEqual(scopesLib.save(root,{scope:'ops',workflows:['invoices']}).moved,[{name:'invoices',from:'ventas'}]);
    for(const [input,why] of [[{scope:'ventas',workflows:['fyso-snapshot']},/system workflow/],[{scope:'ventas',workflows:['nope']},/unknown workflow/],[{scope:'ventas',workflows:[],system:['orders']},/not a system workflow/],
      [{scope:'system',workflows:[]},/invalid scope name/],[{scope:'Bad Name',workflows:[]},/invalid scope name/]])assert.throws(()=>scopesLib.save(root,input),why);
    put('project/workflows/orders.yaml','description: edited by hand\n');
    assert.throws(()=>scopesLib.save(root,{scope:'ventas',workflows:['orders']}),/commit or discard existing edits/);
    git('checkout','--','project/workflows/orders.yaml');
    // A scope a declared bot selects cannot be removed.
    put('project/bots/team.yaml','version: 1\nbots:\n  - name: Seller\n    tools: { allow: ["native:*", "mcp:dagu-ops:*"] }\n');git('commit','-qam','bot');
    assert.deepEqual(scopesLib.read(root).scopes.find(s=>s.scope==='ops').bots,['Seller']);
    assert.throws(()=>scopesLib.remove(root,{scope:'ops'}),/bots still use dagu-ops: Seller/);
    assert.deepEqual(scopesLib.remove(root,{scope:'ventas'}).removed,'ventas');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'project/mcp.json'),'utf8')).mcpServers['dagu-ventas'],undefined);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('the scope server gives a bot Dagu read and execute for its scope only, with OpenMausBot\'s header',{skip:!hasYaml&&'needs the pinned yaml package (mise)'},async()=>{
  const {root}=scopeProject();scopesLib.save(root,{scope:'ventas',workflows:['orders']});
  // The server serves the project it is installed in: install it in the fixture.
  for(const file of ['fyso-mcp.cjs','project-map.cjs','dagu-mcp.cjs','dagu-scope.cjs','workflow-scopes.cjs','mcp-config.cjs'])fs.copyFileSync(path.join(path.dirname(server),file),path.join(root,'framework/scripts',file));
  fs.writeFileSync(path.join(root,'framework/agent-context.md'),'guide');
  const {srv,mcpCalls,port}=await fakeDagu({},DAGU_TOOLS);
  // As a bot's process has it: the port and the header, no login and no mise.
  const child=spawn(process.execPath,[path.join(root,'framework/scripts/fyso-mcp.cjs'),'--scope','ventas'],{env:{PATH:process.env.PATH,FYSO_DAGU_PORT:String(port),DAGU_MCP_AUTH:'Basic '+Buffer.from('admin:pw').toString('base64'),FYSO_DATA:fs.mkdtempSync(path.join(os.tmpdir(),'fyso-mcp-'))},cwd:root});
  let buf='',seq=0;const waiting=new Map();
  child.stdout.on('data',d=>{buf+=d;for(let i;(i=buf.indexOf('\n'))>=0;){const m=JSON.parse(buf.slice(0,i));buf=buf.slice(i+1);waiting.get(m.id)?.(m);}});
  const call=(method,params)=>new Promise(r=>{const id=++seq;waiting.set(id,r);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  const tool=async(name,args)=>(await call('tools/call',{name,arguments:args})).result;
  try {
    const handshake=await call('initialize',{protocolVersion:'2025-06-18'});
    assert.equal(handshake.error,undefined,JSON.stringify(handshake.error));
    const init=handshake.result;
    assert.equal(init.serverInfo.name,'fyso-dagu-ventas');
    assert.deepEqual((await call('tools/list')).result.tools.map(t=>t.name),['dagu_read','dagu_execute']);
    assert.equal((await call('tools/call',{name:'fyso_status',arguments:{}})).error.code,-32602);
    for(const [name,args] of [['dagu_execute',{action:'start',name:'hello'}],['dagu_execute',{action:'start',name:'orders',spec:'x'}],['dagu_change',{mode:'apply',name:'orders',spec:'x'}],['dagu_read',{target:'dag_search',search:'x'}]])
      assert.equal((await tool(name,args)).isError,true,JSON.stringify(args));
    assert.equal(mcpCalls.length,0);   // nothing refused reached Dagu
    assert.match(init.instructions,/read and run these workflows only: orders\./);
    assert.deepEqual((await tool('dagu_read',{target:'dags'})).structuredContent.data.items.map(i=>i.name),['orders']);
    assert.equal(mcpCalls.length,0);   // the list is answered from the repository
    const run=await tool('dagu_execute',{action:'start',name:'orders',params:{SHOP:'x'},wait:true});
    assert.equal(run.isError,undefined);assert.deepEqual(mcpCalls.at(-1).arguments,{action:'start',name:'orders',params:{SHOP:'x'},wait:true});
    const runs=await tool('dagu_read',{target:'runs',name:'orders'});
    assert.deepEqual(mcpCalls.at(-1).arguments,{target:'runs',query:'name=orders'});
    assert.deepEqual(runs.structuredContent.data.items,[{name:'orders',dagRunId:'r1'}]);   // Dagu also returned orders-secret
  } finally {child.stdin.end();srv.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('a workflow scope lets a run carry plain labels but never a workspace label',()=>{
  const names=new Map([['orders',{name:'orders',class:'project'}]]);
  const g=guard('/nowhere','ventas',[],()=>names);
  const start=labels=>g.check('dagu_execute',{action:'start',name:'orders',labels});
  assert.doesNotThrow(()=>start(['assignee=team','blocking=true','deadline=1794932355','choices-hex='+'ab'.repeat(900)]));
  for(const labels of [['workspace=ops'],['assignee=team','Workspace=ops'],['workspace'],'assignee=team',[42],['a b'],['=x'],['ok=ñ'],Array(17).fill('a=b')])
    assert.throws(()=>start(labels),/workspace label is not available|plain run labels/,JSON.stringify(labels).slice(0,60));
  assert.throws(()=>g.check('dagu_execute',{action:'start',name:'other',labels:['a=b']}),/not in scope/);
});

test('scoped execute advertises only arguments that its guard accepts',()=>{
  const g=require('../template/framework/scripts/dagu-scope.cjs').guard('/tmp','test',[],()=>new Map());
  const [tool]=g.tools([{name:'dagu_execute',inputSchema:{type:'object',properties:{action:{type:'string'},name:{type:'string'},targetType:{type:'string'},waitTimeoutSeconds:{type:'number'}},required:['action','name']}}]);
  assert.deepEqual(Object.keys(tool.inputSchema.properties),['action','name']);
  assert.deepEqual(tool.inputSchema.required,['action','name']);
  assert.throws(()=>g.check('dagu_execute',{action:'start',name:'x',targetType:'dag'}),/not available/);
});

test('scoped Dagu results expose structured run details to text-only MCP clients',()=>{
  const names=new Map([['orders',{name:'orders',class:'project'}]]);
  const g=guard('/nowhere','ventas',[],()=>names);
  const input={content:[{type:'text',text:'Dagu read completed.'},{type:'resource_link',uri:'dagu://runs/orders/r1',name:'run'}],structuredContent:{target:'run',data:{name:'orders',dagRunId:'r1',status:'waiting'}}};
  const result=g.shape('dagu_read',{target:'run',name:'orders',dagRunId:'r1'},input);
  assert.deepEqual(result.structuredContent,input.structuredContent);
  assert.ok(result.content.some(item=>item.type==='text'&&item.text.includes('waiting')));
  assert.ok(result.content.some(item=>item.type==='resource_link'));
  const failed={isError:true,content:[{type:'text',text:'failed'}]};
  assert.deepEqual(g.shape('dagu_read',{target:'run',name:'orders'},failed),failed);
});

test('Dagu-only project server exposes native Dagu tools without platform tools',async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-dagu-only-'));
  const {srv,port}=await fakeDagu({},DAGU_TOOLS);const c=mcp(port,{FYSO_DATA:data},['--dagu-only']);
  try {
    const init=(await c.call('initialize',{protocolVersion:'2025-06-18'})).result;
    assert.equal(init.serverInfo.name,'fyso-dagu');
    assert.deepEqual((await c.call('tools/list')).result.tools.map(t=>t.name),['dagu_read','dagu_execute','dagu_change']);
    assert.equal((await c.call('tools/call',{name:'fyso_bot_apply',arguments:{}})).error.code,-32602);
    const result=(await c.call('tools/call',{name:'dagu_read',arguments:{target:'run',name:'orders',dagRunId:'r1'}})).result;
    assert.equal(result.structuredContent.echo.name,'dagu_read');
    assert.ok(result.content.some(item=>item.type==='text' && item.text.includes('orders')));
  } finally {c.close();srv.close();fs.rmSync(data,{recursive:true,force:true});}
});

test('Dagu-only discovery does not report cached tools when its Dagu is down',async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-dagu-only-offline-'));
  const {srv,port}=await fakeDagu({},DAGU_TOOLS);const live=mcp(port,{FYSO_DATA:data},['--dagu-only']);
  try {
    assert.ok((await live.call('tools/list')).result.tools.some(t=>t.name==='dagu_read'));
    live.close();await new Promise(resolve=>srv.close(resolve));
    const offline=mcp(1,{FYSO_DATA:data},['--dagu-only']);
    try {assert.deepEqual((await offline.call('tools/list')).result.tools,[]);} finally {offline.close();}
  } finally {live.close();srv.close();fs.rmSync(data,{recursive:true,force:true});}
});

test('the remote MCP removes its socket when stopped with SIGTERM', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-mcp-sock-')), sock=path.join(dir,'mcp.sock');
  const child=spawn(process.execPath,[path.join(__dirname,'../template/framework/scripts/fyso-mcp.cjs'),'--http',sock],
    {env:{PATH:process.env.PATH,FYSO_HTTP_PORT:'0'},stdio:['ignore','ignore','pipe']});
  try {
    await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('not ready')),5000);
      child.stderr.on('data',()=>{if(fs.existsSync(sock)){clearTimeout(t);resolve();}});});
    const code=await new Promise(resolve=>{child.once('exit',(c,s)=>resolve(c??s));child.kill('SIGTERM');});
    assert.equal(code,0);
    assert.equal(fs.existsSync(sock),false,'socket file left behind');
  } finally { child.kill('SIGKILL'); fs.rmSync(dir,{recursive:true,force:true}); }
});
