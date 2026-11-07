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
  const run=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',env:{HOME:home,PATH:`${bin}:/usr/bin:/bin`,FYSO_PROJECT:'demo',MISE_EXE:'/opt/mise'}});
  const calls=()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n'):[];
  const desktop=path.join(home,'Library/Application Support/Claude/claude_desktop_config.json');
  try {fn({home,run,calls,desktop});} finally {fs.rmSync(home,{recursive:true,force:true});}
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
