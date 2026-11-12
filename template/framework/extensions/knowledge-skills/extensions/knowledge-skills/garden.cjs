#!/usr/bin/env node
// Wiki gardener glue (ext-knowledge-skills-garden). Finds what can be found without AI
// (broken links, pages nobody touched in a long time, pages nothing links to), gives an
// agent a private copy to look for contradictions, and publishes one report page.
// It never changes an existing page.
//   garden.cjs check     print the findings as JSON (no AI, writes nothing)
//   garden.cjs prepare   $WORK/findings.json and a read-only copy in $WORK/wiki
//   garden.cjs publish   one new report page in project/wiki, then remove $WORK
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const REPORTS = {es: 'Mantenimiento', en: 'Maintenance'};
const OWN = new Set(Object.values(REPORTS));
const LIMIT = 200, MAX_COPY_BYTES = 4 * 1024 * 1024, MAX_COPY_FILES = 500, MAX_PROPOSALS = 200 * 1024;
const posix = file => file.split(path.sep).join('/');

function pages(wiki) {
  const found = [];
  function visit(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.name.startsWith('.') || (!prefix && OWN.has(entry.name))) continue;
      const relative = path.join(prefix, entry.name);
      if (entry.isDirectory()) visit(path.join(dir, entry.name), relative);
      else if (entry.isFile() && entry.name.endsWith('.md')) found.push(posix(relative));
    }
  }
  visit(wiki);
  return found.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}

// Clean tracked pages use commit time; modified and untracked pages use file time.
function changedAt(root, wiki, files) {
  const times = new Map();
  try {
    const log = execFileSync('git', ['-C', root, 'log', '--format=@%ct', '--name-only', '-z', '--', path.relative(root, wiki) || '.'],
      {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024});
    const prefix = posix(path.relative(root, wiki));
    let at = 0;
    for (const token of log.split(/[\0\n]/)) {
      if (token.startsWith('@')) at = Number(token.slice(1));
      else if (token && at) {
        const rel = prefix && token.startsWith(prefix + '/') ? token.slice(prefix.length + 1) : token;
        if (!times.has(rel)) times.set(rel, at);
      }
    }
  } catch {}
  try {
    const status = execFileSync('git', ['-C', root, 'status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--', path.relative(root, wiki) || '.'],
      {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024});
    const prefix = posix(path.relative(root, wiki)) + '/';
    for (const entry of status.split('\0')) {
      const name = entry.slice(3);
      if (name.startsWith(prefix)) times.delete(name.slice(prefix.length));
    }
  } catch {}
  fillMissingTimes(times, wiki, files);
  return times;
}

function fillMissingTimes(times, wiki, files) {
  for (const file of files) if (!times.has(file)) times.set(file, Math.floor(fs.statSync(path.join(wiki, file)).mtimeMs / 1000));
}

function links(text) {
  // Code is not prose: links inside fences and inline code are examples.
  const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const found = [];
  for (const match of prose.matchAll(/\[\[([^[\]\n]+)\]\]/g)) {
    const target = match[1].split('|')[0].split('#')[0].split('@')[0].trim();
    if (target && !/^[a-z][a-z0-9+.-]*:/i.test(target)) found.push({kind: 'wiki', target, text: match[0]});
  }
  for (const match of prose.matchAll(/(?<!!)\[[^[\]\n]*\]\(([^()\s]+)(?:\s+"[^"\n]*")?\)/g)) {
    const target = match[1].split('#')[0];
    if (target && !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith('//')) found.push({kind: 'path', target, text: match[0]});
  }
  return found;
}

function resolvedLink(link, file) {
  let target;
  try { target = decodeURIComponent(link.target); } catch { target = link.target; }
  return posix(path.normalize(link.kind === 'wiki' || target.startsWith('/') ? target.replace(/^\/+/, '') : path.join(path.dirname(file), target)));
}

function scan(root, {staleDays = 180, now = Date.now()} = {}) {
  const wiki = path.join(root, 'project', 'wiki');
  const files = pages(wiki), names = new Set(files), times = changedAt(root, wiki, files);
  const exists = rel => names.has(rel) || names.has(`${rel}.md`) || fs.existsSync(path.join(wiki, rel));
  const broken = [], linked = new Set(), generated = new Set();
  for (const file of files) {
    const text = fs.readFileSync(path.join(wiki, file), 'utf8');
    // Pages a workflow writes (digests, reports) announce it in a first-line comment:
    // nobody maintains them, so they are neither old nor unlinked.
    if (/^<!--[^\n]*generated[^\n]*-->/.test(text)) generated.add(file);
    for (const link of links(text)) {
      const rel = resolvedLink(link, file);
      if (rel.startsWith('..') || !exists(rel)) broken.push({page: file, link: link.text});
      else linked.add(names.has(rel) ? rel : `${rel}.md`);
    }
  }
  const stale = files.map(file => ({page: file, days: Math.floor((now / 1000 - times.get(file)) / 86400)}))
    .filter(entry => entry.days >= staleDays && !generated.has(entry.page)).sort((a, b) => b.days - a.days);
  const orphans = files.filter(file => file !== 'index.md' && !linked.has(file) && !generated.has(file));
  const cut = list => list.slice(0, LIMIT);
  return {pages: files.length, staleDays, broken: cut(broken), stale: cut(stale), orphans: cut(orphans),
    truncated: broken.length > LIMIT || stale.length > LIMIT || orphans.length > LIMIT};
}

function context(env = process.env) {
  if (!env.FYSO_ROOT || !env.FYSO_DATA) throw new Error('missing project environment');
  const root = fs.realpathSync(env.FYSO_ROOT);
  const days = Number(env.STALE_DAYS || 180);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('STALE_DAYS must be a whole number of days');
  const lang = env.LANG_UI === 'en' ? 'en' : 'es';
  // Built from the run id, never from a parameter: a caller cannot choose the directory.
  const run = env.DAG_RUN_ID || '';
  const work = /^[A-Za-z0-9_-]{1,80}$/.test(run) ? path.join(env.FYSO_DATA, 'ext', 'knowledge-skills', 'garden', run) : null;
  return {root, wiki: path.join(root, 'project', 'wiki'), days, lang, work};
}

function prepare(env = process.env) {
  const ctx = context(env);
  if (!ctx.work) throw new Error('prepare runs inside the workflow (no run id)');
  fs.rmSync(ctx.work, {recursive: true, force: true});
  fs.mkdirSync(path.join(ctx.work, 'wiki'), {recursive: true});
  const findings = scan(ctx.root, {staleDays: ctx.days});
  let bytes = 0, copied = 0;
  for (const file of pages(ctx.wiki)) {
    const size = fs.statSync(path.join(ctx.wiki, file)).size;
    if (copied >= MAX_COPY_FILES || bytes + size > MAX_COPY_BYTES) { findings.partialCopy = true; break; }
    const target = path.join(ctx.work, 'wiki', file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(ctx.wiki, file), target);
    bytes += size; copied++;
  }
  fs.writeFileSync(path.join(ctx.work, 'findings.json'), JSON.stringify(findings, null, 2));
  return {pages: findings.pages, copied};
}

const TEXT = {
  es: {title: 'Mantenimiento de la base de conocimiento', intro: (n, d) => `Revisión automática de ${n} páginas (${d}). Nada fue modificado: son propuestas para revisar.`,
    broken: 'Enlaces rotos', stale: days => `Páginas sin cambios hace más de ${days} días`, orphans: 'Páginas a las que nada enlaza',
    days: 'días', proposals: 'Propuestas del asistente', partial: 'La base es grande: el asistente leyó solo una parte.', more: 'La lista está recortada.',
    untrusted: 'Texto generado por IA a partir de las páginas. Verifícalo antes de aplicar cambios.'},
  en: {title: 'Knowledge base maintenance', intro: (n, d) => `Automatic review of ${n} pages (${d}). Nothing was changed: these are proposals to review.`,
    broken: 'Broken links', stale: days => `Pages unchanged for more than ${days} days`, orphans: 'Pages nothing links to',
    days: 'days', proposals: 'Assistant proposals', partial: 'The base is large: the assistant read only part of it.', more: 'The list is cut short.',
    untrusted: 'AI-generated text based on the pages. Verify it before applying changes.'},
};
const pageLink = file => `[[${file.replace(/\.md$/, '')}]]`;

function report(findings, proposals, lang, date) {
  const t = TEXT[lang], out = [`# ${t.title} ${date}`, '', t.intro(findings.pages, date), ''];
  if (findings.broken.length) out.push(`## ${t.broken}`, '', ...findings.broken.map(b => `- ${pageLink(b.page)}: \`${b.link.replaceAll('`', "'")}\``), '');
  if (findings.stale.length) out.push(`## ${t.stale(findings.staleDays)}`, '', ...findings.stale.map(s => `- ${pageLink(s.page)} (${s.days} ${t.days})`), '');
  if (findings.orphans.length) out.push(`## ${t.orphans}`, '', ...findings.orphans.map(o => `- ${pageLink(o)}`), '');
  if (findings.truncated) out.push(t.more, '');
  if (proposals) out.push(`## ${t.proposals}`, '', `> ${t.untrusted}`, '', proposals.trim(), '');
  if (findings.partialCopy) out.push(t.partial, '');
  return out.join('\n');
}

function writeReport(ctx, findings, proposals, now) {
  const date = now.toISOString().slice(0, 10), folder = path.join(ctx.wiki, REPORTS[ctx.lang]);
  fs.mkdirSync(folder, {recursive: true});
  for (let n = 1; n <= 50; n++) {
    const name = n === 1 ? `${date}.md` : `${date} (${n}).md`;
    try {
      // wx: an existing page is never replaced.
      fs.writeFileSync(path.join(folder, name), report(findings, proposals, ctx.lang, date), {flag: 'wx'});
      return `${REPORTS[ctx.lang]}/${name.slice(0, -3)}`;
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  throw new Error('could not find a free report page name; work is retained');
}

function publish(env = process.env, now = new Date()) {
  const ctx = context(env);
  if (!ctx.work) throw new Error('publish runs inside the workflow (no run id)');
  const findings = JSON.parse(fs.readFileSync(path.join(ctx.work, 'findings.json'), 'utf8'));
  let proposals = '';
  try {
    const file = path.join(ctx.work, 'proposals.md');
    if (fs.lstatSync(file).isFile()) proposals = fs.readFileSync(file, 'utf8').slice(0, MAX_PROPOSALS);
  } catch {}
  if (/^No proposals\.?\s*$/i.test(proposals.trim())) proposals = '';
  const result = {pages: findings.pages, broken: findings.broken.length, stale: findings.stale.length, orphans: findings.orphans.length, proposals: !!proposals.trim(), report: null};
  if (result.broken || result.stale || result.orphans || result.proposals) {
    result.report = writeReport(ctx, findings, proposals, now);
  }
  fs.rmSync(ctx.work, {recursive: true, force: true});
  return result;
}

module.exports = {scan, links, report, prepare, publish};
if (require.main === module) {
  try {
    const action = process.argv[2];
    if (action === 'check') { const ctx = context(); console.log(JSON.stringify(scan(ctx.root, {staleDays: ctx.days}), null, 2)); }
    else if (action === 'prepare') console.log(JSON.stringify(prepare()));
    else if (action === 'publish') console.log(JSON.stringify(publish()));
    else throw new Error('Usage: garden.cjs <check|prepare|publish>');
  } catch (error) { console.error(`error: ${error.message}`); process.exitCode = 1; }
}
