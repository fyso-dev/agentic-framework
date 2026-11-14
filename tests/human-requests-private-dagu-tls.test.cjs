// Isolated private HTTPS integration. A test-only Node preload provides a
// local DNS fixture, CA and pinned SOPS executable. The product itself
// enforces the configured private IP and chooses the connection address.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const net = require('node:net'), https = require('node:https');
const {spawn,execFileSync} = require('node:child_process');

test('Dagu delivers validated human answer to an exact private HTTPS address', {timeout:90000}, async t => {
  const dagu=process.env.FYSO_TEST_DAGU,age=process.env.FYSO_TEST_AGE_KEYGEN,sops=process.env.FYSO_TEST_SOPS;
  if(!dagu||!age||!sops) return t.skip('Set FYSO_TEST_DAGU, FYSO_TEST_AGE_KEYGEN and FYSO_TEST_SOPS');
  const source=process.env.FYSO_TEST_EXTENSION_ROOT || path.resolve(__dirname,'../template/framework/extensions/human-requests');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-hr-http-dagu-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const port=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
  const ports=new Set();while(ports.size<5)ports.add(await port()); const [http,scheduler,worker,coordinator,health]=[...ports];
  const project=path.join(root,'project'),dags=path.join(project,'project/workflows'),extension=path.join(project,'extensions/human-requests');
  fs.mkdirSync(dags,{recursive:true});fs.mkdirSync(path.dirname(extension),{recursive:true});
  fs.cpSync(path.join(source,'extensions/human-requests'),extension,{recursive:true});
  const tlsKey=path.join(root,'tls-key'),tlsCert=path.join(root,'tls-cert');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',tlsKey,'-out',tlsCert,'-days','1','-subj','/CN=receiver.test','-addext','subjectAltName=DNS:receiver.test'],{stdio:'ignore'});
  const messages=[],accepted=new Map();let effects=0;
  const receiver=https.createServer({key:fs.readFileSync(tlsKey),cert:fs.readFileSync(tlsCert)},(req,res)=>{
    const chunks=[];req.on('data',data=>chunks.push(data));req.on('end',()=>{
      const entry={path:req.url,auth:req.headers.authorization,key:req.headers['idempotency-key'],body:Buffer.concat(chunks).toString('utf8')};messages.push(entry);
      if(accepted.has(entry.key)&&accepted.get(entry.key)!==entry.body){res.writeHead(409);res.end();return;}
      if(!accepted.has(entry.key)){accepted.set(entry.key,entry.body);effects++;}
      res.writeHead(200,{'idempotency-key':entry.key});res.end();
    });
  });
  await new Promise((resolve,reject)=>{receiver.once('error',reject);receiver.listen(0,'127.0.0.1',resolve);});t.after(()=>receiver.close());
  const receiverPort=receiver.address().port;
  const key=path.join(root,'age-key'),plain=path.join(root,'fixture.yaml');
  execFileSync(age,['-o',key],{stdio:'ignore'});const recipient=execFileSync(age,['-y',key],{encoding:'utf8'}).trim();
  fs.writeFileSync(plain,'FYSO_HR_HTTP_RECEIVER: fixture-token\n',{mode:0o600});
  fs.writeFileSync(path.join(project,'secrets.enc.yaml'),execFileSync(sops,['encrypt','--age',recipient,'--input-type','yaml','--output-type','yaml',plain]),{mode:0o600});fs.rmSync(plain);
  const preload=path.join(root,'fixture-preload.cjs');
  fs.writeFileSync(preload,`const fs=require('node:fs'),dns=require('node:dns/promises'),https=require('node:https'),cp=require('node:child_process');\n`+
    `dns.lookup=async()=>[{address:'127.0.0.1',family:4}];\n`+
    `const spawn=cp.spawnSync;cp.spawnSync=(cmd,args,options)=>spawn(cmd==='sops'?${JSON.stringify(sops)}:cmd,args,options);\n`+
    `const request=https.request;https.request=(url,options,callback)=>request(url,{...options,ca:fs.readFileSync(${JSON.stringify(tlsCert)})},callback);\n`);
  let yaml=fs.readFileSync(path.join(source,'project/workflows/ext-human-requests-request.yaml'),'utf8');
  const destination=`https://receiver.test:${receiverPort}/callback`;
  yaml=yaml.replace("- FYSO_HR_HTTP_DESTINATION: ''", "- FYSO_HR_HTTP_DESTINATION: '"+destination+"'");
  yaml=yaml.replace("- FYSO_HR_HTTP_SECRET_NAME: ''", "- FYSO_HR_HTTP_SECRET_NAME: 'FYSO_HR_HTTP_RECEIVER'\n      - NODE_OPTIONS: '--require="+preload+"'");
  yaml=yaml.replace("- FYSO_HR_HTTP_PRIVATE_ADDRESS: ''", "- FYSO_HR_HTTP_PRIVATE_ADDRESS: '127.0.0.1'");
  fs.writeFileSync(path.join(dags,'ext-human-requests-request.yaml'),yaml);
  const user='fixture-user',password='fixture-pass';
  const env={HOME:process.env.HOME,USER:process.env.USER,PATH:`${path.dirname(process.execPath)}:/usr/bin:/bin`,LANG:'en_US.UTF-8',DAGU_HOME:path.join(root,'dagu'),DAGU_DAGS_DIR:dags,DAGU_HOST:'127.0.0.1',DAGU_PORT:String(http),DAGU_SCHEDULER_PORT:String(scheduler),DAGU_WORKER_HEALTH_PORT:String(worker),DAGU_COORDINATOR_HOST:'127.0.0.1',DAGU_COORDINATOR_PORT:String(coordinator),DAGU_COORDINATOR_HEALTH_PORT:String(health),DAGU_PEER_INSECURE:'true',DAGU_AUTH_MODE:'basic',DAGU_AUTH_BASIC_USERNAME:user,DAGU_AUTH_BASIC_PASSWORD:password,DAGU_ENV_PASSTHROUGH_PREFIXES:'FYSO_',FYSO_ROOT:project,FYSO_PROJECT:'fixture-project',FYSO_DAGU_PORT:String(http),FYSO_ADMIN_USER:user,FYSO_ADMIN_PASSWORD:password,FYSO_COMPOSIO_AGE_KEY_FILE:key};
  const server=spawn(dagu,['start-all'],{env,cwd:project,stdio:['ignore','pipe','pipe'],detached:true});
  let diagnostics=''; for(const stream of [server.stdout,server.stderr]) stream.on('data',chunk=>{diagnostics=(diagnostics+chunk).slice(-6000);});
  t.after(async()=>{try{process.kill(-server.pid,'SIGTERM');}catch{};await new Promise(resolve=>{server.once('close',resolve);setTimeout(resolve,3000).unref();});});
  const base=`http://127.0.0.1:${http}/api/v1`,auth='Basic '+Buffer.from(`${user}:${password}`).toString('base64');
  const call=async(url,body)=>{const response=await fetch(base+url,{method:body?'POST':'GET',headers:{Authorization:auth,...(body&&{'Content-Type':'application/json'})},...(body&&{body:JSON.stringify(body)}),signal:AbortSignal.timeout(3000)});const text=await response.text();if(!response.ok)throw Error(`Dagu response ${response.status}`);return JSON.parse(text);};
  const wait=async(fn)=>{for(let n=0;n<250;n++){try{const value=await fn();if(value)return value;}catch{}if(server.exitCode!==null)throw Error('Dagu exited: '+diagnostics.replaceAll(password,'[redacted]').slice(-1500));await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timed out waiting for isolated Dagu');};
  await wait(async()=>{const r=await fetch(`${base}/health`,{headers:{Authorization:auth}});return r.ok;});
  const workflow='ext-human-requests-request',run='fixture-http-dagu-1',runPath=`/dag-runs/${workflow}/${run}`;
  const labels=['choices-hex='+Buffer.from(JSON.stringify(['Accept','Reject']),'utf8').toString('hex')];
  await call(`/dags/${workflow}/start`,{dagRunId:run,labels,params:JSON.stringify({REQUEST:JSON.stringify({title:'Fixture decision',requester:'Agente de prueba',doing:'Revisar una propuesta ficticia.',needs:'Una decisión.',if_silent:'No pasa nada.',options:[{choice:'Accept',effect:'Proceeds.'},{choice:'Reject',effect:'Stops.'}]}),ORIGIN_TYPE:'http',ORIGIN_REF:destination})});
  await wait(async()=>{const detail=(await call(runPath)).dagRunDetails;return detail.statusLabel.toLowerCase()==='waiting';});
  await call(`${runPath}/human-tasks/ask/complete`,{answer:'Accept',comment:'',responder:'fixture',decision:'answered'});
  const result=await wait(async()=>{const detail=(await call(runPath)).dagRunDetails;return ['failed','succeeded'].includes(detail.statusLabel.toLowerCase())&&detail;});
  assert.equal(result.statusLabel.toLowerCase(),'succeeded');
  assert.equal(messages.length,1);assert.equal(messages[0].path,'/callback');assert.equal(messages[0].auth,'Bearer fixture-token');
  assert.match(messages[0].key,/^fyso-hr-[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(messages[0].body),{requestId:run,question:'Fixture decision',answer:'Accept',comment:'',responder:'fixture',decision:'answered'});
  assert.ok(!JSON.stringify(result).includes('fixture-token'),'Dagu metadata must not contain the receiver credential');
  const retry=spawn(dagu,['retry','--run-id',run,'--step','deliver',workflow],{env,cwd:project,stdio:'ignore'});
  assert.equal(await new Promise(resolve=>retry.once('close',resolve)),0,'isolated retry should complete');
  await wait(()=>messages.length===2);
  assert.equal(messages[1].key,messages[0].key);
  assert.equal(messages[1].body,messages[0].body);
  assert.equal(effects,1,'the fictional receiver must deduplicate the retry');
  const bad='fixture-http-dagu-2',badPath=`/dag-runs/${workflow}/${bad}`;
  await call(`/dags/${workflow}/start`,{dagRunId:bad,labels,params:JSON.stringify({REQUEST:JSON.stringify({title:'Fixture decision',requester:'Agente de prueba',doing:'Revisar una propuesta ficticia.',needs:'Una decisión.',if_silent:'No pasa nada.',options:[{choice:'Accept',effect:'Proceeds.'},{choice:'Reject',effect:'Stops.'}]}),ORIGIN_TYPE:'http',ORIGIN_REF:destination})});
  await wait(async()=>{const detail=(await call(badPath)).dagRunDetails;return detail.statusLabel.toLowerCase()==='waiting';});
  await call(`${badPath}/human-tasks/ask/complete`,{answer:'Not an option',comment:'',responder:'fixture',decision:'answered'});
  const rejected=await wait(async()=>{const detail=(await call(badPath)).dagRunDetails;return ['failed','succeeded'].includes(detail.statusLabel.toLowerCase())&&detail;});
  assert.equal(rejected.statusLabel.toLowerCase(),'failed');
  assert.equal(messages.length,2,'an invalid answer must never reach the receiver');
  assert.equal(effects,1);
  assert.ok(!JSON.stringify(rejected).includes('fixture-token'));
});
