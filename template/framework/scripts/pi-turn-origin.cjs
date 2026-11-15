// OpenMausBot 0.1.141 gives the native agents MCP mount the authenticated bot
// and conversation for this turn. Pi's driver does not otherwise tell its
// model those IDs. Read only those two fields; the descriptor can also hold a
// bearer token and must never be printed or passed to Pi.
const fs = require('node:fs');

function origin(file) {
  if (!file) return null;
  try {
    const agents = JSON.parse(fs.readFileSync(file, 'utf8'))?.mcpServers?.agents;
    if (!agents?.env) return null;
    let env = agents.env;
    if (env.OMB_GATE_UPSTREAM) {
      if (env.OMB_GATE_NAME !== 'agents') return null;
      env = JSON.parse(env.OMB_GATE_UPSTREAM)?.env;
    }
    const bot = env?.OMB_BOT_ID, task = env?.OMB_THREAD_ID;
    const valid = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);
    return valid(bot) && valid(task) ? {bot, task} : null;
  } catch { return null; }
}

if (require.main === module) {
  const value = origin(process.env.OMB_MCP_CONFIG);
  if (value) process.stdout.write(`OpenMausBot current conversation origin: ${JSON.stringify(value)}. When a project skill needs an OMB origin, these are this turn's exact bot and task IDs.`);
}
module.exports = {origin};
