const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {operate,patchFor,access}=require('../template/framework/scripts/app-access.cjs');
test('app changes preserve unrelated scopes and partial grants, without mutating input',()=>{
 const bot={connectorScopes:{apps:{gmail:'read',slack:'write'}},connectorTools:{gmail:{tools:['GMAIL_FETCH_EMAILS']},slack:{tools:'*'}}},before=JSON.stringify(bot);
 const result=patchFor(bot,{gmail:{connected:true},github:{connected:true}},{gmail:'write',github:'read'});
 assert.deepEqual(result.connectorScopes,{apps:{gmail:'write',slack:'write',github:'read'}});
 assert.deepEqual(result.connectorTools.gmail,bot.connectorTools.gmail);assert.equal(result.connectorTools.github.tools,'*');assert.equal(JSON.stringify(bot),before);
 assert.equal(access(result,'gmail'),'write');assert.equal(access(result,'not-granted'),'off');
 assert.deepEqual(patchFor({composio:false},{gmail:{connected:true},slack:{connected:true}},{gmail:'read'}).connectorScopes,{apps:{gmail:'read'}});
 assert.throws(()=>patchFor({}, {github:{connected:false}},{github:'write'}),/authorize/);
 assert.throws(()=>patchFor({}, {},{gmail:'administrator'}));
});
test('native app plans are stale-safe, exact-target, verified and restored by stable bot identity',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-app-access-')),env={FYSO_ROOT:root,FYSO_DATA:path.join(root,'.data'),FYSO_OMB_PORT:'19444'};
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:'pipe'}).trim();
 git(['init','-q']);git(['config','user.name','App fixture']);git(['config','user.email','fixture@example.invalid']);git(['commit','--allow-empty','-qm','fixture']);
 let bots=[{id:'one',name:'One',connectorScopes:{apps:{gmail:'write',slack:'read'}}},{id:'two',name:'Two',connectorTools:{slack:{tools:'*'}}}],services={gmail:{connected:true},slack:{connected:true}},patches=[];
 const other=JSON.stringify(bots[1]);
 const request=async(url,options)=>{
  assert.ok(url.startsWith('http://127.0.0.1:19444/api/'));
  if(url.endsWith('bots?messages=0'))return {ok:true,json:async()=>({bots:structuredClone(bots)})};
  if(url.endsWith('connectors/connected'))return {ok:true,json:async()=>({configured:true,inventoryComplete:true,services:structuredClone(services)})};
  assert.equal(options.method,'PATCH');const id=url.split('/').pop(),patch=JSON.parse(options.body);patches.push(id);
  const bot=bots.find(bot=>bot.id===id);for(const [key,value] of Object.entries(patch)){if(value===null)delete bot[key];else bot[key]=value;}
  return {ok:true,json:async()=>({bot})};
 };
 try{
  const read=await operate('read',{botId:'one'},env,request,()=>{});
  const plan=await operate('plan',{botId:'one',revision:read.revision,changes:{gmail:'read'}},env,request,()=>{});
  assert.deepEqual(patches,[]);assert.equal(access(bots[0],'gmail'),'write');
  const result=await operate('apply',plan,env,request,()=>{});assert.equal(result.applied,true);assert.deepEqual(patches,['one']);assert.equal(access(bots[0],'gmail'),'read');assert.equal(JSON.stringify(bots[1]),other);
  assert.equal(git(['status','--porcelain','--','project/bots/app-access']),'');
  await assert.rejects(operate('apply',plan,env,request,()=>{}),/stale/);
  const fresh=await operate('read',{botId:'one'},env,request,()=>{}),stale=await operate('plan',{botId:'one',revision:fresh.revision,changes:{gmail:'write'}},env,request,()=>{});
  services.gmail.connected=false;await assert.rejects(operate('apply',stale,env,request,()=>{}),/stale/);services.gmail.connected=true;
  bots[0].id='restored-one';bots[0].connectorScopes={apps:{}};
  assert.equal((await operate('restore',{},env,request,()=>{})).restored,1);assert.equal(access(bots[0],'gmail'),'read');assert.equal(JSON.stringify(bots[1]),other);
  const files=fs.readdirSync(path.join(root,'project/bots/app-access'));fs.appendFileSync(path.join(root,'project/bots/app-access',files[0]),'\n');
  const dirty=await operate('read',{botId:'restored-one'},env,request,()=>{});await assert.rejects(operate('plan',{botId:'restored-one',revision:dirty.revision,changes:{gmail:'write'}},env,request,()=>{}),/existing app permission edits/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('orphaned app access is never assigned to a same-named bot in another team',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-app-access-team-')),env={FYSO_ROOT:root,FYSO_DATA:path.join(root,'.data'),FYSO_OMB_PORT:'19445'};
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:'pipe'}).trim();
 git(['init','-q']);git(['config','user.name','App fixture']);git(['config','user.email','fixture@example.invalid']);git(['commit','--allow-empty','-qm','fixture']);
 let bots=[{id:'one',name:'Redactor',connectorScopes:{apps:{gmail:'write'}}},{id:'two',name:'Other',section:'Ventas'}];
 const request=async(url,options)=>{
  if(url.endsWith('bots?messages=0'))return {ok:true,json:async()=>({bots:structuredClone(bots)})};
  if(url.endsWith('connectors/connected'))return {ok:true,json:async()=>({configured:true,inventoryComplete:true,services:{gmail:{connected:true}}})};
  const id=url.split('/').pop(),patch=JSON.parse(options.body),bot=bots.find(bot=>bot.id===id);
  for(const [key,value] of Object.entries(patch)){if(value===null)delete bot[key];else bot[key]=value;}
  return {ok:true,json:async()=>({bot})};
 };
 const folder=path.join(root,'project/bots/app-access'),files=()=>fs.readdirSync(folder).map(name=>JSON.parse(fs.readFileSync(path.join(folder,name),'utf8')));
 try{
  let read=await operate('read',{botId:'one'},env,request,()=>{});
  await operate('apply',await operate('plan',{botId:'one',revision:read.revision,changes:{gmail:'read'}},env,request,()=>{}),env,request,()=>{});
  assert.deepEqual(files().map(f=>[f.name,f.section]),[['Redactor','']]);
  // A move and a replacement cannot be distinguished from name and section alone.
  bots[0]={id:'restored',name:'Redactor',section:'Equipo comercial',connectorScopes:{apps:{}}};
  assert.equal((await operate('restore',{},env,request,()=>{})).restored,0);assert.equal(access(bots[0],'gmail'),'off');
  // An explicit new grant is recorded for that team; the orphan is preserved.
  read=await operate('read',{botId:'restored'},env,request,()=>{});
  await operate('apply',await operate('plan',{botId:'restored',revision:read.revision,changes:{gmail:'write'}},env,request,()=>{}),env,request,()=>{});
  assert.deepEqual(files().map(f=>[f.name,f.section,f.connectorScopes.apps.gmail]).sort((a,b)=>a[1].localeCompare(b[1])),[['Redactor','','read'],['Redactor','Equipo comercial','write']]);
  assert.equal(git(['status','--porcelain','--','project']),'');
  // A same-named bot elsewhere makes the identity ambiguous: nothing is guessed.
  bots[0].section='Ventas';bots.push({id:'twin',name:'Redactor',section:'Soporte'});
  assert.equal((await operate('restore',{},env,request,()=>{})).restored,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
