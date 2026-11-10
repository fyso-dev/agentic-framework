// Team apply is additive. Limit explicit deletions to bots removed from the
// project's declaration and bind the preview to the exact runtime IDs.
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { guardTarget } = require('./bot-architect.cjs');

const key = name => name.trim().toLowerCase();
const guardRemoval = bot => guardTarget({ ...bot, chiefOfStaff: bot.chiefOfStaff || bot.defaultBot }, 'delete');

async function runtimeBots() {
  const response = await fetch(`http://127.0.0.1:${process.env.FYSO_OMB_PORT}/api/bots?messages=0`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Native bot list unavailable');
  return (await response.json()).bots;
}

function renameIndices(before, after) {
  const names = new Set((before.bots ?? []).map(bot => key(bot.name)));
  return (after.bots ?? []).flatMap((bot, index) =>
    bot.was && names.has(key(bot.was)) && !names.has(key(bot.name)) ? [index] : []);
}

function removedDeclarations(before, after) {
  const names = new Set((after.bots ?? []).map(bot => key(bot.name)));
  for (const index of renameIndices(before, after)) names.add(key(after.bots[index].was));
  return (before.bots ?? []).filter(bot => !names.has(key(bot.name)));
}

function clearConsumedAliases(file, indices) {
  if (!indices.length) return;
  const yaml = createRequire(fs.realpathSync(execFileSync('which', ['yaml'], { encoding: 'utf8' }).trim()))('yaml');
  const marker = '__FYSO_PATH_ROOT__';
  const document = yaml.parseDocument(fs.readFileSync(file, 'utf8').replaceAll('${FYSO_ROOT}', marker));
  if (document.errors.length) throw new Error('Proposed declaration could not be saved');
  for (const index of indices) document.deleteIn(['bots', index, 'was']);
  fs.writeFileSync(file, document.toString().replaceAll(marker, '${FYSO_ROOT}'));
}

function resolveRemovals(before, after, live, removed = removedDeclarations(before, after)) {
  const declared = before.bots ?? [];
  return removed.map(bot => {
    if (declared.filter(entry => key(entry.name) === key(bot.name)).length !== 1) {
      throw new Error(`Declared bot name is ambiguous: ${bot.name}`);
    }
    guardRemoval({ name: bot.name, chiefOfStaff: bot.chief });
    const matches = live.filter(entry => key(entry.name) === key(bot.name));
    if (matches.length > 1 || (matches.length === 1 && matches[0].name !== bot.name)) {
      throw new Error(`Native bot name does not identify a unique exact match: ${bot.name}`);
    }
    if (matches.length) {
      if (typeof matches[0].id !== 'string' || !matches[0].id) throw new Error('Native bot ID is missing');
      if (bot.team && key(matches[0].section ?? '') !== key(bot.team)) {
        throw new Error(`Native bot is in a different team: ${bot.name}`);
      }
      guardRemoval(matches[0]);
    }
    return { name: bot.name, id: matches[0]?.id ?? null };
  });
}

async function main([operation, currentFile, candidateFile, planFile, removalsFile, declarationFile]) {
  if (operation === 'delete') {
    const removals = JSON.parse(fs.readFileSync(currentFile, 'utf8'));
    for (const { name, id } of removals) {
      const matches = (await runtimeBots()).filter(bot => key(bot.name) === key(name));
      if (!id && matches.length === 0) continue;
      const target = matches.length === 1 ? matches[0] : undefined;
      if (!target || target.id !== id || target.name !== name) throw new Error('Bot identity changed; review a fresh preview');
      guardRemoval(target);
      const response = await fetch(`http://127.0.0.1:${process.env.FYSO_OMB_PORT}/api/bots/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok || (await runtimeBots()).some(bot => bot.id === id)) {
        throw new Error(`OpenMausBot did not remove "${name}"`);
      }
    }
    return;
  }

  const current = fs.readFileSync(currentFile, 'utf8');
  const candidate = fs.readFileSync(candidateFile, 'utf8');
  const before = JSON.parse(current);
  const after = JSON.parse(candidate);
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const removed = removedDeclarations(before, after);
  const removals = removed.length ? resolveRemovals(before, after, await runtimeBots(), removed) : [];
  const removalRevision = removals.length
    ? createHash('sha256').update(JSON.stringify([current, candidate, removals])).digest('hex')
    : '';
  if (operation === 'apply' && removalRevision !== (process.env.REMOVAL_REVISION ?? '')) {
    throw new Error('Bot removals changed or were not reviewed; open a fresh preview');
  }
  if (operation === 'apply') clearConsumedAliases(declarationFile, renameIndices(before, after));
  fs.writeFileSync(removalsFile, JSON.stringify(removals));
  console.log(JSON.stringify({
    ...plan,
    plan: [...plan.plan, ...removals.map(({ name, id }) =>
      id ? `bot ${JSON.stringify(name)}: delete (${id})` : `bot ${JSON.stringify(name)}: remove declaration (already absent)`)],
    deleted: plan.deleted + removals.length,
    removalRevision,
  }));
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { resolveRemovals };
