// Native SOPS acceptance against an explicitly selected, stopped disposable project.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const yaml=require('../template/framework/panel/node_modules/yaml');
const project=process.env.FYSO_TEST_WEB_PROJECT;
if(!project || !process.env.FYSO_TEST_CADDY) throw Error('Set the disposable project and explicit Caddy binary');
assert.equal(yaml.parse(fs.readFileSync(path.join(project,'.copier-answers.yml'),'utf8')).project_slug,'security-acceptance');
function command(args,input,expect=0){const r=spawnSync('mise',['-C',project,'exec','--',...args],{input,encoding:'utf8',env:process.env});assert.equal(r.status,expect,'native secret operation failed');return r.stdout;}
command(['bash','-c','. framework/scripts/lib.sh; if stack_running; then exit 2; fi']);
const file=path.join(project,'secrets.enc.yaml');
const read=()=>yaml.parse(command(['sops','decrypt','--output-type','yaml','secrets.enc.yaml']));
const before=read(),permissions=fs.readFileSync(path.join(project,'project/auth/tinyauth.yaml'),'utf8');
const hash=spawnSync(process.env.FYSO_TEST_CADDY,['hash-password','--bcrypt-cost','4'],{input:'separate-fixture-password-71',encoding:'utf8'}).stdout.trim();
const cli=['node','framework/scripts/web-auth-users.cjs'];
const original=fs.readFileSync(file,'utf8');
command([...cli,'remove','admin'],'',1);assert.equal(fs.readFileSync(file,'utf8'),original);
const runtime=path.join(project,'.data/web-auth/runtime');
fs.writeFileSync(path.join(runtime,'sessions.db'),'fixture sessions');
command([...cli,'add','alice'],`alice:${hash}`);
let after=read();assert.equal(after.FYSO_ADMIN_PASSWORD,before.FYSO_ADMIN_PASSWORD);assert.equal(after.FYSO_AUTH_USERS.split(',').length,2);
assert.equal(fs.existsSync(path.join(runtime,'sessions.db')),false);
assert.equal(fs.readFileSync(file,'utf8').includes(hash),false);
assert.equal(fs.statSync(file).mode&0o777,0o600);
command([...cli,'add','alice'],`alice:${hash}`);assert.equal(read().FYSO_AUTH_USERS.split(',').length,2);
command([...cli,'remove','alice'],'');assert.deepEqual(read(),before);
assert.equal(fs.readFileSync(path.join(project,'project/auth/tinyauth.yaml'),'utf8'),permissions);
command([...cli,'init','admin'],'');assert.deepEqual(read(),before);
console.log('PASS: encrypted local-user updates preserve technical credentials and ACLs, prevent bootstrap removal, deduplicate usernames and invalidate sessions.');
