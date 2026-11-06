const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validatePatch,guardTarget}=require('../template/framework/scripts/bot-architect.cjs');
test('one native profile only, safe local cwd and explicit approval',()=>{
  assert.equal(validatePatch({name:'Operación',cwd:'${FYSO_ROOT}',approval:'ask'},'/project').cwd,'${FYSO_ROOT}');
  for(const bad of [{engines:{}},{chief:true},{cwd:'/elsewhere'},{name:'../outside'},{computer:'local'},{model:'guessed'}])assert.throws(()=>validatePatch(bad,'/project'));
});
test('deletion protects framework and Chief identities and active bots',()=>{
  for(const bot of [{name:'MausBot'},{name:'Builder'},{name:'Custom',chiefOfStaff:true},{name:'Custom',busy:true},{name:'Custom',waitingForTeammates:true},{name:'Custom',activity:'working'}])assert.throws(()=>guardTarget({id:'id',activity:'idle',...bot},'delete'));
  assert.doesNotThrow(()=>guardTarget({name:'Disposable',activity:'idle',busy:false,tasks:[]},'delete'));
  assert.doesNotThrow(()=>guardTarget({name:'New idle bot'},'delete'));
});
test('the architect cannot change itself and core identity cannot be renamed',()=>{
  assert.throws(()=>guardTarget({name:'Bot Architect'},'update'));
  assert.throws(()=>guardTarget({name:'Builder'},'update',{name:'Different'}));
  assert.doesNotThrow(()=>guardTarget({name:'Builder'},'update',{model:'codex/gpt-6.1-sol'}));
});
