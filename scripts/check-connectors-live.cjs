// Opt-in: run with mise exec from a fresh, disposable generated project.
// Creates local fixture bots/commits, never sends messages to external services.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
async function main() {
  if(process.env.FYSO_TEST_CONNECTORS!=='1')throw Error('requires explicit disposable connector fixture');
  const root=process.env.FYSO_ROOT,port=process.env.FYSO_OMB_PORT;
  if(!root || !port)throw Error('requires explicit disposable project environment');
  process.chdir(root);
  if(execFileSync('git',['remote'],{encoding:'utf8'}).trim())throw Error('requires local project without remotes');
  const client=require(path.join(root,'framework/scripts/dagu-client.cjs')).client();
  const operate=async params=>(await client.run('fyso-bot-architect',params,{output:'RESULT',timeoutMs:180000})).output;
  const api=async(route,method='GET',body)=>{
    const res=await fetch(`http://127.0.0.1:${port}${route}`,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
    if(!res.ok)throw Error(`native API ${res.status} on ${route}`);
    return res.json();
  };
  const profile={name:'Connector Proof',model:'codex/gpt-6.1-sol',soul:'A disposable connector verification bot. Do not send external messages.',tools:{allow:['native:*','mcp:proof:read_message']}};
  const plan=async(action,bot,id)=>(await operate({OP:'plan',ACTION:action,BOT_ID:id||'',BOT_B64:bot?Buffer.from(JSON.stringify(bot)).toString('base64'):''}));
  let id;
  try {
    await api('/api/mcp/servers','POST',{name:'proof',command:process.execPath,args:[path.join(root,'project/connector-proof.cjs')]});
    await api('/api/mcp/servers/proof/test','POST',{});
    await api('/api/mcp/servers/proof','PATCH',{enabled:true});
    const catalog=await operate({OP:'connections'});assert.equal(catalog.servers.find(s=>s.name==='proof').enabled,true);
    const before=(await operate({OP:'list'})).bots.map(b=>b.id).sort();
    const created=await plan('create',profile);const result=await operate({OP:'apply',PLAN_ID:created.planId});id=result.botId;
    assert.deepEqual((await operate({OP:'read',BOT_ID:id})).bot.tools,profile.tools);
    const updated=await plan('update',{tools:{allow:['native:*'],deny:['mcp:proof:other_message']}},id);
    await operate({OP:'apply',PLAN_ID:updated.planId});
    assert.deepEqual((await operate({OP:'read',BOT_ID:id})).bot.tools,{allow:['native:*'],deny:['mcp:proof:other_message']});
    assert.equal((await operate({OP:'apply',PLAN_ID:updated.planId})).replayed,true);
    const stale=await plan('update',{tools:profile.tools},id);
    await api('/api/mcp/servers/proof','PATCH',{enabled:false});
    await assert.rejects(operate({OP:'apply',PLAN_ID:stale.planId}));
    await api('/api/mcp/servers/proof','PATCH',{enabled:true});
    const restored=await plan('update',{tools:profile.tools},id);await operate({OP:'apply',PLAN_ID:restored.planId});
    const live=(await api('/api/bots')).bots.find(b=>b.id===id);
    assert.deepEqual(live.toolScope,profile.tools);
    const snapshot=JSON.parse(fs.readFileSync('state/bots/team.yaml','utf8'));
    assert.deepEqual(snapshot.bots.find(b=>b.name===profile.name).tools,profile.tools);
    // Remove only the fixture's runtime scope, then restore it through native team apply.
    await api(`/api/bots/${id}`,'PATCH',{toolScope:{allow:['native:*']}});
    const rendered=execFileSync('node',['framework/scripts/render-team.cjs','state/bots/team.yaml'],{encoding:'utf8'});
    const restoreFile=path.join(root,'.data/connector-restore.json');fs.writeFileSync(restoreFile,rendered,{mode:0o600});
    execFileSync('openmausbot',['team','apply',restoreFile,'--port',port],{stdio:'pipe'});
    assert.deepEqual((await api('/api/bots')).bots.find(b=>b.id===id).toolScope,profile.tools);
    const others=(await operate({OP:'list'})).bots.filter(b=>b.id!==id).map(b=>b.id).sort();assert.deepEqual(others,before);
    console.log(JSON.stringify({nativeMcpHandshake:true,create:true,update:true,emptyMcpAccess:true,replay:true,disabledConnectionRejectsPlan:true,snapshotRestore:true,unrelatedBotIdsPreserved:true,externalOAuth:'not tested',botToolExecution:'not tested'}));
  } finally {
    if(id){const deletion=await plan('delete',null,id);await operate({OP:'apply',PLAN_ID:deletion.planId});}
    await api('/api/mcp/servers/proof','DELETE');
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
