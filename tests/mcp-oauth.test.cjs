// Remote MCP OAuth sign-in (D88): discovery, and tokens of the trusted web login (own or shared).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path'), http=require('node:http');
const {spawn,spawnSync}=require('node:child_process');
const scripts=path.resolve(__dirname,'../template/framework/scripts');
const oauth=require(path.join(scripts,'mcp-oauth.cjs'));
const SECRET='s'.repeat(43);
const init={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'t',version:'0'}}};

// A Tinyauth-shaped login: discovery and userinfo for the tokens it knows.
async function login(t,issuer,tokens) {
  const seen={userinfo:0};
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/.well-known/openid-configuration')return res.end(JSON.stringify({issuer,authorization_endpoint:`${issuer}/authorize`,token_endpoint:`${issuer}/api/oidc/token`}));
    if(req.url==='/api/oidc/userinfo'){
      seen.userinfo++;
      const info=tokens[String(req.headers.authorization||'').replace(/^Bearer /,'')];
      res.statusCode=info?200:401;return res.end(JSON.stringify(info||{error:'invalid_grant'}));
    }
    res.statusCode=404;res.end('{}');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  return {port:server.address().port,seen};
}
async function start(t,env) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-mcp-oauth-'));
  const socket=path.join(dir,'mcp.sock');
  const child=spawn(process.execPath,[path.join(scripts,'fyso-mcp.cjs'),'--http',socket],{env:{PATH:process.env.PATH,HOME:process.env.HOME,FYSO_DATA:dir,FYSO_PROJECT:'demo',FYSO_WEB_DOMAIN:'demo.example.com',FYSO_HTTP_PORT:'8400',...env(dir)},stdio:['ignore','ignore','pipe']});
  t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true});});
  await new Promise((resolve,reject)=>{child.stderr.once('data',resolve);child.once('exit',code=>reject(Error(`server exited ${code}`)));});
  const call=(method,urlPath,headers={},body)=>new Promise((resolve,reject)=>{
    const req=http.request({socketPath:socket,path:urlPath,method,headers:{...(body!==undefined&&{'Content-Type':'application/json'}),...headers}},res=>{
      let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:text?JSON.parse(text):null}));});
    req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
  return {dir,call};
}
const userinfo=(user,client)=>({sub:oauth.subject(user,client),preferred_username:user,name:user});
const bearer=token=>({Authorization:`Bearer ${token}`});

test('the subject is the one Tinyauth derives: UUIDv5 of "user:client" in the URL namespace',()=>{
  // Reference value from Python: uuid.uuid5(uuid.NAMESPACE_URL, 'admin:fyso-mcp').
  assert.equal(oauth.subject('admin','fyso-mcp'),'bbaf7c63-cffa-5177-8a29-66eeebd9f044');
});

test('own login: discovery names its issuer, adds PKCE, and only the panel users of this client get in',async t=>{
  const issuer='https://auth.demo.example.com';
  const tokens={
    'token-admin-0123456789':userinfo('admin','fyso-mcp'),
    'token-viewer-012345678':userinfo('viewer','fyso-mcp'),
    'token-other-client-012':userinfo('admin','another-app'),
    'token-forged-sub-01234':{...userinfo('admin','fyso-mcp'),preferred_username:'ana'},
  };
  const auth=await login(t,issuer,tokens);
  const s=await start(t,dir=>{
    fs.mkdirSync(path.join(dir,'web-auth/runtime'),{recursive:true});
    fs.writeFileSync(oauth.accessFile({FYSO_DATA:dir}),JSON.stringify({allow:'admin,ana',block:'',policy:'deny'}));
    return {FYSO_WEB_SCHEME:'https',FYSO_AUTH_PORT:String(auth.port),FYSO_MCP_CLIENT_SECRET:SECRET};
  });
  const none=await s.call('POST','/mcp',{},init);
  assert.equal(none.status,401);
  assert.equal(none.headers['www-authenticate'],'Bearer resource_metadata="https://panel.demo.example.com/.well-known/oauth-protected-resource/mcp", scope="openid profile"');
  const resource=await s.call('GET','/.well-known/oauth-protected-resource/mcp');
  assert.deepEqual(resource.body,{resource:'https://panel.demo.example.com/mcp',authorization_servers:[issuer],scopes_supported:['openid','profile'],bearer_methods_supported:['header'],resource_name:'Fyso demo'});
  assert.equal((await s.call('GET','/.well-known/oauth-protected-resource')).status,200);
  assert.equal((await s.call('POST','/.well-known/oauth-protected-resource/mcp')).status,405);
  const server=await s.call('GET','/.well-known/oauth-authorization-server');
  assert.equal(server.body.issuer,issuer);assert.deepEqual(server.body.code_challenge_methods_supported,['S256']);
  const hello=await s.call('POST','/mcp',bearer('token-admin-0123456789'),init);
  assert.equal(hello.status,200);assert.equal(hello.body.result.serverInfo.name,'fyso');
  const before=auth.seen.userinfo;
  assert.equal((await s.call('POST','/mcp',bearer('token-admin-0123456789'),{jsonrpc:'2.0',id:2,method:'ping'})).status,200);
  assert.equal(auth.seen.userinfo,before,'a valid token is remembered');
  assert.equal((await s.call('POST','/mcp',bearer('token-viewer-012345678'),init)).status,401,'not a panel user');
  assert.equal((await s.call('POST','/mcp',bearer('token-other-client-012'),init)).status,401,'issued to another client');
  assert.equal((await s.call('POST','/mcp',bearer('token-forged-sub-01234'),init)).status,401,'subject of another user');
  assert.equal((await s.call('POST','/mcp',bearer('token-unknown-0123456'),init)).status,401);
  assert.equal((await s.call('POST','/mcp',{...bearer('token-admin-0123456789'),Origin:'https://claude.ai'},init)).status,403);
  assert.deepEqual((await s.call('GET','/health')).body,{ok:true,enabled:true,oauth:true});
});

test('shared login: the hub\'s issuer, its userinfo, its client id and its allow list',async t=>{
  const issuer='https://auth.hub.example.com';
  const auth=await login(t,issuer,{
    'token-ana-hub-0123456':userinfo('ana','auditor-mcp'),
    'token-bob-hub-0123456':userinfo('bob','auditor-mcp'),
    'token-ana-own-0123456':userinfo('ana','fyso-mcp'),
  });
  const s=await start(t,()=>({FYSO_WEB_SCHEME:'https',FYSO_AUTH_UPSTREAM:`127.0.0.1:${auth.port}`,FYSO_AUTH_PORT:'1',FYSO_MCP_CLIENT_ID:'auditor-mcp',FYSO_MCP_ALLOW:'ana'}));
  assert.deepEqual((await s.call('GET','/.well-known/oauth-protected-resource/mcp')).body.authorization_servers,[issuer]);
  assert.equal((await s.call('GET','/.well-known/oauth-authorization-server')).status,404,'the hub serves its own');
  assert.equal((await s.call('POST','/mcp',bearer('token-ana-hub-0123456'),init)).status,200);
  assert.equal((await s.call('POST','/mcp',bearer('token-bob-hub-0123456'),init)).status,401,'not in the hub allow list');
  assert.equal((await s.call('POST','/mcp',bearer('token-ana-own-0123456'),init)).status,401,'issued to another client of the hub');
});

test('shared login without an allow list lets nobody in; without a client id OAuth stays off',async t=>{
  const auth=await login(t,'https://auth.hub.example.com',{'token-ana-hub-0123456':userinfo('ana','auditor-mcp')});
  const closed=await start(t,()=>({FYSO_WEB_SCHEME:'https',FYSO_AUTH_UPSTREAM:`127.0.0.1:${auth.port}`,FYSO_MCP_CLIENT_ID:'auditor-mcp'}));
  assert.equal((await closed.call('POST','/mcp',bearer('token-ana-hub-0123456'),init)).status,401);
  const off=await start(t,()=>({FYSO_WEB_SCHEME:'https',FYSO_AUTH_UPSTREAM:`127.0.0.1:${auth.port}`}));
  assert.equal((await off.call('POST','/mcp',bearer('token-ana-hub-0123456'),init)).status,404);
  assert.equal((await off.call('GET','/.well-known/oauth-protected-resource/mcp')).status,404);
});

test('the project token keeps working next to OAuth, and the challenge stays plain without OAuth',async t=>{
  const auth=await login(t,'https://auth.demo.example.com',{});
  const token='t'.repeat(43);
  const both=await start(t,()=>({FYSO_WEB_SCHEME:'https',FYSO_AUTH_PORT:String(auth.port),FYSO_MCP_CLIENT_SECRET:SECRET,FYSO_MCP_TOKEN:token}));
  assert.equal((await both.call('POST','/mcp',bearer(token),init)).status,200);
  const plain=await start(t,()=>({FYSO_WEB_SCHEME:'https',FYSO_MCP_TOKEN:token}));
  assert.equal((await plain.call('POST','/mcp',{},init)).headers['www-authenticate'],'Bearer');
  assert.equal((await plain.call('GET','/.well-known/oauth-protected-resource/mcp')).status,404);
});

test('Tinyauth filters: block first, then allow (names or /regex/), then the policy',()=>{
  assert.equal(oauth.allowed({allow:'admin, ana',policy:'deny'},'ana'),true);
  assert.equal(oauth.allowed({allow:'admin,ana',block:'ana',policy:'deny'},'ana'),false);
  assert.equal(oauth.allowed({allow:'/^team-/',policy:'deny'},'team-x'),true);
  assert.equal(oauth.allowed({allow:'',policy:'deny'},'admin'),false);
  assert.equal(oauth.allowed({allow:'',policy:'allow'},'admin'),true);
  assert.equal(oauth.allowed(null,'admin'),false);
});

test('the connection list gives Claude Desktop the address, client id and secret',()=>{
  const env={PATH:process.env.PATH,FYSO_PROJECT:'demo-shop',FYSO_HTTP_PORT:'8400',FYSO_WEB_DOMAIN:'host1.proxy.example.com',FYSO_WEB_SCHEME:'https',FYSO_AUTH_PORT:'8409'};
  const remote=require(path.join(scripts,'agent-remote.cjs'));
  const own=remote.describe(env,'',SECRET);
  assert.equal(own.oauth,true);
  assert.deepEqual(own.clients.map(c=>c.id),['claude-desktop','claude-code-oauth']);
  assert.deepEqual(own.clients[0].commands,['https://panel.host1.proxy.example.com/mcp','fyso-mcp',SECRET]);
  assert.equal(own.clients[1].commands[0],`MCP_CLIENT_SECRET=${SECRET} claude mcp add --transport http --scope user --client-id fyso-mcp --client-secret --callback-port 33418 fyso-demo-shop https://panel.host1.proxy.example.com/mcp`);
  const hub=remote.describe({...env,FYSO_AUTH_UPSTREAM:'127.0.0.1:8489',FYSO_MCP_CLIENT_ID:'auditor-mcp'},'t'.repeat(43),'');
  assert.equal(hub.clients[0].note,'oauthHub');assert.deepEqual(hub.clients[0].commands,['https://panel.host1.proxy.example.com/mcp','auditor-mcp']);
  assert.ok(hub.clients.some(c=>c.id==='claude-code'),'the token clients stay');
  assert.throws(()=>remote.describe(env,'',''),/noToken/);
  const printed=spawnSync(process.execPath,[path.join(scripts,'agent-remote.cjs')],{encoding:'utf8',env:{...env,FYSO_MCP_CLIENT_SECRET:SECRET}});
  assert.equal(printed.status,0,printed.stderr);
  assert.match(printed.stdout,/OAuth Client ID: fyso-mcp/);assert.match(printed.stdout,new RegExp(`OAuth Client Secret: ${SECRET}`));
});
