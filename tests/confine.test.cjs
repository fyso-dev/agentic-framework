const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { policy, parseArgs, macosSocketRules } = require('../template/framework/scripts/confine.cjs');

function fixture(fn) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'confine-')));
  try { return fn(home); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

test('a project reads and writes its folder; home, siblings and shared keys are denied', () => fixture(home => {
  const root = path.join(home, 'projects/demo');
  fs.mkdirSync(root, { recursive: true });
  const shared = path.join(home, '.config/mise/age.txt');
  const p = policy({ root, project: 'demo', port: '8400', sharedKeys: [shared], allowRead: [], allowWrite: [] }, { PATH: '/usr/bin' }, home);
  assert.deepEqual(p.denyRead, [home, path.join(home, 'projects'), shared]);
  assert.ok(p.allowRead.includes(root));
  assert.deepEqual(p.allowWrite, [root]);
  assert.equal(p.vars.HOME, path.join(root, '.data/confine/home'));
  assert.equal(p.vars.SOPS_AGE_KEY_FILE, path.join(root, '.data/confine/age.txt'));
  assert.equal(p.vars.FYSO_COMPOSIO_AGE_KEY_FILE, p.vars.SOPS_AGE_KEY_FILE);
}));

test('only engine credential files are shared, not their folders', () => fixture(home => {
  const root = path.join(home, 'demo');
  fs.mkdirSync(path.join(home, '.claude/projects'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/.credentials.json'), '{}');
  fs.writeFileSync(path.join(home, '.claude/history.jsonl'), '');
  const p = policy({ root, sharedKeys: [], allowRead: [], allowWrite: [] }, { PATH: '' }, home);
  const credential = path.join(home, '.claude/.credentials.json');
  assert.ok(p.allowRead.includes(credential) && p.allowWrite.includes(credential));
  assert.ok(!p.allowRead.some(entry => entry === path.join(home, '.claude')));
  assert.equal(p.vars.CLAUDE_CONFIG_DIR, path.join(root, '.data/confine/home/.claude'));
  assert.equal(p.credentials.length, 1);
}));

test('the toolchain in the home folder is readable, unless it lies in a denied folder', () => fixture(home => {
  const root = path.join(home, 'work/demo');
  const tools = path.join(home, '.local/bin');
  const sibling = path.join(home, 'work/other/bin');
  for (const dir of [root, tools, sibling, path.join(home, '.local/share/claude/versions')]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(home, '.local/share/claude/versions/1.0'), '');
  fs.symlinkSync(path.join(home, '.local/share/claude/versions/1.0'), path.join(tools, 'claude'));
  const p = policy({ root, sharedKeys: [], allowRead: [], allowWrite: [] }, { PATH: [tools, sibling, '/usr/bin'].join(':') }, home);
  assert.ok(p.allowRead.includes(tools));
  assert.ok(p.allowRead.includes(path.join(home, '.local/share/claude/versions')));
  assert.ok(!p.allowRead.includes(sibling));
}));

test('options: repeatable keys, colon-separated extra paths, and the command after --', () => {
  const { options, command } = parseArgs(['--root', '/p', '--shared-key', '/k1', '--shared-key', '/k2', '--allow-read', '/a:/b', '--allow-write', '', '--', 'node', 'x']);
  assert.deepEqual(options.sharedKeys, ['/k1', '/k2']);
  assert.deepEqual(options.allowRead, ['/a', '/b']);
  assert.deepEqual(options.allowWrite, []);
  assert.deepEqual(command, ['node', 'x']);
});

test('macOS: Unix sockets are denied except DNS and the project\'s own', () => {
  const rules = macosSocketRules({ sockets: ['/tmp/fyso-demo-8400.sock', { prefix: '/tmp/fyso-ext-', suffix: '-8400.sock' }, { prefix: '/tmp/@dagu_', suffix: '.sock', create: true }] });
  assert.match(rules, /^\(deny network-outbound \(remote unix-socket\)\)/);
  assert.match(rules, /mDNSResponder/);
  assert.match(rules, /path-literal "\/private\/tmp\/fyso-demo-8400\.sock"/);
  // Seatbelt regex has no `+`: one path component is [^/]*, as sandbox-runtime writes it.
  assert.ok(rules.includes('(regex "^/private/tmp/fyso-ext-[^/]*-8400\\\\.sock$")'));
  assert.ok(rules.includes('(allow file-write* (regex "^/private/tmp/@dagu_[^/]*\\\\.sock$"))'));
  assert.ok(!rules.includes("'"));
});

test('lib.sh confined_exec routes through confine.cjs unless FYSO_CONFINE=off, with a cleared environment', () => fixture(home => {
  const { spawnSync } = require('node:child_process');
  const lib = path.resolve(__dirname, '../template/framework/scripts/lib.sh');
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\necho "NODE $*"\necho "CANARY=${FYSO_CANARY-unset} MODE=${FYSO_CONFINE-unset}"\n', { mode: 0o755 });
  const run = mode => spawnSync('/bin/bash', ['-c', `source ${JSON.stringify(lib)}; confined_exec A=1 /bin/sh -c 'echo PLAIN A=$A CANARY=\${FYSO_CANARY-unset}'`], {
    encoding: 'utf8', env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, FYSO_ROOT: '/r', FYSO_DATA: '/r/.data', FYSO_PROJECT: 'demo', FYSO_HTTP_PORT: '8400', FYSO_CONFINE: mode, FYSO_CANARY: 'leak' },
  }).stdout;
  const strict = run('strict');
  assert.match(strict, /^NODE \/r\/framework\/scripts\/confine\.cjs run --root \/r --data \/r\/\.data --project demo --port 8400 --shared-key .* -- \/bin\/sh -c /m);
  assert.match(strict, /CANARY=unset MODE=strict/);
  assert.equal(run('off').trim(), 'PLAIN A=1 CANARY=unset');
}));
