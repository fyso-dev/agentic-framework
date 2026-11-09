// Curated discovery and compact presentation only. No provider authorization or permission writes.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:'admin',password:'admin'},viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.name));
  const names={gmail:'Gmail',github:'GitHub',slack:'Slack',googlecalendar:'Google Calendar',googledrive:'Google Drive',googlesheets:'Google Sheets',notion:'Notion',jira:'Jira',outlook:'Outlook',microsoft_teams:'Microsoft Teams',zoom:'Zoom',trello:'Trello',whop:'Whop',agentcard:'Agentcard'};
  const cards=Object.entries(names).map(([slug,label])=>({slug,label,blurb:'Fixture description should not clutter the card.',logo:`https://fixture.invalid/${slug}.svg`}));
  await page.route('https://fixture.invalid/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="#6955d8"/></svg>'}));
  await page.route('**/api/omb/connectors/catalog',route=>route.fulfill({json:{configured:true,cards,source:'fixture',pagination:{complete:true}}}));
  await page.route('**/api/omb/connectors/connected',route=>route.fulfill({json:{configured:true,inventoryComplete:true,services:{trello:{connected:true,accounts:[{id:'fixture',status:'ACTIVE'}]}}}}));
  await page.goto((process.env.FYSO_TEST_PANEL||'http://panel.localhost:19540')+'/?lang=es#/connectors');
  await page.locator('#connector-apps').scrollIntoViewIfNeeded();
  await page.locator('#connector-app-gmail').waitFor();
  const grid=page.locator('.connector-app-grid');assert.equal(await grid.locator('article').count(),11);
  assert.equal(await grid.getByRole('heading',{name:'Whop',exact:true}).count(),0);assert.equal(await grid.getByRole('heading',{name:'Agentcard',exact:true}).count(),0);
  assert.equal(await grid.getByRole('heading',{name:'Zoom',exact:true}).count(),0);await grid.getByRole('heading',{name:'Trello',exact:true}).waitFor();
  assert.equal(await grid.getByText('Fixture description should not clutter the card.',{exact:true}).count(),0);
  assert.equal(await page.locator('.connector-advanced').getAttribute('open'),null);
  await page.waitForFunction(()=>[...document.querySelectorAll('.connector-app-grid img')].some(img=>img.complete&&img.naturalWidth>0));
  const folder=path.resolve(__dirname,'../artifacts/delivery-evidence/recommended-connectors');fs.mkdirSync(folder,{recursive:true});
  await page.screenshot({path:path.join(folder,'recommended-apps.png')});
  await page.getByRole('button',{name:'Todas',exact:true}).click();await grid.getByRole('heading',{name:'Zoom',exact:true}).waitFor();assert.equal(await grid.locator('article').count(),14);
  await page.getByRole('button',{name:'Recomendados',exact:true}).click();await page.getByRole('searchbox').fill('Zoom');await grid.getByRole('heading',{name:'Zoom',exact:true}).waitFor();assert.equal(await grid.locator('article').count(),1);
  await page.getByRole('searchbox').fill('');await page.setViewportSize({width:390,height:844});await page.locator('#connector-apps').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(folder,'recommended-apps-mobile.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({recommendedDefault:true,tenCommonApps:true,whopAgentcardExcluded:true,existingOutsideRecommendationsPreserved:true,fullCatalog:true,searchBeyondRecommendations:true,logosLoaded:true,mobileOverflow:false,pageErrors:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message.slice(0,300));process.exitCode=1;});
