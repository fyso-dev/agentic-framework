// Workflow scopes (D60): which workflows are system ones, and named subsets of the
// project's workflows that a group of bots may use.
//   - A workflow joins a scope with Dagu's own label in its YAML: `labels: [workspace=<scope>]`.
//   - Framework and extension workflows (`fyso-*`, `ext-*`, links into framework/) are
//     system: never part of a scope by label, only when the scope grants them by name.
//   - A scope is served to bots by an entry of project/mcp.json named `dagu-<scope>`,
//     which runs the platform MCP with `--scope` (dagu-scope.cjs enforces it).
// Reads need only the repository. Changes run inside the fyso-workflow-scopes workflow.
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {execFileSync} = require('node:child_process');

const NAME = /^[a-z][a-z0-9-]{1,30}$/;
const RESERVED = ['all', 'default', 'global', 'system'];
const SERVER = 'framework/scripts/fyso-mcp.cjs';
const entryName = scope => `dagu-${scope}`;
const yamlLib = () => {
  try { return createRequire(fs.realpathSync(execFileSync('which', ['yaml'], {encoding: 'utf8'}).trim()))('yaml'); }
  catch { throw Error('the yaml package is not available: run through mise'); }
};
const labelsOf = spec => {
  const raw = spec?.labels;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') return raw.split(',').map(s => s.trim()).filter(Boolean);
  if (raw && typeof raw === 'object') return Object.entries(raw).map(([k, v]) => `${k}=${v}`);
  return [];
};
const workspaceOf = labels => labels.find(l => l.startsWith('workspace='))?.slice('workspace='.length) || null;

/** Every workflow of the project with its class and scope label. */
function workflows(root) {
  const yaml = yamlLib();
  return [...fs.globSync('project/workflows/*.yaml', {cwd: root})].sort().map(file => {
    const name = path.basename(file, '.yaml'), absolute = path.join(root, file);
    const system = /^(fyso|ext)-/.test(name) || fs.lstatSync(absolute).isSymbolicLink();
    let spec = {};
    try { spec = yaml.parse(fs.readFileSync(absolute, 'utf8')) || {}; } catch {}
    return {name, file, class: system ? 'system' : 'project',
      // A system workflow's label is ignored: it cannot be pulled into a scope by editing YAML.
      workspace: system ? null : workspaceOf(labelsOf(spec)), ...(spec.description && {description: String(spec.description)})};
  });
}

function entries(root) {
  const file = path.join(root, 'project/mcp.json');
  const servers = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers || {} : {};
  return Object.entries(servers).flatMap(([server, config]) => {
    const args = Array.isArray(config?.args) ? config.args : [], at = args.indexOf('--scope');
    if (!args.includes(SERVER) || at < 0 || !NAME.test(args[at + 1] || '')) return [];
    const granted = args.indexOf('--system');
    return [{server, scope: args[at + 1], system: granted < 0 ? [] : String(args[granted + 1] || '').split(',').filter(Boolean)}];
  });
}

/** The workflow names one scope may use: its labelled project workflows plus the system ones it grants. */
function allowed(root, scope, system = []) {
  const all = workflows(root);
  return new Map(all.filter(w => (w.class === 'project' && w.workspace === scope) || (w.class === 'system' && system.includes(w.name))).map(w => [w.name, w]));
}

/** What exists: classes, scopes with their workflows and bots, and what no scope covers. */
function read(root) {
  const yaml = yamlLib(), all = workflows(root), defined = entries(root);
  let team = {};
  try { team = yaml.parse(fs.readFileSync(path.join(root, 'project/bots/team.yaml'), 'utf8').replaceAll('${FYSO_ROOT}', root)) || {}; } catch {}
  const uses = server => (team.bots || []).filter(b => (b.tools?.allow || []).some(s => String(s).startsWith(`mcp:${server}:`))).map(b => b.name);
  return {
    scopes: defined.map(e => ({scope: e.scope, server: e.server, selector: `mcp:${e.server}:*`,
      workflows: all.filter(w => w.class === 'project' && w.workspace === e.scope).map(w => w.name),
      system: e.system.filter(name => all.some(w => w.name === name && w.class === 'system')),
      bots: uses(e.server)})),
    system: all.filter(w => w.class === 'system').map(w => w.name),
    unscoped: all.filter(w => w.class === 'project' && !defined.some(e => e.scope === w.workspace)).map(w => ({name: w.name, ...(w.workspace && {workspace: w.workspace})})),
    fullAccess: {server: 'dagu', bots: uses('dagu')},
    rules: 'A bot with a scope server reads and runs only that scope (no changes, no inline specs). A bot with the dagu server reaches every workflow. Assign a server to a bot with fyso_bot_plan (tools.allow).',
  };
}

function git(root, args) { return execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim(); }
function commit(root, files, message) {
  git(root, ['add', '--', ...files]);
  execFileSync(path.join(root, 'framework/scripts/check-paths.sh'), [], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  if (git(root, ['diff', '--cached', '--name-only', '--', ...files])) git(root, ['commit', '-qm', message, '--', ...files]);
  return git(root, ['rev-parse', '--short', 'HEAD']);
}
// Set or clear the workspace label of one workflow file, keeping its comments and layout.
function relabel(yaml, file, scope) {
  const before = fs.readFileSync(file, 'utf8'), doc = yaml.parseDocument(before);
  if (doc.errors.length) throw Error(`${path.basename(file)}: invalid YAML`);
  const labels = labelsOf(doc.toJS() || {}).filter(l => !l.startsWith('workspace='));
  if (scope) labels.push(`workspace=${scope}`);
  if (labels.length) doc.set('labels', labels); else doc.delete('labels');
  const after = doc.toString();
  if (after !== before) fs.writeFileSync(file, after);
  return after !== before;
}
function writeServers(root, change) {
  const file = path.join(root, 'project/mcp.json');
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  data.mcpServers = data.mcpServers || {};
  change(data.mcpServers);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  // .mcp.json is generated from project/mcp.json; duplicates are rejected there.
  const cwd = process.cwd();
  try { process.chdir(root); require('./mcp-config.cjs').write(); } finally { process.chdir(cwd); }
}
function clean(root, files) {
  const dirty = git(root, ['status', '--porcelain', '--', ...files]);
  if (dirty) throw Error(`commit or discard existing edits first: ${dirty.split('\n').map(l => l.slice(3)).join(', ')}`);
}

/** Create or replace a scope: exactly `workflows` carry its label afterwards, and it grants exactly `system`. */
function save(root, {scope, workflows: wanted = [], system = []}) {
  if (!NAME.test(scope || '') || RESERVED.includes(scope)) throw Error(`invalid scope name: 2-31 lowercase letters, digits or dashes, not ${RESERVED.join(', ')}`);
  if (!Array.isArray(wanted) || !Array.isArray(system)) throw Error('workflows and system must be lists of workflow names');
  const yaml = yamlLib(), all = workflows(root), byName = new Map(all.map(w => [w.name, w]));
  for (const name of wanted) {
    if (!byName.has(name)) throw Error(`unknown workflow: ${name}`);
    if (byName.get(name).class === 'system') throw Error(`${name} is a system workflow: grant it with "system", it cannot be labelled`);
  }
  for (const name of system) if (byName.get(name)?.class !== 'system') throw Error(`not a system workflow: ${name}`);
  const server = entryName(scope);
  const other = entries(root).find(e => e.scope === scope && e.server !== server);
  if (other) throw Error(`scope ${scope} is already served by ${other.server}`);
  const touched = all.filter(w => w.class === 'project' && (wanted.includes(w.name) || w.workspace === scope));
  const files = ['project/mcp.json', ...touched.map(w => w.file)];
  clean(root, files);
  const moved = touched.filter(w => wanted.includes(w.name) && w.workspace && w.workspace !== scope).map(w => ({name: w.name, from: w.workspace}));
  for (const w of touched) relabel(yaml, path.join(root, w.file), wanted.includes(w.name) ? scope : null);
  writeServers(root, servers => {
  // Plain node, not `mise exec`: a bot's process has OpenMausBot's environment (pinned tools on
  // PATH, FYSO_DAGU_PORT, DAGU_MCP_AUTH) and must not need the project's decrypted secrets.
  servers[server] = {type: 'stdio', command: 'node', args: [SERVER, '--scope', scope, ...(system.length ? ['--system', system.join(',')] : [])]}; });
  const revision = commit(root, files, `workflows: scope ${scope}`);
  return {...read(root).scopes.find(s => s.scope === scope), ...(moved.length && {moved}), commit: revision,
    next: `Give it to a bot with fyso_bot_plan: tools.allow ["native:*", "mcp:${server}:*"] (and no "mcp:dagu:*").`};
}

/** Remove a scope: its entry and its labels. Refused while a declared bot still selects it. */
function remove(root, {scope}) {
  const entry = entries(root).find(e => e.scope === scope);
  if (!entry) throw Error(`no such scope: ${scope}`);
  const current = read(root).scopes.find(s => s.scope === scope);
  if (current.bots.length) throw Error(`bots still use ${entry.server}: ${current.bots.join(', ')}. Change their tools first (fyso_bot_plan).`);
  const touched = workflows(root).filter(w => w.class === 'project' && w.workspace === scope);
  const files = ['project/mcp.json', ...touched.map(w => w.file)];
  clean(root, files);
  const yaml = yamlLib();
  for (const w of touched) relabel(yaml, path.join(root, w.file), null);
  writeServers(root, servers => { delete servers[entry.server]; });
  return {removed: scope, unlabelled: touched.map(w => w.name), commit: commit(root, files, `workflows: remove scope ${scope}`)};
}

module.exports = {workflows, entries, allowed, read, save, remove, entryName};
if (require.main === module) {
  const root = process.env.FYSO_ROOT || path.resolve(__dirname, '../..');
  try {
    const input = process.env.INPUT_B64 ? JSON.parse(Buffer.from(process.env.INPUT_B64, 'base64').toString('utf8')) : {};
    const op = process.argv[2] || process.env.OP || 'read';
    const run = {read: () => read(root), save: () => save(root, input), delete: () => remove(root, input)}[op];
    if (!run) throw Error('OP must be read, save or delete');
    console.log(JSON.stringify(run()));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
