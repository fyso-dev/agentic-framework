// Import one existing native identity into the project's native team file. No OMB writes.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
async function importBot(env=process.env) {
  const root=env.FYSO_ROOT,data=env.FYSO_DATA,port=env.FYSO_OMB_PORT,id=env.BOT_ID;
  if(!root||!data||!port||!id||!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('import requires project environment and exact BOT_ID');
  const yaml=createRequire(fs.realpathSync(execFileSync('which',['yaml'],{encoding:'utf8'}).trim()))('yaml');
  const run=(command,args,options={})=>execFileSync(command,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});
  const base=path.join(data,'bot-architect');fs.mkdirSync(base,{recursive:true});
  const lock=path.join(base,'.lock');fs.mkdirSync(lock);
  let temporary;
  try {
    const res=await fetch(`http://127.0.0.1:${port}/api/bots?messages=0`,{signal:AbortSignal.timeout(10000)});
    if(!res.ok)throw new Error('native bot list unavailable');
    const live=(await res.json()).bots,target=live.find(bot=>bot.id===id);
    if(!target)throw new Error('exact bot ID was not found');
    if(live.filter(bot=>bot.name.toLowerCase()===target.name.toLowerCase()).length!==1)throw new Error('native name is ambiguous across teams');
    const projectFile=path.join(root,'project/bots/team.yaml'),original=fs.readFileSync(projectFile,'utf8'),marker='__FYSO_ROOT__';
    const doc=yaml.parseDocument(original.replaceAll('${FYSO_ROOT}',marker));
    if(doc.errors.length)throw new Error('project team file is invalid');
    const declared=doc.toJS().bots||[];
    if(declared.some(bot=>bot.name.toLowerCase()===target.name.toLowerCase())) {
      // Only a committed declaration qualifies for an idempotent successful replay.
      try{run('git',['diff','--quiet','HEAD','--','project/bots/team.yaml']);}catch{throw new Error('project team has uncommitted changes; commit or discard them before importing');}
      const metadata=require('./bot-versioning.cjs').write(env);
      return {action:'import',botId:id,name:target.name,commit:metadata.commit,replayed:true};
    }
    try{run('git',['diff','--quiet','HEAD','--','project/bots/team.yaml']);}catch{throw new Error('project team has uncommitted changes; commit or discard them before importing');}
    temporary=fs.mkdtempSync(path.join(base,'import.'));
    const bundle=path.join(temporary,'bundle');
    run('node',['framework/scripts/export-bots.cjs'],{env:{...env,FYSO_BOT_EXPORT_DIR:bundle}});
    const exported=yaml.parse(fs.readFileSync(path.join(bundle,'team.yaml'),'utf8'));
    const entries=(exported.bots||[]).filter(bot=>bot.name===target.name);
    if(entries.length!==1)throw new Error('native export did not resolve the selected identity');
    const entry=entries[0];
    // The team travels with the bot; bot-management powers do not: a person grants
    // `chief`/`manages` explicitly in team.yaml (D81). Omitted, OMB leaves them as they are.
    delete entry.chief;delete entry.manages;
    // Address the selected native bundle by immutable native ID. Refuse
    // collisions rather than overwriting any existing project-owned files.
    const relative=`imported/${id}`,destination=path.join(root,'project/bots',relative);
    if(fs.existsSync(destination))throw new Error('import destination already exists; inspect it before retrying');
    const candidateDir=path.join(temporary,'candidate');fs.mkdirSync(candidateDir);
    const selected=path.join(candidateDir,'files');fs.mkdirSync(selected);
    for(const reference of [entry.soul,...(entry.skills||[])]) {
      if(!reference || typeof reference!=='object' || !reference.file)continue;
      const source=path.resolve(bundle,reference.file);
      if(!source.startsWith(bundle+path.sep)||!fs.realpathSync(source).startsWith(fs.realpathSync(bundle)+path.sep)||!fs.statSync(source).isFile())throw new Error('native file reference escaped the import bundle');
      const file=path.relative(bundle,source),to=path.join(selected,file);
      fs.mkdirSync(path.dirname(to),{recursive:true});
      if((entry.skills||[]).includes(reference)) {
        const check=folder=>{for(const item of fs.readdirSync(folder,{withFileTypes:true})){if(item.isSymbolicLink())throw new Error('symbolic links are not portable imported files');if(item.isDirectory())check(path.join(folder,item.name));}};
        check(path.dirname(source));fs.cpSync(path.dirname(source),path.dirname(to),{recursive:true});
      }
      else fs.copyFileSync(source,to);
      reference.file=`${relative}/${file}`;
    }
    // OMB exports omit native defaults (for example no cwd and computer auto).
    // Project defaults would silently override those omissions on the next apply.
    // Materialize existing effective defaults, then remove shared inheritance.
    const defaults=doc.toJS().defaults||{};
    if(Object.keys(defaults).some(field=>entry[field]===undefined)) {
      const sequence=doc.get('bots');
      for(const bot of sequence?.items||[])for(const [field,value] of Object.entries(defaults))if(!bot.has(field))bot.set(field,doc.createNode(value));
      doc.delete('defaults');
    }
    if(!doc.has('bots'))doc.set('bots',[]);
    doc.addIn(['bots'],entry);
    const text=doc.toString().replaceAll(marker,'${FYSO_ROOT}');
    const candidate=path.join(candidateDir,'project.yaml');fs.writeFileSync(candidate,text,{mode:0o600});
    run('gitleaks',['dir',candidateDir,'--no-banner','--redact']);
    if(/\/Users\/[\w.-]+|\/home\/[\w.-]+\/|\/private\/tmp\/|\/var\/folders\/|\/opt\/homebrew\//.test(text))throw new Error('import contains a nonportable host path');
    if(fs.readFileSync(projectFile,'utf8')!==original)throw new Error('project team changed during import; retry');
    const hasFiles=fs.readdirSync(selected).length>0;
    const paths=['project/bots/team.yaml',...(hasFiles?[`project/bots/${relative}`]:[])];
    try {
      if(hasFiles){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.cpSync(selected,destination,{recursive:true});}
      fs.writeFileSync(projectFile,text);
      run('git',['add','--',...paths]);
      run('framework/scripts/check-paths.sh',[]);
      run('git',['commit','-q','-m','bots: import native profile into project','--',...paths]);
    } catch(error) {
      // The target was clean before import; roll back only files this operation wrote.
      run('git',['reset','-q','HEAD','--',...paths]);
      if(fs.readFileSync(projectFile,'utf8')===text)fs.writeFileSync(projectFile,original);
      if(hasFiles)fs.rmSync(destination,{recursive:true,force:true});
      throw error;
    }
    const metadata=require('./bot-versioning.cjs').write(env);
    return {action:'import',botId:id,name:target.name,commit:metadata.commit,replayed:false};
  } finally {
    if(temporary)fs.rmSync(temporary,{recursive:true,force:true});fs.rmdirSync(lock);
  }
}
module.exports={importBot};
