const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const script = path.resolve(__dirname, '../template/framework/scripts/run-mcp-remote.sh');

test('remote MCP passes configured key and store paths to its child without leaking unrelated variables', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-env-'));
  try {
    fs.writeFileSync(path.join(dir, 'mise'), '#!/bin/bash\n/usr/bin/env\n', { mode: 0o755 });
    for (const values of [{}, { MISE_SOPS_AGE_KEY_FILE: '/fixture/key with space', SOPS_AGE_KEY_FILE: '/fixture/other key', MISE_DATA_DIR: '/fixture/tools dir' }]) {
      const env = { HOME: dir, PATH: `${dir}:/usr/bin:/bin`, FYSO_HTTP_PORT: '34740', FYSO_CANARY_SECRET: 'excluded', ...values };
      const result = spawnSync('/bin/bash', [script], { env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const lines = result.stdout.split('\n');
      for (const name of ['MISE_SOPS_AGE_KEY_FILE', 'SOPS_AGE_KEY_FILE', 'MISE_DATA_DIR']) {
        const line = lines.find(item => item.startsWith(`${name}=`));
        assert.equal(line, values[name] === undefined ? undefined : `${name}=${values[name]}`);
      }
      assert.equal(lines.some(line => line.startsWith('FYSO_CANARY_SECRET=')), false);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
