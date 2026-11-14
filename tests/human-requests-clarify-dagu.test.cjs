// Real Dagu 2.24.0 integration: synthetic credentials, loopback ports, isolated data.
// Covers the structured card, creation-time validation and the clarifying question (push-back).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const {spawn} = require('node:child_process');

test('a request shows a structured card, rejects an incomplete one and carries a clarifying question to its origin', {timeout:120000}, async t => {
  const dagu = process.env.FYSO_TEST_DAGU;
  if (!dagu) return t.skip('Set FYSO_TEST_DAGU to the pinned Dagu 2.24.0 binary');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fyso-hr-clarify-dagu-'));
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
  const calls=path.join(root,'calls');
  // Stands in for the bot: records each call and answers a waited turn as the CLI does.
  fs.writeFileSync(path.join(bin,'openmausbot'),`#!/bin/sh
input=$(cat)
printf '%s\\n' "$*" >> "$FYSO_CAPTURE_FILE"
case "$*" in *"--wait turn"*) printf '{"ok":true,"exitCode":0,"reply":{"text":"Two of them are behind on the plan.","files":[]}}';; esac
`,{mode:0o700});
  const fakeUser='fixture-user', fakePassword='fixture-pass';
  const env={HOME:root, PATH:`${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`, LANG:'en_US.UTF-8',
    DAGU_HOME:path.join(root,'dagu'), DAGU_DAGS_DIR:dags, DAGU_HOST:'127.0.0.1', DAGU_PORT:String(http),
    DAGU_SCHEDULER_PORT:String(scheduler), DAGU_WORKER_HEALTH_PORT:String(worker),
    DAGU_COORDINATOR_HOST:'127.0.0.1', DAGU_COORDINATOR_PORT:String(coordinator), DAGU_COORDINATOR_HEALTH_PORT:String(health),
    DAGU_PEER_INSECURE:'true', DAGU_AUTH_MODE:'basic', DAGU_AUTH_BASIC_USERNAME:fakeUser, DAGU_AUTH_BASIC_PASSWORD:fakePassword,
    DAGU_ENV_PASSTHROUGH_PREFIXES:'FYSO_', FYSO_ROOT:project, FYSO_DAGU_PORT:String(http), FYSO_ADMIN_USER:fakeUser,
    FYSO_ADMIN_PASSWORD:fakePassword, FYSO_OMB_PORT:'1234', FYSO_CAPTURE_FILE:calls};
  const server=spawn(dagu,['start-all'],{env,cwd:project,stdio:'ignore',detached:true});
  t.after(async()=>{try{process.kill(-server.pid,'SIGTERM');}catch{}; await new Promise(resolve=>{server.once('close',resolve);setTimeout(resolve,3000).unref();});fs.rmSync(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${http}/api/v1`, auth='Basic '+Buffer.from(`${fakeUser}:${fakePassword}`).toString('base64');
  const call=async(url, body)=>{const res=await fetch(base+url,{method:body?'POST':'GET',headers:{Authorization:auth,...(body&&{'Content-Type':'application/json'})},...(body&&{body:JSON.stringify(body)}),signal:AbortSignal.timeout(5000)}); const text=await res.text(); if(!res.ok){const error=Error(`${res.status} ${text}`);error.status=res.status;throw error;} return text?JSON.parse(text):{};};
  const wait=async(fn)=>{let value;for(let i=0;i<300;i++){try{value=await fn();if(value)return value;}catch{} await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timed out waiting for isolated Dagu');};
  await wait(async()=>{const res=await fetch(`${base}/health`,{headers:{Authorization:auth}});return res.ok;});
  const workflow='ext-human-requests-request';
  const hex=choices=>'choices-hex='+Buffer.from(JSON.stringify(choices),'utf8').toString('hex');
  const request={title:'Who gets the payment reminder?', requester:'Collections assistant', doing:'Preparing the monthly reminders.',
    needs:'Confirm which customers to write to.', if_silent:'Nothing is sent after Friday 18:00.', blocked:'The 38 reminders.',
    options:[{choice:'Only the 32',effect:'Six customers with a plan get nothing.'},{choice:'All 38',effect:'Everyone gets the same text.'}],
    recommendation:'Only the 32', links:[{label:'Customer list',url:'https://example.test/list'}]};
  const start=(id, body, labels)=>call(`/dags/${workflow}/start`,{dagRunId:id,labels,params:JSON.stringify(body)});
  const detail=id=>call(`/dag-runs/${workflow}/${id}`).then(data=>data.dagRunDetails);
  const settled=id=>wait(async()=>{const data=await detail(id);return ['failed','succeeded','waiting'].includes(data.statusLabel.toLowerCase())&&data;});
  const card=data=>JSON.parse(data.nodes.find(node=>node.step.id==='ask').step.humanTask.prompt);

  // An incomplete request, or one whose options differ from the authoritative label, never reaches a person.
  await start('missing-fields',{REQUEST:JSON.stringify({title:'Only a title'})},[]);
  assert.equal((await settled('missing-fields')).statusLabel.toLowerCase(),'failed');
  await start('options-without-label',{REQUEST:JSON.stringify(request)},[]);
  assert.equal((await settled('options-without-label')).statusLabel.toLowerCase(),'failed');
  await start('label-mismatch',{REQUEST:JSON.stringify(request)},[hex(['Only the 32','Other'])]);
  assert.equal((await settled('label-mismatch')).statusLabel.toLowerCase(),'failed');

  const id='with-question';
  await start(id,{REQUEST:JSON.stringify(request),RECIPIENT:'maria',BLOCKING:'true',ORIGIN_TYPE:'omb',ORIGIN_REF:JSON.stringify({bot:'fixture-bot',task:'fixture-task'})},[hex(['Only the 32','All 38']),'assignee=maria','blocking=true']);
  let data=await settled(id);
  assert.equal(data.statusLabel.toLowerCase(),'waiting');
  let shown=card(data);
  assert.deepEqual(shown.request,request);
  assert.deepEqual(shown.thread,[]);
  assert.equal(shown.canAsk,true); assert.equal(shown.blocking,true); assert.equal(shown.recipient,'maria');
  assert.equal(fs.existsSync(calls),false,'creating a request must not contact the origin');

  // The person asks first; the request stays open and shows the origin's reply.
  await call(`/dag-runs/${workflow}/${id}/human-tasks/ask/push-back?expectedIteration=0`,{HR_QUESTION:'Is any plan customer behind?',HR_ASKER:'María'});
  data=await wait(async()=>{const current=await detail(id);if(current.statusLabel.toLowerCase()!=='waiting')return null;return card(current).thread.length===1&&current;});
  shown=card(data);
  assert.equal(shown.thread[0].question,'Is any plan customer behind?');
  assert.equal(shown.thread[0].asker,'María');
  assert.equal(shown.thread[0].answer,'Two of them are behind on the plan.');
  assert.deepEqual(shown.request,request);
  const asked=fs.readFileSync(calls,'utf8').trim().split('\n');
  assert.equal(asked.length,1);
  assert.match(asked[0],/--bot fixture-bot .*--wait turn .*--task fixture-task/);

  // A second question keeps the first one.
  await call(`/dag-runs/${workflow}/${id}/human-tasks/ask/push-back?expectedIteration=1`,{HR_QUESTION:'Which two?'});
  data=await wait(async()=>{const current=await detail(id);if(current.statusLabel.toLowerCase()!=='waiting')return null;return card(current).thread.length===2&&current;});
  assert.deepEqual(card(data).thread.map(entry=>entry.question),['Is any plan customer behind?','Which two?']);

  await call(`/dag-runs/${workflow}/${id}/human-tasks/ask/complete`,{answer:'Only the 32',comment:'',responder:'María',decision:'answered'});
  data=await wait(async()=>{const current=await detail(id);return ['failed','succeeded'].includes(current.statusLabel.toLowerCase())&&current;});
  assert.equal(data.statusLabel.toLowerCase(),'succeeded');
  const all=fs.readFileSync(calls,'utf8').trim().split('\n');
  assert.equal(all.length,3,'two questions and one delivery');
  assert.match(all[2],/--wait none/);
});
