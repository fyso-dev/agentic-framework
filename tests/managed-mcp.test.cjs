const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {operate,definition,projectDefinition}=require('../template/framework/scripts/managed-mcp.cjs');
async function fixture(fn) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'managed-mcp-')),env={FYSO_ROOT:root,FYSO_DATA:path.join(root,'.data'),FYSO_OMB_PORT:'19444'},servers=new Map(),secrets=new Map(),writes=[];
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:'pipe'}).trim();
 fs.mkdirSync(path.join(root,'project'));fs.writeFileSync(path.join(root,'secrets.enc.yaml'),'encrypted fixture');git(['init','-q']);git(['config','user.name','MCP fixture']);git(['config','user.email','fixture@example.invalid']);git(['add','secrets.enc.yaml']);git(['commit','-qm','fixture']);
 let failCommit=false,probe=true;
 const request=async(url,options)=>{
  assert.ok(url.startsWith('http://127.0.0.1:19444/api/'));const route=url.split('/api/')[1];
  if(route==='mcp/servers'&&options.method==='GET')return {ok:true,json:async()=>({servers:[...servers].map(([name,s])=>({name,enabled:s.enabled,headerKeys:Object.keys(s.headers||{})}))})};
  const body=options.body?JSON.parse(options.body):undefined,name=route==='mcp/servers'?body.name:route.split('/')[2];
  writes.push({route,method:options.method});
  if(route.endsWith('/test'))return {ok:true,json:async()=>({ok:probe})};
  if(options.method==='POST')servers.set(name,{...body});
  if(options.method==='PUT')servers.set(name,{...body});
  if(options.method==='PATCH')Object.assign(servers.get(name),body);
  if(options.method==='DELETE')servers.delete(name);
  return {ok:true,json:async()=>({ok:true})};
 };
 const command=(bin,args,options)=>{
  if(bin==='sops'){
   const key=JSON.parse(args[0]==='set'?args.at(-1):args[args.indexOf('--extract')+1])[0];
   if(args[0]==='set'){secrets.set(key,JSON.parse(options.input));fs.writeFileSync(args[2],'encrypted updated fixture');return '';}
   return secrets.get(key)+'\n';
  }
  if(bin==='gitleaks'||bin==='bash')return '';
  if(bin==='git'&&args[0]==='commit'&&failCommit)throw new Error('commit fixture failure');
  return execFileSync(bin,args,options);
 };
 const call=(op,name,input)=>operate(op,name,input,env,request,command);
 try{await fn({root,env,servers,secrets,writes,git,call,failCommit:()=>{failCommit=true;},failProbe:()=>{probe=false;}});}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('native definitions reject credential-bearing URLs and non-portable machine paths',()=>{
 assert.throws(()=>definition({name:'demo',type:'http',url:'https://user:password@example.invalid/mcp'}));
 assert.throws(()=>definition({name:'demo',type:'http',url:'https://example.invalid/mcp?api_key=value'}));
 assert.throws(()=>projectDefinition({command:path.posix.join('/Users','someone','tool')},'/project'));
 assert.deepEqual(projectDefinition({command:'node',args:['/project/server.cjs']},'/project'),{command:'node',args:['${FYSO_ROOT}/server.cjs']});
});
test('custom MCP credentials are encrypted, definitions versioned and clean restore recreates the server',()=>fixture(async f=>{
 const credential='fixture-private-header-not-for-git';
 await f.call('create','demo',{type:'http',url:'https://example.invalid/mcp',headers:{Authorization:credential}});
 const file=path.join(f.root,'project/omb-mcp.json'),text=fs.readFileSync(file,'utf8');assert.equal(text.includes(credential),false);assert.ok(text.includes('${FYSO_MCP_'));
 assert.equal(f.servers.get('demo').headers.Authorization,credential);assert.equal(f.git(['status','--porcelain','--','project/omb-mcp.json','secrets.enc.yaml']),'');
 await f.call('enable','demo',{enabled:true});assert.equal(JSON.parse(fs.readFileSync(file)).mcpServers.demo.enabled,true);
 f.servers.clear();assert.deepEqual(await f.call('restore'),{restored:1,pending:0});assert.equal(f.servers.get('demo').enabled,true);assert.equal(f.servers.get('demo').headers.Authorization,credential);
 await f.call('remove','demo');f.servers.clear();assert.deepEqual(await f.call('restore'),{restored:0,pending:0});
}));
test('failed Git save rolls back only the newly created server and its project edits',()=>fixture(async f=>{
 f.servers.set('unrelated',{enabled:true});f.failCommit();
 await assert.rejects(f.call('create','demo',{command:'node',args:['server.cjs']}),{code:'saveFailed'});
 assert.equal(f.servers.has('demo'),false);assert.equal(f.servers.get('unrelated').enabled,true);assert.equal(fs.existsSync(path.join(f.root,'project/omb-mcp.json')),false);
 assert.equal(f.git(['status','--porcelain','--','project/omb-mcp.json']),'');
}));
test('dirty project definitions and native name collisions are preserved',()=>fixture(async f=>{
 f.servers.set('already',{enabled:false});await assert.rejects(f.call('create','already',{command:'node',args:[]}),{code:'duplicateMcp'});
 fs.writeFileSync(path.join(f.root,'project/omb-mcp.json'),'{"mcpServers":{}}\n');
 await assert.rejects(f.call('create','demo',{command:'node',args:[]}),{code:'pendingMcp'});assert.equal(f.servers.has('demo'),false);
}));

test('server names that normalize alike cannot overwrite each other’s encrypted headers',()=>fixture(async f=>{
 await f.call('create','demo-one',{type:'http',url:'https://example.invalid/one',headers:{Authorization:'first-fixture'}});
 await f.call('create','demo_one',{type:'http',url:'https://example.invalid/two',headers:{Authorization:'second-fixture'}});
 const saved=JSON.parse(fs.readFileSync(path.join(f.root,'project/omb-mcp.json'),'utf8')).mcpServers;
 assert.notEqual(saved['demo-one'].headers.Authorization,saved.demo_one.headers.Authorization);
 f.servers.clear();await f.call('restore');assert.equal(f.servers.get('demo-one').headers.Authorization,'first-fixture');assert.equal(f.servers.get('demo_one').headers.Authorization,'second-fixture');
}));
