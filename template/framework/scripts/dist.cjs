// Project distributions (D56): glue around git, Copier and SOPS. See docs/distribution.md.
// The publisher exports committed configuration, documents and bot memory as a Copier
// template; clients receive it with `copier copy`/`copier recopy` (its files win), then
// merge the delivered memory into their own with `git merge-file --union`.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync,spawnSync}=require('node:child_process');

const CONFIG='project/distribution.yaml';
const DIST='state/dist',MANIFEST=`${DIST}/manifest.json`,SECRETS=`${DIST}/secrets.sops.yaml`,MEMORY=`${DIST}/memory`;
const ANSWERS='.copier-answers.dist.yml';
// Biz transport: `repo: biz` in project/distribution.yaml. The publisher keeps a git mirror of the
// distribution; clients unbundle what Biz serves into BIZ_SRC. Both are relative to the project
// root, which is also what the (tracked) answers file records as the Copier source: no machine path.
const PENDING='.data/dist/secrets-pending.json',BIZ_MIRROR='.data/dist/biz-mirror',BIZ_SRC='.data/dist/biz-source',BIZ_ROUTE='/oauth/framework-access';
// Per-instance credentials are never sent: the Dagu technical password (D19) and web users.
const PRIVATE=new Set(['FYSO_ADMIN_PASSWORD','FYSO_AUTH_USERS']);
const NAME=/^[A-Za-z_][A-Za-z0-9_]*$/;
const MACHINE_PATH=/\/Users\/[A-Za-z0-9._-]+|\/home\/[A-Za-z0-9._-]+\/|\/private\/tmp\/|\/var\/folders\/|\/opt\/homebrew\/|C:\\Users\\/;

const fail=message=>{const error=new Error(message);error.user=true;throw error;};
const run=(bin,args,options={})=>execFileSync(bin,args,{stdio:['pipe','pipe','pipe'],maxBuffer:1<<28,...options});
const git=(args,options)=>run('git',args,options);
// sops reads a file, and on Linux /dev/stdin cannot be opened when stdin is the socket node provides.
const sopsEncrypt=(args,text,options={})=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-sops-'));
  try{const file=path.join(dir,'plain');fs.writeFileSync(file,text,{mode:0o600});return run('sops',[...args,file],options);}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
};
const readYaml=file=>require('./extensions.cjs').read(file);
// Team files write `${FYSO_ROOT}` unquoted inside flow maps (the template's own does), which YAML cannot parse:
// parse with a marker, as managed-bots.cjs does. Only bot names are read from it.
const readTeam=file=>require('./extensions.cjs').parse(fs.readFileSync(file,'utf8').replaceAll('${FYSO_ROOT}','__FYSO_PATH_ROOT__'));

/** Where a committed project file goes in the distribution, or null when it stays here. */
function target(file) {
  if(file===CONFIG||file.startsWith('project/auth/'))return null;
  if(file.startsWith('project/')||file.startsWith('state/bots/')||file.startsWith('extensions/'))return file;
  if(/^\.copier-answers\.ext-[a-z][a-z0-9-]{1,30}\.yml$/.test(file))return file;
  if(/^\.config\/mise\/conf\.d\/ext-[^/]+\.toml$/.test(file))return file;
  // Memory, not conversations: daily logs quote user messages, so they stay here.
  const memory=/^state\/memory\/([^/]+)\/(MEMORY\.md|memory\/.+)$/.exec(file);
  if(memory&&!memory[2].startsWith('memory/log/'))return `${MEMORY}/${memory[1]}/${memory[2]}`;
  return null;
}

/** Committed regular files of HEAD; symlinks point into framework/, which clients already have. */
function committed() {
  const out=git(['ls-tree','-r','-z','--full-tree','HEAD']).toString('utf8');
  return out.split('\0').filter(Boolean).map(line=>{
    const [meta,file]=line.split('\t');const [mode,,sha]=meta.split(' ');
    return {mode,sha,file};
  }).filter(entry=>entry.mode==='100644'||entry.mode==='100755');
}

function config() {
  if(!fs.existsSync(CONFIG))fail(`${CONFIG} is missing. Create it with at least:\n  repo: gh:<org>/<distribution-repo>`);
  const data=readYaml(CONFIG)||{};
  if(typeof data.repo!=='string'||!data.repo.trim())fail(`${CONFIG}: set repo (the Git repository clients install from)`);
  const secrets=data.secrets??[],recipients=data.recipients??[];
  if(!Array.isArray(secrets)||!secrets.every(name=>typeof name==='string'&&NAME.test(name)))fail(`${CONFIG}: secrets must be a list of secret names`);
  if(!Array.isArray(recipients)||!recipients.every(key=>typeof key==='string'&&/^age1[0-9a-z]+$/.test(key)))fail(`${CONFIG}: recipients must be age public keys (age1…)`);
  const blocked=secrets.filter(name=>PRIVATE.has(name));
  if(blocked.length)fail(`${CONFIG}: ${blocked.join(', ')} belong to each installation and are never sent`);
  const repo=data.repo.trim(),biz=repo==='biz';
  // With Biz the recipients come from the server too, so the yaml list may be empty.
  if(secrets.length&&!recipients.length&&!biz)fail(`${CONFIG}: sending secrets needs the clients' public keys in recipients (they print it with 'mise run dist:key')`);
  return {repo,biz,secrets,recipients};
}

/** Copier understands gh:/gl:; git needs the full URL. */
function cloneUrl(repo) {
  const short=/^(gh|gl):(.+?)(?:\.git)?$/.exec(repo);
  if(!short)return repo;
  return `https://${short[1]==='gh'?'github.com':'gitlab.com'}/${short[2]}.git`;
}

function keyFile(env=process.env) {
  return env.SOPS_AGE_KEY_FILE||env.MISE_SOPS_AGE_KEY_FILE||path.join(os.homedir(),'.config/mise/age.txt');
}
function decrypt(file) {
  return JSON.parse(run('sops',['decrypt','--output-type','json',file],{env:{...process.env,SOPS_AGE_KEY_FILE:keyFile()}}).toString('utf8'));
}

function frameworkVersion() {
  try {return String(readYaml('.copier-answers.yml')?._commit||'')||null;} catch {return null;}
}

/**
 * HTTP to Biz through a small adapter: base URL and a command that prints a fresh access token
 * come from the environment (the Biz extension provides both). The token is never logged.
 * `fetchImpl` is injectable for tests.
 */
function bizClient(env=process.env,fetchImpl=globalThis.fetch) {
  const base=String(env.FYSO_DIST_BIZ_URL||'').replace(/\/+$/,''),command=env.FYSO_DIST_BIZ_TOKEN_CMD,organization=String(env.FYSO_DIST_BIZ_ORGANIZATION||'').trim();
  if(!base||!command||!organization)fail('the Biz transport needs FYSO_DIST_BIZ_URL, FYSO_DIST_BIZ_TOKEN_CMD and FYSO_DIST_BIZ_ORGANIZATION (the Biz extension sets them)');
  let token=null;
  const bearer=()=>{
    if(token)return token;
    const result=spawnSync(command,{shell:true,encoding:'utf8',env});
    if(result.status!==0||!result.stdout.trim())fail('FYSO_DIST_BIZ_TOKEN_CMD did not print an access token; reconnect to Biz');
    return token=result.stdout.trim();
  };
  const request=async(method,route,{headers={},body}={})=>{
    let response;
    try {response=await fetchImpl(`${base}${BIZ_ROUTE}${route}?organization=${encodeURIComponent(organization)}`,{method,body,headers:{...headers,Authorization:`Bearer ${bearer()}`}});}
    catch(error) {fail(`Biz is not reachable (${error.cause?.code||error.message})`);}
    const bytes=Buffer.from(await response.arrayBuffer());
    if(response.status>=400) {
      let code='';try {code=JSON.parse(bytes.toString('utf8')).error||'';} catch {/* not JSON */}
      let detail='';try {detail=JSON.parse(bytes.toString('utf8')).current||'';} catch {/* not JSON */}
      fail(bizMessage(response.status,code,detail));
    }
    return {status:response.status,headers:response.headers,body:bytes};
  };
  return {request};
}

function bizMessage(status,code,current) {
  if(status===401)return 'Biz rejected the access token; reconnect to Biz';
  if(status===403)return code==='admin_required'?'publishing a setup needs an organization admin in Biz'
    :'Biz denied access: this person has no admin role or department, or lost access';
  if(status===404)return 'Biz has no setup published yet for this organization';
  if(status===409)return `version conflict: Biz already has ${current||'a newer version'}; publish a version greater than that`;
  if(code==='manifest_too_large')return 'Biz refused the setup summary (manifest_too_large): too many extensions, MCP servers, bots or secrets';
  if(status===413)return 'the setup is too large for Biz (limit 50 MiB)';
  return `Biz answered ${status}${code?` (${code})`:''}`;
}

const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

/** Download the setup bundle, verify its checksum and unbundle it into `dest` (a git repo with tags). */
async function bizDownload(client,dest) {
  const response=await client.request('GET','/setup');
  const expected=String(response.headers.get('x-setup-sha256')||'').toLowerCase();
  if(!expected||sha256(response.body)!==expected)fail('the downloaded setup does not match its checksum; nothing was installed');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-bundle-'));
  try {
    const file=path.join(dir,'setup.bundle');
    fs.writeFileSync(file,response.body);
    fs.rmSync(dest,{recursive:true,force:true});
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    git(['clone','-q',file,dest]);
    git(['-C',dest,'remote','remove','origin']);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
  return response.headers.get('x-setup-version');
}

async function bizRecipients(client) {
  const response=await client.request('GET','/recipients');
  const list=JSON.parse(response.body.toString('utf8')).recipients||[];
  return list.map(entry=>entry.age_public_key).filter(key=>/^age1[0-9a-z]+$/.test(key));
}

/** The publisher's mirror: a git repo continuing Biz's history, so versions keep counting up. */
async function bizMirror(client) {
  const mirror=path.resolve(BIZ_MIRROR);
  if(!fs.existsSync(path.join(mirror,'.git'))) {
    try {await bizDownload(client,mirror);}
    catch(error) {
      if(!/no setup published/.test(error.message))throw error;
      fs.mkdirSync(mirror,{recursive:true});
      git(['init','-q','-b','main',mirror]);
    }
  } else if(spawnSync('git',['-C',mirror,'rev-parse','-q','--verify','HEAD']).status===0) {
    git(['-C',mirror,'reset','-q','--hard']);git(['-C',mirror,'clean','-fdxq']);
  }
  return mirror;
}

/** What Biz displays about a setup: the manifest plus names only (never values). */
function bizSummary(template,secretNames) {
  const manifest=JSON.parse(fs.readFileSync(path.join(template,MANIFEST),'utf8'));
  const read=rel=>{const file=path.join(template,rel);return fs.existsSync(file)?file:null;};
  const mcp=read('project/mcp.json'),team=read('project/bots/team.yaml');
  return {framework:manifest.framework??null,files_count:manifest.files.length,extensions:extensionIds(manifest.files),
    mcp_servers:mcp?Object.keys(JSON.parse(fs.readFileSync(mcp,'utf8')).mcpServers||{}):[],
    bots:team?botNames(readTeam(team)):[],secrets:secretNames};
}
const botNames=team=>(team?.bots||[]).map(bot=>bot?.name).filter(name=>typeof name==='string');
const extensionIds=files=>[...new Set(files.map(file=>/^extensions\/([^/]+)\//.exec(file)?.[1]||/^\.copier-answers\.ext-(.+)\.yml$/.exec(file)?.[1]).filter(Boolean))].sort();

const COPIER_YML=`# Fyso project distribution (D56). Generated by \`mise run dist:publish\`; do not edit here.
# Install:  mise run dist:add <this repository>    Update:  mise run dist:update
_min_copier_version: "9.4.0"
_subdirectory: template
_answers_file: ${ANSWERS}
# Nothing here is a Jinja template: files are delivered exactly as committed.
_templates_suffix: .fyso-dist-jinja
_preserve_symlinks: true
_exclude: [".git", ".DS_Store"]
`;

async function publish(requested) {
  const {repo,biz,secrets,recipients:listed}=config();
  if(git(['status','--porcelain','--','project','state','extensions']).toString().trim())
    console.error('note: uncommitted changes are not published (run `mise run snapshot` or commit them first)');
  let client=null,recipients=listed,work;
  if(biz) {
    client=bizClient();
    // Everyone Biz knows is a recipient; a person who registers later is added on the next publish.
    if(secrets.length)recipients=[...new Set([...listed,...await bizRecipients(client)])];
    if(secrets.length&&!recipients.length)fail('nobody has registered an age key in Biz yet (members run `mise run dist:key`, the Biz extension registers it)');
    work=await bizMirror(client);
  } else {
    work=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-dist-'));
    git(['clone','-q',cloneUrl(repo),work]);
  }
  try {
    const previousSecrets=path.join(work,'template',SECRETS);
    const previous=fs.existsSync(previousSecrets)?fs.readFileSync(previousSecrets):null;
    // Rebuild from scratch, so files removed here disappear from the distribution too.
    for(const entry of fs.readdirSync(work))if(entry!=='.git')fs.rmSync(path.join(work,entry),{recursive:true,force:true});
    const template=path.join(work,'template'),files=[];
    for(const {mode,sha,file} of committed()) {
      const dest=target(file);if(!dest)continue;
      const out=path.join(template,dest);
      fs.mkdirSync(path.dirname(out),{recursive:true});
      fs.writeFileSync(out,git(['cat-file','blob',sha]),{mode:mode==='100755'?0o755:0o644});
      files.push(dest);
    }
    if(!files.length)fail('nothing to publish: commit the project configuration first');
    scan(template,files);
    if(secrets.length) {
      const values=decrypt('secrets.enc.yaml'),picked={};
      const missing=secrets.filter(name=>!(name in values));
      if(missing.length)fail(`not in secrets.enc.yaml: ${missing.join(', ')}`);
      for(const name of secrets)picked[name]=values[name];
      // Plaintext goes through stdin only; the file opens with each client's own key.
      // The publisher is a recipient too, so it can tell whether anything changed: SOPS output
      // differs on every run, and an unchanged version must not be published again.
      const own=run('age-keygen',['-y',keyFile()]).toString().trim();
      const everyone=[...new Set([...recipients,own])].sort();
      let encrypted=previous&&sameSecrets(previous,picked,everyone,work)?previous:null;
      if(!encrypted) {
        // An explicit config: the project's .sops.yaml names this project's keys, not the clients'.
        const rules=path.join(work,'.git','fyso-dist-sops.yaml');
        fs.writeFileSync(rules,`creation_rules:\n  - age: ${everyone.join(',')}\n`);
        encrypted=sopsEncrypt(['--config',rules,'encrypt','--input-type','json','--output-type','yaml'],JSON.stringify(picked));
      }
      fs.mkdirSync(path.join(template,DIST),{recursive:true});
      fs.writeFileSync(path.join(template,SECRETS),encrypted);
      files.push(SECRETS);
    }
    files.sort();
    fs.mkdirSync(path.join(template,DIST),{recursive:true});
    fs.writeFileSync(path.join(template,MANIFEST),JSON.stringify({framework:frameworkVersion(),files},null,2)+'\n');
    fs.writeFileSync(path.join(work,'copier.yml'),COPIER_YML);
    fs.writeFileSync(path.join(template,`{{_copier_conf.answers_file}}.fyso-dist-jinja`),'# Installed distribution (D56). Updated by `mise run dist:update`; do not edit.\n{{ _copier_answers|to_nice_yaml }}');
    fs.writeFileSync(path.join(work,'README.md'),`# ${process.env.FYSO_PROJECT_NAME||'Fyso'} distribution\n\nConfiguration, documents and bot memory of a Fyso project, published with \`mise run dist:publish\`.\n\nIn a Fyso project: \`mise run dist:add <this repository>\`, later \`mise run dist:update\`.\nThe distribution's files replace local edits; delivered memory is merged with each project's own.\n`);
    git(['-C',work,'add','-A']);
    const tags=git(['-C',work,'tag','--list']).toString().split('\n').filter(Boolean);
    const unchanged=spawnSync('git',['-C',work,'diff','--cached','--quiet']).status===0;
    if(unchanged&&tags.length){console.log(`no changes since the last version; nothing published`);return;}
    const version=nextVersion(requested,tags);
    git(['-C',work,'commit','-q','-m',`Distribution ${version}`]);
    git(['-C',work,'tag',version]);
    if(biz) {
      try {await bizUpload(client,work,version,bizSummary(template,secrets));}
      catch(error) {
        // Not published: forget the version here so the next publish builds it again.
        git(['-C',work,'tag','-d',version]);
        if(tags.length)git(['-C',work,'reset','-q','--hard','HEAD~1']);else git(['-C',work,'update-ref','-d','HEAD']);
        throw error;
      }
    } else git(['-C',work,'push','-q','origin','HEAD',`refs/tags/${version}`]);
    console.log(`published ${version} (${files.length} files${secrets.length?`, secrets: ${secrets.join(', ')}`:''}) to ${biz?'Biz':repo}`);
  } finally {if(!biz)fs.rmSync(work,{recursive:true,force:true});}
}

async function bizUpload(client,work,version,summary) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-bundle-'));
  try {
    const file=path.join(dir,'setup.bundle');
    git(['-C',work,'bundle','create','-q',file,'--all']);
    const body=fs.readFileSync(file);
    const encoded=Buffer.from(JSON.stringify(summary)).toString('base64');
    if(encoded.length>8192)fail(`the setup summary is too large for Biz (${encoded.length} bytes encoded, limit 8192): too many extensions, MCP servers, bots or secrets`);
    await client.request('PUT','/setup',{body,headers:{'Content-Type':'application/octet-stream','X-Setup-Version':version,
      'X-Setup-Sha256':sha256(body),'X-Setup-Manifest':encoded}});
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
}

function sameSecrets(previous,picked,recipients,work) {
  const file=path.join(work,'.git','fyso-dist-previous.sops.yaml');
  try {
    fs.writeFileSync(file,previous);
    const meta=readYaml(file)?.sops?.age||[];
    const before=meta.map(entry=>entry.recipient).sort();
    if(JSON.stringify(before)!==JSON.stringify(recipients))return false;
    const values=decrypt(file);
    return JSON.stringify(Object.keys(values).sort().map(name=>[name,values[name]]))===JSON.stringify(Object.keys(picked).sort().map(name=>[name,picked[name]]));
  } catch {return false;} finally {fs.rmSync(file,{force:true});}
}

function nextVersion(requested,tags) {
  if(requested) {
    const version=requested.startsWith('v')?requested:`v${requested}`;
    if(!/^v\d+(\.\d+){0,2}$/.test(version))fail(`invalid version ${requested} (use 1, 2, … or 1.2.0)`);
    if(tags.includes(version))fail(`${version} is already published`);
    return version;
  }
  const numbers=tags.map(tag=>/^v(\d+)$/.exec(tag)).filter(Boolean).map(match=>Number(match[1]));
  return `v${numbers.length?Math.max(...numbers)+1:1}`;
}

/** Same checks as a snapshot (gitleaks + machine paths), before anything leaves this machine. */
function scan(template,files) {
  const leaks=spawnSync('gitleaks',['dir','--no-banner','--redact',template],{stdio:['ignore','inherit','inherit']});
  if(leaks.status!==0)fail('gitleaks found possible secrets in the files to publish; nothing was published');
  const machine=files.filter(file=>MACHINE_PATH.test(fs.readFileSync(path.join(template,file),'latin1')));
  if(machine.length)fail(`machine-specific paths in: ${machine.join(', ')}; nothing was published`);
}

function show(ref,file) {
  if(!ref)return null;
  const result=spawnSync('git',['show',`${ref}:${file}`],{maxBuffer:1<<28});
  return result.status===0?result.stdout:null;
}
const manifestFiles=content=>content?JSON.parse(content.toString('utf8')).files||[]:[];

/** Remove files an earlier version delivered and the new one no longer has. */
function prune(base) {
  if(!fs.existsSync(MANIFEST))return;
  const now=new Set(manifestFiles(fs.readFileSync(MANIFEST)));
  for(const file of manifestFiles(show(base,MANIFEST))) {
    if(now.has(file)||!fs.existsSync(file))continue;
    fs.rmSync(file);console.log(`removed (no longer distributed): ${file}`);
  }
  const framework=JSON.parse(fs.readFileSync(MANIFEST,'utf8')).framework,mine=frameworkVersion();
  if(framework&&mine&&framework!==mine)
    console.error(`note: published with framework ${framework}, this project has ${mine}; update the framework (copier update) if something is missing`);
}

/**
 * Extension ports belong to each installation's block (PLAN §3.1): the publisher's values are
 * replaced by ports of this project's extension range (base + 10..19), keeping the one this
 * project already used for that extension. Only the slots that hold them change: the
 * `FYSO_EXT_*_PORT` lines of `.config/mise/conf.d/ext-<id>.toml` and `extension_port` in the
 * extension's answers file (docs/extensions-contract.md).
 */
function ports(base,env=process.env) {
  const first=Number(env.FYSO_HTTP_PORT)+10;
  if(!Number.isInteger(first)||first<=10)fail('FYSO_HTTP_PORT is not set; run this through mise');
  const range=new Set(Array.from({length:10},(_,i)=>first+i));
  const LINE=/^(FYSO_EXT_[A-Z0-9_]*_PORT)\s*=\s*"?(\d+)"?\s*$/gm;
  const read=text=>Object.fromEntries([...String(text||'').matchAll(LINE)].map(m=>[m[1],Number(m[2])]));
  const delivered=new Set(fs.existsSync(MANIFEST)?manifestFiles(fs.readFileSync(MANIFEST)):[]);
  const files=fs.globSync('.config/mise/conf.d/ext-*.toml').sort();
  // Ports this project keeps: extensions it installed itself, and its earlier allocations.
  const used=new Set();
  for(const file of files)if(!delivered.has(file))for(const port of Object.values(read(fs.readFileSync(file,'utf8'))))used.add(port);
  for(const file of files.filter(file=>delivered.has(file))) {
    const before=read(show(base,file)),text=fs.readFileSync(file,'utf8'),now=read(text),moved={};
    for(const [name,port] of Object.entries(now)) {
      let next=range.has(before[name])&&!used.has(before[name])?before[name]:null;
      if(next===null)next=[...range].find(candidate=>!used.has(candidate));
      if(next===undefined)fail(`no free extension port left in ${first}-${first+9} for ${name}`);
      used.add(next);
      if(next!==port)moved[name]=[port,next];
    }
    if(!Object.keys(moved).length)continue;
    fs.writeFileSync(file,text.replace(LINE,(line,name)=>moved[name]?`${name} = "${moved[name][1]}"`:line));
    const id=/ext-(.+)\.toml$/.exec(file)[1],answers=`.copier-answers.ext-${id}.yml`;
    if(fs.existsSync(answers)) {
      const remap=new Map(Object.values(moved));
      const content=fs.readFileSync(answers,'utf8');
      fs.writeFileSync(answers,content.replace(/^(extension_port:\s*)(\d+)\s*$/m,(line,key,port)=>remap.has(Number(port))?`${key}${remap.get(Number(port))}`:line));
    }
    for(const [name,[from,to]] of Object.entries(moved))console.log(`port ${name}: ${from} → ${to}`);
  }
}

/** The team to apply: the delivered snapshot when the distribution has one, else its project file. */
function teamSource() {
  const delivered=fs.existsSync(MANIFEST)?manifestFiles(fs.readFileSync(MANIFEST)):[];
  console.log(delivered.includes('state/bots/team.yaml')?'state/bots/team.yaml':'project/bots/team.yaml');
}

/** Received secrets overwrite this project's values with the same name, re-encrypted for it. */
function secrets() {
  if(!fs.existsSync(SECRETS))return;
  let incoming;
  try {incoming=decrypt(SECRETS);}
  catch {
    // Not a recipient yet: install everything else and remember it (the next update retries).
    const listed=names(readYaml(SECRETS)).filter(name=>name!=='sops'&&NAME.test(name)&&!PRIVATE.has(name));
    fs.mkdirSync(path.dirname(PENDING),{recursive:true});
    fs.writeFileSync(PENDING,JSON.stringify({names:listed,since:new Date().toISOString()}));
    console.warn(`warning: the received secrets (${listed.join(', ')}) are not encrypted for this installation's key, so they were NOT written. `
      +'Give your public key (mise run dist:key) to the publisher; the next dist:update installs them.');
    return;
  }
  fs.rmSync(PENDING,{force:true});
  for(const name of Object.keys(incoming))if(PRIVATE.has(name)||!NAME.test(name))delete incoming[name];
  if(!fs.existsSync('secrets.enc.yaml'))fail('run `mise run setup` first: the received secrets go into secrets.enc.yaml');
  const current=decrypt('secrets.enc.yaml');
  const changed=Object.keys(incoming).filter(name=>current[name]!==incoming[name]);
  if(!changed.length)return;
  const encrypted=sopsEncrypt(['encrypt','--filename-override','secrets.enc.yaml','--input-type','json','--output-type','yaml'],
    JSON.stringify({...current,...incoming}),{env:{...process.env,SOPS_AGE_KEY_FILE:keyFile()}});
  fs.writeFileSync('secrets.enc.yaml',encrypted);
  console.log(`secrets received: ${changed.join(', ')}`);
}

function walk(dir,prefix='') {
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const rel=prefix?`${prefix}/${entry.name}`:entry.name;
    return entry.isDirectory()?walk(path.join(dir,entry.name),rel):entry.isFile()?[rel]:[];
  });
}

/** Three-way line merge; --union keeps both sides where they differ (memory accumulates). */
function union(local,base,incoming) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-merge-'));
  try {
    const [a,b,c]=['local','base','incoming'].map(name=>path.join(dir,name));
    fs.writeFileSync(a,local);fs.writeFileSync(b,base);fs.writeFileSync(c,incoming);
    const result=spawnSync('git',['merge-file','-p','--union',a,b,c],{maxBuffer:1<<28});
    if(result.status<0||result.status===null||result.status>127)throw new Error(`git merge-file failed: ${result.stderr}`);
    return result.stdout;
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
}

/**
 * Merge delivered memory (state/dist/memory/<bot>/) into this project's (state/memory/<bot>/).
 * The previous delivery, from git at `base`, is the common ancestor. Prints changed bots.
 */
function mergeMemory(base) {
  const changed=new Set();
  for(const rel of walk(MEMORY)) {
    const [bot,...rest]=rel.split('/'),inner=rest.join('/');
    const incoming=fs.readFileSync(path.join(MEMORY,rel)),local=path.join('state/memory',bot,inner);
    const previous=show(base,`${MEMORY}/${rel}`);
    let merged;
    if(!fs.existsSync(local))merged=incoming;
    else {
      const mine=fs.readFileSync(local);
      if(mine.equals(incoming)||(previous&&previous.equals(incoming)))continue;   // nothing new from the publisher
      merged=previous&&mine.equals(previous)?incoming:union(mine,previous||Buffer.alloc(0),incoming);
      if(merged.equals(mine))continue;
    }
    fs.mkdirSync(path.dirname(local),{recursive:true});
    fs.writeFileSync(local,merged);
    changed.add(bot);
  }
  for(const bot of [...changed].sort())console.log(bot);
}

const versionKey=tag=>tag.slice(1).split('.').map(Number);
function latestTag(tags) {
  return [...tags].sort((a,b)=>{const x=versionKey(a),y=versionKey(b);for(let i=0;i<3;i++)if((x[i]||0)!==(y[i]||0))return (x[i]||0)-(y[i]||0);return 0;}).pop()||null;
}
const versionTags=lines=>lines.filter(tag=>/^v\d+(\.\d+){0,2}$/.test(tag));
const isBiz=answers=>answers?._src_path===BIZ_SRC;

async function status() {
  if(!fs.existsSync(ANSWERS)){console.log('No distribution installed (mise run dist:add <repo>).');return;}
  const answers=readYaml(ANSWERS)||{},current=answers._commit||'?';
  console.log(`Distribution: ${isBiz(answers)?'Biz (managed setup)':answers._src_path}\nVersion:      ${current}`);
  if(fs.existsSync(PENDING))console.log(`Secrets:      pending, not decryptable by this key: ${(JSON.parse(fs.readFileSync(PENDING,'utf8')).names||[]).join(', ')}`);
  let tags;
  if(isBiz(answers)) {
    // Read-only: the bundle goes to a temporary directory, not to the cache `update` uses.
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-dist-status-'));
    try {await bizDownload(bizClient(),path.join(dir,'src'));tags=versionTags(git(['-C',path.join(dir,'src'),'tag','--list']).toString().split('\n'));}
    catch(error) {console.log(`Latest:       unknown (${error.user?error.message:'Biz not reachable'})`);return;}
    finally {fs.rmSync(dir,{recursive:true,force:true});}
  } else {
    const remote=spawnSync('git',['ls-remote','--tags',cloneUrl(String(answers._src_path))],{encoding:'utf8'});
    if(remote.status!==0){console.log('Latest:       unknown (repository not reachable)');return;}
    tags=remote.stdout.split('\n').map(line=>/refs\/tags\/(v\d+(?:\.\d+){0,2})$/.exec(line)?.[1]).filter(Boolean);
  }
  const latest=latestTag(tags);
  console.log(`Latest:       ${latest||'?'}${latest&&latest!==current?'  → mise run dist:update':''}`);
}

// Ports are rebound per installation, so a port-only difference is not a local edit.
const normalize=(file,text)=>/^\.config\/mise\/conf\.d\/ext-[^/]+\.toml$|^\.copier-answers\.ext-[^/]+\.yml$/.test(file)
  ?text.replace(/^(FYSO_EXT_[A-Z0-9_]*_PORT\s*=|extension_port:).*$/gm,'$1'):text;
const blobSha=bytes=>crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

/** path → blob sha of a tree (empty when the ref has no such tree, e.g. no commit yet). */
function tree(dir,ref,prefix) {
  const result=spawnSync('git',['-C',dir,'ls-tree','-r','-z','--full-tree',ref,...(prefix?['--',prefix]:[])],{maxBuffer:1<<28});
  const map=new Map();
  if(result.status!==0)return map;
  for(const line of result.stdout.toString('utf8').split('\0').filter(Boolean)) {
    const [meta,file]=line.split('\t');map.set(prefix&&file.startsWith(prefix)?file.slice(prefix.length):file,meta.split(' ')[2]);
  }
  return map;
}
const blob=(dir,sha)=>git(['-C',dir,'cat-file','blob',sha]);
const names=obj=>Object.keys(obj||{}).sort();

/**
 * Read-only preview of what `dist:add` / `dist:update` would do. The distribution is fetched into a
 * temporary directory; nothing in the project changes. Arguments: [repo] [version] [--json].
 */
async function plan(args) {
  const json=args.includes('--json'),positional=args.filter(arg=>arg!=='--json');
  const installed=fs.existsSync(ANSWERS)?readYaml(ANSWERS)||{}:null;
  let repo=installed?String(installed._src_path):null,version=null;
  for(const arg of positional) {
    if(/^v?\d+(\.\d+){0,2}$/.test(arg))version=arg.startsWith('v')?arg:`v${arg}`;
    else if(installed)fail('a distribution is already installed: usage dist:plan [version] [--json]');
    else repo=arg;
  }
  if(!repo&&process.env.FYSO_DIST_BIZ_URL)repo='biz';
  if(!repo)fail('usage: dist:plan [<repo>|biz] [version] [--json]');
  const biz=repo==='biz'||repo===BIZ_SRC;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-dist-plan-')),src=path.join(dir,'src');
  try {
    if(biz)await bizDownload(bizClient(),src);else git(['clone','-q',cloneUrl(repo),src]);
    const tags=versionTags(git(['-C',src,'tag','--list']).toString().split('\n'));
    const target=version||latestTag(tags);
    if(!target||!tags.includes(target))fail(version?`${version} is not published`:'the distribution has no versions');
    const current=installed?._commit||null;
    const result=planAgainst(src,target,current,dir);
    const output={mode:installed?'update':'add',transport:biz?'biz':'git',source:biz?'biz':repo,current,version:target,up_to_date:current===target,...result};
    if(json)console.log(JSON.stringify(output,null,2));else printPlan(output);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
}

function planAgainst(src,target,current,scratch) {
  const prefix='template/',next=tree(src,target,prefix),base=current&&tags(src).includes(current)?tree(src,current,prefix):new Map();
  const manifest=JSON.parse(blob(src,next.get(MANIFEST)).toString('utf8'));
  const old=base.has(MANIFEST)?JSON.parse(blob(src,base.get(MANIFEST)).toString('utf8')).files||[]:[];
  const delivered=(manifest.files||[]).filter(file=>file!==SECRETS);
  const head=new Map([...tree('.','HEAD')]);
  const dirty=new Set(git(['status','--porcelain','-z','--untracked-files=all']).toString('utf8').split('\0').filter(Boolean)
    .map(entry=>entry.slice(3)));
  const added=[],replaced=[];
  for(const file of delivered) {
    const sha=next.get(file);
    if(!sha||!fs.existsSync(file)||!fs.statSync(file).isFile()){if(sha)added.push(file);continue;}
    const mine=fs.readFileSync(file),theirs=blob(src,sha);
    if(normalize(file,mine.toString('latin1'))===normalize(file,theirs.toString('latin1')))continue;
    const edits=[],committedSha=head.get(file);
    if(dirty.has(file)||!committedSha)edits.push('uncommitted');
    if(committedSha) {
      const was=base.get(file);
      const same=was&&(committedSha===was||normalize(file,blob('.',committedSha).toString('latin1'))===normalize(file,blob(src,was).toString('latin1')));
      if(!same)edits.push('committed');
    }
    replaced.push({path:file,local_edits:edits});
  }
  const now=new Set(delivered);
  const removed=old.filter(file=>file!==SECRETS&&!now.has(file)&&fs.existsSync(file)).sort();
  // Secrets: names are readable without a key; values only to a recipient.
  let secrets={names:[],decryptable:true,pending:false};
  if(next.has(SECRETS)) {
    const file=path.join(scratch,'incoming.sops.yaml');
    fs.writeFileSync(file,blob(src,next.get(SECRETS)));
    const listed=names(readYaml(file)).filter(name=>name!=='sops'&&NAME.test(name)&&!PRIVATE.has(name));
    try {
      const incoming=decrypt(file),mine=fs.existsSync('secrets.enc.yaml')?decrypt('secrets.enc.yaml'):{};
      secrets={names:listed.filter(name=>mine[name]!==incoming[name]),decryptable:true,pending:false};
    } catch {secrets={names:listed,decryptable:false,pending:true};}
  }
  // Extensions and bots: what this project does not have yet / loses.
  const local=new Set([...fs.globSync('.copier-answers.ext-*.yml').map(f=>/^\.copier-answers\.ext-(.+)\.yml$/.exec(f)[1]),
    ...(fs.existsSync('extensions')?fs.readdirSync('extensions'):[])]);
  const extensions={added:extensionIds(delivered).filter(id=>!local.has(id)),
    removed:extensionIds(old).filter(id=>!extensionIds(delivered).includes(id)&&local.has(id))};
  const delivery=file=>{const tmp=path.join(scratch,path.basename(file));fs.writeFileSync(tmp,blob(src,next.get(file)));return tmp;};
  const teamFile=next.has('state/bots/team.yaml')&&delivered.includes('state/bots/team.yaml')?'state/bots/team.yaml':'project/bots/team.yaml';
  const mine=new Set(['project/bots/team.yaml','state/bots/team.yaml'].filter(f=>fs.existsSync(f)).flatMap(f=>botNames(readTeam(f))));
  const incomingBots=next.has(teamFile)?botNames(readTeam(delivery(teamFile))):[];
  const bots={added:incomingBots.filter(name=>!mine.has(name))};
  const mcpNow=fs.existsSync('project/mcp.json')?names(JSON.parse(fs.readFileSync('project/mcp.json','utf8')).mcpServers):[];
  const incomingMcp=next.has('project/mcp.json')?names(JSON.parse(blob(src,next.get('project/mcp.json')).toString('utf8')).mcpServers):[];
  const mcp_servers={added:incomingMcp.filter(n=>!mcpNow.includes(n))};
  const mine_framework=frameworkVersion();
  return {framework:{published:manifest.framework||null,local:mine_framework},
    files:{added:added.sort(),replaced:replaced.sort((a,b)=>a.path.localeCompare(b.path)),removed},secrets,extensions,bots,mcp_servers,
    contents:{extensions:extensionIds(delivered),mcp_servers:incomingMcp,bots:incomingBots}};
}
const tags=src=>git(['-C',src,'tag','--list']).toString().split('\n').filter(Boolean);

function printPlan(p) {
  const list=(title,items,format=x=>x)=>{if(items.length){console.log(`${title} (${items.length}):`);for(const item of items)console.log(`  ${format(item)}`);}};
  console.log(`${p.mode==='add'?'Install':'Update'} ${p.source}: ${p.current||'(nothing installed)'} → ${p.version}${p.up_to_date?' (already at this version; local edits would still be replaced)':''}`);
  list('Files added',p.files.added);
  list('Files replaced',p.files.replaced,f=>f.local_edits.length?`${f.path}   LOCAL EDITS LOST (${f.local_edits.join(', ')})`:f.path);
  list('Files removed',p.files.removed);
  list(p.secrets.decryptable?'Secrets written':'Secrets written (cannot be read with this key; all listed)',p.secrets.names);
  list('Extensions added',p.extensions.added);list('Extensions removed',p.extensions.removed);
  list('Bots added',p.bots.added);list('MCP servers added',p.mcp_servers.added);
  if(p.framework.published&&p.framework.local&&p.framework.published!==p.framework.local)
    console.log(`Note: published with framework ${p.framework.published}, this project has ${p.framework.local}`);
  console.log('Nothing was changed.');
}

if(require.main===module) (async()=>{
  const [command,arg]=process.argv.slice(2);
  try {
    if(command==='publish')await publish(arg);
    else if(command==='prune')prune(arg);
    else if(command==='secrets')secrets();
    else if(command==='ports')ports(arg);
    else if(command==='team-source')teamSource();
    else if(command==='merge-memory')mergeMemory(arg);
    else if(command==='status')await status();
    else if(command==='plan')await plan(process.argv.slice(3));
    else if(command==='biz-fetch'){await bizDownload(bizClient(),path.resolve(BIZ_SRC));console.log(BIZ_SRC);}
    else if(command==='is-biz')process.exit(fs.existsSync(ANSWERS)&&isBiz(readYaml(ANSWERS))?0:1);
    else if(command==='clone-url')console.log(cloneUrl(arg));
    else fail('usage: dist.cjs <publish [version]|plan [repo] [version] [--json]|prune <base>|secrets|merge-memory <base>|status|biz-fetch|is-biz>');
  } catch(error) {
    console.error(`error: ${error.user?error.message:(error.stderr?.toString()||error.message)}`);
    process.exit(1);
  }
})();
module.exports={target,cloneUrl,nextVersion,union,config,ports,bizClient,bizMessage};
