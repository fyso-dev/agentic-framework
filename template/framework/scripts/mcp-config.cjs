// Generate the cwd MCP config. Claude Code placeholders stay as written, except this
// project's own port numbers in a server `url`: OpenMausBot validates that URL before
// expanding anything, and rejects the server for bots with a tool selection.
const fs = require('node:fs');
function write() {
  const servers = Object.create(null), owners = new Map();
  const files = ['framework/mcp.json','project/mcp.json', ...[...fs.globSync('extensions/*/mcp.json')].sort()];
  for (const file of files) {
    if (!fs.existsSync(file) && file !== 'framework/mcp.json') continue;
    const data = JSON.parse(fs.readFileSync(file,'utf8'));
    if (!data.mcpServers || typeof data.mcpServers !== 'object' || Array.isArray(data.mcpServers)) throw Error(`${file}: expected mcpServers object`);
    for (const [name, config] of Object.entries(data.mcpServers)) {
      if (owners.has(name)) throw Error(`Duplicate MCP server ${name}: ${owners.get(name)} and ${file}`);
      owners.set(name,file); servers[name] = config;
      if (config && typeof config.url === 'string') {
        servers[name] = {...config, url: config.url.replace(/\$\{(FYSO_[A-Z0-9_]*_PORT)\}/g,
          (placeholder, variable) => /^\d+$/.test(process.env[variable] || '') ? process.env[variable] : placeholder)};
      }
    }
  }
  const text = JSON.stringify({mcpServers:servers},null,2)+'\n';
  let current = null;
  try { current = fs.readFileSync('.mcp.json','utf8'); } catch {}
  if (current === text) return false;
  // Per process: overlapping setup checks (D80) must not share a temporary file.
  const temporary = `.mcp.json.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary,text,{mode:0o600});
    fs.renameSync(temporary,'.mcp.json');
  } catch (error) {
    // The sandbox of confined processes (D93) never lets them write .mcp.json, so an agent
    // cannot plant an MCP server. Dagu steps leave the change to the next `mise run up`.
    if (!['EPERM','EACCES'].includes(error.code) || !process.env.FYSO_CONFINED) throw error;
    console.error('.mcp.json is out of date; it is regenerated on the next `mise run up`');
    return false;
  } finally { fs.rmSync(temporary,{force:true}); }
  return true;
}
module.exports = {write};
if (require.main === module) {
  try { write(); } catch(error) { console.error(error.message); process.exitCode = 1; }
}
