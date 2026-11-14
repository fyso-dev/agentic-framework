const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spawn,execFileSync}=require('node:child_process');
const src=fs.readFileSync(path.join(__dirname,'human-requests-generated-gateway.cjs'),'utf8');
const section=src.slice(src.indexOf('function members(group)'),src.indexOf('(async()=>{let browser'));
const ctx=vm.createContext({execFileSync,process,Number,Error,pause:ms=>new Promise(resolve=>setTimeout(resolve,ms))});
vm.runInContext(section+'\nglobalThis.fixture={members,stop};',ctx);
test('cleanup stops fixture descendants after their group leader exits',{timeout:10000},async()=>{
 const leader=spawn('/bin/sh',['-c','/bin/sleep 60 & exit 0'],{detached:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{leader.on('exit',resolve);leader.on('error',reject)});
 try {assert.ok(ctx.fixture.members(leader.pid).length>0);await ctx.fixture.stop(leader);assert.equal(ctx.fixture.members(leader.pid).length,0);}
 finally {try{process.kill(-leader.pid,'SIGKILL')}catch(e){if(e.code!=='ESRCH')throw e}}
});
