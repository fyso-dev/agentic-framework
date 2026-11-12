// Third-party Agent Skills (D64). A skill source is a git repository + path + commit:
// a public directory (skills.sh) only names repositories, the files always come from git.
// An installed skill is a plain copy in project/bots/skills/<name>/ plus one record in
// project/bots/third-party-skills.json (source, commit, license, scan, review), so it
// can be rebuilt and upgraded from the repo. A bot gets it only after OpenMausBot's scan
// ran and a person confirmed that exact content (PLAN §12.2); render-team.cjs enforces it.
// A fetched SKILL.md is untrusted text: it is stored and shown, never interpreted here.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const {createRequire} = require('node:module');
const {execFileSync, spawnSync} = require('node:child_process');
const yaml = createRequire(fs.realpathSync(execFileSync('which', ['yaml'], {encoding:'utf8'}).trim()))('yaml');

const SOURCES = 'project/skill-sources.yaml', LOCK = 'project/bots/third-party-skills.json', DIR = 'project/bots/skills';
const TEAM = 'project/bots/team.yaml', DIRECTORY = 'skills.sh';
const DEFAULT_SOURCES = ['gh:anthropics/skills', DIRECTORY];
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;        // Agent Skills specification, `name`
const MAX_SKILL_MD = 256 * 1024;                   // OpenMausBot refuses a larger SKILL.md
const MAX_FILES = 300, MAX_BYTES = 5 * 1024 * 1024;

const gitUrl = src => src.replace(/^gh:([^/]+\/[^/@]+?)(\.git)?$/, 'https://github.com/$1.git');
const git = (args, opts = {}) => execFileSync('git', args, {encoding:'utf8', stdio:['ignore','pipe','pipe'], timeout:120_000,
  env:{...process.env, GIT_TERMINAL_PROMPT:'0', GIT_CONFIG_COUNT:'2', GIT_CONFIG_KEY_0:'credential.helper', GIT_CONFIG_VALUE_0:'', GIT_CONFIG_KEY_1:'core.hooksPath', GIT_CONFIG_VALUE_1:'/dev/null'}, ...opts});
const message = e => String(e.stderr || e.message || e).trim().split('\n').pop();
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁤﻿]+/g, ' ').trim().slice(0, max);
const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const real = p => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const validName = name => typeof name === 'string' && name.length <= 64 && NAME.test(name);
const requireName = name => { if (!validName(name)) throw Error('expected the name of an installed skill'); return name; };

// ── Sources ────────────────────────────────────────────────────────────────────────

function sources() {
  const list = fs.existsSync(SOURCES) ? yaml.parse(fs.readFileSync(SOURCES, 'utf8')) ?? [] : DEFAULT_SOURCES;
  if (!Array.isArray(list) || list.some(s => typeof s !== 'string')) throw Error(`${SOURCES}: expected a list of git sources`);
  return list;
}

/** What a person can paste: owner/repo, gh:owner/repo, a GitHub or skills.sh URL, or any git URL. */
function parseSource(input) {
  const text = String(input || '').trim();
  const github = (owner, repo, rest = {}) => {
    if ([owner, repo].some(part => part === '.' || part === '..')) throw Error('that is not a repository');
    return {src:`gh:${owner}/${repo}`, ...rest};
  };
  let m;
  if ((m = /^https?:\/\/(?:www\.)?skills\.sh\/([\w.-]+)\/([\w.-]+)(?:\/([\w.-]+))?\/?$/i.exec(text))) return github(m[1], m[2], m[3] && {skill:m[3]});
  if ((m = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+?))?)?\/?$/i.exec(text))) return github(m[1], m[2], {...(m[3] && {ref:m[3]}), ...(m[4] && {dir:m[4]})});
  if ((m = /^(?:gh:)?([\w.-]+)\/([\w.-]+)$/.exec(text)) && !fs.existsSync(text)) return github(m[1], m[2]);
  // `::` would select a git remote helper (ext::, fd::): never from a pasted source.
  if (!text || /\s/.test(text) || text.startsWith('-') || text.includes('::')) throw Error('expected a git repository: owner/repo, a GitHub or skills.sh address, or a git URL');
  if (!fs.existsSync(text)) {
    let url; try { url = new URL(text); } catch { throw Error('expected a public HTTPS git repository'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('expected a public HTTPS git repository without credentials or query');
  }
  return {src:text};
}

/** Clone a source at a ref (default: the tip of its default branch); `use` gets the folder and the commit. */
function withRepo(src, ref, use) {
  if (ref && !/^[\w][\w./-]{0,199}$/.test(ref)) throw Error('expected a commit, tag or branch');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fyso-skill-'));
  try {
    try {
      if (!ref) git(['clone', '--quiet', '--depth', '1', '--', gitUrl(src), dir]);
      else {
        git(['clone', '--quiet', '--filter=blob:none', '--no-checkout', '--', gitUrl(src), dir]);
        try { git(['-C', dir, 'checkout', '--quiet', '--detach', ref]); } catch { git(['-C', dir, 'checkout', '--quiet', '--detach', `origin/${ref}`]); }
      }
    } catch (e) { throw Error(`${src}: ${message(e)}`); }
    return use(dir, git(['-C', dir, 'rev-parse', 'HEAD']).trim());
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
}

/** One skill folder: frontmatter per the Agent Skills specification, plus where its license is. */
function readSkill(root, rel) {
  const folder = path.join(root, rel), file = path.join(folder, 'SKILL.md');
  if (fs.lstatSync(file).size > MAX_SKILL_MD) return null;
  const text = fs.readFileSync(file, 'utf8');
  const front = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  let meta = null;
  try { meta = front && yaml.parse(front[1]); } catch {}
  if (!meta || typeof meta !== 'object' || !validName(meta.name) || typeof meta.description !== 'string' || !meta.description.trim() || meta.description.length > 1024) return null;
  const licenseIn = dir => fs.readdirSync(dir, {withFileTypes:true}).find(e => e.isFile() && /^(LICEN[SC]E|COPYING)(\.[A-Za-z]+)?$/i.test(e.name))?.name;
  const own = licenseIn(folder), shared = own || rel === '' ? undefined : licenseIn(root);
  const licenseFile = own ? path.join(folder, own) : shared ? path.join(root, shared) : null;
  const licenseText = licenseFile && fs.statSync(licenseFile).size <= MAX_SKILL_MD ? fs.readFileSync(licenseFile, 'utf8') : '';
  return {name:meta.name, description:clean(meta.description, 1024),
    license:typeof meta.license === 'string' ? clean(meta.license, 200) : null,
    licenseFile:own || (shared ? `${shared} (repository)` : null),
    licenseTitle:clean(licenseText.split('\n').find(line => line.trim()), 80) || null,
    path:rel.split(path.sep).join('/'), text, licenseText, sharedLicense:shared ? path.join(root, shared) : null};
}

/** Every folder with a valid SKILL.md under `start`; a skill folder is not searched further. */
function findSkills(root, start = '') {
  const base = path.resolve(root, start);
  if (base !== path.resolve(root) && !base.startsWith(path.resolve(root) + path.sep)) throw Error('the folder is outside the repository');
  if (!fs.existsSync(base)) throw Error(`no folder ${start} in that repository`);
  if (real(base) !== real(root) && !real(base).startsWith(real(root) + path.sep)) throw Error('the folder is outside the repository');
  const found = [];
  (function walk(rel, depth) {
    const entries = fs.readdirSync(path.join(root, rel), {withFileTypes:true});
    if (entries.some(e => e.name === 'SKILL.md' && e.isFile())) { const skill = readSkill(root, rel); if (skill) found.push(skill); return; }
    if (depth < 6) for (const e of entries) if (e.isDirectory() && e.name !== '.git' && e.name !== 'node_modules') walk(path.join(rel, e.name), depth + 1);
  })(path.relative(root, base), 0);
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** The one skill a source and an optional name point to. */
function pick(skills, wanted, src) {
  const want = slug(wanted);
  const match = want ? skills.filter(s => s.name === want || slug(path.basename(s.path)) === want) : skills;
  if (match.length === 1) return match[0];
  if (!match.length) throw Error(wanted ? `no skill named "${clean(wanted, 64)}" in ${src}` : `no SKILL.md found in ${src}`);
  throw Error(`${src} has ${match.length} skills; name one: ${match.slice(0, 20).map(s => s.name).join(', ')}`);
}

// ── Record ─────────────────────────────────────────────────────────────────────────

function checkMutationPath(target, directory) {
    let current = path.resolve('.');
    for (const segment of target.split(path.sep)) {
      current = path.join(current, segment);
      let stat;
      try { stat = fs.lstatSync(current); } catch (e) { if (e.code === 'ENOENT') break; throw e; }
      const last = current === path.resolve(target);
      if (stat.isSymbolicLink() || (!last || directory ? !stat.isDirectory() : !stat.isFile()))
        throw Error(`unsafe skill mutation path: ${current}`);
    }
}
function mutationPaths(name) {
  checkMutationPath(DIR, true);
  if (name) checkMutationPath(path.join(DIR, requireName(name)), true);
  checkMutationPath(LOCK, false);
}
const readLock = () => fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : {};
function writeLock(lock) {
  mutationPaths();
  fs.mkdirSync(path.dirname(LOCK), {recursive:true});
  fs.writeFileSync(LOCK, JSON.stringify(Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
}
const skillFile = name => path.join(DIR, name, 'SKILL.md');
// Approval covers every retained byte, including license and supporting files.
function folderHash(folder, sharedLicense) {
  if (!fs.lstatSync(folder).isDirectory()) throw Error('skill folder must be a regular directory');
  const entries = new Map(); let bytes = 0;
  (function walk(rel) {
    for (const e of fs.readdirSync(path.join(folder, rel), {withFileTypes:true})) {
      if (e.name === '.git') continue;
      const item = path.join(rel, e.name), file = path.join(folder, item);
      if (e.isDirectory()) walk(item);
      else {
        if (!e.isFile()) throw Error(`${item} is a link or a special file; skills with those are refused`);
        bytes += fs.statSync(file).size;
        if (entries.size >= MAX_FILES || bytes > MAX_BYTES) throw Error('skill exceeds the file or size limit');
        entries.set(item.split(path.sep).join('/'), fs.readFileSync(file));
      }
    }
  })('');
  if (sharedLicense) entries.set(path.basename(sharedLicense), fs.readFileSync(sharedLicense));
  const hash = crypto.createHash('sha256');
  for (const [file, data] of [...entries].sort(([a], [b]) => a.localeCompare(b))) hash.update(JSON.stringify([file, data.length])).update(data);
  return hash.digest('hex');
}
const currentHash = name => { try {
  let part = path.resolve('.');
  for (const segment of path.join(DIR, name).split(path.sep)) {
    part = path.join(part, segment);
    if (fs.lstatSync(part).isSymbolicLink()) return null;
  }
  return folderHash(part);
} catch { return null; } };

/** Name of the third-party skill a team file entry points to, or null. */
function thirdParty(file, lock = readLock()) {
  if (typeof file !== 'string' || path.basename(file) !== 'SKILL.md') return null;
  const folder = path.resolve(path.dirname(file)), name = path.basename(folder);
  if (path.dirname(folder) === path.resolve(DIR) && Object.hasOwn(lock, name)) return name;
  const resolved = real(folder), resolvedName = path.basename(resolved);
  return path.dirname(resolved) === real(DIR) && Object.hasOwn(lock, resolvedName) ? resolvedName : null;
}

/** Bots of the project declaration that have each third-party skill on. */
function teamUses(lock = readLock()) {
  const uses = {};
  if (!fs.existsSync(TEAM)) return uses;
  const team = yaml.parse(fs.readFileSync(TEAM, 'utf8').replaceAll('${FYSO_ROOT}', path.resolve('.'))) || {};
  for (const bot of Array.isArray(team.bots) ? team.bots : []) {
    for (const entry of Array.isArray(bot?.skills ?? team.defaults?.skills) ? (bot.skills ?? team.defaults.skills) : []) {
      if (!entry || typeof entry.file !== 'string' || entry.enabled === false) continue;
      const name = thirdParty(path.resolve(path.dirname(TEAM), entry.file), lock);
      if (name) (uses[name] ||= []).push(String(bot.name));
    }
  }
  return uses;
}

/** Installed third-party skills with their state: modified → scan → review → ready. */
function inventory() {
  const lock = readLock(), uses = teamUses(lock);
  return Object.entries(lock).map(([name, e]) => {
    const now = currentHash(name);
    const state = now !== e.sha256 ? 'modified' : e.scan?.sha256 !== e.sha256 ? 'scan' : e.review?.sha256 !== e.sha256 ? 'review' : 'ready';
    return {name, description:e.description, src:e.src, path:e.path, commit:e.commit, license:e.license, licenseFile:e.licenseFile,
      licenseTitle:e.licenseTitle, sha256:e.sha256, files:e.files, installedAt:e.installedAt,
      scan:e.scan?.sha256 === e.sha256 ? {at:e.scan.at, warnings:e.scan.warnings} : null,
      review:e.review?.sha256 === e.sha256 ? {at:e.review.at} : null, state, bots:uses[name] || []};
  });
}

function writePanel() {
  const dir = path.join(process.env.FYSO_DATA || '.data', 'panel');
  fs.mkdirSync(dir, {recursive:true});
  fs.writeFileSync(path.join(dir, 'skills.json'), JSON.stringify(inventory()));
}

/**
 * The gate, called for every skill entry of a team file before OpenMausBot sees it.
 * A third-party skill passes only with the content a person confirmed. An entry that is
 * off and whose file is gone is left out too: OpenMausBot rejects the whole team for it.
 */
function gate(entry, bot = '') {
  if (!entry || typeof entry.file !== 'string') return true;
  const lock = readLock(), name = thirdParty(entry.file, lock);
  if (!name) return entry.enabled !== false || fs.existsSync(entry.file);
  const ok = !!lock[name].review && lock[name].scan?.sha256 === lock[name].sha256 && lock[name].review.sha256 === lock[name].sha256 && lock[name].sha256 === currentHash(name);
  if (!ok) console.error(`skill "${name}" is not confirmed for its current content: disabled${bot ? ` for "${bot}"` : ''} (mise run skills:list)`);
  return ok;
}

// ── Discovery ──────────────────────────────────────────────────────────────────────

/** Keyword search in the public directory. It names repositories only; nothing is installed from it. */
async function directory(query) {
  const base = process.env.FYSO_SKILLS_DIRECTORY_URL || 'https://skills.sh';
  const res = await fetch(`${base}/api/search?${new URLSearchParams({q:query, limit:'20'})}`, {signal:AbortSignal.timeout(10_000)});
  if (!res.ok) throw Error(`${DIRECTORY} answered ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.skills)) throw Error(`${DIRECTORY} returned an unsupported search response`);
  return data.skills
    .filter(s => /^[\w.-]+\/[\w.-]+$/.test(s?.source || '') && validName(s.skillId))
    .map(s => ({name:slug(s.skillId), src:`gh:${s.source}`, origin:'directory',
      url:`https://skills.sh/${s.source}/${slug(s.skillId)}`, ...(Number.isFinite(s.installs) && {installs:s.installs})}));
}

const publicSkill = ({text, licenseText, sharedLicense, ...skill}) => skill;

/** Skills of the project's sources that match a text, then matches from the public directory. */
async function search(query = '') {
  const q = String(query).trim().toLowerCase(), lock = readLock(), listed = [], skills = [];
  const add = entry => {
    const held = lock[entry.name];
    skills.push({...entry, installed:!!held, ...(held && held.src === entry.src && entry.commit && {update:held.commit !== entry.commit})});
  };
  // A pasted repository (owner/repo, a GitHub or skills.sh address, gh:…) is listed as it is.
  const pasted = /^(https?:\/\/\S+|gh:\S+|[\w.-]+\/[\w.-]+)$/.test(String(query).trim()) ? String(query).trim() : null;
  for (const source of pasted ? [pasted] : sources()) {
    try {
      if (source === DIRECTORY) {
        if (q.length < 2) { listed.push({source, skipped:true}); continue; }
        const hits = (await directory(q)).filter(hit => !skills.some(s => s.src === hit.src && s.name === hit.name));
        hits.forEach(add); listed.push({source, count:hits.length});
      } else {
        const {src, ref, dir:folder, skill} = parseSource(source);
        const hits = withRepo(src, ref, (dir, commit) => findSkills(dir, folder || '').map(s => ({...publicSkill(s), src, commit, origin:'source'})))
          .filter(s => pasted ? !skill || s.name === slug(skill) : !q || `${s.name} ${s.description}`.toLowerCase().includes(q));
        hits.forEach(add); listed.push({source, count:hits.length});
      }
    } catch (e) { listed.push({source, error:message(e)}); }
  }
  return {collectedAt:new Date().toISOString(), query:String(query).trim(), sources:listed, skills, installed:inventory()};
}

/** Fetch one skill at a commit: what the person reads before installing it. */
function resolve(source, wanted, ref, use) {
  const parsed = parseSource(source);
  return withRepo(parsed.src, ref || parsed.ref, (dir, commit) => {
    const skill = pick(findSkills(dir, parsed.dir || ''), wanted || parsed.skill, parsed.src);
    return use({...skill, src:parsed.src, commit, sha256:folderHash(path.join(dir, skill.path), skill.sharedLicense)}, path.join(dir, skill.path));
  });
}

function preview(source, wanted, ref) {
  return resolve(source, wanted, ref, (skill, folder) => {
    const files = [];
    (function walk(rel) {
      for (const e of fs.readdirSync(path.join(folder, rel), {withFileTypes:true})) {
        if (e.isDirectory()) { if (e.name !== '.git') walk(path.join(rel, e.name)); }
        else if (files.length < MAX_FILES) files.push(path.join(rel, e.name).split(path.sep).join('/'));
      }
    })('');
    const held = readLock()[skill.name];
    return {...publicSkill(skill), skillMd:skill.text, licenseText:skill.licenseText, files:files.sort(),
      installed:!!held, ...(held && {installedCommit:held.commit, installedSrc:held.src})};
  });
}

/** The installed copy of one skill: what the person confirms. */
function local(name) {
  const skill = inventory().find(s => s.name === requireName(name));
  if (!skill) throw Error(`${name} is not installed`);
  const folder = path.join(DIR, name), files = [];
  (function walk(rel) {
    for (const e of fs.readdirSync(path.join(folder, rel), {withFileTypes:true})) {
      if (e.isDirectory()) walk(path.join(rel, e.name));
      else if (files.length < MAX_FILES) files.push(path.join(rel, e.name).split(path.sep).join('/'));
    }
  })('');
  const license = skill.licenseFile && path.join(folder, path.basename(skill.licenseFile));
  const licenseText = license && fs.existsSync(license) && fs.lstatSync(license).isFile() && fs.statSync(license).size <= MAX_SKILL_MD ? fs.readFileSync(license, 'utf8') : '';
  return {...skill, licenseText, sha256:currentHash(name), skillMd:fs.readFileSync(skillFile(name), 'utf8').slice(0, MAX_SKILL_MD), files:files.sort()};
}

// ── Scan (OpenMausBot) ─────────────────────────────────────────────────────────────

/**
 * OpenMausBot scans a SKILL.md when a bot imports it and has no other entry point for
 * local text (spike). So the skill is imported switched off into one bot of THIS
 * project's instance, its warnings are read and the import is deleted again.
 */
async function ombScan(name, description, text) {
  const port = process.env.FYSO_OMB_PORT;
  if (!/^\d+$/.test(port || '')) throw Error('FYSO_OMB_PORT is not set: the scan only talks to this project\'s OpenMausBot');
  const api = async (url, init) => {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {...init, headers:{'content-type':'application/json'}, signal:AbortSignal.timeout(20_000)});
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Error(`OpenMausBot ${res.status}: ${clean(body.error, 300)}`);
    return body;
  };
  const warnings = found => {
    if (!Array.isArray(found) || found.some(w => typeof w !== 'string')) throw Error('OpenMausBot returned no valid scan result');
    return found.map(w => clean(w, 2000));
  };
  const hash = sha256(text);
  for (const bot of (await api('/api/bots?messages=0')).bots || []) {
    const id = encodeURIComponent(bot.id);
    const probe = `fyso-scan-${crypto.randomBytes(16).toString('hex')}`;
    const existing = (await api(`/api/bots/${id}/skills`)).skills || [];
    if (existing.some(s => s.name === probe)) continue;
    let installed;
    try {
      ({installed} = await api(`/api/bots/${id}/skill-template`, {method:'POST',
        body:JSON.stringify({name:probe, description, source:'fyso scan', text, enabled:false, warnings:[]})}));
      if (installed?.sha256 !== hash || installed.enabled !== false) throw Error('OpenMausBot did not attest the disabled content');
      return warnings(installed.warnings);
    } finally {
      if (installed) {
        const held = ((await api(`/api/bots/${id}/skills`)).skills || []).find(s => s.name === probe);
        if (!held || held.sha256 !== hash || held.enabled !== false ||
            (installed.importedAt && held.importedAt !== installed.importedAt)) throw Error('OpenMausBot scan probe ownership changed');
        await api(`/api/bots/${id}/skills/${probe}`, {method:'DELETE'});
      }
    }
  }
  throw Error('no bot is free to run the scan');
}

async function scan(name, lock = readLock(), {quiet = false} = {}) {
  mutationPaths(name);
  const entry = lock[requireName(name)];
  if (!entry) throw Error(`${name} is not installed`);
  if (currentHash(name) !== entry.sha256) throw Error(`${name} was changed after it was installed; run mise run skills:update ${name}`);
  try {
    const warnings = await ombScan(name, entry.description, fs.readFileSync(skillFile(name), 'utf8'));
    entry.scan = {by:'openmausbot', at:new Date().toISOString(), sha256:entry.sha256, warnings};
  } catch (e) {
    if (!quiet) throw e;
    console.error(`scan not run (${message(e)}); run it later: mise run skills:scan ${name}`);
  }
  return lock;
}

// Immutable preview/apply plans for platform MCP clients. Human confirmation is separate.
function plan(mode, source, wanted, name, ref) {
  if (!['add', 'update'].includes(mode)) throw Error('plan mode must be add or update');
  const lock = readLock(), held = mode === 'update' ? lock[requireName(name)] : null;
  if (mode === 'update' && !held) throw Error('skill is not installed');
  const detail = preview(held?.src || source, held ? name : wanted, ref);
  const planId = crypto.randomBytes(16).toString('hex');
  const folder = path.join(process.env.FYSO_DATA || '.data', 'skill-plans');
  fs.mkdirSync(folder, {recursive:true, mode:0o700});
  fs.writeFileSync(path.join(folder, `${planId}.json`), JSON.stringify({mode, detail, name:held ? name : detail.name,
    base:JSON.stringify(lock), expires:Date.now() + 30 * 60 * 1000}), {mode:0o600});
  return {collectedAt:new Date().toISOString(), planId, preview:detail};
}
async function applyPlan(planId) {
  if (!/^[a-f0-9]{32}$/.test(planId || '')) throw Error('expected a skill planId');
  const file = path.join(process.env.FYSO_DATA || '.data', 'skill-plans', `${planId}.json`);
  const planned = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (planned.expires < Date.now() || planned.base !== JSON.stringify(readLock())) throw Error('skill plan is stale; preview again');
  const d = planned.detail;
  const output = planned.mode === 'add' ? await add(d.src, d.name, d.commit, d.sha256) : await update(planned.name, d.commit, d.sha256);
  fs.rmSync(file);
  return output;
}

// ── Changes ────────────────────────────────────────────────────────────────────────

const inGit = () => { try { return git(['rev-parse', '--is-inside-work-tree']).trim() === 'true'; } catch { return false; } };
/** Commit only the skill's folder and the record, never other work. */
function commit(text, name) {
  if (!inGit()) return null;
  const paths = [path.join(DIR, name), LOCK];
  git(['add', '-A', '--', ...paths.filter(p => fs.existsSync(p))]);
  for (const p of paths.filter(p => !fs.existsSync(p))) git(['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', p]);
  try { git(['diff', '--cached', '--quiet', '--', ...paths]); return null; } catch {}
  git(['commit', '-q', '-m', text, '--', ...paths]);
  return git(['rev-parse', '--short', 'HEAD']).trim();
}

/** Copy a skill folder: regular files only, bounded, checked for secrets before it is kept. */
function copySkill(from, to, skill) {
  let files = 0, bytes = 0;
  try {
    (function walk(rel) {
      fs.mkdirSync(path.join(to, rel), {recursive:true});
      for (const e of fs.readdirSync(path.join(from, rel), {withFileTypes:true})) {
        const item = path.join(rel, e.name);
        if (e.isDirectory()) { if (e.name !== '.git') walk(item); }
        else if (!e.isFile()) throw Error(`${item} is a link or a special file; skills with those are refused`);
        else {
          bytes += fs.statSync(path.join(from, item)).size;
          if (++files > MAX_FILES || bytes > MAX_BYTES) throw Error(`the skill is larger than ${MAX_FILES} files or ${MAX_BYTES / 1048576} MB`);
          fs.copyFileSync(path.join(from, item), path.join(to, item));
        }
      }
    })('');
    // A license kept at the repository root travels with the copy.
    if (skill.sharedLicense) { fs.copyFileSync(skill.sharedLicense, path.join(to, path.basename(skill.sharedLicense))); files++; }
    const leaks = spawnSync('gitleaks', ['dir', to, '--no-banner', '--redact'], {encoding:'utf8'});
    if (leaks.error) throw Error('gitleaks is not available (mise install)');
    if (leaks.status) throw Error('the skill contains something that looks like a secret (gitleaks); it was not installed');
  } catch (e) { mutationPaths(); checkMutationPath(to, true); fs.rmSync(to, {recursive:true, force:true}); throw e; }
  return files;
}

function record(skill, files, previous = {}) {
  const now = new Date().toISOString();
  return {...previous, src:skill.src, path:skill.path, commit:skill.commit, description:skill.description, license:skill.license,
    licenseFile:skill.sharedLicense ? path.basename(skill.sharedLicense) : skill.licenseFile, licenseTitle:skill.licenseTitle,
    sha256:skill.sha256, files, installedAt:previous.installedAt || now, ...(previous.installedAt && {updatedAt:now})};
}

const result = (op, name, change, extra = {}) => {
  writePanel();
  return {op, name, commit:change, skill:inventory().find(s => s.name === name) || null, ...extra};
};

async function add(source, wanted, ref, reviewed) {
  mutationPaths();
  if (process.env.SKILLS_APPLY && (!/^[a-f0-9]{40}$/.test(ref || '') || !reviewed)) throw Error('preview an immutable commit and SHA256 before applying');
  // The source is saved in the record, which check-paths scans before every snapshot.
  if (path.isAbsolute(String(source)) || String(source).startsWith('~')) {
    const warning = `${source} is a path of this machine; it would be saved in ${LOCK} and fail check-paths. Publish the repository to git.`;
    if (process.env.SKILLS_APPLY) throw Error(warning);
    console.error(`warning: ${warning}`);
  }
  const lock = readLock();
  const skill = resolve(source, wanted, ref, (found, folder) => {
    if (reviewed && reviewed !== found.sha256) throw Error('skill changed since preview; read it again');
    mutationPaths(found.name);
    if (lock[found.name]) throw Error(`${found.name} is already installed (mise run skills:update ${found.name})`);
    if (fs.existsSync(path.join(DIR, found.name))) throw Error(`${DIR}/${found.name} already exists and is not a third-party skill`);
    return {...found, files:copySkill(folder, path.join(DIR, found.name), found)};
  });
  lock[skill.name] = record(skill, skill.files);
  writeLock(await scan(skill.name, lock, {quiet:true}));
  return result('add', skill.name, commit(`skills: add ${skill.name} ${skill.commit.slice(0, 12)}`, skill.name));
}

async function update(name, ref, reviewed) {
  mutationPaths(name);
  if (process.env.SKILLS_APPLY && (!/^[a-f0-9]{40}$/.test(ref || '') || !reviewed)) throw Error('preview an immutable commit and SHA256 before applying');
  const lock = readLock(), entry = lock[requireName(name)];
  if (!entry) throw Error(`${name} is not installed`);
  fs.mkdirSync(DIR, {recursive:true});
  const temp = fs.mkdtempSync(path.join(DIR, `.${name}-`)), staged = path.join(temp, 'skill');
  try {
  const skill = withRepo(entry.src, ref, (dir, at) => {
    const all = findSkills(dir), found = all.find(s => s.path === entry.path && s.name === name) || pick(all, name, entry.src);
    if (found.name !== name) throw Error(`${entry.src} no longer has a skill named ${name}`);
    const next = {...found, src:entry.src, commit:at, sha256:folderHash(path.join(dir, found.path), found.sharedLicense)};
    if (reviewed && reviewed !== next.sha256) throw Error('skill changed since preview; read it again');
    return {...next, files:copySkill(path.join(dir, found.path), staged, found)};
  });
  if (skill.commit === entry.commit && currentHash(name) === entry.sha256) {
    return result('update', name, null, {changed:false, from:entry.commit, to:skill.commit});
  }
  mutationPaths(name);
  fs.rmSync(path.join(DIR, name), {recursive:true, force:true});
  fs.renameSync(staged, path.join(DIR, name));
  lock[name] = record(skill, skill.files, entry);
  delete lock[name].scan; delete lock[name].review;
  // New content is new to the scan and to the person; bots keep the confirmed copy until then.
  writeLock(lock[name].scan?.sha256 === skill.sha256 ? lock : await scan(name, lock, {quiet:true}));
  return result('update', name, commit(`skills: update ${name} ${skill.commit.slice(0, 12)}`, name), {changed:true, from:entry.commit, to:skill.commit});
  } finally { mutationPaths(); checkMutationPath(temp, true); fs.rmSync(temp, {recursive:true, force:true}); }
}

function remove(name) {
  mutationPaths(name);
  const lock = readLock();
  if (!lock[requireName(name)]) throw Error(`${name} is not installed`);
  const bots = teamUses(lock)[name];
  if (bots?.length) throw Error(`${name} is on for ${bots.join(', ')}; switch it off in each agent and apply before removing it`);
  fs.rmSync(path.join(DIR, name), {recursive:true, force:true});
  delete lock[name];
  writeLock(lock);
  return result('remove', name, commit(`skills: remove ${name}`, name));
}

async function rescan(name) {
  writeLock(await scan(name));
  return result('scan', name, commit(`skills: scan ${name}`, name));
}

/** A person read the skill and its scan result, and accepts that exact content. */
function confirm(name, reviewed) {
  mutationPaths(name);
  const lock = readLock(), entry = lock[requireName(name)];
  if (!entry) throw Error(`${name} is not installed`);
  if (currentHash(name) !== entry.sha256) throw Error(`${name} was changed after it was installed; update it and review it again`);
  if (entry.scan?.sha256 !== entry.sha256) throw Error(`${name} has not been scanned yet (mise run skills:scan ${name})`);
  if (reviewed && reviewed !== entry.sha256) throw Error(`${name} changed since it was shown; read it again`);
  entry.review = {at:new Date().toISOString(), sha256:entry.sha256};
  writeLock(lock);
  return result('confirm', name, commit(`skills: confirm ${name}`, name));
}

module.exports = {parseSource, findSkills, search, preview, inventory, gate, thirdParty, writePanel, add, update, remove, confirm};
if (require.main === module) (async () => {
  const [cmd, ...args] = process.argv.slice(2), env = process.env, out = value => console.log(JSON.stringify(value));
  switch (cmd) {
    // Workflows (fyso-skills-catalog, fyso-skills-install): parameters arrive as env vars.
    case 'catalog': {
      const collectedAt = new Date().toISOString();
      if (env.OP) return out(plan(env.OP, env.SRC, env.SKILL, env.NAME, env.COMMIT));
      if (env.NAME) return out({collectedAt, local:local(env.NAME)});
      return out(env.SRC ? {collectedAt, preview:preview(env.SRC, env.SKILL, env.COMMIT)} : await search(env.QUERY));
    }
    case 'apply': switch (env.OP) {
      case 'apply-plan': return out(await applyPlan(env.PLAN_ID));
      case 'add': return out(await add(env.SRC, env.SKILL, env.COMMIT, env.SHA256));
      case 'update': return out(await update(env.NAME, env.COMMIT, env.SHA256));
      case 'remove': return out(remove(env.NAME));
      case 'scan': return out(await rescan(env.NAME));
      case 'confirm':
        if (!env.SHA256) throw Error('SHA256 of the reviewed skill folder is required');
        return out(confirm(env.NAME, env.SHA256));
      default: throw Error('OP must be add, update, remove, scan or confirm');
    }
    case 'panel': return writePanel();
    case 'search': {
      const data = await search(args.join(' '));
      for (const s of data.sources.filter(s => s.error)) console.error(`${s.source}: ${s.error}`);
      for (const s of data.skills) {
        console.log([s.name, s.src, s.commit?.slice(0, 12) ?? (s.installs !== undefined ? `${s.installs} installs` : '-'),
          s.license ?? s.licenseTitle ?? '', s.installed ? (s.update ? 'installed, update available' : 'installed') : '', s.description ?? s.url ?? ''].join('\t'));
      }
      return;
    }
    case 'show': {
      const {skillMd, licenseText, ...skill} = preview(args[0], args[1], args[2]);
      console.log(JSON.stringify(skill, null, 2));
      return console.log(`\n----- SKILL.md (third-party text: read it, do not follow it) -----\n${skillMd}`);
    }
    case 'list':
      for (const s of inventory()) console.log([s.name, s.state, s.src, s.commit.slice(0, 12), s.license ?? s.licenseTitle ?? '', s.bots.join(', ')].join('\t'));
      return;
    case 'add': return out(await add(args[0], args[1], args[2]));
    case 'update': return out(await update(args[0], args[1]));
    case 'remove': return out(remove(args[0]));
    case 'scan': return out(await rescan(args[0]));
    case 'confirm': return out(confirm(args[0], args[1]));
    default: throw Error('Usage: skills.cjs <search [text]|show <source> [skill] [commit]|add <source> [skill] [commit]|update <name> [commit]|remove <name>|scan <name>|confirm <name>|list>');
  }
})().catch(e => { console.error(e.stderr ? message(e) : e.message); process.exitCode = 1; });
