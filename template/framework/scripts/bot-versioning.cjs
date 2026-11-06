// Report committed native metadata only: file presence is not proof of versioning.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
function collect(root,yaml) {
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const read=file=>{try{return yaml.parse(git(['show',`HEAD:${file}`]).replace(/\$\{([\w]+)\}/g,'__ENV_$1__')).bots||[];}catch{return [];}};
  let commit=null;try{commit=git(['rev-parse','HEAD']);}catch{}
  let projectDirty=false;try{git(['diff','--quiet','HEAD','--','project/bots/team.yaml']);}catch{projectDirty=true;}
  const entries=new Map();
  for(const [file,source] of [['project/bots/team.yaml','project'],['state/bots/team.yaml','snapshot']])for(const bot of read(file)) {
    if(typeof bot.name!=='string')continue;
    const team=bot.team||'',key=JSON.stringify([team,bot.name]);
    const entry=entries.get(key)||{name:bot.name,team,project:false,snapshot:false};entry[source]=true;entries.set(key,entry);
  }
  return {collectedAt:new Date().toISOString(),commit,projectDirty,bots:[...entries.values()]};
}
function write(env=process.env) {
  const yaml=createRequire(fs.realpathSync(execFileSync('which',['yaml'],{encoding:'utf8'}).trim()))('yaml');
  const result=collect(env.FYSO_ROOT||process.cwd(),yaml);
  const target=path.join(env.FYSO_DATA||'.data','panel/bot-versioning.json');fs.mkdirSync(path.dirname(target),{recursive:true});
  const temporary=target+`.${process.pid}.tmp`;fs.writeFileSync(temporary,JSON.stringify(result),{mode:0o600});fs.renameSync(temporary,target);return result;
}
if(require.main===module)write();
module.exports={collect,write};
