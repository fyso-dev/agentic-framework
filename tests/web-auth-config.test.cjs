const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {withExtensionApps,withBranding}=require('../template/framework/scripts/web-auth-config.cjs');
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
const SHIPPED=path.resolve(__dirname,'../template/framework/web-auth/background.webp');
test('the login gets the Fyso title and the shipped background',()=>{
  const ui=withBranding(base()).ui;
  assert.deepEqual(Object.keys(ui).sort(),['backgroundImage','title']);
  assert.equal(ui.title,'Fyso');
  const [prefix,data]=ui.backgroundImage.split(',');
  assert.equal(prefix,'data:image/webp;base64');
  assert.deepEqual(Buffer.from(data,'base64'),fs.readFileSync(SHIPPED));
});
test('the shipped background is a small WebP',()=>{
  const bytes=fs.readFileSync(SHIPPED);
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');
  assert.equal(bytes.subarray(8,12).toString(),'WEBP');
  assert.ok(bytes.length<300*1024);
});
test('branding changes only ui, and the project ui wins',()=>{
  const config={...base(),oidc:{clients:{}},resources:{enabled:false}};
  const before=structuredClone(config);
  const branded=withBranding(config);
  const {ui,...rest}=branded;
  assert.deepEqual(rest,before);
  assert.ok(ui.title);
  const own=withBranding({...base(),ui:{title:'Acme',backgroundImage:'/background.webp'}}).ui;
  assert.deepEqual(own,{title:'Acme',backgroundImage:'/background.webp'});
});
