const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {collect}=require('../template/framework/scripts/bot-versioning.cjs');
const yaml=require('../template/framework/panel/node_modules/yaml');
test('inventory uses committed definitions, never uncommitted file presence',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bot-versioning-'));
  const git=args=>execFileSync('git',args,{cwd:root,stdio:'pipe',env:{...process.env,GIT_AUTHOR_NAME:'Test',GIT_AUTHOR_EMAIL:'test@example.invalid',GIT_COMMITTER_NAME:'Test',GIT_COMMITTER_EMAIL:'test@example.invalid'}});
  try{
    git(['init','-q']);
    for(const folder of ['project/bots','state/bots'])fs.mkdirSync(path.join(root,folder),{recursive:true});
    const project=path.join(root,'project/bots/team.yaml');
    fs.writeFileSync(project,'bots:\n  - name: Declared\n');
    fs.writeFileSync(path.join(root,'state/bots/team.yaml'),'bots:\n  - name: Saved only\n  - name: Declared\n');
    git(['add','.']);git(['commit','-qm','fixture']);
    fs.appendFileSync(project,'  - name: Uncommitted\n');
    const result=collect(root,yaml);
    assert.ok(result.commit);
    assert.deepEqual(result.bots.find(b=>b.name==='Declared'),{name:'Declared',team:'',project:true,snapshot:true});
    assert.equal(result.bots.find(b=>b.name==='Saved only').project,false);
    assert.ok(!result.bots.some(b=>b.name==='Uncommitted'));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
