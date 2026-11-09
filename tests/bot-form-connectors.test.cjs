const {test}=require('node:test'),assert=require('node:assert/strict');
test('the bot form versions one connector selection and preserves other profiles and fields',async()=>{
  const {parseTeam,readBots,upsertBot,serializeTeam}=await import('../template/framework/panel/src/lib/team.ts');
  const text='# project comment\nversion: 1\ndefaults:\n  cwd: ${FYSO_ROOT}\n  tools:\n    allow: ["native:*", "mcp:dagu:*"]\nbots:\n  - name: One\n    model: codex/model\n    approval: ask\n    soul: { file: ${FYSO_ROOT}/project/one.md }\n  - name: Two\n    model: claude/model\n    tools: { allow: ["native:*", "mcp:other:read"] }\n';
  const doc=parseTeam(text),before=readBots(doc);
  assert.deepEqual(before[0].tools,{allow:['native:*','mcp:dagu:*']});
  const tools={allow:['native:*','mcp:dagu:*','mcp:service:*'],deny:['mcp:other:*']};
  upsertBot(doc,0,{name:'One',title:'Updated title',model:'codex/model',soulText:null,usesWorkflows:true,tools});
  const after=readBots(doc);
  assert.deepEqual(after[0].tools,tools);assert.equal(after[1].fingerprint,before[1].fingerprint);
  assert.equal(doc.getIn(['bots',0,'approval']),'ask');
  assert.ok(serializeTeam(doc).includes('${FYSO_ROOT}/project/one.md'));
  assert.ok(serializeTeam(doc).includes('# project comment'));
  upsertBot(doc,0,{name:'One',title:'Another title',model:'codex/model',soulText:null,usesWorkflows:true});
  assert.deepEqual(readBots(doc)[0].tools,tools);
});
