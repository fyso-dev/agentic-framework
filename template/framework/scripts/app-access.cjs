// Native OMB app permissions: preview one exact bot, apply, verify and version its patch.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const slugPattern=/^[a-z0-9][a-z0-9_-]{0,63}$/;
function permissions(bot) {return structuredClone({composio:bot.composio!==false,connectorScopes:bot.connectorScopes??null,connectorTools:bot.connectorTools??null});}
function access(bot,slug) {
  if(bot.composio===false)return 'off';
  if(bot.connectorScopes&&!Object.hasOwn(bot.connectorScopes.apps,slug))return 'off';
  if(bot.connectorTools&&!Object.hasOwn(bot.connectorTools,slug))return 'off';
  return bot.connectorScopes?.apps[slug]||'write';
}
function patchFor(bot,services,changes) {
  if(!changes||typeof changes!=='object'||Array.isArray(changes)||!Object.keys(changes).length||Object.keys(changes).length>200)throw Error('invalid app changes');
  const patch=permissions(bot),apps=bot.composio===false?{}:structuredClone(bot.connectorScopes?.apps||Object.fromEntries([...new Set([...Object.keys(services),...Object.keys(bot.connectorTools||{})])].filter(slug=>access(bot,slug)!=='off').map(slug=>[slug,'write'])));
  for(const [slug,level] of Object.entries(changes)) {
    if(!slugPattern.test(slug)||!['off','read','write'].includes(level))throw Error('invalid app permission');
    if(level==='off'){delete apps[slug];continue;}
    if(!services[slug]?.connected)throw Error('authorize the application before granting access');
    apps[slug]=level;patch.composio=true;
    if(patch.connectorTools&&!Object.hasOwn(patch.connectorTools,slug))patch.connectorTools[slug]={tools:'*'};
  }
  patch.connectorScopes={apps};
  return patch;
}
async function operate(op,input={},env=process.env,request=fetch,verify) {
  if(!env.FYSO_ROOT||!env.FYSO_DATA||!/^\d+$/.test(env.FYSO_OMB_PORT||''))throw Error('explicit project environment required');
  const root=env.FYSO_ROOT,folder=path.join(root,'project/bots/app-access'),plans=path.join(env.FYSO_DATA,'app-access');
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  async function api(route,method='GET',body) {
    const response=await request(`http://127.0.0.1:${env.FYSO_OMB_PORT}/api/${route}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('native app permissions unavailable');
    return response.json();
  }
  const fileFor=bot=>path.join(folder,hash(canonical({name:bot.name,section:bot.section||''}))+'.json');
  const savedPatches=()=>fs.existsSync(folder)?fs.readdirSync(folder).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).map(name=>{
    const file=path.join(folder,name),saved=JSON.parse(fs.readFileSync(file,'utf8'));
    if(Object.keys(saved).some(key=>!['name','section','composio','connectorScopes','connectorTools'].includes(key)))throw Error('invalid saved app patch');
    return {file,saved};
  }):[];
  const sameTeam=(a,b)=>(a.section||'')===(b.section||'');
  const clean=file=>{if(git(['status','--porcelain','--',path.relative(root,file)]))throw Error('commit existing app permission edits first');};
  if(op==='restore') {
    const patches=savedPatches();if(!patches.length)return {restored:0};
    const bots=(await api('bots?messages=0')).bots;let restored=0;
    for(const {saved} of patches) {
      const matches=bots.filter(bot=>bot.name===saved.name&&sameTeam(bot,saved));
      if(matches.length>1)throw Error('ambiguous app permission target');
      if(!matches.length)continue;
      await api(`bots/${encodeURIComponent(matches[0].id)}`,'PATCH',permissions(saved));
      const after=(await api('bots?messages=0')).bots.find(bot=>bot.id===matches[0].id);
      if(canonical(permissions(after))!==canonical(permissions(saved)))throw Error('app permission restore verification failed');
      restored++;
    }
    return {restored};
  }
  async function read(id) {
    if(!/^[\w-]{1,128}$/.test(id||''))throw Error('exact bot ID required');
    const [listing,accounts]=await Promise.all([api('bots?messages=0'),api('connectors/connected')]);
    const bot=listing.bots.find(bot=>bot.id===id);
    if(!bot)throw Error('bot not found');
    if(listing.bots.filter(other=>other.name===bot.name&&(other.section||'')===(bot.section||'')).length!==1)throw Error('ambiguous app permission target');
    const file=fileFor(bot),saved=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
    const services=accounts.services||{},availability=Object.fromEntries(Object.entries(services).map(([slug,state])=>[slug,{connected:state.connected===true}]));
    const revision=hash(canonical({id:bot.id,name:bot.name,section:bot.section||'',permissions:permissions(bot),availability,configured:accounts.configured,complete:accounts.inventoryComplete,saved}));
    return {bot,accounts,file,revision,availability};
  }
  if(op==='read') {
    const current=await read(input.botId);
    return {botId:current.bot.id,revision:current.revision,...permissions(current.bot)};
  }
  if(op==='plan') {
    const current=await read(input.botId);clean(current.file);
    if(input.revision!==current.revision)throw Error('app permissions changed; refresh before previewing');
    if(!current.accounts.configured||current.accounts.inventoryComplete===false)throw Error('complete app inventory required');
    const patch=patchFor(current.bot,current.availability,input.changes);
    const plan={botId:current.bot.id,name:current.bot.name,section:current.bot.section||'',base:current.revision,patch,changes:input.changes};
    const planId=hash(canonical(plan));fs.mkdirSync(plans,{recursive:true,mode:0o700});
    fs.writeFileSync(path.join(plans,planId+'.json'),canonical(plan),{mode:0o600});
    return {planId,changes:input.changes};
  }
  if(op!=='apply'||!/^[a-f0-9]{64}$/.test(input.planId||''))throw Error('invalid app permission action');
  fs.mkdirSync(plans,{recursive:true,mode:0o700});
  const lock=path.join(plans,'.lock');fs.mkdirSync(lock);
  try {
    const plan=JSON.parse(fs.readFileSync(path.join(plans,input.planId+'.json'),'utf8'));
    if(hash(canonical(plan))!==input.planId)throw Error('app permission plan integrity failed');
    const current=await read(plan.botId);clean(current.file);
    if(current.revision!==plan.base)throw Error('app permission plan is stale; preview again');
    const saved={name:plan.name,section:plan.section,...plan.patch};
    fs.mkdirSync(folder,{recursive:true});
    await api(`bots/${encodeURIComponent(plan.botId)}`,'PATCH',plan.patch);
    const verified=(await api('bots?messages=0')).bots.find(bot=>bot.id===plan.botId);
    if(!verified||canonical(permissions(verified))!==canonical(plan.patch))throw Error('native app permission verification failed');
    fs.writeFileSync(current.file,JSON.stringify(saved,null,2)+'\n',{mode:0o600});
    const relative=path.relative(root,current.file);git(['add','--',relative]);
    if(verify)await verify(current.file);
    else {
      execFileSync('gitleaks',['git','--staged','--no-banner','--redact',root],{cwd:root,stdio:['ignore','pipe','pipe']});
      execFileSync(path.join(root,'framework/scripts/check-paths.sh'),[],{cwd:root,stdio:['ignore','pipe','pipe']});
    }
    if(git(['diff','--cached','--numstat','--',relative]))git(['commit','-qm','bots: update native app access','--',relative]);
    return {applied:true,botId:plan.botId,commit:git(['rev-parse','HEAD']),...permissions(verified)};
  } finally {fs.rmdirSync(lock);}
}
if(require.main===module)operate(process.argv[2]||process.env.OP||'read',{botId:process.env.BOT_ID,revision:process.env.REVISION,planId:process.env.PLAN_ID,changes:JSON.parse(Buffer.from(process.env.CHANGES_B64||'e30=','base64').toString('utf8'))}).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('App permission action failed. Refresh and request a new preview; inspect local logs if the problem persists.');process.exitCode=1;});
module.exports={operate,patchFor,access,permissions};
