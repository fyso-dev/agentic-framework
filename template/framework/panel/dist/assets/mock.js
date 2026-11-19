import{Ct as e,Dt as t,Et as n,Lt as r,Tt as i}from"./Action.js";var a={name:`Foo project`,slug:`foo-project`,env:`local`,urls:{dagu:`http://dagu.localhost:8400`,omb:`http://omb.localhost:8400`},framework:{commit:`58f57cf`,src:`https://github.com/fyso-dev/agentic-framework.git`}},o=`# This project's bots, in OpenMausBot's native team file format (PLAN §5).
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
    title: Designs and fixes automations
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
`,l=[`claude-opus-5-5`,`claude-sonnet-5-5`,`claude-sonnet-5`,`claude-haiku-4-5`],u=[{id:`claude-desktop`,label:`Claude Desktop`,desktop:!0,found:!0},{id:`codex`,label:`Codex (app and CLI)`,desktop:!0,found:!0},{id:`claude-code`,label:`Claude Code (CLI)`,desktop:!1,found:!1}];function d(e){return[{id:`claude`,label:`Claude`,kind:`subscription`,ok:!0,models:l},{id:`claudeApi`,label:`Claude`,kind:`api`,ok:!0,models:l},{id:`codex`,label:`Codex`,kind:`subscription`,ok:e!==`failed`,models:[`gpt-5.5-codex`,`gpt-5.5`],fixHint:`codex login --device-auth`}]}function f(e){return e===`empty`?[]:[{id:`sample`,src:`gh:fyso/ext-sample`,version:`v1.2.0`,apps:[`sample`],secrets:[{name:`SAMPLE_TOKEN`,description:`Token de ejemplo`,description_i18n:{en:`Sample token`},required:!0,set:e!==`failed`},{name:`SAMPLE_WEBHOOK`,required:!1,set:!1}],mcpServers:[`sample`],workflows:[`ext-sample-report`],skills:[`sample-ops`]}]}var p=`---
name: brand-guidelines
description: Demonstration skill for panel review.
license: Apache-2.0
---

# Demo skill

This is fictional content used to test the panel review flow.
`,m=(e,t,n=[])=>({name:e,description:e===`pdf-forms`?`Fills PDF forms.`:`Applies the brand colors and typography.`,src:`gh:anthropics/skills`,path:`skills/${e}`,commit:`2c5958ecac7cee2b583967a2c4981d0f4a75c579`,license:`Apache-2.0`,licenseFile:`LICENSE.txt`,licenseTitle:`Apache License`,sha256:`10067cdd9be9cd5d97c741fc6e25830135afa0e11cc71e567b75763e26d08799`,files:2,installedAt:`2026-11-11T12:00:00.000Z`,scan:{at:`2026-11-11T12:00:01.000Z`,warnings:n},review:t===`ready`?{at:`2026-11-11T12:05:00.000Z`}:null,state:t,bots:[]});function h(e,t){return{collectedAt:new Date().toISOString(),catalogs:[{source:`gh:fyso-dev/fyso-extensions`,name:`Fyso`},{source:`gh:acme/fyso-catalog`,name:`Acme`}],extensions:[{id:`sample`,src:`gh:fyso/ext-sample`,catalog:`Fyso`,name:`Ejemplo`,name_i18n:{en:`Sample`},description:`Sitio estático de ejemplo`,description_i18n:{en:`Sample static site`},tags:[`demo`],latest:`v1.3.0`},{id:`netbird`,src:`gh:fyso/fyso-ext-netbird`,catalog:`Fyso`,name:`NetBird`,description:`Red privada entre hosts`,description_i18n:{en:`Private network between hosts`},tags:[`network`,`multi-host`],homepage:`https://netbird.io`,latest:`v0.4.1`},{id:`metabase`,src:`gh:acme/fyso-ext-metabase`,catalog:`Acme`,name:`Metabase`,description:`Tableros sobre los datos del proyecto`,description_i18n:{en:`Dashboards over project data`},tags:[`data`],latest:null}].map(n=>{let r=t.get(n.id)??null,i=e.has(n.id);return{...n,installed:i,version:r,update:i&&!!n.latest&&r!==n.latest}})}}function g(e){let t=[{id:`dagu`,name:`Automatizaciones`,name_i18n:{es:`Automatizaciones`,en:`Automations`},description:`Flujos de trabajo y ejecuciones`,description_i18n:{en:`Workflows and runs`},icon:`workflow`,url:a.urls.dagu,group:`framework`,enabled:!0,embed:!0},{id:`omb`,name:`Agentes`,name_i18n:{es:`Agentes`,en:`Agents`},description:`Conversaciones con los agentes`,description_i18n:{en:`Conversations with the agents`},icon:`bot`,url:a.urls.omb,group:`framework`,enabled:!0,embed:!0,accessNote:`Login del proyecto; no requiere código de emparejamiento`,accessNote_i18n:{en:`Project login; no pairing code required`}}];return e===`empty`?t:[...t,{id:`drivers`,name:`Choferes`,name_i18n:{en:`Drivers`},description:`Legajos y turnos`,description_i18n:{en:`Records and shifts`},icon:`users`,url:`http://drivers.localhost:8400`,group:`project`,enabled:!0},{id:`deliveries`,name:`Entregas`,name_i18n:{en:`Deliveries`},description:`Seguimiento por zona`,description_i18n:{en:`Tracking by zone`},icon:`truck`,url:`http://deliveries.localhost:8400`,group:`project`,enabled:!0},{id:`reports`,name:`Reportes`,name_i18n:{en:`Reports`},description:`Resumen semanal`,description_i18n:{en:`Weekly summary`},icon:`chart`,url:`http://reports.localhost:8400`,group:`project`,enabled:!1},{id:`sample`,name:`Ejemplo`,name_i18n:{en:`Sample`},description:`Extensión de ejemplo`,description_i18n:{en:`Sample extension`},icon:`puzzle`,url:`http://sample.localhost:8400`,group:`extension`,enabled:!0}]}var _=e=>new Promise(t=>setTimeout(t,e)),v=e=>new Date(Date.now()-e).toISOString();function y(e,r){let i=new Map(t(n(e)).map(e=>[e.name,e])),a=t(n(r)),o=[],s=0,c=0,l=0;for(let e of a){let t=i.get(e.name);if(i.delete(e.name),!t){s++,o.push(`bot "${e.name}": create (${e.model} · Ask · computer off)`);continue}let n=[];t.model!==e.model&&n.push(`model ${t.model} → ${e.model}`),t.title!==e.title&&n.push(`title "${t.title}" → "${e.title}"`),JSON.stringify(t.soul)!==JSON.stringify(e.soul)&&n.push(`soul changed`),n.length===0&&t.fingerprint!==e.fingerprint&&n.push(`settings changed`),n.length?(c++,o.push(`bot "${e.name}": update ${n.join(`; `)}`)):l++}for(let e of i.keys())o.push(`bot "${e}": not in file (kept)`);return{plan:o,created:s,changed:c,unchanged:l,deleted:0,warnings:[]}}function b(l){let b=l===`empty`?s:o,x=b,S=new Map,C=new Map,w=0,T=new Set(l===`empty`?[]:[`sample`]),E=new Map(l===`empty`?[]:[[`brand-guidelines`,m(`brand-guidelines`,`ready`)]]),D=new Set(l===`empty`?[]:[`claude-desktop`]),O=new Map(l===`empty`?[]:[[`sample`,`v1.2.0`]]),k=()=>{let e=i(t(n(b))).length;return{checkedAt:new Date().toISOString(),engines:d(l),bots:{count:e,pending:b===x?0:1,ok:b===x},dagu:{ok:!0,botsConnected:e}}},A=e=>(S.set(e.id,e),C.set(e.dag,e),e);if(l!==`first`){let e=l===`failed`?6e4:72e5,t=k();t.checkedAt=v(e),A({dag:r.setupCheck,id:`past-check`,createdAt:0,duration:0,outcome:`succeeded`,done:!0,outputs:()=>({check:JSON.stringify(t)}),past:{startedAt:v(e+9e3),finishedAt:v(e)}}),A({dag:r.snapshot,id:`past-snapshot`,createdAt:0,duration:0,outcome:`succeeded`,done:!0,outputs:()=>({result:`committed 4f2a9c1`}),past:{startedAt:v(724e3),finishedAt:v(72e4)}})}function j(e){if(e.past)return{id:e.id,statusLabel:e.outcome,...e.past};let t=Date.now()-e.createdAt,n=new Date(e.createdAt+500).toISOString();return t<500?{id:e.id,statusLabel:`queued`}:t<e.duration?{id:e.id,statusLabel:`running`,startedAt:n}:(e.done||(e.done=!0,e.outcome===`succeeded`&&e.onDone?.()),{id:e.id,statusLabel:e.outcome,startedAt:n,finishedAt:new Date(e.createdAt+e.duration).toISOString(),error:e.error})}function M(e,t,n,r){let i=r?.MODE??`connect`,o=r?.TARGET??``;if(i===`status`){A({dag:e,id:t,createdAt:n,duration:900,outcome:`succeeded`,outputs:()=>({result:JSON.stringify({mode:i,server:`fyso-${a.slug}`,agents:u.map(e=>({...e,connected:D.has(e.id)}))})})});return}if(i===`remote`){A({dag:e,id:t,createdAt:n,duration:1200,outcome:`succeeded`,outputs:()=>({result:JSON.stringify({mode:i,server:`fyso-${a.slug}`,url:`${location.origin}/mcp`,created:!1})})});return}let s=l===`failed`&&i===`connect`;!s&&i===`connect`&&D.add(o),i===`disconnect`&&D.delete(o),A({dag:e,id:t,createdAt:n,duration:1800,outcome:s?`failed`:`succeeded`,error:s?`Assistant CLI not found on the Dagu host`:void 0,outputs:()=>({result:JSON.stringify({target:o,mode:i,message:`Mock: no assistant configuration was changed`})})})}return{initialDraft:l===`failed`||l===`applyfail`?c:null,async getBotVersioning(){return{collectedAt:new Date().toISOString(),commit:null,bots:[]}},async getRuntimeBots(){return[]},async getObservability(){throw Error(`Observability requires the real stack`)},async getProject(){return await _(150),a},async getTeam(){return await _(200),b},async getApps(){return await _(250),g(l)},async getExtensions(){await _(250);let e=f(l),t=[...T].filter(t=>!e.some(e=>e.id===t)).map(e=>({id:e,src:`gh:fyso/fyso-ext-${e}`,version:O.get(e)??null,apps:[],secrets:[],mcpServers:[],workflows:[],skills:[]}));return[...e.filter(e=>T.has(e.id)).map(e=>({...e,version:O.get(e.id)??e.version})),...t]},async getSkills(){return await _(200),[...E.values()]},async enqueue(t,n){await _(200);let i=`mock-${++w}`,a=Date.now(),o=n?.TEAM_B64?e(n.TEAM_B64):b;switch(t){case r.agentConnect:M(t,i,a,n);break;case r.setupCheck:A({dag:t,id:i,createdAt:a,duration:3500,outcome:`succeeded`,outputs:()=>({check:JSON.stringify(k())})});break;case r.botsPlan:A({dag:t,id:i,createdAt:a,duration:2200,outcome:`succeeded`,outputs:()=>({plan:JSON.stringify(y(x,o))})});break;case r.botsApply:{let e=l===`applyfail`,n=y(x,o);A({dag:t,id:i,createdAt:a,duration:4200,outcome:e?`failed`:`succeeded`,error:e?`openmausbot team apply: bot "Driver Desk": model claude/claude-haiku-4-5 is not available for engine claude (exit 4)`:void 0,outputs:()=>e?{}:{apply:JSON.stringify({created:n.created,changed:n.changed,deleted:n.deleted,commit:`9b7e21d`})},onDone:()=>{b=o,x=o,A({dag:r.snapshot,id:`${i}-snap`,createdAt:0,duration:0,outcome:`succeeded`,done:!0,outputs:()=>({result:`committed 9b7e21d`}),past:{startedAt:new Date(a).toISOString(),finishedAt:new Date().toISOString()}})}});break}case r.snapshot:A({dag:t,id:i,createdAt:a,duration:2600,outcome:`succeeded`,outputs:()=>({result:`committed 3c81e07`})});break;case r.extCatalog:A({dag:t,id:i,createdAt:a,duration:1800,outcome:`succeeded`,outputs:()=>({catalog:JSON.stringify(h(T,O))})});break;case r.extInstall:{let e=n?.ID??``,r=l===`failed`,o=h(T,O).extensions.find(t=>t.id===e)?.latest??null;A({dag:t,id:i,createdAt:a,duration:3800,outcome:r?`failed`:`succeeded`,error:r?`error: the project has uncommitted changes; commit or discard them before upgrading`:void 0,outputs:()=>({result:JSON.stringify({id:e,mode:n?.MODE??`add`,version:o,commit:`5e0c1aa`})}),onDone:()=>{T.add(e),o&&O.set(e,o)}});break}case r.extRemove:{let e=n?.ID??``;A({dag:t,id:i,createdAt:a,duration:2600,outcome:`succeeded`,outputs:()=>({result:JSON.stringify({id:e,mode:`remove`,version:O.get(e)??null,commit:`7b2d9e4`})}),onDone:()=>T.delete(e)});break}case r.skillsCatalog:{let e=n?.NAME?E.get(n.NAME):void 0,r=n?.OP?{collectedAt:new Date().toISOString(),planId:`mock-${n.OP}-${n.NAME||n.SKILL}`,preview:{...m(n.NAME||n.SKILL||`pdf-forms`,`review`),skillMd:p.replaceAll(`brand-guidelines`,n.NAME||n.SKILL||`pdf-forms`),licenseText:`Apache License`,files:[`SKILL.md`],installed:!!e}}:e?{collectedAt:new Date().toISOString(),local:{...e,skillMd:p.replaceAll(`brand-guidelines`,e?.name||n?.SKILL||`pdf-forms`),files:[`LICENSE.txt`,`SKILL.md`]}}:n?.SRC?{collectedAt:new Date().toISOString(),preview:{...m(n.SKILL||`pdf-forms`,`review`),skillMd:p.replaceAll(`brand-guidelines`,n?.SKILL||`pdf-forms`),licenseText:`Apache License
Version 2.0, January 2004`,files:[`LICENSE.txt`,`SKILL.md`],installed:E.has(n.SKILL||`pdf-forms`)}}:{collectedAt:new Date().toISOString(),query:n?.QUERY??``,sources:[{source:`gh:anthropics/skills`,count:1},{source:`skills.sh`,count:1}],installed:[...E.values()],skills:[{...m(`pdf-forms`,`review`),origin:`source`,installed:E.has(`pdf-forms`)},{name:`report-writer`,src:`gh:acme/agent-skills`,origin:`directory`,installs:1280,url:`https://skills.sh/acme/agent-skills/report-writer`,installed:!1}]};A({dag:t,id:i,createdAt:a,duration:1500,outcome:`succeeded`,outputs:()=>({catalog:JSON.stringify(r)})});break}case r.skillsInstall:{let e=(n?.PLAN_ID||``).split(`-`),r=n?.NAME||n?.SKILL||e.slice(2).join(`-`)||``,o=n?.OP===`apply-plan`?e[1]:n?.OP??``;A({dag:t,id:i,createdAt:a,duration:2400,outcome:`succeeded`,outputs:()=>({result:JSON.stringify({op:o,name:r,commit:`7ad31c2`,skill:E.get(r)??null,...o===`update`&&{changed:!1}})}),onDone:()=>{o===`add`?E.set(r,m(r,`review`)):o===`confirm`?E.set(r,m(r,`ready`)):o===`remove`&&E.delete(r)}});break}case r.update:{let e=l===`failed`;A({dag:t,id:i,createdAt:a,duration:4200,outcome:e?`failed`:`succeeded`,error:e?`error: the update conflicts with local changes; nothing was applied: ./Caddyfile`:void 0,outputs:()=>({result:JSON.stringify({from:`58f57cf`,to:`73b74c2`,commit:`1dcf4be`,changed:!0})})});break}default:throw Error(`mock: unknown DAG ${t}`)}return i},async getRun(e,t){await _(80);let n=S.get(t);if(!n)throw Error(`mock: run ${t} not found`);return j(n)},async getOutputs(e,t){return await _(80),S.get(t)?.outputs()??{}},async lastRun(e){await _(180);let t=C.get(e);return t?j(t):null},async probe(e){return await _(500+Math.random()*600),!e.includes(`deliveries`)}}}export{b as createMockBackend};