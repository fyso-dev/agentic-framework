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
test('isolated Dagu startup preserves custom age-key paths without passing secret values', () => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const { execFileSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-env-'));
  try {
    fs.writeFileSync(path.join(dir, 'dagu'), '#!/bin/sh\nprintf "%s\\n%s\\n%s" "$FYSO_COMPOSIO_AGE_KEY_FILE" "$COMPOSIO_API_KEY" "$DAGU_ENV_PASSTHROUGH_PREFIXES"\n', {mode:0o755});
    const required = Object.fromEntries(['FYSO_ADMIN_USER','FYSO_ADMIN_PASSWORD','FYSO_DAGU_PORT','FYSO_OMB_PORT','OPENMAUSBOT_URL','FYSO_DAGU_SCHEDULER_PORT','FYSO_DAGU_WORKER_HEALTH_PORT','FYSO_DAGU_COORDINATOR_PORT','FYSO_DAGU_COORDINATOR_HEALTH_PORT','FYSO_PROJECT','FYSO_HTTP_PORT'].map(k=>[k,'fixture']));
    for (const patch of [{SOPS_AGE_KEY_FILE:path.join(dir,'sops-key')}, {MISE_SOPS_AGE_KEY_FILE:path.join(dir,'mise-key'),SOPS_AGE_KEY_FILE:'ignored'}]) {
      const output = execFileSync('bash', [path.resolve(__dirname,'../template/framework/scripts/run-dagu.sh')], {
        encoding:'utf8',env:{...required,FYSO_CONFINE:'off',HOME:dir,PATH:`${dir}:${process.env.PATH}`,FYSO_DATA:path.join(dir,'data'),FYSO_ROOT:dir,COMPOSIO_API_KEY:'must-not-pass',...patch},
      }).split('\n');
      assert.equal(output[0], patch.MISE_SOPS_AGE_KEY_FILE || patch.SOPS_AGE_KEY_FILE);
      assert.equal(output[1], '');
      assert.ok(output[2].split(',').includes('FYSO_'));
    }
    assert.match(fs.readFileSync(path.resolve(__dirname,'../template/framework/scripts/composio.cjs'),'utf8'), /SOPS_AGE_KEY_FILE: process.env.FYSO_COMPOSIO_AGE_KEY_FILE/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('request files are contained in project/composio including symlink resolution', () => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const { requestFile } = require('../template/framework/scripts/composio.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'composio-path-'));
  try {
    fs.mkdirSync(path.join(root,'project/composio'),{recursive:true});
    const inside=path.join(root,'project/composio/profile.json');
    fs.writeFileSync(inside,'{}');
    fs.writeFileSync(path.join(root,'outside.json'),'{}');
    fs.symlinkSync(path.join(root,'outside.json'),path.join(root,'project/composio/link.json'));
    assert.equal(requestFile(root,'project/composio/profile.json'),fs.realpathSync(inside));
    assert.throws(()=>requestFile(root,'outside.json'));
    assert.throws(()=>requestFile(root,'project/composio/../../outside.json'));
    assert.throws(()=>requestFile(root,'project/composio/link.json'));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
