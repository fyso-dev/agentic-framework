const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawnSync} = require('node:child_process');
const {deliverHttp,publicAddress,configuredPrivateAddress} = require('../template/framework/extensions/human-requests/extensions/human-requests/http-return.cjs');
const {httpConfig,deliver} = require('../template/framework/extensions/human-requests/extensions/human-requests/deliver.cjs');

const target = 'https://receiver.example/callback';
const params = {destination:target,allowlist:[target],bearer:'fixture-token',project:'project-one',runId:'run-123',payload:{answer:'yes',decision:'answered'}};
const dnsPublic = async () => [{address:'8.8.8.8',family:4}];
function fakeRequest(status=200, acknowledgement=true) {
  const calls=[];
  const request=(url,options,callback) => {
    const req = new EventEmitter();
    req.destroy = () => {};
    req.end = body => {
      calls.push({url,options,body});
      const response = new EventEmitter();
      response.statusCode=status;
      response.headers=acknowledgement ? {'idempotency-key':options.headers['idempotency-key']} : {};
      response.destroy=()=>{};
      queueMicrotask(() => callback(response));
    };
    return req;
  };
  return {request,calls};
}
test('only exact allowlisted HTTPS URLs without secrets or redirects are permitted', async () => {
  for (const destination of ['http://receiver.example/callback','https://receiver.example/other','https://u:p@receiver.example/callback','https://receiver.example/callback?token=x','https://127.0.0.1/callback','https://[::1]/callback']) {
    await assert.rejects(deliverHttp({...params,destination},{lookup:dnsPublic}), /Invalid HTTP destination|not allowed/);
  }
  const redirect = fakeRequest(302);
  await assert.rejects(deliverHttp(params,{lookup:dnsPublic,request:redirect.request}), /not acknowledged/);
  assert.equal(redirect.calls.length,1);
});
test('rejects private, special and mixed DNS answers before making a request', async () => {
  for (const [address,family] of [['127.0.0.1',4],['10.2.3.4',4],['169.254.169.254',4],['100.64.1.1',4],['192.168.1.1',4],['::1',6],['fc00::1',6],['::ffff:127.0.0.1',6],['2001:db8::1',6]]) assert.equal(publicAddress(address,family),false,address);
  assert.equal(publicAddress('8.8.8.8',4),true);
  assert.equal(publicAddress('2606:4700:4700::1111',6),true);
  let invoked = false;
  await assert.rejects(deliverHttp(params,{lookup:async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}],request:()=>{invoked=true;}}),/not public/);
  assert.equal(invoked,false);
});
test('private opt-in accepts only an exact approved address and never metadata', async () => {
  for (const ip of ['127.0.0.1','::1','10.2.3.4','172.16.0.1','192.168.1.2','100.64.1.1','fd12:3456::1']) assert.ok(configuredPrivateAddress(ip),ip);
  for (const ip of ['127.0.0.2','0.0.0.0','169.254.169.254','169.254.170.2','100.100.100.200','224.0.0.1','::','fe80::1','ff02::1','fd00:ec2::254','::ffff:127.0.0.1','8.8.8.8']) assert.throws(()=>configuredPrivateAddress(ip),/Invalid private HTTP address/,ip);
  for (const ip of ['127.0.0.1/8','example.test','', ' 127.0.0.1']) {
    if (ip) assert.throws(()=>configuredPrivateAddress(ip),/Invalid private HTTP address/,ip);
  }
  const local='https://127.0.0.1:1234/callback',localParams={...params,destination:local,allowlist:[local]};
  await assert.rejects(deliverHttp(localParams,{lookup:dnsPublic}),/Invalid HTTP destination/);
  await assert.rejects(deliverHttp({...localParams,privateAddress:'127.0.0.2'},{lookup:dnsPublic}),/Invalid private HTTP address/);
  await assert.rejects(deliverHttp({...localParams,privateAddress:'10.0.0.1'},{lookup:dnsPublic}),/Invalid HTTP destination/);
  const fake=fakeRequest();
  await deliverHttp({...localParams,privateAddress:'127.0.0.1'},{lookup:()=>{throw Error('literal must not use DNS');},request:fake.request});
  assert.equal(fake.calls.length,1);
  assert.throws(()=>httpConfig({FYSO_HR_HTTP_DESTINATION:local,FYSO_HR_HTTP_SECRET_NAME:'FYSO_HR_HTTP_TEST',FYSO_HR_HTTP_PRIVATE_ADDRESS:'169.254.169.254'},local,()=>{throw Error('must not decrypt');}),/Invalid private HTTP address/);
});
test('private hostname answers must all equal the pinned address', async () => {
  const privateParams={...params,privateAddress:'10.1.2.3'};
  const good=fakeRequest();
  await deliverHttp(privateParams,{lookup:async()=>[{address:'10.1.2.3',family:4}],request:good.request});
  await new Promise(resolve=>good.calls[0].options.lookup('receiver.example',{},(_e,address,family)=>{assert.equal(address,'10.1.2.3');assert.equal(family,4);resolve();}));
  for (const addresses of [
    [{address:'10.1.2.4',family:4}],
    [{address:'10.1.2.3',family:4},{address:'8.8.8.8',family:4}],
    [{address:'10.1.2.3',family:4},{address:'169.254.169.254',family:4}],
    [{address:'10.1.2.3',family:4},{address:'10.1.2.4',family:4}],
    [{address:'10.1.2.3',family:4},{address:'::1',family:6}],
  ]) {
    let invoked=false;
    await assert.rejects(deliverHttp(privateParams,{lookup:async()=>addresses,request:()=>{invoked=true;}}),/does not match configured private address/);
    assert.equal(invoked,false);
  }
  await assert.rejects(deliverHttp({...privateParams,destination:'http://receiver.example/callback',allowlist:['http://receiver.example/callback']},{lookup:dnsPublic}),/Invalid HTTP destination/);
});
test('pins the validated DNS address, uses stable keys and never sends secrets in URL', async () => {
  const fake=fakeRequest();
  const first=await deliverHttp(params,{lookup:dnsPublic,request:fake.request});
  const second=await deliverHttp(params,{lookup:dnsPublic,request:fake.request});
  assert.equal(first.idempotencyKey,second.idempotencyKey);
  assert.match(first.idempotencyKey,/^fyso-hr-[a-f0-9]{64}$/);
  assert.equal(fake.calls[0].url.href,target);
  assert.equal(fake.calls[0].options.headers.authorization,'Bearer fixture-token');
  assert.equal(fake.calls[0].body,JSON.stringify(params.payload));
  await new Promise(resolve => fake.calls[0].options.lookup('receiver.example',{},(err,address,family) => {assert.equal(err,null); assert.equal(address,'8.8.8.8'); assert.equal(family,4); resolve();}));
});
test('requires response acknowledgement, credential and stable identity', async () => {
  await assert.rejects(deliverHttp({...params,bearer:''},{lookup:dnsPublic}),/credential/);
  await assert.rejects(deliverHttp({...params,runId:''},{lookup:dnsPublic}),/identity/);
  const noAck=fakeRequest(200,false);
  await assert.rejects(deliverHttp(params,{lookup:dnsPublic,request:noAck.request}),/not acknowledged/);
  const key1=(await deliverHttp(params,{lookup:dnsPublic,request:fakeRequest().request})).idempotencyKey;
  const key2=(await deliverHttp({...params,runId:'run-456'},{lookup:dnsPublic,request:fakeRequest().request})).idempotencyKey;
  assert.notEqual(key1,key2);
});
test('does not expose sensitive transport errors to the workflow log', async () => {
  const failingRequest=()=>{
    const req=new EventEmitter(); req.destroy=()=>{};
    req.end=()=>queueMicrotask(()=>req.emit('error',Error('fixture-token https://receiver.example/callback secret body')));
    return req;
  };
  await assert.rejects(deliverHttp(params,{lookup:dnsPublic,request:failingRequest}),error=>{
    assert.match(error.message,/uncertain/);
    assert.ok(!error.message.includes('fixture-token'));
    assert.ok(!error.message.includes('receiver.example'));
    assert.ok(!error.message.includes('secret body'));
    return true;
  });
  await assert.rejects(deliverHttp(params,{lookup:async()=>{throw Error('secret resolver information');}}),error=>{
    assert.equal(error.message,'HTTP destination lookup failed'); return true;
  });
});
test('reads one SOPS credential without exposing it in arguments or errors', () => {
  const calls=[];
  const env={FYSO_ROOT:'/project',FYSO_COMPOSIO_AGE_KEY_FILE:'/key',FYSO_HR_HTTP_DESTINATION:target,FYSO_HR_HTTP_SECRET_NAME:'FYSO_HR_HTTP_SERVICE'};
  const config=httpConfig(env,target,(bin,args,opts)=>{calls.push({bin,args,opts});return {status:0,stdout:'fixture-token\n'};});
  assert.deepEqual(config,{allowlist:[target],bearer:'fixture-token'});
  assert.deepEqual(calls[0].args,['decrypt','--extract','["FYSO_HR_HTTP_SERVICE"]','secrets.enc.yaml']);
  assert.equal(calls[0].opts.stdio[2],'ignore');
  assert.equal(calls[0].opts.env.SOPS_AGE_KEY_FILE,'/key');
  assert.throws(()=>httpConfig(env,target,()=>({status:1,stderr:'credential-sensitive-error'})),error=>!error.message.includes('credential-sensitive-error'));
  assert.throws(()=>httpConfig({...env,FYSO_HR_HTTP_DESTINATION:''},target,()=>{throw Error('must not decrypt');}),/not configured/);
  assert.throws(()=>httpConfig(env,'https://attacker.example/callback',()=>{throw Error('must not decrypt');}),/not allowed/);
  assert.throws(()=>httpConfig({...env,FYSO_HR_HTTP_SECRET_NAME:'DANGEROUS'},target,()=>{throw Error('must not decrypt');}),/Invalid HTTP destination configuration/);
});
test('passes the real response and stable run identity to HTTP transport without logging secrets', async () => {
  const observed=[],logs=[];
  await deliver({REQUEST_ORIGIN_TYPE:'http',REQUEST_ORIGIN_REF:target,REQUEST_DECISION:'answered',REQUEST_ANSWER:'yes',REQUEST_QUESTION:'Q',DAG_RUN_ID:'run-123',FYSO_PROJECT:'demo',FYSO_ROOT:'/project',FYSO_COMPOSIO_AGE_KEY_FILE:'/key',FYSO_HR_HTTP_DESTINATION:target,FYSO_HR_HTTP_SECRET_NAME:'FYSO_HR_HTTP_SERVICE'},{
    validateAnswer:async()=>{}, command:()=>({status:0,stdout:'fixture-token\n'}),
    deliverHttp: async input => {observed.push(input);return {delivered:true,idempotencyKey:'fixture-key'};},
    log: text => logs.push(text),
  });
  assert.equal(observed[0].destination,target);
  assert.equal(observed[0].runId,'run-123');
  assert.equal(observed[0].payload.answer,'yes');
  assert.equal(observed[0].bearer,'fixture-token');
  assert.ok(!logs.join('').includes('fixture-token'));
  assert.ok(!logs.join('').includes(target));
  assert.ok(!logs.join('').includes('yes'));
});
test('HTTP and OMB routes preserve their contracts without leaking the HTTP credential', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-hr-routes-'));
  try {
    const stub=path.join(dir,'openmausbot'),args=path.join(dir,'args'),input=path.join(dir,'input');
    fs.writeFileSync(stub,'#!/bin/sh\nprintf "%s\\n" "$@" > "$CAPTURE_ARGS"\ncat > "$CAPTURE_INPUT"\n',{mode:0o700});
    let httpCalls=0; const logs=[];
    const env={REQUEST_ORIGIN_TYPE:'http',REQUEST_ORIGIN_REF:target,REQUEST_DECISION:'answered',REQUEST_ANSWER:'yes',DAG_RUN_ID:'run-joint',FYSO_PROJECT:'demo',FYSO_ROOT:dir,FYSO_COMPOSIO_AGE_KEY_FILE:'fixture-key',FYSO_HR_HTTP_DESTINATION:target,FYSO_HR_HTTP_SECRET_NAME:'FYSO_HR_HTTP_SERVICE'};
    await deliver(env,{validateAnswer:async()=>{},command:()=>({status:0,stdout:'fixture-secret\n'}),deliverHttp:async value=>{httpCalls++;assert.equal(value.bearer,'fixture-secret');return {delivered:true,idempotencyKey:'stable-http-id'};},log:value=>logs.push(value)});
    assert.equal(httpCalls,1);
    const script=path.join(__dirname,'../template/framework/extensions/human-requests/extensions/human-requests/deliver.cjs');
    const childEnv={...process.env,PATH:`${dir}:${process.env.PATH}`,CAPTURE_ARGS:args,CAPTURE_INPUT:input,DAG_RUN_ID:'run-joint',REQUEST_DECISION:'answered',REQUEST_ANSWER:'yes',REQUEST_ORIGIN_TYPE:'omb',REQUEST_ORIGIN_REF:JSON.stringify({bot:'bot-1',task:'task-1'}),FYSO_OMB_PORT:'1234'};
    const runner='require(process.argv[1]).deliver(process.env,{validateAnswer:async()=>{}}).catch(e=>{console.error(e.message);process.exitCode=1})';
    const first=spawnSync(process.execPath,['-e',runner,script],{env:childEnv,encoding:'utf8'});
    assert.equal(first.status,0,first.stderr);
    const argv=fs.readFileSync(args,'utf8'),payload=fs.readFileSync(input,'utf8');
    assert.match(argv,/--send-id\nhr_[a-f0-9]{64}/);
    assert.match(argv,/--wait\nnone/);
    assert.match(payload,/"answer":"yes"/);
    assert.ok(![argv,payload,first.stdout,first.stderr,...logs].join('').includes('fixture-secret'));
    fs.writeFileSync(stub,'#!/bin/sh\necho fixture-secret >&2\nexit 1\n',{mode:0o700});
    const rejected=spawnSync(process.execPath,['-e',runner,script],{env:childEnv,encoding:'utf8'});
    assert.notEqual(rejected.status,0);
    assert.ok(!rejected.stderr.includes('fixture-secret'));
    assert.match(rejected.stderr,/delivery failed or is uncertain/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
