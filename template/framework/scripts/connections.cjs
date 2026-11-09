// Read the project's native OMB catalog without returning endpoints or credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const serverName=/^[a-z][a-z0-9_-]{0,31}$/;
function validateTools(value) {
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('tools must contain allow and/or deny lists');
  const result={};
  if(Object.keys(value).some(key=>!['allow','deny'].includes(key)))throw Error('invalid tools selection');
  for(const key of ['allow','deny']) {
    if(!Object.hasOwn(value,key))continue;
    const list=value[key];
    if(!['allow','deny'].includes(key) || !Array.isArray(list) || list.length>256)throw Error('invalid tools selection');
    for(const entry of list) {
      if(typeof entry!=='string' || entry.length>1024 || /[\x00-\x1f\x7f]/.test(entry))throw Error('invalid tool selector');
      const match=/^(?:native:|mcp:([a-z][a-z0-9_-]{0,31}):)(.+)$/.exec(entry);
      if(!match || !match[2].trim() || (match[2]!=='*' && match[2].includes('*')))throw Error('invalid tool selector');
    }
    result[key]=[...new Set(list)];
  }
  return result;
}
async function inventory(env=process.env,request=fetch) {
  const {FYSO_ROOT:root,FYSO_OMB_PORT:port}=env;
  if(!root || !/^\d+$/.test(port||'') || +port<1 || +port>65535)throw Error('explicit project root and OMB port are required');
  const res=await request(`http://127.0.0.1:${port}/api/mcp/servers`,{signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw Error('project OMB connection catalog unavailable');
  const body=await res.json();
  if(!Array.isArray(body.servers))throw Error('invalid native connection catalog');
  const records=new Map(),revisions=[JSON.stringify(body.servers)];
  for(const server of body.servers) {
    if(!serverName.test(server.name))throw Error('invalid native MCP server name');
    records.set(server.name,{name:server.name,sources:['omb'],enabled:server.enabled===true,verification:'not-tested',portable:false});
  }
  const files=['framework/mcp.json','project/mcp.json','project/omb-mcp.json',...[...fs.globSync('extensions/*/mcp.json',{cwd:root})].sort()];
  for(const file of files) {
    const full=path.join(root,file);if(!fs.existsSync(full))continue;
    const source=fs.readFileSync(full,'utf8');revisions.push(file,source);
    const {mcpServers}=JSON.parse(source);
    if(!mcpServers || typeof mcpServers!=='object' || Array.isArray(mcpServers))throw Error('invalid project MCP source');
    for(const name of Object.keys(mcpServers)) {
      if(!serverName.test(name))throw Error('invalid project MCP server name');
      const prior=records.get(name);
      if(prior?.sources.some(source=>source!=='omb'))throw Error(`duplicate project MCP server: ${name}`);
      records.set(name,{name,sources:[...(prior?.sources||[]),file],enabled:prior?.enabled??null,verification:'not-tested',portable:true});
    }
  }
  return {revision:crypto.createHash('sha256').update(JSON.stringify(revisions)).digest('hex'),servers:[...records.values()].sort((a,b)=>a.name.localeCompare(b.name)),authentication:'Use this project OpenMausBot Apps UI. OAuth sign-ins must be renewed after restore; Definitions created in the panel are restored from project/omb-mcp.json; unmanaged native-only entries require import.'};
}
async function checkSelection(tools,env,bot,request) {
  const catalog=await inventory(env,request),known=new Map(catalog.servers.map(s=>[s.name,s]));
  for(const selector of tools.allow||[]) {
    const match=/^mcp:([^:]+):/.exec(selector);if(!match)continue;
    const server=known.get(match[1]);
    if(!server)throw Error(`unknown MCP server: ${match[1]}; connect it in this project first`);
    if(server.enabled===false && server.sources.every(source=>['omb','project/omb-mcp.json'].includes(source)))throw Error(`MCP server is disabled: ${match[1]}`);
    if(bot?.mcpServers && !bot.mcpServers.includes(match[1]) && server.sources.includes('omb'))throw Error(`native bot access excludes ${match[1]}; enable it in OpenMausBot first`);
  }
  return catalog.revision;
}
module.exports={inventory,validateTools,checkSelection};
