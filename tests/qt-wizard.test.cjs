// Exercise the Qt script contract without emulating the Qt implementation.
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../installer/qt');
function setup(win=false){
 const ops=[],calls=[],handlers={},values={HomeDir:'/fixture/home'};
 const page={};for(const key of ['name','folder','engine','admin','password','port','distribution']){page[({name:'projectName',folder:'projectFolder',engine:'projectEngine',admin:'panelUser',password:'panelPassword',port:'portBase',distribution:'distributionName'})[key]]={text:'',currentIndex:0};page[key+'Label']={};}
 page.browse={clicked:{connect(){}}};
 page.prerequisite={clicked:{connect(fn){handlers.wsl=fn;}}};page.help={};
 const signal={connect(...args){const fn=args.at(-1);if(typeof fn==='function')fn();}};
 const component={loaded:signal,userInterface(){return page;},createOperations(){},addOperation(...args){ops.push(args);}};
 const installer={isInstaller(){return true;},environmentVariable(k){return k==='LOCALAPPDATA'?'C:/fixture/local':'';},value(k){return values[k];},setValue(k,v){values[k]=v;},setDefaultPageVisible(){},addWizardPage(){},installationFinished:{connect(fn){handlers.finished=fn;}},installationInterrupted:{connect(fn){handlers.cancel=fn;}},execute(...args){calls.push(args);if(args[0]==='wsl.exe')return ['6.6-microsoft-standard-WSL2',0];return [win?'C:/Temp/fyso-request-test/request.json':'/fixture/request.json',0];}};
 const ctx={FYSO_COPY:{es:JSON.parse(fs.readFileSync(root+'/locales/es.json')),en:JSON.parse(fs.readFileSync(root+'/locales/en.json'))},installer,component,systemInfo:{productType:win?'windows':'ubuntu'},gui:{pageByObjectName(){return {};}},QInstaller:{TargetDirectory:1,ComponentSelection:2,ReadyForInstallation:3},QMessageBox:{information(){}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/meta/installscript.qs','utf8'),ctx);vm.runInContext('var instance=new Component()',ctx);
 return {ctx,page,ops,calls,handlers,values,run(){vm.runInContext('instance.createOperations()',ctx);}};
}
test('Linux wizard hands password only over stdin, with a private file path in Execute',()=>{
 const f=setup();f.page.panelPassword.text='sensitive test password';f.run();
 assert.equal(f.ops.length,1);assert.equal(f.ops[0][1],'python3');
 assert(!JSON.stringify(f.ops).includes('sensitive test password'));
 assert(f.calls.some(c=>c[2]?.includes('sensitive test password')));
 assert.equal(f.page.panelPassword.text,'');assert.match(f.values.TargetDir,/\.cache\/Fyso\/Installer\//);
 f.handlers.cancel();assert(f.calls.some(c=>c[0]==='rm'));
});
test('Windows wizard uses native PowerShell/WSL and never persists the password',()=>{
 const f=setup(true);f.page.panelPassword.text='windows secret';f.run();
 assert(f.calls.some(c=>c[0]==='wsl.exe'));assert.equal(f.ops[0][1],'powershell.exe');
 assert(!JSON.stringify(f.ops).includes('windows secret'));assert(!JSON.stringify(f.values).includes('windows secret'));
 assert(f.calls.some(c=>Array.isArray(c[1]) && c[1].at(-1)?.includes('SetAccessRuleProtection')));
 f.handlers.cancel();assert.equal(f.calls.at(-1)[2],'C:/Temp/fyso-request-test/request.json');
});
test('invalid form data fails before creating a request file or running operations',()=>{
 const f=setup();f.page.panelUser.text='invalid user';assert.throws(()=>f.run());assert.equal(f.calls.length,0);assert.equal(f.ops.length,0);
});

test('missing or short local login passwords fail before any request handoff',()=>{
 for(const password of ['', 'short']){
  const f=setup();f.page.panelPassword.text=password;
  assert.throws(()=>f.run());assert.equal(f.calls.length,0);assert.equal(f.ops.length,0);
 }
});
