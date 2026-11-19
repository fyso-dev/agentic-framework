// Remote MCP connection (D63): what each client needs to connect to this project.
// One list for the terminal task (agent-remote.sh) and the panel (D65, through the
// private setup adapter). The token is read from secrets.enc.yaml on demand and is
// never an argument, a Dagu parameter or a Dagu output.
const {spawnSync} = require('node:child_process');
const web = require('./web-origin.cjs');
const oauth = require('./mcp-oauth.cjs');

const serverName = env => `fyso-${env.FYSO_PROJECT}`;
const address = env => `${web.origin('panel', env)}/mcp`;

// Each command was checked against the client's own `mcp add --help`.
// With an OAuth client (D88), people sign in with their web login instead of a token:
// Claude Desktop and claude.ai take the address, client id and secret in a custom
// connector's advanced settings; Claude Code needs the fixed callback port.
function clients({name, url, token, clientId, clientSecret}) {
  const variable = `${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_MCP_TOKEN`;
  // With a shared login the hub keeps the secret: without a local copy, people get it there.
  const signIn = !clientId ? [] : [
    {id: 'claude-desktop', label: 'Claude Desktop · claude.ai', note: clientSecret ? 'oauth' : 'oauthHub', commands: clientSecret ? [url, clientId, clientSecret] : [url, clientId]},
    {id: 'claude-code-oauth', label: 'Claude Code (OAuth)', note: 'oauthCli', commands: [
      `${clientSecret ? `MCP_CLIENT_SECRET=${clientSecret} ` : ''}claude mcp add --transport http --scope user --client-id ${clientId} --client-secret --callback-port ${oauth.CALLBACK_PORT} ${name} ${url}`]},
  ];
  if (!token) return signIn;
  return [...signIn,
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
// Stored secrets, read fresh: they may have been created after this process started.
function stored(key, env = process.env) {
  const result = spawnSync('sops', ['decrypt', '--extract', `["${key}"]`, 'secrets.enc.yaml'],
    {cwd: env.FYSO_ROOT, env, encoding: 'utf8'});
  return result.status === 0 ? result.stdout.trim() : '';
}
const storedToken = env => stored('FYSO_MCP_TOKEN', env);
function describe(env = process.env, token = storedToken(env), clientSecret = stored('FYSO_MCP_CLIENT_SECRET', env)) {
  if (web.scheme(env) !== 'https') throw new RemoteError('httpsRequired');
  const signIn = oauth.enabled({...env, FYSO_WEB_SCHEME: 'https', FYSO_MCP_CLIENT_SECRET: clientSecret});
  if (token.length < 32 && !signIn) throw new RemoteError('noToken');
  const name = serverName(env), url = address(env);
  return {server: name, url, oauth: signIn, clients: clients({name, url, token: token.length < 32 ? '' : token,
    clientId: signIn ? oauth.clientId(env) : '', clientSecret: signIn && clientSecret.length >= 32 ? clientSecret : ''})};
}

function print(env = process.env) {
  const {url, clients: list} = describe(env, env.FYSO_MCP_TOKEN || '', env.FYSO_MCP_CLIENT_SECRET || '');
  const lines = ['', `Remote MCP of this project: ${url}`, 'Run the lines of your client on the machine where your agent lives.', ''];
  for (const client of list) {
    lines.push(client.id === 'other' ? 'Any other MCP client (configuration)' : client.label
      + (client.note === 'env' ? ' (the token stays in an environment variable; add the export to your shell profile)' : '')
      + (client.note === 'oauth' ? ': Settings › Connectors › Add custom connector; under Advanced settings, the client ID and secret. Then sign in with your panel user.' : '')
      + (client.note === 'oauthHub' ? ': Settings › Connectors › Add custom connector; under Advanced settings, the client ID and the secret the shared login\'s administrator gives you.' : '')
      + (client.note === 'oauthCli' ? ': then run /mcp in Claude Code and sign in with your panel user.' : ''));
    const labels = ['oauth', 'oauthHub'].includes(client.note) ? ['URL', 'OAuth Client ID', 'OAuth Client Secret'] : [];
    client.commands.forEach((command, at) => lines.push(...command.split('\n').map(line => `  ${labels[at] ? `${labels[at]}: ` : ''}${line}`)));
    lines.push('');
  }
  lines.push("The token and an OAuth sign-in give the project's tools, including Dagu's, which run",
    'commands on this machine. Treat the token and the client secret as passwords; OAuth',
    "also needs a web login user that may open the panel.",
    'New token and client secret: mise run agent:remote -- --rotate');
  console.log(lines.join('\n'));
}

if (require.main === module) {
  try { print(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {clients, describe, serverName, address, RemoteError};
