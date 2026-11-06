// Conversational CRUD is orchestration: native OMB partial teams + Dagu + Git snapshots.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {createRequire}=require('node:module');
const protectedNames=new Set(['mausbot','workflow architect','run operator','builder','bot architect']);
const key=name=>String(name).trim().toLowerCase();
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value);
const allowed=new Set(['name','title','description','model','soul','approval','computer','cwd']);
function validatePatch(input,root) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error('expected one native bot entry');
  for(const field of Object.keys(input)) if(!allowed.has(field)) throw new Error(`unsupported profile field: ${field}`);
  const value={...input};
  for(const [field,text] of Object.entries(value)) if(typeof text!=='string') throw new Error(`${field} must be text`);
  if(value.name!==undefined && !/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,79}$/u.test(value.name)) throw new Error('invalid bot name');
  if(value.approval!==undefined && !['ask','full'].includes(value.approval)) throw new Error('approval must be ask or full');
  if(value.computer!==undefined && value.computer!=='off') throw new Error('this surface supports computer off only');
  if(value.cwd!==undefined && !['${FYSO_ROOT}',root].includes(value.cwd)) throw new Error('cwd must be the project root');
  if(value.cwd) value.cwd='${FYSO_ROOT}';
  if(value.model!==undefined && !/^[\w.-]+\/[\w.\/:_-]+$/.test(value.model)) throw new Error('model must be a native engine/model identifier');
  return value;
}
function guardTarget(bot,action,patch={}) {
  if(!bot) throw new Error('exact bot ID was not found');
  if(key(bot.name)==='bot architect') throw new Error('Bot Architect cannot change its own active profile');
  if(action==='delete' && (bot.chiefOfStaff || protectedNames.has(key(bot.name)))) throw new Error('framework/chief bots cannot be deleted');
  if(patch.name && key(patch.name)!==key(bot.name) && (bot.chiefOfStaff || protectedNames.has(key(bot.name)))) throw new Error('framework/chief bots cannot be renamed');
  if(action==='delete' && (bot.busy || bot.waitingForTeammates || (bot.activity && bot.activity!=='idle') || (bot.tasks||[]).some(t=>t.busy))) throw new Error('the bot is active; wait until it is idle');
}
function yamlLib() {return createRequire(fs.realpathSync(execFileSync('which',['yaml'],{encoding:'utf8'}).trim()))('yaml');}

async function main(env=process.env) {
  const root=env.FYSO_ROOT,data=env.FYSO_DATA,port=env.FYSO_OMB_PORT;
  if(!root||!data||!port) throw new Error('run through mise with project environment');
  process.chdir(root);
  const base=path.join(data,'bot-architect'),projectFile=path.join(root,'project/bots/team.yaml');
  fs.mkdirSync(base,{recursive:true,mode:0o700});
  const yaml=yamlLib();
  const cli=(args)=>execFileSync('openmausbot',[...args,'--port',String(port)],{encoding:'utf8',maxBuffer:8*1024*1024});
  async function bots() {const res=await fetch(`http://127.0.0.1:${port}/api/bots`,{signal:AbortSignal.timeout(10000)});if(!res.ok)throw new Error('native bot list unavailable');return (await res.json()).bots;}
  async function state() {
    const live=await bots();
    const dir=path.join(base,'current');fs.mkdirSync(dir,{recursive:true});
    const exported=path.join(dir,'team.yaml');cli(['team','export','--out',exported]);
    const native=yaml.parse(fs.readFileSync(exported,'utf8'));
    return {live,native,digest:sha(canonical(native)+fs.readFileSync(projectFile,'utf8')+canonical(live.map(b=>[b.id,b.name]).sort()))};
  }
  const op=env.OP||'list';
  if(op==='import')return require('./import-bot.cjs').importBot(env);
  if(op==='list') return {bots:(await bots()).map(b=>({id:b.id,name:b.name,title:b.title,model:b.modelSelection,busy:b.busy,activity:b.activity}))};
  if(op==='read') {
    const current=await state(),bot=current.live.find(b=>b.id===env.BOT_ID);
    if(!bot)throw new Error('exact bot ID was not found');
    if(current.live.filter(b=>key(b.name)===key(bot.name)).length!==1)throw new Error('native team name is ambiguous across teams');
    return {id:bot.id,bot:current.native.bots?.find(b=>key(b.name)===key(bot.name)),revision:current.digest};
  }
  if(op==='plan') {
    const action=env.ACTION;
    if(!['create','update','delete'].includes(action))throw new Error('ACTION must be create, update or delete');
    const current=await state();
    let patch={};
    if(action!=='delete') {
      if(!env.BOT_B64 || env.BOT_B64.length>90000)throw new Error('BOT_B64 must encode one small native bot entry');
      patch=validatePatch(JSON.parse(Buffer.from(env.BOT_B64,'base64').toString('utf8')),root);
    }
    const target=current.live.find(b=>b.id===env.BOT_ID);
    if(target && current.live.filter(b=>key(b.name)===key(target.name)).length!==1)throw new Error('native team name is ambiguous across teams');
    if(action==='create') {
      if(!patch.name||!patch.model||!patch.soul)throw new Error('create requires name, model and inline soul');
      if(current.live.some(b=>key(b.name)===key(patch.name)))throw new Error('bot name already exists');
      patch={approval:'ask',computer:'off',cwd:'${FYSO_ROOT}',...patch};
    } else guardTarget(target,action,patch);
    if(action==='update' && patch.name && current.live.some(b=>b.id!==target.id && key(b.name)===key(patch.name)))throw new Error('bot name already exists');
    const plan={action,targetId:target?.id||null,targetName:target?.name||null,patch,base:current.digest};
    const planId=sha(canonical(plan)),dir=path.join(base,'plans',planId);
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    fs.writeFileSync(path.join(dir,'plan.json'),canonical(plan),{mode:0o600});
    let preview;
    if(action==='delete') preview={plan:[`delete bot ${target.name} (${target.id})`],created:0,changed:0,deleted:1};
    else {
      const desired={...patch,name:patch.name||target.name};
      if(action==='update' && patch.name && patch.name!==target.name)desired.was=target.name;
      const candidate=JSON.stringify({version:1,bots:[desired]}).replaceAll('${FYSO_ROOT}',root);
      const candidateFile=path.join(dir,'team.json');fs.writeFileSync(candidateFile,candidate,{mode:0o600});
      execFileSync('gitleaks',['dir',dir,'--no-banner','--redact'],{stdio:['ignore','ignore','pipe']});
      preview=JSON.parse(cli(['team','apply',candidateFile,'--dry-run','--json']));
      if(preview.deleted || preview.created!==(action==='create'?1:0) || preview.changed>(action==='update'?1:0))throw new Error('native preview would change an unrelated bot');
    }
    return {planId,action,botId:target?.id||null,preview};
  }
  if(op!=='apply')throw new Error('OP must be list, read, plan or apply');
  if(!/^[a-f0-9]{64}$/.test(env.PLAN_ID||''))throw new Error('invalid PLAN_ID');
  const dir=path.join(base,'plans',env.PLAN_ID),receipt=path.join(dir,'receipt.json');
  if(fs.existsSync(receipt))return {...JSON.parse(fs.readFileSync(receipt,'utf8')),replayed:true};
  const plan=JSON.parse(fs.readFileSync(path.join(dir,'plan.json'),'utf8'));
  if(sha(canonical(plan))!==env.PLAN_ID)throw new Error('plan integrity check failed');
  const lock=path.join(base,'.lock');fs.mkdirSync(lock);
  try {
    const current=await state();
    if(current.digest!==plan.base)throw new Error('plan is stale; request a fresh preview');
    const target=current.live.find(b=>b.id===plan.targetId);
    if(plan.action!=='create')guardTarget(target,plan.action,plan.patch);
    // Build and scan the future project file BEFORE touching the runtime.
    const marker='__FYSO_ROOT__';
    const doc=yaml.parseDocument(fs.readFileSync(projectFile,'utf8').replaceAll('${FYSO_ROOT}',marker));
    if(doc.errors.length)throw new Error('project team file is invalid');
    const declared=doc.toJS().bots||[];
    const index=declared.findIndex(b=>key(b.name)===key(plan.targetName));
    if(plan.action==='delete') {if(index>=0)doc.get('bots').items.splice(index,1);}
    else if(index>=0)for(const [field,value] of Object.entries(plan.patch))doc.setIn(['bots',index,field],value.replaceAll('${FYSO_ROOT}',marker));
    else doc.addIn(['bots'],{name:plan.patch.name||plan.targetName,...Object.fromEntries(Object.entries(plan.patch).map(([k,v])=>[k,v.replaceAll('${FYSO_ROOT}',marker)]))});
    const projectText=doc.toString().replaceAll(marker,'${FYSO_ROOT}');
    fs.writeFileSync(path.join(dir,'project.yaml'),projectText,{mode:0o600});
    execFileSync('gitleaks',['dir',dir,'--no-banner','--redact'],{stdio:['ignore','ignore','pipe']});
    const snapshot=()=>{for(const step of ['bots','memory','commit'])execFileSync('framework/scripts/snapshot.sh',[step],{stdio:['ignore','pipe','pipe']});};
    snapshot();
    const before=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    let native;
    if(plan.action==='delete') {
      guardTarget((await bots()).find(b=>b.id===plan.targetId),'delete');
      const res=await fetch(`http://127.0.0.1:${port}/api/bots/${encodeURIComponent(plan.targetId)}`,{method:'DELETE',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(10000)});
      if(!res.ok)throw new Error('native exact-ID deletion failed');native={deleted:1};
    } else native=JSON.parse(cli(['team','apply',path.join(dir,'team.json'),'--json']));
    const verified=await bots();
    const desiredName=plan.patch.name||plan.targetName;
    const found=verified.find(b=>key(b.name)===key(desiredName));
    if(plan.action==='delete' && verified.some(b=>b.id===plan.targetId))throw new Error('native deletion did not remove the target');
    if(plan.action==='create' && (!found || native.created!==1))throw new Error('native creation result did not match the plan');
    if(plan.action==='update' && (!found || found.id!==plan.targetId || native.created))throw new Error('native update changed target identity');
    fs.writeFileSync(projectFile,projectText);
    execFileSync('git',['add','--','project/bots/team.yaml']);
    execFileSync('framework/scripts/check-paths.sh',[],{stdio:['ignore','pipe','pipe']});
    try{execFileSync('git',['diff','--cached','--quiet','--','project/bots/team.yaml']);}
    catch{execFileSync('git',['commit','-q','-m',`bots: ${plan.action} through Bot Architect`,'--','project/bots/team.yaml']);}
    snapshot();
    const live=await bots(),name=plan.patch.name||plan.targetName;
    const result={action:plan.action,planId:env.PLAN_ID,botId:plan.action==='delete'?plan.targetId:live.find(b=>key(b.name)===key(name))?.id,name,beforeCommit:before,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),native};
    fs.writeFileSync(receipt,canonical(result),{mode:0o600});return result;
  } finally {fs.rmdirSync(lock);}
}

async function submit(params,env=process.env) {
  const name='fyso-bot-architect',base=`http://127.0.0.1:${env.FYSO_DAGU_PORT}/api/v1`;
  const headers={Authorization:'Basic '+Buffer.from(`${env.FYSO_ADMIN_USER}:${env.FYSO_ADMIN_PASSWORD}`).toString('base64'),'Content-Type':'application/json'};
  const get=async(url,init)=>{const r=await fetch(url,{headers,signal:AbortSignal.timeout(10000),...init});if(!r.ok)throw new Error(`Dagu request failed (${r.status})`);return r.json();};
  const started=await get(`${base}/dags/${name}/enqueue`,{method:'POST',body:JSON.stringify({params:JSON.stringify(params)})});
  for(let n=0;n<180;n++) {
    let detail;
    try {detail=(await get(`${base}/dag-runs/${name}/${encodeURIComponent(started.dagRunId)}`)).dagRunDetails;}
    catch {await new Promise(resolve=>setTimeout(resolve,1000));continue;}
    if(detail.statusLabel==='succeeded') {
      const output=(await get(`${base}/dag-runs/${name}/${encodeURIComponent(started.dagRunId)}/outputs`)).outputs.result;
      return {runId:started.dagRunId,...(typeof output==='string'?JSON.parse(output):output)};
    }
    if(['failed','aborted','rejected','cancelled'].includes(detail.statusLabel))throw new Error(`Bot Architect workflow failed: ${started.dagRunId}; read its Dagu logs`);
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error(`workflow still active: ${started.dagRunId}; inspect it in Dagu`);
}
if(require.main===module) {
  (process.argv[2]==='submit'?submit(JSON.parse(process.argv[3]||'{}')):main()).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={validatePatch,guardTarget};
