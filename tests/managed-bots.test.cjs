const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');
const managed = require('../template/framework/scripts/managed-bots.cjs');
const {guardTarget} = require('../template/framework/scripts/bot-architect.cjs');

const SCRIPT = path.join(__dirname, '../template/framework/scripts/managed-bots.cjs');
const team = soul => `version: 1
teams:
  - name: Ventas
bots:
  - name: Vendedor
    team: Ventas
    model: claude/sonnet
    soul:
      file: \${FYSO_ROOT}/project/bots/teams/ventas/souls/vendedor.md
  - name: Propio
    model: claude/sonnet
    soul: ${soul}
`;

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fyso-managed-'));
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'});
  git('init', '-q'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 'T');
  fs.mkdirSync(path.join(root, 'project/bots/teams/ventas/souls'), {recursive: true});
  fs.writeFileSync(path.join(root, 'project/bots/teams/ventas/souls/vendedor.md'), 'Vende.\n');
  fs.writeFileSync(path.join(root, 'project/bots/team.yaml'), team('Mío'));
  git('add', '-A'); git('commit', '-q', '-m', 'init');
  return {root, git, done: () => fs.rmSync(root, {recursive: true, force: true})};
}

test('nothing is managed without a record', () => {
  const p = project();
  try {
    assert.doesNotThrow(() => managed.checkTeam(p.root, 'bots: []'));
    assert.doesNotThrow(() => managed.guardBot(p.root, 'Vendedor'));
  } finally { p.done(); }
});

test('a recorded bot only accepts the recorded declaration', () => {
  const p = project();
  try {
    const commit = managed.record({root: p.root, owner: 'biz', teamYaml: team('Mío'), departments: ['Ventas'], bots: ['Vendedor']});
    assert.match(commit, /^[a-f0-9]{40}$/);
    assert.equal(p.git('status', '--porcelain').trim(), '');
    // Own bots change freely; the managed one is untouched.
    assert.doesNotThrow(() => managed.checkTeam(p.root, team('Otro alma')));
    // Changing, removing or renaming the managed bot is refused.
    assert.throws(() => managed.checkTeam(p.root, team('Mío').replace('claude/sonnet', 'claude/opus')), /managed by biz/);
    assert.throws(() => managed.checkTeam(p.root, 'version: 1\nbots:\n  - name: Propio\n    model: claude/sonnet\n'), /managed by biz/);
    assert.throws(() => managed.checkTeam(p.root, team('Mío') + '  - name: Nuevo\n    was: Vendedor\n    model: claude/sonnet\n'), /managed by biz/);
    // Editing the managed soul file is a change too.
    fs.writeFileSync(path.join(p.root, 'project/bots/teams/ventas/souls/vendedor.md'), 'Otra cosa.\n');
    assert.throws(() => managed.checkTeam(p.root, team('Mío')), /managed by biz/);
  } finally { p.done(); }
});

test('Bot Architect refuses update and delete of a managed bot, not of an own bot', () => {
  const p = project(), previous = process.env.FYSO_ROOT;
  try {
    managed.record({root: p.root, owner: 'biz', teamYaml: team('Mío'), departments: ['Ventas'], bots: ['Vendedor']});
    process.env.FYSO_ROOT = p.root;
    assert.throws(() => guardTarget({name: 'vendedor', activity: 'idle'}, 'update', {model: 'claude/opus'}), /managed by biz/);
    assert.throws(() => guardTarget({name: 'Vendedor', activity: 'idle'}, 'delete'), /managed by biz/);
    assert.doesNotThrow(() => guardTarget({name: 'Propio', activity: 'idle'}, 'update', {soul: 'x'}));
    assert.doesNotThrow(() => guardTarget({name: 'Propio', activity: 'idle'}, 'delete'));
    assert.throws(() => managed.guardDepartment(p.root, 'ventas'), /managed by biz/);
    assert.doesNotThrow(() => managed.guardDepartment(p.root, 'Marketing'));
  } finally {
    if (previous === undefined) delete process.env.FYSO_ROOT; else process.env.FYSO_ROOT = previous;
    p.done();
  }
});

test('the owner moves its bots by recording first; an empty record removes the owner', () => {
  const p = project();
  try {
    managed.record({root: p.root, owner: 'biz', teamYaml: team('Mío'), departments: ['Ventas'], bots: ['Vendedor']});
    const next = team('Mío').replace('claude/sonnet', 'claude/opus');
    managed.record({root: p.root, owner: 'biz', teamYaml: next, departments: ['Ventas'], bots: ['Vendedor']});
    assert.doesNotThrow(() => managed.checkTeam(p.root, next));
    assert.equal(managed.record({root: p.root, owner: 'biz', teamYaml: next, departments: ['Ventas'], bots: ['Vendedor']}), null);
    managed.record({root: p.root, owner: 'biz', teamYaml: next});
    assert.deepEqual(managed.read(p.root).owners, {});
    assert.throws(() => managed.record({root: p.root, owner: 'biz', teamYaml: next, bots: ['Ausente']}), /not declared/);
    assert.throws(() => managed.record({root: p.root, owner: '../x', teamYaml: next}), /invalid owner/);
  } finally { p.done(); }
});

test('the record is portable: digests do not depend on the project folder', () => {
  const a = project(), b = project();
  try {
    managed.record({root: a.root, owner: 'biz', teamYaml: team('Mío'), departments: ['Ventas'], bots: ['Vendedor']});
    fs.copyFileSync(path.join(a.root, managed.FILE), path.join(b.root, managed.FILE));
    assert.doesNotThrow(() => managed.checkTeam(b.root, team('Mío')));
  } finally { a.done(); b.done(); }
});

test('the panel check CLI fails with the reason', () => {
  const p = project();
  try {
    managed.record({root: p.root, owner: 'biz', teamYaml: team('Mío'), departments: ['Ventas'], bots: ['Vendedor']});
    const file = path.join(p.root, 'proposed.yaml');
    fs.writeFileSync(file, team('Mío').replace('claude/sonnet', 'claude/opus'));
    const run = spawnSync(process.execPath, [SCRIPT, 'check', file], {env: {...process.env, FYSO_ROOT: p.root}, encoding: 'utf8'});
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Vendedor is managed by biz/);
    fs.writeFileSync(file, team('Nuevo'));
    assert.equal(spawnSync(process.execPath, [SCRIPT, 'check', file], {env: {...process.env, FYSO_ROOT: p.root}}).status, 0);
  } finally { p.done(); }
});
