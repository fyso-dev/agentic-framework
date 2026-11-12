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

test('the terminal task lists every client with the token it was given',()=>{
  const r=spawnSync(process.execPath,[path.join(scripts,'agent-remote.cjs')],{encoding:'utf8',env:{PATH:process.env.PATH,FYSO_PROJECT:'demo-shop',FYSO_HTTP_PORT:'8400',FYSO_WEB_DOMAIN:'host1.proxy.example.com',FYSO_WEB_SCHEME:'https',FYSO_MCP_TOKEN:TOKEN}});
  assert.equal(r.status,0,r.stderr);
  for(const line of [`claude mcp add --transport http --scope user fyso-demo-shop https://panel.host1.proxy.example.com/mcp --header "Authorization: Bearer ${TOKEN}"`,
    `export FYSO_DEMO_SHOP_MCP_TOKEN=${TOKEN}`,'codex mcp add fyso-demo-shop --url https://panel.host1.proxy.example.com/mcp --bearer-token-env-var FYSO_DEMO_SHOP_MCP_TOKEN',
    `opencode mcp add fyso-demo-shop --url https://panel.host1.proxy.example.com/mcp --header "Authorization=Bearer ${TOKEN}"`,
    `gemini mcp add --transport http --scope user fyso-demo-shop https://panel.host1.proxy.example.com/mcp -H "Authorization: Bearer ${TOKEN}"`])
    assert.ok(r.stdout.includes(line),line);
});

// The panel's Run action (D65), with real sops and age: FYSO_TEST_SOPS and FYSO_TEST_AGE_KEYGEN.
const sopsTools=[process.env.FYSO_TEST_SOPS,process.env.FYSO_TEST_AGE_KEYGEN];
test('the Dagu action creates the token once and reports the address, never the token',{skip:sopsTools.every(Boolean)?false:'requires explicit sops and age-keygen binaries'},t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-remote-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.cpSync(scripts,path.join(dir,'framework/scripts'),{recursive:true});
  const bin=path.join(dir,'bin');fs.mkdirSync(bin);fs.symlinkSync(sopsTools[0],path.join(bin,'sops'));
  const key=path.join(dir,'key.txt');assert.equal(spawnSync(sopsTools[1],['-o',key]).status,0);
  fs.writeFileSync(path.join(dir,'.sops.yaml'),`creation_rules:\n  - path_regex: secrets\\.enc\\.yaml$\n    age: ${/age1[a-z0-9]+/.exec(fs.readFileSync(key,'utf8'))[0]}\n`);
  const env={PATH:`${bin}:${process.env.PATH}`,HOME:process.env.HOME,SOPS_AGE_KEY_FILE:key,FYSO_PROJECT:`remote-${process.pid}`,FYSO_HTTP_PORT:'19970',FYSO_WEB_DOMAIN:'host1.proxy.example.com',FYSO_WEB_SCHEME:'https',MODE:'remote'};
  fs.writeFileSync(path.join(dir,'plain.yaml'),"FYSO_ADMIN_PASSWORD: 'technical-fixture'\n");
  const first=spawnSync(sopsTools[0],['encrypt','--filename-override','secrets.enc.yaml','--input-type','yaml','--output-type','yaml','plain.yaml'],{cwd:dir,env,encoding:'utf8'});
  fs.writeFileSync(path.join(dir,'secrets.enc.yaml'),first.stdout);fs.rmSync(path.join(dir,'plain.yaml'));
  const action=extra=>spawnSync(process.execPath,[path.join(dir,'framework/scripts/agent-connect-action.cjs')],{cwd:dir,env:{...env,...extra},encoding:'utf8'});
  const stored=()=>spawnSync(sopsTools[0],['decrypt','--extract','["FYSO_MCP_TOKEN"]','secrets.enc.yaml'],{cwd:dir,env,encoding:'utf8'}).stdout.trim();
  const created=action({});
  assert.equal(created.status,0,created.stderr);
  const token=stored();assert.equal(token.length,43);
  assert.deepEqual(JSON.parse(created.stdout),{mode:'remote',server:`fyso-remote-${process.pid}`,url:'https://panel.host1.proxy.example.com/mcp',created:true});
  assert.ok(!(created.stdout+created.stderr).includes(token));
  const again=action({FYSO_MCP_TOKEN:token});
  assert.equal(JSON.parse(again.stdout).created,false);assert.equal(stored(),token);assert.ok(!(again.stdout+again.stderr).includes(token));
  const plain=action({FYSO_WEB_SCHEME:'http'});
  assert.notEqual(plain.status,0);assert.match(plain.stderr,/HTTPS/);
});
