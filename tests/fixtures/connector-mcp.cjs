// Harmless local MCP fixture: no network, credentials or filesystem access.
const readline=require('node:readline');
readline.createInterface({input:process.stdin}).on('line',line=>{
  const {id,method,params}=JSON.parse(line);if(id===undefined)return;
  let result={};
  if(method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'connector-proof',version:'1'}};
  if(method==='tools/list')result={tools:[{name:'read_message',description:'Return the harmless connector proof message',inputSchema:{type:'object',properties:{}}},{name:'other_message',description:'A second tool to verify exclusion',inputSchema:{type:'object',properties:{}}}]};
  if(method==='tools/call')result={content:[{type:'text',text:params.name==='read_message'?'CONNECTOR_PROOF_OK':'OTHER_PROOF'}]};
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');
});
