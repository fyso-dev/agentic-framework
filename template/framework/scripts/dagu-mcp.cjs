// Forward Dagu's own MCP tools (dagu_read, dagu_execute, dagu_change) through the platform
// MCP server (D57), for agents that reach only `fyso`: desktop apps cannot hold the project
// login the Dagu MCP needs. Names, schemas and results are Dagu's, passed through unchanged.
const fs = require('node:fs');
const path = require('node:path');

const PROTOCOL = '2025-06-18';

function forwarder(env = process.env) {
  // Bots get DAGU_MCP_AUTH from OpenMausBot (run-omb.sh), with no access to the decrypted login;
  // everything else runs through mise and has the login itself.
  const auth = env.DAGU_MCP_AUTH || (env.FYSO_ADMIN_USER && env.FYSO_ADMIN_PASSWORD && 'Basic ' + Buffer.from(`${env.FYSO_ADMIN_USER}:${env.FYSO_ADMIN_PASSWORD}`).toString('base64'));
  if (!env.FYSO_DAGU_PORT || !auth) throw Error('Dagu is not configured: run through mise, or inside OpenMausBot (FYSO_DAGU_PORT, DAGU_MCP_AUTH)');
  const url = `http://127.0.0.1:${env.FYSO_DAGU_PORT}/mcp`;
  const cache = path.join(env.FYSO_DATA || '.data', 'panel', 'dagu-mcp-tools.json');
  const headers = {Authorization: auth,
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': PROTOCOL};
  let session = null, seq = 0;

  // One JSON-RPC message over streamable HTTP. A request resolves its response, whether
  // Dagu answers with JSON or with an event stream; a notification resolves nothing.
  async function post(message, timeoutMs) {
    const response = await fetch(url, {method: 'POST', headers: {...headers, ...(session && {'Mcp-Session-Id': session})},
      body: JSON.stringify({jsonrpc: '2.0', ...message}), signal: AbortSignal.timeout(timeoutMs)})
      .catch(error => { throw Error(`Dagu is not reachable (${error.cause?.code || error.name}): check fyso_status; a person starts the stack with \`mise run up\``); });
    if (response.status === 404 && session) { session = null; throw Object.assign(Error('Dagu MCP session expired'), {expired: true}); }
    if (!response.ok) throw Error(`Dagu MCP ${message.method} failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    session = response.headers.get('mcp-session-id') || session;
    if (message.id === undefined) return undefined;
    const body = await response.text();
    const messages = (response.headers.get('content-type') || '').includes('text/event-stream')
      ? body.split(/\r?\n\r?\n/).map(event => event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')).filter(Boolean).map(data => JSON.parse(data))
      : [JSON.parse(body)];
    const answer = messages.find(m => m.id === message.id);
    if (!answer) throw Error(`Dagu MCP ${message.method} returned no response`);
    if (answer.error) throw Error(`Dagu MCP ${message.method}: ${answer.error.message}`);
    return answer.result;
  }
  async function open() {
    await post({id: ++seq, method: 'initialize', params: {protocolVersion: PROTOCOL, capabilities: {}, clientInfo: {name: 'fyso', version: '1'}}}, 10000);
    await post({method: 'notifications/initialized'}, 10000);
  }
  async function request(method, params, timeoutMs) {
    for (let retried = false; ; retried = true) {
      try {
        if (!session) await open();
        return await post({id: ++seq, method, ...(params && {params})}, timeoutMs);
      } catch (error) { if (!error.expired || retried) throw error; }
    }
  }
  return {
    /** Dagu's tool definitions. General clients may use the last good list while Dagu is down. */
    async tools({allowCache = true} = {}) {
      try {
        const tools = (await request('tools/list', undefined, 10000)).tools.filter(tool => tool.name.startsWith('dagu_'));
        try { fs.mkdirSync(path.dirname(cache), {recursive: true}); fs.writeFileSync(cache, JSON.stringify(tools)); } catch {}
        return tools;
      } catch {
        if (!allowCache) return [];
        try { return JSON.parse(fs.readFileSync(cache, 'utf8')); } catch { return []; }
      }
    },
    /** One tool call; Dagu's result object as it is. `wait=true` runs can take long. */
    call: (name, args) => request('tools/call', {name, arguments: args}, 35 * 60000),
  };
}

module.exports = {forwarder};
