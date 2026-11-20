const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const brand=require('../template/framework/scripts/brand.cjs');
const template=path.join(__dirname,'../template');
// A minimal project: the framework's brand files, a git repo and the panel's project.json.
function project() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-brand-')),data=path.join(root,'.data');
  fs.mkdirSync(path.join(root,'framework/brand'),{recursive:true});fs.mkdirSync(path.join(root,'project'));fs.mkdirSync(path.join(data,'panel'),{recursive:true});
  for(const file of ['fyso-mark.png','login-background.svg'])fs.copyFileSync(path.join(template,'framework/brand',file),path.join(root,'framework/brand',file));
  fs.writeFileSync(path.join(data,'panel/project.json'),JSON.stringify({name:'Acme',slug:'acme'}));
  const git=args=>execFileSync('git',args,{cwd:root,stdio:'pipe',encoding:'utf8'});
  git(['init','-q']);git(['config','user.name','Brand fixture']);git(['config','user.email','fixture@example.invalid']);git(['commit','--allow-empty','-qm','fixture']);
  return {root,git,env:{FYSO_ROOT:root,FYSO_DATA:data,FYSO_PROJECT_NAME:'Acme'}};
}
const png=fs.readFileSync(path.join(template,'framework/brand/fyso-mark.png')).toString('base64');

test('save versions the identity, installs it and keeps the panel in step; defaults remove the file',()=>{
  const {root,git,env}=project();
  try {
    const saved=brand.save({name:'Acme Logística',accent:'#0F9D58',icon:png},env);
    assert.equal(saved.name,'Acme Logística');assert.equal(saved.accent,'#0f9d58');assert.match(saved.icon,/^\/favicon-96x96\.png\?v=[0-9a-f]{10}$/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'project/brand.json'),'utf8')),{name:'Acme Logística',accent:'#0f9d58',icon:'brand/icon.png'});
    assert.equal(git(['status','--porcelain','--','project']).trim(),'');assert.match(git(['log','-1','--format=%s']),/brand: save the project identity/);
    assert.match(fs.readFileSync(path.join(env.FYSO_DATA,'brand/login-background.svg'),'utf8'),/#0f9d58/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(env.FYSO_DATA,'brand/omb.json'),'utf8')).name,'Acme Logística · Chat de agentes');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.FYSO_DATA,'panel/project.json'),'utf8')).brand,saved);
    const reset=brand.save({name:'Acme',accent:'#6e1fff',icon:null},env);
    assert.equal(reset.icon,null);assert.equal(fs.existsSync(path.join(root,'project/brand.json')),false);assert.equal(fs.existsSync(path.join(root,'project/brand/icon.png')),false);
    assert.equal(git(['status','--porcelain','--','project']).trim(),'');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('font, corners and login background are saved, served by install and reset to the defaults',()=>{
  const {root,git,env}=project();
  const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(64)]).toString('base64');
  try {
    const saved=brand.save({font:'classic',radius:'round',loginBackground:jpeg},env);
    assert.equal(saved.font,'classic');assert.equal(saved.radius,'round');assert.match(saved.loginBackground,/^\/fyso-brand\/login-background\?v=[0-9a-f]{10}$/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'project/brand.json'),'utf8')),{font:'classic',radius:'round',loginBackground:'brand/login-background.jpg'});
    assert.equal(fs.existsSync(path.join(env.FYSO_DATA,'brand/login-background.jpg')),true);
    assert.equal(git(['status','--porcelain','--','project']).trim(),'');
    for(const input of [{font:'comic'},{radius:'square'},{loginBackground:png}])assert.throws(()=>brand.save(input,env));
    const reset=brand.save({font:'fyso',radius:'soft',loginBackground:null},env);
    assert.equal(reset.loginBackground,null);assert.equal(fs.existsSync(path.join(root,'project/brand.json')),false);
    assert.equal(fs.existsSync(path.join(env.FYSO_DATA,'brand/login-background.jpg')),false);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('a first save without an icon commits; invalid input is rejected and leaves nothing behind',()=>{
  const {root,git,env}=project();
  try {
    brand.save({accent:'#e8590c'},env);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'project/brand.json'),'utf8')),{accent:'#e8590c'});
    for(const input of [{accent:'verde'},{name:'  '},{name:'x'.repeat(41)},{icon:Buffer.from('<svg/>').toString('base64')}])assert.throws(()=>brand.save(input,env));
    // A file written before a later failure is put back.
    fs.writeFileSync(path.join(root,'project/brand.json'),'{"icon":"../outside.png"}\n');git(['commit','-qam','broken by hand']);
    assert.throws(()=>brand.save({name:'Acme Two'},env),/icon must be an existing \.png file under project/);
    assert.equal(fs.readFileSync(path.join(root,'project/brand.json'),'utf8'),'{"icon":"../outside.png"}\n');
    assert.equal(git(['status','--porcelain','--','project']).trim(),'');
    fs.writeFileSync(path.join(root,'project/brand.json'),'{}\n');
    assert.throws(()=>brand.save({name:'Acme Three'},env),/commit the existing edits/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
