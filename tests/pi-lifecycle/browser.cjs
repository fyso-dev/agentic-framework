// Authenticated panel step of the Pi lifecycle acceptance. Fictional data only.
// Requires Playwright through NODE_PATH and a headless Chromium in FYSO_TEST_CHROME.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=process.env.FYSO_TEST_EVIDENCE,title=process.env.FYSO_TEST_TITLE,bot=process.env.FYSO_TEST_BOT;
const origin=new URL(process.env.FYSO_TEST_PANEL_URL),suffix='.'+process.env.FYSO_TEST_WEB_DOMAIN;
const question='¿Cómo cambia el resultado entre las opciones?';
(async()=>{let browser;const profile=fs.mkdtempSync(path.join(process.env.TMPDIR,'pi-browser-'));try{
  browser=await chromium.launchPersistentContext(profile,{executablePath:process.env.FYSO_TEST_CHROME,headless:true,locale:'es-AR',viewport:{width:1280,height:950}});
  const page=await browser.newPage(),errors=[];page.on('pageerror',()=>errors.push('pageerror'));
  // Never let the browser leave the fixture's gateway.
  await page.route('**/*',async route=>{try{const u=new URL(route.request().url());
    if(u.protocol!==origin.protocol||u.port!==origin.port||!(u.hostname===process.env.FYSO_TEST_WEB_DOMAIN||u.hostname.endsWith(suffix)))throw Error('outside');
    await route.continue()}catch{await route.abort()}});
  await page.goto(origin.href);
  await page.locator('input[name=username]').fill('admin');
  await page.locator('input[name=password]').fill(fs.readFileSync(process.env.FYSO_TEST_PASSWORD_FILE,'utf8').trim());
  const login=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/user/login'&&r.request().method()==='POST');
  await page.locator('button[type=submit]').click();assert.equal((await login).status(),200);
  await page.waitForURL(u=>u.hostname===origin.hostname,{waitUntil:'domcontentloaded'});
  await page.getByRole('link',{name:'Pendientes'}).click();const frame=page.frameLocator('iframe');
  await frame.getByRole('button').filter({hasText:title}).filter({hasText:bot}).click();
  await frame.getByRole('heading',{name:title,exact:true}).waitFor();
  await frame.getByPlaceholder('Tu nombre').fill('Persona de prueba');
  await frame.getByRole('button',{name:'Preguntar al agente'}).click();await frame.getByLabel('Tu pregunta').fill(question);
  const push=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/human-tasks/ask/push-back')&&r.request().method()==='POST');
  await frame.getByRole('button',{name:'Enviar pregunta'}).click();assert.equal((await push).status(),200);
  await frame.locator('.pending-detail .pending-msg-me').filter({hasText:question}).last().waitFor({timeout:90000});
  await frame.locator('.pending-detail .pending-msg-agent').last().waitFor({timeout:90000});
  const clarification=await frame.locator('.pending-detail .pending-msg-agent').last().innerText();assert.ok(clarification.trim().length>12);
  await page.screenshot({path:path.join(root,'clarification.png'),fullPage:true});
  const choice=frame.locator('input[name=hr-option]').first();let answer;
  if(await choice.count()){answer=await choice.inputValue();await choice.check()}else{answer='Cálido y amistoso';await frame.getByLabel('Tu respuesta',{exact:true}).fill(answer)}
  const done=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/human-tasks/ask/complete')&&r.request().method()==='POST');
  await frame.getByRole('button',{name:'Enviar decisión'}).click();assert.equal((await done).status(),200);
  await frame.getByText('Decisión guardada.').waitFor();await page.screenshot({path:path.join(root,'decision.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(root,'browser.json'),JSON.stringify({login:200,pushBack:200,clarification,decisionHttp:200,answer,pageErrors:0},null,2));
  console.log('Authenticated panel question and decision passed');
}finally{await browser?.close();fs.rmSync(profile,{recursive:true,force:true})}})().catch(e=>{console.error(e.message);process.exitCode=1});
