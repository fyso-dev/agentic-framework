const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
// Opt-in against a disposable project owned by this test operator. Never auto-discovers.
assert.equal(process.env.FYSO_ACCEPT_DISPOSABLE,'1','requires explicit disposable-project acknowledgement');
const project=path.resolve(process.env.FYSO_ACCEPT_PROJECT || '');
assert(fs.existsSync(path.join(project,'.copier-answers.yml')),'requires a generated project');
const env=process.env;
const evidence=path.resolve(__dirname,'../artifacts/delivery-evidence/third-party-skills');
const base=process.env.FYSO_ACCEPT_LOG_DIR || require('node:os').tmpdir();
const effective=JSON.parse(execFileSync('mise',['env','--json'],{cwd:project,env,encoding:'utf8'}));
const password=JSON.parse(effective.FYSO_AUTH_PASSWORDS).admin;
const origin=`http://panel.${effective.FYSO_WEB_DOMAIN}:${effective.FYSO_HTTP_PORT}`,auth=`http://auth.${effective.FYSO_WEB_DOMAIN}:${effective.FYSO_HTTP_PORT}`;
assert.equal(effective.OPENMAUSBOT_URL,`http://127.0.0.1:${effective.FYSO_OMB_PORT}`);
(async()=>{const browser=await chromium.launch({headless:true,channel:"chrome"});const page=await browser.newPage({viewport:{width:1360,height:1000}});page.setDefaultTimeout(120000);const errors=[],signals=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/dagu/'))signals.push({path:new URL(r.url()).pathname,status:r.status()});});
 try{
 const login=await page.request.post(auth+'/api/user/login',{headers:{Origin:auth},data:{username:'admin',password}});assert.equal(login.status(),200);console.log('PASS native login');
 await page.goto(origin+'/?lang=en#/apps?tab=skills');await page.getByRole('searchbox').fill('anthropics/skills');await page.getByRole('button',{name:'Search',exact:true}).click();
 const hit=page.locator('.ap-ext').filter({has:page.getByRole('heading',{name:'brand-guidelines',exact:true})});await hit.getByRole('button',{name:'Read',exact:true}).click();
 const modal=page.getByRole('dialog');await modal.getByRole('button',{name:'Install',exact:true}).waitFor();await modal.getByRole('button',{name:'Install',exact:true}).click();
 await modal.getByText(/is installed and off for every agent/).waitFor();console.log('PASS real panel install via Dagu');await modal.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Review and confirm',exact:true}).click();await modal.getByText('OpenMausBot’s scan found no warnings',{exact:true}).waitFor();assert(await modal.getByRole('button',{name:'Confirm',exact:true}).isDisabled());
 await page.screenshot({path:path.join(evidence,'live-awaiting-review.png')});await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'Confirm',exact:true}).click();await modal.getByText(/is confirmed/).waitFor();await modal.getByRole('button',{name:'Close',exact:true}).click();await page.getByText('Confirmed',{exact:true}).waitFor();
 await page.screenshot({path:path.join(evidence,'live-confirmed.png')});console.log('PASS real scan and human review UI gate');
 await page.goto(origin+'/?lang=en#/bots');await page.getByText('Workflow Architect',{exact:true}).first().click();
 const toggle=page.getByRole('switch',{name:'brand-guidelines',exact:true});await toggle.waitFor();assert.equal(await toggle.getAttribute('aria-checked'),'false');await toggle.click();
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Review and apply',{exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Apply changes',exact:true}).click();await page.getByText('Applied. You can use them in OpenMausBot now.',{exact:true}).waitFor();
 await page.screenshot({path:path.join(evidence,'live-agent-enabled.png')});console.log('PASS real per-agent toggle and apply');
 const native=await fetch(effective.OPENMAUSBOT_URL+'/api/bots?messages=0').then(r=>r.json());const bot=native.bots.find(b=>b.name==='Workflow Architect');assert(bot);
 const skills=await fetch(effective.OPENMAUSBOT_URL+`/api/bots/${encodeURIComponent(bot.id)}/skills`).then(r=>r.json());assert(skills.skills.some(s=>s.name==='brand-guidelines'&&s.enabled));
 console.log('PASS native enabled state');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(base,'browser-signals.json'),JSON.stringify({signals,errors},null,2));
 }catch(e){await page.screenshot({path:path.join(base,'browser-failure.png')});fs.writeFileSync(path.join(base,'browser-failure.txt'),await page.locator('body').innerText());fs.writeFileSync(path.join(base,'browser-signals.json'),JSON.stringify({signals,errors},null,2));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
