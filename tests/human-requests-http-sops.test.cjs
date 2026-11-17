const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync,spawnSync} = require('node:child_process');
const {httpConfig} = require('../template/framework/extensions/human-requests/extensions/human-requests/deliver.cjs');

test('extracts only the configured receiver credential from a real encrypted fixture', t => {
  const age=process.env.FYSO_TEST_AGE_KEYGEN,sops=process.env.FYSO_TEST_SOPS;
  if (!age || !sops) return t.skip('Set FYSO_TEST_AGE_KEYGEN and FYSO_TEST_SOPS to pinned test executables');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-hr-sops-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const key=path.join(dir,'age-key'),plain=path.join(dir,'fixture.yaml'),encrypted=path.join(dir,'secrets.enc.yaml');
  execFileSync(age,['-o',key],{stdio:'ignore'});
  const recipient=execFileSync(age,['-y',key],{encoding:'utf8'}).trim();
  fs.writeFileSync(plain,'FYSO_HR_HTTP_ONE: token-one\nFYSO_HR_HTTP_TWO: token-two\n',{mode:0o600});
  const ciphertext=execFileSync(sops,['encrypt','--age',recipient,'--input-type','yaml','--output-type','yaml',plain],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  fs.writeFileSync(encrypted,ciphertext,{mode:0o600}); fs.rmSync(plain);
  const env={...process.env,FYSO_ROOT:dir,FYSO_COMPOSIO_AGE_KEY_FILE:key,FYSO_HR_HTTP_DESTINATION:'https://one.example/callback',FYSO_HR_HTTP_SECRET_NAME:'FYSO_HR_HTTP_ONE'};
  const run=(_bin,args,options)=>spawnSync(sops,args,options);
  assert.equal(httpConfig(env,'https://one.example/callback',run).bearer,'token-one');
  assert.equal(httpConfig({...env,FYSO_HR_HTTP_DESTINATION:'https://two.example/callback',FYSO_HR_HTTP_SECRET_NAME:'FYSO_HR_HTTP_TWO'},'https://two.example/callback',run).bearer,'token-two');
  assert.throws(()=>httpConfig(env,'https://other.example/callback',run),/not allowed/);
});
