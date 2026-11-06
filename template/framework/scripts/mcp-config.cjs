// Generate the cwd MCP config without expanding Claude Code placeholders.
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
