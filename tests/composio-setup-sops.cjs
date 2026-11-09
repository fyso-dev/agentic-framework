// Real SOPS/Git proof with generated test credentials; provider/native calls are fixtures.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {configure}=require('../template/framework/scripts/composio-setup.cjs');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'composio-sops-'));
 try{
  const age=path.join(root,'age.txt');execFileSync('age-keygen',['-o',age],{stdio:'pipe'});
  const recipient=execFileSync('age-keygen',['-y',age],{encoding:'utf8'}).trim();
  const env={...process.env,SOPS_AGE_KEY_FILE:age,MISE_SOPS_AGE_KEY_FILE:age,FYSO_ROOT:root,FYSO_DATA:path.join(root,'.data'),FYSO_OMB_PORT:'19544'};
  const run=(bin,args,extra={})=>execFileSync(bin,args,{cwd:root,env,encoding:'utf8',stdio:'pipe',...extra});
  const encrypted=run('sops',['encrypt','--age',recipient,'--input-type','yaml','--output-type','yaml','/dev/stdin'],{input:'EXISTING_SECRET: keep-this-fixture-value\n'});
  fs.writeFileSync(path.join(root,'secrets.enc.yaml'),encrypted);run('git',['init','-q']);run('git',['config','user.name','Fixture']);run('git',['config','user.email','fixture@example.invalid']);run('git',['add','secrets.enc.yaml']);run('git',['commit','-qm','fixture']);
  const key='fixture-key-real-encryption-only';let activation=false;
  const result=await configure({apiKey:key},env,async(url,options)=>{
   if(url.startsWith('https:'))return {ok:true,json:async()=>({items:[]})};
   activation=true;assert.equal(JSON.parse(options.body).composio.apiKey,key);return {ok:true,json:async()=>({composio:{configured:true}})};
  });
  assert.deepEqual(result,{saved:true,active:true});assert.equal(activation,true);
  assert.equal(run('sops',['decrypt','--extract','["FYSO_COMPOSIO_API_KEY"]','secrets.enc.yaml']).trim(),key);
  assert.equal(run('sops',['decrypt','--extract','["EXISTING_SECRET"]','secrets.enc.yaml']).trim(),'keep-this-fixture-value');
  assert.ok(!fs.readFileSync(path.join(root,'secrets.enc.yaml'),'utf8').includes(key));
  assert.deepEqual(run('git',['diff-tree','--no-commit-id','--name-only','-r','HEAD']).trim().split('\n'),['secrets.enc.yaml']);
  // A supervisor's inherited key must not override a later encrypted panel update.
  const scripts=path.join(root,'framework/scripts'),bin=path.join(root,'bin');fs.mkdirSync(scripts,{recursive:true});fs.mkdirSync(bin);
  for(const name of ['run-omb.sh','lib.sh'])fs.copyFileSync(path.join(__dirname,'../template/framework/scripts',name),path.join(scripts,name));
  fs.writeFileSync(path.join(bin,'openmausbot'),'#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({key:process.env.COMPOSIO_API_KEY}));\n',{mode:0o700});
  const restarted=run('bash',[path.join(scripts,'run-omb.sh')],{env:{...env,PATH:bin+path.delimiter+env.PATH,FYSO_HTTP_PORT:'19540',FYSO_DAGU_PORT:'19541',FYSO_OMB_WEBHOOK_PORT:'19545',FYSO_ADMIN_USER:'fixture',FYSO_ADMIN_PASSWORD:'fixture',FYSO_COMPOSIO_API_KEY:'stale-supervisor-fixture'}});
  assert.equal(JSON.parse(restarted).key,key);
  console.log('PASS: real SOPS encryption, existing secret preserved, scoped Git commit, native activation fixture, fresh encrypted key after restart');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(()=>{console.error('SOPS setup proof failed');process.exitCode=1;});
