// Executable panel UX smoke using the built-in mock backend; no live Dagu or OMB claims.
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const dist=path.resolve(__dirname,'../template/framework/panel/dist');
 const server=http.createServer((req,res)=>{
  const file=path.resolve(dist,'.'+new URL(req.url,'http://fixture').pathname);
  if(file!==dist&&!file.startsWith(dist+path.sep)){res.writeHead(404);return res.end();}
  const target=file===dist?path.join(dist,'index.html'):file;
  if(!fs.existsSync(target)){res.writeHead(404);return res.end();}
  res.setHeader('content-type',target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':target.endsWith('.html')?'text/html':'application/octet-stream');
  res.end(fs.readFileSync(target));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/?mock=empty&lang=en#/apps?tab=skills`);
  await page.getByText('No third-party skills yet.',{exact:true}).waitFor();
  await page.getByRole('searchbox').fill('pdf');await page.getByRole('button',{name:'Search',exact:true}).click();
  const hit=page.locator('.ap-ext').filter({has:page.getByRole('heading',{name:'pdf-forms',exact:true})});
  await hit.getByRole('button',{name:'Read',exact:true}).click();
  const modal=page.getByRole('dialog');await modal.getByText('Apache-2.0',{exact:false}).first().waitFor();
  assert.match(await modal.locator('pre.sk-text').last().innerText(),/name: pdf-forms/);
  await modal.getByRole('button',{name:'Install',exact:true}).click();
  await modal.getByText(/is installed and off for every agent/).waitFor();
  await modal.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Review and confirm',exact:true}).click();
  await modal.getByText('OpenMausBot’s scan found no warnings',{exact:true}).waitFor();
  assert.equal(await modal.getByRole('button',{name:'Confirm',exact:true}).isDisabled(),true);
  const evidence=path.resolve(__dirname,'../artifacts/delivery-evidence/third-party-skills');fs.mkdirSync(evidence,{recursive:true});
  await page.screenshot({path:path.join(evidence,'awaiting-review.png')});
  await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'Confirm',exact:true}).click();
  await modal.getByText(/is confirmed/).waitFor();await modal.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByText('Confirmed',{exact:true}).waitFor();
  await page.screenshot({path:path.join(evidence,'confirmed.png')});
  await page.getByRole('button',{name:'Look for a newer version',exact:true}).click();
  await modal.getByRole('button',{name:'Install this revision',exact:true}).waitFor();
  await modal.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Remove',exact:true}).click();await page.getByRole('button',{name:'Remove from the project',exact:true}).click();
  await page.getByText('No third-party skills yet.',{exact:true}).waitFor();
  await page.goto(`${base}/?mock=empty&lang=es#/apps?tab=skills`);
  await page.getByRole('searchbox').waitFor();assert.equal(await page.getByRole('button',{name:'Search',exact:true}).count(),0);
  assert.deepEqual(errors,[]);console.log('PASS mock panel: search, read, install, review gate, confirm, upgrade preview, remove, Spanish; no page errors');
 } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
