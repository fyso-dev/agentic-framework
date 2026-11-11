const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {validate,projectPatch,operate}=require('../template/framework/scripts/connector-preferences.cjs');
test('only the two native boolean feature switches are accepted',()=>{
  assert.deepEqual(validate({claudeUserMcp:true}),{claudeUserMcp:true});
  for(const value of [null,[],{}, {claudeUserMcp:'true'},{other:true},{claudeUserMcp:true,apiKey:'value'}])assert.throws(()=>validate(value));
  assert.throws(()=>projectPatch({features:{claudeUserMcp:true},anthropic:{}}));
});
test('read projects only booleans; save versions the native patch and restore reuses it',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-preferences-')),env={FYSO_ROOT:root,FYSO_OMB_PORT:'19444'},calls=[];
  fs.mkdirSync(path.join(root,'project'));
  const git=args=>execFileSync('git',args,{cwd:root,stdio:'pipe',encoding:'utf8'});
  git(['init','-q']);git(['config','user.name','Preference fixture']);git(['config','user.email','fixture@example.invalid']);git(['commit','--allow-empty','-qm','fixture']);
  const state={claudeUserMcp:false,claudeUserSkills:false,unrelated:true};
  const request=async(url,options)=>{
    assert.equal(url,'http://127.0.0.1:19444/api/config');calls.push(options);
    if(options.method==='PATCH')Object.assign(state,JSON.parse(options.body).features);
    return {ok:true,json:async()=>({features:{...state},credential:'never-return-this'})};
  };
  try {
    assert.deepEqual(await operate('restore',undefined,env,request),{restored:false});assert.equal(calls.length,0);
    assert.deepEqual((await operate('read',undefined,env,request)).features,{claudeUserMcp:false,claudeUserSkills:false});
    const result=await operate('save',{claudeUserSkills:true},env,request);
    assert.equal(JSON.stringify(result).includes('never-return-this'),false);
    assert.deepEqual(JSON.parse(calls.find(c=>c.method==='PATCH').body),{features:{claudeUserSkills:true}});
    assert.equal(git(['status','--porcelain','--','project/omb-connectors.json']).trim(),'');
    state.claudeUserSkills=false;assert.equal((await operate('restore',undefined,env,request)).features.claudeUserSkills,true);
    assert.equal(state.claudeUserMcp,false);assert.equal(state.unrelated,true);
    fs.appendFileSync(path.join(root,'project/omb-connectors.json'),'\n');const before=calls.length;
    await assert.rejects(operate('save',{claudeUserMcp:true},env,request),/existing connector preference edits/);assert.equal(calls.length,before);
  } finally{fs.rmSync(root,{recursive:true,force:true});}
});
