// Local TLS fixture: the request adapter maps the fake public DNS target to a
// loopback test server. This exercises wire format and a receiver's dedupe,
// but does not establish real DNS, network or production receiver behavior.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const {execFileSync} = require('node:child_process');
const {deliverHttp} = require('../template/framework/extensions/human-requests/extensions/human-requests/http-return.cjs');

test('real TLS fixture processes repeated delivery once when receiver implements idempotency', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-hr-tls-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=receiver.test','-addext','subjectAltName=DNS:receiver.test'],{stdio:'ignore'});
  const records=new Map(); let effects=0, requests=0;
  const server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
    requests++;
    const chunks=[]; req.on('data',chunk=>chunks.push(chunk)); req.on('end',()=>{
      const body=Buffer.concat(chunks).toString('utf8'),id=req.headers['idempotency-key'];
      if(req.method!=='POST'||req.url!=='/callback'||req.headers.authorization!=='Bearer fixture-token'||typeof id!=='string'){res.writeHead(400);res.end();return;}
      if(records.has(id)&&records.get(id)!==body){res.writeHead(409);res.end();return;}
      if(!records.has(id)){records.set(id,body);effects++;}
      res.writeHead(200,{'idempotency-key':id});res.end();
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>server.close());
  const port=server.address().port,ca=fs.readFileSync(cert);
  const lookup=async()=>[{address:'8.8.8.8',family:4}];
  const request=(url,options,callback)=>https.request(url,{...options,hostname:'127.0.0.1',port,servername:'receiver.test',ca,lookup:(_h,_o,cb)=>cb(null,'127.0.0.1',4)},callback);
  const input={destination:'https://receiver.test/callback',allowlist:['https://receiver.test/callback'],bearer:'fixture-token',project:'demo',runId:'request-1',payload:{answer:'yes'}};
  const first=await deliverHttp(input,{lookup,request});
  const second=await deliverHttp(input,{lookup,request});
  assert.equal(first.idempotencyKey,second.idempotencyKey);
  assert.equal(requests,2);
  assert.equal(effects,1);
  await assert.rejects(deliverHttp({...input,payload:{answer:'no'}},{lookup,request}),/not acknowledged/);
  assert.equal(effects,1);
});

test('private opt-in pins loopback but still verifies TLS hostname and IP SAN', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-hr-private-tls-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=receiver.test','-addext','subjectAltName=DNS:receiver.test,IP:127.0.0.1'],{stdio:'ignore'});
  let requests=0;
  const server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
    requests++;req.resume();req.on('end',()=>{res.writeHead(200,{'idempotency-key':req.headers['idempotency-key']});res.end();});
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>server.close());
  const port=server.address().port,ca=fs.readFileSync(cert);
  // Only the fixture CA is supplied; the product's own lookup pins the tested
  // address and Node still enforces the hostname/IP subject alternative name.
  const request=(url,options,callback)=>https.request(url,{...options,ca},callback);
  const lookup=async()=>[{address:'127.0.0.1',family:4}];
  const hostname=`https://receiver.test:${port}/callback`,wrong=`https://other.test:${port}/callback`,literal=`https://127.0.0.1:${port}/callback`;
  const base={bearer:'fixture-token',project:'demo',runId:'private-request',payload:{answer:'yes'},privateAddress:'127.0.0.1'};
  await deliverHttp({...base,destination:hostname,allowlist:[hostname]},{lookup,request});
  assert.equal(requests,1);
  await assert.rejects(deliverHttp({...base,destination:wrong,allowlist:[wrong]},{lookup,request}),/delivery failed/);
  assert.equal(requests,1,'a bad certificate name must not receive an HTTP request');
  await deliverHttp({...base,destination:literal,allowlist:[literal]},{lookup:()=>{throw Error('IP literal must not resolve');},request});
  assert.equal(requests,2);
  await assert.rejects(deliverHttp({...base,destination:hostname,allowlist:[hostname]},{lookup}),/delivery failed/);
  assert.equal(requests,2,'an untrusted CA must not receive an HTTP request');
  const plain=`http://127.0.0.1:${port}/callback`;
  await assert.rejects(deliverHttp({...base,destination:plain,allowlist:[plain]},{lookup,request}),/Invalid HTTP destination/);
  assert.equal(requests,2);
});
