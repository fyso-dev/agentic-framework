const {test}=require('node:test'),assert=require('node:assert/strict');
test('missing backend configuration is distinct from an unauthorized app',async()=>{
  const {appConnectionState:state}=await import('../template/framework/panel/src/lib/app-connection-state.ts');
  assert.equal(state({configured:false},{configured:false,services:{}},'gmail'),'needsSetup');
  assert.equal(state({configured:true},{configured:true,services:{}},'gmail'),'notConnected');
  assert.equal(state({configured:true},undefined,'gmail'),'unknownState');
  assert.equal(state({configured:true},{configured:true,inventoryComplete:false,services:{}},'gmail'),'unknownState');
  assert.equal(state({configured:true},{configured:true,services:{gmail:{connected:true}}},'gmail'),'connected');
  assert.equal(state({configured:true},{configured:true,services:{gmail:{connected:false,pending:true}}},'gmail'),'pending');
});
test('saved accounts distinguish incomplete, expired, failed and unverified authorization',async()=>{
  const {appConnectionState:state,accountConnectionState:account}=await import('../template/framework/panel/src/lib/app-connection-state.ts');
  const check=status=>state({configured:true},{configured:true,services:{github:{connected:false,accounts:[{status}]}}},'github');
  assert.equal(check('EXPIRED'),'needsAttention');assert.equal(check('FAILED'),'needsAttention');
  assert.equal(check('INITIATED'),'pending');assert.equal(check('ACTIVE'),'unknownState');assert.equal(check('new-status'),'unknownState');
  assert.equal(account('ACTIVE'),'accountActive');assert.equal(account('expired'),'accountExpired');assert.equal(account('FAILED'),'accountFailed');
  assert.equal(account('REVOKED'),'accountInactive');assert.equal(account('INITIALIZING'),'accountPending');
});
