// Marketplace catalogs (D31) against throwaway local git repos.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {spawnSync, execFileSync}=require('node:child_process');
const source=path.resolve(__dirname,'../template');
const git=(cwd,...args)=>execFileSync('git',['-c','user.name=t','-c','user.email=t@example.invalid',...args],{cwd,encoding:'utf8'});
function repo(dir,files,tags=[]) {
  fs.mkdirSync(dir,{recursive:true});
  for(const [file,text] of Object.entries(files))fs.writeFileSync(path.join(dir,file),text);
  git(dir,'init','-q');git(dir,'add','.');git(dir,'commit','-qm','init');
  for(const tag of tags)git(dir,'tag',tag);
  return dir;
}
function fixture(fn) {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-market-')), root=path.join(base,'project');
  fs.mkdirSync(root);
  fs.cpSync(path.join(source,'framework/scripts'),path.join(root,'framework/scripts'),{recursive:true});
  fs.mkdirSync(path.join(root,'bin'));
  fs.symlinkSync(path.join(source,'framework/panel/node_modules/yaml/bin.mjs'),path.join(root,'bin/yaml'));
  const env={...process.env,PATH:path.join(root,'bin')+path.delimiter+process.env.PATH};
  const put=(file,text)=>{const p=path.join(root,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
  const run=(...args)=>spawnSync(process.execPath,['framework/scripts/marketplace.cjs',...args],{cwd:root,env,encoding:'utf8'});
  try {fn({base,root,put,run});}finally{fs.rmSync(base,{recursive:true,force:true});}
}
const ext=(base,name,tags)=>repo(path.join(base,name),{'copier.yml':'_answers_file: x\n'},tags);
const catalog=(base,name,entries)=>repo(path.join(base,name),{'marketplace.yaml':JSON.stringify({name,extensions:entries})});

test('catalog lists entries with the highest version tag and install state',()=>fixture(({base,put,run})=>{
  const sample=ext(base,'ext-sample',['v1.2.0','v1.10.0','v1.9.3','nightly']);
  const empty=ext(base,'ext-empty',[]);
  const cat=catalog(base,'cat',[
    {id:'sample',src:sample,name:{es:'Ejemplo',en:'Sample'},description:'Demo',tags:['demo']},
    {id:'empty',src:empty}]);
  put('project/marketplaces.yaml',JSON.stringify([cat]));
  put('.copier-answers.ext-sample.yml','_commit: v1.2.0\n_src_path: '+sample+'\n');
  const result=run('json');assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);
  assert.deepEqual(data.catalogs,[{source:cat,name:'cat'}]);
  const [s,e]=data.extensions;
  assert.equal(s.latest,'v1.10.0');assert.equal(s.installed,true);assert.equal(s.version,'v1.2.0');assert.equal(s.update,true);
  assert.equal(s.name,'Ejemplo');assert.deepEqual(s.name_i18n,{es:'Ejemplo',en:'Sample'});assert.deepEqual(s.tags,['demo']);
  assert.equal(e.latest,null);assert.equal(e.installed,false);assert.equal(e.update,false);
}));

test('an unreachable catalog is reported without hiding the others; the first catalog wins an id',()=>fixture(({base,put,run})=>{
  const a=ext(base,'ext-a',['v1.0.0']), b=ext(base,'ext-b',['v2.0.0']);
  const first=catalog(base,'first',[{id:'dup',src:a}]), second=catalog(base,'second',[{id:'dup',src:b},{id:'other',src:b}]);
  put('project/marketplaces.yaml',JSON.stringify([path.join(base,'missing'),first,second]));
  const data=JSON.parse(run('json').stdout);
  assert.ok(data.catalogs[0].error);
  assert.deepEqual(data.extensions.map(e=>[e.id,e.catalog,e.latest]),[['dup','first','v1.0.0'],['other','second','v2.0.0']]);
  const resolved=run('resolve','dup');assert.equal(resolved.status,0,resolved.stderr);
  assert.equal(resolved.stdout.trim(),`${a}\tv1.0.0`);
  const unknown=run('resolve','nope');assert.equal(unknown.status,1);assert.match(unknown.stderr,/not in any catalog/);
}));

test('an invalid catalog entry is rejected',()=>fixture(({base,put,run})=>{
  const cat=catalog(base,'bad',[{id:'../x',src:'y'}]);
  put('project/marketplaces.yaml',JSON.stringify([cat]));
  const data=JSON.parse(run('json').stdout);
  assert.match(data.catalogs[0].error,/invalid entry/);assert.deepEqual(data.extensions,[]);
}));

test('a catalog is read from a bare clone, and one without marketplace.yaml is an error',()=>fixture(({base,put,run})=>{
  // Confined steps cannot write under `.git/` (sandbox-runtime), so no working tree is checked out.
  const sample=ext(base,'ext-sample',['v1.0.0']);
  const cat=catalog(base,'cat',[{id:'sample',src:sample}]), none=repo(path.join(base,'none'),{'README.md':'x'});
  put('project/marketplaces.yaml',JSON.stringify([none,cat]));
  const data=JSON.parse(run('json').stdout);
  assert.match(data.catalogs[0].error,/marketplace\.yaml/);
  assert.deepEqual(data.extensions.map(e=>[e.id,e.latest]),[['sample','v1.0.0']]);
}));

test('gh: shorthand expands to a GitHub git URL',()=>fixture(({root})=>{
  const code="const {gitUrl}=require('./framework/scripts/marketplace.cjs');console.log(gitUrl('gh:fyso-dev/fyso-extensions'),gitUrl('/abs/path'))";
  const result=spawnSync(process.execPath,['-e',code],{cwd:root,env:{...process.env,PATH:path.join(root,'bin')+path.delimiter+process.env.PATH},encoding:'utf8'});
  assert.equal(result.stdout.trim(),'https://github.com/fyso-dev/fyso-extensions.git /abs/path',result.stderr);
}));
