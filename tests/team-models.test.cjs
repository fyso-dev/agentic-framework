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

test('runtime repair touches only the model of live bots and preserves missing bots',async()=>{
  const http=require('node:http');
  const live=[{name:'Run Operator',modelSelection:{instanceId:'codex',model:'gpt-5.4-mini'}},
              {name:'Workflow Architect',modelSelection:{instanceId:'codex',model:'gpt-6-luna'}}];
  const srv=http.createServer((q,r)=>{r.setHeader('Content-Type','application/json');r.end(JSON.stringify({bots:live}));});
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-runtime-'));
  try {
    fs.writeFileSync(path.join(dir,'models.json'),JSON.stringify(models));
    fs.writeFileSync(path.join(dir,'rendered.yaml'),`version: 1
defaults:
  cwd: /p
bots:
  - name: Workflow Architect
    model: codex/gpt-6.1-sol
    soul: declared soul
  - name: Builder
    model: codex/gpt-6.1-sol
    soul: builder soul
`);
    const bin=path.join(dir,'bin');fs.mkdirSync(bin);
    fs.symlinkSync(path.resolve(__dirname,'../template/framework/panel/node_modules/yaml/bin.mjs'),path.join(bin,'yaml'));
    const {spawn}=require('node:child_process');
    const out=await new Promise(res=>{const c=spawn(process.execPath,[script,'runtime',path.join(dir,'rendered.yaml'),path.join(dir,'out')],
      {env:{...process.env,PATH:`${bin}:${process.env.PATH}`,FYSO_MODELS_JSON:path.join(dir,'models.json'),FYSO_OMB_PORT:String(srv.address().port)}});
      let o='';c.stdout.on('data',d=>o+=d);c.stderr.on('data',d=>o+=d);c.on('close',code=>res({code,o}));});
    assert.equal(out.code,0,out.o);
    assert.match(out.o,/Run Operator": codex\/gpt-5.4-mini → codex\/gpt-6.1-sol \(model only\)/);
    assert.doesNotMatch(out.o,/Builder/);
    // Workflow Architect exists natively with a valid model: its declared soul/model are NOT replayed.
    const m=fs.readFileSync(path.join(dir,'out/models.yaml'),'utf8');
    assert.equal(m.trim(),'version: 1\nbots:\n  - name: Run Operator\n    model: codex/gpt-6.1-sol');
    assert.equal(fs.existsSync(path.join(dir,'out/create.yaml')),false);assert.doesNotMatch(m,/soul|cwd/);
  } finally {srv.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Pi model repair never silently changes a bot to another provider',()=>{
  const {repair}=require(script);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-pi-model-'));
  try {
    const file=path.join(dir,'team.yaml');
    const original='version: 1\nbots:\n  - name: Test\n    model: pi/openai-codex/retired\n';
    fs.writeFileSync(file,original);
    const engines=new Map([['pi',{default:'github-copilot/default',ids:new Set(['github-copilot/default','openai-codex/gpt-6-luna'])}]]);
    assert.deepEqual(repair(file,engines),[]);
    assert.equal(fs.readFileSync(file,'utf8'),original);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
