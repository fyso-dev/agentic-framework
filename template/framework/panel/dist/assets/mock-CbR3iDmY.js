import{a as e,i as t,n,r,t as i}from"./index-CX3acZiH.js";var a={name:`Foo project`,slug:`foo-project`,env:`local`,urls:{dagu:`http://dagu.localhost:8400`,omb:`http://omb.localhost:8400`}},o=`# This project's bots, in OpenMausBot's native team file format (PLAN §5).
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
`,l=[`claude-opus-5-5`,`claude-sonnet-5-5`,`claude-sonnet-5`,`claude-haiku-4-5`];function u(e){return[{id:`claude`,label:`Claude`,kind:`subscription`,ok:!0,models:l},{id:`claudeApi`,label:`Claude`,kind:`api`,ok:!0,models:l},{id:`codex`,label:`Codex`,kind:`subscription`,ok:e!==`failed`,models:[`gpt-5.5-codex`,`gpt-5.5`],fixHint:`codex login --device-auth`}]}function d(e){return e===`empty`?[]:[{id:`sample`,src:`gh:fyso/ext-sample`,version:`v1.2.0`,apps:[`sample`],secrets:[{name:`SAMPLE_TOKEN`,description:`Token de ejemplo`,description_i18n:{en:`Sample token`},required:!0,set:e!==`failed`},{name:`SAMPLE_WEBHOOK`,required:!1,set:!1}],mcpServers:[`sample`],workflows:[`ext-sample-report`],skills:[`sample-ops`]}]}function f(e){let t=[{id:`dagu`,name:`Dagu`,name_i18n:{es:`Dagu`,en:`Dagu`},description:`Workflows y ejecuciones`,description_i18n:{en:`Workflows and runs`},icon:`workflow`,url:a.urls.dagu,group:`framework`,enabled:!0},{id:`omb`,name:`OpenMausBot`,description:`Bots y aprobaciones`,description_i18n:{en:`Bots and approvals`},icon:`bot`,url:a.urls.omb,group:`framework`,enabled:!0,accessNote:`Login del proyecto; no requiere código de emparejamiento`,accessNote_i18n:{en:`Project login; no pairing code required`}}];return e===`empty`?t:[...t,{id:`drivers`,name:`Choferes`,name_i18n:{en:`Drivers`},description:`Legajos y turnos`,description_i18n:{en:`Records and shifts`},icon:`users`,url:`http://drivers.localhost:8400`,group:`project`,enabled:!0},{id:`deliveries`,name:`Entregas`,name_i18n:{en:`Deliveries`},description:`Seguimiento por zona`,description_i18n:{en:`Tracking by zone`},icon:`truck`,url:`http://deliveries.localhost:8400`,group:`project`,enabled:!0},{id:`reports`,name:`Reportes`,name_i18n:{en:`Reports`},description:`Resumen semanal`,description_i18n:{en:`Weekly summary`},icon:`chart`,url:`http://reports.localhost:8400`,group:`project`,enabled:!1},{id:`sample`,name:`Ejemplo`,name_i18n:{en:`Sample`},description:`Extensión de ejemplo`,description_i18n:{en:`Sample extension`},icon:`puzzle`,url:`http://sample.localhost:8400`,group:`extension`,enabled:!0}]}var p=e=>new Promise(t=>setTimeout(t,e)),m=e=>new Date(Date.now()-e).toISOString();function h(e,n){let i=new Map(t(r(e)).map(e=>[e.name,e])),a=t(r(n)),o=[],s=0,c=0,l=0;for(let e of a){let t=i.get(e.name);if(i.delete(e.name),!t){s++,o.push(`bot "${e.name}": create (${e.model} · Ask · computer off)`);continue}let n=[];t.model!==e.model&&n.push(`model ${t.model} → ${e.model}`),t.title!==e.title&&n.push(`title "${t.title}" → "${e.title}"`),JSON.stringify(t.soul)!==JSON.stringify(e.soul)&&n.push(`soul changed`),n.length===0&&t.fingerprint!==e.fingerprint&&n.push(`settings changed`),n.length?(c++,o.push(`bot "${e.name}": update ${n.join(`; `)}`)):l++}for(let e of i.keys())o.push(`bot "${e}": not in file (kept)`);return{plan:o,created:s,changed:c,unchanged:l,deleted:0,warnings:[]}}function g(l){let g=l===`empty`?s:o,_=g,v=new Map,y=new Map,b=0,x=()=>{let e=n(t(r(g))).length;return{checkedAt:new Date().toISOString(),engines:u(l),bots:{count:e,pending:g===_?0:1,ok:g===_},dagu:{ok:!0,botsConnected:e}}},S=e=>(v.set(e.id,e),y.set(e.dag,e),e);if(l!==`first`){let t=l===`failed`?6e4:72e5,n=x();n.checkedAt=m(t),S({dag:e.setupCheck,id:`past-check`,createdAt:0,duration:0,outcome:`succeeded`,done:!0,outputs:()=>({check:JSON.stringify(n)}),past:{startedAt:m(t+9e3),finishedAt:m(t)}}),S({dag:e.snapshot,id:`past-snapshot`,createdAt:0,duration:0,outcome:`succeeded`,done:!0,outputs:()=>({result:`committed 4f2a9c1`}),past:{startedAt:m(724e3),finishedAt:m(72e4)}})}function C(e){if(e.past)return{id:e.id,statusLabel:e.outcome,...e.past};let t=Date.now()-e.createdAt,n=new Date(e.createdAt+500).toISOString();return t<500?{id:e.id,statusLabel:`queued`}:t<e.duration?{id:e.id,statusLabel:`running`,startedAt:n}:(e.done||(e.done=!0,e.outcome===`succeeded`&&e.onDone?.()),{id:e.id,statusLabel:e.outcome,startedAt:n,finishedAt:new Date(e.createdAt+e.duration).toISOString(),error:e.error})}return{initialDraft:l===`failed`||l===`applyfail`?c:null,async getBotVersioning(){return{collectedAt:new Date().toISOString(),commit:null,bots:[]}},async getRuntimeBots(){return[]},async getObservability(){throw Error(`Observability requires the real stack`)},async getProject(){return await p(150),a},async getTeam(){return await p(200),g},async getApps(){return await p(250),f(l)},async getExtensions(){return await p(250),d(l)},async enqueue(t,n){await p(200);let r=`mock-${++b}`,a=Date.now(),o=n?.TEAM_B64?i(n.TEAM_B64):g;switch(t){case e.setupCheck:S({dag:t,id:r,createdAt:a,duration:3500,outcome:`succeeded`,outputs:()=>({check:JSON.stringify(x())})});break;case e.botsPlan:S({dag:t,id:r,createdAt:a,duration:2200,outcome:`succeeded`,outputs:()=>({plan:JSON.stringify(h(_,o))})});break;case e.botsApply:{let n=l===`applyfail`,i=h(_,o);S({dag:t,id:r,createdAt:a,duration:4200,outcome:n?`failed`:`succeeded`,error:n?`openmausbot team apply: bot "Driver Desk": model claude/claude-haiku-4-5 is not available for engine claude (exit 4)`:void 0,outputs:()=>n?{}:{apply:JSON.stringify({created:i.created,changed:i.changed,deleted:i.deleted,commit:`9b7e21d`})},onDone:()=>{g=o,_=o,S({dag:e.snapshot,id:`${r}-snap`,createdAt:0,duration:0,outcome:`succeeded`,done:!0,outputs:()=>({result:`committed 9b7e21d`}),past:{startedAt:new Date(a).toISOString(),finishedAt:new Date().toISOString()}})}});break}case e.snapshot:S({dag:t,id:r,createdAt:a,duration:2600,outcome:`succeeded`,outputs:()=>({result:`committed 3c81e07`})});break;default:throw Error(`mock: unknown DAG ${t}`)}return r},async getRun(e,t){await p(80);let n=v.get(t);if(!n)throw Error(`mock: run ${t} not found`);return C(n)},async getOutputs(e,t){return await p(80),v.get(t)?.outputs()??{}},async lastRun(e){await p(180);let t=y.get(e);return t?C(t):null},async probe(e){return await p(500+Math.random()*600),!e.includes(`deliveries`)}}}export{g as createMockBackend};