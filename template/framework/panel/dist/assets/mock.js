import{Et as e,_t as t,bt as n,vt as r,yt as i}from"./Action.js";var a={name:`Foo project`,slug:`foo-project`,env:`local`,urls:{dagu:`http://dagu.localhost:8400`,omb:`http://omb.localhost:8400`},framework:{commit:`58f57cf`,src:`https://github.com/fyso-dev/agentic-framework.git`}},o=`# This project's bots, in OpenMausBot's native team file format (PLAN §5).
# Fine-tune instructions and memory in OpenMausBot; structure lives here (PLAN D13).
version: 1

defaults:
  computer: "off"
  cwd: \${FYSO_ROOT}            # loads .mcp.json (Dagu MCP) from the project root

bots:
  # OpenMausBot's default bot; listed so export → apply round-trips cleanly.
  - name: MausBot
    chief: true
    model: claude/claude-sonnet-5
    approval: full

  - name: Workflow Architect
    title: Designs and fixes Dagu workflows
    model: claude/claude-sonnet-5
    approval: full             # writes workflows through the Dagu MCP without asking
    soul: { file: \${FYSO_ROOT}/framework/bots/souls/workflow-architect.md }

  - name: Run Operator
    title: Watches runs, explains failures, retries
    model: claude/claude-haiku-4-5
    approval: ask
    soul: { file: \${FYSO_ROOT}/framework/bots/souls/run-operator.md }

  - name: Dispatcher
    title: Assigns deliveries to drivers by zone
    model: claudeApi/claude-sonnet-5
    approval: ask
    soul: |
      ## Role
      You assign the day's deliveries to drivers, by zone.

      ## Rules
      - Read the delivery list through the Dagu workflows; never edit them.
      - When a zone has no driver, say so and stop.
    skills:
      - dagu-workflows
`,s=`# This project's bots, in OpenMausBot's native team file format (PLAN §5).
version: 1

defaults:
  computer: "off"
  cwd: \${FYSO_ROOT}

bots:
  - name: MausBot
    chief: true
    model: claude/claude-sonnet-5
    approval: full
`,c=o.replace(`model: claude/claude-haiku-4-5
    approval: ask`,`model: claude/claude-sonnet-5
    approval: ask`)+`
  - name: Driver Desk
    title: Answers drivers on the road
    model: claude/claude-haiku-4-5
    soul: |
      ## Role
      You answer drivers on the road. Short answers.
`,l=[`claude-opus-5-5`,`claude-sonnet-5-5`,`claude-sonnet-5`,`claude-haiku-4-5`],u=[{id:`claude-desktop`,label:`Claude Desktop`,desktop:!0,found:!0},{id:`codex`,label:`Codex (app and CLI)`,desktop:!0,found:!0},{id:`claude-code`,label:`Claude Code (CLI)`,desktop:!1,found:!1}];function d(e){return[{id:`claude`,label:`Claude`,kind:`subscription`,ok:!0,models:l},{id:`claudeApi`,label:`Claude`,kind:`api`,ok:!0,models:l},{id:`codex`,label:`Codex`,kind:`subscription`,ok:e!==`failed`,models:[`gpt-5.5-codex`,`gpt-5.5`],fixHint:`codex login --device-auth`}]}function f(e){return e===`empty`?[]:[{id:`sample`,src:`gh:fyso/ext-sample`,version:`v1.2.0`,apps:[`sample`],secrets:[{name:`SAMPLE_TOKEN`,description:`Token de ejemplo`,description_i18n:{en:`Sample token`},required:!0,set:e!==`failed`},{name:`SAMPLE_WEBHOOK`,required:!1,set:!1}],mcpServers:[`sample`],workflows:[`ext-sample-report`],skills:[`sample-ops`]}]}function p(e,t){return{collectedAt:new Date().toISOString(),catalogs:[{source:`gh:fyso-dev/fyso-extensions`,name:`Fyso`},{source:`gh:acme/fyso-catalog`,name:`Acme`}],extensions:[{id:`sample`,src:`gh:fyso/ext-sample`,catalog:`Fyso`,name:`Ejemplo`,name_i18n:{en:`Sample`},description:`Sitio estático de ejemplo`,description_i18n:{en:`Sample static site`},tags:[`demo`],latest:`v1.3.0`},{id:`netbird`,src:`gh:fyso/fyso-ext-netbird`,catalog:`Fyso`,name:`NetBird`,description:`Red privada entre hosts`,description_i18n:{en:`Private network between hosts`},tags:[`network`,`multi-host`],homepage:`https://netbird.io`,latest:`v0.4.1`},{id:`metabase`,src:`gh:acme/fyso-ext-metabase`,catalog:`Acme`,name:`Metabase`,description:`Tableros sobre los datos del proyecto`,description_i18n:{en:`Dashboards over project data`},tags:[`data`],latest:null}].map(n=>{let r=t.get(n.id)??null,i=e.has(n.id);return{...n,installed:i,version:r,update:i&&!!n.latest&&r!==n.latest}})}}function m(e){let t=[{id:`dagu`,name:`Dagu`,name_i18n:{es:`Dagu`,en:`Dagu`},description:`Workflows y ejecuciones`,description_i18n:{en:`Workflows and runs`},icon:`workflow`,url:a.urls.dagu,group:`framework`,enabled:!0},{id:`omb`,name:`OpenMausBot`,description:`Bots y aprobaciones`,description_i18n:{en:`Bots and approvals`},icon:`bot`,url:a.urls.omb,group:`framework`,enabled:!0,accessNote:`Login del proyecto; no requiere código de emparejamiento`,accessNote_i18n:{en:`Project login; no pairing code required`}}];return e===`empty`?t:[...t,{id:`drivers`,name:`Choferes`,name_i18n:{en:`Drivers`},description:`Legajos y turnos`,description_i18n:{en:`Records and shifts`},icon:`users`,url:`http://drivers.localhost:8400`,group:`project`,enabled:!0},{id:`deliveries`,name:`Entregas`,name_i18n:{en:`Deliveries`},description:`Seguimiento por zona`,description_i18n:{en:`Tracking by zone`},icon:`truck`,url:`http://deliveries.localhost:8400`,group:`project`,enabled:!0},{id:`reports`,name:`Reportes`,name_i18n:{en:`Reports`},description:`Resumen semanal`,description_i18n:{en:`Weekly summary`},icon:`chart`,url:`http://reports.localhost:8400`,group:`project`,enabled:!1},{id:`sample`,name:`Ejemplo`,name_i18n:{en:`Sample`},description:`Extensión de ejemplo`,description_i18n:{en:`Sample extension`},icon:`puzzle`,url:`http://sample.localhost:8400`,group:`extension`,enabled:!0}]}var h=e=>new Promise(t=>setTimeout(t,e)),g=e=>new Date(Date.now()-e).toISOString();function _(e,t){let r=new Map(n(i(e)).map(e=>[e.name,e])),a=n(i(t)),o=[],s=0,c=0,l=0;for(let e of a){let t=r.get(e.name);if(r.delete(e.name),!t){s++,o.push(`bot "${e.name}": create (${e.model} · Ask · computer off)`);continue}let n=[];t.model!==e.model&&n.push(`model ${t.model} → ${e.model}`),t.title!==e.title&&n.push(`title "${t.title}" → "${e.title}"`),JSON.stringify(t.soul)!==JSON.stringify(e.soul)&&n.push(`soul changed`),n.length===0&&t.fingerprint!==e.fingerprint&&n.push(`settings changed`),n.length?(c++,o.push(`bot "${e.name}": update ${n.join(`; `)}`)):l++}for(let e of r.keys())o.push(`bot "${e}": not in file (kept)`);return{plan:o,created:s,changed:c,unchanged:l,deleted:0,warnings:[]}}function v(l){let v=l===`empty`?s:o,y=v,b=new Map,x=new Map,S=0,C=new Set(l===`empty`?[]:[`sample`]),w=new Set(l===`empty`?[]:[`claude-desktop`]),T=new Map(l===`empty`?[]:[[`sample`,`v1.2.0`]]),E=()=>{let e=r(n(i(v))).length;return{checkedAt:new Date().toISOString(),engines:d(l),bots:{count:e,pending:v===y?0:1,ok:v===y},dagu:{ok:!0,botsConnected:e}}},D=e=>(b.set(e.id,e),x.set(e.dag,e),e);if(l!==`first`){let t=l===`failed`?6e4:72e5,n=E();n.checkedAt=g(t),D({dag:e.setupCheck,id:`past-check`,createdAt:0,duration:0,outcome:`succeeded`,done:!0,outputs:()=>({check:JSON.stringify(n)}),past:{startedAt:g(t+9e3),finishedAt:g(t)}}),D({dag:e.snapshot,id:`past-snapshot`,createdAt:0,duration:0,outcome:`succeeded`,done:!0,outputs:()=>({result:`committed 4f2a9c1`}),past:{startedAt:g(724e3),finishedAt:g(72e4)}})}function O(e){if(e.past)return{id:e.id,statusLabel:e.outcome,...e.past};let t=Date.now()-e.createdAt,n=new Date(e.createdAt+500).toISOString();return t<500?{id:e.id,statusLabel:`queued`}:t<e.duration?{id:e.id,statusLabel:`running`,startedAt:n}:(e.done||(e.done=!0,e.outcome===`succeeded`&&e.onDone?.()),{id:e.id,statusLabel:e.outcome,startedAt:n,finishedAt:new Date(e.createdAt+e.duration).toISOString(),error:e.error})}function k(e,t,n,r){let i=r?.MODE??`connect`,o=r?.TARGET??``;if(i===`status`){D({dag:e,id:t,createdAt:n,duration:900,outcome:`succeeded`,outputs:()=>({result:JSON.stringify({mode:i,server:`fyso-${a.slug}`,agents:u.map(e=>({...e,connected:w.has(e.id)}))})})});return}if(i===`remote`){D({dag:e,id:t,createdAt:n,duration:1200,outcome:`succeeded`,outputs:()=>({result:JSON.stringify({mode:i,server:`fyso-${a.slug}`,url:`${location.origin}/mcp`,created:!1})})});return}let s=l===`failed`&&i===`connect`;!s&&i===`connect`&&w.add(o),i===`disconnect`&&w.delete(o),D({dag:e,id:t,createdAt:n,duration:1800,outcome:s?`failed`:`succeeded`,error:s?`Assistant CLI not found on the Dagu host`:void 0,outputs:()=>({result:JSON.stringify({target:o,mode:i,message:`Mock: no assistant configuration was changed`})})})}return{initialDraft:l===`failed`||l===`applyfail`?c:null,async getBotVersioning(){return{collectedAt:new Date().toISOString(),commit:null,bots:[]}},async getRuntimeBots(){return[]},async getObservability(){throw Error(`Observability requires the real stack`)},async getProject(){return await h(150),a},async getTeam(){return await h(200),v},async getApps(){return await h(250),m(l)},async getExtensions(){await h(250);let e=f(l),t=[...C].filter(t=>!e.some(e=>e.id===t)).map(e=>({id:e,src:`gh:fyso/fyso-ext-${e}`,version:T.get(e)??null,apps:[],secrets:[],mcpServers:[],workflows:[],skills:[]}));return[...e.map(e=>({...e,version:T.get(e.id)??e.version})),...t]},async enqueue(n,r){await h(200);let i=`mock-${++S}`,a=Date.now(),o=r?.TEAM_B64?t(r.TEAM_B64):v;switch(n){case e.agentConnect:k(n,i,a,r);break;case e.setupCheck:D({dag:n,id:i,createdAt:a,duration:3500,outcome:`succeeded`,outputs:()=>({check:JSON.stringify(E())})});break;case e.botsPlan:D({dag:n,id:i,createdAt:a,duration:2200,outcome:`succeeded`,outputs:()=>({plan:JSON.stringify(_(y,o))})});break;case e.botsApply:{let t=l===`applyfail`,r=_(y,o);D({dag:n,id:i,createdAt:a,duration:4200,outcome:t?`failed`:`succeeded`,error:t?`openmausbot team apply: bot "Driver Desk": model claude/claude-haiku-4-5 is not available for engine claude (exit 4)`:void 0,outputs:()=>t?{}:{apply:JSON.stringify({created:r.created,changed:r.changed,deleted:r.deleted,commit:`9b7e21d`})},onDone:()=>{v=o,y=o,D({dag:e.snapshot,id:`${i}-snap`,createdAt:0,duration:0,outcome:`succeeded`,done:!0,outputs:()=>({result:`committed 9b7e21d`}),past:{startedAt:new Date(a).toISOString(),finishedAt:new Date().toISOString()}})}});break}case e.snapshot:D({dag:n,id:i,createdAt:a,duration:2600,outcome:`succeeded`,outputs:()=>({result:`committed 3c81e07`})});break;case e.extCatalog:D({dag:n,id:i,createdAt:a,duration:1800,outcome:`succeeded`,outputs:()=>({catalog:JSON.stringify(p(C,T))})});break;case e.extInstall:{let e=r?.ID??``,t=l===`failed`,o=p(C,T).extensions.find(t=>t.id===e)?.latest??null;D({dag:n,id:i,createdAt:a,duration:3800,outcome:t?`failed`:`succeeded`,error:t?`error: the project has uncommitted changes; commit or discard them before upgrading`:void 0,outputs:()=>({result:JSON.stringify({id:e,mode:r?.MODE??`add`,version:o,commit:`5e0c1aa`})}),onDone:()=>{C.add(e),o&&T.set(e,o)}});break}case e.update:{let e=l===`failed`;D({dag:n,id:i,createdAt:a,duration:4200,outcome:e?`failed`:`succeeded`,error:e?`error: the update conflicts with local changes; nothing was applied: ./Caddyfile`:void 0,outputs:()=>({result:JSON.stringify({from:`58f57cf`,to:`73b74c2`,commit:`1dcf4be`,changed:!0})})});break}default:throw Error(`mock: unknown DAG ${n}`)}return i},async getRun(e,t){await h(80);let n=b.get(t);if(!n)throw Error(`mock: run ${t} not found`);return O(n)},async getOutputs(e,t){return await h(80),b.get(t)?.outputs()??{}},async lastRun(e){await h(180);let t=x.get(e);return t?O(t):null},async probe(e){return await h(500+Math.random()*600),!e.includes(`deliveries`)}}}export{v as createMockBackend};