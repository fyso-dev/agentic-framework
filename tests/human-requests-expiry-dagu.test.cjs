// Real Dagu 2.24.0 integration: synthetic credentials, loopback ports, isolated data.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const {spawn} = require('node:child_process');

test('real sweep expires once and tolerates a concurrent human answer', {timeout:90000}, async t => {
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
  fs.copyFileSync(path.resolve(__dirname,'../template/framework/extensions/human-requests/project/workflows/ext-human-requests-sweep.yaml'),path.join(dags,'ext-human-requests-sweep.yaml'));
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
  const detail=id=>`/dag-runs/${workflow}/${id}`;
  async function create(id) {
    await call(`/dags/${workflow}/start`,{dagRunId:id,labels:['deadline=1'],params:JSON.stringify({QUESTION:'Synthetic overdue request',ORIGIN_TYPE:'none'})});
    await wait(async()=>{const d=(await call(detail(id))).dagRunDetails;return d.statusLabel.toLowerCase()==='waiting';});
  }
  const finished=id=>wait(async()=>{const d=(await call(detail(id))).dagRunDetails;return ['succeeded','failed'].includes(d.statusLabel.toLowerCase())&&d;});
  await create('expired-once');
  async function sweepRun(id) {
    await call('/dags/ext-human-requests-sweep/start',{dagRunId:id});
    return wait(async()=>{const d=(await call(`/dag-runs/ext-human-requests-sweep/${id}`)).dagRunDetails;return ['succeeded','failed'].includes(d.statusLabel.toLowerCase())&&d;});
  }
  assert.equal((await sweepRun('sweep-first')).statusLabel.toLowerCase(),'succeeded');
  const d=await finished('expired-once'); assert.equal(d.statusLabel.toLowerCase(),'succeeded');
  assert.equal(d.nodes.find(n=>n.step.id==='deliver').statusLabel.toLowerCase(),'succeeded');
  assert.deepEqual((await call(detail('expired-once')+'/outputs')).outputs,{answer:'',comment:'',responder:'system',decision:'expired'});
  assert.equal((await sweepRun('sweep-second')).statusLabel.toLowerCase(),'succeeded');
  assert.deepEqual((await call(detail('expired-once')+'/outputs')).outputs,{answer:'',comment:'',responder:'system',decision:'expired'});
  await create('human-race');
  const {sweep}=require('../template/framework/extensions/human-requests/extensions/human-requests/sweep.cjs');
  let raced=false, conflict=0;
  const fetcher=async(url,init)=>{
    if (init.method==='POST' && url.includes('/human-race/')) {
      await call(detail('human-race')+'/human-tasks/ask/complete',{answer:'Yes',comment:'',responder:'fixture',decision:'answered'});
      raced=true;
    }
    const res=await fetch(url,init); if(init.method==='POST' && res.status===409) conflict++;
    return res;
  };
  await sweep(env,fetcher); assert.equal(raced,true); assert.equal(conflict,1);
  const human=await finished('human-race'); assert.equal(human.statusLabel.toLowerCase(),'succeeded');
  assert.deepEqual((await call(detail('human-race')+'/outputs')).outputs,{answer:'Yes',comment:'',responder:'fixture',decision:'answered'});
  await create('queue-failure-one'); await create('queue-failure-two');
  const queue=path.join(root,'dagu/data/queue'), backup=path.join(root,'queue-backup');
  fs.renameSync(queue,backup); fs.writeFileSync(queue,'fault');
  try {
    await assert.rejects(sweep(env),/could not be processed/);
    const one=(await call(detail('queue-failure-one'))).dagRunDetails;
    const two=(await call(detail('queue-failure-two'))).dagRunDetails;
    const pending=[one,two].filter(d=>d.humanTaskResumePending===true);
    assert.equal(pending.length,2);
    console.log('503 sweep continued: both expiry answers saved pending resume');
  } finally { fs.unlinkSync(queue); fs.renameSync(backup,queue); }
  await sweep(env);
  for (const id of ['queue-failure-one','queue-failure-two']) {
    const result=await finished(id); assert.equal(result.statusLabel.toLowerCase(),'succeeded');
    assert.deepEqual((await call(detail(id)+'/outputs')).outputs,{answer:'',comment:'',responder:'system',decision:'expired'});
  }
  console.log('Repeat sweep recovered both expired requests without replacing human input');
  console.log('PASS real sweep, repeat, expiry outputs and HTTP 409 human race');
});
