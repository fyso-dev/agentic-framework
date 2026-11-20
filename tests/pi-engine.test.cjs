const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const wrapper=path.resolve(__dirname,'../template/framework/bin/pi');

test('project Pi wrapper disables personal discovery and preserves native OMB arguments',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-pi-wrapper-'));
  try {
    const fake=path.join(dir,'pi');
    fs.writeFileSync(fake,'#!/bin/sh\nprintf "%s\\n" "$@"\n',{mode:0o755});
    const result=spawnSync('bash',[wrapper,'--mode','rpc','--no-session','-e','/tmp/omb-extension.ts'],{encoding:'utf8',env:{PATH:process.env.PATH,FYSO_PI_EXEC:fake}});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(result.stdout.trim().split('\n'),['--no-mcp','--no-extensions','--no-skills','--no-prompt-templates','--no-themes','--no-context-files','--mode','rpc','--no-session','-e','/tmp/omb-extension.ts']);
    const missing=spawnSync('bash',[wrapper],{encoding:'utf8',env:{PATH:process.env.PATH}});
    assert.notEqual(missing.status,0);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('Pi receives only its current OMB origin from the native per-turn agents mount',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-pi-origin-'));
  try {
    const fake=path.join(dir,'pi'),config=path.join(dir,'mcp.json');
    fs.writeFileSync(fake,'#!/bin/sh\nprintf "%s\\n" "$@"\n',{mode:0o755});
    const run=()=>spawnSync('bash',[wrapper,'--mode','rpc'],{encoding:'utf8',env:{PATH:process.env.PATH,FYSO_PI_EXEC:fake,OMB_MCP_CONFIG:config}});
    const write=(bot,thread)=>fs.writeFileSync(config,JSON.stringify({mcpServers:{agents:{env:{OMB_GATE_NAME:'agents',OMB_GATE_UPSTREAM:JSON.stringify({env:{OMB_BOT_ID:bot,OMB_THREAD_ID:thread,OMB_COMMS_TOKEN:'SECRET-CANARY'}})}}}}));
    write('bot-one','thread-one');const first=run();assert.equal(first.status,0);assert.match(first.stdout,/--append-system-prompt/);assert.match(first.stdout,/"bot":"bot-one","task":"thread-one"/);assert.doesNotMatch(first.stdout,/SECRET-CANARY/);
    write('bot-two','thread-two');const second=run();assert.match(second.stdout,/"bot":"bot-two","task":"thread-two"/);assert.doesNotMatch(second.stdout,/bot-one|thread-one/);
    write('bot-one','bad thread');const invalid=run();assert.equal(invalid.status,0);assert.doesNotMatch(invalid.stdout,/--append-system-prompt|SECRET-CANARY/);
    fs.writeFileSync(config,JSON.stringify({mcpServers:{dagu:{env:{OMB_BOT_ID:'bot-one',OMB_THREAD_ID:'thread-one'}}}}));
    const absent=run();assert.equal(absent.status,0);assert.doesNotMatch(absent.stdout,/--append-system-prompt/);
    fs.writeFileSync(config,JSON.stringify({mcpServers:{agents:{env:{OMB_GATE_NAME:'not-agents',OMB_GATE_UPSTREAM:JSON.stringify({env:{OMB_BOT_ID:'bot-one',OMB_THREAD_ID:'thread-one'}})}}}}));
    const wrongGate=run();assert.equal(wrongGate.status,0);assert.doesNotMatch(wrongGate.stdout,/--append-system-prompt/);
    fs.writeFileSync(config,'{broken');const broken=run();assert.equal(broken.status,0);assert.doesNotMatch(broken.stdout,/--append-system-prompt/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('project OMB startup selects the isolated Pi wrapper and filters inherited secrets',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-pi-omb-'));
  try {
    const scripts=path.join(dir,'framework/scripts'),frameworkBin=path.join(dir,'framework/bin'),tools=path.join(dir,'tools');
    fs.mkdirSync(scripts,{recursive:true});fs.mkdirSync(frameworkBin,{recursive:true});fs.mkdirSync(tools);
    const source=path.resolve(__dirname,'../template/framework');
    for(const name of ['lib.sh','run-omb.sh','web-origin.cjs','brand.cjs'])fs.copyFileSync(path.join(source,'scripts',name),path.join(scripts,name));
    // run-omb.sh installs the project identity (D92) before starting OMB.
    fs.cpSync(path.join(source,'brand'),path.join(dir,'framework/brand'),{recursive:true});
    fs.copyFileSync(wrapper,path.join(frameworkBin,'pi'));fs.chmodSync(path.join(frameworkBin,'pi'),0o755);
    fs.writeFileSync(path.join(tools,'pi'),'#!/bin/sh\nprintf "REAL_PI_ARGS=%s\\n" "$*"\n',{mode:0o755});
    fs.writeFileSync(path.join(tools,'openmausbot'),'#!/bin/sh\nprintf "RESOLVED_PI=%s\\n" "$(command -v pi)"\nprintf "CANARY=%s\\n" "${FYSO_TEST_SECRET-unset}"\npi --version\n',{mode:0o755});
    const env={...process.env,PATH:`${tools}:${process.env.PATH}`,FYSO_ROOT:dir,FYSO_DATA:path.join(dir,'data'),FYSO_OMB_PORT:'32104',FYSO_OMB_WEBHOOK_PORT:'32105',FYSO_HTTP_PORT:'32100',FYSO_DAGU_PORT:'32101',FYSO_ADMIN_USER:'fixture',FYSO_ADMIN_PASSWORD:'fixture',FYSO_WEB_DOMAIN:'fixture.localhost',FYSO_TEST_SECRET:'must-not-leak',FYSO_CONFINE:'off'};
    const result=spawnSync('bash',[path.join(scripts,'run-omb.sh')],{encoding:'utf8',env});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,new RegExp(`RESOLVED_PI=${frameworkBin.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/pi`));
    assert.match(result.stdout,/CANARY=unset/);
    assert.match(result.stdout,/REAL_PI_ARGS=--no-mcp --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files --version/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
