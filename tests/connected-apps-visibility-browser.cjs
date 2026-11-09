// Local presentation fixtures only. Never change the user's accounts or bot grants.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:'admin',password:'admin'},viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[],writes=[];
  const base=process.env.FYSO_TEST_PANEL||'http://panel.localhost:19540';
  const catalog={configured:true,cards:[{slug:'gmail',label:'Gmail',blurb:'Email fixture',logo:'https://fixture.invalid/gmail.svg'},{slug:'github',label:'GitHub',blurb:'Code fixture'}],source:'fixture',pagination:{complete:true}};
  let services={gmail:{connected:true,accounts:[{id:'fixture-active',status:'ACTIVE'}]},github:{connected:false,accounts:[{id:'fixture-failed',status:'FAILED'}]}};
  page.on('pageerror',e=>errors.push(e.name));
  await page.route('https://fixture.invalid/gmail.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#4285f4"/></svg>'}));
  await page.route('**/api/omb/connectors/**',route=>{
   const url=new URL(route.request().url());
   if(route.request().method()!=='GET'){writes.push(url.pathname);return route.fulfill({status:403,json:{}});}
   return route.fulfill({json:url.pathname.endsWith('/catalog')?catalog:{configured:true,inventoryComplete:true,services}});
  });
  await page.goto(base+'/?lang=es#/connectors');
  const gmail=page.locator('#connector-app-gmail'),github=page.locator('#connector-app-github');
  await gmail.scrollIntoViewIfNeeded();await page.waitForFunction(()=>{const img=document.querySelector('#connector-app-gmail img');return img&&img.complete&&img.naturalWidth>0;});
  await github.locator('summary').click();
  await github.getByText('Autorización fallida',{exact:true}).waitFor();
  assert.equal(await github.getByRole('button',{name:'Desconectar',exact:true}).count(),0);
  await github.getByRole('button',{name:'Eliminar conexión guardada',exact:true}).waitFor();
  await gmail.getByRole('button',{name:'Agregar cuenta',exact:true}).click();
  await gmail.getByLabel('Nombrá la cuenta adicional de Gmail',{exact:true}).fill('Trabajo');
  assert.equal(await github.getByRole('textbox').count(),0);
  await gmail.getByRole('button',{name:'Cancelar',exact:true}).click();
  const folder=path.resolve(__dirname,'../artifacts/delivery-evidence/connector-account-visibility');fs.mkdirSync(folder,{recursive:true});
  await page.locator('#connector-apps').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(folder,'catalog-account-states.png')});
  await page.goto(base+'/?lang=es#/bots');
  await page.locator('a[href*="section=connectors"]').first().click();
  const apps=page.getByRole('region',{name:'Aplicaciones',exact:true});
  await apps.getByText('Gmail',{exact:true}).waitFor();await apps.getByText('GitHub',{exact:true}).waitFor();
  await apps.locator('summary').click();await apps.getByText(/Los permisos de aplicaciones se guardan por separado/).waitFor();
  assert.equal(await apps.getByRole('switch').count(),0);
  await apps.scrollIntoViewIfNeeded();await page.waitForFunction(()=>{const img=document.querySelector('.bot-connected-apps img');return img&&img.complete&&img.naturalWidth>0;});
  services={gmail:services.gmail};
  await apps.getByRole('button',{name:'Actualizar aplicaciones',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.bot-connected-apps')?.textContent?.includes('GitHub'));
  await apps.screenshot({path:path.join(folder,'bot-connected-apps.png')});
  await page.setViewportSize({width:390,height:844});await apps.scrollIntoViewIfNeeded();
  await apps.screenshot({path:path.join(folder,'bot-connected-apps-mobile.png')});

  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await apps.screenshot({path:path.join(folder,'bot-connected-apps-mobile.png')});
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({scope:'local native API presentation fixtures',botAppsVisible:true,failedAccountExplained:true,accountNameInsideApp:true,refresh:true,noAccountOrGrantWrites:true,mobileOverflow:false,pageErrors:0}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message.slice(0,300));process.exitCode=1;});
