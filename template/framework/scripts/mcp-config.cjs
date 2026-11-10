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
  const temporary = '.mcp.json.tmp';
  try {
    fs.writeFileSync(temporary,JSON.stringify({mcpServers:servers},null,2)+'\n',{mode:0o600});
    fs.renameSync(temporary,'.mcp.json');
  } finally { fs.rmSync(temporary,{force:true}); }
}
module.exports = {write};
if (require.main === module) {
  try { write(); } catch(error) { console.error(error.message); process.exitCode = 1; }
}
