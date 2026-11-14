// clean_exec is a security boundary: pass isolated mise state through while
// keeping unrelated inherited secrets out of child processes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

const lib = path.resolve(__dirname, '../template/framework/scripts/lib.sh');
const state = path.join(os.tmpdir(), 'fyso test state');
const config = path.join(os.tmpdir(), 'fyso test config');
const childConfig = path.join(os.tmpdir(), 'fyso child config');

function environment(inherited, explicit = []) {
  const env = { ...process.env, XDG_STATE_HOME: state, XDG_CONFIG_HOME: config, FYSO_SECRET_CANARY: 'not-for-child', ...inherited };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key];
  const result = spawnSync('bash', ['-c', 'source "$1"; shift; clean_exec "$@" /usr/bin/env', 'probe', lib, ...explicit], { env, encoding:'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return Object.fromEntries(result.stdout.trim().split('\n').map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

test('clean_exec preserves explicitly configured XDG state and config without leaking other inherited values', () => {
  const env = environment({});
  assert.equal(env.XDG_STATE_HOME, state);
  assert.equal(env.XDG_CONFIG_HOME, config);
  assert.equal(env.FYSO_SECRET_CANARY, undefined);
});

test('unset XDG paths remain unset, preserving ordinary default configuration', () => {
  const env = environment({ XDG_STATE_HOME: undefined, XDG_CONFIG_HOME: undefined });
  assert.equal(env.XDG_STATE_HOME, undefined);
  assert.equal(env.XDG_CONFIG_HOME, undefined);
});

test('a child-specific XDG override wins over the inherited config path', () => {
  const env = environment({}, [`XDG_CONFIG_HOME=${childConfig}`]);
  assert.equal(env.XDG_CONFIG_HOME, childConfig);
  assert.equal(env.XDG_STATE_HOME, state);
});
