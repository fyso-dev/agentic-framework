import {mountExtensionPage,createElement as h,useEffect,useState,useStore} from '/assets/extension-sdk.js';
function Page(){
  const {backend,project}=useStore(),[result,setResult]=useState('loading');
  useEffect(()=>{if(project.status!=='ok')return;let alive=true;
    void backend.enqueue('fixture-read',{}).then(async id=>{await backend.getRun('fixture-read',id);return backend.getOutputs('fixture-read',id);}).then(output=>{if(alive)setResult(output.fixture);}).catch(()=>{if(alive)setResult('failed');});
    return ()=>{alive=false;};
  },[backend,project.status]);
  return h('main',{className:'page'},h('h1',null,'SDK page'),h('output',{'data-testid':'sdk-result'},result));
}
void mountExtensionPage(Page,{});
