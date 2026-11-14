// Isolated, real Dagu+Caddy+Tinyauth browser history smoke. No user profiles,
// services, credentials or global mise trust are used. All identifiers are fixtures.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const required=['FYSO_TEST_SOURCE','FYSO_TEST_DAGU','FYSO_TEST_CADDY','FYSO_TEST_TINYAUTH','FYSO_TEST_CHROME','FYSO_TEST_NODE_DIR','FYSO_TEST_YAML_DIR','FYSO_TEST_ARTIFACT_DIR'];
for(const key of required)if(!process.env[key])throw Error(`Set ${key} for the isolated fixture`);
const source=path.resolve(process.env.FYSO_TEST_SOURCE), root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-hr-history-gateway-'));
const profile=path.join(root,'browser-profile'),artifacts=process.env.FYSO_TEST_ARTIFACT_DIR;
const children=[];let browser;
async function block(){
  for(let attempt=0;attempt<50;attempt++){
    const base=40000+Math.floor(Math.random()*1800)*10, sockets=[];
    try{for(let offset=0;offset<10;offset++)await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(base+offset,'127.0.0.1',()=>{sockets.push(s);resolve();});});return base;}
    catch{}finally{await Promise.all(sockets.map(s=>new Promise(resolve=>s.close(resolve))));}
  }throw Error('No free isolated port block');
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(fn,label){for(let i=0;i<150;i++){try{const value=await fn();if(value)return value;}catch{}await pause(100);}throw Error(`Timed out: ${label}`);}
function start(name,exe,args,env){const fd=fs.openSync(path.join(root,`${name}.log`),'w',0o600);const child=spawn(exe,args,{cwd:root,env,stdio:['ignore',fd,fd],detached:true});fs.closeSync(fd);children.push(child);return child;}
function exec(exe,args,options){const result=spawnSync(exe,args,{encoding:'utf8',...options});if(result.status!==0)throw Error(`Fixture setup failed: ${path.basename(exe)}`);return result.stdout;}
function terminate(child){try{process.kill(-child.pid,'SIGTERM');}catch{}}
(async()=>{
 try{
  const base=await block(), domain=`history-${base}.localhost`, http=base+1, password='fixture-local-password-43', technical='fixture-service-password';
  for(const folder of ['project/auth','project/bots','project/apps','project/workflows','extensions','data/panel','runtime','caddy-config','caddy-data'])fs.mkdirSync(path.join(root,folder),{recursive:true});
  fs.cpSync(path.join(source,'template/framework/extensions/human-requests/extensions/human-requests'),path.join(root,'extensions/human-requests'),{recursive:true});
  fs.copyFileSync(path.join(source,'template/framework/extensions/human-requests/project/workflows/ext-human-requests-request.yaml'),path.join(root,'project/workflows/ext-human-requests-request.yaml'));
  fs.copyFileSync(path.join(source,'template/Caddyfile'),path.join(root,'Caddyfile'));
  fs.writeFileSync(path.join(root,'project/auth/tinyauth.yaml'),fs.readFileSync(path.join(source,'template/project/auth/tinyauth.yaml.jinja'),'utf8').replaceAll('{{ admin_user }}','admin'));
  fs.writeFileSync(path.join(root,'project/bots/team.yaml'),'{}\n');
  const hash=exec(process.env.FYSO_TEST_CADDY,['hash-password','--bcrypt-cost','4'],{input:password}).trim();
  const testPath=[process.env.FYSO_TEST_NODE_DIR,process.env.FYSO_TEST_YAML_DIR,'/usr/bin','/bin'].join(path.delimiter);
  const daguAuth='Basic '+Buffer.from(`fixture:${technical}`).toString('base64');
  const env={HOME:process.env.HOME,PATH:testPath,LANG:'en_US.UTF-8',USER:process.env.USER,FYSO_ROOT:root,FYSO_DATA:path.join(root,'data'),FYSO_WEB_DOMAIN:domain,FYSO_HTTP_PORT:String(base),FYSO_AUTH_PORT:String(base+9),FYSO_AUTH_USERS:`admin:${hash}`,FYSO_ADMIN_USER:'fixture',FYSO_ADMIN_PASSWORD:technical,FYSO_DAGU_PORT:String(http),FYSO_OMB_PORT:String(base+4),FYSO_WEB_SCHEME:'http',FYSO_WEB_PORT_SUFFIX:`:${base}`,FYSO_AUTH_UPSTREAM:`127.0.0.1:${base+9}`,FYSO_CADDY_ADMIN_PORT:String(base+8),FYSO_BIND:'127.0.0.1',FYSO_CONNECTOR_SETUP_SOCKET:path.join(root,'unused-setup.sock'),FYSO_MCP_SOCKET:path.join(root,'unused-mcp.sock'),FYSO_DAGU_AUTH:daguAuth,FYSO_OMB_TOKEN:'fixture-only',FYSO_PANEL_ROOT:path.join(source,'template/framework/panel/dist'),XDG_CONFIG_HOME:path.join(root,'caddy-config'),XDG_DATA_HOME:path.join(root,'caddy-data')};
  exec(path.join(process.env.FYSO_TEST_NODE_DIR,'node'),[path.join(source,'template/framework/scripts/web-auth-config.cjs')],{env,cwd:root});
  const daguEnv={...env,DAGU_HOME:path.join(root,'dagu'),DAGU_DAGS_DIR:path.join(root,'project/workflows'),DAGU_HOST:'127.0.0.1',DAGU_PORT:String(http),DAGU_SCHEDULER_PORT:String(base+2),DAGU_WORKER_HEALTH_PORT:String(base+3),DAGU_COORDINATOR_HOST:'127.0.0.1',DAGU_COORDINATOR_PORT:String(base+6),DAGU_COORDINATOR_HEALTH_PORT:String(base+7),DAGU_PEER_INSECURE:'true',DAGU_AUTH_MODE:'basic',DAGU_AUTH_BASIC_USERNAME:'fixture',DAGU_AUTH_BASIC_PASSWORD:technical,DAGU_ENV_PASSTHROUGH_PREFIXES:'FYSO_'};
  start('dagu',process.env.FYSO_TEST_DAGU,['start-all'],daguEnv);
  start('auth',process.env.FYSO_TEST_TINYAUTH,[],{...env,TINYAUTH_CONFIGFILE:path.join(root,'data/web-auth/runtime/config.yaml')});
  start('caddy',process.env.FYSO_TEST_CADDY,['run','--config',path.join(root,'Caddyfile')],env);
  const apiBase=`http://127.0.0.1:${http}/api/v1`,auth='Basic '+Buffer.from(`fixture:${technical}`).toString('base64');
  const call=async(endpoint,body)=>{const res=await fetch(apiBase+endpoint,{method:body?'POST':'GET',headers:{Authorization:auth,...(body&&{'Content-Type':'application/json'})},...(body&&{body:JSON.stringify(body)}),signal:AbortSignal.timeout(4000)});if(!res.ok)throw Error(`Dagu fixture API ${res.status}`);return res.json();};
  await wait(async()=>(await fetch(apiBase+'/health',{headers:{Authorization:auth}})).ok,'Dagu');
  const workflow='ext-human-requests-request',choices='choices-hex='+Buffer.from(JSON.stringify(['Sí','No'])).toString('hex');
  async function create(id,question){await call(`/dags/${workflow}/start`,{dagRunId:id,labels:[choices,'assignee=team'],params:JSON.stringify({QUESTION:question,CONTEXT:'Agente de prueba: revisar una propuesta ficticia. Sí prepara revisión; No detiene la propuesta.',ORIGIN_TYPE:'none'})});await wait(async()=>String((await call(`/dag-runs/${workflow}/${id}`)).dagRunDetails.statusLabel).toLowerCase()==='waiting',id);}
  await create('invalid-history','Pregunta inválida de prueba');
  await call(`/dag-runs/${workflow}/invalid-history/human-tasks/ask/complete`,{answer:'fuera',comment:'',responder:'fixture',decision:'answered'});
  await wait(async()=>String((await call(`/dag-runs/${workflow}/invalid-history`)).dagRunDetails.statusLabel).toLowerCase()==='failed','invalid response');
  await create('valid-history','Pregunta válida de prueba');
  const gateway=`http://panel.${domain}:${base}`;
  await wait(async()=>{const res=await fetch(gateway,{redirect:'manual'});return [401,302,403].includes(res.status);},'gateway');
  browser=await chromium.launchPersistentContext(profile,{executablePath:process.env.FYSO_TEST_CHROME,headless:true,locale:'es-AR',viewport:{width:1280,height:950},args:['--no-first-run','--no-default-browser-check']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.name));page.on('console',message=>{if(message.type()==='error')errors.push('console error');});
  const completionPath=`/api/dagu/dag-runs/${workflow}/valid-history/human-tasks/ask/complete`;
  await page.goto(`${gateway}/extensions/human-requests/panel/index.html?mock=ready&lang=es`);
  await page.locator('input[name="username"]').fill('admin');await page.locator('input[name="password"]').fill(password);
  const login=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/user/login'&&response.request().method()==='POST');
  await page.locator('button[type="submit"]').click();assert.equal((await login).status(),200);
  await page.waitForURL(url=>url.hostname===`panel.${domain}`);
  await page.getByText('Pregunta válida de prueba',{exact:false}).first().waitFor();
  const invalidCard=page.locator('.pending-history-item').filter({hasText:'Pregunta inválida de prueba'});await invalidCard.locator('summary').click();
  await invalidCard.getByText('La respuesta guardada o las opciones no son válidas.',{exact:false}).waitFor();
  await invalidCard.getByText('fuera',{exact:true}).waitFor();
  fs.mkdirSync(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,'history-invalid-before.png'),fullPage:true});
  await page.getByLabel('Tu respuesta (Obligatorio)').selectOption('Sí');await page.getByLabel('Tu nombre (Obligatorio)').fill('Persona de prueba');
  const completion=page.waitForResponse(response=>new URL(response.url()).pathname===completionPath&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Enviar respuesta'}).click();assert.equal((await completion).status(),200);
  await page.getByText('Respuesta guardada.',{exact:false}).waitFor();
  await page.locator('.pending-result').getByText('El paso de entrega terminó.',{exact:false}).waitFor({timeout:20000});
  await page.reload();
  const validCard=page.locator('.pending-history-item').filter({hasText:'Pregunta válida de prueba'});await validCard.locator('summary').click();
  await validCard.getByText('El paso de entrega terminó.',{exact:false}).waitFor();
  await validCard.getByText('Sí',{exact:true}).waitFor();
  await validCard.getByText('Persona de prueba',{exact:true}).waitFor();
  await validCard.getByText('Respondida',{exact:true}).waitFor();
  await page.screenshot({path:path.join(artifacts,'history-after-refresh.png'),fullPage:true});
  assert.deepEqual(errors,[],'fixture UI should have no page or console errors');
  console.log(JSON.stringify({login:200,completion:200,validHistoryAfterRefresh:true,recordedAnswerAndResponder:true,invalidAnswerHistory:true,pageAndConsoleErrors:errors.length,workflowOrigin:'none'}));
 }finally{
  if(browser)await browser.close();for(const child of children.reverse())terminate(child);await pause(500);
  fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
