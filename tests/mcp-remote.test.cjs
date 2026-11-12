// Remote MCP (D63): the platform server over HTTP on a private socket, and the task that connects a client.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path'), http=require('node:http');
const {spawn,spawnSync}=require('node:child_process');
const scripts=path.resolve(__dirname,'../template/framework/scripts');
const TOKEN='t'.repeat(43);

function start(t,env) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-mcp-'));
  const socket=path.join(dir,'mcp.sock');
  const child=spawn(process.execPath,[path.join(scripts,'fyso-mcp.cjs'),'--http',socket],{env:{PATH:process.env.PATH,HOME:process.env.HOME,...env},stdio:['ignore','ignore','pipe']});
  t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true});});
  const call=(method,urlPath,headers={},body)=>new Promise((resolve,reject)=>{
    const req=http.request({socketPath:socket,path:urlPath,method,headers:{...(body!==undefined&&{'Content-Type':'application/json'}),...headers}},res=>{
      let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:text?JSON.parse(text):null}));});
    req.on('error',reject);req.end(body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body));
  });
  const ready=new Promise((resolve,reject)=>{child.stderr.once('data',resolve);child.once('exit',code=>reject(Error(`server exited ${code}`)));});
  return ready.then(()=>({socket,call,auth:{Authorization:`Bearer ${TOKEN}`}}));
}
const init={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'t',version:'0'}}};

test('with an HTTPS provider and the token, a client initializes and lists the platform tools without Dagu\'s',async t=>{
  const s=await start(t,{FYSO_WEB_SCHEME:'https',FYSO_MCP_TOKEN:TOKEN});
  assert.equal((fs.statSync(s.socket).mode&0o077),0);
  const hello=await s.call('POST','/mcp',s.auth,init);
  assert.equal(hello.status,200);assert.equal(hello.body.result.serverInfo.name,'fyso');assert.equal(hello.body.result.protocolVersion,'2025-06-18');
  assert.equal((await s.call('POST','/mcp',s.auth,{jsonrpc:'2.0',method:'notifications/initialized'})).status,202);
  const list=await s.call('POST','/mcp',s.auth,{jsonrpc:'2.0',id:2,method:'tools/list'});
  const names=list.body.result.tools.map(tool=>tool.name);
  assert.ok(names.includes('fyso_status'));assert.ok(!names.some(name=>name.startsWith('dagu_')));
  const forwarded=await s.call('POST','/mcp',s.auth,{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'dagu_read',arguments:{}}});
  assert.equal(forwarded.body.error.code,-32602);
  const batch=await s.call('POST','/mcp',s.auth,[{jsonrpc:'2.0',id:4,method:'ping'},{jsonrpc:'2.0',method:'notifications/initialized'}]);
  assert.deepEqual(batch.body,[{jsonrpc:'2.0',id:4,result:{}}]);
});

test('the token is required, browsers are refused and only POST is served',async t=>{
  const s=await start(t,{FYSO_WEB_SCHEME:'https',FYSO_MCP_TOKEN:TOKEN});
  const none=await s.call('POST','/mcp',{},init);
  assert.equal(none.status,401);assert.equal(none.headers['www-authenticate'],'Bearer');
  for(const bad of [`Bearer ${'x'.repeat(43)}`,`Bearer ${TOKEN}x`,`Basic ${TOKEN}`,TOKEN])
    assert.equal((await s.call('POST','/mcp',{Authorization:bad},init)).status,401);
  assert.equal((await s.call('POST','/mcp',{...s.auth,Origin:'https://panel.host1.proxy.example.com'},init)).status,403);
  assert.equal((await s.call('GET','/mcp',s.auth)).status,405);
  assert.equal((await s.call('POST','/other',s.auth,init)).status,404);
  assert.equal((await s.call('POST','/mcp',s.auth,'{not json')).status,400);
  assert.equal((await s.call('POST','/mcp',s.auth,JSON.stringify({pad:'x'.repeat(1100000)}))).status,413);
  for(const r of [none]) assert.ok(!JSON.stringify(r.body).includes(TOKEN));
});

test('without an HTTPS provider, or without a token, the endpoint stays off even for the right token',async t=>{
  const plain=await start(t,{FYSO_MCP_TOKEN:TOKEN});
  const off=await plain.call('POST','/mcp',plain.auth,init);
  assert.equal(off.status,404);assert.match(off.body.error,/no HTTPS provider/);
  assert.deepEqual((await plain.call('GET','/health')).body,{ok:true,enabled:false});
  const untokened=await start(t,{FYSO_WEB_SCHEME:'https'});
  const missing=await untokened.call('POST','/mcp',{Authorization:'Bearer '},init);
  assert.equal(missing.status,404);assert.match(missing.body.error,/agent:remote/);
  const short=await start(t,{FYSO_WEB_SCHEME:'https',FYSO_MCP_TOKEN:'short'});
  assert.equal((await short.call('POST','/mcp',{Authorization:'Bearer short'},init)).status,404);
});

const remote=env=>spawnSync('bash',[path.join(scripts,'agent-remote.sh')],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,FYSO_PROJECT:'demo-shop',FYSO_HTTP_PORT:'8400',...env}});
test('agent:remote refuses without HTTPS and names the fix',()=>{
  const r=remote({FYSO_WEB_DOMAIN:'demo-8400.localhost',FYSO_WEB_SCHEME:'http',FYSO_MCP_TOKEN:TOKEN});
  assert.notEqual(r.status,0);assert.match(r.stderr,/HTTPS provider extension/);assert.ok(!(r.stdout+r.stderr).includes(TOKEN));
});
