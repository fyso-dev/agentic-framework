// Probe only this project's OpenMausBot. This establishes native MCP
// registration/connectivity, not that any particular model can use the tools.
const path = require('node:path');
async function check(port, root, request = fetch) {
  if (!/^\d{1,5}$/.test(port || '') || Number(port) < 1 || Number(port) > 65535 || !root || !path.isAbsolute(root)) return false;
  const base = `http://127.0.0.1:${port}/api/mcp/servers`;
  try {
    const listing = await request(base, {method:'GET', signal:AbortSignal.timeout(5000)});
    if (!listing.ok) return false;
    const servers = (await listing.json()).servers;
    const expected = path.join(root, 'framework/scripts/fyso-mcp.cjs');
    if (!Array.isArray(servers) || !servers.some(server => server?.name === 'dagu' && server.enabled === true &&
        server.scope === 'team' && server.command === 'node' && !server.runsOn &&
        Array.isArray(server.args) && server.args.length === 2 && server.args[0] === expected && server.args[1] === '--dagu-only' &&
        Array.isArray(server.envKeys) && server.envKeys.length === 0)) return false;
    const response = await request(`${base}/dagu/test`, {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}', signal:AbortSignal.timeout(30000)});
    if (!response.ok) return false;
    const probe = await response.json();
    if (probe?.ok !== true || !Array.isArray(probe.tools)) return false;
    const names = new Set(probe.tools.map(tool => tool?.name));
    return names.has('dagu_read') && names.has('dagu_execute');
  } catch { return false; }
}
if (require.main === module) check(process.env.FYSO_OMB_PORT, process.env.FYSO_ROOT).then(ok => { process.exitCode = ok ? 0 : 1; });
module.exports = {check};
