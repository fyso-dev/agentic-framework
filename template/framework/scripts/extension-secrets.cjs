// Panel glue (D50): save the secrets an extension declares in extensions/<ext>/secrets.yaml.
// Values go to SOPS through stdin, never to arguments, plaintext files, Dagu or logs; only
// secrets.enc.yaml is committed. Then the extension is reloaded and its doctor reports.
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
class SecretsError extends Error {constructor(code,status=400){super(code);this.code=code;this.status=status;}}
const NAME=/^[A-Za-z_][A-Za-z0-9_]*$/;

/** Declared secret names of an installed extension, or null when it is not installed. */
function declared(root,id) {
  const file=path.join(root,'extensions',id,'secrets.yaml');
  if(!fs.existsSync(file))return null;
  const entries=require('./extensions.cjs').read(file);
  return Array.isArray(entries)?entries.map(entry=>entry&&entry.name).filter(name=>typeof name==='string'&&NAME.test(name)):[];
}

/** `{values:{NAME:value}}` with declared names only; blank fields mean "keep". */
function validate(input,names) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1)throw new SecretsError('invalidInput');
  const values=input.values;
  if(!values||typeof values!=='object'||Array.isArray(values))throw new SecretsError('invalidInput');
  const result={};
  for(const [name,raw] of Object.entries(values)) {
    if(!names.includes(name)||typeof raw!=='string')throw new SecretsError('invalidInput');
    const value=raw.trim();
    if(!value)continue;
    if(value.length>4096||/[\x00-\x1f\x7f]/.test(value))throw new SecretsError('invalidInput');
    result[name]=value;
  }
  if(!Object.keys(result).length)throw new SecretsError('invalidInput');
  return result;
}

async function configure(id,input,env=process.env,command=execFileSync,names=declared) {
  const root=env.FYSO_ROOT,data=env.FYSO_DATA;
  if(!root||!data)throw new SecretsError('unavailable',503);
  if(!/^[a-z][a-z0-9-]{1,30}$/.test(id||''))throw new SecretsError('notFound',404);
  const list=names(root,id);
  if(!list||!list.length)throw new SecretsError('notFound',404);
  const values=validate(input,list);
  fs.mkdirSync(data,{recursive:true});
  // Same lock as the connector setup: one SOPS writer at a time.
  const lock=path.join(data,'connector-settings.lock');
  try{fs.mkdirSync(lock);}catch{throw new SecretsError('busy',409);}
  const file=path.join(root,'secrets.enc.yaml'),temporary=path.join(lock,'secrets.enc.yaml');
  let original,persisted=false;
  const run=(bin,args,extra={})=>command(bin,args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:120000,env,...extra});
  try {
    if(run('git',['status','--porcelain','--','secrets.enc.yaml']).trim())throw new SecretsError('pendingSecrets',409);
    original=fs.readFileSync(file);fs.writeFileSync(temporary,original,{mode:0o600});
    for(const [name,value] of Object.entries(values))run('sops',['set','--value-stdin',temporary,JSON.stringify([name])],{input:JSON.stringify(value)});
    fs.renameSync(temporary,file);
    run('git',['add','--','secrets.enc.yaml']);
    let changed=false;try{run('git',['diff','--cached','--quiet','--','secrets.enc.yaml']);}catch{changed=true;}
    if(changed)run('git',['commit','-qm',`extensions: configure ${id}`,'--','secrets.enc.yaml']);
    persisted=true;
  }catch(error){
    if(original&&!persisted){fs.writeFileSync(file,original);try{run('git',['restore','--staged','--','secrets.enc.yaml']);}catch{}}
    if(error instanceof SecretsError)throw error;
    // Never return CLI stderr or value fragments.
    throw new SecretsError('saveFailed',500);
  }finally{fs.rmSync(lock,{recursive:true,force:true});}
  // Reload the extension with the new values: processes, connect hook, panel data, doctor.
  let report={};
  try{report=JSON.parse(run('mise',['exec','--','framework/scripts/ext.sh','configured',id]).trim().split('\n').pop());}catch{}
  return {saved:true,missing:Array.isArray(report.missing)?report.missing:[],check:['ok','failed','none'].includes(report.check)?report.check:'unknown'};
}
module.exports={declared,validate,configure,SecretsError};
