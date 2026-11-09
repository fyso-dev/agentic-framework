// Real panel CRUD and bot assignment. Run only on an explicit disposable stack.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function main() {
  const root=process.env.FYSO_ROOT;
  if(!root || process.env.FYSO_TEST_CONNECTORS!=='1')throw Error('requires explicit disposable connector fixture');
  const base=process.env.FYSO_TEST_PANEL||`http://panel.localhost:${process.env.FYSO_HTTP_PORT}`;
  const client=require(path.join(root,'framework/scripts/dagu-client.cjs')).client();
  const action=async params=>(await client.run('fyso-bot-architect',params,{output:'RESULT',timeoutMs:180000})).output;
  const plan=async(actionName,bot,id='')=>action({OP:'plan',ACTION:actionName,BOT_ID:id,BOT_B64:bot?Buffer.from(JSON.stringify(bot)).toString('base64'):''});
  const native=async(route,method='GET',body)=>{
    const res=await fetch(`http://127.0.0.1:${process.env.FYSO_OMB_PORT}/api/${route}`,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});if(!res.ok)throw Error(`native verification: ${res.status}`);return res.json();
  };
  const suffix=Date.now().toString(36),name=`panel-proof-${suffix}`,botName=`Panel Connector Proof ${suffix}`;
  let botId,browser,createdServer=false;
  try {
    const desired={name:botName,model:'codex/gpt-6.1-sol',soul:'Harmless local connector UI fixture. Never send external messages.',tools:{allow:['native:*']}};
    botId=(await action({OP:'apply',PLAN_ID:(await plan('create',desired)).planId})).botId;
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({httpCredentials:{username:'admin',password:'admin'},viewport:{width:1440,height:1100}});
    const page=await context.newPage(),errors=[],statuses=[];
    page.on('pageerror',error=>errors.push(error.name));page.on('response',res=>{if(res.url().includes('/api/omb/'))statuses.push(res.status());});
    await page.goto(`${base}/?lang=es#/connectors`);
    await page.getByRole('heading',{name:'Conectores',exact:true}).waitFor();
    await page.getByRole('heading',{name:'Gmail',exact:true}).waitFor();
    await page.getByRole('button',{name:'Agregar MCP',exact:true}).click();
    await page.getByLabel('Nombre del servidor',{exact:true}).fill(name);
    await page.getByLabel('Tipo de conexión',{exact:true}).selectOption('command');
    await page.getByLabel('Ejecutable',{exact:true}).fill(process.execPath);
    await page.getByLabel('Argumentos · uno por línea',{exact:true}).fill(path.join(root,'project/connector-proof.cjs'));
    await page.getByRole('button',{name:'Guardar y probar',exact:true}).click();
    const card=page.getByRole('article').filter({has:page.getByRole('heading',{name,exact:true})});
    await card.getByText('Habilitado',{exact:true}).waitFor({timeout:60000});createdServer=true;
    await card.getByText('read_message',{exact:true}).waitFor();
    assert.equal((await native('mcp/servers')).servers.find(server=>server.name===name).enabled,true);
    const folder=path.resolve(__dirname,'../artifacts/delivery-evidence/connectors-panel');fs.mkdirSync(folder,{recursive:true});
    await page.screenshot({path:path.join(folder,'connectors-created.png'),fullPage:true});
    await card.getByRole('button',{name:'Deshabilitar',exact:true}).click();await card.getByText('Deshabilitado',{exact:true}).waitFor();
    await card.getByRole('button',{name:'Habilitar',exact:true}).click();await card.getByText('Habilitado',{exact:true}).waitFor();
    await native(`bots/${botId}`,'PATCH',{mcpServers:[]});
    await page.getByLabel('Bot',{exact:true}).selectOption(botId);
    const restricted=page.getByRole('checkbox',{name:new RegExp(name)});await restricted.waitFor({timeout:60000});assert.equal(await restricted.isDisabled(),true);
    await native(`bots/${botId}`,'PATCH',{mcpServers:null});
    await page.getByLabel('Bot',{exact:true}).selectOption('');await page.getByLabel('Bot',{exact:true}).selectOption(botId);
    const checkbox=page.getByRole('checkbox',{name,exact:true});await checkbox.waitFor({timeout:60000});assert.equal(await checkbox.isChecked(),false);
    await checkbox.check();await page.getByRole('button',{name:'Ver cambios',exact:true}).click();
    await page.getByRole('heading',{name:'Vista previa de permisos',exact:true}).waitFor({timeout:60000});
    await page.screenshot({path:path.join(folder,'connector-bot-preview.png'),fullPage:true});
    await page.getByRole('button',{name:'Aplicar permisos',exact:true}).click();
    await page.getByText('Permisos guardados y verificados en OpenMausBot.',{exact:true}).waitFor({timeout:90000});
    const bot=(await native('bots')).bots.find(b=>b.id===botId);assert.deepEqual(bot.toolScope,{allow:['native:*',`mcp:${name}:*`]});
    await page.setViewportSize({width:390,height:844});await card.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(folder,'connectors-mobile.png')});
    await page.setViewportSize({width:1440,height:1100});await page.getByRole('button',{name:'EN',exact:true}).first().click();
    await page.getByRole('heading',{name:'Connectors',exact:true}).waitFor();
    await card.getByRole('button',{name:'Remove',exact:true}).click();await page.getByRole('button',{name:'Confirm removal',exact:true}).click();
    await card.waitFor({state:'detached'});assert.equal((await native('mcp/servers')).servers.some(server=>server.name===name),false);createdServer=false;
    // Fail one read: stale MCP state must disappear while the app catalog remains usable.
    await page.route('**/api/omb/mcp/servers',route=>route.request().method()==='GET'?route.fulfill({status:503,json:{error:'fixture'}}):route.continue());
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Could not read MCP servers.'}).waitFor();
    assert.deepEqual(errors,[]);assert.ok(statuses.includes(200));
    console.log(JSON.stringify({mode:'real local panel → Caddy → OMB/Dagu',catalog:true,create:true,nativeProbe:true,toggle:true,versionedBotAssignment:true,nativeAccessRestriction:true,delete:true,english:true,mobileOverflow:false,readFailure:true,pageErrors:0,screenshots:3,externalOAuth:'not exercised'}));
  } finally {
    if(browser)await browser.close();
    if(createdServer)await native(`mcp/servers/${name}`,'DELETE');
    if(botId)await action({OP:'apply',PLAN_ID:(await plan('delete',null,botId)).planId});
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
