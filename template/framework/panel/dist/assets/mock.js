import{a as e,i as t,n,r,t as i}from"./index.js";var a={name:`Foo project`,slug:`foo-project`,env:`local`,urls:{dagu:`http://dagu.localhost:8400`,omb:`http://omb.localhost:8400`}},o=`# This project's bots, in OpenMausBot's native team file format (PLAN §5).
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
`,l=[`claude-opus-5-5`,`claude-sonnet-5-5`,`claude-sonnet-5`,`claude-haiku-4-5`];function u(e){return[{id:`claude`,label:`Claude`,kind:`subscription`,ok:!0,models:l},{id:`claudeApi`,label:`Claude`,kind:`api`,ok:!0,models:l},{id:`codex`,label:`Codex`,kind:`subscription`,ok:e!==`failed`,models:[`gpt-5.5-codex`,`gpt-5.5`],fixHint:`codex login --device-auth`}]}function d(e){return e===`empty`?[]:[{id:`sample`,src:`gh:fyso/ext-sample`,version:`v1.2.0`,apps:[`sample`],secrets:[{name:`SAMPLE_TOKEN`,description:`Token de ejemplo`,description_i18n:{en:`Sample token`},required:!0,set:e!==`failed`},{name:`SAMPLE_WEBHOOK`,required:!1,set:!1}],mcpServers:[`sample`],workflows:[`ext-sample-report`],skills:[`sample-ops`]}]}function f(e,t){return{collectedAt:new Date().toISOString(),catalogs:[{source:`gh:fyso-dev/fyso-extensions`,name:`Fyso`},{source:`gh:acme/fyso-catalog`,name:`Acme`}],extensions:[{id:`sample`,src:`gh:fyso/ext-sample`,catalog:`Fyso`,name:`Ejemplo`,name_i18n:{en:`Sample`},description:`Sitio estático de ejemplo`,description_i18n:{en:`Sample static site`},tags:[`demo`],latest:`v1.3.0`},{id:`netbird`,src:`gh:fyso/fyso-ext-netbird`,catalog:`Fyso`,name:`NetBird`,description:`Red privada entre hosts`,description_i18n:{en:`Private network between hosts`},tags:[`network`,`multi-host`],homepage:`https://netbird.io`,latest:`v0.4.1`},{id:`metabase`,src:`gh:acme/fyso-ext-metabase`,catalog:`Acme`,name:`Metabase`,description:`Tableros sobre los datos del proyecto`,description_i18n:{en:`Dashboards over project data`},tags:[`data`],latest:null}].map(n=>{let r=t.get(n.id)??null,i=e.has(n.id);return{...n,installed:i,version:r,update:i&&!!n.latest&&r!==n.latest}})}}function p(e){let t=[{id:`dagu`,name:`Dagu`,name_i18n:{es:`Dagu`,en:`Dagu`},description:`Workflows y ejecuciones`,description_i18n:{en:`Workflows and runs`},icon:`workflow`,url:a.urls.dagu,group:`framework`,enabled:!0},{id:`omb`,name:`OpenMausBot`,description:`Bots y aprobaciones`,description_i18n:{en:`Bots and approvals`},icon:`bot`,url:a.urls.omb,group:`framework`,enabled:!0,accessNote:`Login del proyecto; no requiere código de emparejamiento`,accessNote_i18n:{en:`Project login; no pairing code required`}}];return e===`empty`?t:[...t,{id:`drivers`,name:`Choferes`,name_i18n:{en:`Drivers`},description:`Legajos y turnos`,description_i18n:{en:`Records and shifts`},icon:`users`,url:`http://drivers.localhost:8400`,group:`project`,enabled:!0},{id:`deliveries`,name:`Entregas`,name_i18n:{en:`Deliveries`},description:`Seguimiento por zona`,description_i18n:{en:`Tracking by zone`},icon:`truck`,url:`http://deliveries.localhost:8400`,group:`project`,enabled:!0},{id:`reports`,name:`Reportes`,name_i18n:{en:`Reports`},description:`Resumen semanal`,description_i18n:{en:`Weekly summary`},icon:`chart`,url:`http://reports.localhost:8400`,group:`project`,enabled:!1},{id:`sample`,name:`Ejemplo`,name_i18n:{en:`Sample`},description:`Extensión de ejemplo`,description_i18n:{en:`Sample extension`},icon:`puzzle`,url:`http://sample.localhost:8400`,group:`extension`,enabled:!0}]}var m=e=>new Promise(t=>setTimeout(t,e)),h=e=>new Date(Date.now()-e).toISOString();function g(e,n){let i=new Map(t(r(e)).map(e=>[e.name,e])),a=t(r(n)),o=[],s=0,c=0,l=0;for(let e of a){let t=i.get(e.name);if(i.delete(e.name),!t){s++,o.push(`bot "${e.name}": create (${e.model} · Ask · computer off)`);continue}let n=[];t.model!==e.model&&n.push(`model ${t.model} → ${e.model}`),t.title!==e.title&&n.push(`title "${t.title}" → "${e.title}"`),JSON.stringify(t.soul)!==JSON.stringify(e.soul)&&n.push(`soul changed`),n.length===0&&t.fingerprint!==e.fingerprint&&n.push(`settings changed`),n.length?(c++,o.push(`bot "${e.name}": update ${n.join(`; `)}`)):l++}for(let e of i.keys())o.push(`bot "${e}": not in file (kept)`);return{plan:o,created:s,changed:c,unchanged:l,deleted:0,warnings:[]}}function _(l){let _=l===`empty`?s:o,v=_,y=new Map,b=new Map,x=0,S=new Set(l===`empty`?[]:[`sample`]),C=new Map(l===`empty`?[]:[[`sample`,`v1.2.0`]]),w=()=>{let e=n(t(r(_))).length;return{checkedAt:new Date().toISOString(),engines:u(l),bots:{count:e,pending:_===v?0:1,ok:_===v},dagu:{ok:!0,botsConnected:e}}},T=e=>(y.set(e.id,e),b.set(e.dag,e),e);if(l!==`first`){let t=l===`failed`?6e4:72e5,n=w();n.checkedAt=h(t),T({dag:e.setupCheck,id:`past-check`,createdAt:0,duration:0,outcome:`succeeded`,done:!0,outputs:()=>({check:JSON.stringify(n)}),past:{startedAt:h(t+9e3),finishedAt:h(t)}}),T({dag:e.snapshot,id:`past-snapshot`,createdAt:0,duration:0,outcome:`succeeded`,done:!0,outputs:()=>({result:`committed 4f2a9c1`}),past:{startedAt:h(724e3),finishedAt:h(72e4)}})}function E(e){if(e.past)return{id:e.id,statusLabel:e.outcome,...e.past};let t=Date.now()-e.createdAt,n=new Date(e.createdAt+500).toISOString();return t<500?{id:e.id,statusLabel:`queued`}:t<e.duration?{id:e.id,statusLabel:`running`,startedAt:n}:(e.done||(e.done=!0,e.outcome===`succeeded`&&e.onDone?.()),{id:e.id,statusLabel:e.outcome,startedAt:n,finishedAt:new Date(e.createdAt+e.duration).toISOString(),error:e.error})}return{initialDraft:l===`failed`||l===`applyfail`?c:null,async getBotVersioning(){return{collectedAt:new Date().toISOString(),commit:null,bots:[]}},async getRuntimeBots(){return[]},async getObservability(){throw Error(`Observability requires the real stack`)},async getProject(){return await m(150),a},async getTeam(){return await m(200),_},async getApps(){return await m(250),p(l)},async getExtensions(){await m(250);let e=d(l),t=[...S].filter(t=>!e.some(e=>e.id===t)).map(e=>({id:e,src:`gh:fyso/fyso-ext-${e}`,version:C.get(e)??null,apps:[],secrets:[],mcpServers:[],workflows:[],skills:[]}));return[...e.map(e=>({...e,version:C.get(e.id)??e.version})),...t]},async enqueue(t,n){await m(200);let r=`mock-${++x}`,a=Date.now(),o=n?.TEAM_B64?i(n.TEAM_B64):_;switch(t){case e.setupCheck:T({dag:t,id:r,createdAt:a,duration:3500,outcome:`succeeded`,outputs:()=>({check:JSON.stringify(w())})});break;case e.botsPlan:T({dag:t,id:r,createdAt:a,duration:2200,outcome:`succeeded`,outputs:()=>({plan:JSON.stringify(g(v,o))})});break;case e.botsApply:{let n=l===`applyfail`,i=g(v,o);T({dag:t,id:r,createdAt:a,duration:4200,outcome:n?`failed`:`succeeded`,error:n?`openmausbot team apply: bot "Driver Desk": model claude/claude-haiku-4-5 is not available for engine claude (exit 4)`:void 0,outputs:()=>n?{}:{apply:JSON.stringify({created:i.created,changed:i.changed,deleted:i.deleted,commit:`9b7e21d`})},onDone:()=>{_=o,v=o,T({dag:e.snapshot,id:`${r}-snap`,createdAt:0,duration:0,outcome:`succeeded`,done:!0,outputs:()=>({result:`committed 9b7e21d`}),past:{startedAt:new Date(a).toISOString(),finishedAt:new Date().toISOString()}})}});break}case e.snapshot:T({dag:t,id:r,createdAt:a,duration:2600,outcome:`succeeded`,outputs:()=>({result:`committed 3c81e07`})});break;case e.extCatalog:T({dag:t,id:r,createdAt:a,duration:1800,outcome:`succeeded`,outputs:()=>({catalog:JSON.stringify(f(S,C))})});break;case e.extInstall:{let e=n?.ID??``,i=l===`failed`,o=f(S,C).extensions.find(t=>t.id===e)?.latest??null;T({dag:t,id:r,createdAt:a,duration:3800,outcome:i?`failed`:`succeeded`,error:i?`error: the project has uncommitted changes; commit or discard them before upgrading`:void 0,outputs:()=>({result:JSON.stringify({id:e,mode:n?.MODE??`add`,version:o,commit:`5e0c1aa`})}),onDone:()=>{S.add(e),o&&C.set(e,o)}});break}default:throw Error(`mock: unknown DAG ${t}`)}return r},async getRun(e,t){await m(80);let n=y.get(t);if(!n)throw Error(`mock: run ${t} not found`);return E(n)},async getOutputs(e,t){return await m(80),y.get(t)?.outputs()??{}},async lastRun(e){await m(180);let t=b.get(e);return t?E(t):null},async probe(e){return await m(500+Math.random()*600),!e.includes(`deliveries`)}}}export{_ as createMockBackend};