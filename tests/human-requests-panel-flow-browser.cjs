// Synthetic end-user flow; a disposable browser profile and local mock APIs.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const chrome=process.env.FYSO_TEST_CHROME,assets=process.env.FYSO_TEST_PANEL_ASSETS;
if(!chrome||!assets)throw Error('Set FYSO_TEST_CHROME and FYSO_TEST_PANEL_ASSETS');
const panel=path.resolve(__dirname,'../template/framework/extensions/human-requests/extensions/human-requests/panel');
const workflow='ext-human-requests-request',run='browser-fictional';
const card={v:1,request:{title:'¿Qué tono usamos?',requester:'Agente de prueba',doing:'Preparando un saludo.',needs:'Elegir un tono.',if_silent:'El saludo queda pendiente.',options:[{choice:'Cálido',effect:'Saludo cercano.'},{choice:'Formal',effect:'Saludo sobrio.'}]},thread:[],canAsk:true,blocking:true,recipient:'team'};
let question,decision;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');const reply=value=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname==='/api/dagu/wiki')return reply({items:[],pagination:{hasNextPage:false}});
  if(url.pathname==='/api/dagu/dag-runs')return reply({dagRuns:url.searchParams.has('status')&&!decision?[{name:workflow,dagRunId:run,statusLabel:'waiting',labels:['assignee=team','blocking=true']}]:[]});
  if(url.pathname.endsWith('/human-tasks/ask/push-back')){let body='';req.on('data',x=>body+=x);req.on('end',()=>{question=JSON.parse(body);card.thread=[{question:question.HR_QUESTION,asker:question.HR_ASKER,answer:'Cálido es cercano; formal es sobrio.'}];reply({ok:true});});return;}
  if(url.pathname.endsWith('/human-tasks/ask/complete')){let body='';req.on('data',x=>body+=x);req.on('end',()=>{decision=JSON.parse(body);reply({ok:true});});return;}
  if(url.pathname===`/api/dagu/dag-runs/${workflow}/${run}`)return reply({dagRunDetails:{statusLabel:decision?'succeeded':'waiting',nodes:[{statusLabel:decision?'succeeded':'waiting',approvalIteration:card.thread.length,step:{id:'ask',humanTask:{prompt:JSON.stringify(card)}}},{statusLabel:decision?'succeeded':'not_started',step:{id:'deliver'}}]}});
  const root=url.pathname.startsWith('/assets/')?assets:panel,rel=url.pathname.startsWith('/assets/')?url.pathname.slice(8):url.pathname.replace(/^\/extensions\/human-requests\/panel\//,'');
  if(!rel||rel.includes('..')){res.writeHead(404);return res.end();}
  try{const data=fs.readFileSync(path.join(root,rel));res.writeHead(200,{'Content-Type':rel.endsWith('.js')?'text/javascript':rel.endsWith('.css')?'text/css':rel.endsWith('.json')?'application/json':'text/html'});res.end(data);}catch{res.writeHead(404);res.end();}
});
(async()=>{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-hr-panel-'));let browser;
  try{
    browser=await chromium.launchPersistentContext(profile,{executablePath:chrome,headless:true,locale:'es-AR'});
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/extensions/human-requests/panel/index.html?mock=ready&lang=es`);
    await page.getByRole('heading',{name:'¿Qué tono usamos?'}).waitFor();
    await page.getByPlaceholder('Tu nombre').fill('Persona de prueba');
    await page.getByRole('button',{name:'Preguntar al agente'}).click();
    await page.getByLabel('Tu pregunta').fill('¿Qué diferencia hay?');
    await page.getByRole('button',{name:'Enviar pregunta'}).click();
    await page.getByText('Cálido es cercano; formal es sobrio.').waitFor();
    assert.deepEqual(question,{HR_QUESTION:'¿Qué diferencia hay?',HR_ASKER:'Persona de prueba'});assert.equal(decision,undefined);
    await page.getByLabel('Cálido',{exact:false}).check();await page.getByRole('button',{name:'Enviar decisión'}).click();
    await page.getByText('Decisión guardada.').waitFor();
    assert.deepEqual(decision,{decision:'answered',responder:'Persona de prueba',answer:'Cálido'});assert.deepEqual(errors,[]);
    console.log('PASS: person asks, reads reply and decides in the pending panel');
  }finally{await browser?.close();server.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1;server.close();});
