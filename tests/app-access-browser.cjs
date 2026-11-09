// Real panel → Dagu → native OMB permission proof. Only a disposable bot is mutated.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
(async()=>{
 if(process.env.FYSO_TEST_CONNECTORS!=='1'||!process.env.FYSO_ROOT||!process.env.FYSO_OMB_PORT)throw Error('explicit disposable project required');
 const root=process.env.FYSO_ROOT,port=process.env.FYSO_OMB_PORT,base=process.env.FYSO_TEST_PANEL||`http://panel.localhost:${process.env.FYSO_HTTP_PORT}`;
 const api=async(route,method='GET',body)=>{const res=await fetch(`http://127.0.0.1:${port}/api/${route}`,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!res.ok)throw Error(`native fixture ${method} ${res.status}`);return res.json();};
 const {permissions}=require('../template/framework/scripts/app-access.cjs');
 let id,browser;const folder=path.resolve(__dirname,'../artifacts/delivery-evidence/app-permissions');fs.mkdirSync(folder,{recursive:true});
 const before=(await api('bots?messages=0')).bots.map(bot=>({id:bot.id,name:bot.name,...permissions(bot)}));
 const savedFolder=path.join(root,'project/bots/app-access'),beforeFiles=new Set(fs.existsSync(savedFolder)?fs.readdirSync(savedFolder):[]);
 try{
  const apps=await api('connectors/connected');assert.equal(apps.services.gmail?.connected,true,'local project Gmail must already be authorized');
  id=(await api('bots','POST',{name:`App Permission Proof ${Date.now().toString(36)}`,soul:'Disposable permissions fixture. Never execute external account tools.',modelSelection:{instanceId:'codex',model:'gpt-6.1-sol'}})).bot.id;
  await api(`bots/${id}`,'PATCH',{composio:false,connectorScopes:{apps:{}},connectorTools:{}});
  browser=await chromium.launch({headless:true});const context=await browser.newContext({httpCredentials:{username:'admin',password:'admin'},viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.name));
  await page.goto(`${base}/?lang=es#/connectors?bot=${encodeURIComponent(id)}`);
  const section=page.locator('[aria-labelledby="connector-bots"]'),appsSection=section.getByRole('region',{name:'Aplicaciones',exact:true});
  const select=appsSection.getByRole('combobox',{name:'Acceso a Gmail',exact:true});
  await select.waitFor({timeout:60000});await page.waitForFunction(()=>{const el=document.querySelector('[aria-labelledby="connector-bots"] select[aria-label="Acceso a Gmail"]');return el&&!el.disabled;},{},{timeout:60000});
  assert.equal(await select.inputValue(),'off');await select.selectOption('read');
  assert.equal(permissions((await api('bots?messages=0')).bots.find(bot=>bot.id===id)).composio,false);
  await appsSection.getByRole('button',{name:'Revisar permisos de aplicaciones',exact:true}).click();
  const apply=appsSection.getByRole('button',{name:'Aplicar permisos de aplicaciones',exact:true});await apply.waitFor({timeout:60000});
  assert.equal(permissions((await api('bots?messages=0')).bots.find(bot=>bot.id===id)).composio,false);
  await appsSection.scrollIntoViewIfNeeded();await appsSection.screenshot({path:path.join(folder,'review-app-access.png')});
  await apply.click();await appsSection.getByText('Permisos de aplicaciones aplicados y versionados.',{exact:true}).waitFor({timeout:60000});
  let current=(await api('bots?messages=0')).bots.find(bot=>bot.id===id);
  assert.equal(current.composio,true);assert.deepEqual(current.connectorScopes,{apps:{gmail:'read'}});assert.deepEqual(current.connectorTools,{gmail:{tools:'*'}});
  await appsSection.getByRole('button',{name:'Actualizar aplicaciones',exact:true}).click();await page.waitForFunction(()=>{const el=document.querySelector('[aria-labelledby="connector-bots"] select[aria-label="Acceso a Gmail"]');return el&&!el.disabled;},{},{timeout:60000});assert.equal(await select.inputValue(),'read');
  await page.setViewportSize({width:390,height:844});await appsSection.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await appsSection.screenshot({path:path.join(folder,'app-access-mobile.png')});
  await select.selectOption('off');await appsSection.getByRole('button',{name:'Revisar permisos de aplicaciones',exact:true}).click();await apply.waitFor({timeout:60000});await apply.click();await appsSection.getByText('Permisos de aplicaciones aplicados y versionados.',{exact:true}).waitFor({timeout:60000});
  current=(await api('bots?messages=0')).bots.find(bot=>bot.id===id);assert.deepEqual(current.connectorScopes,{apps:{}});
  const after=(await api('bots?messages=0')).bots.filter(bot=>bot.id!==id).map(bot=>({id:bot.id,name:bot.name,...permissions(bot)}));assert.deepEqual(after,before);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({scope:'real isolated panel + Dagu + native OMB; disposable bot only',initiallyOff:true,previewDoesNotMutate:true,readOnlyApplied:true,readback:true,disableApplied:true,otherBotsPreserved:true,mobileOverflow:false,pageErrors:0}));
 }finally{
  if(browser)await browser.close();
  if(id)await api(`bots/${encodeURIComponent(id)}`,'DELETE');
  if(fs.existsSync(savedFolder))for(const file of fs.readdirSync(savedFolder).filter(file=>!beforeFiles.has(file))){const saved=JSON.parse(fs.readFileSync(path.join(savedFolder,file),'utf8'));if(!saved.name.startsWith('App Permission Proof '))throw Error('unexpected saved fixture');fs.unlinkSync(path.join(savedFolder,file));const relative=path.relative(root,path.join(savedFolder,file));execFileSync('git',['add','--',relative],{cwd:root,stdio:'pipe'});if(execFileSync('git',['diff','--cached','--numstat','--',relative],{cwd:root,encoding:'utf8',stdio:'pipe'}).trim())execFileSync('git',['commit','-qm','test: remove disposable app permission fixture','--',relative],{cwd:root,stdio:'pipe'});}
 }
})().catch(error=>{console.error(error.message.slice(0,400));process.exitCode=1;});
