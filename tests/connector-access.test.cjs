const {test}=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../template/framework/panel/src/lib/connector-access.ts');
test('toggling one MCP server preserves other servers, native tools and exact denials',async()=>{
  const {accessFor,selectServer}=await load();
  const before={allow:['native:*','mcp:dagu:dagu_read','mcp:target:read'],deny:['mcp:other:write']};
  assert.equal(accessFor(before,'target'),'some');
  const selected=selectServer(before,'target',true);
  assert.deepEqual(selected,{allow:['native:*','mcp:dagu:dagu_read','mcp:target:*'],deny:['mcp:other:write']});
  assert.equal(accessFor(selected,'target'),'all');
  const removed=selectServer(selected,'target',false);
  assert.equal(accessFor(removed,'target'),'none');
  assert.deepEqual(before.allow,['native:*','mcp:dagu:dagu_read','mcp:target:read']);
});
test('inherited access is removed with an exact deny without changing other connectors',async()=>{
  const {accessFor,selectServer}=await load();
  assert.equal(accessFor(undefined,'target'),'all');
  const denied=selectServer(undefined,'target',false);
  assert.deepEqual(denied,{deny:['mcp:target:*']});
  assert.equal(accessFor(denied,'other'),'all');
  assert.deepEqual(selectServer(denied,'target',true),{});
  assert.equal(accessFor({allow:['mcp:target:*'],deny:['mcp:target:write']},'target'),'some');
  assert.equal(accessFor({allow:['mcp:target:read'],deny:['mcp:target:read']},'target'),'none');
});
