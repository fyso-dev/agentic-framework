const {test}=require('node:test'),assert=require('node:assert/strict');
const {check}=require('../template/framework/scripts/check-native-dagu.cjs');
const root='/fixture/project', correct={name:'dagu',enabled:true,command:'node',args:[`${root}/framework/scripts/fyso-mcp.cjs`,'--dagu-only'],envKeys:[],scope:'team'};

test('the Pi doctor checks the enabled project Dagu mount and its actual tools',async()=>{
  const calls=[];
  const request=async(url,options)=>{
    calls.push([url,options.method]);
    return {ok:true,json:async()=>url.endsWith('/servers')?{servers:[correct]}:{ok:true,tools:[{name:'dagu_read'},{name:'dagu_execute'}]}};
  };
  assert.equal(await check('33824',root,request),true);
  assert.deepEqual(calls,[['http://127.0.0.1:33824/api/mcp/servers','GET'],['http://127.0.0.1:33824/api/mcp/servers/dagu/test','POST']]);
});

test('missing, disabled, failed or incomplete mounts and invalid ports fail closed',async()=>{
  for(const reply of [
    [{servers:[]},{}], [{servers:[{...correct,enabled:false}]},{}],
    [{servers:[{...correct,args:['/another-project/framework/scripts/fyso-mcp.cjs','--dagu-only']}]},{}],
    [{servers:[{...correct,envKeys:['FYSO_DAGU_PORT']}]},{}],
    [{servers:[{...correct,scope:'person'}]},{}],
    [{servers:[correct]},{ok:false,tools:[]}],
    [{servers:[correct]},{ok:true,tools:[{name:'dagu_read'}]}],
  ]) {
    let n=0;assert.equal(await check('33824',root,async()=>({ok:true,json:async()=>reply[n++]})),false);
  }
  assert.equal(await check('invalid',root,async()=>{throw Error('must not call');}),false);
  assert.equal(await check('33824','',async()=>{throw Error('must not call');}),false);
  assert.equal(await check('33824',root,async()=>{throw Error('unavailable');}),false);
});
