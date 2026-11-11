// Keep a team file's models among the ones each engine offers (D37).
// Providers retire model names (codex/gpt-5.4-mini was), and OpenMausBot then rejects the
// whole team. A bot whose engine is available but no longer offers its model is moved to
// that engine's default model, as `openmausbot models` reports it; only `model:` lines
// change. Engines that are unknown or not signed in are left alone (that is a login issue).
//
//   node team-models.cjs [file] [--check]     default file: project/bots/team.yaml
//   node team-models.cjs runtime <rendered team> <out dir>
// The first form fixes the file's text (one line per change; --check writes nothing). The
// runtime form never replays the whole declaration, so native edits and a just-restored
// snapshot survive: it writes <out>/models.yaml (only name + model of live bots whose model
// is retired) only when needed, and prints what it does.
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');

function offered(env = process.env) {
  const out = process.env.FYSO_MODELS_JSON
    ? fs.readFileSync(process.env.FYSO_MODELS_JSON, 'utf8')   // tests
    : execFileSync('openmausbot', ['models', '--json', '--port', env.FYSO_OMB_PORT], {encoding: 'utf8', timeout: 30000});
  const map = new Map();
  for (const e of JSON.parse(out).instances || []) {
    if (e.snapshot?.state !== 'available') continue;
    map.set(e.instanceId, {default: e.models?.default, ids: new Set((e.models?.options || []).map(o => o.id))});
  }
  return map;
}

// Line-based on purpose: team.yaml may hold ${VAR} placeholders inside flow maps, which
// are not valid YAML, and only `model:` values change; everything else stays byte for byte.
function repair(file, engines, {write = true} = {}) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const changes = [];
  let bot = null;
  lines.forEach((line, i) => {
    const n = /^\s*-?\s*name:\s*["']?([^"'#]+?)["']?\s*(#.*)?$/.exec(line);
    if (n) bot = n[1];
    const m = /^(\s*model:\s*)(["']?)([A-Za-z0-9_-]+)\/([^"'\s#]+)\2(\s*(#.*)?)$/.exec(line);
    if (!m) return;
    const [, lead, q, engine, name, tail] = m, e = engines.get(engine);
    if (!e || !e.default || e.ids.has(name)) return;
    lines[i] = `${lead}${q}${engine}/${e.default}${q}${tail}`;
    changes.push({bot, from: `${engine}/${name}`, to: `${engine}/${e.default}`});
  });
  if (changes.length && write) fs.writeFileSync(file, lines.join('\n'));
  return changes;
}

async function runtime(rendered, out, engines, env = process.env) {
  const {createRequire} = require('node:module');
  const yaml = createRequire(fs.realpathSync(execFileSync('which', ['yaml'], {encoding: 'utf8'}).trim()))('yaml');
  const res = await fetch(`http://127.0.0.1:${env.FYSO_OMB_PORT}/api/bots`, {signal: AbortSignal.timeout(10000)});
  if (!res.ok) throw Error(`OpenMausBot bot list unavailable (${res.status})`);
  const live = (await res.json()).bots || [];
  const declared = yaml.parse(fs.readFileSync(rendered, 'utf8')) || {};
  const key = n => String(n || '').trim().toLowerCase();
  const notes = [], models = [];
  for (const b of live) {
    const sel = b.modelSelection || {}, e = engines.get(sel.instanceId);
    if (!sel.model || !e || !e.default || e.ids.has(sel.model)) continue;
    models.push({name: b.name, model: `${sel.instanceId}/${e.default}`});
    notes.push(`bot "${b.name}": ${sel.instanceId}/${sel.model} → ${sel.instanceId}/${e.default} (model only)`);
  }
  fs.mkdirSync(out, {recursive: true});
  for (const f of ['models.yaml', 'create.yaml']) fs.rmSync(`${out}/${f}`, {force: true});
  if (models.length) fs.writeFileSync(`${out}/models.yaml`, yaml.stringify({version: declared.version || 1, bots: models}));

  return notes;
}

if (require.main === module && process.argv[2] === 'runtime') {
  runtime(process.argv[3], process.argv[4], offered())
    .then(notes => notes.forEach(n => console.log(n)))
    .catch(e => { console.error(`team-models: ${e.message}`); process.exitCode = 1; });
} else if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--')) || 'project/bots/team.yaml';
  try {
    for (const c of repair(file, offered(), {write: !args.includes('--check')}))
      console.log(`bot "${c.bot}": ${c.from} → ${c.to} (no longer offered by ${c.from.split('/')[0]})`);
  } catch (e) { console.error(`team-models: ${e.message}`); process.exitCode = 1; }
}
module.exports = {repair, offered, runtime};
