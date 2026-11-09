// The platform MCP server (D33) over stdio against a fake Dagu API.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http'), path=require('node:path'), fs=require('node:fs'), os=require('node:os');
const {spawn}=require('node:child_process');
const server=path.resolve(__dirname,'../template/framework/scripts/fyso-mcp.cjs');

// Fake Dagu: records enqueues; runs of `failing` DAGs fail with a step error.
function fakeDagu(outputs) {
  const calls=[];
  const srv=http.createServer((req,res)=>{
    let body='';req.on('data',c=>body+=c);req.on('end',()=>{
      const send=v=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));};
      if(req.headers.authorization!=='Basic '+Buffer.from('admin:pw').toString('base64')){res.statusCode=401;return res.end('no');}
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
  return new Promise(r=>srv.listen(0,'127.0.0.1',()=>r({srv,calls,port:srv.address().port})));
}

function mcp(port,extra={}) {
  const child=spawn(process.execPath,[server],{env:{...process.env,FYSO_DAGU_PORT:String(port),FYSO_ADMIN_USER:'admin',FYSO_ADMIN_PASSWORD:'pw',...extra}});
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
    assert.match(init.instructions, /desktop connection exposes only the platform MCP/);
    const tools = (await c.call('tools/list')).result.tools;
    assert.equal(tools.find(t => t.name === 'fyso_context').annotations.readOnlyHint, true);
    const result = (await c.call('tools/call', {name: 'fyso_context', arguments: {}})).result;
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.guide, init.instructions);
    assert.match(result.structuredContent.guide, /fyso_bot_plan/);
  } finally { c.close(); }
});
