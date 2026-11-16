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
  const nomodel=yaml.parse(pkg.team);delete nomodel.bots[0].model;
  assert.throws(()=>t.validate({...pkg,team:yaml.stringify(nomodel)}),e=>/model/.test(e.detail));
  // OMB fills a missing approval (full) or computer from the receiving project: the package states them.
  const bare=yaml.parse(pkg.team);delete bare.bots[0].approval;delete bare.bots[0].computer;
  const filled=yaml.parse(t.canonicalize({...pkg,team:yaml.stringify(bare)}).team).bots[0];
  assert.equal(filled.approval,'ask');assert.equal(filled.computer,'off');
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

test('extension templates are listed and imported from the teams slot',async()=>{
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
    const result=await t.importPackage(null,{source:'extension:demo/ventas',root,scan:false});
    assert.equal(result.currentTeamYaml,CURRENT);
    assert.equal(result.slug,'ventas');assert.equal(result.digest,t.digest(pkg));assert.match(result.commit,/^[a-f0-9]{40}$/);
    assert.match(result.proposedTeamYaml,/teams\/ventas\/skills\/jefa\/tono\/SKILL\.md/);
    assert.equal(fs.readFileSync(path.join(root,'project/bots/team.yaml'),'utf8'),CURRENT,'the team file is only proposed');
    await assert.rejects(t.importPackage(null,{source:'extension:demo/../x',root}),/invalid_source/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('departments lists the names team.yaml declares or uses, once each',()=>{
  const {root}=repo();
  try {assert.deepEqual(t.departments(root),['Ventas']);
    fs.writeFileSync(path.join(root,'project/bots/team.yaml'),'version: 1\nteams:\n  - name: Ventas\nbots:\n  - name: A\n    team: soporte\n  - name: B\n    team: VENTAS\nrooms:\n  - name: R\n    team: Mesa\n');
    assert.deepEqual(t.departments(root),['Ventas','soporte','Mesa']);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('exportDepartment always passes the explicit port and rejects an unknown department',async()=>{
  const dir=exportDir(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'omb-tmp-')),calls=[];
  const run=args=>{calls.push(args);const out=args[args.indexOf('--out')+1];
    if(args[args.indexOf('--team')+1]!=='Ventas')throw Object.assign(Error('x'),{stderr:'error: no team named "nope"'});
    fs.cpSync(dir,path.dirname(out),{recursive:true});fs.writeFileSync(out,EXPORT);};
  try {
    const result=await t.exportDepartment('Ventas',{port:'34704',tmp,run});
    assert.equal(result.digest,t.digest(sample()));
    assert.deepEqual(calls[0].slice(-2),['--port','34704']);
    await assert.rejects(t.exportDepartment('nope',{port:'34704',tmp,run}),e=>e.message==='omb_export_failed'&&/no team named/.test(e.detail));
    await assert.rejects(t.exportDepartment('Ventas',{port:'',tmp,run}),/omb_port_required/);
    assert.deepEqual(fs.readdirSync(path.join(tmp,'team-template')),[],'the export directory is removed');
  } finally {fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(tmp,{recursive:true,force:true});}
});

// What OMB writes after the proposal is applied: its own key order and bot order, `|-`
// text, each bot's skills copied beside the file under OMB's bot slug, the absolute cwd
// the project's defaults gave it and a dated comment.
function ombExport(teamYaml,department,root,out) {
  const doc=yaml.parse(teamYaml.replaceAll('${FYSO_ROOT}',root));
  const strip=v=>typeof v==='string'?v.replace(/\n+$/,''):v;
  const bots=doc.bots.filter(b=>b.team===department).reverse().map(b=>{
    const {name,team,title,soul,model,approval,computer,tools,skills,...rest}=b;
    return {name,team,...(title&&{title}),soul:strip(soul),model,approval,computer,cwd:root,...(tools&&{tools}),...rest,
      ...(skills&&{skills:skills.map(e=>{const rel=`skills/${name.toLowerCase().replace(/ /g,'-')}/${path.basename(path.dirname(e.file))}/SKILL.md`;
        fs.mkdirSync(path.dirname(path.join(out,rel)),{recursive:true});fs.copyFileSync(e.file,path.join(out,rel));return {...e,file:rel};})})};
  });
  const teams=doc.teams.filter(x=>x.name===department).map(x=>({...x,brief:strip(x.brief)}));
  const text=`# Written by openmausbot team export on 2027-01-01.\n${yaml.stringify({version:1,teams,bots,rooms:(doc.rooms||[]).filter(r=>r.team===department)})}`;
  fs.writeFileSync(path.join(out,'team.yaml'),text);return text;
}

test('round trip: a package imported, applied and exported again has the same digest',async()=>{
  // Hand-written like an extension's: its own key order, trailing newlines, a shared skill path.
  const P={formato:'omb-team/1',departamento:'Ventas',skills:[{path:'skills/shared/tono/SKILL.md',contenido:'---\nname: tono\n---\nCercano.\n'}],
    team:`version: 1
rooms:
  - members: [Vendedor, Jefa]
    name: Mesa de ventas
    team: Ventas
teams:
  - brief: |
      Vendemos juntos.
    name: Ventas
bots:
  - model: claude/a
    name: Vendedor
    team: Ventas
    soul: |
      Vende.
    skills:
      - file: skills/shared/tono/SKILL.md
  - name: Jefa
    team: Ventas
    approval: ask
    model: claude/a
    soul: Lidera.
    skills:
      - file: skills/shared/tono/SKILL.md
`};
  const {root}=repo(),out=fs.mkdtempSync(path.join(os.tmpdir(),'omb-roundtrip-'));
  try {
    const imported=await t.importPackage(P,{root,scan:false});
    assert.equal(imported.digest,t.digest(P));
    fs.writeFileSync(path.join(root,'project/bots/team.yaml'),imported.proposedTeamYaml);
    const text=ombExport(imported.proposedTeamYaml,'Ventas',root,out);
    const again=t.normalize(text,'Ventas',{dir:out});
    assert.equal(t.digest(again),t.digest(P));
    assert.deepEqual(again,t.canonicalize(P),'the export normalizes to exactly the canonical package');
    assert.deepEqual(t.canonicalize(again),again,'canonical form is a fixed point');
    assert.doesNotMatch(again.team,new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  } finally {fs.rmSync(root,{recursive:true,force:true});fs.rmSync(out,{recursive:true,force:true});}
});

test('a department without skills imports without a commit; a skill directory of another department is refused',async()=>{
  const {root,git}=repo();
  try {
    const plain={formato:'omb-team/1',departamento:'Soporte',skills:[],
      team:'version: 1\nteams:\n  - name: Soporte\nbots:\n  - name: Soportista\n    team: Soporte\n    model: claude/a\n'};
    const empty=await t.importPackage(plain,{root,scan:false});
    assert.equal(empty.commit,null);assert.equal(empty.slug,'soporte');
    assert.match(empty.proposedTeamYaml,/name: Soportista/);
    // Ventas is applied with its skills under teams/ventas; another department may not take that directory.
    const ventas=await t.importPackage(sample(),{root,scan:false});
    fs.writeFileSync(path.join(root,'project/bots/team.yaml'),ventas.proposedTeamYaml);git('commit','-qam','apply');
    const other={...plain,departamento:'Ventas.',team:plain.team.replaceAll('Soporte','Ventas.').replace('Soportista','Otro')};
    await assert.rejects(t.importPackage(other,{root,scan:false,slug:'ventas'}),err=>err.message==='slug_taken'&&/Ventas/.test(err.detail));
    assert.ok(fs.existsSync(path.join(root,'project/bots/teams/ventas/skills/jefa/tono/SKILL.md')),'the other department keeps its skills');
    // The same department may replace its own files.
    assert.equal((await t.importPackage(sample(),{root,scan:false})).commit,null);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
