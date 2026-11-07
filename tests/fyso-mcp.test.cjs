// The platform MCP server (D32) over stdio against a fake Dagu API.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http'), path=require('node:path');
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

function mcp(port) {
  const child=spawn(process.execPath,[server],{env:{...process.env,FYSO_DAGU_PORT:String(port),FYSO_ADMIN_USER:'admin',FYSO_ADMIN_PASSWORD:'pw'}});
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
    for(const n of ['fyso_status','fyso_check','fyso_doctor','fyso_bots_list','fyso_bot_plan','fyso_bot_apply','fyso_ext_search','fyso_ext_install','fyso_snapshot'])assert.ok(names.includes(n),n);
    assert.equal((await c.call('ping')).result&&true,true);
    assert.equal((await c.call('nope/method')).error.code,-32601);
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
