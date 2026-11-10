// What this project contains, for agents (D57): a map of its bots, workflows, apps,
// extensions, MCP servers, wiki and guides, plus read-only access to its text files.
// Reads the repository only: works with the stack stopped. Nothing here writes.
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {execFileSync} = require('node:child_process');

// Readable roots, relative to the project. Runtime data (.data), snapshots (state) and
// everything hidden stay out; so do login users and anything that looks like a secret.
const ROOTS = ['AGENTS.md', 'README.md', 'project', 'extensions', 'framework/agent-context.md',
  'framework/docs', 'framework/skills', 'framework/examples', 'framework/bots/souls'];
const DENIED = [/^project\/auth(\/|$)/, /(^|\/)\./, /(^|\/)[^/]*(secret|credential|token)[^/]*$/i, /\.enc\./, /\.(key|pem|age|p12)$/i, /(^|\/)node_modules(\/|$)/];
const MAX_BYTES = 256 * 1024, MAX_ENTRIES = 400;

function map(root, env = process.env) {
  const at = (...parts) => path.join(root, ...parts);
  const glob = pattern => [...fs.globSync(pattern, {cwd: root})].sort();
  const attempt = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
  // The pinned `yaml` CLI package (mise), as panel-data.cjs loads it. Without it, names only.
  const yaml = attempt(() => createRequire(fs.realpathSync(execFileSync('which', ['yaml'], {encoding: 'utf8'}).trim()))('yaml'), null);
  const parse = file => attempt(() => yaml.parse(fs.readFileSync(at(file), 'utf8').replaceAll('${FYSO_ROOT}', root)), null) || {};
  const text = value => typeof value === 'string' ? value : value && typeof value === 'object' ? value.es || value.en || Object.values(value)[0] : undefined;

  const extensions = glob('.copier-answers.ext-*.yml').map(file => {
    const id = file.slice('.copier-answers.ext-'.length, -4);
    return {id, version: parse(file)._commit || null,
      readme: fs.existsSync(at('extensions', id, 'README.md')) ? `extensions/${id}/README.md` : null,
      skills: glob(`extensions/${id}/skills/*/SKILL.md`),
      mcpServers: Object.keys(attempt(() => JSON.parse(fs.readFileSync(at('extensions', id, 'mcp.json'), 'utf8')).mcpServers, {}) || {})};
  });
  const workflows = glob('project/workflows/*.yaml').map(file => {
    const name = path.basename(file, '.yaml'), spec = parse(file);
    const owner = name.startsWith('fyso-') || attempt(() => fs.lstatSync(at(file)).isSymbolicLink(), false) ? 'framework'
      : extensions.some(e => name.startsWith(`ext-${e.id}-`)) ? 'extension' : 'project';
    const params = Array.isArray(spec.params) ? spec.params.flatMap(p => p && typeof p === 'object' ? Object.keys(p) : [String(p).split('=')[0]])
      : spec.params && typeof spec.params === 'object' ? Object.keys(spec.params) : [];
    return {name, owner, ...(spec.description && {description: String(spec.description)}), ...(spec.schedule && {schedule: spec.schedule}), ...(params.length && {params})};
  });
  const team = parse('project/bots/team.yaml');
  const servers = {};
  for (const file of ['framework/mcp.json', 'project/mcp.json', ...glob('extensions/*/mcp.json')])
    for (const name of Object.keys(attempt(() => JSON.parse(fs.readFileSync(at(file), 'utf8')).mcpServers, {}) || {})) servers[name] = file;
  const wiki = glob('project/wiki/**/*.md');
  return {
    project: {name: env.FYSO_PROJECT_NAME || path.basename(root), slug: env.FYSO_PROJECT || path.basename(root)},
    bots: {source: 'project/bots/team.yaml (declared; live roster: fyso_bots_list)',
      declared: (team.bots || []).map(b => ({name: b.name, ...(b.title && {title: b.title}), model: b.model || team.defaults?.model || null, ...(b.chief && {chief: true})}))},
    workflows,
    apps: glob('project/apps/*/app.yaml').map(file => { const app = parse(file); return {id: app.id || file.split('/')[2], name: text(app.name) || null, file}; }),
    extensions,
    mcpServers: servers,
    wiki: {folder: 'project/wiki', pages: wiki.length, paths: wiki.slice(0, 100).map(f => f.slice('project/wiki/'.length, -3))},
    guides: ['AGENTS.md', 'README.md', 'framework/agent-context.md', ...glob('framework/docs/*.md'), ...glob('framework/skills/*/SKILL.md'),
      ...extensions.flatMap(e => [e.readme, ...e.skills])].filter(f => f && fs.existsSync(at(f))),
    git: attempt(() => ({branch: execFileSync('git', ['-C', root, 'branch', '--show-current'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(),
      recent: execFileSync('git', ['-C', root, 'log', '-5', '--format=%h %ad %s', '--date=short'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim().split('\n').filter(Boolean)}), null),
    read: 'fyso_files lists and fyso_file_read reads any path above',
  };
}

/** A few lines for the MCP `initialize` instructions: what exists here, not how Fyso works. */
function brief(root, env = process.env) {
  const m = map(root, env), own = m.workflows.filter(w => w.owner === 'project').map(w => w.name);
  const list = (items, empty = 'none') => items.length ? items.join(', ') : empty;
  return [`## This project: ${m.project.name} (${m.project.slug})`, '',
    `- Declared bots: ${list(m.bots.declared.map(b => b.title ? `${b.name} (${b.title})` : b.name))}.`,
    `- Project workflows: ${list(own)}; ${m.workflows.length - own.length} framework/extension workflows.`,
    `- Extensions: ${list(m.extensions.map(e => e.id))}. Project apps: ${list(m.apps.map(a => a.id))}. Wiki pages: ${m.wiki.pages}.`,
    `- MCP servers declared for bots: ${list(Object.keys(m.mcpServers))}.`,
    '- `fyso_project` returns this map in full; `fyso_files` / `fyso_file_read` read the project\'s own files and guides.', ''].join('\n');
}

// A readable project-relative path, or an error. Symlinks must stay inside the project.
function resolve(root, relative = '') {
  const clean = path.posix.normalize(String(relative).replaceAll('\\', '/')).replace(/^(\.\/)+/, '').replace(/\/$/, '');
  if (clean === '.' || clean === '') return {clean: '', absolute: root};
  if (clean.startsWith('..') || path.isAbsolute(clean)) throw Error('path must be relative to the project');
  if (!ROOTS.some(r => clean === r || clean.startsWith(r + '/') )) throw Error(`not readable: ${clean}. Readable: ${ROOTS.join(', ')}`);
  if (DENIED.some(pattern => pattern.test(clean))) throw Error(`not readable: ${clean} (login, hidden or secret-like file)`);
  const absolute = path.join(root, clean);
  if (!fs.existsSync(absolute)) throw Error(`not found: ${clean}`);
  const real = fs.realpathSync(absolute), base = fs.realpathSync(root);
  if (real !== base && !real.startsWith(base + path.sep)) throw Error(`not readable: ${clean} points outside the project`);
  return {clean, absolute};
}

function list(root, relative = '') {
  const {clean, absolute} = resolve(root, relative);
  if (!clean) return {path: '', entries: ROOTS.filter(r => fs.existsSync(path.join(root, r))).map(r => ({path: r, type: fs.statSync(path.join(root, r)).isDirectory() ? 'dir' : 'file'}))};
  if (!fs.statSync(absolute).isDirectory()) return {path: clean, entries: [{path: clean, type: 'file', bytes: fs.statSync(absolute).size}]};
  const entries = [], base = fs.realpathSync(root);
  const walk = dir => {
    for (const name of fs.readdirSync(path.join(root, dir)).sort()) {
      const entry = `${dir}/${name}`, absolute = path.join(root, entry);
      if (DENIED.some(pattern => pattern.test(entry))) continue;
      // Linked files inside the project are listed (framework workflows); linked folders are never followed.
      const link = fs.lstatSync(absolute).isSymbolicLink(), stat = fs.statSync(absolute, {throwIfNoEntry: false});
      if (!stat || (link && (stat.isDirectory() || !fs.realpathSync(absolute).startsWith(base + path.sep)))) continue;
      if (entries.length >= MAX_ENTRIES) return;
      if (stat.isDirectory()) walk(entry); else entries.push({path: entry, type: 'file', bytes: stat.size});
    }
  };
  walk(clean);
  return {path: clean, entries, ...(entries.length >= MAX_ENTRIES && {truncated: true})};
}

function read(root, relative) {
  const {clean, absolute} = resolve(root, relative);
  if (!clean || fs.statSync(absolute).isDirectory()) throw Error('path is a folder: list it with fyso_files');
  const bytes = fs.statSync(absolute).size, data = Buffer.alloc(Math.min(bytes, MAX_BYTES));
  const fd = fs.openSync(absolute, 'r');
  try { fs.readSync(fd, data, 0, data.length, 0); } finally { fs.closeSync(fd); }
  if (data.includes(0)) throw Error(`not a text file: ${clean}`);
  return {path: clean, bytes, ...(bytes > MAX_BYTES && {truncated: true}), content: data.toString('utf8')};
}

module.exports = {map, brief, list, read, ROOTS};
