const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {spawnSync}=require('node:child_process');
const source=path.resolve(__dirname,'../template');
function fixture(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-ext-'));
  const put=(file,text)=>{const p=path.join(root,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
  fs.cpSync(path.join(source,'framework/scripts'),path.join(root,'framework/scripts'),{recursive:true});
  fs.cpSync(path.join(source,'framework/mcp.json'),path.join(root,'framework/mcp.json'));
  fs.mkdirSync(path.join(root,'bin'));
  fs.symlinkSync(path.join(source,'framework/panel/node_modules/yaml/bin.mjs'),path.join(root,'bin/yaml'));
  const ambient=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('FYSO_')));
  const env={...ambient,PATH:path.join(root,'bin')+path.delimiter+process.env.PATH,FYSO_ROOT:root,FYSO_DATA:path.join(root,'.data'),FYSO_HTTP_PORT:'19400'};
  // Run node directly: a mise shim would parse the fixture's untrusted conf.d files.
  const run=(args,extra={})=>spawnSync(args[0]==='node'?process.execPath:args[0],args.slice(1),{cwd:root,env:{...env,...extra},encoding:'utf8'});
  try {fn({root,put,run,env});}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('MCP merges framework, project and sorted extensions, preserving placeholders',()=>fixture(({root,put,run})=>{
  put('project/mcp.json',JSON.stringify({mcpServers:{project:{url:'${TOKEN}'}}}));
  put('extensions/sample/mcp.json',JSON.stringify({mcpServers:{sample:{url:'${FYSO_EXT_SAMPLE_PORT}'}}}));
  const result=run(['node','framework/scripts/mcp-config.cjs']);assert.equal(result.status,0,result.stderr);
  const config=JSON.parse(fs.readFileSync(path.join(root,'.mcp.json')));
  assert.deepEqual(Object.keys(config.mcpServers),['dagu','fyso','project','sample']);
  assert.equal(config.mcpServers.project.url,'${TOKEN}');
}));
test('MCP duplicate reports both owners and leaves previous output intact',()=>fixture(({root,put,run})=>{
  put('.mcp.json','original');put('extensions/sample/mcp.json','{"mcpServers":{"dagu":{}}}');
  const result=run(['node','framework/scripts/mcp-config.cjs']);assert.equal(result.status,1);
  assert.match(result.stderr,/framework\/mcp.json.*extensions\/sample\/mcp.json/);
  assert.equal(fs.readFileSync(path.join(root,'.mcp.json'),'utf8'),'original');
}));
test('run-ext filters ambient variables and preserves declared multiline secrets and argv',()=>fixture(({put,run})=>{
  put('extensions/sample/secrets.yaml','- name: SAMPLE_TOKEN\n  required: true\n');
  const result=run(['bash','framework/scripts/run-ext.sh','sample','--',process.execPath,'-e','console.log(JSON.stringify({env:process.env,args:process.argv.slice(1)}))','a b'],{SAMPLE_TOKEN:'private\nvalue',AMBIENT_SECRET:'hidden',FYSO_AUTH_USERS:'private-auth-canary',FYSO_AUTH_FUTURE_SECRET:'private-provider-canary',FYSO_EXT_SAMPLE_PORT:'19410'});
  assert.equal(result.status,0,result.stderr);const data=JSON.parse(result.stdout);
  assert.equal(data.env.SAMPLE_TOKEN,'private\nvalue');assert.equal(data.env.AMBIENT_SECRET,undefined);assert.equal(data.env.FYSO_AUTH_USERS,undefined);assert.equal(data.env.FYSO_AUTH_FUTURE_SECRET,undefined);
  assert.equal(data.env.USER,undefined);assert.equal(data.env.FYSO_EXT_SAMPLE_PORT,'19410');assert.deepEqual(data.args,['a b']);
}));
test('run-ext refuses missing required secrets before executing a command',()=>fixture(({root,put,run})=>{
  put('extensions/sample/secrets.yaml','- name: SAMPLE_TOKEN\n  required: true\n');
  const result=run(['bash','framework/scripts/run-ext.sh','sample','--','touch','executed'],{SAMPLE_TOKEN:''});
  assert.equal(result.status,1);assert.match(result.stderr,/sample.*SAMPLE_TOKEN/);assert.ok(!fs.existsSync(path.join(root,'executed')));
}));
test('panel inventory uses names and presence only; substitution is restricted to FYSO',()=>fixture(({root,put,run})=>{
  put('.copier-answers.ext-sample.yml','_src_path: fixture\n_commit: v1\n');
  put('extensions/sample/secrets.yaml','- name: SAMPLE_TOKEN\n  description: {en: Token, es: Token}\n  required: true\n');
  put('extensions/sample/app.yaml','id: sample\nname: {es: Ejemplo, en: Sample}\nurl: "http://sample.localhost:${FYSO_HTTP_PORT}/${SAMPLE_TOKEN}"\n');
  put('extensions/sample/mcp.json','{"mcpServers":{"sample":{}}}');
  put('extensions/sample/skills/help/SKILL.md','Help');put('project/workflows/ext-sample-check.yaml','description: Check');
  const result=run(['node','framework/scripts/panel-data.cjs','config'],{SAMPLE_TOKEN:'secret-canary'});assert.equal(result.status,0,result.stderr);
  const contents=fs.readFileSync(path.join(root,'.data/panel/extensions.json'),'utf8');assert.ok(!contents.includes('secret-canary'));
  const [extension]=JSON.parse(contents);assert.deepEqual(extension.apps,['sample']);assert.deepEqual(extension.workflows,['ext-sample-check']);assert.deepEqual(extension.skills,['help']);assert.deepEqual(extension.mcpServers,['sample']);assert.equal(extension.secrets[0].set,true);
  const [app]=JSON.parse(fs.readFileSync(path.join(root,'.data/panel/apps.json')));assert.equal(app.group,'extension');assert.equal(app.url,'http://sample.localhost:19400/${SAMPLE_TOKEN}');
}));
test('extension doctor rejects collisions, out-of-range ports and missing secrets',()=>fixture(({put,run})=>{
  put('extensions/sample/secrets.yaml','- name: REQUIRED_TOKEN\n  required: true\n');
  const result=run(['node','framework/scripts/extensions.cjs','check'],{FYSO_EXT_A_PORT:'19410',FYSO_EXT_B_PORT:'19410',FYSO_EXT_C_PORT:'19420',REQUIRED_TOKEN:''});
  assert.equal(result.status,1);assert.match(result.stderr,/Port collision.*FYSO_EXT_B_PORT.*FYSO_EXT_A_PORT/);assert.match(result.stderr,/19410..19419/);assert.match(result.stderr,/REQUIRED_TOKEN/);
  assert.equal(run(['node','framework/scripts/extensions.cjs','check'],{FYSO_EXT_A_PORT:'19419',REQUIRED_TOKEN:'set'}).status,0);
}));
test('remove deletes only named slots, retaining runtime data, secrets and other extensions',()=>fixture(({root,put,run})=>{
  for(const file of ['.copier-answers.ext-sample.yml','.config/mise/conf.d/ext-sample.toml','extensions/sample/app.yaml','project/workflows/ext-sample-check.yaml','.data/ext/sample/data','secrets.enc.yaml','extensions/other/app.yaml'])put(file,'retained');
  const result=run(['node','framework/scripts/ext-lifecycle.cjs','remove','sample']);assert.equal(result.status,0,result.stderr);
  assert.ok(!fs.existsSync(path.join(root,'extensions/sample')));assert.ok(!fs.existsSync(path.join(root,'project/workflows/ext-sample-check.yaml')));
  for(const file of ['.data/ext/sample/data','secrets.enc.yaml','extensions/other/app.yaml'])assert.ok(fs.existsSync(path.join(root,file)));
  assert.equal(run(['node','framework/scripts/ext-lifecycle.cjs','remove','../other']).status,1);
}));
test('remove keeps workflows of an installed extension whose id extends the removed one',()=>fixture(({root,put,run})=>{
  for(const file of ['.copier-answers.ext-sample.yml','.copier-answers.ext-sample-other.yml','project/workflows/ext-sample-check.yaml','project/workflows/ext-sample-other-check.yaml'])put(file,'_src_path: x');
  const result=run(['node','framework/scripts/ext-lifecycle.cjs','remove','sample']);assert.equal(result.status,0,result.stderr);
  assert.ok(!fs.existsSync(path.join(root,'project/workflows/ext-sample-check.yaml')));
  assert.ok(fs.existsSync(path.join(root,'project/workflows/ext-sample-other-check.yaml')));
}));
test('process-compose startup merges all fragments and clients address the same socket',()=>fixture(({root,put,run})=>{
  put('project/apps/test/process.yaml','');put('extensions/sample/process.yaml','');
  put('bin/process-compose','#!/usr/bin/env bash\nprintf "%s\\n" "$@"\n');fs.chmodSync(path.join(root,'bin/process-compose'),0o755);
  for(const args of [['up','--detached'],['down'],['process','list']]){
    const result=run(['bash','framework/scripts/pc.sh',...args]);assert.equal(result.status,0,result.stderr);
    const actual=result.stdout.trim().split('\n');
    if(args[0]==='up') assert.deepEqual(actual.slice(0,6),['-f','process-compose.yaml','-f','project/apps/test/process.yaml','-f','extensions/sample/process.yaml']);
    else assert.ok(!actual.includes('-f'));
    assert.deepEqual(actual.slice(-2),['--unix-socket','/tmp/fyso-unknown-19400.sock']);
  }
}));
