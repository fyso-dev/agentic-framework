// Bots an extension manages from an outside source of truth (Fyso Biz teams, D89).
// `project/bots/managed.json` records, per owner, its departments and the digest of each
// bot's declared entry. The core refuses any local change that differs from that record:
// Bot Architect update/delete, the panel's team-wide plan/apply and `team-import` over a
// managed department. An owner changes its bots by recording new digests first (a commit),
// so no request parameter can bypass the check. Without the file nothing is managed.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {createRequire} = require('node:module');

const FILE = 'project/bots/managed.json';
const ROOT_VAR = '${FYSO_ROOT}';
// Team files write `${FYSO_ROOT}` unquoted inside flow maps, which YAML cannot parse;
// parse with a marker (as render-team.cjs does) and restore the variable in every string.
const MARKER = '__FYSO_PATH_ROOT__';
const key = name => String(name ?? '').trim().toLowerCase();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

let yamlLib;
function yamlModule() {
  // The project's pinned `yaml` CLI (npm:yaml in mise.toml) carries the library.
  if (!yamlLib) {
    try { yamlLib = createRequire(fs.realpathSync(execFileSync('which', ['yaml'], {encoding: 'utf8'}).trim()))('yaml'); }
    catch { yamlLib = require('yaml'); }
  }
  return yamlLib;
}

function restore(value) {
  if (typeof value === 'string') return value.replaceAll(MARKER, ROOT_VAR);
  if (Array.isArray(value)) return value.map(restore);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, restore(v)]));
}

/** The declared bots of a team file, with `${FYSO_ROOT}` kept as written. */
function declaredBots(teamText) {
  const team = restore(yamlModule().parse(String(teamText).replaceAll(ROOT_VAR, MARKER)) || {});
  return Array.isArray(team.bots) ? team.bots : [];
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]));
}

/**
 * Digest of one declared bot entry. Paths stay as declared (portable across machines);
 * a referenced `file` also contributes its content, so editing a soul file is a change.
 */
function entryDigest(entry, {root, base = path.join(root, 'project/bots')} = {}) {
  const withFiles = value => {
    if (Array.isArray(value)) return value.map(withFiles);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'was') continue;
      if (k === 'file' && typeof v === 'string') {
        const text = v.replaceAll(ROOT_VAR, root), file = path.isAbsolute(text) ? text : path.resolve(base, text);
        let content = null;
        try { content = sha(fs.readFileSync(file)); } catch { /* a missing file is part of the digest */ }
        out[k] = {path: v, sha256: content};
      } else out[k] = withFiles(v);
    }
    return out;
  };
  return sha(JSON.stringify(sorted(withFiles(entry))));
}

function read(root) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(root, FILE), 'utf8')); } catch { return {version: 1, owners: {}}; }
  if (!data || typeof data.owners !== 'object' || !data.owners) throw new Error(`${FILE} is invalid`);
  return data;
}

/** `{owner, digest}` for a managed bot name, or null. */
function ownerOfBot(root, name) {
  for (const [owner, record] of Object.entries(read(root).owners)) {
    for (const [bot, digest] of Object.entries(record?.bots || {})) if (key(bot) === key(name)) return {owner, digest};
  }
  return null;
}

function ownerOfDepartment(root, department) {
  for (const [owner, record] of Object.entries(read(root).owners)) {
    if ((record?.departments || []).some(name => key(name) === key(department))) return owner;
  }
  return null;
}

const refuse = (name, owner) => new Error(`bot ${name} is managed by ${owner}; change it there`);

/** Bot Architect: a managed bot cannot be updated or deleted locally. */
function guardBot(root, name) {
  const managed = ownerOfBot(root, name);
  if (managed) throw refuse(name, managed.owner);
}

/** `team-import` of a managed department is the owner's own operation. */
function guardDepartment(root, department) {
  const owner = ownerOfDepartment(root, department);
  if (owner) throw new Error(`department ${department} is managed by ${owner}; change it there`);
}

/** A proposed team declaration must keep every managed bot exactly as recorded. */
function checkTeam(root, teamText) {
  const owners = read(root).owners;
  if (!Object.keys(owners).length) return;
  const bots = declaredBots(teamText);
  for (const [owner, record] of Object.entries(owners)) {
    for (const [name, digest] of Object.entries(record?.bots || {})) {
      const entries = bots.filter(bot => key(bot?.name) === key(name));
      if (entries.length !== 1 || entryDigest(entries[0], {root}) !== digest) throw refuse(name, owner);
      if (bots.some(bot => bot?.was && key(bot.was) === key(name))) throw refuse(name, owner);
    }
  }
}

/**
 * Replace `owner`'s record with these departments and bots, digested from `teamYaml`
 * (the declaration about to be applied), and commit only the record.
 */
function record({root, owner, teamYaml, departments = [], bots = [], git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'})}) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(owner || '')) throw new Error('invalid owner');
  if (git('status', '--porcelain', '--', FILE).trim()) throw new Error('uncommitted_changes');
  const declared = declaredBots(teamYaml);
  const digests = {};
  for (const name of bots) {
    const entries = declared.filter(bot => key(bot?.name) === key(name));
    if (entries.length !== 1) throw new Error(`managed bot ${name} is not declared exactly once`);
    digests[entries[0].name] = entryDigest(entries[0], {root});
  }
  const data = read(root);
  if (Object.keys(digests).length || departments.length) {
    data.owners[owner] = {departments: [...new Set(departments.map(String))].sort(), bots: Object.fromEntries(Object.entries(digests).sort(([a], [b]) => a.localeCompare(b)))};
  } else delete data.owners[owner];
  data.owners = Object.fromEntries(Object.entries(data.owners).sort(([a], [b]) => a.localeCompare(b)));
  const file = path.join(root, FILE);
  if (!Object.keys(data.owners).length && !fs.existsSync(file)) return null;
  fs.writeFileSync(file, JSON.stringify({version: 1, owners: data.owners}, null, 2) + '\n');
  git('add', '--', FILE);
  try { git('diff', '--cached', '--quiet', '--', FILE); return null; }
  catch { git('commit', '-q', '-m', `bots: record ${owner} managed bots`, '--', FILE); return git('rev-parse', 'HEAD').trim(); }
}

module.exports = {FILE, entryDigest, read, ownerOfBot, ownerOfDepartment, guardBot, guardDepartment, checkTeam, record};

// CLI for the panel's shell actions: `managed-bots.cjs check <team.yaml>`.
if (require.main === module) {
  try {
    const [command, file] = process.argv.slice(2);
    if (command !== 'check' || !file) throw new Error('usage: managed-bots.cjs check <team.yaml>');
    checkTeam(process.env.FYSO_ROOT || process.cwd(), fs.readFileSync(file, 'utf8'));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
