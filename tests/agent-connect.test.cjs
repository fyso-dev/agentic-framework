// agent:connect (D36) against a throwaway HOME and fake codex/claude CLIs.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {spawnSync}=require('node:child_process');
const script=path.resolve(__dirname,'../template/framework/scripts/agent-connect.cjs');
const root=path.resolve(__dirname,'../template');

function sandbox(fn) {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-connect-')), bin=path.join(home,'bin'), log=path.join(home,'calls.log');
  fs.mkdirSync(bin);
  for (const cli of ['codex','claude']) fs.writeFileSync(path.join(bin,cli),`#!/bin/sh\necho "${cli} $*" >> "${log}"\n`,{mode:0o755});
  fs.writeFileSync(path.join(bin,'open'),`#!/bin/sh\necho "open $*" >> "${log}"\n`,{mode:0o755});
  const run=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',env:{HOME:home,PATH:`${bin}:/usr/bin:/bin`,FYSO_PROJECT:'demo',FYSO_PROJECT_NAME:'Mi Demo',MISE_EXE:'/opt/mise',FYSO_OPEN:path.join(bin,'open')}});
  const calls=()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n'):[];
  const desktop=path.join(home,'Library/Application Support/Claude/claude_desktop_config.json');
  try {fn({home,run,calls,desktop,bin});} finally {fs.rmSync(home,{recursive:true,force:true});}
}

test('Claude Desktop: merges fyso-<slug> keeping other settings, backs up, and removes it again',()=>sandbox(({run,desktop})=>{
  fs.mkdirSync(path.dirname(desktop),{recursive:true});
  fs.writeFileSync(desktop,JSON.stringify({preferences:{x:1},mcpServers:{other:{command:'a'}}}));
  const r=run('connect','claude-desktop');assert.equal(r.status,0,r.stdout+r.stderr);
  const d=JSON.parse(fs.readFileSync(desktop,'utf8'));
  assert.deepEqual(d.preferences,{x:1});assert.deepEqual(d.mcpServers.other,{command:'a'});
  assert.deepEqual(d.mcpServers['fyso-demo'],{command:'/opt/mise',args:['-C',root,'exec','--','node','framework/scripts/fyso-mcp.cjs']});
  assert.ok(fs.existsSync(desktop+'.fyso-backup'));
  assert.equal(run('connect','claude-desktop').status,0);   // idempotent
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(desktop,'utf8')).mcpServers).length,2);
  assert.equal(run('disconnect','claude-desktop').status,0);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(desktop,'utf8')).mcpServers),['other']);
}));

test('Codex and Claude Code use their own CLIs, replacing a previous entry, never the plain "fyso" name',()=>sandbox(({run,calls})=>{
  const r=run('connect','codex','claude-code');assert.equal(r.status,0,r.stdout+r.stderr);
  const launch=`/opt/mise -C ${root} exec -- node framework/scripts/fyso-mcp.cjs`;
  assert.deepEqual(calls(),[
    'codex mcp remove fyso-demo',`codex mcp add fyso-demo -- ${launch}`,
    'claude mcp remove --scope user fyso-demo',`claude mcp add --scope user fyso-demo -- ${launch}`]);
  assert.ok(!calls().some(c=>/ fyso( |$)/.test(c)));
}));

test('unknown targets are rejected; --list reports what is installed',()=>sandbox(({run})=>{
  const bad=run('connect','cursor');assert.equal(bad.status,1);assert.match(bad.stderr,/unknown target: cursor/);
  const list=run('--list');assert.equal(list.status,0);assert.match(list.stdout,/^codex\tfound\tdesktop/m);assert.match(list.stdout,/^claude-code\tfound\tcli/m);
}));

test('open: Codex gets a new thread in the project folder, with the first prompt typed in',()=>sandbox(({run,calls})=>{
  assert.equal(run('open','codex').status,0);
  const url=new URL(calls().at(-1).replace(/^open /,''));
  assert.equal(url.protocol,'codex:');assert.equal(url.host+url.pathname,'threads/new');
  assert.equal(url.searchParams.get('path'),root);
  assert.match(url.searchParams.get('prompt'),/fyso-demo.*"Mi Demo".*fyso_status/);
  assert.equal(run('open','cursor').status,1);
}));


test('Dagu adapter validates parameters and uses native connector in an isolated home',()=>sandbox(({home,bin,calls})=>{
  const adapter=path.resolve(__dirname,'../template/framework/scripts/agent-connect-action.cjs');
  const run=(target,mode='connect')=>spawnSync(process.execPath,[adapter],{encoding:'utf8',env:{HOME:home,PATH:`${bin}:/usr/bin:/bin`,FYSO_PROJECT:'demo',MISE_EXE:'/opt/mise',TARGET:target,MODE:mode}});
  assert.equal(run('codex; touch injected').status,1);
  assert.equal(run('codex','delete').status,1);
  assert.equal(run('claude-code','open').status,1);   // a CLI has no conversation to open
  assert.deepEqual(calls(),[]);
  const connected=run('codex');assert.equal(connected.status,0,connected.stderr);
  assert.equal(JSON.parse(connected.stdout).target,'codex');
  assert.match(calls().at(-1),/^codex mcp add fyso-demo/);
  const disconnected=run('codex','disconnect');assert.equal(disconnected.status,0,disconnected.stderr);
  assert.equal(JSON.parse(disconnected.stdout).mode,'disconnect');
  fs.writeFileSync(path.join(bin,'codex'),'#!/bin/sh\nexit 9\n',{mode:0o755});
  assert.equal(run('codex').status,1);
}));

test('status reports installed and connected agents; the adapter passes it through and opens desktop apps',()=>sandbox(({home,bin,run,desktop,calls})=>{
  const read=()=>{const r=run('status');assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
  let st=read();assert.equal(st.server,'fyso-demo');
  // Claude Desktop's found() also looks at /Applications, outside the sandbox: only its connection is asserted.
  assert.deepEqual(st.agents.map(a=>[a.id,a.id==='claude-desktop'?null:a.found,a.connected]),[['claude-desktop',null,false],['codex',true,false],['claude-code',true,false]]);
  assert.equal(run('connect','claude-desktop').status,0);
  fs.mkdirSync(path.join(home,'.codex'),{recursive:true});
  fs.writeFileSync(path.join(home,'.codex/config.toml'),'[mcp_servers.other]\ncommand = "x"\n\n[mcp_servers."fyso-demo"]\ncommand = "y"\n');
  fs.writeFileSync(path.join(home,'.claude.json'),JSON.stringify({mcpServers:{'fyso-demo-old':{}}}));
  st=read();assert.deepEqual(st.agents.map(a=>[a.id,a.found,a.connected]),[['claude-desktop',true,true],['codex',true,true],['claude-code',true,false]]);
  assert.ok(fs.existsSync(desktop));
  const adapter=path.resolve(__dirname,'../template/framework/scripts/agent-connect-action.cjs');
  const env={HOME:home,PATH:`${bin}:/usr/bin:/bin`,FYSO_PROJECT:'demo',MISE_EXE:'/opt/mise',FYSO_OPEN:path.join(bin,'open')};
  const status=spawnSync(process.execPath,[adapter],{encoding:'utf8',env:{...env,MODE:'status'}});
  assert.equal(status.status,0,status.stderr);
  const out=JSON.parse(status.stdout);assert.equal(out.mode,'status');assert.equal(out.agents.length,3);
  const open=spawnSync(process.execPath,[adapter],{encoding:'utf8',env:{...env,MODE:'open',TARGET:'codex'}});
  assert.equal(open.status,0,open.stderr);assert.match(calls().at(-1),/^open codex:\/\/threads\/new/);
}));
