const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {withExtensionApps}=require('../template/framework/scripts/web-auth-config.cjs');
const EXT=path.resolve(__dirname,'../template/framework/extensions/silverbullet/extensions/silverbullet');
function project(files) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-web-auth-config-'));
  for(const [file,text] of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text);}
  return root;
}
const base=()=>({auth:{acls:{policy:'deny'}},apps:{panel:{users:{allow:'admin,ana'}},dagu:{users:{allow:'admin'}}}});
test('an extension app inherits the panel access rule',()=>{
  const root=project({'extensions/silverbullet/Caddyfile':fs.readFileSync(path.join(EXT,'Caddyfile'),'utf8')});
  const config=withExtensionApps(base(),root);
  assert.deepEqual(config.apps.docs,{users:{allow:'admin,ana'}});
  assert.notEqual(config.apps.docs,config.apps.panel);
  assert.deepEqual(config.apps.dagu,{users:{allow:'admin'}});
  assert.equal(config.auth.acls.policy,'deny');
});
test('an app the project declares keeps its own rule',()=>{
  const root=project({'extensions/silverbullet/Caddyfile':'http://docs.{$FYSO_WEB_DOMAIN}:{$FYSO_HTTP_PORT} {\n}\n'});
  const config=base();config.apps.docs={users:{allow:'ana'}};
  assert.deepEqual(withExtensionApps(config,root).apps.docs,{users:{allow:'ana'}});
});
test('only extension routes on the project domain are granted',()=>{
  const root=project({
    'extensions/one/Caddyfile':'# http://ignored.{$FYSO_WEB_DOMAIN}\nhttp://one.{$FYSO_WEB_DOMAIN}:{$FYSO_HTTP_PORT} {\n}\nhttp://two.{$FYSO_WEB_DOMAIN}:{$FYSO_HTTP_PORT} {\n}\nhttp://other.example.com {\n}\n',
    'project/apps/crm/Caddyfile':'http://crm.{$FYSO_WEB_DOMAIN}:{$FYSO_HTTP_PORT} {\n}\n',
  });
  assert.deepEqual(Object.keys(withExtensionApps(base(),root).apps).sort(),['dagu','one','panel','two']);
});
test('without a panel rule nothing is granted',()=>{
  const root=project({'extensions/one/Caddyfile':'http://one.{$FYSO_WEB_DOMAIN}:{$FYSO_HTTP_PORT} {\n}\n'});
  assert.deepEqual(withExtensionApps({apps:{dagu:{}}},root).apps,{dagu:{}});
  assert.deepEqual(withExtensionApps({},root),{});
});

test('native OAuth fragments preserve project providers and skip pending credentials', t => {
  const { withExtensionProviders } = require('../template/framework/scripts/web-auth-config.cjs');
  const placeholder = '${FYSO_AUTH_TEST_SECRET}';
  const root = project({
    'extensions/one/tinyauth.providers.yaml': JSON.stringify({ existing: { name: 'Extension override' }, extra: { clientSecret: placeholder } }),
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const config = { oauth: { whitelist: ['existing@example.com'], providers: { existing: { name: 'Project provider' } } } };
  const original = structuredClone(config);
  const expand = provider => ({ ...provider, clientSecret: 'fixture-secret' });
  assert.deepEqual(withExtensionProviders(config, root, read, expand, {}), original);
  const env = { FYSO_AUTH_TEST_SECRET: 'fixture-secret' };
  assert.deepEqual(withExtensionProviders(structuredClone(original), root, read, expand, env), original);
  const answers = path.join(root, '.copier-answers.ext-one.yml');
  fs.writeFileSync(answers, '');
  assert.deepEqual(withExtensionProviders(structuredClone(original), root, read, expand, {}), original);
  withExtensionProviders(config, root, read, expand, env);
  assert.deepEqual(config.oauth, {
    whitelist: ['existing@example.com'],
    providers: { existing: { name: 'Project provider' }, extra: { clientSecret: 'fixture-secret' } },
  });
  fs.unlinkSync(answers);
  assert.deepEqual(withExtensionProviders(structuredClone(original), root, read, expand, env), original);
});
const {execFileSync}=require('node:child_process');
let yamlBin=null;try{yamlBin=execFileSync('which',['yaml'],{encoding:'utf8'}).trim()||null;}catch{}
test('the runtime config keeps the resources server off even if the project enables it',{skip:!yamlBin&&'yaml CLI not on PATH'},()=>{
  const root=project({'project/auth/tinyauth.yaml':'resources:\n  enabled: true\n  path: /\nui:\n  title: Acme\nauth:\n  acls:\n    policy: deny\napps:\n  panel:\n    users:\n      allow: admin\n'});
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-web-auth-data-'));
  execFileSync(process.execPath,[path.resolve(__dirname,'../template/framework/scripts/web-auth-config.cjs')],{env:{...process.env,FYSO_ROOT:root,FYSO_DATA:data,FYSO_AUTH_PORT:'1',FYSO_AUTH_USERS:'admin:x',FYSO_WEB_DOMAIN:'localhost',FYSO_HTTP_PORT:'1',FYSO_WEB_SCHEME:'http'}});
  const config=require('node:module').createRequire(fs.realpathSync(yamlBin))('yaml').parse(fs.readFileSync(path.join(data,'web-auth/runtime/config.yaml'),'utf8'));
  assert.deepEqual(config.resources,{enabled:false});
  assert.equal(config.ui.title,'Acme');
  assert.ok(config.ui.backgroundImage);
  assert.equal(config.auth.acls.policy,'deny');
});
