#!/usr/bin/env node
// Small REST adapter: no SDK, credential persistence, or automatic retries.
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');

function request(value) {
  const keys = ['tool_slug', 'connected_account_id', 'user_id', 'version', 'arguments'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw Error('Invalid request fields');
  if (!/^[A-Z][A-Z0-9_]+$/.test(value.tool_slug || '')) throw Error('Explicit tool_slug required');
  for (const key of ['connected_account_id', 'user_id', 'version']) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key] === 'latest') throw Error(`Explicit ${key} required (no latest)`);
  }
  if (value.connected_account_id === 'instant_account') throw Error('Use an explicit connected account');
  if (!value.arguments || typeof value.arguments !== 'object' || Array.isArray(value.arguments)) throw Error('arguments must be an object');
  return value;
}

async function execute(value, key, fetcher = fetch) {
  request(value);
  if (!key || !key.trim()) throw Error('COMPOSIO_API_KEY is missing');
  const { tool_slug, ...body } = value;
  let response;
  try {
    response = await fetcher(`https://backend.composio.dev/api/v3/tools/execute/${tool_slug}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { 'x-api-key': key.trim(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { throw Error('Composio transport failed; outcome unknown, do not blindly retry'); }
  if (!response.ok) throw Error(`Composio HTTP ${response.status}; inspect account/scopes or service status before retrying`);
  let result;
  try { result = await response.json(); } catch { throw Error('Invalid Composio response'); }
  if (result?.successful !== true || result.error) throw Error('Composio tool failed; provider response withheld');
  return result.data;
}

async function main() {
  if (process.argv.length !== 3) throw Error('Usage: node framework/scripts/composio.cjs <request.json>');
  let value;
  try { value = JSON.parse(readFileSync(process.argv[2], 'utf8')); } catch { throw Error('Cannot read request JSON'); }
  request(value);
  // Load only the one required secret, in the step process, never in Dagu's environment.
  let key;
  try {
    const root = resolve(__dirname, '../..');
    key = execFileSync('sops', ['decrypt', '--extract', '["COMPOSIO_API_KEY"]', resolve(root, 'secrets.enc.yaml')], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, SOPS_AGE_KEY_FILE: process.env.FYSO_COMPOSIO_AGE_KEY_FILE || process.env.MISE_SOPS_AGE_KEY_FILE || process.env.SOPS_AGE_KEY_FILE || resolve(process.env.HOME, '.config/mise/age.txt') },
    });
  } catch { throw Error('Cannot decrypt COMPOSIO_API_KEY; configure it with mise run secrets'); }
  const data = await execute(value, key);
  process.stdout.write(JSON.stringify(data) + '\n');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { request, execute };
