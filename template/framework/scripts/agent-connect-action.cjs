// Dagu adapter: validated parameters, no shell interpolation, native installer connector.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
function main(env = process.env) {
  const target = env.TARGET;
  const mode = env.MODE || 'connect';
  if (!['claude-desktop', 'codex', 'claude-code'].includes(target)) throw Error('Invalid assistant target');
  if (!['connect', 'disconnect'].includes(mode)) throw Error('Invalid connection mode');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'agent-connect.cjs'), mode, target], { env, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error((result.stderr || result.stdout || 'Assistant connection failed').trim());
  console.log(JSON.stringify({ target, mode, message: result.stdout.trim() }));
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };
