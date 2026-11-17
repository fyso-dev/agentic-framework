// Dagu adapter: validated parameters, no shell interpolation, native installer connector.
// MODE status reports every agent (TARGET is ignored); open starts a new conversation
// in a desktop app (Codex, Claude Desktop) on the Dagu host. MODE remote makes sure
// the remote MCP has its token (D63) and reports the address, never the token.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const TARGETS = ['claude-desktop', 'codex', 'claude-code'];
const OPENABLE = ['claude-desktop', 'codex'];
function main(env = process.env) {
  const target = env.TARGET;
  const mode = env.MODE || 'connect';
  if (!['connect', 'disconnect', 'open', 'status', 'remote'].includes(mode)) throw Error('Invalid connection mode');
  if (mode === 'remote') {
    const ensured = spawnSync(path.join(__dirname, 'agent-remote.sh'), ['--ensure'], { env, encoding: 'utf8' });
    if (ensured.error) throw ensured.error;
    if (ensured.status !== 0) throw Error((ensured.stderr || 'Remote connection failed').trim().split('\n').pop());
    console.log(ensured.stdout.trim().split('\n').pop());
    return;
  }
  if (mode !== 'status' && !(mode === 'open' ? OPENABLE : TARGETS).includes(target)) throw Error('Invalid assistant target');
  const args = mode === 'status' ? ['status'] : [mode, target];
  const result = spawnSync(process.execPath, [path.join(__dirname, 'agent-connect.cjs'), ...args], { env, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error((result.stderr || result.stdout || 'Assistant connection failed').trim());
  if (mode === 'status') console.log(JSON.stringify({ mode, ...JSON.parse(result.stdout) }));
  else console.log(JSON.stringify({ target, mode, message: result.stdout.trim() }));
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };
