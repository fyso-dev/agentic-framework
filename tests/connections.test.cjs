const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {inventory,validateTools,checkSelection}=require('../template/framework/scripts/connections.cjs');
const {validatePatch}=require('../template/framework/scripts/bot-architect.cjs');
const fixture=async fn=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-connections-'));
  const put=(file,data)=>{const full=path.join(root,file);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,JSON.stringify(data));};
  const env={FYSO_ROOT:root,FYSO_OMB_PORT:'19444'};
  const request=async url=>{assert.equal(url,'http://127.0.0.1:19444/api/mcp/servers');return {ok:true,json:async()=>({servers:[{name:'native',enabled:true,url:'https://secret.invalid',headers:{Authorization:'PRIVATE'},offFor:['private-id']},{name:'disabled',enabled:false}]})};};
  try{await fn({root,put,env,request});}finally{fs.rmSync(root,{recursive:true,force:true});}
};
test('structured native tool selection survives validation, deduplicates and rejects malformed values',()=>{
  const tools={allow:['native:*','mcp:dagu:read','mcp:dagu:read'],deny:['mcp:dagu:write']};
  assert.deepEqual(validatePatch({tools},'/fixture').tools,{allow:['native:*','mcp:dagu:read'],deny:['mcp:dagu:write']});
  assert.deepEqual(validateTools({allow:[]}),{allow:[]});
  for(const value of [null,[],{allow:'*'},{allow:['mcp:*:*']},{allow:['mcp:dagu:bad*']},{extra:[]},{allow:[1]},{allow:['native:a\nb']},{allow:Array(257).fill('native:*')}])assert.throws(()=>validateTools(value));
});
test('catalog combines native and versioned sources without returning credentials or endpoints',()=>fixture(async({put,env,request})=>{
  put('framework/mcp.json',{mcpServers:{dagu:{url:'http://127.0.0.1:1234'}}});
  put('extensions/demo/mcp.json',{mcpServers:{native:{url:'${BOT_URL}'}}});
  const result=await inventory(env,request),text=JSON.stringify(result);
  for(const secret of ['PRIVATE','secret.invalid','private-id','${BOT_URL}','127.0.0.1'])assert.ok(!text.includes(secret));
  assert.deepEqual(result.servers.find(s=>s.name==='native').sources,['omb','extensions/demo/mcp.json']);
  assert.equal(result.servers.find(s=>s.name==='native').portable,true);
  assert.equal(result.servers.find(s=>s.name==='disabled').portable,false);
  assert.equal(result.servers.find(s=>s.name==='dagu').enabled,null);
  assert.ok(result.servers.every(s=>s.verification==='not-tested'));
}));
test('unknown, disabled, inaccessible and unavailable servers fail before native preview',()=>fixture(async({env,request})=>{
  for(const name of ['unknown','disabled'])await assert.rejects(checkSelection({allow:[`mcp:${name}:*`]},env,null,request));
  await assert.rejects(checkSelection({allow:['mcp:native:*']},env,{mcpServers:[]},request),/native bot access/);
  await assert.rejects(inventory(env,async()=>({ok:false})),/unavailable/);
  await assert.rejects(inventory({...env,FYSO_OMB_PORT:''},request),/explicit/);
}));
test('connection revision changes when the endpoint changes, even if the name is unchanged',()=>fixture(async({put,env,request})=>{
  put('project/mcp.json',{mcpServers:{project:{url:'https://one.invalid'}}});
  const first=await checkSelection({allow:['mcp:project:*']},env,null,request);
  put('project/mcp.json',{mcpServers:{project:{url:'https://two.invalid'}}});
  assert.notEqual(await checkSelection({allow:['mcp:project:*']},env,null,request),first);
}));
test('catalog rejects invalid names and duplicate project sources instead of suggesting unusable servers',()=>fixture(async({put,env,request})=>{
  put('project/mcp.json',{mcpServers:{'bad name':{}}});
  await assert.rejects(inventory(env,request),/invalid project MCP server name/);
  put('project/mcp.json',{mcpServers:{demo:{}}});put('extensions/demo/mcp.json',{mcpServers:{demo:{}}});
  await assert.rejects(inventory(env,request),/duplicate project MCP server/);
}));
test('self-hosted Composio uses only the explicit encrypted project variable',()=>fixture(async({root,env})=>{
  const scripts=path.join(root,'framework/scripts');fs.mkdirSync(scripts,{recursive:true});
  for(const name of ['run-omb.sh','lib.sh'])fs.copyFileSync(path.join(__dirname,'../template/framework/scripts',name),path.join(scripts,name));
  const bin=path.join(root,'bin');fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin,'openmausbot'),'#!/bin/bash\nprintf "%s|%s" "${COMPOSIO_API_KEY-unset}" "${FYSO_COMPOSIO_API_KEY-unset}"\n',{mode:0o755});
  const base={...process.env,...env,PATH:bin+path.delimiter+process.env.PATH,FYSO_DATA:path.join(root,'.data'),FYSO_OMB_WEBHOOK_PORT:'19445',FYSO_HTTP_PORT:'19440',FYSO_WEB_DOMAIN:'localhost',FYSO_DAGU_PORT:'19441',FYSO_ADMIN_USER:'fixture',FYSO_ADMIN_PASSWORD:'fixture',COMPOSIO_API_KEY:'ambient-must-not-inherit'};
  delete base.FYSO_COMPOSIO_API_KEY;
  const run=extra=>require('node:child_process').execFileSync('bash',[path.join(scripts,'run-omb.sh')],{env:{...base,...extra},encoding:'utf8'});
  assert.equal(run({}),'unset|unset');
  assert.equal(run({FYSO_COMPOSIO_API_KEY:'project-fixture'}),'project-fixture|unset');
}));
