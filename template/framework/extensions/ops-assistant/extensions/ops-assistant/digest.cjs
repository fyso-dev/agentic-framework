#!/usr/bin/env node
// Weekly digest and monthly spend caps (ext-ops-assistant-*). Read-only glue over the
// framework's observability export (.data/panel/observability.json, refreshed every two
// minutes from native OpenMausBot and Dagu records). No second collector, no AI.
//   digest.cjs digest   write the digest page in project/wiki, print RESULT
//   digest.cjs spend    compare each bot's month-to-date cost with its cap, print RESULT
//                       (exit 2 the first time a bot goes over its cap in a month)
const fs = require('node:fs');
const path = require('node:path');

const MARK = '<!-- ext-ops-assistant digest: generated, do not edit -->';
const FOLDER = {es: 'Resumen semanal', en: 'Weekly digest'};
const FAILED = new Set(['failed', 'aborted', 'rejected', 'partially_succeeded']);
const num = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const sum = values => values.some(v => num(v) !== null) ? values.reduce((n, v) => n + (num(v) ?? 0), 0) : null;

function context(env = process.env) {
  if (!env.FYSO_ROOT || !env.FYSO_DATA) throw new Error('missing project environment');
  return {root: env.FYSO_ROOT, data: env.FYSO_DATA, lang: env.LANG_UI === 'en' ? 'en' : 'es'};
}
function readExport(ctx) {
  const file = path.join(ctx.data, 'panel', 'observability.json');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error('no observability data yet (.data/panel/observability.json): start the project and wait for fyso-observability'); }
}
function settings(ctx) {
  try { return JSON.parse(fs.readFileSync(path.join(ctx.root, 'project', 'observability.json'), 'utf8')) || {}; }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('project/observability.json is not valid JSON'); }
}

// Month-to-date cost per bot against `botMonthlyUsd` of project/observability.json:
//   "botMonthlyUsd": {"Soporte": 20, "*": 50}, "botMonthlyUsdBasis": "api" | "all"
// "api" counts API-reported and estimated API cost; "all" adds the subscription
// equivalent and unclassified cost. Unknown amounts are never counted as zero spend:
// they are reported as missing.
function spend(data, config, warnAt = 0.8) {
  const caps = config.botMonthlyUsd;
  if (config.botMonthlyUsdBasis !== undefined && !['api', 'all'].includes(config.botMonthlyUsdBasis))
    throw new Error('botMonthlyUsdBasis must be api or all');
  const basis = config.botMonthlyUsdBasis === 'all' ? 'all' : 'api';
  if (caps !== undefined && (typeof caps !== 'object' || caps === null || Array.isArray(caps) || Object.values(caps).some(v => num(v) === null)))
    throw new Error('project/observability.json: botMonthlyUsd must map bot names (or "*") to amounts in USD');
  const bots = new Map();
  for (const group of data.usage?.groups || []) {
    const row = bots.get(group.bot) || {bot: group.bot, parts: [], missingCost: 0, turns: 0};
    row.parts.push(group.apiReportedUsd, group.estimatedApiUsd, ...(basis === 'all' ? [group.subscriptionEquivalentUsd, group.unclassifiedUsd] : []));
    row.missingCost += group.missingCost || 0; row.turns += group.turns || 0;
    bots.set(group.bot, row);
  }
  const rows = [...bots.values()].map(row => {
    const spentUsd = sum(row.parts), capUsd = caps ? num(caps[row.bot]) ?? num(caps['*']) : null;
    const state = capUsd === null ? 'none' : spentUsd !== null && spentUsd >= capUsd ? 'exceeded' : spentUsd !== null && spentUsd >= capUsd * warnAt ? 'warn' : spentUsd === null || row.missingCost ? 'unknown' : 'ok';
    return {bot: row.bot, spentUsd, capUsd, percent: capUsd && spentUsd !== null ? Math.round((spentUsd / capUsd) * 100) : null, state, turns: row.turns, missingCost: row.missingCost};
  }).sort((a, b) => (b.spentUsd ?? 0) - (a.spentUsd ?? 0));
  return {month: (data.from || '').slice(0, 7), basis, configured: !!caps && Object.keys(caps).length > 0, bots: rows,
    exceeded: rows.filter(r => r.state === 'exceeded').map(r => r.bot), warn: rows.filter(r => r.state === 'warn').map(r => r.bot)};
}

// Alert once per bot and month, like OpenMausBot's own spend alert marks.
function spendCheck(env = process.env) {
  const ctx = context(env), data = readExport(ctx);
  const collected = Date.parse(data.collectedAt), now = Date.now();
  if (!Number.isFinite(collected) || now - collected > 3600000 || collected > now + 60000 ||
      (data.from || '').slice(0, 7) !== new Date(now).toISOString().slice(0, 7))
    throw new Error('observability export is stale or belongs to another month; refresh fyso-observability');
  if (data.sources?.ledger !== 'ok') throw new Error('observability ledger is unavailable; spend is unverified');
  const state = spend(data, settings(ctx));
  const file = path.join(ctx.data, 'ext', 'ops-assistant', 'spend-alerts.json');
  let marks = {};
  try { marks = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (marks.month !== state.month) marks = {month: state.month, exceeded: []};
  const fresh = state.exceeded.filter(bot => !marks.exceeded.includes(bot));
  if (fresh.length) {
    marks.exceeded.push(...fresh);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, JSON.stringify(marks));
  }
  return {...state, newlyExceeded: fresh};
}

const TEXT = {
  es: {title: 'Resumen semanal', period: (a, b) => `Del ${a} al ${b}.`, collected: at => `Datos recogidos: ${at}.`, stale: 'Los datos tienen más de una hora: el proyecto estuvo detenido o la recolección falló.',
    short: 'En pocas palabras', convs: n => `${n} conversaciones con bots`, runs: (n, f) => `${n} ejecuciones de workflows, ${f} con fallas`, weekCost: 'Costo conocido de las conversaciones de la semana',
    bots: 'Qué hicieron los bots', bot: 'Bot', conversations: 'Conversaciones', tools: 'Usos de herramientas', errors: 'Errores', none: 'Sin actividad registrada.',
    workflows: 'Workflows', workflow: 'Workflow', total: 'Ejecuciones', ok: 'Correctas', failed: 'Con fallas', failures: 'Qué falló', when: 'cuándo',
    month: m => `Costo del mes (${m}, hasta la fecha)`, api: 'API informado', est: 'API estimado', sub: 'Equivalente de suscripción', unknown: 'sin dato', turns: 'Turnos',
    caps: 'Topes de gasto', cap: 'Tope', spent: 'Gastado', state: {ok: 'dentro del tope', warn: 'cerca del tope', exceeded: 'superó el tope', none: 'sin tope', unknown: 'datos incompletos'}, noCaps: 'No hay topes configurados (`botMonthlyUsd` en `project/observability.json`).',
    notes: 'Notas', missing: n => `${n} turnos sin costo informado: los totales pueden ser menores que el gasto real.`, truncated: 'Hay más actividad que la que guarda el resumen: las cifras de la semana pueden estar incompletas.',
    semantics: 'Los importes son los que informan las herramientas, no una factura. El equivalente de suscripción no es dinero cobrado: es lo que habría costado por API.', alerts: 'Avisos activos', source: s => `Fuente no disponible: ${s}.`},
  en: {title: 'Weekly digest', period: (a, b) => `From ${a} to ${b}.`, collected: at => `Data collected: ${at}.`, stale: 'The data is more than an hour old: the project was stopped or collection failed.',
    short: 'In short', convs: n => `${n} conversations with bots`, runs: (n, f) => `${n} workflow runs, ${f} with failures`, weekCost: 'Known cost of this week\'s conversations',
    bots: 'What the bots did', bot: 'Bot', conversations: 'Conversations', tools: 'Tool uses', errors: 'Errors', none: 'No recorded activity.',
    workflows: 'Workflows', workflow: 'Workflow', total: 'Runs', ok: 'Succeeded', failed: 'With failures', failures: 'What failed', when: 'when',
    month: m => `Cost this month (${m}, to date)`, api: 'API reported', est: 'API estimated', sub: 'Subscription equivalent', unknown: 'unknown', turns: 'Turns',
    caps: 'Spend caps', cap: 'Cap', spent: 'Spent', state: {ok: 'within the cap', warn: 'close to the cap', exceeded: 'over the cap', none: 'no cap', unknown: 'incomplete data'}, noCaps: 'No caps are configured (`botMonthlyUsd` in `project/observability.json`).',
    notes: 'Notes', missing: n => `${n} turns reported no cost: totals may be lower than the real spend.`, truncated: 'There is more activity than the summary keeps: this week\'s figures may be incomplete.',
    semantics: 'Amounts are what the tools report, not an invoice. The subscription equivalent is not money charged: it is what the same use would have cost through the API.', alerts: 'Active alerts', source: s => `Source unavailable: ${s}.`},
};

function digest(data, config, {days = 7, lang = 'es', now = new Date()} = {}) {
  const t = TEXT[lang], usd = v => num(v) === null ? t.unknown : `$${v.toFixed(2)}`;
  const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ');
  const since = now.getTime() - days * 86400000, inWindow = at => Number.isFinite(Date.parse(at)) && Date.parse(at) >= since && Date.parse(at) <= now.getTime();
  const day = d => new Date(d).toISOString().slice(0, 10);
  const traces = (data.traces || []).filter(tr => inWindow(tr.startedAt)), runs = (data.runs || []).filter(r => inWindow(r.startedAt));
  const failed = runs.filter(r => FAILED.has(r.statusLabel));
  const byBot = new Map();
  for (const trace of traces) for (const bot of trace.bots || []) {
    const row = byBot.get(bot.name) || {conversations: 0, tools: 0, errors: 0};
    row.conversations++; row.tools += trace.tools || 0; row.errors += trace.errors || 0;
    byBot.set(bot.name, row);
  }
  const byDag = new Map();
  for (const run of runs) {
    const row = byDag.get(run.dag) || {total: 0, failed: 0};
    row.total++; if (FAILED.has(run.statusLabel)) row.failed++;
    byDag.set(run.dag, row);
  }
  const caps = spend(data, config), monthly = new Map();
  for (const group of data.usage?.groups || []) {
    const row = monthly.get(group.bot) || {turns: 0, api: [], est: [], sub: []};
    row.turns += group.turns || 0; row.api.push(group.apiReportedUsd); row.est.push(group.estimatedApiUsd); row.sub.push(group.subscriptionEquivalentUsd);
    monthly.set(group.bot, row);
  }
  const table = (head, rows) => rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(cell).join(' | ')} |`), ''] : [t.none, ''];
  const out = [MARK, `# ${t.title} ${day(now)}`, '', `${t.period(day(since), day(now))} ${t.collected(data.collectedAt || t.unknown)}`, ''];
  if (!Number.isFinite(Date.parse(data.collectedAt)) || now.getTime() - Date.parse(data.collectedAt) > 3600000) out.push(`> ${t.stale}`, '');
  out.push(`## ${t.short}`, '', `- ${t.convs(traces.length)}`, `- ${t.runs(runs.length, failed.length)}`, '');
  out.push(`## ${t.bots}`, '', ...table([t.bot, t.conversations, t.tools, t.errors],
    [...byBot].sort((a, b) => b[1].conversations - a[1].conversations).map(([name, r]) => [name, r.conversations, r.tools, r.errors])));
  out.push(`## ${t.workflows}`, '', ...table([t.workflow, t.total, t.ok, t.failed],
    [...byDag].sort((a, b) => b[1].total - a[1].total).map(([name, r]) => [name, r.total, r.total - r.failed, r.failed])));
  if (failed.length) out.push(`## ${t.failures}`, '', ...failed.slice(0, 50).map(r => `- \`${cell(r.dag)}\` · ${cell(r.statusLabel)} · ${cell(r.startedAt)} · ${cell(r.id)}`), '');
  out.push(`## ${t.month(caps.month)}`, '', ...table([t.bot, t.turns, t.api, t.est, t.sub],
    [...monthly].map(([name, r]) => [name, r.turns, usd(sum(r.api)), usd(sum(r.est)), usd(sum(r.sub))])));
  out.push(`## ${t.caps}`, '');
  if (caps.configured) out.push(...table([t.bot, t.spent, t.cap, '%', ''], caps.bots.map(r => [r.bot, usd(r.spentUsd), usd(r.capUsd), r.percent ?? '', t.state[r.state]])));
  else out.push(t.noCaps, '');
  const notes = [t.semantics];
  const missing = data.usage?.totals?.missingCost || 0;
  if (missing) notes.push(t.missing(missing));
  if (data.coverage?.tracesTruncated || data.coverage?.runsTruncated || Date.parse(data.from) > since) notes.push(t.truncated);
  for (const [name, state] of Object.entries(data.sources || {})) if (state === 'unavailable') notes.push(t.source(name));
  if ((data.alerts || []).length) notes.push(`${t.alerts}: ${data.alerts.map(a => a.kind).join(', ')}.`);
  out.push(`## ${t.notes}`, '', ...notes.map(n => `- ${n}`), '');
  return {text: out.join('\n'), summary: {from: day(since), to: day(now), conversations: traces.length, runs: runs.length, failed: failed.length,
    bots: byBot.size, capsExceeded: caps.exceeded, capsWarn: caps.warn}};
}

function writeDigest(env = process.env, now = new Date()) {
  const ctx = context(env), days = Number(env.DAYS || 7);
  if (!Number.isInteger(days) || days < 1 || days > 31) throw new Error('DAYS must be a whole number from 1 to 31');
  const {text, summary} = digest(readExport(ctx), settings(ctx), {days, lang: ctx.lang, now});
  const folder = path.join(ctx.root, 'project', 'wiki', FOLDER[ctx.lang]);
  fs.mkdirSync(folder, {recursive: true});
  for (let n = 1; n <= 50; n++) {
    const name = n === 1 ? `${summary.to}.md` : `${summary.to} (${n}).md`, file = path.join(folder, name);
    let current = null;
    try { current = fs.readFileSync(file, 'utf8'); } catch {}
    // Replace only a page this script wrote; a page a person made or edited is kept.
    if (current !== null && !current.startsWith(MARK)) continue;
    fs.writeFileSync(file, text);
    return {...summary, page: `${FOLDER[ctx.lang]}/${name.slice(0, -3)}`};
  }
  throw new Error('could not find a free page name');
}

module.exports = {digest, spend, spendCheck, writeDigest, MARK};
if (require.main === module) {
  try {
    const action = process.argv[2];
    if (action === 'digest') console.log(JSON.stringify(writeDigest()));
    else if (action === 'spend') {
      const result = spendCheck();
      console.log(JSON.stringify(result));
      if (result.newlyExceeded.length) { console.error(`over the monthly cap: ${result.newlyExceeded.join(', ')}`); process.exitCode = 2; }
    } else throw new Error('Usage: digest.cjs <digest|spend>');
  } catch (error) { console.error(`error: ${error.message}`); process.exitCode = 1; }
}
