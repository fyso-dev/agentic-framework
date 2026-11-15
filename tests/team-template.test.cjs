// Department templates (D82): omb-team/1 normalize, digest, validate, propose, files and extension slot.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const t=require('../template/framework/scripts/team-template.cjs');
const yaml=require('yaml');

const home=['','Users','someone','proj'].join('/');
const EXPORT=`# Written by openmausbot team export on 2026-11-15.
version: 1
teams:
  - name: Ventas
    brief: Vendemos juntos.
  - name: Soporte
    brief: Otro.
bots:
  - name: Jefa
    team: Ventas
    chief: true
    manages: [Vendedor]
    soul: Lidera.
    model: claude/a
    cwd: ${home}
    skills:
      - file: skills/jefa/tono/SKILL.md
  - name: Vendedor
    team: Ventas
    soul: Vende.
    model: claude/a
    approval: ask
    skills:
      - file: skills/vendedor/tono/SKILL.md
      - file: skills/vendedor/Cierre Rapido/SKILL.md
        enabled: false
  - name: Soportista
    team: Soporte
    model: claude/a
rooms:
  - name: Mesa de ventas
    team: Ventas
    members: [Jefa, Vendedor]
  - name: Mesa soporte
    team: Soporte
    members: [Soportista]
`;
function exportDir() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'omb-export-'));
  for(const file of ['skills/jefa/tono/SKILL.md','skills/vendedor/tono/SKILL.md','skills/vendedor/Cierre Rapido/SKILL.md']) {
    fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),`---\nname: x\n---\n${file}\n`);
  }
  return dir;
}
const sample=()=>{const dir=exportDir();try{return t.normalize(EXPORT,'ventas',{dir});}finally{fs.rmSync(dir,{recursive:true,force:true});}};

test('normalize keeps one department, drops cwd, chief and manages, and rewrites skills',()=>{
  const pkg=sample();
  assert.equal(pkg.formato,'omb-team/1');assert.equal(pkg.departamento,'Ventas');
  const team=yaml.parse(pkg.team);
  assert.deepEqual(team.teams,[{name:'Ventas',brief:'Vendemos juntos.'}]);
  assert.deepEqual(team.bots.map(b=>b.name),['Jefa','Vendedor']);
  assert.deepEqual(team.rooms.map(r=>r.name),['Mesa de ventas']);
  for(const bot of team.bots) for(const key of ['cwd','chief','manages']) assert.equal(bot[key],undefined);
  assert.deepEqual(team.bots[1].skills,[{file:'skills/vendedor/tono/SKILL.md'},{file:'skills/vendedor/cierre-rapido/SKILL.md',enabled:false}]);
  assert.deepEqual(pkg.skills.map(s=>s.path),['skills/jefa/tono/SKILL.md','skills/vendedor/cierre-rapido/SKILL.md','skills/vendedor/tono/SKILL.md']);
  assert.match(pkg.skills[1].contenido,/Cierre Rapido/);
  assert.doesNotMatch(pkg.team,/Written by|Users/);
  assert.throws(()=>t.normalize(EXPORT,'Marketing',{readSkill:()=>''}),/department_not_found/);
  assert.throws(()=>t.normalize(EXPORT.replace('skills/jefa/tono/SKILL.md','../../etc/tono/SKILL.md'),'Ventas',{dir:exportDir()}),/unsafe_path/);
});

test('digest is the SHA-256 of canonical JSON, independent of key and skill order',()=>{
  const pkg=sample(),d=t.digest(pkg);
  assert.match(d,/^[a-f0-9]{64}$/);
  const reordered={skills:[...pkg.skills].reverse().map(s=>({contenido:s.contenido,path:s.path})),team:pkg.team,departamento:pkg.departamento,formato:pkg.formato};
  assert.equal(t.digest(reordered),d);
  assert.notEqual(t.digest({...pkg,team:pkg.team.replace('Vende.','Vende mucho.')}),d);
  const dir=exportDir();try{assert.equal(t.digest(t.normalize(EXPORT.replace(/^# .*\n/,'# Written on another day\n'),'Ventas',{dir})),d);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('validate checks format, size, skill count, one department and safe paths',()=>{
  const pkg=sample();
  assert.doesNotThrow(()=>t.validate(pkg));
  assert.throws(()=>t.validate({...pkg,formato:'omb-team/2'}),/unsupported_format/);
  assert.throws(()=>t.validate({...pkg,skills:[...pkg.skills,{path:'skills/a/big/SKILL.md',contenido:'x'.repeat(t.MAX_BYTES)}]}),/too_large/);
  const many=Array.from({length:65},(_,i)=>({path:`skills/a/s${i}/SKILL.md`,contenido:'x'}));
  assert.throws(()=>t.validate({...pkg,skills:many}),/too_many_skills/);
  const two=yaml.parse(pkg.team);two.teams.push({name:'Soporte'});
  assert.throws(()=>t.validate({...pkg,team:yaml.stringify(two)}),e=>e.detail==='one department');
  assert.throws(()=>t.validate({...pkg,skills:[{path:'skills/../x/SKILL.md',contenido:''}]}),/unsafe_path/);
  assert.throws(()=>t.validate({...pkg,skills:pkg.skills.slice(1)}),/unsafe_path/,'every referenced skill file travels');
  const cwd=yaml.parse(pkg.team);cwd.bots[0].cwd='${FYSO_ROOT}';
  assert.throws(()=>t.validate({...pkg,team:yaml.stringify(cwd)}),e=>/cwd/.test(e.detail));
  const host=yaml.parse(pkg.team);host.bots[0].soul=`See ${home}/notes`;
  assert.throws(()=>t.validate({...pkg,team:yaml.stringify(host)}),e=>e.detail==='host path');
});

const CURRENT=`# Project bots.
version: 1

defaults:
  cwd: \${FYSO_ROOT} # project root

teams:
  - name: Ventas
    brief: { file: \${FYSO_ROOT}/project/bots/old.md }

bots:
  - name: MausBot
    chief: true
    soul: { file: \${FYSO_ROOT}/framework/bots/souls/chief.md }
    model: claude/a
  # the old sales bot
  - name: Viejo
    team: Ventas
    model: claude/a
  - name: Builder
    model: claude/b

rooms:
  - name: Mesa de ventas
    team: Ventas
    members: [Viejo]
  - name: General
    members: [Builder]
`;

test('propose replaces the department in place and keeps everything else',()=>{
  const text=t.propose(CURRENT,sample(),'ventas');
  assert.match(text,/^# Project bots\./);assert.match(text,/cwd: \$\{FYSO_ROOT\} # project root/);
  assert.match(text,/soul: \{ file: \$\{FYSO_ROOT\}\/framework\/bots\/souls\/chief\.md \}/);
  const doc=yaml.parse(text.replaceAll('${FYSO_ROOT}','ROOT'));
  assert.deepEqual(doc.teams,[{name:'Ventas',brief:'Vendemos juntos.'}]);
  assert.deepEqual(doc.bots.map(b=>b.name),['MausBot','Jefa','Vendedor','Builder']);
  assert.equal(doc.bots[1].cwd,undefined,'department bots inherit defaults.cwd');
  assert.equal(doc.bots[1].chief,undefined);
  assert.deepEqual(doc.bots[2].skills[0],{file:'ROOT/project/bots/teams/ventas/skills/vendedor/tono/SKILL.md'});
  assert.deepEqual(doc.rooms.map(r=>[r.name,r.members]),[['Mesa de ventas',['Jefa','Vendedor']],['General',['Builder']]]);
  assert.match(text,/members: \[ Jefa, Vendedor \]/);
});

test('propose adds a new department before bots and rejects names used elsewhere',()=>{
  const bare='version: 1\nbots:\n  - name: Builder\n    model: claude/b\n';
  const text=t.propose(bare,sample(),'ventas');
  assert.deepEqual(Object.keys(yaml.parse(text)),['version','teams','bots','rooms']);
  assert.throws(()=>t.propose(bare.replace('Builder','vendedor'),sample(),'ventas'),e=>e.message==='name_taken'&&e.detail==='Vendedor');
  const room='version: 1\nbots: []\nrooms:\n  - name: Mesa de ventas\n    team: Otro\n    members: []\n';
  assert.throws(()=>t.propose(room,sample(),'ventas'),/name_taken/);
  assert.throws(()=>t.propose(bare,sample(),'../x'),/invalid_slug/);
});

function repo() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-team-'));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
  git('init','-q');git('config','user.email','t@example.com');git('config','user.name','t');
  fs.mkdirSync(path.join(root,'project/bots'),{recursive:true});
  fs.writeFileSync(path.join(root,'project/bots/team.yaml'),CURRENT);
  fs.mkdirSync(path.join(root,'project/bots/teams/ventas/skills/stale'),{recursive:true});
  fs.writeFileSync(path.join(root,'project/bots/teams/ventas/skills/stale/SKILL.md'),'old');
  git('add','-A');git('commit','-qm','init');
  return {root,git};
}

test('writeFiles replaces the department skills and commits only that directory',()=>{
  const {root,git}=repo();
  try {
    fs.writeFileSync(path.join(root,'project/bots/team.yaml'),CURRENT+'# local edit\n');
    const commit=t.writeFiles(sample(),'ventas',{root});
    assert.match(commit,/^[a-f0-9]{40}$/);
    assert.deepEqual(git('show','--name-status','--format=','HEAD').trim().split('\n').sort(),[
      'A\tproject/bots/teams/ventas/skills/jefa/tono/SKILL.md','A\tproject/bots/teams/ventas/skills/vendedor/cierre-rapido/SKILL.md',
      'A\tproject/bots/teams/ventas/skills/vendedor/tono/SKILL.md','D\tproject/bots/teams/ventas/skills/stale/SKILL.md']);
    assert.match(git('status','--porcelain'),/ M project\/bots\/team.yaml/,'the team file is the person\'s to apply');
    assert.equal(t.writeFiles(sample(),'ventas',{root}),null,'same package, nothing to commit');
    fs.writeFileSync(path.join(root,'project/bots/teams/ventas/skills/jefa/tono/SKILL.md'),'edited');
    assert.throws(()=>t.writeFiles(sample(),'ventas',{root}),/uncommitted_changes/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('extension templates are listed and imported from the teams slot',()=>{
  const {root,git}=repo();
  try {
    const pkg=sample(),dir=path.join(root,'extensions/demo/teams/ventas');
    fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'team.yaml'),pkg.team);
    for(const skill of pkg.skills){fs.mkdirSync(path.dirname(path.join(dir,skill.path)),{recursive:true});fs.writeFileSync(path.join(dir,skill.path),skill.contenido);}
    fs.mkdirSync(path.join(root,'extensions/demo/teams/broken'));fs.writeFileSync(path.join(root,'extensions/demo/teams/broken/team.yaml'),'version: 1\nbots: []\n');
    git('add','-A');git('commit','-qm','ext');
    const [broken,ventas]=t.templates({root});
    assert.deepEqual({...ventas,brief:undefined},{source:'extension:demo/ventas',extension:'demo',slug:'ventas',departamento:'Ventas',brief:undefined,
      bots:[{name:'Jefa'},{name:'Vendedor'}],rooms:['Mesa de ventas'],skills:3,digest:t.digest(pkg)});
    assert.equal(broken.slug,'broken');assert.match(broken.error,/invalid_package/);
    const result=t.importPackage({source:'extension:demo/ventas',root});
    assert.equal(result.slug,'ventas');assert.equal(result.digest,t.digest(pkg));assert.match(result.commit,/^[a-f0-9]{40}$/);
    assert.match(result.proposedTeamYaml,/teams\/ventas\/skills\/jefa\/tono\/SKILL\.md/);
    assert.equal(fs.readFileSync(path.join(root,'project/bots/team.yaml'),'utf8'),CURRENT,'the team file is only proposed');
    assert.throws(()=>t.importPackage({source:'extension:demo/../x',root}),/invalid_source/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
