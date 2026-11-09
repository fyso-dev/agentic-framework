// Executable local UX proof. Setup/catalog responses are fixtures; no external key is saved.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:'admin',password:'admin'},viewport:{width:1440,height:1050}});
  const page=await context.newPage(),errors=[],daguKeys=[],key='fixture-browser-composio-not-a-credential';let ready=false,attempt=0;
  const folder=path.resolve(__dirname,'../artifacts/delivery-evidence/composio-setup');fs.mkdirSync(folder,{recursive:true});
  page.on('pageerror',error=>errors.push(error.name));page.on('request',request=>{if(request.url().includes('/api/dagu/')&&(request.postData()||'').includes(key))daguKeys.push(request.url());});
  await page.route('**/api/composio/setup',async route=>{assert.equal(route.request().method(),'POST');assert.deepEqual(route.request().postDataJSON(),{apiKey:key});attempt++;if(attempt===1)return route.fulfill({status:422,json:{error:'invalidKey'}});ready=true;return route.fulfill({json:{saved:true,active:true}});});
  await page.route('**/api/omb/connectors/catalog',async route=>{const response=await route.fetch();const data=await response.json();return route.fulfill({json:{...data,configured:ready}});});
  await page.route('**/api/omb/connectors/connected',route=>route.fulfill({json:{configured:ready,services:{},inventoryComplete:true}}));
  await page.goto((process.env.FYSO_TEST_PANEL||'http://panel.localhost:19540')+'/?lang=es#/connectors');
  await page.getByRole('button',{name:'Configurar Composio',exact:true}).click();
  assert.equal(await page.getByRole('link',{name:'Ir a las claves API de Composio',exact:true}).getAttribute('href'),'https://dashboard.composio.dev/~/project/settings/api-keys');
  const field=page.getByLabel('Clave del proyecto Composio',{exact:true});await field.waitFor();assert.equal(await field.getAttribute('type'),'password');
  await page.locator('#composio-setup-title').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(folder,'setup-desktop.png')});
  await field.fill(key);await page.getByRole('button',{name:'Guardar y comprobar',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Composio rechazó la clave'}).waitFor();assert.equal(await field.inputValue(),'');
  await field.fill(key);await page.getByRole('button',{name:'Guardar y comprobar',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Composio está listo'}).waitFor();await page.getByRole('button',{name:'Cambiar clave',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Clave del proyecto Composio',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Elegir una aplicación',exact:true}).click();assert.equal(await page.locator('#connector-apps').evaluate(el=>el===document.activeElement),true);
  await page.locator('#composio-setup-title').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(value=>JSON.stringify(localStorage).includes(value)||JSON.stringify(sessionStorage).includes(value),key),false);
  await page.setViewportSize({width:390,height:844});await page.locator('#composio-setup-title').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(folder,'setup-ready-mobile.png')});assert.deepEqual(errors,[]);assert.deepEqual(daguKeys,[]);
  console.log(JSON.stringify({scope:'local UX with setup/provider fixtures',attempts:attempt,rejectedKeyRecovery:true,readyState:true,keyCleared:true,noBrowserPersistence:true,noDaguKey:true,mobileOverflow:false,pageErrors:0,screenshots:2}));
  await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message.slice(0,180));process.exitCode=1;});
