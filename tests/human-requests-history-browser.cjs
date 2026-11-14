// Synthetic browser smoke. Requires an installed Playwright and Chrome; no real
// credentials, services, or user browser profile are accessed.
const {chromium} = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const chrome = process.env.FYSO_TEST_CHROME, assets = process.env.FYSO_TEST_PANEL_ASSETS;
if (!chrome || !assets) throw Error('Set FYSO_TEST_CHROME and FYSO_TEST_PANEL_ASSETS for the isolated browser fixture');
const panel = path.resolve(__dirname,'../template/framework/extensions/human-requests/extensions/human-requests/panel');
const workflow = 'ext-human-requests-request';
const answer = {type:'string',title:'Answer',default:''}, responder = {type:'string',title:'Responder',default:''};
const form = {properties:{answer,responder,decision:{type:'string',default:'answered',enum:['answered','cancelled','expired']}},required:['decision']};
const ask = status => ({statusLabel:status,step:{id:'ask',humanTask:{prompt:'Agent: test. Question: continue? Approve: review only. Decline: stop.',form}}});
const deliver = (status,error='') => ({statusLabel:status,error,step:{id:'deliver'}});
let submitted = false, outputReads = 0, afterSubmitLists = 0; const uncertain=process.env.FYSO_TEST_503 === '1', cancel=process.env.FYSO_TEST_CANCEL === '1', badChoices=process.env.FYSO_TEST_BAD_CHOICES === '1'; let submittedBody;
function json(res,body) {res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(body));}
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname === '/api/dagu/dag-runs') {
    if (url.searchParams.has('status')) return json(res,{dagRuns:[{name:workflow,dagRunId:'waiting',statusLabel:'waiting',labels:['assignee=team',...(badChoices?['choices-hex='+Buffer.from(JSON.stringify(['valid','  '])).toString('hex')]:[])]}]});
    if(submitted) afterSubmitLists++;
    return json(res,{dagRuns:[{name:workflow,dagRunId:'invalid',statusLabel:'failed',labels:['assignee=team']},{name:workflow,dagRunId:'done',statusLabel:'succeeded',labels:['assignee=team']},...(afterSubmitLists>1?[{name:workflow,dagRunId:'waiting',statusLabel:'succeeded',labels:['assignee=team']}]:[])]});
  }
  if (url.pathname.endsWith('/human-tasks/ask/complete')) {let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{submittedBody=JSON.parse(body)});submitted=true;if(uncertain){res.writeHead(503);return res.end();}return json(res,{alreadyCompleted:false});}
  const outputMatch=url.pathname.match(/^\/api\/dagu\/dag-runs\/[^/]+\/([^/]+)\/outputs$/);
  if (outputMatch) { if (outputMatch[1] === 'done') outputReads++; return json(res,{outputs:outputMatch[1]==='done' && outputReads > 1 ? {answer:'<b>Aprobar</b>',comment:'Comentario de prueba',responder:'Ana',decision:'answered'}:{}}); }
  const match=url.pathname.match(/^\/api\/dagu\/dag-runs\/[^/]+\/([^/]+)$/);
  if (match) {
    const id=match[1], isInvalid=id==='invalid';
    return json(res,{dagRunDetails:{nodes:[ask(id==='waiting'&&!submitted?'waiting':'succeeded'),...(id==='done'?[{step:{id:'record'},statusLabel:outputReads ? 'succeeded':'running'}]:[]),deliver(isInvalid?'failed':id==='waiting'&&!submitted?'not_started':'succeeded',isInvalid?'Invalid request answer':'')]}});
  }
  const root=url.pathname.startsWith('/assets/')?assets:panel;
  const rel=url.pathname.startsWith('/assets/')?url.pathname.slice('/assets/'.length):url.pathname.replace(/^\/extensions\/human-requests\/panel\//,'');
  if (!rel || rel.includes('..')) {res.writeHead(404);return res.end();}
  const file=path.join(root,rel);
  try {const body=fs.readFileSync(file);res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});res.end(body);} catch {res.writeHead(404);res.end();}
});
(async()=>{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-hr-ui-profile-')); let browser;
  try {
    browser=await chromium.launchPersistentContext(profile,{executablePath:chrome,headless:true,viewport:{width:1280,height:900},locale:'es-AR'});
    const page=await browser.newPage(); const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/extensions/human-requests/panel/index.html?mock=ready&lang=es`);
    await page.getByText('Agent: test.',{exact:false}).first().waitFor();
    await page.getByRole('heading',{name:'Actividad reciente'}).waitFor();
    const items=page.locator('.pending-history-item'); assert.equal(await items.count(),2);
    await items.first().locator('summary').click();
    await items.first().getByText('La respuesta guardada o las opciones no son válidas.',{exact:false}).waitFor();
    await items.first().getByText('No hay una respuesta disponible en el historial de esta solicitud.').waitFor();
    await items.nth(1).locator('summary').click();
    await items.nth(1).getByText('El paso de entrega terminó.',{exact:false}).waitFor();
    await items.nth(1).getByText('Guardando la respuesta. Esta vista se actualizará automáticamente.').waitFor();
    await items.nth(1).getByText('<b>Aprobar</b>',{exact:true}).waitFor();
    await items.nth(1).getByText('Respondida',{exact:true}).waitFor();
    assert.equal(outputReads,2);
    await items.nth(1).getByText('Nombre indicado (sin verificar)').waitFor();
    assert.equal(await items.nth(1).locator('dd b').count(),0);
    if (badChoices) { await page.getByText('Este formulario contiene campos no compatibles.',{exact:false}).waitFor(); assert.equal(submitted,false); assert.equal(await page.getByRole('button',{name:'Enviar respuesta'}).count(),0); await page.getByLabel('Tu nombre (Obligatorio)').fill('Persona de prueba'); page.once('dialog',dialog=>dialog.accept()); await page.getByRole('button',{name:'Cancelar solicitud'}).click(); await page.getByText('Solicitud cancelada.',{exact:false}).waitFor(); assert.equal(submittedBody.decision,'cancelled'); assert.ok(!submittedBody.answer); console.log('PASS: malformed choice blocks answer but allows cancellation'); return; }
    await page.getByLabel('Tu respuesta (Obligatorio)').fill('   ');
    await page.getByLabel('Tu nombre (Obligatorio)').fill('Persona de prueba');
    await page.getByRole('button',{name:'Enviar respuesta'}).click();
    await page.getByText('Escribí una respuesta antes de enviarla.').waitFor(); assert.equal(submitted,false);
    if(cancel) { page.once('dialog',dialog=>dialog.accept()); await page.getByRole('button',{name:'Cancelar solicitud'}).click(); }
    else {await page.getByLabel('Tu respuesta (Obligatorio)').fill('Aprobar'); await page.getByRole('button',{name:'Enviar respuesta'}).click();}
    if (uncertain) await page.getByText('No se pudo confirmar si la respuesta se guardó.',{exact:false}).waitFor();
    else if(cancel) {await page.getByText('Solicitud cancelada.',{exact:false}).waitFor(); assert.equal(submittedBody.decision,'cancelled'); assert.ok(!submittedBody.answer);}
    else {await page.getByText('Respuesta guardada.',{exact:false}).waitFor(); await page.locator('.pending-result').getByText('El paso de entrega terminó.',{exact:false}).waitFor();}
    await page.waitForFunction(() => document.querySelectorAll('.pending-history-item').length===3);
    assert.ok(afterSubmitLists>=2);
    await page.locator('.pending-result').waitFor();
    assert.equal(errors.length,0,errors.join('; '));
    if (process.env.FYSO_TEST_SCREENSHOT_DIR) {fs.mkdirSync(process.env.FYSO_TEST_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.FYSO_TEST_SCREENSHOT_DIR,'human-requests-history-mock.png'),fullPage:true});}
    console.log('PASS: pending answer and recent-history states rendered (synthetic fixture)');
  } finally {if(browser)await browser.close();server.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1;server.close();});
