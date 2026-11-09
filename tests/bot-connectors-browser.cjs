// Real bot form → draft → native preview/apply. Disposable project only.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function main(){
 const root=process.env.FYSO_ROOT;if(!root||process.env.FYSO_TEST_CONNECTORS!=='1')throw Error('requires explicit disposable fixture');
 const base=process.env.FYSO_TEST_PANEL||`http://panel.localhost:${process.env.FYSO_HTTP_PORT}`;
 const client=require(path.join(root,'framework/scripts/dagu-client.cjs')).client();
 const action=async params=>(await client.run('fyso-bot-architect',params,{output:'RESULT',timeoutMs:180000})).output;
 const plan=async(actionName,bot,id='')=>action({OP:'plan',ACTION:actionName,BOT_ID:id,BOT_B64:bot?Buffer.from(JSON.stringify(bot)).toString('base64'):''});
 const native=async(route,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${process.env.FYSO_OMB_PORT}/api/${route}`,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(`native API ${r.status}`);return r.json();};
 const suffix=Date.now().toString(36),server=`bot-form-${suffix}`,name=`Bot Form Proof ${suffix}`;
 let id,created=false,browser;
 const projection=bots=>bots.filter(b=>b.id!==id).map(({id,name,toolScope,modelSelection,title,approvalMode,autoApprove,mcpServers})=>({id,name,toolScope,modelSelection,title,approvalMode,autoApprove,mcpServers})).sort((a,b)=>a.id.localeCompare(b.id));
 try{
  await native('mcp/servers','POST',{name:server,command:process.execPath,args:[path.join(root,'project/connector-proof.cjs')]});created=true;
  assert.equal((await native(`mcp/servers/${server}/test`,'POST',{})).ok,true);await native(`mcp/servers/${server}`,'PATCH',{enabled:true});
  id=(await action({OP:'apply',PLAN_ID:(await plan('create',{name,model:'codex/gpt-6.1-sol',soul:'Disposable connector form fixture. No external actions.',tools:{allow:['native:*']}})).planId})).botId;
  const before=projection((await native('bots')).bots);
  browser=await chromium.launch({headless:true});const context=await browser.newContext({httpCredentials:{username:'admin',password:'admin'},viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.name));
  await page.goto(`${base}/?lang=es#/bots`);
  await page.getByRole('link',{name:`Editar ${name}`,exact:true}).click();
  await page.getByRole('tab',{name:/^Conectores/}).click();
  const field=page.locator('.bd'),card=field.locator('.bd-ccard').filter({has:page.getByRole('heading',{name:server,exact:true})});
  assert.equal(await card.count(),0);
  await field.getByRole('button',{name:'Dar acceso a otra aplicación',exact:true}).click();
  const offer=page.getByRole('dialog',{name:'Dar acceso a otra aplicación',exact:true}).getByRole('button',{name:server,exact:true});
  await offer.waitFor({timeout:60000});await offer.click();await card.waitFor();
  // Changing draft input must not mutate the running bot.
  assert.deepEqual((await native('bots')).bots.find(b=>b.id===id).toolScope,{allow:['native:*']});
  const folder=path.resolve(__dirname,'../artifacts/delivery-evidence/bot-connectors');fs.mkdirSync(folder,{recursive:true});
  await field.screenshot({path:path.join(folder,'bot-connectors-editor.png')});
  await page.setViewportSize({width:390,height:844});await field.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(folder,'bot-connectors-mobile.png')});
  await page.setViewportSize({width:1440,height:1100});
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await page.getByRole('link',{name:`Editar ${name}`,exact:true}).locator(`[aria-label="Conectores: ${server}"]`).waitFor();
  assert.deepEqual((await native('bots')).bots.find(b=>b.id===id).toolScope,{allow:['native:*']});
  await page.getByRole('link',{name:'Revisar y aplicar',exact:true}).click();
  const apply=page.getByRole('button',{name:'Aplicar cambios',exact:true});await apply.waitFor({timeout:60000});await apply.click();
  await page.getByText('Aplicado. Ya puedes usarlos en OpenMausBot.',{exact:true}).waitFor({timeout:120000});
  const after=(await native('bots')).bots;assert.deepEqual(after.find(b=>b.id===id).toolScope,{allow:['native:*',`mcp:${server}:*`]});assert.deepEqual(projection(after),before);
  await page.screenshot({path:path.join(folder,'bot-connectors-list.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({botEntry:true,connectorSelection:true,draftDoesNotMutateRuntime:true,nativePreviewApply:true,unrelatedProfilesPreserved:true,mobileOverflow:false,pageErrors:0,screenshots:3}));
 } finally {
  if(browser)await browser.close();
  if(id)await action({OP:'apply',PLAN_ID:(await plan('delete',null,id)).planId});
  if(created)await native(`mcp/servers/${server}`,'DELETE');
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
