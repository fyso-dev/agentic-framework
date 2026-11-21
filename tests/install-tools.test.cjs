// install_tools (lib.sh): a real `mise install` only when a pinned tool is missing.
// Confined panel steps (D93) cannot write mise's shims, so a no-op install must not run.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {spawnSync}=require('node:child_process');
const lib=path.resolve(__dirname,'../template/framework/scripts/lib.sh');

function run(missing) {
  const bin=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-mise-')), log=path.join(bin,'calls');
  // A fake mise: `--dry-run-code` exits 1 when something is missing; every call is logged.
  fs.writeFileSync(path.join(bin,'mise'),`#!/bin/sh\necho "MISE_YES=\${MISE_YES-} $*" >> ${JSON.stringify(log)}\n[ "$2" = --dry-run-code ] && exit ${missing?1:0}\nexit 0\n`,{mode:0o755});
  try {
    const result=spawnSync('/bin/bash',['-c',`source ${JSON.stringify(lib)}; install_tools`],
      {env:{...process.env,PATH:bin+path.delimiter+process.env.PATH},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    return fs.readFileSync(log,'utf8').trim().split('\n');
  } finally { fs.rmSync(bin,{recursive:true,force:true}); }
}

test('nothing missing: only the dry run, no install',()=>{
  assert.deepEqual(run(false),['MISE_YES= install --dry-run-code']);
});

test('a missing tool: the dry run, then a real install',()=>{
  assert.deepEqual(run(true),['MISE_YES= install --dry-run-code','MISE_YES=1 install']);
});
