// Extension marketplace (D31): catalogs are git repos with a marketplace.yaml at the
// root, listed in project/marketplaces.yaml. Versions are the git tags of each
// extension repo, read live; the catalog never stores them.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {read, glob, validId} = require('./extensions.cjs');
const {gitEnv} = require('./github-auth.cjs');

const OFFICIAL = 'gh:fyso-dev/fyso-extensions';
const gitUrl = src => src.replace(/^gh:([^/]+\/[^/@]+?)(\.git)?$/, 'https://github.com/$1.git');
const git = (args, opts = {}) => execFileSync('git', args, {encoding:'utf8', stdio:['ignore','pipe','pipe'], timeout:60_000,
  env:gitEnv(), ...opts});
const message = e => String(e.stderr || e.message || e).trim().split('\n').pop();
function failure(e,src) {
  if (/^(gh:|https:\/\/github\.com\/|git@github\.com:)/.test(src) && /could not read (Username|Password)|authentication failed|repository not found|terminal prompts disabled|access denied|permission denied|403/i.test(message(e)))
    return {errorCode:'githubAccess',error:'GitHub repository access is unavailable on this host.'};
  let error=message(e).replace(/(https?:\/\/)[^/@\s]+@/g,'$1<redacted>@');
  if(process.env.FYSO_GITHUB_TOKEN)error=error.split(process.env.FYSO_GITHUB_TOKEN).join('<redacted>');
  return {error};
}

/** `v1.2.0` → [1,2,0]; null for tags that are not versions. */
function version(tag) {
  const m = /^v?(\d+(?:\.\d+)*)(?:-|$)/.exec(tag || '');
  return m ? m[1].split('.').map(Number) : null;
}
/** A release: `v1.2.0`, not a pre-release such as `v1.3.0-beta.1`. */
const stable = tag => /^v?\d+(?:\.\d+)*$/.test(tag || '');
function compare(a, b) {
  const x = version(a), y = version(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  // Same numbers: a pre-release comes before its release (v1.3.0-beta.1 < v1.3.0).
  return Number(stable(a)) - Number(stable(b));
}
/** The newest release. Pre-releases are left out, as Copier does without --prereleases,
 *  so the version the panel offers is the one an install or update gets. */
function latestTag(src) {
  const tags = git(['ls-remote', '--tags', '--refs', gitUrl(src)]).split('\n')
    .map(line => line.split('refs/tags/')[1]).filter(t => t && stable(t));
  return tags.sort(compare).at(-1) ?? null;
}

function sources() {
  const file = 'project/marketplaces.yaml';
  const list = fs.existsSync(file) ? read(file) : [OFFICIAL];
  if (!Array.isArray(list) || list.some(s => typeof s !== 'string')) throw Error(`${file}: expected a list of git sources`);
  return list;
}

/**
 * Shallow-clone one catalog and read its marketplace.yaml.
 * Bare and without hook templates: Dagu steps run confined (D93), and sandbox-runtime
 * always denies writes under a `.git/` folder, which a normal clone needs.
 */
function loadCatalog(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fyso-catalog-'));
  try {
    const repo = path.join(dir, 'catalog.git');
    git(['-c', 'init.templateDir=', 'clone', '--quiet', '--bare', '--depth', '1', gitUrl(source), repo]);
    const file = path.join(dir, 'marketplace.yaml');
    fs.writeFileSync(file, git(['--git-dir', repo, 'show', 'HEAD:marketplace.yaml']));
    const data = read(file) || {};
    const entries = Array.isArray(data.extensions) ? data.extensions : [];
    for (const e of entries) {
      if (!validId(e.id) || typeof e.src !== 'string') throw Error(`marketplace.yaml: invalid entry ${JSON.stringify(e.id)}`);
    }
    return {name: typeof data.name === 'string' ? data.name : source, entries};
  } finally {
    fs.rmSync(dir, {recursive:true, force:true});
  }
}

// Same convention as app.yaml: a string, or a map of languages (es first).
const text = value => typeof value === 'string' ? {text:value} : value && typeof value === 'object'
  ? {text:value.es || value.en || Object.values(value)[0], i18n:value} : {text:''};

function installed() {
  return Object.fromEntries(glob('.copier-answers.ext-*.yml').map(file => {
    const answers = read(file) || {};
    return [file.slice('.copier-answers.ext-'.length, -4), {version:answers._commit || null, src:answers._src_path}];
  }));
}

/** The panel's view: every catalog entry with its latest tag and install state. */
function collect() {
  const local = installed(), seen = new Set(), catalogs = [], extensions = [];
  for (const source of sources()) {
    let catalog;
    try { catalog = loadCatalog(source); } catch (e) { catalogs.push({source, name:source, ...failure(e,source)}); continue; }
    catalogs.push({source, name:catalog.name});
    for (const e of catalog.entries) {
      if (seen.has(e.id)) continue; // the first catalog that lists an id wins
      seen.add(e.id);
      const name = text(e.name || e.id), description = text(e.description);
      let latest = null, error;
      try { latest = latestTag(e.src); } catch (err) { error = failure(err,e.src); }
      const current = local[e.id]?.version ?? null;
      extensions.push({id:e.id, src:e.src, catalog:catalog.name,
        name:name.text, ...(name.i18n && {name_i18n:name.i18n}),
        description:description.text, ...(description.i18n && {description_i18n:description.i18n}),
        tags:Array.isArray(e.tags) ? e.tags.map(String) : [],
        ...(typeof e.homepage === 'string' && {homepage:e.homepage}),
        latest, installed:!!local[e.id], version:current,
        update:!!(local[e.id] && latest && version(current) && compare(latest, current) > 0),
        ...(error || {})});
    }
  }
  return {collectedAt:new Date().toISOString(), catalogs, extensions};
}

/** `id` → `src<TAB>latest tag` from the first catalog that lists it. */
function resolve(id) {
  const errors = [];
  for (const source of sources()) {
    let entries;
    try { entries = loadCatalog(source).entries; } catch (e) { errors.push(`${source}: ${message(e)}`); continue; }
    const entry = entries.find(e => e.id === id);
    if (entry) return [entry.src, latestTag(entry.src) ?? ''];
  }
  throw Error([`${id} is not in any catalog of project/marketplaces.yaml`, ...errors].join('\n'));
}

module.exports = {gitUrl, version, stable, compare, collect, resolve};
if (require.main === module) {
  try {
    const [cmd, arg] = process.argv.slice(2);
    if (cmd === 'json') console.log(JSON.stringify(collect()));
    else if (cmd === 'resolve') console.log(resolve(arg).join('\t'));
    else if (cmd === 'search') {
      const q = (arg || '').toLowerCase(), data = collect();
      for (const c of data.catalogs.filter(c => c.error)) console.error(`${c.source}: ${c.error}`);
      for (const e of data.extensions) {
        const hay = [e.id, e.name, e.description, ...e.tags].join(' ').toLowerCase();
        if (q && !hay.includes(q)) continue;
        const state = !e.installed ? '' : e.update ? `installed ${e.version} → ${e.latest}` : `installed ${e.version ?? ''}`;
        console.log([e.id, e.latest ?? '-', e.description, state].join('\t'));
      }
    } else throw Error('Usage: marketplace.cjs <json|search [text]|resolve <id>>');
  } catch (e) { console.error(e.stderr ? message(e) : e.message); process.exitCode = 1; }
}
