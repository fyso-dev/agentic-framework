// Small panel glue: native Composio validation, SOPS persistence and OMB activation;
// managed MCP definitions; extension secrets (D50, extension-secrets.cjs).
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {timingSafeEqual}=require('node:crypto');
class SetupError extends Error {constructor(code,status=400){super(code);this.code=code;this.status=status;}}
function validate(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||typeof input.apiKey!=='string')throw new SetupError('invalidInput');
  const key=input.apiKey.trim();
  if(key.length<8||key.length>4096||/\s|[\x00-\x1f\x7f]/.test(key))throw new SetupError('invalidInput');
  return key;
}
async function configure(input,env=process.env,request=fetch,command=execFileSync) {
  const apiKey=validate(input),root=env.FYSO_ROOT,data=env.FYSO_DATA;
  if(!root||!data||!/^\d+$/.test(env.FYSO_OMB_PORT||''))throw new SetupError('unavailable',503);
  fs.mkdirSync(data,{recursive:true});const lock=path.join(data,'connector-settings.lock');
  try{fs.mkdirSync(lock);}catch{throw new SetupError('busy',409);}
  const file=path.join(root,'secrets.enc.yaml'),temporary=path.join(lock,'secrets.enc.yaml');
  let original,persisted=false;
  const run=(bin,args,extra={})=>command(bin,args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000,env,...extra});
  try {
    // Verify access, without creating sessions, connections or auth configs.
    let response;
    try{response=await request('https://backend.composio.dev/api/v3.1/auth_configs?limit=1',{redirect:'error',headers:{'x-api-key':apiKey},signal:AbortSignal.timeout(15000)});}
    catch{throw new SetupError('providerUnavailable',502);}
    if(!response.ok)throw new SetupError(response.status===401||response.status===403?'invalidKey':'providerUnavailable',response.status===401||response.status===403?422:502);
    let listing;try{listing=await response.json();}catch{throw new SetupError('providerUnavailable',502);}
    if(!Array.isArray(listing.items))throw new SetupError('providerUnavailable',502);
    if(run('git',['status','--porcelain','--','secrets.enc.yaml']).trim())throw new SetupError('pendingSecrets',409);
    original=fs.readFileSync(file);fs.writeFileSync(temporary,original,{mode:0o600});
    // Never put the secret in command arguments, a plaintext file or Dagu data.
    run('sops',['set','--value-stdin',temporary,'["COMPOSIO_API_KEY"]'],{input:JSON.stringify(apiKey)});
    fs.renameSync(temporary,file);
    run('git',['add','--','secrets.enc.yaml']);
    let changed=false;try{run('git',['diff','--cached','--quiet','--','secrets.enc.yaml']);}catch{changed=true;}
    if(changed)run('git',['commit','-qm','connectors: configure Composio','--','secrets.enc.yaml']);
    persisted=true;
    // Native OMB updates its credential environment and config in place.
    let active=false;
    try {
      const result=await request(`http://127.0.0.1:${env.FYSO_OMB_PORT}/api/config`,{method:'PATCH',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({composio:{apiKey}}),signal:AbortSignal.timeout(15000)});
      active=result.ok&&(await result.json()).composio?.configured===true;
    }catch{}
    return {saved:true,active};
  }catch(error){
    if(original&&!persisted){fs.writeFileSync(file,original);try{run('git',['restore','--staged','--','secrets.enc.yaml']);}catch{}}
    if(error instanceof SetupError)throw error;
    // Never return CLI stderr, native errors, provider bodies or key fragments.
    throw new SetupError('saveFailed',500);
  }finally{fs.rmSync(lock,{recursive:true,force:true});}
}
function createServer(env=process.env,save=configure,manage=require('./managed-mcp.cjs').operate,saveExtension=(...args)=>require('./extension-secrets.cjs').configure(...args)) {
  const expected=Buffer.from('Basic '+Buffer.from(`${env.FYSO_ADMIN_USER}:${env.FYSO_ADMIN_PASSWORD}`).toString('base64'));
  const origin=require('./web-origin.cjs').origin('panel',env,env.FYSO_WEB_DOMAIN||'localhost');
  return http.createServer(async(req,res)=>{
    const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
    if(req.url==='/health'&&req.method==='GET')return reply(200,{ok:true});
    const supplied=Buffer.from(req.headers.authorization||'');
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply(401,{error:'unauthorized'});
    const mcp=/^\/api\/connectors\/mcp(?:\/([a-z][a-z0-9_-]{0,31}))?$/.exec(req.url||'');
    const extension=/^\/api\/extensions\/([a-z][a-z0-9-]{1,30})\/secrets$/.exec(req.url||'');
    if(req.url!=='/api/composio/setup'&&!mcp&&!extension)return reply(404,{error:'notFound'});
    const allowed=mcp?(mcp[1]?['PATCH','DELETE']:['POST']):['POST'];
    if(!allowed.includes(req.method))return reply(405,{error:'methodNotAllowed'});
    if(req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return reply(403,{error:'origin'});
    if(req.method!=='DELETE'&&req.headers['content-type']?.split(';')[0]!=='application/json')return reply(415,{error:'invalidInput'});
    try {
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)throw new SetupError('invalidInput',413);}
      let input;try{input=body?JSON.parse(body):{};}catch{throw new SetupError('invalidInput');}
      if(mcp){const op=req.method==='POST'?'create':req.method==='PATCH'?'enable':'remove';const result=await manage(op,mcp[1]||input.name,input,env);return reply(200,result);}
      if(extension)return reply(200,await saveExtension(extension[1],input,env));
      const result=await save(input,env);reply(result.active?200:202,result);
    }catch(error){const known=error instanceof SetupError||error instanceof require('./managed-mcp.cjs').McpError||error instanceof require('./extension-secrets.cjs').SecretsError;reply(known?error.status:500,{error:known?error.code:'saveFailed'});}
  });
}
async function listenSocket(server,socket) {
  if(fs.existsSync(socket)) {
    const stat=fs.lstatSync(socket);
    if(!stat.isSocket()||stat.uid!==process.getuid())throw Error('unsafe connector setup socket');
    await new Promise((resolve,reject)=>{
      const probe=require('node:net').connect(socket);
      probe.once('connect',()=>{probe.destroy();reject(Error('connector setup already running'));});
      probe.once('error',error=>{if(error.code==='ECONNREFUSED'||error.code==='ENOENT')resolve();else reject(error);});
      probe.setTimeout(1000,()=>{probe.destroy();reject(Error('connector setup socket busy'));});
    });
    fs.unlinkSync(socket);
  }
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socket,resolve);});
  fs.chmodSync(socket,0o600);
}
module.exports={validate,configure,createServer,listenSocket,SetupError};
if(require.main===module){
  for(const name of ['FYSO_ROOT','FYSO_DATA','FYSO_OMB_PORT','FYSO_HTTP_PORT','FYSO_CONNECTOR_SETUP_SOCKET','FYSO_ADMIN_USER','FYSO_ADMIN_PASSWORD'])if(!process.env[name])throw new Error(`Missing ${name}`);
  process.umask(0o077);
  const server=createServer();
  listenSocket(server,process.env.FYSO_CONNECTOR_SETUP_SOCKET).catch(()=>{console.error('Connector setup socket unavailable');process.exitCode=1;});
  process.once('SIGTERM',()=>server.close(()=>process.exit(0)));
}
