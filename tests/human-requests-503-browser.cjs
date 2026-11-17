const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const panel=path.resolve(__dirname,'../template/framework/extensions/human-requests/extensions/human-requests/panel');
const assets=process.env.FYSO_TEST_PANEL_ASSETS;
const root=process.env.FYSO_503_ROOT, daguPort=Number(process.env.FYSO_TEST_DAGU_PORT);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/dagu/')) {
   const target=http.request({hostname:'127.0.0.1',port:daguPort,path:'/api/v1/'+url.pathname.slice('/api/dagu/'.length)+url.search,method:req.method,headers:{...req.headers,host:`127.0.0.1:${daguPort}`}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});target.on('error',()=>{res.writeHead(502);res.end()});req.pipe(target);return;
 }
 const base=url.pathname.startsWith('/assets/')?assets:panel;
 const rel=url.pathname.startsWith('/assets/')?url.pathname.slice(8):url.pathname.replace(/^\/extensions\/human-requests\/panel\//,'');
 if(!rel||rel.includes('..')){res.writeHead(404);return res.end()}
 try{const file=path.join(base,rel),body=fs.readFileSync(file);res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});res.end(body)}catch{res.writeHead(404);res.end()}
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const profile=fs.mkdtempSync(path.join(os.tmpdir(),'hr503-'));let browser;
try{
 browser=await chromium.launchPersistentContext(profile,{executablePath:process.env.FYSO_TEST_CHROME,headless:true,viewport:{width:1280,height:900},locale:'es-AR'});
 const page=await browser.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/extensions/human-requests/panel/index.html?mock=ready&lang=es`);
 const card=page.locator('.pending-card').filter({hasText:'Prueba ficticia de recuperación'});
 await card.getByText('La respuesta está guardada, pero no se pudo reanudar la solicitud.').waitFor();
 await page.screenshot({path:path.join(root,'before.png')});
 fs.unlinkSync(path.join(root,'dagu/data/queue'));fs.renameSync(path.join(root,'queue-backup'),path.join(root,'dagu/data/queue'));
 const response=page.waitForResponse(r=>r.url().endsWith('/human-tasks/resume')&&r.request().method()==='POST');
 await card.getByRole('button',{name:'Reintentar reanudación'}).click(); assert.equal((await response).status(),200);
 await card.getByText('Se solicitó la reanudación.',{exact:false}).waitFor();await page.screenshot({path:path.join(root,'after.png')});
 let data;for(let i=0;i<100;i++){const r=await fetch(`http://127.0.0.1:${daguPort}/api/v1/dag-runs/ext-human-requests-request/recovery-ui`);data=(await r.json()).dagRunDetails;if(data.statusLabel==='succeeded'||data.statusLabel==='failed')break;await new Promise(r=>setTimeout(r,100));}
 const outputs=await (await fetch(`http://127.0.0.1:${daguPort}/api/v1/dag-runs/ext-human-requests-request/recovery-ui/outputs`)).json();
 console.log(JSON.stringify({resumeHttp:200,status:data.statusLabel,steps:data.nodes.map(n=>[n.step.id,n.statusLabel]),answer:outputs.outputs?.answer,responder:outputs.outputs?.responder,pageErrors:errors}));
 assert.equal(data.statusLabel,'succeeded');assert.equal(outputs.outputs.answer,'aprobado');assert.equal(outputs.outputs.responder,'Persona de prueba');assert.equal(errors.length,0);
 }finally{await browser?.close();fs.rmSync(profile,{recursive:true,force:true});server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
