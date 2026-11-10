const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveRemovals } = require('../template/framework/scripts/panel-bot-removal.cjs');

const team = (...bots) => ({ bots: bots.map(bot => typeof bot === 'string' ? { name: bot } : bot) });
const live = (name, id = name, extra = {}) => ({ name, id, activity: 'idle', ...extra });

test('only removed declarations resolve to exact runtime IDs', () => {
  assert.deepEqual(
    resolveRemovals(team('Keep', 'Remove'), team('Keep'), [live('Keep'), live('Remove', 'id-1'), live('Native only')]),
    [{ name: 'Remove', id: 'id-1' }],
  );
  assert.deepEqual(resolveRemovals(team('Absent'), team(), []), [{ name: 'Absent', id: null }]);
});

test('renames retain identity without shielding a later bot that reuses the old name', () => {
  assert.deepEqual(
    resolveRemovals(team('Old'), team({ name: 'New', was: 'Old' }), [live('Old')]),
    [],
  );
  assert.deepEqual(
    resolveRemovals(team('Old', 'New'), team({ name: 'New', was: 'Old' }), [live('Old'), live('New')]),
    [{ name: 'Old', id: 'Old' }],
  );
});

test('ambiguous, mismatched, protected and active bots fail closed', () => {
  assert.throws(() => resolveRemovals(team('Bot'), team(), [live('Bot'), live('Bot', 'other')]), /unique exact match/);
  assert.throws(() => resolveRemovals(team('Bot'), team(), [live('bot')]), /unique exact match/);
  assert.throws(() => resolveRemovals(team({ name: 'Bot', team: 'One' }), team(), [live('Bot', 'id', { section: 'Two' })]), /different team/);
  assert.throws(() => resolveRemovals(team('Builder'), team(), [live('Builder')]), /cannot be deleted/);
  assert.throws(() => resolveRemovals(team('Bot'), team(), [live('Bot', 'id', { busy: true })]), /active/);
});
