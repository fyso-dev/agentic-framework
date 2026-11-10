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
  await gmail.getByLabel('Pon un nombre a la cuenta adicional de Gmail',{exact:true}).fill('Trabajo');
  assert.equal(await github.getByRole('textbox').count(),0);
  await gmail.getByRole('button',{name:'Cancelar',exact:true}).click();
  const folder=path.resolve(__dirname,'../artifacts/delivery-evidence/connector-account-visibility');fs.mkdirSync(folder,{recursive:true});
  await page.locator('#connector-apps').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(folder,'catalog-account-states.png')});
  await page.goto(base+'/?lang=es#/bots');
  await page.locator('a.bots-pick[href^="#/bots/"]').first().click();
  await page.getByRole('tab',{name:/^Conectores/}).click();
  await page.getByRole('button',{name:'Dar acceso a otra aplicación',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Dar acceso a otra aplicación',exact:true});
  // Only authorized accounts can be granted: the failed GitHub authorization is not offered.
  await picker.getByRole('button',{name:'Gmail',exact:true}).waitFor({timeout:60000});
  assert.equal(await picker.getByRole('button',{name:'GitHub',exact:true}).count(),0);
  await page.waitForFunction(()=>{const img=document.querySelector('.bd-pop img');return img&&img.complete&&img.naturalWidth>0;});
  const tab=page.locator('.bd');
  await tab.screenshot({path:path.join(folder,'bot-connected-apps.png')});
  await page.setViewportSize({width:390,height:844});await tab.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await tab.screenshot({path:path.join(folder,'bot-connected-apps-mobile.png')});
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({scope:'local native API presentation fixtures',botAppsOffered:true,failedAccountNotOffered:true,failedAccountExplained:true,accountNameInsideApp:true,noAccountOrGrantWrites:true,mobileOverflow:false,pageErrors:0}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message.slice(0,300));process.exitCode=1;});
