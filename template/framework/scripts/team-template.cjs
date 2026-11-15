// Department templates (D82): one OpenMausBot department as a portable `omb-team/1` package.
// The package carries OMB's own team file text plus its skill files; this module only
// normalizes, validates, digests and proposes the project's team.yaml change. Applying it
// stays the person's reviewed bots plan/apply.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {execFileSync} = require('node:child_process'), {createRequire} = require('node:module');

const FORMAT = 'omb-team/1', MAX_BYTES = 512 * 1024, MAX_SKILLS = 64;
const ROOT_VAR = '${FYSO_ROOT}', MARKER = '__FYSO_PATH_ROOT__';
const SEGMENT = '[a-z0-9][a-z0-9._-]{0,79}';
const SKILL_PATH = new RegExp(`^skills/${SEGMENT}/${SEGMENT}/SKILL\\.md$`);
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
// The same host paths import-bot refuses; check-paths.sh guards the repository.
const HOST_PATH = /\/Users\/[\w.-]+|\/home\/[\w.-]+\/|\/private\/tmp\/|\/private\/var\/|\/var\/folders\/|\/opt\/homebrew\/|[A-Za-z]:\\Users\\/;
const DROPPED = ['cwd', 'chief', 'manages'];

const fail = (code, detail) => { throw Object.assign(Error(code), detail === undefined ? {} : {detail}); };
const slug = value => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

let yamlLib;
function yamlModule() {
  // The project's pinned `yaml` CLI (npm:yaml in mise.toml) carries the library.
  if (!yamlLib) {
    try { yamlLib = createRequire(fs.realpathSync(execFileSync('which', ['yaml'], {encoding: 'utf8'}).trim()))('yaml'); }
    catch { yamlLib = require('yaml'); }
  }
  return yamlLib;
}

/** Canonical JSON: keys sorted at every level. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

const list = value => Array.isArray(value) ? value : [];
const skillFiles = bot => list(bot?.skills).filter(entry => entry && typeof entry === 'object' && typeof entry.file === 'string');
const byPath = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
const byName = (a, b) => { const x = String(a?.name ?? '').toLowerCase(), y = String(b?.name ?? '').toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; };
// A path a package may carry before canonicalization; the canonical one is SKILL_PATH.
const RAW_SKILL_PATH = /^skills\/(?:(?!\.\.?\/)[^/\0]+\/)+SKILL\.md$/;
/** Known keys first, in OMB's export order; any other key after them, sorted. */
function ordered(value, first) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const keys = [...first.filter(key => key in value), ...Object.keys(value).filter(key => !first.includes(key)).sort()];
  return Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}
// OMB writes text with `|-`: trailing newlines are formatting, not content.
const text = value => typeof value === 'string' ? value.replace(/\s+$/, '') : value;

/**
 * The one form of a package: bots and rooms sorted by name, keys in a fixed order, soul and
 * brief without trailing newlines, each bot's skills at `skills/<bot-slug>/<skill>/SKILL.md`.
 * A department exported after this package was applied normalizes back to the same form, so
 * equal configurations have equal digests in any project.
 */
function canonicalize(pkg) {
  const yaml = yamlModule();
  if (!pkg || typeof pkg !== 'object' || pkg.formato !== FORMAT) fail('unsupported_format');
  if (typeof pkg.team !== 'string' || !Array.isArray(pkg.skills)) fail('invalid_package');
  if (Buffer.byteLength(JSON.stringify(pkg)) > MAX_BYTES) fail('too_large');
  if (pkg.skills.length > MAX_SKILLS) fail('too_many_skills');
  // Skill files no bot references are left out of the canonical package.
  const contents = new Map();
  for (const skill of pkg.skills) {
    if (!skill || typeof skill.path !== 'string' || typeof skill.contenido !== 'string' || !RAW_SKILL_PATH.test(skill.path)) fail('unsafe_path', skill?.path);
    if (contents.has(skill.path)) fail('invalid_package', `duplicate ${skill.path}`);
    contents.set(skill.path, skill.contenido);
  }
  let team;
  try { team = yaml.parse(pkg.team); } catch { fail('invalid_package', 'team'); }
  if (!team || typeof team !== 'object' || Array.isArray(team)) fail('invalid_package', 'team');
  const skills = new Map();
  const bots = list(team.bots).map(source => {
    if (!source || typeof source !== 'object') fail('invalid_package', 'bot');
    // OMB exports approval and computer for every bot, filling a missing one from the
    // receiving project's defaults or its own (approval full). State them, the safe way.
    const bot = {...source, soul: text(source.soul), approval: source.approval ?? 'ask', computer: source.computer ?? 'off'};
    if (Array.isArray(bot.skills)) {
      const botSlug = slug(bot.name);
      bot.skills = bot.skills.map(entry => {
        if (!entry || typeof entry !== 'object' || typeof entry.file !== 'string') return entry;
        const file = `skills/${botSlug}/${slug(path.posix.basename(path.posix.dirname(entry.file)))}/SKILL.md`;
        if (!contents.has(entry.file) || !SKILL_PATH.test(file)) fail('unsafe_path', entry.file);
        if (skills.has(file) && skills.get(file) !== contents.get(entry.file)) fail('invalid_package', `two skills at ${file}`);
        skills.set(file, contents.get(entry.file));
        const {file: _, enabled, ...rest} = entry;
        return ordered({file, ...(enabled === false && {enabled}), ...rest}, ['file', 'enabled']);
      });
    }
    return ordered(bot, ['name', 'team', 'title', 'description', 'soul', 'model', 'approval', 'computer', 'cwd', 'tools', 'skills']);
  }).sort(byName);
  const teams = list(team.teams).map(entry => ordered(entry && typeof entry === 'object' ? {...entry, brief: text(entry.brief)} : entry, ['name', 'brief']));
  const rooms = list(team.rooms).map(room => ordered(room, ['name', 'team', 'members', 'responder'])).sort(byName);
  const rest = ordered(team, ['version']);
  for (const key of ['teams', 'bots', 'rooms']) delete rest[key];
  const body = {...rest, version: team.version ?? 1, teams, bots, ...(rooms.length && {rooms})};
  return {formato: FORMAT, departamento: pkg.departamento, team: yaml.stringify(ordered(body, ['version', 'teams', 'bots', 'rooms'])),
    skills: [...skills].map(([file, contenido]) => ({path: file, contenido})).sort(byPath)};
}

function digest(pkg) {
  return crypto.createHash('sha256').update(canonical(canonicalize(pkg))).digest('hex');
}

/**
 * `openmausbot team export --team <name>` text → canonical package. `readSkill(file)` returns
 * the text of a skill file as the export wrote it (relative to the export file).
 */
function normalize(exportText, department, {readSkill, dir} = {}) {
  const yaml = yamlModule();
  const read = readSkill || (file => {
    if (!dir) fail('invalid_export', 'skills need the export directory');
    const base = fs.realpathSync(dir), target = path.resolve(base, file);
    if (!target.startsWith(base + path.sep) || !fs.realpathSync(target).startsWith(base + path.sep)) fail('unsafe_path', file);
    return fs.readFileSync(target, 'utf8');
  });
  const exported = yaml.parse(exportText) || {};
  const teams = list(exported.teams).filter(team => same(team?.name, department));
  if (teams.length !== 1) fail('department_not_found', department);
  const name = String(teams[0].name).trim();
  const skills = new Map();
  const bots = list(exported.bots).filter(bot => same(bot?.team, name)).map(source => {
    const bot = {...source, team: name};
    for (const key of DROPPED) delete bot[key];
    for (const entry of skillFiles(bot)) {
      if (!RAW_SKILL_PATH.test(entry.file)) fail('unsafe_path', entry.file);
      if (!skills.has(entry.file)) skills.set(entry.file, read(entry.file));
    }
    return bot;
  });
  const rooms = list(exported.rooms).filter(room => same(room?.team, name)).map(room => ({...room, team: name}));
  // Rebuilt without the export's dated comment, so the same department gives the same package.
  const raw = {formato: FORMAT, departamento: name, team: yaml.stringify({version: exported.version ?? 1, teams: [{...teams[0], name}], bots, rooms}),
    skills: [...skills].map(([file, contenido]) => ({path: file, contenido}))};
  const pkg = canonicalize(raw);
  check(pkg);
  return pkg;
}

/** Structure, size and portability of a package; throws on an invalid one. Returns its canonical team file. */
function validate(pkg) {
  return check(canonicalize(pkg));
}

function check(pkg) {
  const yaml = yamlModule();
  if (Buffer.byteLength(JSON.stringify(pkg)) > MAX_BYTES) fail('too_large');
  const name = pkg.departamento;
  if (typeof name !== 'string' || !/^[^\r\n]{1,60}$/u.test(name) || name !== name.trim() || same(name, 'general')) fail('invalid_package', 'departamento');
  if (pkg.skills.length > MAX_SKILLS) fail('too_many_skills');
  const files = new Set(pkg.skills.map(skill => skill.path));
  const team = yaml.parse(pkg.team);
  const teams = list(team.teams);
  if (teams.length !== 1 || teams[0]?.name !== name) fail('invalid_package', 'one department');
  if (teams[0].brief !== undefined && typeof teams[0].brief !== 'string') fail('unsafe_path', 'brief');
  if (!Array.isArray(team.bots) || !team.bots.length) fail('invalid_package', 'bots');
  if (team.defaults !== undefined) fail('invalid_package', 'defaults');
  const names = new Set();
  for (const bot of team.bots) {
    if (typeof bot.name !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,79}$/u.test(bot.name)) fail('invalid_package', 'bot name');
    if (names.has(bot.name.toLowerCase())) fail('invalid_package', `duplicate bot ${bot.name}`);
    names.add(bot.name.toLowerCase());
    if (bot.team !== name) fail('invalid_package', `${bot.name}: department`);
    for (const key of DROPPED) if (bot[key] !== undefined) fail('invalid_package', `${bot.name}: ${key}`);
    if (bot.soul !== undefined && typeof bot.soul !== 'string') fail('unsafe_path', `${bot.name}: soul`);
    if (typeof bot.model !== 'string' || !/^[\w.-]+\/[\w./:_-]+$/.test(bot.model)) fail('invalid_package', `${bot.name}: model`);
    for (const entry of skillFiles(bot)) if (!files.has(entry.file)) fail('unsafe_path', entry.file);
  }
  for (const room of list(team.rooms)) {
    if (!room || typeof room.name !== 'string' || room.team !== name) fail('invalid_package', 'room');
    for (const member of list(room.members)) if (!names.has(String(member).toLowerCase())) fail('invalid_package', `room member ${member}`);
  }
  if (HOST_PATH.test(pkg.team) || pkg.skills.some(skill => HOST_PATH.test(skill.contenido))) fail('unsafe_path', 'host path');
  return team;
}

/**
 * The proposed team.yaml: the department's `teams:` entry, bots and rooms replaced in
 * place (new ones appended), everything else, comments and order included, kept.
 */
function propose(current, pkg, teamSlug) {
  const yaml = yamlModule();
  if (!SLUG.test(teamSlug || '')) fail('invalid_slug');
  pkg = canonicalize(pkg);
  const team = check(pkg), name = pkg.departamento;
  if (current.includes(MARKER)) fail('invalid_team_file');
  const doc = yaml.parseDocument(current.replaceAll(ROOT_VAR, MARKER));
  if (doc.errors.length || !yaml.isMap(doc.contents)) fail('invalid_team_file');
  const sequence = key => {
    const node = doc.get(key, true);
    if (node !== undefined && !yaml.isSeq(node)) fail('invalid_team_file');
    if (node) return node;
    const seq = doc.createNode([]);
    // Departments read best before the bots that join them; rooms go last.
    const at = key === 'teams' ? doc.contents.items.findIndex(pair => String(pair.key?.value ?? pair.key) === 'bots') : -1;
    if (at >= 0) doc.contents.items.splice(at, 0, doc.createPair(key, seq)); else doc.set(key, seq);
    return doc.get(key, true);
  };
  const str = node => String((yaml.isScalar(node) ? node.value : node) ?? '');
  const owned = node => yaml.isMap(node) && same(str(node.get('team')), name);
  const bots = sequence('bots');
  for (const node of bots.items) {
    if (!yaml.isMap(node) || owned(node)) continue;
    const taken = team.bots.find(bot => same(bot.name, str(node.get('name'))));
    if (taken) fail('name_taken', taken.name);
  }
  const rooms = doc.has('rooms') || list(team.rooms).length ? sequence('rooms') : null;
  for (const node of rooms?.items || []) {
    if (!yaml.isMap(node) || owned(node)) continue;
    const taken = list(team.rooms).find(room => same(room.name, str(node.get('name'))));
    if (taken) fail('name_taken', taken.name);
  }
  const prefix = `${MARKER}/project/bots/teams/${teamSlug}/`;
  const replace = (seq, wanted) => {
    const at = seq.items.findIndex(owned);
    const kept = seq.items.filter(node => !owned(node));
    const created = wanted.map(value => doc.createNode(value));
    kept.splice(at < 0 ? kept.length : seq.items.slice(0, at).filter(node => !owned(node)).length, 0, ...created);
    seq.items = kept;
  };
  replace(bots, team.bots.map(bot => ({...bot, ...(Array.isArray(bot.skills) && {skills: bot.skills.map(entry =>
    entry && typeof entry === 'object' && typeof entry.file === 'string' ? {...entry, file: prefix + entry.file} : entry)})})));
  if (rooms) {
    replace(rooms, list(team.rooms));
    for (const node of rooms.items) if (owned(node) && yaml.isSeq(node.get('members', true))) node.get('members', true).flow = true;
  }
  const teams = sequence('teams');
  const entry = teams.items.findIndex(node => yaml.isMap(node) && same(str(node.get('name')), name));
  const node = doc.createNode(team.teams[0]);
  if (entry >= 0) teams.items[entry] = node; else teams.items.push(node);
  return doc.toString().replaceAll(MARKER, ROOT_VAR);
}

/** Replace the department's skill files and commit that directory on its own. */
function writeFiles(pkg, teamSlug, {root = process.cwd(), git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}), scan} = {}) {
  pkg = canonicalize(pkg);
  check(pkg);
  if (!SLUG.test(teamSlug || '')) fail('invalid_slug');
  const dir = `project/bots/teams/${teamSlug}`, skillsDir = path.join(root, dir, 'skills');
  if (git('status', '--porcelain', '--', dir).trim()) fail('uncommitted_changes', dir);
  fs.rmSync(skillsDir, {recursive: true, force: true});
  for (const skill of pkg.skills) {
    const file = path.join(root, dir, skill.path);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, skill.contenido);
  }
  try { scan?.(path.join(root, dir)); } catch (error) {
    // Restore the committed version of this directory only.
    fs.rmSync(skillsDir, {recursive: true, force: true});
    try { git('checkout', 'HEAD', '--', dir); } catch { /* the department was new */ }
    throw Object.assign(Error('secret_detected'), {cause: error});
  }
  git('add', '-A', '--', dir);
  try { git('diff', '--cached', '--quiet', '--', dir); return null; }
  catch {
    git('commit', '-q', '-m', `teams: import department ${teamSlug}`, '--', dir);
    return git('rev-parse', 'HEAD').trim();
  }
}

/** Department names `project/bots/team.yaml` declares or its bots and rooms use, in file order. */
function departments(root = process.cwd()) {
  const team = yamlModule().parse(fs.readFileSync(path.join(root, 'project/bots/team.yaml'), 'utf8').replaceAll(ROOT_VAR, MARKER)) || {};
  const names = [];
  const add = value => { const name = String(value ?? '').trim(); if (name && !names.some(other => same(other, name))) names.push(name); };
  for (const key of ['teams', 'bots', 'rooms']) for (const item of list(team[key])) add(key === 'teams' ? item?.name : item?.team);
  return names;
}

/** Export one department from this project's OMB, always on its explicit port. Resolves to `{package, digest}`. */
async function exportDepartment(name, {root = process.env.FYSO_ROOT || process.cwd(), port = process.env.FYSO_OMB_PORT, tmp = process.env.FYSO_DATA || path.join(root, '.data'), run} = {}) {
  if (!/^[0-9]+$/.test(String(port || ''))) fail('omb_port_required');
  if (typeof name !== 'string' || !/^[^\r\n]{1,60}$/u.test(name.trim())) fail('invalid_department');
  const base = path.join(tmp || require('node:os').tmpdir(), 'team-template');
  fs.mkdirSync(base, {recursive: true, mode: 0o700});
  const dir = fs.mkdtempSync(path.join(base, 'export.'));
  try {
    const file = path.join(dir, 'team.yaml');
    const omb = run || (args => execFileSync('openmausbot', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}));
    try { omb(['team', 'export', '--team', name.trim(), '--out', file, '--port', String(port)]); }
    catch (error) {
      let detail = String(error.stderr || error.stdout || '').trim();
      try { detail = JSON.parse(String(error.stdout)).error || detail; } catch { /* plain text */ }
      fail('omb_export_failed', detail.slice(0, 300) || undefined);
    }
    const pkg = normalize(fs.readFileSync(file, 'utf8'), name.trim(), {dir});
    return {package: pkg, digest: digest(pkg)};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

/** Package of one extension template: `extensions/<ext>/teams/<slug>/team.yaml` plus `skills/**`. */
function extensionPackage(ext, teamSlug, {root = process.cwd()} = {}) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(ext || '') || !SLUG.test(teamSlug || '')) fail('invalid_source');
  const dir = path.join(root, 'extensions', ext, 'teams', teamSlug);
  const text = fs.readFileSync(path.join(dir, 'team.yaml'), 'utf8');
  const skills = [];
  const walk = folder => {
    if (!fs.existsSync(folder)) return;
    for (const item of fs.readdirSync(folder, {withFileTypes: true})) {
      const full = path.join(folder, item.name);
      if (item.isSymbolicLink()) fail('unsafe_path', path.relative(dir, full));
      if (item.isDirectory()) walk(full);
      else if (item.name === 'SKILL.md') skills.push({path: path.relative(dir, full).split(path.sep).join('/'), contenido: fs.readFileSync(full, 'utf8')});
    }
  };
  walk(path.join(dir, 'skills'));
  const team = yamlModule().parse(text) || {};
  const departamento = String(list(team.teams)[0]?.name ?? '').trim();
  const pkg = {formato: FORMAT, departamento, team: text, skills: skills.sort((a, b) => a.path < b.path ? -1 : 1)};
  validate(pkg);
  return pkg;
}

/** Department templates the installed extensions ship (extensions contract §2). */
function templates({root = process.cwd()} = {}) {
  const found = [];
  const extensions = path.join(root, 'extensions');
  for (const ext of fs.existsSync(extensions) ? fs.readdirSync(extensions).sort() : []) {
    const base = path.join(extensions, ext, 'teams');
    if (!fs.existsSync(base)) continue;
    for (const teamSlug of fs.readdirSync(base).sort()) {
      if (!fs.existsSync(path.join(base, teamSlug, 'team.yaml'))) continue;
      try {
        const pkg = extensionPackage(ext, teamSlug, {root}), team = yamlModule().parse(pkg.team);
        const brief = team.teams[0].brief;
        found.push({source: `extension:${ext}/${teamSlug}`, extension: ext, slug: teamSlug, departamento: pkg.departamento,
          ...(typeof brief === 'string' && {brief}), bots: team.bots.map(bot => ({name: bot.name, ...(bot.title && {title: bot.title})})),
          rooms: list(team.rooms).map(room => room.name), skills: pkg.skills.length, digest: digest(pkg)});
      } catch (error) {
        found.push({source: `extension:${ext}/${teamSlug}`, extension: ext, slug: teamSlug, error: error.detail ? `${error.message}: ${error.detail}` : error.message});
      }
    }
  }
  return found;
}

const gitleaks = dir => execFileSync('gitleaks', ['dir', dir, '--no-banner', '--redact'], {stdio: ['ignore', 'ignore', 'pipe']});

/**
 * Import: commit the department's skill files, then resolve to the proposed team.yaml for the
 * person to review and apply. `pkg` may be null with `source: "extension:<ext>/<slug>"`.
 * `scan` defaults to gitleaks over the written files; `false` skips it.
 */
async function importPackage(pkg, {root = process.env.FYSO_ROOT || process.cwd(), source, slug: teamSlug, scan = gitleaks, git} = {}) {
  if (!pkg) {
    const match = /^extension:([a-z][a-z0-9-]{1,30})\/([a-z0-9][a-z0-9-]{0,59})$/.exec(source || '');
    if (!match) fail('invalid_source');
    pkg = extensionPackage(match[1], match[2], {root});
    teamSlug = teamSlug || match[2];
  }
  pkg = canonicalize(pkg);
  check(pkg);
  teamSlug = teamSlug || slug(pkg.departamento);
  const currentTeamYaml = fs.readFileSync(path.join(root, 'project/bots/team.yaml'), 'utf8');
  // Propose first: a rejected package writes nothing.
  const proposedTeamYaml = propose(currentTeamYaml, pkg, teamSlug);
  const commit = writeFiles(pkg, teamSlug, {root, scan: scan || undefined, ...(git && {git})});
  return {proposedTeamYaml, currentTeamYaml, commit, slug: teamSlug, departamento: pkg.departamento, digest: digest(pkg), ...(source && {source})};
}

module.exports = {FORMAT, MAX_BYTES, MAX_SKILLS, canonical, canonicalize, digest, normalize, validate, propose, departments, writeFiles, exportDepartment, extensionPackage, templates, importPackage, slug};

if (require.main === module) {
  const [op, arg] = process.argv.slice(2);
  (async () => op === 'export' ? exportDepartment(arg)
    : op === 'list' ? {templates: templates()}
    : op === 'departments' ? {departments: departments()}
    : op === 'validate' ? (pkg => ({digest: (validate(pkg), digest(pkg))}))(JSON.parse(fs.readFileSync(arg, 'utf8')))
    : fail('usage: team-template.cjs export <department> | departments | list | validate <package.json>'))()
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.detail ? `${error.message}: ${error.detail}` : error.message); process.exitCode = 1; });
}
