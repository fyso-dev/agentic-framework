// Project-owned native MCP definitions; credentials stay encrypted, OAuth stays native.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const namePattern=/^[a-z][a-z0-9_-]{0,31}$/;
const secretPattern=/^\$\{(FYSO_MCP_[A-Z0-9_]+)\}$/;
class McpError extends Error {constructor(code,status=400){super(code);this.code=code;this.status=status;}}
function definition(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['name','type','url','command','args','headers','enabled'].includes(key)))throw new McpError('invalidInput');
  if(!namePattern.test(input.name||''))throw new McpError('invalidInput');
  if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw new McpError('invalidInput');
  const result={enabled:input.enabled===true};
  if(input.url) {
    let url;try{url=new URL(input.url);}catch{throw new McpError('invalidInput');}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||[...url.searchParams.keys()].some(key=>/token|key|secret|password|authorization/i.test(key)))throw new McpError('invalidInput');
    if(input.command||input.args||!['http','sse'].includes(input.type))throw new McpError('invalidInput');
    result.type=input.type;result.url=input.url;
  } else {
    if(typeof input.command!=='string'||!input.command.trim()||input.headers||input.type||!Array.isArray(input.args||[])||(input.args||[]).length>64||(input.args||[]).some(arg=>typeof arg!=='string'))throw new McpError('invalidInput');
    result.command=input.command;result.args=input.args||[];
  }
  if(input.headers) {
    if(typeof input.headers!=='object'||Array.isArray(input.headers)||Object.keys(input.headers).length>32||new Set(Object.keys(input.headers).map(key=>key.toLowerCase())).size!==Object.keys(input.headers).length)throw new McpError('invalidInput');
    for(const [key,value] of Object.entries(input.headers))if(!/^[A-Za-z0-9-]{1,128}$/.test(key)||typeof value!=='string'||/[\r\n]/.test(value))throw new McpError('invalidInput');
    result.headers={...input.headers};
  }
  return result;
}
function mapText(value,transform) {
  if(typeof value==='string')return transform(value);
  if(Array.isArray(value))return value.map(item=>mapText(item,transform));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,mapText(item,transform)]));
  return value;
}
function projectDefinition(value,root) {
  const result=mapText(value,text=>text===root||text.startsWith(root+path.sep)?'${FYSO_ROOT}'+text.slice(root.length):text);
  if(/\/Users\/|\/home\/|\/opt\/homebrew\/|\/private\/tmp\/|\/var\/folders\/|C:\\\\Users\\\\/.test(JSON.stringify(result)))throw new McpError('invalidInput');
  return result;
}
async function operate(op,name,input,env=process.env,request=fetch,command=execFileSync) {
  if(!env.FYSO_ROOT||!env.FYSO_DATA||!/^\d+$/.test(env.FYSO_OMB_PORT||''))throw new McpError('unavailable',503);
  const root=env.FYSO_ROOT,file=path.join(root,'project/omb-mcp.json'),secretFile=path.join(root,'secrets.enc.yaml');
  const commandEnv={...env,SOPS_AGE_KEY_FILE:env.SOPS_AGE_KEY_FILE||env.MISE_SOPS_AGE_KEY_FILE||env.FYSO_COMPOSIO_AGE_KEY_FILE||path.join(env.HOME||'','/.config/mise/age.txt')};
  const run=(bin,args,extra={})=>command(bin,args,{cwd:root,env:commandEnv,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000,...extra});
  const api=async(route,method='GET',body)=>{
    const response=await request(`http://127.0.0.1:${env.FYSO_OMB_PORT}/api/${route}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new McpError('activationPending',503);
    return response.json();
  };
  const read=()=>{
    const saved=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{mcpServers:{}};
    if(!saved.mcpServers||typeof saved.mcpServers!=='object'||Array.isArray(saved.mcpServers)||Object.keys(saved).some(key=>key!=='mcpServers'))throw new McpError('invalidInput');
    for(const [key,value] of Object.entries(saved.mcpServers)) {
      definition({name:key,...value});
      if(Object.values(value.headers||{}).some(value=>!secretPattern.test(value)))throw new McpError('invalidInput');
    }
    return saved;
  };
  const realize=value=>{
    const result=mapText(value,text=>text.replaceAll('${FYSO_ROOT}',root));
    for(const [key,value] of Object.entries(result.headers||{})) {
      const match=secretPattern.exec(value);if(!match)throw new McpError('invalidInput');
      result.headers[key]=run('sops',['decrypt','--extract',`["${match[1]}"]`,secretFile]).replace(/\r?\n$/,'');
    }
    return result;
  };
  const apply=async(name,value,existing)=>{
    const desired=realize(value),enabled=desired.enabled;desired.enabled=false;
    await api(existing?`mcp/servers/${name}`:'mcp/servers',existing?'PUT':'POST',existing?desired:{name,...desired});
    if(enabled) {
      const probe=await api(`mcp/servers/${name}/test`,'POST',{});
      if(probe.ok)await api(`mcp/servers/${name}`,'PATCH',{enabled:true});
      else return false;
    }
    return true;
  };
  if(op==='restore') {
    if(!fs.existsSync(file))return {restored:0,pending:0};
    const saved=read();
    if(!Object.keys(saved.mcpServers).length)return {restored:0,pending:0};
    const names=new Set((await api('mcp/servers')).servers.map(server=>server.name));let restored=0,pending=0;
    for(const [key,value] of Object.entries(saved.mcpServers)){if(await apply(key,value,names.has(key)))restored++;else pending++;}
    return {restored,pending};
  }
  if(!namePattern.test(name||'')||!['create','enable','remove'].includes(op))throw new McpError('invalidInput');
  fs.mkdirSync(env.FYSO_DATA,{recursive:true});const lock=path.join(env.FYSO_DATA,'connector-settings.lock');
  try{fs.mkdirSync(lock);}catch{throw new McpError('busy',409);}
  let original,originalSecrets,committed=false,created=false;
  try {
    if(run('git',['status','--porcelain','--','project/omb-mcp.json']).trim())throw new McpError('pendingMcp',409);
    if(op==='enable'&&(typeof input?.enabled!=='boolean'||Object.keys(input).some(key=>key!=='enabled')))throw new McpError('invalidInput');
    const saved=read(),prior=Object.hasOwn(saved.mcpServers,name)?saved.mcpServers[name]:undefined;
    const native=(await api('mcp/servers')).servers.find(server=>server.name===name);
    if(op==='create'&&native)throw new McpError('duplicateMcp',409);
    if(op!=='create'&&!prior) {
      await api(`mcp/servers/${name}`,op==='remove'?'DELETE':'PATCH',op==='remove'?undefined:{enabled:input.enabled});
      return {saved:false,active:true};
    }
    original=fs.existsSync(file)?fs.readFileSync(file):null;
    const paths=['project/omb-mcp.json'];
    if(op==='create') {
      const value=definition({...input,name,enabled:false});
      if(value.headers&&Object.keys(value.headers).length) {
        if(run('git',['status','--porcelain','--','secrets.enc.yaml']).trim())throw new McpError('pendingMcp',409);
        originalSecrets=fs.readFileSync(secretFile);const temporary=path.join(lock,'secrets.enc.yaml');fs.writeFileSync(temporary,originalSecrets,{mode:0o600});
        for(const [header,credential] of Object.entries(value.headers)) {
          const id=`FYSO_MCP_${name.toUpperCase().replaceAll('-','_')}_${crypto.createHash('sha256').update(name+':'+header.toLowerCase()).digest('hex').slice(0,12).toUpperCase()}`;
          run('sops',['set','--value-stdin',temporary,`["${id}"]`],{input:JSON.stringify(credential)});value.headers[header]='${'+id+'}';
        }
        fs.renameSync(temporary,secretFile);paths.push('secrets.enc.yaml');
      }
      saved.mcpServers[name]=projectDefinition(value,root);
    } else if(op==='enable') {
      if(typeof input?.enabled!=='boolean')throw new McpError('invalidInput');
      saved.mcpServers[name]={...prior,enabled:input.enabled};
    } else delete saved.mcpServers[name];
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(saved,null,2)+'\n',{mode:0o600});
    run('git',['add','--',...paths]);run('gitleaks',['git','--staged','--no-banner','--redact',root]);run('bash',['framework/scripts/check-paths.sh']);
    if(op==='create'){await api('mcp/servers','POST',{name,...realize(saved.mcpServers[name])});created=true;}
    if(run('git',['diff','--cached','--numstat','--',...paths]).trim())run('git',['commit','-qm','connectors: save native MCP definition','--',...paths]);
    committed=true;
    if(op==='remove'){if(native)await api(`mcp/servers/${name}`,'DELETE');return {saved:true,active:true};}
    if(op==='enable') {
      if(!native)await apply(name,{...saved.mcpServers[name],enabled:false},false);
      await api(`mcp/servers/${name}`,'PATCH',{enabled:input.enabled});return {saved:true,active:true};
    }
    return {saved:true,active:true};
  } catch(error) {
    if(!committed&&created){try{await api(`mcp/servers/${name}`,'DELETE');}catch{}}
    if(!committed&&original!==undefined){if(original===null)fs.rmSync(file,{force:true});else fs.writeFileSync(file,original);if(originalSecrets)fs.writeFileSync(secretFile,originalSecrets);try{run('git',['restore','--staged','--','project/omb-mcp.json',...(originalSecrets?['secrets.enc.yaml']:[])]);}catch{}}
    if(error instanceof McpError)throw error;
    throw new McpError(committed?'activationPending':'saveFailed',500);
  } finally {fs.rmSync(lock,{recursive:true,force:true});}
}
module.exports={operate,definition,projectDefinition,McpError};
if(require.main===module)operate('restore',undefined,undefined).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Native MCP restore failed');process.exitCode=1;});
