const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validatePatch,guardTarget}=require('../template/framework/scripts/bot-architect.cjs');
test('one native profile only, safe local cwd and explicit approval',()=>{
  assert.equal(validatePatch({name:'Operación',cwd:'${FYSO_ROOT}',approval:'ask'},'/project').cwd,'${FYSO_ROOT}');
  for(const bad of [{engines:{}},{chief:true},{cwd:'/elsewhere'},{name:'../outside'},{computer:'local'},{model:'guessed'}])assert.throws(()=>validatePatch(bad,'/project'));
});
test('deletion protects framework and Chief identities and active bots',()=>{
  for(const bot of [{name:'MausBot'},{name:'Builder'},{name:'Custom',chiefOfStaff:true},{name:'Custom',busy:true},{name:'Custom',waitingForTeammates:true},{name:'Custom',activity:'working'}])assert.throws(()=>guardTarget({id:'id',activity:'idle',...bot},'delete'));
  assert.doesNotThrow(()=>guardTarget({name:'Disposable',activity:'idle',busy:false,tasks:[]},'delete'));
  assert.doesNotThrow(()=>guardTarget({name:'New idle bot'},'delete'));
});
test('the architect cannot change itself and core identity cannot be renamed',()=>{
  assert.throws(()=>guardTarget({name:'Bot Architect'},'update'));
  assert.throws(()=>guardTarget({name:'Builder'},'update',{name:'Different'}));
  assert.doesNotThrow(()=>guardTarget({name:'Builder'},'update',{model:'codex/gpt-6.1-sol'}));
});
test('a bot can be placed in a team, never made a chief or manager (D81)',()=>{
  assert.equal(validatePatch({team:'  Equipo comercial '},'/project').team,'Equipo comercial');
  for(const bad of [{team:''},{team:'x'.repeat(61)},{team:'two\nlines'},{team:3},{manages:['Ventas']},{rooms:[]},{chief:true}])assert.throws(()=>validatePatch(bad,'/project'));
});

test('large department package is staged by digest without a large environment parameter', () => {
  const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
  const {stagePackage,stagedPackage}=require('../template/framework/scripts/bot-architect.cjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-package-stage-'));
  const pkg={formato:'omb-team/1',departamento:'Ventas',team:'version: 1\nteams:\n  - name: Ventas\nbots:\n  - name: A\n    team: Ventas\n    model: claude/a\n    skills:\n      - file: skills/a/guide/SKILL.md\n',skills:[{path:'skills/a/guide/SKILL.md',contenido:'x'.repeat(160000)}]};
  try {
    const bytes=Buffer.from(JSON.stringify(pkg));
    const {packageRef}=stagePackage(bytes,{FYSO_DATA:root});
    assert.match(packageRef,/^[a-f0-9]{64}$/);
    assert.deepEqual(stagedPackage(packageRef,path.join(root,'bot-architect')),pkg);
    fs.writeFileSync(path.join(root,'bot-architect/imports',packageRef),'tampered');
    assert.throws(()=>stagedPackage(packageRef,path.join(root,'bot-architect')),/integrity/);
    assert.throws(()=>stagedPackage('../secret',path.join(root,'bot-architect')),/invalid PACKAGE_REF/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('large package travels through stdin and a short reference into the import process', () => {
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync,spawnSync}=require('node:child_process');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-package-process-')), data=path.join(root,'.data'), bin=path.join(root,'bin');
  fs.mkdirSync(path.join(root,'project/bots'),{recursive:true});fs.mkdirSync(bin);
  fs.writeFileSync(path.join(root,'project/bots/team.yaml'),'version: 1\nbots: []\n');
  fs.writeFileSync(path.join(bin,'gitleaks'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'ignore'});git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');git('add','.');git('commit','-qm','initial');
  const pkg={formato:'omb-team/1',departamento:'Ventas',team:'version: 1\nteams:\n  - name: Ventas\nbots:\n  - name: A\n    team: Ventas\n    model: claude/a\n    skills:\n      - file: skills/a/guide/SKILL.md\n',skills:[{path:'skills/a/guide/SKILL.md',contenido:'x'.repeat(160000)}]};
  const script=require.resolve('../template/framework/scripts/bot-architect.cjs'), env={...process.env,FYSO_ROOT:root,FYSO_DATA:data,FYSO_OMB_PORT:'12345',PATH:bin+path.delimiter+process.env.PATH};
  try {
    const staged=spawnSync(process.execPath,[script,'stage-package'],{env,input:JSON.stringify(pkg),encoding:'utf8'});
    assert.equal(staged.status,0,staged.stderr);const ref=JSON.parse(staged.stdout).packageRef;
    const imported=spawnSync(process.execPath,[script],{env:{...env,OP:'team-import',PACKAGE_REF:ref},encoding:'utf8'});
    assert.equal(imported.status,0,imported.stderr);const result=JSON.parse(imported.stdout);
    assert.match(result.proposedTeamYaml,/revisions\/[a-f0-9]{64}\/skills\/a\/guide\/SKILL.md/);
    assert.equal(fs.readFileSync(path.join(root,'project/bots/teams/ventas/revisions',result.digest,'skills/a/guide/SKILL.md'),'utf8').length,160000);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
