// Explicit opt-in: execute inside ONE project's mise environment on the target host.
// Enqueues the authorized setup and keeps every credential in memory.
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  assert.ok(process.env.FYSO_ROOT && process.env.FYSO_DAGU_PORT, 'Run inside the target project mise environment');
  const base = `http://127.0.0.1:${process.env.FYSO_DAGU_PORT}/api/v1`;
  const headers = {Authorization:`Basic ${Buffer.from(`${process.env.FYSO_ADMIN_USER}:${process.env.FYSO_ADMIN_PASSWORD}`).toString('base64')}`, 'Content-Type':'application/json'};
  const enqueue = await fetch(`${base}/dags/fyso-agent-connect/enqueue`, {method:'POST', headers, body:JSON.stringify({params:JSON.stringify({MODE:'remote'})})});
  assert.equal(enqueue.status,200,'enqueue accepted');
  const {dagRunId} = await enqueue.json(); assert.ok(dagRunId,'run id returned');
  let status;
  for (let i=0;i<90;i++) {
    const response = await fetch(`${base}/dag-runs/fyso-agent-connect/${dagRunId}`, {headers});
    assert.equal(response.status,200,'run readable');
    status = (await response.json()).dagRunDetails?.statusLabel;
    if (['succeeded','failed','aborted'].includes(status)) break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.equal(status,'succeeded','remote setup succeeded');
  const env = {...process.env, SOPS_AGE_KEY_FILE:process.env.SOPS_AGE_KEY_FILE || process.env.MISE_SOPS_AGE_KEY_FILE || path.join(process.env.HOME,'.config/mise/age.txt')};
  const token = execFileSync('sops',['decrypt','--extract','["FYSO_MCP_TOKEN"]','secrets.enc.yaml'],{env,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  assert.ok(token.length>=32,'stored MCP token exists');
  const outputs = await (await fetch(`${base}/dag-runs/fyso-agent-connect/${dagRunId}/outputs`,{headers})).text();
  assert.equal(outputs.includes(token),false,'no token in Dagu outputs');
  const address = require(path.join(process.env.FYSO_ROOT,'framework/scripts/web-origin.cjs')).origin('panel',process.env)+'/mcp';
  const rpc = async body => {
    const r = await fetch(address,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal(r.status,200,'trusted HTTPS MCP response'); return r.json();
  };
  const hello = await rpc({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'fyso-https-acceptance',version:'1'}}});
  assert.equal(hello.result?.serverInfo?.name,'fyso','platform initialized');
  const list = await rpc({jsonrpc:'2.0',id:2,method:'tools/list'});
  const names = list.result.tools.map(t=>t.name);assert.ok(names.includes('fyso_status'));assert.ok(!names.some(n=>n.startsWith('dagu_')));
  const result = {project:process.env.FYSO_PROJECT,url:address,dagRunId,status,tokenAbsentFromDaguOutputs:true,mcpInitialized:true,platformTools:names.length,noDaguTools:true};
  fs.writeFileSync(path.join(process.env.FYSO_DATA,'cloudflare-mcp-acceptance.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
})().catch(()=>{console.error('Live MCP acceptance failed; credential-bearing details suppressed');process.exitCode=1;});
