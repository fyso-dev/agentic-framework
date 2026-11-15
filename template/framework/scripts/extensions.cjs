// Fixed extension slots; no registry or secret values on disk.
const fs = require('node:fs');
const {createRequire} = require('node:module');
const {execFileSync, spawnSync} = require('node:child_process');
const yaml = createRequire(fs.realpathSync(execFileSync('which', ['yaml'], {encoding:'utf8'}).trim()))('yaml');
const read = file => yaml.parse(fs.readFileSync(file, 'utf8'));
function setSource(file, source) {
  const answers = yaml.parseDocument(fs.readFileSync(file, 'utf8'));
  answers.set('_src_path', source);
  fs.writeFileSync(file, answers.toString());
}
const glob = pattern => [...fs.globSync(pattern)].sort();
const validId = id => /^[a-z][a-z0-9-]{1,30}$/.test(id);
function secrets(id) {
  const file = `extensions/${id}/secrets.yaml`;
  const entries = fs.existsSync(file) ? read(file) : [];
  if (!Array.isArray(entries)) throw Error(`${file}: expected a list`);
  for (const entry of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.name)) throw Error(`${file}: invalid secret name`);
  }
  return entries;
}
function missing(id, env = process.env) {
  return secrets(id).filter(s => s.required === true && !env[s.name]).map(s => s.name);
}
const installed = () => glob('.copier-answers.ext-*.yml').map(f => f.slice('.copier-answers.ext-'.length, -4));
// `ext-<id>-*.yaml`, minus files of installed extensions whose id extends <id> (`sample` vs `sample-other`).
function workflows(id) {
  const longer = installed().filter(o => o !== id && o.startsWith(`${id}-`));
  return glob(`project/workflows/ext-${id}-*.yaml`).filter(f => !longer.some(o => f.startsWith(`project/workflows/ext-${o}-`)));
}
// A page may declare a counter: Dagu runs in one state carrying every listed
// label. The panel runs the query; nothing from the extension is evaluated.
const badgeLabel = value => typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9_.=-]{0,63}$/.test(value);
function badge(file, data) {
  const runs=data?.dagu_runs, extra=data && Object.keys(data).filter(key=>!['dagu_runs','warn_labels','attention'].includes(key));
  if(!data || typeof data!=='object' || Array.isArray(data) || extra.length || !runs || typeof runs!=='object' || Array.isArray(runs) || Object.keys(runs).some(key=>!['status','labels'].includes(key)) || runs.status!=='waiting' ||
    !Array.isArray(runs.labels) || !runs.labels.length || runs.labels.length>5 || !runs.labels.every(badgeLabel) ||
    (data.warn_labels!==undefined && (!Array.isArray(data.warn_labels) || !data.warn_labels.length || data.warn_labels.length>5 || !data.warn_labels.every(badgeLabel))) ||
    (data.attention!==undefined && typeof data.attention!=='boolean'))throw new Error(`${file}: invalid page badge`);
  return {dagu_runs:{status:'waiting',labels:runs.labels},...(data.warn_labels&&{warn_labels:data.warn_labels}),...(data.attention===true&&{attention:true})};
}
function pages(id) {
  return glob(`extensions/${id}/pages/*.yaml`).map(file=>{
    const pageId=file.split('/').pop().slice(0,-5),data=read(file);
    if(!validId(pageId) || !data?.name || typeof data.url!=='string' || !data.url.startsWith(`/extensions/${id}/panel/`) || !/^\/extensions\/[a-z][a-z0-9-]{1,30}\/panel\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.html$/.test(data.url))throw new Error(`${file}: invalid extension page`);
    if(!fs.existsSync('.'+data.url))throw new Error(`${file}: missing page entry`);
    if(typeof data.name!=='string' && (!data.name || typeof data.name!=='object' || Array.isArray(data.name) || !Object.values(data.name).length || Object.values(data.name).some(v=>typeof v!=='string')))throw new Error(`${file}: invalid page name`);
    const name=typeof data.name==='string'?{name:data.name}:{name:data.name.es||data.name.en||Object.values(data.name)[0],name_i18n:data.name};
    return {id:pageId,...name,url:data.url,icon:data.icon||'apps',...(data.badge!==undefined&&{badge:badge(file,data.badge)})};
  });
}
/** Optional Setup step an extension adds (D51): `extensions/<ext>/setup.yaml` with a title and description. */
function setup(id) {
  const file = `extensions/${id}/setup.yaml`;
  if (!fs.existsSync(file)) return null;
  const data = read(file) || {};
  const text = (key, value) => typeof value === 'string' ? {[key]:value} :
    value && typeof value === 'object' ? {[key]:value.es || value.en || Object.values(value)[0], [`${key}_i18n`]:value} : {};
  const step = {...text('title', data.title), ...text('description', data.description)};
  if (!step.title) throw Error(`${file}: a title is required`);
  return step;
}
function inventory(apps, env = process.env) {
  return glob('.copier-answers.ext-*.yml').map(file => {
    const id = file.slice('.copier-answers.ext-'.length, -4);
    if (!validId(id)) throw Error(`Invalid extension id in ${file}`);
    const answers = read(file);
    const base = `extensions/${id}`;
    return {id, pages:pages(id), src:answers._src_path, version:answers._commit || null,
      apps:apps.filter(a => a.file === `${base}/app.yaml`).map(a => a.id),
      secrets:secrets(id).map(s => {
        const description = typeof s.description === 'string' ? {description:s.description} :
          s.description ? {description:s.description.es || s.description.en || Object.values(s.description)[0], description_i18n:s.description} : {};
        // Optional page where the value is obtained; HTTPS only (D50).
        const url = typeof s.url === 'string' && /^https:\/\/[^\s]+$/.test(s.url) ? {url:s.url} : {};
        return {name:s.name, ...description, ...url, required:s.required === true, set:!!env[s.name]};
      }),
      mcpServers:fs.existsSync(`${base}/mcp.json`) ? Object.keys(JSON.parse(fs.readFileSync(`${base}/mcp.json`)).mcpServers || {}) : [],
      workflows:workflows(id).map(f => f.split('/').pop().slice(0,-5)),
      skills:glob(`${base}/skills/*/SKILL.md`).map(f => f.split('/').at(-2)),
      ...(setup(id) && {setup:setup(id)})};
  });
}
function check(env = process.env) {
  const errors = [], ports = new Map(), base = Number(env.FYSO_HTTP_PORT);
  for (const [name, value] of Object.entries(env).filter(([name]) => /^FYSO_EXT_.*_PORT$/.test(name))) {
    const port = Number(value);
    if (!/^\d+$/.test(value) || !Number.isInteger(base) || port < base+10 || port > base+19 || port > 65535) errors.push(`${name} must be in extension port block ${base+10}..${Math.min(base+19,65535)}`);
    if (ports.has(port)) errors.push(`Port collision: ${name} and ${ports.get(port)}`);
    ports.set(port,name);
  }
  for (const file of glob('extensions/*/secrets.yaml')) {
    const id = file.split('/')[1];
    for (const name of missing(id,env)) errors.push(`${id}: required secret ${name} is empty`);
  }
  for (const id of installed()) {try {pages(id);} catch(error) {errors.push(error.message);}}
  return errors;
}
function run(id, command) {
  if (!validId(id) || command.shift() !== '--' || !command.length) throw Error('Usage: run-ext.sh <ext> -- <cmd…>');
  const absent = missing(id);
  if (absent.length) throw Error(`${id}: required secret(s) empty: ${absent.join(', ')}`);
  const names = new Set(['PATH','HOME',...secrets(id).map(s => s.name)]);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('FYSO_AUTH_') && (names.has(k) || k.startsWith('FYSO_'))));
  const child = spawnSync(command[0],command.slice(1),{env,stdio:'inherit'});
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}
module.exports = {read, setSource, glob, validId, secrets, missing, setup, workflows, inventory, check};
if (require.main === module) {
  try {
    if (process.argv[2] === 'run') run(process.argv[3],process.argv.slice(4));
    else if (process.argv[2] === 'check') {
      const errors = check(); errors.forEach(e => console.error(e)); process.exitCode = errors.length ? 1 : 0;
    } else throw Error('Unknown extension operation');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
