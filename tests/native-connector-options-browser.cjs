// Real native preference read, with mocked writes/hosted sign-in initialization.
// Never activates personal MCP/skills or contacts an external account provider.
const {chromium}=require('playwright'),http=require('node:http'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function main() {
  const base=process.env.FYSO_TEST_PANEL;if(!base)throw Error('select an isolated panel');
  const auth='Basic '+Buffer.from('admin:admin').toString('base64');
  const native=async()=>{const r=await fetch(`http://127.0.0.1:${process.env.FYSO_TEST_OMB_PORT}/api/config`);if(!r.ok)throw Error('native config unavailable');const {features}=await r.json();return {claudeUserMcp:features.claudeUserMcp,claudeUserSkills:features.claudeUserSkills};};
  const before=await native(),saves=[],creates=[],signIns=[];
  const provider=http.createServer((req,res)=>res.end('Local authorization fixture'));
  await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
  const authorizationUrl=`http://127.0.0.1:${provider.address().port}/authorize`;
  const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext({httpCredentials:{username:'admin',password:'admin'},viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.name));
    let features={...before},servers=[{name:'existing-whop',url:'https://mcp.whop.com/mcp',type:'http',enabled:false}];
    await page.route('**/api/dagu/**',async route=>{
      const p=new URL(route.request().url()).pathname;
      if(p.endsWith('/dags/fyso-connector-preferences/enqueue')) {
        const params=JSON.parse(route.request().postDataJSON().params||'{}');
        if(params.OP==='save'){
          const patch=JSON.parse(Buffer.from(params.SETTINGS_B64,'base64').toString());saves.push(patch);features={...features,...patch};
          return route.fulfill({json:{dagRunId:'preference-ui-fixture'}});
        }
      }
      if(p.endsWith('/fyso-connector-preferences/preference-ui-fixture/outputs'))return route.fulfill({json:{outputs:{result:JSON.stringify({features,versioned:true})}}});
      if(p.endsWith('/fyso-connector-preferences/preference-ui-fixture'))return route.fulfill({json:{dagRunDetails:{dagRunId:'preference-ui-fixture',statusLabel:'succeeded'}}});
      return route.continue();
    });
    await page.route('**/api/omb/mcp/servers**',async route=>{
      const p=new URL(route.request().url()).pathname,method=route.request().method();
      if(p.endsWith('/mcp/servers')){
        if(method==='POST'){const input=route.request().postDataJSON();creates.push(input);servers.push({...input,enabled:false});}
        return route.fulfill({json:{servers}});
      }
      if(p.endsWith('/sign-in')){signIns.push(p);return route.fulfill({json:{auth:{flowId:'00000000-0000-4000-8000-000000000000',phase:'waiting',authorizationUrl}}});}
      if(method==='DELETE')return route.fulfill({json:{ok:true}});
      return route.continue();
    });
    await page.goto(`${base}/?lang=es#/connectors`);
    await page.locator('.connector-advanced > summary').click();
    const mcp=page.getByRole('switch',{name:'También usar mis servidores MCP de Claude Code',exact:true}),skills=page.getByRole('switch',{name:'También usar mis skills de Claude Code',exact:true});
    await mcp.waitFor({timeout:60000});assert.equal(await mcp.isChecked(),before.claudeUserMcp);assert.equal(await skills.isChecked(),before.claudeUserSkills);
    const folder=path.resolve(__dirname,'../artifacts/delivery-evidence/connectors-panel');
    // Focused authorization screenshots belong to the guided account test.
    await mcp.click();await page.waitForFunction(()=>{const input=document.querySelector('input[aria-label="También usar mis servidores MCP de Claude Code"]');return input && !input.disabled;});
    assert.deepEqual(saves[0],{claudeUserMcp:!before.claudeUserMcp});
    await skills.click();await page.waitForFunction(()=>{const input=document.querySelector('input[aria-label="También usar mis skills de Claude Code"]');return input && !input.disabled;});
    assert.deepEqual(saves[1],{claudeUserSkills:!before.claudeUserSkills});
    for(const label of ['Whop','Agentcard']){
      const card=page.getByRole('article').filter({has:page.getByRole('heading',{name:label,exact:true})});
      await card.getByRole('button',{name:'Conectar',exact:true}).click();await page.getByRole('dialog',{name:`Conectar ${label}`,exact:true}).waitFor();
      const popupPromise=context.waitForEvent('page');await page.getByRole('link',{name:`Abrir autorización de ${label}`,exact:true}).click();const popup=await popupPromise;
      await popup.waitForURL(authorizationUrl);await page.getByRole('button',{name:'Cancelar',exact:true}).click();
      await page.getByRole('dialog').waitFor({state:'hidden'});await popup.close();
    }
    assert.equal(creates.length,1);assert.deepEqual(creates[0],{name:'agentcard',type:'http',url:'https://mcp.agentcard.sh/mcp'});
    assert.ok(signIns.some(p=>p.includes('/existing-whop/')));assert.ok(signIns.some(p=>p.includes('/agentcard/')));
    assert.deepEqual(await native(),before);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({nativePreferenceRead:true,independentSwitchPayloads:true,personalInheritanceUnchanged:true,hostedConnectionsWithoutComposio:true,reusesExistingWhop:true,agentcardPreset:true,pageErrors:0,mode:'mocked writes and hosted sign-in initialization; no external account authorization'}));
  } finally {await browser.close();await new Promise(resolve=>provider.close(resolve));}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
