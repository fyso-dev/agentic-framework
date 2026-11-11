// Public web addresses (D62): loopback HTTP by default, the provider's HTTPS origin otherwise.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const scripts=path.resolve(__dirname,'../template/framework/scripts');
const web=require(path.join(scripts,'web-origin.cjs'));
const local={FYSO_WEB_DOMAIN:'demo-8400.localhost',FYSO_HTTP_PORT:'8400'};
const remote={FYSO_WEB_DOMAIN:'host1.proxy.example.com',FYSO_HTTP_PORT:'8400',FYSO_WEB_SCHEME:'https'};

test('the default keeps the listening address',()=>{
  assert.equal(web.origin('panel',local),'http://panel.demo-8400.localhost:8400');
  assert.equal(web.publicUrl('http://docs.demo-8400.localhost:8400/x',local),'http://docs.demo-8400.localhost:8400/x');
});
test('an HTTPS provider moves every address to the default HTTPS port',()=>{
  assert.equal(web.origin('auth',remote),'https://auth.host1.proxy.example.com');
  assert.equal(web.publicUrl('http://docs.host1.proxy.example.com:8400/x?y=1',remote),'https://docs.host1.proxy.example.com/x?y=1');
});
test('links outside the project stay as declared',()=>{
  for(const url of ['https://example.com/a','http://docs.other.example.com:8400','http://docs.host1.proxy.example.com:9000',undefined])
    assert.equal(web.publicUrl(url,remote),url);
});
test('an unknown scheme is rejected',()=>{
  assert.throws(()=>web.origin('panel',{...local,FYSO_WEB_SCHEME:'ftp'}),/http or https/);
});
test('the shell helpers agree with the module',()=>{
  const sh=(env,app)=>spawnSync('bash',['-c',`source "${scripts}/lib.sh"; web_origin ${app}`],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,...env}});
  // An explicit scheme avoids the fresh read through mise, which a test has no project for.
  assert.equal(sh({...local,FYSO_WEB_SCHEME:'http'},'panel').stdout,web.origin('panel',local));
  assert.equal(sh(remote,'omb').stdout,web.origin('omb',remote));
  assert.notEqual(sh({...local,FYSO_WEB_SCHEME:'ftp'},'panel').status,0);
});
