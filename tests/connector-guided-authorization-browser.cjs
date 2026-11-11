// Guided Composio account UX using native API fixtures and a real local consent page.
const {chromium}=require('playwright'),http=require('node:http'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 let authorized=false,requests=0,failedCheck=false;
 const provider=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');if(req.url==='/approve'&&req.method==='POST'){authorized=true;res.end('<h1>Autorización lista</h1><p>Volvé a la pestaña de Fyso.</p>');}else res.end('<h1>Cuenta de prueba Gmail</h1><form method="POST" action="/approve"><button>Autorizar cuenta</button></form>');});
 await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${provider.address().port}`,browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:'admin',password:'admin'},viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.name));
  await page.route('**/api/omb/connectors/catalog',route=>route.fulfill({json:{configured:true,cards:[{slug:'gmail',label:'Gmail',blurb:'Correo de prueba'}],source:'fixture',pagination:{complete:true}}}));
  await page.route('**/api/omb/connectors/connected',route=>{if(authorized&&!failedCheck){failedCheck=true;return route.fulfill({status:503,json:{error:'fixture-unavailable'}});}return route.fulfill({json:{configured:true,inventoryComplete:true,services:{gmail:{connected:authorized,accounts:authorized?[{id:'fixture',status:'ACTIVE'}]:[]}}}});});
  await page.route('**/api/omb/connectors/gmail/authorize',async route=>{requests++;assert.deepEqual(route.request().postDataJSON(),{alias:''});await new Promise(resolve=>setTimeout(resolve,250));return route.fulfill({json:{url:origin+'/authorize'}});});
  await page.goto((process.env.FYSO_TEST_PANEL||'http://panel.localhost:19540')+'/?lang=es#/connectors');
  await page.getByRole('button',{name:'Elegir una aplicación',exact:true}).click();
  const card=page.locator('#connector-app-gmail');await card.getByRole('button',{name:'Conectar',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Conectar Gmail',exact:true});await dialog.waitFor();await dialog.getByRole('link',{name:'Abrir autorización de Gmail',exact:true}).waitFor({timeout:8000}).catch(async error=>{console.log(JSON.stringify({dialogs:await page.locator('dialog[open]').allTextContents(),errors,requests}));throw error;});
  assert.equal(context.pages().length,1); // Preparing a link must never open a blank tab.
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(authorized,false);
  await card.getByRole('button',{name:'Conectar',exact:true}).click();await dialog.getByRole('link',{name:'Abrir autorización de Gmail',exact:true}).waitFor();assert.equal(context.pages().length,1);
  const folder=path.resolve(__dirname,'../artifacts/delivery-evidence/composio-setup');fs.mkdirSync(folder,{recursive:true});
  await page.screenshot({path:path.join(folder,'authorization-next-step.png')});
  const popupPromise=context.waitForEvent('page');await dialog.getByRole('link',{name:'Abrir autorización de Gmail',exact:true}).click();const popup=await popupPromise;
  await popup.getByRole('heading',{name:'Cuenta de prueba Gmail',exact:true}).waitFor();assert.equal(new URL(popup.url()).origin,origin);
  await popup.getByRole('button',{name:'Autorizar cuenta',exact:true}).click();await popup.getByRole('heading',{name:'Autorización lista',exact:true}).waitFor();
  await page.bringToFront();
  await page.getByRole('alert').filter({hasText:'No pudimos comprobar la conexión todavía'}).waitFor();
  const completed=page.getByRole('dialog',{name:'Gmail conectado',exact:true});await completed.waitFor({timeout:15000});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await completed.evaluate(el=>el.scrollWidth>el.clientWidth),false);
  await page.screenshot({path:path.join(folder,'authorization-confirmed-mobile.png')});
  await completed.getByRole('button',{name:'Ver conexión',exact:true}).click();await completed.waitFor({state:'hidden'});await card.getByText('Conectada',{exact:true}).waitFor();assert.equal(await card.evaluate(el=>el===document.activeElement),true);
  assert.equal(requests,2);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({scope:'guided account UX with native API fixtures and real local consent page',noBlankTab:true,cancelBeforeOpening:true,explicitProviderLink:true,automaticConfirmationOnReturn:true,temporaryCheckFailureRecovered:true,connectedAccountVisible:true,mobileOverflow:false,pageErrors:0}));
  await context.close();
 }finally{await browser.close();await new Promise(resolve=>provider.close(resolve));}
})().catch(error=>{console.error(error.message.slice(0,200));process.exitCode=1;});
