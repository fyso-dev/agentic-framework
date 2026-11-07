// Live generic-page acceptance against the independent ext-pages Copier fixture.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext({locale:'en',httpCredentials:{username:process.env.FYSO_ADMIN_USER||'admin',password:process.env.FYSO_ADMIN_PASSWORD||'admin'},viewport:{width:1440,height:1000}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.name));
 const base=process.env.FYSO_BIZ_TEST_PANEL||'http://panel.localhost:9460';
 await page.goto(`${base}/?lang=en`);
 await page.getByRole('navigation').getByRole('link',{name:'Project notes',exact:true}).first().click();
 await page.frameLocator('iframe[title="Project notes"]').getByRole('heading',{name:'Project notes',exact:true}).waitFor();
 await page.getByRole('navigation').getByRole('link',{name:'Project reports',exact:true}).first().click();
 await page.frameLocator('iframe[title="Project reports"]').getByRole('heading',{name:'Project reports',exact:true}).waitFor();
 assert.equal((await context.request.get(`${base}/extensions/example-pages/panel/notes.html`)).status(),200);
 assert.equal((await context.request.get(`${base}/extensions/example-pages/secrets.yaml`)).status(),404);
 assert.equal((await context.request.get(`${base}/extensions/example-pages/panel/..%2fsecrets.yaml`)).status(),404);
 assert.equal(errors.length,0);
 await page.screenshot({path:path.resolve(__dirname,'../artifacts/delivery-evidence/fyso-biz/extension-owned-pages.png')});
 console.log(JSON.stringify({independentExtension:true,pages:2,navigationAndContent:true,privateSlotsBlocked:true,pageErrors:0}));
 await context.close();
}finally{await browser.close();}})().catch(e=>{console.error(e.message.slice(0,180));process.exitCode=1;});
