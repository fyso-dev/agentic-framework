// Keep native team file references relative to their source, not the temporary render.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const yaml=createRequire(fs.realpathSync(execFileSync('which',['yaml'],{encoding:'utf8'}).trim()))('yaml');
const source=process.argv[2],base=path.resolve(process.argv[3]||path.dirname(source));
const marker='__FYSO_PATH_ROOT__';
const team=yaml.parse(fs.readFileSync(source,'utf8').replaceAll('${FYSO_ROOT}',marker));
function resolveFiles(value) {
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)) {
    if(typeof child==='string') {
      const text=child.replaceAll(marker,(key==='file'||key==='cwd')?process.env.FYSO_ROOT:'${FYSO_ROOT}');
      value[key]=key==='file'&&!path.isAbsolute(text)?path.resolve(base,text):text;
    } else resolveFiles(child);
  }
}
resolveFiles(team);
// Skills from outside the project reach OpenMausBot only with the content a person
// confirmed (D64); entries that are off and whose file is gone are left out as well.
const {gate}=require('./skills.cjs');
for(const bot of [team.defaults,...(Array.isArray(team.bots)?team.bots:[])]) {
  if(!Array.isArray(bot?.skills))continue;
  bot.skills=bot.skills.filter(entry=>entry?.enabled !== false || !entry.file || fs.existsSync(entry.file)).map(entry=>gate(entry,bot.name) ? entry : {...entry,enabled:false});
  if(!bot.skills.length)delete bot.skills;
}
process.stdout.write(JSON.stringify(team));
