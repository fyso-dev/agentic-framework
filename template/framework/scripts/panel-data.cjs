// YAML parsing uses the small, explicitly pinned yaml CLI package from mise.
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const yaml = createRequire(fs.realpathSync(execFileSync('which', ['yaml'], {encoding:'utf8'}).trim()))('yaml');
const read = file => yaml.parse(fs.readFileSync(file, 'utf8'));
const env = process.env;
const urls = {dagu:`http://dagu.localhost:${env.FYSO_HTTP_PORT}`, omb:`http://127.0.0.1:${env.FYSO_OMB_PORT}`};
if (process.argv[2] === 'config') {
  const apps = [...fs.globSync('framework/apps/*.yaml'), ...fs.globSync('project/apps/*/app.yaml')].map(file => {
    const app = read(file);
    app.group = file.startsWith('framework/') ? 'framework' : 'project';
    if (app.group === 'framework') app.url = urls[app.id];
    for (const key of ['name','description','accessNote']) {
      if (app[key] && typeof app[key] === 'object') {
        app[`${key}_i18n`] = app[key]; app[key] = app[key].es || app[key].en || Object.values(app[key])[0];
      }
    }
    return {enabled:true, ...app};
  });
  fs.mkdirSync('.data/panel', {recursive:true});
  fs.writeFileSync('.data/panel/project.json', JSON.stringify({name:env.FYSO_PROJECT_NAME, slug:env.FYSO_PROJECT, env:env.FYSO_ENV || 'local', urls}));
  fs.writeFileSync('.data/panel/apps.json', JSON.stringify(apps));
} else if (process.argv[2] === 'check') {
  const team = read('project/bots/team.yaml');
  const bots = team.bots.filter(b => b.name !== 'MausBot');
  const models = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const plan = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  const connected = bots.filter(b => {
    const cwd = (b.cwd || team.defaults?.cwd || '').replaceAll('${FYSO_ROOT}', env.FYSO_ROOT);
    try { return !!JSON.parse(fs.readFileSync(`${cwd}/.mcp.json`)).mcpServers?.dagu; } catch {return false;}
  }).length;
  const pending = plan.created + plan.changed + plan.deleted;
  const engines = models.engines.map(e => ({id:e.id, label:e.label || e.name || e.id, kind:e.id === 'claude' || e.id === 'codex' ? 'subscription':'api', ok:e.id === 'claude' ? env.FYSO_CLAUDE_OK === 'true' : e.id === 'codex' ? env.FYSO_CODEX_OK === 'true' : !!e.configured, models:(e.models || []).map(m => typeof m === 'string' ? m : m.id), ...(['claude','codex'].includes(e.id) ? {fixHint:e.id === 'claude' ? 'claude /login':'codex login --device-auth'} : {})}));
  console.log(JSON.stringify({checkedAt:new Date().toISOString(), engines, bots:{count:bots.length,pending,ok:pending===0}, dagu:{ok:env.FYSO_DAGU_OK==='true',botsConnected:connected}}));
}
