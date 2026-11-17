// Recoverable web passwords (D64) with real sops, age and Caddy's bcrypt.
// Set FYSO_TEST_SOPS, FYSO_TEST_AGE_KEYGEN and FYSO_TEST_CADDY to explicit binaries.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const tools=['FYSO_TEST_SOPS','FYSO_TEST_AGE_KEYGEN','FYSO_TEST_CADDY'].map(name=>process.env[name]);
const skip=tools.every(Boolean)?false:'requires explicit sops, age-keygen and caddy binaries';
const SHAPE=/^[a-hj-km-np-z2-9]{4}(-[a-hj-km-np-z2-9]{4}){3}$/;

function project(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-password-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.cpSync(path.join(root,'template/framework/scripts'),path.join(dir,'framework/scripts'),{recursive:true});
  const bin=path.join(dir,'bin');fs.mkdirSync(bin);
  fs.symlinkSync(tools[0],path.join(bin,'sops'));fs.symlinkSync(tools[2],path.join(bin,'caddy'));
  fs.symlinkSync(path.join(root,'template/framework/panel/node_modules/yaml/bin.mjs'),path.join(bin,'yaml'));
  const key=path.join(dir,'key.txt');
  assert.equal(spawnSync(tools[1],['-o',key]).status,0);
  const recipient=/age1[a-z0-9]+/.exec(fs.readFileSync(key,'utf8'))[0];
  fs.writeFileSync(path.join(dir,'.sops.yaml'),`creation_rules:\n  - path_regex: secrets\\.enc\\.yaml$\n    age: ${recipient}\n`);
  const env={PATH:`${bin}:${process.env.PATH}`,HOME:process.env.HOME,SOPS_AGE_KEY_FILE:key,FYSO_DATA:path.join(dir,'.data'),
    FYSO_PROJECT:`password-${process.pid}`,FYSO_HTTP_PORT:'19960',FYSO_ADMIN_USER:'admin'};
  const sops=(args,input)=>spawnSync(tools[0],args,{cwd:dir,env,input,encoding:'utf8'});
  fs.writeFileSync(path.join(dir,'plain.yaml'),"FYSO_ADMIN_PASSWORD: 'technical-fixture'\n");
  const first=sops(['encrypt','--filename-override','secrets.enc.yaml','--input-type','yaml','--output-type','yaml','plain.yaml']);
  assert.equal(first.status,0,first.stderr);
  fs.writeFileSync(path.join(dir,'secrets.enc.yaml'),first.stdout);fs.rmSync(path.join(dir,'plain.yaml'));
  const secret=name=>sops(['decrypt','--extract',`["${name}"]`,'secrets.enc.yaml']).stdout;
  // stdin is not a terminal here, as over SSH or from an installer.
  const users=(...args)=>spawnSync('bash',['framework/scripts/web-auth-users.sh',...args],{cwd:dir,env,input:'',encoding:'utf8'});
  const cli=(args,input)=>spawnSync('node',['framework/scripts/web-auth-users.cjs',...args],{cwd:dir,env,input,encoding:'utf8'});
  return {dir,users,cli,secret,encrypted:()=>fs.readFileSync(path.join(dir,'secrets.enc.yaml'),'utf8')};
}
const printed=out=>(/Password {2}(\S+)/.exec(out)||[])[1];

test('setup without a terminal generates a readable password that can be read again',{skip},t=>{
  const p=project(t);
  const init=p.users('init');
  assert.equal(init.status,0,init.stderr);
  const password=printed(init.stdout);
  assert.match(password,SHAPE);
  assert.match(p.secret('FYSO_AUTH_USERS'),/^admin:\$2[aby]\$12\$/);
  assert.deepEqual(JSON.parse(p.secret('FYSO_AUTH_PASSWORDS')),{admin:password});
  assert.equal(p.secret('FYSO_ADMIN_PASSWORD'),'technical-fixture');
  assert.ok(!p.encrypted().includes(password));
  const show=p.users('password');
  assert.equal(show.status,0,show.stderr);assert.equal(show.stdout.trim(),password);
});

test('--new replaces the password and its hash; other users have their own',{skip},t=>{
  const p=project(t);
  const first=printed(p.users('init').stdout), hash=p.secret('FYSO_AUTH_USERS');
  const renewed=p.users('password','--new');
  assert.equal(renewed.status,0,renewed.stderr);
  const second=printed(renewed.stdout);
  assert.match(second,SHAPE);assert.notEqual(second,first);assert.notEqual(p.secret('FYSO_AUTH_USERS'),hash);
  assert.equal(p.users('password').stdout.trim(),second);
  const alice=printed(p.users('add','alice').stdout);
  assert.equal(p.users('password','alice').stdout.trim(),alice);
  assert.deepEqual(JSON.parse(p.secret('FYSO_AUTH_PASSWORDS')),{admin:second,alice});
  assert.equal(p.users('remove','alice').status,0);
  assert.deepEqual(JSON.parse(p.secret('FYSO_AUTH_PASSWORDS')),{admin:second});
  assert.notEqual(p.users('password','alice').status,0);
});

test('a user that has only a hash is reported with the way out, and nothing stale is kept',{skip},t=>{
  const p=project(t);
  const password=printed(p.users('init').stdout);
  const hash=spawnSync(tools[2],['hash-password','--bcrypt-cost','4'],{input:'typed-elsewhere-password',encoding:'utf8'}).stdout.trim();
  assert.equal(p.cli(['add','admin'],`admin:${hash}`).status,0);
  assert.equal(p.secret('FYSO_AUTH_PASSWORDS'),'');
  const show=p.users('password');
  assert.notEqual(show.status,0);
  assert.match(show.stderr,/not stored.*web-auth:password -- --new/);
  assert.ok(!(show.stdout+show.stderr).includes(password));
});
