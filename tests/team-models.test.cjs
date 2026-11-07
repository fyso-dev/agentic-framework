// Retired models are moved to the engine's default before OMB sees the team (D37).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {spawnSync}=require('node:child_process');
const script=path.resolve(__dirname,'../template/framework/scripts/team-models.cjs');

const models={instances:[
  {instanceId:'codex',snapshot:{state:'available'},models:{default:'gpt-6.1-sol',options:[{id:'gpt-6.1-sol'},{id:'gpt-6-luna'}]}},
  {instanceId:'claude',snapshot:{state:'available'},models:{default:'claude-sonnet-5',options:[{id:'claude-sonnet-5'},{id:'claude-haiku-4-5'}]}},
  {instanceId:'kimi',snapshot:{state:'unavailable'},models:{default:'k3',options:[{id:'k3'}]}}]};
const team=`version: 1
defaults:
  cwd: \${FYSO_ROOT}            # loads .mcp.json
bots:
  - name: Workflow Architect
    model: codex/gpt-6.1-sol
    soul: { file: \${FYSO_ROOT}/framework/bots/souls/workflow-architect.md }
  - name: "Run Operator"
    model: codex/gpt-5.4-mini   # fast
  - name: Helper
    model: "claude/claude-haiku-3"
  - name: Other
    model: kimi/k2            # engine not signed in: leave alone
`;

function sandbox(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-models-'));
  fs.writeFileSync(path.join(dir,'models.json'),JSON.stringify(models));
  fs.writeFileSync(path.join(dir,'team.yaml'),team);
  const run=(...a)=>spawnSync(process.execPath,[script,path.join(dir,'team.yaml'),...a],{encoding:'utf8',env:{...process.env,FYSO_MODELS_JSON:path.join(dir,'models.json')}});
  try{fn({dir,run,read:()=>fs.readFileSync(path.join(dir,'team.yaml'),'utf8')});}finally{fs.rmSync(dir,{recursive:true,force:true});}
}

test('only models the engine no longer offers change, to its default; the rest stays byte for byte',()=>sandbox(({run,read})=>{
  const r=run();assert.equal(r.status,0,r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'),[
    'bot "Run Operator": codex/gpt-5.4-mini → codex/gpt-6.1-sol (no longer offered by codex)',
    'bot "Helper": claude/claude-haiku-3 → claude/claude-sonnet-5 (no longer offered by claude)']);
  assert.equal(read(),team.replace('codex/gpt-5.4-mini   # fast','codex/gpt-6.1-sol   # fast').replace('"claude/claude-haiku-3"','"claude/claude-sonnet-5"'));
  assert.equal(run().stdout,'');   // idempotent
}));

test('--check reports without writing',()=>sandbox(({run,read})=>{
  assert.match(run('--check').stdout,/Run Operator/);assert.equal(read(),team);
}));
