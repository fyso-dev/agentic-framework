// Two native OMB feature switches, persisted as a native config patch in the project.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const names=['claudeUserMcp','claudeUserSkills'];
function validate(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || !Object.keys(input).length || Object.entries(input).some(([key,value])=>!names.includes(key)||typeof value!=='boolean'))throw Error('only native Claude MCP/skills boolean preferences are supported');
  return {...input};
}
function projectPatch(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>key!=='features'))throw Error('invalid native connector preferences file');
  return {features:validate(input.features)};
}
async function operate(op,input,env=process.env,request=fetch) {
  if(!env.FYSO_ROOT || !/^\d+$/.test(env.FYSO_OMB_PORT||''))throw Error('explicit project environment required');
  const file=path.join(env.FYSO_ROOT,'project/omb-connectors.json');
  async function api(method='GET',body) {
    const response=await request(`http://127.0.0.1:${env.FYSO_OMB_PORT}/api/config`,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('native connector preferences unavailable');
    const data=await response.json();return Object.fromEntries(names.map(name=>[name,data.features?.[name]===true]));
  }
  if(op==='read')return {features:await api(),versioned:fs.existsSync(file)};
  if(op==='restore') {
    if(!fs.existsSync(file))return {restored:false};
    const patch=projectPatch(JSON.parse(fs.readFileSync(file,'utf8')));
    const after=await api('PATCH',patch);
    for(const [name,value] of Object.entries(patch.features))if(after[name]!==value)throw Error('native preference restore did not match');
    return {restored:true,features:after};
  }
  if(op!=='save')throw Error('OP must be read, save or restore');
  const features=validate(input);
  const status=execFileSync('git',['status','--porcelain','--','project/omb-connectors.json'],{cwd:env.FYSO_ROOT,encoding:'utf8'});
  if(status.trim())throw Error('commit existing connector preference edits before changing them in the panel');
  const after=await api('PATCH',{features});
  for(const [name,value] of Object.entries(features))if(after[name]!==value)throw Error('native preference save did not match');
  fs.writeFileSync(file,JSON.stringify({features:after},null,2)+'\n');
  execFileSync('git',['add','--','project/omb-connectors.json'],{cwd:env.FYSO_ROOT});
  try{execFileSync('git',['diff','--cached','--quiet','--','project/omb-connectors.json'],{cwd:env.FYSO_ROOT});}
  catch{execFileSync('git',['commit','-qm','connectors: save native Claude preferences','--','project/omb-connectors.json'],{cwd:env.FYSO_ROOT});}
  return {features:after,versioned:true};
}
module.exports={validate,projectPatch,operate};
if(require.main===module) {
  let input;
  try{input=process.env.SETTINGS_B64?JSON.parse(Buffer.from(process.env.SETTINGS_B64,'base64').toString('utf8')):undefined;}
  catch{console.error('invalid preference payload');process.exit(1);}
  operate(process.argv[2]||process.env.OP||'read',input).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
