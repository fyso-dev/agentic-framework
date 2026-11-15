const {test} = require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');

test('run parameters do not replace the workflow private-address opt-in', t=>{
  const dagu=process.env.FYSO_TEST_DAGU;
  if(!dagu)return t.skip('Set FYSO_TEST_DAGU to pinned Dagu 2.24.0');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-hr-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'policy.yaml'),output=path.join(root,'output');
  const node=process.execPath;
  fs.writeFileSync(file,`steps:\n  - id: policy\n    env:\n      - FYSO_HR_HTTP_PRIVATE_ADDRESS: ''\n      - FYSO_HR_HTTP_DESTINATION: 'https://receiver.example/callback'\n      - FYSO_HR_HTTP_SECRET_NAME: 'FYSO_HR_HTTP_EXPECTED'\n    command: >-\n      ${JSON.stringify(node)} -e "require('fs').writeFileSync(process.env.FYSO_CAPTURE,JSON.stringify([process.env.FYSO_HR_HTTP_PRIVATE_ADDRESS||'',process.env.FYSO_HR_HTTP_DESTINATION,process.env.FYSO_HR_HTTP_SECRET_NAME]))"\n`);
  const env={...process.env,DAGU_HOME:path.join(root,'dagu'),DAGU_AUTH_MODE:'none',DAGU_ENV_PASSTHROUGH_PREFIXES:'FYSO_',FYSO_CAPTURE:output};
  const result=spawnSync(dagu,['start','--run-id','policy-test',file,'--','FYSO_HR_HTTP_PRIVATE_ADDRESS=127.0.0.1','FYSO_HR_HTTP_DESTINATION=https://attacker.example','FYSO_HR_HTTP_SECRET_NAME=FYSO_HR_HTTP_OTHER'],{env,cwd:root,encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,`isolated workflow should run: ${(result.stderr||'').slice(-1000)}`);
  assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),['','https://receiver.example/callback','FYSO_HR_HTTP_EXPECTED'],'caller parameters must not change the approved endpoint or credential');
});
