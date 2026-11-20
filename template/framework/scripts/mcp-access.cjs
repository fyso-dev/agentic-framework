// Remote MCP authorization from trusted installed extensions over their private sockets.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

function policies(root, env) {
  const directory = path.join(root, 'extensions');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(id =>
    /^[a-z][a-z0-9-]{1,30}$/.test(id) &&
    fs.existsSync(path.join(directory, id, 'mcp-authorize'))
  ).map(id => {
    if (!/^[0-9]+$/.test(env.FYSO_HTTP_PORT || '')) throw Error('Remote MCP policy requires the project port.');
    return {id, socket: `/tmp/fyso-ext-${id}-${env.FYSO_HTTP_PORT}.sock`};
  });
}

function decide(socketPath, operation) {
  return new Promise(resolve => {
    const request = http.request({
      socketPath, method: 'POST', path: '/mcp-access/check',
      headers: {'Content-Type': 'application/json'}, signal: AbortSignal.timeout(10000),
    }, response => {
      response.resume();
      resolve(response.statusCode === 204);
    });
    request.on('error', () => resolve(false));
    request.end(JSON.stringify(operation));
  });
}

function remoteAccess(root, env) {
  const checks = () => policies(root, env);
  return {
    enabled: () => checks().length > 0,
    async authenticate(extension, digest) {
      const provider = checks().find(({id}) => id === extension);
      return !!provider && decide(provider.socket, {
        principal: {kind: 'delegated', extension, digest}, method: 'authenticate',
      });
    },
    async authorize(operation) {
      return (await Promise.all(checks().map(({id, socket}) => {
        const principal = operation.principal;
        const scoped = principal.kind === 'delegated' && principal.extension !== id
          ? {...operation, principal: {kind: 'delegated', extension: principal.extension}}
          : operation;
        return decide(socket, scoped);
      }))).every(Boolean);
    },
  };
}

module.exports = {remoteAccess};
