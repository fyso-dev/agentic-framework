// YAML parsing uses the small, explicitly pinned yaml CLI package from mise.
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const yaml = createRequire(fs.realpathSync(execFileSync('which', ['yaml'], {encoding:'utf8'}).trim()))('yaml');
const read = file => yaml.parse(fs.readFileSync(file, 'utf8'));
const env = process.env;
const readTeam = () => yaml.parse(fs.readFileSync('project/bots/team.yaml', 'utf8').replaceAll('${FYSO_ROOT}', env.FYSO_ROOT));
// Engines the declared bots run on: the provider prefix of each model.
const usedEngines = team => team.bots.map(b => String(b.model || team.defaults?.model || '').split('/')[0]).filter(Boolean);
const domain = env.FYSO_WEB_DOMAIN || `${env.FYSO_PROJECT}-${env.FYSO_HTTP_PORT}.localhost`;
const web = require('./web-origin.cjs');
const urls = Object.fromEntries(['panel','auth','dagu','omb'].map(app => [app, web.origin(app, env, domain)]));
if (process.argv[2] === 'config') {
  require('./bot-versioning.cjs').write();
  const extensions = require('./extensions.cjs');
  const appFiles = [...fs.globSync('framework/apps/*.yaml'), ...fs.globSync('project/apps/*/app.yaml'), ...extensions.glob('extensions/*/app.yaml')];
  const apps = appFiles.map(file => {
    const substitute = value => typeof value === 'string' ? value.replace(/\$\{(FYSO_[A-Za-z0-9_]+)\}/g, (match,name) => env[name] ?? match) :
      Array.isArray(value) ? value.map(substitute) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,substitute(v)])) : value;
    const app = file.startsWith('extensions/') ? substitute(read(file)) : read(file);
    app.group = file.startsWith('framework/') ? 'framework' : file.startsWith('extensions/') ? 'extension' : 'project';
    if (app.group === 'framework') app.url = urls[app.id];
    else app.url = web.publicUrl(app.url, env, domain);
    for (const key of ['name','description','accessNote']) {
      if (app[key] && typeof app[key] === 'object') {
        app[`${key}_i18n`] = app[key]; app[key] = app[key].es || app[key].en || Object.values(app[key])[0];
      }
    }
    return {enabled:true, ...app};
  });
  fs.mkdirSync('.data/panel', {recursive:true});
  const answers = fs.existsSync('.copier-answers.yml') ? read('.copier-answers.yml') : {};
  const framework = {commit:answers._commit ? String(answers._commit) : null, src:answers._src_path || null};
  fs.writeFileSync('.data/panel/project.json', JSON.stringify({name:env.FYSO_PROJECT_NAME, slug:env.FYSO_PROJECT, env:env.FYSO_ENV || 'local', urls, framework}));
  fs.writeFileSync('.data/panel/apps.json', JSON.stringify(apps));
  require('./skills.cjs').writePanel();
  fs.writeFileSync('.data/panel/extensions.json', JSON.stringify(extensions.inventory(apps.map((app,i) => ({id:app.id,file:appFiles[i]})))));
} else if (process.argv[2] === 'engines') {
  console.log([...new Set(usedEngines(readTeam()))].join('\n'));
} else if (process.argv[2] === 'check') {
  require('./mcp-config.cjs').write();
  const team = readTeam();
  const bots = team.bots.filter(b => b.name !== 'MausBot');
  const models = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  let plan;
  try { plan = JSON.parse(fs.readFileSync(process.argv[4], 'utf8')); } catch { plan = {ok:false, error:'openmausbot team apply --dry-run returned no result'}; }
  const invalid = plan.ok === false ? String(plan.error || 'team file rejected') : null;
  const connected = bots.filter(b => {
    const cwd = (b.cwd || team.defaults?.cwd || '').replaceAll('${FYSO_ROOT}', env.FYSO_ROOT);
    try { return !!JSON.parse(fs.readFileSync(`${cwd}/.mcp.json`)).mcpServers?.dagu; } catch {return false;}
  }).length;
  const pending = invalid ? bots.length : plan.created + plan.changed + plan.deleted;
  // Only the engines that matter to this project: the ones its bots use, plus the
  // framework's default engines when they are ready to be picked in the bot form.
  const used = new Set(usedEngines(team));
  const defaults = new Set(['claude', 'claudeApi', 'codex', 'pi']);
  const engines = models.instances.map(e => ({
    id:e.instanceId, label:e.displayName, kind:e.access === 'subscription' ? 'subscription':'api',
    ok:e.instanceId === 'claude' ? env.FYSO_CLAUDE_OK === 'true' : e.instanceId === 'codex' ? env.FYSO_CODEX_OK === 'true' : e.instanceId === 'pi' ? env.FYSO_PI_OK === 'true' : e.snapshot?.state === 'available',
    models:(e.models?.options || []).map(m => m.id),
    ...(['claude','codex','pi'].includes(e.instanceId) ? {fixHint:e.instanceId === 'claude' ? 'claude /login' : e.instanceId === 'pi' ? 'pi auth login openai-codex' : 'codex login --device-auth'} : {})
  })).filter(e => used.has(e.id) || (defaults.has(e.id) && e.ok));
  const extensions = (process.argv[5] && fs.existsSync(process.argv[5]) ? fs.readFileSync(process.argv[5], 'utf8') : '')
    .split('\n').filter(Boolean).map(line => line.split('\t')).filter(([, state]) => ['done','pending','failed'].includes(state)).map(([id, state]) => ({id, state}));
  console.log(JSON.stringify({checkedAt:new Date().toISOString(), extensions, engines, bots:{count:bots.length,pending,ok:!invalid && pending===0,...(invalid && {error:invalid})}, dagu:{ok:env.FYSO_DAGU_OK==='true',botsConnected:connected}}));
}
