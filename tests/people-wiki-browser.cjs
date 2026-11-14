// Disposable Dagu wiki + panel browser flow. No login service or external data.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const dagu=process.env.FYSO_TEST_DAGU,chrome=process.env.FYSO_TEST_CHROME;
if(!dagu||!chrome)throw Error('Set FYSO_TEST_DAGU and FYSO_TEST_CHROME');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-people-')), dist=path.resolve(__dirname,'../template/framework/panel/dist');
const port=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let child,browser,server;try{
 const ports=new Set();while(ports.size<5)ports.add(await port());const [api,scheduler,worker,coordinator,health]=ports;
 const env={HOME:process.env.HOME,USER:process.env.USER,PATH:'/usr/bin:/bin',TMPDIR:root,XDG_CONFIG_HOME:path.join(root,'config'),XDG_DATA_HOME:path.join(root,'xdg-data'),DAGU_HOME:path.join(root,'dagu'),DAGU_DAGS_DIR:path.join(root,'dags'),DAGU_WIKI_DIR:path.join(root,'wiki'),DAGU_HOST:'127.0.0.1',DAGU_PORT:String(api),DAGU_SCHEDULER_PORT:String(scheduler),DAGU_WORKER_HEALTH_PORT:String(worker),DAGU_COORDINATOR_HOST:'127.0.0.1',DAGU_COORDINATOR_PORT:String(coordinator),DAGU_COORDINATOR_HEALTH_PORT:String(health),DAGU_AUTH_MODE:'none'};
 child=spawn(dagu,['start-all'],{env,cwd:root,stdio:'ignore',detached:true});
 function owned(){const x=spawnSync('/usr/sbin/lsof',['-nP','-t',`-iTCP:${api}`,'-sTCP:LISTEN'],{encoding:'utf8'});const ids=x.stdout.trim().split(/\s+/).filter(Boolean).map(Number);return ids.length>0&&ids.every(id=>Number(spawnSync('/bin/ps',['-o','pgid=','-p',String(id)],{encoding:'utf8'}).stdout.trim())===child.pid)}
 for(let i=0;i<100&&!owned();i++){if(child.exitCode!==null)throw Error('Fixture Dagu exited');await pause(100)}if(!owned())throw Error('Fixture Dagu port not owned');
 server=http.createServer(async(req,res)=>{try{
  if(req.url.startsWith('/api/dagu/')){if(!owned())throw Error('Fixture listener changed');const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const result=await fetch(`http://127.0.0.1:${api}/api/v1/${req.url.slice('/api/dagu/'.length)}`,{method:req.method,headers:{'content-type':'application/json'},...(body.length?{body}:{})});if(result.status>=400)console.error('fixture Dagu status',result.status,req.url);res.writeHead(result.status,{'content-type':result.headers.get('content-type')||'application/json'});return res.end(Buffer.from(await result.arrayBuffer()));}
  const pathname=new URL(req.url,'http://localhost').pathname,rel=pathname==='/'?'index.html':pathname.slice(1);if(rel.includes('..'))throw Error('Invalid path');const file=path.join(dist,rel);const data=fs.readFileSync(file);res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.woff2')?'font/woff2':'application/octet-stream'});res.end(data);
 }catch{res.writeHead(500);res.end();}});
 await new Promise((resolve,reject)=>{server.on('error',reject);server.listen(0,'127.0.0.1',resolve)});
 browser=await chromium.launchPersistentContext(path.join(root,'profile'),{executablePath:chrome,headless:true,locale:'es-AR',viewport:{width:1280,height:900},env});const page=await browser.newPage(),errors=[];page.on('pageerror',()=>errors.push('pageerror'));
 await page.goto(`http://127.0.0.1:${server.address().port}/?mock=ready&lang=es#/people`);await page.getByRole('heading',{name:'Personas'}).waitFor();await page.getByText('Todavía no hay personas.').waitFor();
 await page.getByRole('button',{name:'Agregar persona'}).click();await page.getByLabel('Nombre',{exact:true}).fill('Ana de prueba');await page.getByRole('button',{name:'Guardar'}).click();await page.getByText('Ana de prueba',{exact:true}).waitFor();
 const first=await page.locator('.people-row small').innerText();await page.getByRole('button',{name:'Editar'}).click();await page.getByLabel('Nombre',{exact:true}).fill('Ana actualizada');await page.getByRole('button',{name:'Guardar'}).click();await page.getByText('Ana actualizada',{exact:true}).waitFor();assert.equal(await page.locator('.people-row small').innerText(),first);
 await page.reload();await page.getByText('Ana actualizada',{exact:true}).waitFor();if(process.env.FYSO_TEST_SCREENSHOT)await page.screenshot({path:process.env.FYSO_TEST_SCREENSHOT,fullPage:true});
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Eliminar'}).click();await page.getByText('Todavía no hay personas.').waitFor();assert.deepEqual(errors,[]);console.log('PASS: create, list, edit, reload and delete using real isolated Dagu wiki');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));if(child&&child.exitCode===null){try{process.kill(-child.pid,'SIGTERM')}catch{}await new Promise(r=>{child.once('exit',r);setTimeout(r,3000).unref()})}fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1});
