const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execute, request } = require('../template/framework/scripts/composio.cjs');
const input = { tool_slug: 'GMAIL_GET_PROFILE', connected_account_id: 'ca_test', user_id: 'user_test', version: '20251027_00', arguments: {} };
test('explicit request: prevent implicit auth, unpinned versions and auth overrides', () => {
  for (const patch of [{version:'latest'}, {user_id:''}, {connected_account_id:'instant_account'}, {custom_connection_data:{}}, {arguments:[]}, {tool_slug:'../proxy'}]) assert.throws(() => request({...input,...patch}));
});
test('sends exact account and version; prints only data', async () => {
  const result = await execute(input, 'test-secret', async (url, options) => {
    assert.equal(url, 'https://backend.composio.dev/api/v3/tools/execute/GMAIL_GET_PROFILE');
    assert.equal(options.headers['x-api-key'],'test-secret');
    assert.equal(options.redirect,'error');
    assert.deepEqual(JSON.parse(options.body), {connected_account_id:'ca_test',user_id:'user_test',version:'20251027_00',arguments:{}});
    return {ok:true,json:async()=>({successful:true,data:{ok:1},log_id:'private'})};
  });
  assert.deepEqual(result,{ok:1});
});
test('HTTP failure, tool failure and ambiguous transport fail once without leaking', async () => {
  for (const response of [{ok:false,status:401}, {ok:true,json:async()=>({successful:false,error:'private-secret'})}, {ok:true,json:async()=>{throw Error('private-secret')}}, {ok:true,json:async()=>({data:{}})}]) {
    let calls=0;
    await assert.rejects(execute(input,'test-secret',async()=>{calls++;return response}), e=> !e.message.includes('private-secret') && !e.message.includes('test-secret'));
    assert.equal(calls,1);
  }
  let calls=0;
  await assert.rejects(execute(input,'test-secret',async()=>{calls++;throw Error('private-secret')}), /outcome unknown/);
  assert.equal(calls,1);
});
test('missing key fails before network', async () => {
  await assert.rejects(execute(input,'',async()=>assert.fail('network called')), /missing/);
});
