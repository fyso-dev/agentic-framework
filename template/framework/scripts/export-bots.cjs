// Native OMB export bundle; ambient CLI skills stay with the host, imported skills travel with the project.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const yaml=createRequire(fs.realpathSync(execFileSync('which',['yaml'],{encoding:'utf8'}).trim()))('yaml');
const {portable}=require('./portable-state.cjs');
async function run() {
  const env=process.env;
  fs.mkdirSync(env.FYSO_DATA,{recursive:true});
  const tmp=fs.mkdtempSync(path.join(env.FYSO_DATA,'bot-export.'));
  const cli=args=>execFileSync('openmausbot',[...args,'--port',env.FYSO_OMB_PORT],{encoding:'utf8',maxBuffer:8*1024*1024});
  try {
    cli(['team','export','--out',path.join(tmp,'team.yaml')]);
    const team=yaml.parse(fs.readFileSync(path.join(tmp,'team.yaml'),'utf8'));
    const live=JSON.parse(cli(['bots','--json'])).bots;
    for(const entry of team.bots||[]) {
      const bot=live.find(b=>b.name===entry.name && (!entry.team || b.section===entry.team));
      if(!bot)throw new Error('exported bot identity unavailable');
      const res=await fetch(`http://127.0.0.1:${env.FYSO_OMB_PORT}/api/bots/${encodeURIComponent(bot.id)}/skills`,{signal:AbortSignal.timeout(10000)});
      if(!res.ok)throw new Error('skill provenance unavailable');
      const ambient=new Set((await res.json()).skills.filter(s=>s.origin==='native').map(s=>s.name));
      if(entry.skills) {
        entry.skills=entry.skills.filter(s=>!ambient.has(path.basename(path.dirname(s.file))));
        if(!entry.skills.length)delete entry.skills;
      }
    }
    const target=env.FYSO_BOT_EXPORT_DIR||'state/bots';fs.mkdirSync(target,{recursive:true});
    const selected=path.join(tmp,'selected-skills');fs.mkdirSync(selected);
    for(const bot of team.bots||[])for(const skill of bot.skills||[]) {
      const source=path.resolve(tmp,skill.file);
      if(!source.startsWith(tmp+path.sep+'skills'+path.sep))throw new Error('export skill path escaped bundle');
      const relative=path.relative(path.join(tmp,'skills'),path.dirname(source));
      const destination=path.join(selected,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});
      fs.cpSync(path.dirname(source),destination,{recursive:true});
    }
    fs.rmSync(path.join(target,'skills'),{recursive:true,force:true});
    fs.cpSync(selected,path.join(target,'skills'),{recursive:true});
    fs.writeFileSync(path.join(target,'team.yaml'),portable(JSON.stringify(team,null,2)+'\n',env.FYSO_ROOT,env.HOME));
    execFileSync('node',['framework/scripts/portable-state.cjs',target]);
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
}
run().catch(()=>{console.error('native bot export failed; no snapshot committed');process.exitCode=1;});
