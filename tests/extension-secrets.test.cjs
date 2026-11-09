const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {configure,validate,declared,SecretsError}=require('../template/framework/scripts/extension-secrets.cjs');
const {createServer}=require('../template/framework/scripts/composio-setup.cjs');
const value='pk-lf-fixture-not-a-credential',other='sk-lf-fixture-not-a-credential';
const NAMES=['LANGFUSE_PUBLIC_KEY','LANGFUSE_SECRET_KEY','LANGFUSE_BASE_URL'];
const names=(root,id)=>id==='langfuse'?NAMES:null;
async function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'extension-secrets-'));try{
 const env={...process.env,FYSO_ROOT:root,FYSO_DATA:path.join(root,'.data'),FYSO_HTTP_PORT:'19540',FYSO_ADMIN_USER:'fixture',FYSO_ADMIN_PASSWORD:'fixture'};
 fs.writeFileSync(path.join(root,'secrets.enc.yaml'),'original encrypted data');
 const commands=[];
 const command=(bin,args,options)=>{commands.push({bin,args,input:options.input});
  if(bin==='sops')fs.writeFileSync(args[2],'new encrypted data');
  if(args[0]==='diff')throw Error('changed');
  if(bin==='mise')return 'restarted ext-langfuse\n{"missing":[],"check":"ok"}\n';
  return '';};
 await fn({root,env,commands,command});
}finally{fs.rmSync(root,{recursive:true,force:true});}}

test('input accepts only declared names; blank fields keep the current value',()=>{
 for(const input of [{},null,[],{values:[]},{values:{}},{values:{OTHER:value}},{values:{LANGFUSE_PUBLIC_KEY:1}},{values:{LANGFUSE_PUBLIC_KEY:value},extra:1},
  {values:{LANGFUSE_PUBLIC_KEY:'a\nb'}},{values:{LANGFUSE_PUBLIC_KEY:'x'.repeat(4097)}},{values:{LANGFUSE_PUBLIC_KEY:'  '}}])
  assert.throws(()=>validate(input,NAMES),SecretsError);
 assert.deepEqual(validate({values:{LANGFUSE_PUBLIC_KEY:` ${value} `,LANGFUSE_BASE_URL:''}},NAMES),{LANGFUSE_PUBLIC_KEY:value});
});

test('an extension that is not installed, or declares nothing, changes nothing',()=>fixture(async f=>{
 for(const id of ['nope','../x','Langfuse'])
  await assert.rejects(configure(id,{values:{LANGFUSE_PUBLIC_KEY:value}},f.env,f.command,names),{code:'notFound'});
 await assert.rejects(configure('langfuse',{values:{LANGFUSE_PUBLIC_KEY:value}},f.env,f.command,()=>[]),{code:'notFound'});
 assert.equal(f.commands.length,0);
}));

test('values reach SOPS only through stdin; only secrets.enc.yaml is committed; the extension reloads',()=>fixture(async f=>{
 const result=await configure('langfuse',{values:{LANGFUSE_PUBLIC_KEY:value,LANGFUSE_SECRET_KEY:other}},f.env,f.command,names);
 assert.deepEqual(result,{saved:true,missing:[],check:'ok'});
 const sops=f.commands.filter(c=>c.bin==='sops');
 assert.deepEqual(sops.map(c=>c.args[3]),['["LANGFUSE_PUBLIC_KEY"]','["LANGFUSE_SECRET_KEY"]']);
 assert.deepEqual(sops.map(c=>c.input),[JSON.stringify(value),JSON.stringify(other)]);
 assert.ok(f.commands.every(c=>!JSON.stringify(c.args).includes(value)&&!JSON.stringify(c.args).includes(other)));
 const commit=f.commands.find(c=>c.args[0]==='commit');
 assert.deepEqual(commit.args,['commit','-qm','extensions: configure langfuse','--','secrets.enc.yaml']);
 assert.deepEqual(f.commands.at(-1).args,['exec','--','framework/scripts/ext.sh','configured','langfuse']);
 assert.equal(fs.readFileSync(path.join(f.root,'secrets.enc.yaml'),'utf8'),'new encrypted data');
 assert.equal(fs.existsSync(path.join(f.env.FYSO_DATA,'connector-settings.lock')),false);
}));

test('dirty secrets and concurrent setup are preserved rather than overwritten',()=>fixture(async f=>{
 await assert.rejects(configure('langfuse',{values:{LANGFUSE_PUBLIC_KEY:value}},f.env,(bin,args,options)=>args[0]==='status'?' M secrets.enc.yaml':f.command(bin,args,options),names),{code:'pendingSecrets'});
 fs.mkdirSync(path.join(f.env.FYSO_DATA,'connector-settings.lock'));
 await assert.rejects(configure('langfuse',{values:{LANGFUSE_PUBLIC_KEY:value}},f.env,f.command,names),{code:'busy'});
 assert.equal(fs.readFileSync(path.join(f.root,'secrets.enc.yaml'),'utf8'),'original encrypted data');
 assert.ok(!f.commands.some(c=>c.bin==='sops'));
}));

test('a failed SOPS write or commit restores the file, leaks nothing and does not reload',()=>fixture(async f=>{
 for(const failing of ['sops','commit']){
  f.commands.length=0;
  await assert.rejects(configure('langfuse',{values:{LANGFUSE_PUBLIC_KEY:value}},f.env,(bin,args,options)=>{if(bin===failing||args[0]===failing)throw Error('private output '+value);return f.command(bin,args,options);},names),
   error=>error.code==='saveFailed'&&!error.message.includes(value));
  assert.equal(fs.readFileSync(path.join(f.root,'secrets.enc.yaml'),'utf8'),'original encrypted data');
  assert.ok(!f.commands.some(c=>c.bin==='mise'));
 }
}));

test('a reload that fails or prints garbage still reports the saved values',()=>fixture(async f=>{
 const command=(bin,args,options)=>{if(bin==='mise')throw Error('boom '+value);return f.command(bin,args,options);};
 assert.deepEqual(await configure('langfuse',{values:{LANGFUSE_PUBLIC_KEY:value}},f.env,command,names),{saved:true,missing:[],check:'unknown'});
 const report=(bin,args,options)=>bin==='mise'?'{"missing":["LANGFUSE_SECRET_KEY"],"check":"failed"}':f.command(bin,args,options);
 assert.deepEqual(await configure('langfuse',{values:{LANGFUSE_PUBLIC_KEY:value}},f.env,report,names),{saved:true,missing:['LANGFUSE_SECRET_KEY'],check:'failed'});
}));

test('declared names come from the installed extension secrets.yaml',()=>fixture(async f=>{
 const bin=path.join(f.root,'bin');fs.mkdirSync(bin);
 fs.symlinkSync(path.resolve(__dirname,'../template/framework/panel/node_modules/yaml/bin.mjs'),path.join(bin,'yaml'));
 process.env.PATH=bin+path.delimiter+process.env.PATH;
 const dir=path.join(f.root,'extensions/langfuse');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'secrets.yaml'),'- name: LANGFUSE_PUBLIC_KEY\n  required: true\n- name: bad name\n- name: LANGFUSE_BASE_URL\n');
 assert.deepEqual(declared(f.root,'langfuse'),['LANGFUSE_PUBLIC_KEY','LANGFUSE_BASE_URL']);
 assert.equal(declared(f.root,'other'),null);
}));

test('HTTP route requires the project login and exact origin, and maps errors without detail',()=>fixture(async f=>{
 const calls=[];
 const save=async(id,input)=>{calls.push([id,input]);if(id==='broken')throw new SecretsError('pendingSecrets',409);if(id==='crash')throw Error('private '+value);return {saved:true,missing:[],check:'ok'};};
 const server=createServer(f.env,async()=>({}),async()=>({}),save);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}`,headers={Authorization:'Basic '+Buffer.from('fixture:fixture').toString('base64'),Origin:'http://panel.localhost:19540','Content-Type':'application/json'};
 const body=JSON.stringify({values:{LANGFUSE_PUBLIC_KEY:value}});
 try{
  for(const [h,route,method,status] of [[{},'/api/extensions/langfuse/secrets','POST',401],[{...headers,Origin:'http://evil.invalid'},'/api/extensions/langfuse/secrets','POST',403],
   [headers,'/api/extensions/Langfuse/secrets','POST',404],[headers,'/api/extensions/langfuse/secrets/x','POST',404],[headers,'/api/extensions/langfuse/secrets','GET',405],
   [{...headers,'Content-Type':'text/plain'},'/api/extensions/langfuse/secrets','POST',415]])
   assert.equal((await fetch(url+route,{method,headers:h,body:method==='POST'?body:undefined})).status,status,`${method} ${route}`);
  assert.equal(calls.length,0);
  const ok=await fetch(url+'/api/extensions/langfuse/secrets',{method:'POST',headers,body});
  assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'no-store');
  assert.deepEqual(await ok.json(),{saved:true,missing:[],check:'ok'});
  assert.deepEqual(calls[0],['langfuse',{values:{LANGFUSE_PUBLIC_KEY:value}}]);
  const conflict=await fetch(url+'/api/extensions/broken/secrets',{method:'POST',headers,body});
  assert.equal(conflict.status,409);assert.deepEqual(await conflict.json(),{error:'pendingSecrets'});
  const crash=await fetch(url+'/api/extensions/crash/secrets',{method:'POST',headers,body});
  assert.equal(crash.status,500);assert.ok(!(await crash.text()).includes(value));
 }finally{await new Promise(resolve=>server.close(resolve));}
}));

test('the pasted block is read as providers show it; other names and malformed lines are ignored',async()=>{
 const {parseEnvBlock}=await import('../template/framework/panel/src/lib/envBlock.ts');
 // Exactly what Langfuse shows after creating a key (web/src/features/public-api/hooks/useLangfuseEnvCode.ts).
 const langfuse='LANGFUSE_SECRET_KEY="sk-lf-1a2b"\nLANGFUSE_PUBLIC_KEY="pk-lf-1a2b"\nLANGFUSE_BASE_URL="https://us.cloud.langfuse.com"';
 assert.deepEqual(parseEnvBlock(langfuse,NAMES),{values:{LANGFUSE_SECRET_KEY:'sk-lf-1a2b',LANGFUSE_PUBLIC_KEY:'pk-lf-1a2b',LANGFUSE_BASE_URL:'https://us.cloud.langfuse.com'},examples:[]});
 assert.deepEqual(parseEnvBlock("  export LANGFUSE_PUBLIC_KEY='pk-lf-2'\r\n# comment\nLANGFUSE_SECRET_KEY = sk-lf-2  # note\nOTHER=x\nLANGFUSE_BASE_URL=\"\"\ngarbage",NAMES),
  {values:{LANGFUSE_PUBLIC_KEY:'pk-lf-2',LANGFUSE_SECRET_KEY:'sk-lf-2'},examples:[]});
 assert.deepEqual(parseEnvBlock('sk-lf-only-a-value',NAMES),{values:{},examples:[]});
});

test('example blocks (the placeholder Langfuse shows before a key exists) are never saved',async()=>{
 const {parseEnvBlock,isExample}=await import('../template/framework/panel/src/lib/envBlock.ts');
 // Langfuse's own placeholder snippet: same names, values 'sk-lf-...' / 'pk-lf-...'.
 const placeholder='LANGFUSE_SECRET_KEY="sk-lf-..."\nLANGFUSE_PUBLIC_KEY="pk-lf-..."\nLANGFUSE_BASE_URL="https://cloud.langfuse.com"';
 assert.deepEqual(parseEnvBlock(placeholder,NAMES),{values:{LANGFUSE_BASE_URL:'https://cloud.langfuse.com'},examples:['LANGFUSE_SECRET_KEY','LANGFUSE_PUBLIC_KEY']});
 for(const v of ['pk-lf-…','<your-key>','your_api_key','xxxx','changeme'])assert.equal(isExample(v),true,v);
 for(const v of ['pk-lf-4b2c9e1d-7f3a','https://cloud.langfuse.com','sk-lf-x1'])assert.equal(isExample(v),false,v);
});

test('a secret may name the HTTPS page where its value is obtained',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'extension-inventory-')),cwd=process.cwd();
 try{
  const bin=path.join(root,'bin');fs.mkdirSync(bin);
  fs.symlinkSync(path.resolve(__dirname,'../template/framework/panel/node_modules/yaml/bin.mjs'),path.join(bin,'yaml'));
  process.env.PATH=bin+path.delimiter+process.env.PATH;
  fs.mkdirSync(path.join(root,'extensions/langfuse'),{recursive:true});
  fs.writeFileSync(path.join(root,'.copier-answers.ext-langfuse.yml'),'_commit: v0.1.1\n_src_path: gh:fyso-dev/fyso-ext-langfuse\n');
  fs.writeFileSync(path.join(root,'extensions/langfuse/secrets.yaml'),'- name: LANGFUSE_PUBLIC_KEY\n  url: https://cloud.langfuse.com/project/~/settings/api-keys\n  required: true\n- name: LANGFUSE_BASE_URL\n  url: "javascript:alert(1)"\n');
  process.chdir(root);
  const [ext]=require('../template/framework/scripts/extensions.cjs').inventory([],{LANGFUSE_PUBLIC_KEY:'set'});
  assert.deepEqual(ext.secrets,[{name:'LANGFUSE_PUBLIC_KEY',url:'https://cloud.langfuse.com/project/~/settings/api-keys',required:true,set:true},{name:'LANGFUSE_BASE_URL',required:false,set:false}]);
 }finally{process.chdir(cwd);fs.rmSync(root,{recursive:true,force:true});}
});

test('an extension adds a Setup step with setup.yaml; a step needs a title',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'extension-setup-step-')),cwd=process.cwd();
 try{
  const bin=path.join(root,'bin');fs.mkdirSync(bin);
  fs.symlinkSync(path.resolve(__dirname,'../template/framework/panel/node_modules/yaml/bin.mjs'),path.join(bin,'yaml'));
  process.env.PATH=bin+path.delimiter+process.env.PATH;
  for(const id of ['langfuse','plain']){fs.mkdirSync(path.join(root,'extensions',id),{recursive:true});fs.writeFileSync(path.join(root,`.copier-answers.ext-${id}.yml`),'_commit: v1\n_src_path: gh:org/x\n');}
  fs.writeFileSync(path.join(root,'extensions/langfuse/setup.yaml'),'title: {es: Conectar Langfuse, en: Connect Langfuse}\ndescription: Sends traces\n');
  process.chdir(root);
  const extensions=require('../template/framework/scripts/extensions.cjs');
  const byId=Object.fromEntries(extensions.inventory([]).map(e=>[e.id,e]));
  assert.deepEqual(byId.langfuse.setup,{title:'Conectar Langfuse',title_i18n:{es:'Conectar Langfuse',en:'Connect Langfuse'},description:'Sends traces'});
  assert.equal('setup' in byId.plain,false);
  fs.writeFileSync(path.join(root,'extensions/plain/setup.yaml'),'description: no title\n');
  assert.throws(()=>extensions.setup('plain'),/title is required/);
 }finally{process.chdir(cwd);fs.rmSync(root,{recursive:true,force:true});}
});
