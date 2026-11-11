// Native OMB OAuth + PKCE against a harmless local provider. No external account.
const {chromium}=require('playwright'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
async function main() {
  if(process.env.FYSO_TEST_CONNECTORS!=='1')throw Error('requires explicit disposable fixture');
  let origin,challenge,authorizedRequests=0,pkce=false,browser,created=false;
  const name=`oauth-proof-${Date.now().toString(36)}`,token='local-oauth-proof-token';
  const provider=http.createServer((req,res)=>{
    const url=new URL(req.url,origin),json=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
    if(url.pathname.startsWith('/.well-known/oauth-protected-resource'))return json({resource:origin+'/mcp',authorization_servers:[origin],scopes_supported:['read']});
    if(url.pathname.startsWith('/.well-known/oauth-authorization-server'))return json({issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',registration_endpoint:origin+'/register',response_types_supported:['code'],grant_types_supported:['authorization_code'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:['read']});
    if(url.pathname==='/register')return json({client_id:'local-connector-proof',token_endpoint_auth_method:'none'},201);
    if(url.pathname==='/authorize') {
      challenge=url.searchParams.get('code_challenge');const redirect=new URL(url.searchParams.get('redirect_uri'));redirect.searchParams.set('code','local-proof-code');redirect.searchParams.set('state',url.searchParams.get('state'));
      res.writeHead(302,{Location:redirect.href});return res.end();
    }
    let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
      if(url.pathname==='/token') {
        const form=new URLSearchParams(body),verifier=form.get('code_verifier');pkce=!!verifier && crypto.createHash('sha256').update(verifier).digest('base64url')===challenge;
        return json(pkce?{access_token:token,token_type:'Bearer',expires_in:3600,scope:'read'}:{error:'invalid_grant'},pkce?200:400);
      }
      if(url.pathname==='/mcp') {
        if(req.headers.authorization!==`Bearer ${token}`){res.setHeader('WWW-Authenticate',`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`);return json({error:'authorization_required'},401);}
        authorizedRequests++;
        const {id,method}=JSON.parse(body);if(id===undefined){res.writeHead(202);return res.end();}
        return json({jsonrpc:'2.0',id,result:method==='initialize'?{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'oauth-proof',version:'1'}}:method==='tools/list'?{tools:[{name:'read_message',description:'Harmless local OAuth fixture',inputSchema:{type:'object',properties:{}}}]}:{}});
      }
      json({error:'not_found'},404);
    });
  });
  await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${provider.address().port}`;
  const base=process.env.FYSO_TEST_PANEL||`http://panel.localhost:${process.env.FYSO_HTTP_PORT}`;
  try {
    browser=await chromium.launch({headless:true});const context=await browser.newContext({httpCredentials:{username:'admin',password:'admin'}}),page=await context.newPage();
    await page.goto(`${base}/?lang=es#/connectors`);await page.getByRole('button',{name:'Agregar MCP',exact:true}).click();
    await page.getByLabel('Nombre del servidor',{exact:true}).fill(name);await page.getByLabel('URL del servidor MCP',{exact:true}).fill(origin+'/mcp');
    await page.getByRole('button',{name:'Guardar y probar',exact:true}).click();
    const card=page.getByRole('article').filter({has:page.getByRole('heading',{name,exact:true})});
    await card.getByText('Deshabilitado',{exact:true}).waitFor({timeout:60000});created=true;
    await card.getByRole('button',{name:'Autorizar cuenta',exact:true}).click();await page.getByRole('dialog',{name:`Conectar ${name}`,exact:true}).waitFor();
    const popupPromise=context.waitForEvent('page');await page.getByRole('link',{name:`Abrir autorización de ${name}`,exact:true}).click();const popup=await popupPromise;
    await popup.waitForURL(url=>url.pathname==='/mcp-oauth/callback',{timeout:30000}).catch(()=>{});
    const callback=page.getByLabel('URL de retorno · solo si el proveedor lo requiere',{exact:true});
    if(await callback.isVisible())await callback.fill(popup.url());
    if(await page.getByRole('button',{name:'Ya autoricé mi cuenta · comprobar',exact:true}).isVisible())await page.getByRole('button',{name:'Ya autoricé mi cuenta · comprobar',exact:true}).click();
    await page.getByRole('button',{name:'Ver conexión',exact:true}).click();
    await card.getByText('Habilitado',{exact:true}).waitFor({timeout:60000});await card.getByText('read_message',{exact:true}).waitFor();
    assert.equal(pkce,true);assert.ok(authorizedRequests>=2);
    assert.equal((await page.locator('body').innerText()).includes(token),false);
    assert.equal((await (await context.request.get(base+'/api/omb/mcp/servers')).text()).includes(token),false);
    await card.getByRole('button',{name:'Eliminar',exact:true}).click();await page.getByRole('button',{name:'Confirmar eliminación',exact:true}).click();await card.waitFor({state:'detached'});created=false;
    console.log(JSON.stringify({mode:'real OMB OAuth with local provider',pkce:true,authorizationFromPanel:true,nativeProbeWithBearer:true,enabledAfterSignIn:true,tokenNotRendered:true,externalAccount:'not exercised'}));
  } finally {
    if(created)await fetch(`http://127.0.0.1:${process.env.FYSO_OMB_PORT}/api/mcp/servers/${name}`,{method:'DELETE'});
    if(browser)await browser.close();await new Promise(resolve=>provider.close(resolve));
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
