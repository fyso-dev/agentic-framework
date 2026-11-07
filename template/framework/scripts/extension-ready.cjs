// Wait for the owning extension's native process-compose readiness probes.
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function pending(names,states) {
  return names.filter(name=>{
    const state=states.find(item=>item.name===name);
    if(!state)return true;
    if(state.has_ready_probe)return state.is_ready!=='Ready';
    return !state.is_running && !(state.status==='Completed' && state.exit_code===0);
  });
}
async function waitFor(names,{states,timeoutMs=120000,pollMs=500,now=Date.now,pause=sleep}) {
  const end=now()+timeoutMs;
  for(;;) {
    const waiting=pending(names,await states());
    if(!waiting.length)return;
    if(now()>=end)throw new Error(`Extension processes not ready: ${waiting.join(', ')}`);
    await pause(pollMs);
  }
}
module.exports={pending,waitFor};
if(require.main===module)(async()=>{
  const {read,validId}=require('./extensions.cjs');
  const [id,socket]=process.argv.slice(2);
  if(!validId(id)||!socket)throw new Error('Extension id and project socket required');
  const file=`extensions/${id}/process.yaml`;
  const core=fs.existsSync('process-compose.yaml') ? Object.keys(read('process-compose.yaml').processes||{}) : [];
  const own=fs.existsSync(file) ? Object.keys(read(file).processes||{}) : [];
  const names=[...core,...own];
  await waitFor(names,{states:async()=>JSON.parse(execFileSync('process-compose',['process','list','-o','json','--unix-socket',socket],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}))});
})().catch(error=>{console.error(error.message);process.exitCode=1;});
