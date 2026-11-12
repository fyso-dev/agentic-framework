// Remote MCP connection (D63): what each client needs to connect to this project.
// One list for the terminal task (agent-remote.sh) and the panel (D65, through the
// private setup adapter). The token is read from secrets.enc.yaml on demand and is
// never an argument, a Dagu parameter or a Dagu output.
const {spawnSync} = require('node:child_process');
const web = require('./web-origin.cjs');

const serverName = env => `fyso-${env.FYSO_PROJECT}`;
const address = env => `${web.origin('panel', env)}/mcp`;

// Each command was checked against the client's own `mcp add --help`.
function clients({name, url, token}) {
  const variable = `${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_MCP_TOKEN`;
  return [
    {id: 'claude-code', label: 'Claude Code', commands: [
      `claude mcp add --transport http --scope user ${name} ${url} --header "Authorization: Bearer ${token}"`]},
    {id: 'codex', label: 'Codex', note: 'env', commands: [
      `export ${variable}=${token}`,
      `codex mcp add ${name} --url ${url} --bearer-token-env-var ${variable}`]},
    {id: 'opencode', label: 'OpenCode', commands: [
      `opencode mcp add ${name} --url ${url} --header "Authorization=Bearer ${token}"`]},
    {id: 'gemini', label: 'Gemini CLI', commands: [
      `gemini mcp add --transport http --scope user ${name} ${url} -H "Authorization: Bearer ${token}"`]},
    {id: 'other', label: 'MCP', note: 'json', commands: [
      JSON.stringify({mcpServers: {[name]: {type: 'http', url, headers: {Authorization: `Bearer ${token}`}}}}, null, 2)]},
  ];
}

class RemoteError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
// The stored token, read fresh: it may have been created after this process started.
function storedToken(env = process.env) {
  const result = spawnSync('sops', ['decrypt', '--extract', '["FYSO_MCP_TOKEN"]', 'secrets.enc.yaml'],
    {cwd: env.FYSO_ROOT, env, encoding: 'utf8'});
  return result.status === 0 ? result.stdout.trim() : '';
}
function describe(env = process.env, token = storedToken(env)) {
  if (web.scheme(env) !== 'https') throw new RemoteError('httpsRequired');
  if (token.length < 32) throw new RemoteError('noToken');
  const name = serverName(env), url = address(env);
  return {server: name, url, clients: clients({name, url, token})};
}

function print(env = process.env) {
  const {url, clients: list} = describe(env, env.FYSO_MCP_TOKEN || '');
  const lines = ['', `Remote MCP of this project: ${url}`, 'Run the lines of your client on the machine where your agent lives.', ''];
  for (const client of list) {
    lines.push(client.id === 'other' ? 'Any other MCP client (configuration)' : client.label
      + (client.note === 'env' ? ' (the token stays in an environment variable; add the export to your shell profile)' : ''));
    for (const command of client.commands) lines.push(...command.split('\n').map(line => `  ${line}`));
    lines.push('');
  }
  lines.push("The token gives the project's platform tools (status, bots, extensions, files to",
    "read), not Dagu's own tools. Whoever has it can use them: treat it as a password.",
    'New token: mise run agent:remote -- --rotate');
  console.log(lines.join('\n'));
}

if (require.main === module) {
  try { print(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {clients, describe, serverName, address, RemoteError};
