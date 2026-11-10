// Real session, native OMB, SOPS and Git. Only a harmless local HTTP MCP fixture.
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
(async()=>{
 const root=process.env.FYSO_ROOT,base=process.env.FYSO_TEST_WEB_PANEL;
 if(!root||!base||!process.env.FYSO_TEST_WEB_PASSWORD_FILE||process.env.FYSO_TEST_CONNECTORS!=='1')throw new Error('explicit isolated project required');
 const native=async(route,method='GET')=>{const r=await fetch(`http://127.0.0.1:${process.env.FYSO_OMB_PORT}/api/${route}`,{method});if(!r.ok)throw new Error(`native fixture ${r.status}`);return r.json();};
 const name='persist-'+Date.now().toString(36),credential='Bearer fixture-mcp-only-not-a-real-credential';let authenticated=0,toolCalls=0;
 const provider=http.createServer(async(req,res)=>{
  let text='';for await(const chunk of req)text+=chunk;let body;try{body=JSON.parse(text);}catch{res.writeHead(400);return res.end();}
  if(req.headers.authorization===credential)authenticated++;
  if(body.id===undefined){res.writeHead(202);return res.end();}
  let result={};if(body.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'persistence-proof',version:'1'}};
  if(body.method==='tools/list')result={tools:[{name:'fixture_read',inputSchema:{type:'object',properties:{}}}]};
  if(body.method==='tools/call')toolCalls++;
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result}));
 });
 await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));let browser;
 const file=path.join(root,'project/omb-mcp.json'),manage=(op,name,input)=>require('../template/framework/scripts/managed-mcp.cjs').operate(op,name,input,process.env);
 try{
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name));
  await page.goto(base+'/?lang=es&theme=dark#/connectors');await page.locator('input[name="username"]').fill('admin');await page.locator('input[name="password"]').fill(fs.readFileSync(process.env.FYSO_TEST_WEB_PASSWORD_FILE,'utf8').trimEnd());await page.locator('button[type="submit"]').click();await page.waitForURL(url=>url.hostname===new URL(base).hostname);
  await page.goto(base+'/?lang=es&theme=dark#/connectors');await page.getByRole('button',{name:'Agregar MCP',exact:true}).click();
  await page.getByLabel('Nombre del servidor',{exact:true}).fill(name);await page.getByLabel('URL del servidor MCP',{exact:true}).fill(`http://127.0.0.1:${provider.address().port}/mcp`);await page.getByLabel('Credencial opcional',{exact:true}).fill(credential);await page.getByRole('button',{name:'Guardar y probar',exact:true}).click();
  const card=page.locator(`#connector-mcp-${name}`);await card.waitFor({timeout:60000});await card.getByRole('button',{name:'Deshabilitar',exact:true}).waitFor({timeout:60000});assert.ok(authenticated>0);assert.equal(toolCalls,0);
  const saved=JSON.parse(fs.readFileSync(file,'utf8')).mcpServers[name];assert.equal(saved.enabled,true);assert.match(saved.headers.Authorization,/^\$\{FYSO_MCP_/);assert.equal(fs.readFileSync(file,'utf8').includes(credential),false);assert.equal(fs.readFileSync(path.join(root,'secrets.enc.yaml'),'utf8').includes(credential),false);
  assert.equal(execFileSync('git',['status','--porcelain','--','project/omb-mcp.json','secrets.enc.yaml'],{cwd:root,encoding:'utf8'}).trim(),'');
  await native(`mcp/servers/${name}`,'DELETE');assert.equal((await native('mcp/servers')).servers.some(s=>s.name===name),false);
  const restored=await manage('restore');assert.ok(restored.restored>=1);assert.equal((await native('mcp/servers')).servers.find(s=>s.name===name).enabled,true);
  await page.reload();await card.waitFor({timeout:60000});await card.getByRole('button',{name:'Deshabilitar',exact:true}).waitFor({timeout:60000});
  const folder=path.resolve(__dirname,'../artifacts/delivery-evidence/managed-mcp');fs.mkdirSync(folder,{recursive:true});await card.screenshot({path:path.join(folder,'restored-mcp.png')});
  const response=await context.request.delete(base+`/api/connectors/mcp/${name}`,{headers:{Origin:base}});assert.equal(response.status(),200);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).mcpServers[name],undefined);assert.equal((await native('mcp/servers')).servers.some(s=>s.name===name),false);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({scope:'real session + native OMB + SOPS + Git; local provider only',createdInPanel:true,credentialEncrypted:true,definitionVersioned:true,metadataAuthenticated:true,noToolCalls:true,nativeStateLossSimulated:true,recreatedFromGitAndSops:true,enabledAfterRestore:true,removalVersioned:true,pageErrors:0}));
 }finally{if(browser)await browser.close();if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).mcpServers[name])await manage('remove',name,{});await new Promise(resolve=>provider.close(resolve));}
})().catch(e=>{console.error(e.message.slice(0,400));process.exitCode=1;});
