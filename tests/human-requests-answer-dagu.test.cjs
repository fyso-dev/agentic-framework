// Real Dagu 2.24.0 integration: synthetic credentials, loopback ports, isolated data.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const {spawn} = require('node:child_process');

test('direct human-task API rejects invalid answers and responders before delivery', {timeout:90000}, async t => {
  const dagu = process.env.FYSO_TEST_DAGU;
  if (!dagu) return t.skip('Set FYSO_TEST_DAGU to the pinned Dagu 2.24.0 binary');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fyso-hr-answer-dagu-'));
  const port = async () => new Promise((resolve,reject) => {
    const s=net.createServer(); s.once('error',reject); s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n));});
  });
  const ports = new Set(); while (ports.size < 5) ports.add(await port());
  const [http,scheduler,worker,coordinator,health] = [...ports];
  const project=path.join(root,'project'), dags=path.join(project,'workflows'), bin=path.join(root,'bin');
  fs.mkdirSync(dags,{recursive:true}); fs.mkdirSync(bin);
  const extension=path.join(project,'extensions/human-requests');
  fs.mkdirSync(path.dirname(extension),{recursive:true});
  fs.cpSync(path.resolve(__dirname,'../template/framework/extensions/human-requests/extensions/human-requests'),extension,{recursive:true});
  fs.copyFileSync(path.resolve(__dirname,'../template/framework/extensions/human-requests/project/workflows/ext-human-requests-request.yaml'),path.join(dags,'ext-human-requests-request.yaml'));
  const output=path.join(root,'deliveries');
  fs.writeFileSync(path.join(bin,'openmausbot'),'#!/bin/sh\ncat >/dev/null\nprintf sent >> "$FYSO_CAPTURE_FILE"\n',{mode:0o700});
  const fakeUser='fixture-user', fakePassword='fixture-pass';
  const env={HOME:root, PATH:`${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`, LANG:'en_US.UTF-8',
    DAGU_HOME:path.join(root,'dagu'), DAGU_DAGS_DIR:dags, DAGU_HOST:'127.0.0.1', DAGU_PORT:String(http),
    DAGU_SCHEDULER_PORT:String(scheduler), DAGU_WORKER_HEALTH_PORT:String(worker),
    DAGU_COORDINATOR_HOST:'127.0.0.1', DAGU_COORDINATOR_PORT:String(coordinator), DAGU_COORDINATOR_HEALTH_PORT:String(health),
    DAGU_PEER_INSECURE:'true', DAGU_AUTH_MODE:'basic', DAGU_AUTH_BASIC_USERNAME:fakeUser, DAGU_AUTH_BASIC_PASSWORD:fakePassword,
    DAGU_ENV_PASSTHROUGH_PREFIXES:'FYSO_', FYSO_ROOT:project, FYSO_DAGU_PORT:String(http), FYSO_ADMIN_USER:fakeUser,
    FYSO_ADMIN_PASSWORD:fakePassword, FYSO_OMB_PORT:'1234', FYSO_CAPTURE_FILE:output};
  const server=spawn(dagu,['start-all'],{env,cwd:project,stdio:'ignore',detached:true});
  t.after(async()=>{try{process.kill(-server.pid,'SIGTERM');}catch{}; await new Promise(resolve=>{server.once('close',resolve);setTimeout(resolve,3000).unref();});fs.rmSync(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${http}/api/v1`, auth='Basic '+Buffer.from(`${fakeUser}:${fakePassword}`).toString('base64');
  const call=async(url, body)=>{const res=await fetch(base+url,{method:body?'POST':'GET',headers:{Authorization:auth,...(body&&{'Content-Type':'application/json'})},...(body&&{body:JSON.stringify(body)}),signal:AbortSignal.timeout(3000)}); const text=await res.text(); if(!res.ok) throw Error(`API ${res.status}: ${text.slice(0,300)}`); return JSON.parse(text);};
  const wait=async(fn)=>{let value;for(let i=0;i<200;i++){try{value=await fn();if(value)return value;}catch{} await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timed out waiting for isolated Dagu');};
  await wait(async()=>{const res=await fetch(`${base}/health`,{headers:{Authorization:auth}});return res.ok;});
  const workflow='ext-human-requests-request';
  const labels=['choices-hex='+Buffer.from(JSON.stringify(['Sí','No']),'utf8').toString('hex')];
  async function run(id, value, responder = 'fixture', decision = 'answered', chosenLabels = labels) {
    await call(`/dags/${workflow}/start`,{dagRunId:id,labels:chosenLabels,params:JSON.stringify({QUESTION:'Fixture',ORIGIN_TYPE:'omb',ORIGIN_REF:JSON.stringify({bot:'fixture',task:'fixture'})})});
    const detailUrl=`/dag-runs/${workflow}/${id}`;
    const pending=await wait(async()=>{const data=(await call(detailUrl)).dagRunDetails;return data.statusLabel.toLowerCase()==='waiting'&&data;});
    assert.ok(pending.labels.includes('human-request')); assert.ok(pending.labels.includes(chosenLabels[0]));
    await call(`${detailUrl}/human-tasks/ask/complete`,{answer:value,comment:'',responder,decision});
    return wait(async()=>{const data=(await call(detailUrl)).dagRunDetails;return ['failed','succeeded'].includes(data.statusLabel.toLowerCase())&&data;});
  }
  assert.equal((await run('invalid-option','other')).statusLabel.toLowerCase(),'failed');
  assert.equal((await run('empty-answer','')).statusLabel.toLowerCase(),'failed');
  assert.equal((await run('missing-responder','Sí','')).statusLabel.toLowerCase(),'failed');
  assert.equal((await run('blank-cancel','','  ','cancelled')).statusLabel.toLowerCase(),'failed');
  assert.equal((await run('bad-expiry','','fixture','expired')).statusLabel.toLowerCase(),'failed');
  assert.equal(fs.existsSync(output),false,'invalid answers must not invoke OpenMausBot');
  assert.equal((await run('valid-unicode','Sí')).statusLabel.toLowerCase(),'succeeded');
  assert.equal((await run('valid-cancel','','Ana','cancelled')).statusLabel.toLowerCase(),'succeeded');
  assert.equal((await run('valid-expiry','','system','expired')).statusLabel.toLowerCase(),'succeeded');
  assert.equal((await run('malformed-cancel','','Ana','cancelled',['choices-hex=f'])).statusLabel.toLowerCase(),'succeeded');
  assert.equal((await run('malformed-expire','','system','expired',['choices-hex=f'])).statusLabel.toLowerCase(),'succeeded');
  assert.equal((await run('malformed-answer','Sí','Ana','answered',['choices-hex=f'])).statusLabel.toLowerCase(),'failed');
  assert.equal(fs.readFileSync(output,'utf8'),'sentsentsentsentsent');
});
