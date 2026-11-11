const {test}=require('node:test'),assert=require('node:assert/strict');
const {pending,waitFor}=require('../template/framework/scripts/extension-ready.cjs');
test('native probes gate hooks even when a process is already running',()=>{
  const state={name:'ext-demo',is_running:true,has_ready_probe:true,is_ready:'Not Ready'};
  assert.deepEqual(pending(['ext-demo'],[state]),['ext-demo']);
  assert.deepEqual(pending(['ext-demo'],[{...state,is_ready:'Ready'}]),[]);
  assert.deepEqual(pending(['ext-demo'],[]),['ext-demo']);
  assert.deepEqual(pending(['ext-demo'],[{...state,has_ready_probe:false}]),[]);
});
test('waits until the owning process is ready and ignores unrelated failures',async()=>{
  let count=0;
  await waitFor(['ext-demo'],{states:async()=>[{name:'ext-demo',has_ready_probe:true,is_ready:++count===2?'Ready':'Not Ready'},{name:'unrelated',is_running:false}],pause:async()=>{}});
  assert.equal(count,2);
});
test('times out without running a dependent connection',async()=>{
  await assert.rejects(waitFor(['ext-demo'],{states:async()=>[],timeoutMs:0}),/Extension processes not ready: ext-demo/);
});
