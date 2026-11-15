// Disposable generated project + actual panel/gateway. No mise, global trust,
// real users, OMB or external endpoints. Requires preinstalled pinned tools.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn,spawnSync,execFileSync}=require('node:child_process');
const required=['FYSO_TEST_SOURCE','FYSO_TEST_COPIER','FYSO_TEST_DAGU','FYSO_TEST_CADDY','FYSO_TEST_TINYAUTH','FYSO_TEST_CHROME','FYSO_TEST_NODE_DIR','FYSO_TEST_YAML_DIR','FYSO_TEST_ARTIFACT_DIR'];
for(const key of required) if(!process.env[key]) throw Error(`Set ${key}`);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-generated-gateway-')), source=path.join(root,'source'),project=path.join(root,'project');
const codeSource=path.resolve(process.env.FYSO_TEST_SOURCE), profile=path.join(root,'profile'), children=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function run(exe,args,opts={}){const p=spawnSync(exe,args,{encoding:'utf8',...opts});if(p.status!==0) throw Error(`Fixture setup failed: ${path.basename(exe)}`);return p.stdout;}
async function ports(){for(let i=0;i<50;i++){const base=40000+crypto.randomInt(1500)*10,held=[];try{for(let n=0;n<10;n++)await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(base+n,'127.0.0.1',()=>{held.push(s);resolve()})});return base}catch{}finally{await Promise.all(held.map(s=>new Promise(r=>s.close(r))))}}throw Error('No free fixture port block')}
function start(name,exe,args,env){const fd=fs.openSync(path.join(root,name+'.log'),'w',0o600);const p=spawn(exe,args,{cwd:project,env,stdio:['ignore',fd,fd],detached:true});fs.closeSync(fd);children.push(p);return p;}
function owns(port,group){const q=spawnSync('/usr/sbin/lsof',['-nP','-t',`-iTCP:${port}`,'-sTCP:LISTEN'],{encoding:'utf8'});const ids=q.stdout.trim().split(/\s+/).filter(Boolean).map(Number);if(!ids.length)return false;return ids.every(pid=>{const g=Number(execFileSync('/bin/ps',['-o','pgid=','-p',String(pid)],{encoding:'utf8'}).trim());return g===group});}
async function wait(fn,name){for(let i=0;i<160;i++){try{if(await fn())return}catch{}await pause(100)}throw Error(`Timed out: ${name}`)}
function members(group) {
 const rows=execFileSync('/bin/ps',['-axo','pid=,pgid='],{encoding:'utf8'}).trim().split(/\n/);
 return rows.map(line=>line.trim().split(/\s+/).map(Number)).filter(row=>row.length===2&&row[1]===group).map(row=>{try{return [...row,Number(execFileSync('/usr/bin/python3',['-c','import os,sys\ntry: print(os.getsid(int(sys.argv[1])))\nexcept ProcessLookupError: print(0)',String(row[0])],{encoding:'utf8'}).trim())]}catch{return [...row,-1]}}).filter(row=>row[2]!==0);
}
async function stop(child){
 const group=child.pid;
 if(!Number.isInteger(group)||group<=1||group===process.pid)throw Error('Invalid fixture group');
 const owned=()=>{const found=members(group);if(found.some(row=>row[2]!==group))throw Error('Fixture session mismatch');return found};
 if(!owned().length)return;
 try{process.kill(-group,'SIGTERM')}catch(e){if(e.code!=='ESRCH')throw e}
 for(let i=0;i<50;i++){if(!owned().length)return;await pause(100)}
 if(owned().length){try{process.kill(-group,'SIGKILL')}catch(e){if(e.code!=='ESRCH')throw e}}
 for(let i=0;i<50;i++){if(!owned().length)return;await pause(100)}
 throw Error('Fixture process group failed to stop; preserving data');
}
(async()=>{let browser, clean=false;try{
 const base=await ports(),domain=`generated-${base}.localhost`,http=base+1,technical='fixture-service-password',password='fixture-web-password-43',cancel=process.env.FYSO_TEST_CANCEL==='1';
 const runId='hr-'+crypto.randomUUID().replaceAll('-',''),workflow='ext-human-requests-request';
 const digest=crypto.createHash('md5').update(workflow+runId).digest('hex').slice(0,6),socket=path.join(fs.realpathSync('/tmp'),`@dagu_${workflow}_${digest}.sock`);
 try{fs.lstatSync(socket);throw Error('Fixture Dagu socket occupied')}catch(e){if(e.code!=='ENOENT')throw e}
 fs.mkdirSync(source);fs.copyFileSync(path.join(codeSource,'copier.yml'),path.join(source,'copier.yml'));
 fs.cpSync(path.join(codeSource,'template'),path.join(source,'template'),{recursive:true,filter:p=>!['node_modules','__pycache__'].includes(path.basename(p))});
 const baseEnv={HOME:process.env.HOME,USER:process.env.USER,LOGNAME:process.env.LOGNAME,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',XDG_CONFIG_HOME:path.join(root,'xdg-config'),XDG_DATA_HOME:path.join(root,'xdg-data'),XDG_STATE_HOME:path.join(root,'xdg-state'),XDG_CACHE_HOME:path.join(root,'xdg-cache'),TMPDIR:root,NO_PROXY:'*',no_proxy:'*'};
 assert.match(run(process.env.FYSO_TEST_COPIER,['--version'],{env:baseEnv}),/9\.19\.1/);
 run(process.env.FYSO_TEST_COPIER,['copy','--defaults','-d','project_name=Human Request Test','-d','project_slug=human-request-test','-d',`port_base=${base}`,source,project],{env:baseEnv});
 run(process.env.FYSO_TEST_COPIER,['copy','--defaults','./framework/extensions/human-requests','.'],{cwd:project,env:baseEnv});
 const dagDir=path.join(root,'dags');fs.mkdirSync(dagDir);fs.copyFileSync(path.join(project,'project/workflows',workflow+'.yaml'),path.join(dagDir,workflow+'.yaml'));
 const hash=run(process.env.FYSO_TEST_CADDY,['hash-password','--bcrypt-cost','4'],{input:password});
 const node=path.join(process.env.FYSO_TEST_NODE_DIR,'node'),env={...baseEnv,PATH:[process.env.FYSO_TEST_NODE_DIR,process.env.FYSO_TEST_YAML_DIR,'/usr/bin','/bin'].join(path.delimiter),FYSO_ROOT:project,FYSO_DATA:path.join(project,'.data'),FYSO_PROJECT:'human-request-test',FYSO_PROJECT_NAME:'Human Request Test',FYSO_WEB_DOMAIN:domain,FYSO_HTTP_PORT:String(base),FYSO_AUTH_PORT:String(base+9),FYSO_AUTH_USERS:`admin:${hash.trim()}`,FYSO_ADMIN_USER:'fixture',FYSO_ADMIN_PASSWORD:technical,FYSO_DAGU_PORT:String(http),FYSO_OMB_PORT:String(base+4),FYSO_WEB_SCHEME:'http',FYSO_WEB_PORT_SUFFIX:`:${base}`,FYSO_AUTH_UPSTREAM:`127.0.0.1:${base+9}`,FYSO_CADDY_ADMIN_PORT:String(base+8),FYSO_BIND:'127.0.0.1',FYSO_CONNECTOR_SETUP_SOCKET:path.join(root,'unused-setup.sock'),FYSO_MCP_SOCKET:path.join(root,'unused-mcp.sock'),FYSO_DAGU_AUTH:'Basic '+Buffer.from(`fixture:${technical}`).toString('base64'),FYSO_OMB_TOKEN:'fixture-only',FYSO_PANEL_ROOT:path.join(project,'framework/panel/dist')};
 run(node,['framework/scripts/panel-data.cjs','config'],{env,cwd:project});
 const inventory=JSON.parse(fs.readFileSync(path.join(project,'.data/panel/extensions.json')));assert.ok(inventory.some(x=>x.id==='human-requests'&&x.pages.some(p=>p.id==='pending')));
 run(node,['framework/scripts/web-auth-config.cjs'],{env,cwd:project});
 const daguEnv={...env,DAGU_HOME:path.join(root,'dagu'),DAGU_DAGS_DIR:dagDir,DAGU_WIKI_DIR:path.join(project,'project/wiki'),DAGU_HOST:'127.0.0.1',DAGU_PORT:String(http),DAGU_SCHEDULER_PORT:String(base+2),DAGU_WORKER_HEALTH_PORT:String(base+3),DAGU_COORDINATOR_HOST:'127.0.0.1',DAGU_COORDINATOR_PORT:String(base+6),DAGU_COORDINATOR_HEALTH_PORT:String(base+7),DAGU_PEER_INSECURE:'true',DAGU_AUTH_MODE:'basic',DAGU_AUTH_BASIC_USERNAME:'fixture',DAGU_AUTH_BASIC_PASSWORD:technical,DAGU_ENV_PASSTHROUGH_PREFIXES:'FYSO_'};
 const dagu=start('dagu',process.env.FYSO_TEST_DAGU,['start-all'],daguEnv),auth=start('auth',process.env.FYSO_TEST_TINYAUTH,[],{...env,TINYAUTH_CONFIGFILE:path.join(project,'.data/web-auth/runtime/config.yaml')}),caddy=start('caddy',process.env.FYSO_TEST_CADDY,['run','--config',path.join(project,'Caddyfile')],env);
 await wait(()=>owns(http,dagu.pid)&&owns(base+9,auth.pid)&&owns(base,caddy.pid),'owned listeners');
 if(process.env.FYSO_TEST_FAIL_AFTER_START==='1')throw Error('Intentional early fixture failure');
 const assertOwned=()=>{if(!owns(http,dagu.pid)||!owns(base+9,auth.pid)||!owns(base,caddy.pid))throw Error('Fixture listener ownership changed')};
 const apiBase=`http://127.0.0.1:${http}/api/v1`,authorization=env.FYSO_DAGU_AUTH;
 const call=async(endpoint,body)=>{assertOwned();const r=await fetch(apiBase+endpoint,{method:body?'POST':'GET',headers:{Authorization:authorization,...(body&&{'content-type':'application/json'})},...(body&&{body:JSON.stringify(body)}),signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error(`Dagu status ${r.status}`);return r.json()};
 await wait(async()=>{try{return !!(await call('/health'))}catch{return false}},'Dagu health');
 assertOwned();try{fs.lstatSync(socket);throw Error('Fixture Dagu socket became occupied')}catch(e){if(e.code!=='ENOENT')throw e}
 await call(`/dags/${workflow}/start`,{dagRunId:runId,labels:['assignee=team'],params:JSON.stringify({REQUEST:JSON.stringify({title:'Pregunta sintética de proyecto generado',requester:'Agente de prueba',doing:'Revisar una propuesta ficticia.',needs:'Una decisión.',if_silent:'No pasa nada.'}),ORIGIN_TYPE:'none'})});
 const detail=`/dag-runs/${workflow}/${runId}`;await wait(async()=>String((await call(detail)).dagRunDetails.statusLabel).toLowerCase()==='waiting','waiting request');
 browser=await chromium.launchPersistentContext(profile,{executablePath:process.env.FYSO_TEST_CHROME,headless:true,locale:'es-AR',viewport:{width:1280,height:950},env:{...baseEnv}});
 const page=await browser.newPage(),errors=[];page.on('pageerror',()=>errors.push('pageerror'));
 await page.route('**/*',async route=>{try{const req=route.request(),url=new URL(req.url());if(url.protocol!=='http:'||!url.hostname.endsWith(`.${domain}`)||url.port!==String(base)||!owns(base,caddy.pid))throw Error('Outside fixture');if(req.method()!=='GET'||url.pathname.startsWith('/api/dagu/'))assertOwned();await route.continue()}catch{await route.abort()}});
 const gateway=`http://panel.${domain}:${base}`;assertOwned();await page.goto(gateway);
 await page.locator('input[name=username]').fill('admin');await page.locator('input[name=password]').fill(password);
 const login=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/login'&&r.request().method()==='POST');await page.locator('button[type=submit]').click();assert.equal((await login).status(),200);
 await page.waitForURL(url=>url.hostname===`panel.${domain}`,{waitUntil:'domcontentloaded'});
 if(process.env.FYSO_TEST_PEOPLE==='1'){
  await page.getByRole('link',{name:'Personas'}).click();
  const people=page.frameLocator('iframe');
  await people.getByRole('button',{name:'Agregar persona'}).click();await people.getByLabel('Nombre',{exact:true}).fill('Persona ficticia');await people.getByRole('button',{name:'Guardar'}).click();
  await people.getByText('Persona ficticia',{exact:true}).waitFor();const identity=await people.locator('.people-row small').innerText();
  await people.getByRole('button',{name:'Editar',exact:true}).click();await people.getByLabel('Nombre',{exact:true}).fill('Persona ficticia editada');await people.getByRole('button',{name:'Guardar'}).click();
  await people.getByText('Persona ficticia editada',{exact:true}).waitFor();assert.equal(await people.locator('.people-row small').innerText(),identity);
  await page.reload();await people.getByText('Persona ficticia editada',{exact:true}).waitFor();
  const directory=path.join(project,'project/wiki/fyso-people');assert.equal(fs.readdirSync(directory).filter(x=>x.endsWith('.md')).length,1);
  fs.mkdirSync(process.env.FYSO_TEST_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.FYSO_TEST_ARTIFACT_DIR,'generated-people.png'),fullPage:true});
  await people.getByRole('button',{name:'Eliminar',exact:true}).click();await people.getByRole('button',{name:'Sí, eliminar',exact:true}).click();await people.getByText('Todavía no hay personas.').waitFor();assert.ok(!fs.existsSync(directory)||fs.readdirSync(directory).filter(x=>x.endsWith('.md')).length===0);
 }
 try{await page.getByRole('link',{name:'Pendientes'}).click()}catch(error){fs.mkdirSync(process.env.FYSO_TEST_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.FYSO_TEST_ARTIFACT_DIR,'generated-gateway-navigation-error.png'),fullPage:true});throw error}
 fs.mkdirSync(process.env.FYSO_TEST_ARTIFACT_DIR,{recursive:true});
 const frame=page.frameLocator('iframe');await frame.getByRole('heading',{name:'Pregunta sintética de proyecto generado'}).waitFor();
 fs.mkdirSync(process.env.FYSO_TEST_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.FYSO_TEST_ARTIFACT_DIR,'generated-gateway-pending.png'),fullPage:true});
 await frame.getByPlaceholder('Tu nombre').fill('Persona de prueba');
 if(!cancel)await frame.getByLabel('Tu respuesta',{exact:true}).fill('Aprobado');
 else await frame.getByRole('button',{name:'Cancelar solicitud'}).click();
 const completion=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(`/${runId}/human-tasks/ask/complete`)&&r.request().method()==='POST');await frame.getByRole('button',{name:cancel?'Sí, cancelar':'Enviar decisión'}).click();assert.equal((await completion).status(),200);
 await frame.getByText(cancel?'Solicitud cancelada.':'Decisión guardada.',{exact:false}).waitFor();await wait(async()=>String((await call(detail)).dagRunDetails.statusLabel).toLowerCase()==='succeeded','finished');
 const outputs=(await call(detail+'/outputs')).outputs,hrCard=JSON.parse(outputs.hrCard);delete outputs.hrCard;
 assert.equal(hrCard.request.title,'Pregunta sintética de proyecto generado');
 assert.deepEqual(outputs,{answer:cancel?'':'Aprobado',comment:'',responder:'Persona de prueba',decision:cancel?'cancelled':'answered'});
 await page.reload();const card=frame.locator('.pending-history-item').filter({hasText:'Pregunta sintética de proyecto generado'});try{await card.locator('summary').click()}catch(error){await page.screenshot({path:path.join(process.env.FYSO_TEST_ARTIFACT_DIR,'generated-gateway-history-error.png'),fullPage:true});throw error}await card.getByText(cancel?'Cancelada':'Aprobado',{exact:true}).waitFor();
 await page.screenshot({path:path.join(process.env.FYSO_TEST_ARTIFACT_DIR,cancel?'generated-gateway-cancelled.png':'generated-gateway-history.png'),fullPage:true});assert.deepEqual(errors,[]);
 console.log(JSON.stringify({copier:'9.19.1',generatedInventory:true,panelIframe:true,login:200,completion:200,outputs:true,historyAfterRefresh:true,peopleCrud:process.env.FYSO_TEST_PEOPLE==='1',pageErrors:errors.length,decision:cancel?'cancelled':'answered',origin:'none'}));clean=true;
 }finally{if(browser)await browser.close();let cleanupError;for(const child of children.reverse()){try{await stop(child)}catch(e){cleanupError=cleanupError||e}}if(cleanupError)throw cleanupError;if(children.length)console.log('Fixture process groups stopped');if(clean)fs.rmSync(root,{recursive:true,force:true});else console.error('Fixture retained for safe diagnostics');}
})().catch(e=>{console.error(e.message);process.exitCode=1});
