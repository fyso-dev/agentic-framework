const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {configure,createServer,validate}=require('../template/framework/scripts/composio-setup.cjs');
const key='fixture-composio-key-not-a-credential';
async function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'composio-setup-'));try{
 const env={...process.env,FYSO_ROOT:root,FYSO_DATA:path.join(root,'.data'),FYSO_OMB_PORT:'19544',FYSO_HTTP_PORT:'19540',FYSO_ADMIN_USER:'fixture',FYSO_ADMIN_PASSWORD:'fixture'};
 fs.writeFileSync(path.join(root,'secrets.enc.yaml'),'original encrypted data');
 const commands=[],requests=[];
 const command=(bin,args,options)=>{commands.push({bin,args,input:options.input});if(bin==='sops')fs.writeFileSync(args[2],'new encrypted data');if(args[0]==='diff')throw Error('changed');return '';};
 const request=async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>url.startsWith('https:')?{items:[]}:{composio:{configured:true}}};};
 await fn({root,env,commands,requests,command,request});
}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('setup accepts exactly one project key and never native config patches',()=>{
 for(const input of [{},{apiKey:''},{apiKey:key,features:{}},{apiKey:key,endpoint:'http://attacker.invalid'},[],null,{apiKey:'abc\n123456'}])assert.throws(()=>validate(input));
 assert.equal(validate({apiKey:' '+key+' '}),key);
});
test('invalid project key and malformed provider replies cannot modify project files',()=>fixture(async f=>{
 for(const reply of [{ok:false,status:401},{ok:false,status:403},{ok:true,json:async()=>({error:key})}]){
  await assert.rejects(configure({apiKey:key},f.env,async()=>reply,f.command));
  assert.equal(f.commands.length,0);assert.equal(fs.readFileSync(path.join(f.root,'secrets.enc.yaml'),'utf8'),'original encrypted data');
 }
}));
test('encrypted project save is scoped and native activation does not require a restart',()=>fixture(async f=>{
 assert.deepEqual(await configure({apiKey:key},f.env,f.request,f.command),{saved:true,active:true});
 assert.equal(f.requests.length,2);assert.equal(f.requests[0].options.redirect,'error');
 assert.equal(f.requests[0].options.headers['x-api-key'],key);
 const sops=f.commands.find(c=>c.bin==='sops');assert.equal(sops.input,JSON.stringify(key));
 assert.ok(f.commands.every(c=>!JSON.stringify(c.args).includes(key)));
 assert.ok(f.commands.find(c=>c.args[0]==='commit').args.includes('secrets.enc.yaml'));
 assert.deepEqual(JSON.parse(f.requests[1].options.body),{composio:{apiKey:key}});
 assert.equal(fs.existsSync(path.join(f.env.FYSO_DATA,'connector-settings.lock')),false);
}));
test('dirty secrets and concurrent setup are preserved rather than overwritten',()=>fixture(async f=>{
 await assert.rejects(configure({apiKey:key},f.env,f.request,(bin,args,options)=>args[0]==='status'?' M secrets.enc.yaml':f.command(bin,args,options)),{code:'pendingSecrets'});
 assert.equal(fs.readFileSync(path.join(f.root,'secrets.enc.yaml'),'utf8'),'original encrypted data');
 fs.mkdirSync(path.join(f.env.FYSO_DATA,'connector-settings.lock'));
 await assert.rejects(configure({apiKey:key},f.env,f.request,f.command),{code:'busy'});
 assert.equal(fs.existsSync(path.join(f.env.FYSO_DATA,'connector-settings.lock')),true);
}));
test('failed SOPS or commit cannot activate a key or leak stderr',()=>fixture(async f=>{
 for(const failing of ['sops','commit']){
  f.requests.length=0;
  await assert.rejects(configure({apiKey:key},f.env,f.request,(bin,args,options)=>{if(bin===failing||args[0]===failing)throw Error('private provider output '+key);return f.command(bin,args,options);}),error=>error.code==='saveFailed'&&!error.message.includes(key));
  assert.equal(f.requests.length,1);assert.equal(fs.readFileSync(path.join(f.root,'secrets.enc.yaml'),'utf8'),'original encrypted data');
 }
}));
test('failed native activation retains encrypted configuration and reports a partial result',()=>fixture(async f=>{
 const request=async(url,options)=>url.startsWith('https:')?f.request(url,options):Promise.reject(Error(key));
 const result=await configure({apiKey:key},f.env,request,f.command);
 assert.deepEqual(result,{saved:true,active:false});assert.ok(!JSON.stringify(result).includes(key));
 assert.equal(fs.readFileSync(path.join(f.root,'secrets.enc.yaml'),'utf8'),'new encrypted data');
}));
test('HTTP setup requires project login, exact origin, JSON and an exact route',()=>fixture(async f=>{
 let calls=0;const server=createServer(f.env,async()=>{calls++;return {saved:true,active:true};});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}`,headers={Authorization:'Basic '+Buffer.from('fixture:fixture').toString('base64'),Origin:'http://panel.localhost:19540','Content-Type':'application/json'};
 try{
  for(const [h,route,method,status] of [[{},'/api/composio/setup','POST',401],[{...headers,Origin:'http://evil.invalid'},'/api/composio/setup','POST',403],[{...headers,'Sec-Fetch-Site':'cross-site'},'/api/composio/setup','POST',403],[headers,'/api/config','POST',404],[headers,'/api/composio/setup','GET',405],[{...headers,'Content-Type':'text/plain'},'/api/composio/setup','POST',415]]){
   assert.equal((await fetch(url+route,{method,headers:h,body:method==='POST'?JSON.stringify({apiKey:key}):undefined})).status,status);
  }
  assert.equal(calls,0);
  const response=await fetch(url+'/api/composio/setup',{method:'POST',headers,body:JSON.stringify({apiKey:key})});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{saved:true,active:true});assert.equal(calls,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
}));
test('private socket keeps active listeners and non-socket files intact',()=>fixture(async f=>{
 const {listenSocket}=require('../template/framework/scripts/composio-setup.cjs');
 const socket=path.join(f.root,'s'),server=createServer(f.env,async()=>({saved:true,active:true}));
 await listenSocket(server,socket);
 try{
  assert.equal(fs.statSync(socket).mode&0o777,0o600);
  await assert.rejects(listenSocket(createServer(f.env),socket),/already running/);
  const response=await new Promise((resolve,reject)=>{require('node:http').get({socketPath:socket,path:'/health'},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));}).on('error',reject);});
  assert.equal(response,200);
  const regular=path.join(f.root,'keep');fs.writeFileSync(regular,'keep');
  await assert.rejects(listenSocket(createServer(f.env),regular),/unsafe/);assert.equal(fs.readFileSync(regular,'utf8'),'keep');
 }finally{await new Promise(resolve=>server.close(resolve));}
}));

test('managed MCP requests use the same private authentication and origin boundary',()=>fixture(async f=>{
 const calls=[],server=createServer(f.env,async()=>({saved:true,active:true}),async(...args)=>{calls.push(args.slice(0,3));return {saved:true,active:true};});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/api/connectors/mcp`,headers={Authorization:'Basic '+Buffer.from('fixture:fixture').toString('base64'),Origin:'http://panel.localhost:19540','Content-Type':'application/json'};
 try{
  assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://foreign.invalid'},body:'{}'})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({name:'demo',url:'https://example.invalid/mcp'})})).status,200);
  assert.equal((await fetch(url+'/demo',{method:'PATCH',headers,body:JSON.stringify({enabled:false})})).status,200);
  assert.equal((await fetch(url+'/demo',{method:'DELETE',headers})).status,200);
  assert.deepEqual(calls.map(call=>call.slice(0,2)),[['create','demo'],['enable','demo'],['remove','demo']]);
 }finally{await new Promise(resolve=>server.close(resolve));}
}));

test('remote MCP commands share the private boundary, answer POST only and never leak on errors (D65)',()=>fixture(async f=>{
 const agent=require('../template/framework/scripts/agent-remote.cjs'),token='t'.repeat(43);
 const env={...f.env,FYSO_PROJECT:'demo-shop',FYSO_WEB_DOMAIN:'host1.proxy.example.com',FYSO_WEB_SCHEME:'https'};
 let stored=token;
 const server=createServer(env,undefined,undefined,undefined,e=>agent.describe(e,stored));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/api/agent/remote`,headers={Authorization:'Basic '+Buffer.from('fixture:fixture').toString('base64'),Origin:'https://panel.host1.proxy.example.com','Content-Type':'application/json'};
 try{
  assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(url,{headers})).status,405);
  for(const Origin of ['https://foreign.invalid','http://panel.host1.proxy.example.com:19540'])
   assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin},body:'{}'})).status,403);
  const ok=await fetch(url,{method:'POST',headers,body:'{}'});
  assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'no-store');
  const body=await ok.json();
  assert.equal(body.server,'fyso-demo-shop');assert.equal(body.url,'https://panel.host1.proxy.example.com/mcp');
  assert.deepEqual(body.clients.map(c=>c.id),['claude-code','codex','opencode','gemini','other']);
  for(const client of body.clients)assert.ok(client.commands.join('\n').includes(token)&&client.commands.join('\n').includes(body.url),client.id);
  assert.match(body.clients[1].commands[1],/--bearer-token-env-var FYSO_DEMO_SHOP_MCP_TOKEN$/);
  assert.equal(JSON.parse(body.clients[4].commands[0]).mcpServers['fyso-demo-shop'].headers.Authorization,`Bearer ${token}`);
  stored='';
  const missing=await fetch(url,{method:'POST',headers,body:'{}'});
  assert.equal(missing.status,409);assert.deepEqual(await missing.json(),{error:'noToken'});
 }finally{await new Promise(resolve=>server.close(resolve));}
 const plain=createServer({...env,FYSO_WEB_SCHEME:'http'},undefined,undefined,undefined,e=>agent.describe(e,token));
 await new Promise(resolve=>plain.listen(0,'127.0.0.1',resolve));
 try{
  const off=await fetch(`http://127.0.0.1:${plain.address().port}/api/agent/remote`,{method:'POST',headers:{...headers,Origin:'http://panel.host1.proxy.example.com:19540'},body:'{}'});
  assert.equal(off.status,409);const text=await off.text();assert.equal(text,'{"error":"httpsRequired"}');assert.ok(!text.includes(token));
 }finally{await new Promise(resolve=>plain.close(resolve));}
}));
