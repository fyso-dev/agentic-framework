#!/usr/bin/env node
// Small REST adapter: no SDK, credential persistence, or automatic retries.
const { readFileSync, realpathSync } = require('node:fs');
const { resolve, relative, isAbsolute, sep } = require('node:path');
const { execFileSync } = require('node:child_process');

function request(value) {
  const keys = new Set(['tool_slug', 'connected_account_id', 'user_id', 'version', 'arguments']);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.has(k))) throw new Error('Invalid request fields');
  if (!/^[A-Z][A-Z0-9_]+$/.test(value.tool_slug || '')) throw new Error('Explicit tool_slug required');
  for (const key of ['connected_account_id', 'user_id', 'version']) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key] === 'latest') throw new Error(`Explicit ${key} required (no latest)`);
  }
  if (value.connected_account_id === 'instant_account') throw new Error('Use an explicit connected account');
  if (!value.arguments || typeof value.arguments !== 'object' || Array.isArray(value.arguments)) throw new Error('arguments must be an object');
  return value;
}

async function execute(value, key, fetcher = fetch) {
  request(value);
  if (!key?.trim()) throw new Error('COMPOSIO_API_KEY is missing');
  const { tool_slug, ...body } = value;
  let response;
  try {
    response = await fetcher(`https://backend.composio.dev/api/v3/tools/execute/${tool_slug}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { 'x-api-key': key.trim(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { throw new Error('Composio transport failed; outcome unknown, do not blindly retry'); }
  if (!response.ok) throw new Error(`Composio HTTP ${response.status}; inspect account/scopes or service status before retrying`);
  let result;
  try { result = await response.json(); } catch { throw new Error('Invalid Composio response'); }
  if (result?.successful !== true || result.error) throw new Error('Composio tool failed; provider response withheld');
  return result.data;
}

function requestFile(root, filename) {
  const base = resolve(realpathSync(root), 'project/composio');
  const file = realpathSync(resolve(root, filename));
  const rel = relative(base, file);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || !file.endsWith('.json')) {
    throw new Error('Request must be a JSON file inside project/composio');
  }
  return file;
}

async function main() {
  if (process.argv.length !== 3) throw new Error('Usage: node framework/scripts/composio.cjs <request.json>');
  const root = resolve(__dirname, '../..');
  let value;
  try { value = JSON.parse(readFileSync(requestFile(root, process.argv[2]), 'utf8')); } catch { throw new Error('Cannot read request JSON'); }
  request(value);
  // Load only the one required secret, in the step process, never in Dagu's environment.
  let key;
  try {
    key = execFileSync('sops', ['decrypt', '--extract', '["COMPOSIO_API_KEY"]', resolve(root, 'secrets.enc.yaml')], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, SOPS_AGE_KEY_FILE: process.env.FYSO_COMPOSIO_AGE_KEY_FILE || process.env.MISE_SOPS_AGE_KEY_FILE || process.env.SOPS_AGE_KEY_FILE || resolve(process.env.HOME, '.config/mise/age.txt') },
    });
  } catch { throw new Error('Cannot decrypt COMPOSIO_API_KEY; configure it with mise run secrets'); }
  const data = await execute(value, key);
  process.stdout.write(JSON.stringify(data) + '\n');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { request, execute, requestFile };
