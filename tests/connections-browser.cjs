// Read-only navigation smoke for the integrated connector screen.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
async function main(){
 const base=process.env.FYSO_TEST_PANEL;if(!base)throw Error('select a disposable panel with FYSO_TEST_PANEL');
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({httpCredentials:{username:'admin',password:'admin'},viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.name));
  await page.goto(`${base}/?lang=es#/apps`);
  await page.getByRole('link',{name:'Administrar conectores',exact:true}).click();
  await page.getByRole('heading',{name:'Conectores',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Gmail',exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'#/connectors');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({appsToConnectors:true,nativeCatalog:true,mobileOverflow:false,pageErrors:0}));
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
