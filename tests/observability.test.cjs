const {test} = require('node:test');
const assert = require('node:assert/strict');
const {aggregate,normalizeHarness,makeAlerts} = require('../template/framework/scripts/observability.cjs');
const row = extra => ({id:'turn',source:'omb',bot:'A',model:'model',billingKind:'api',input:10,output:2,cachedInput:4,costUsd:null,costSource:'reported',...extra});

test('missing money stays unknown while reported zero remains zero',()=>{
  assert.equal(aggregate([row({})]).totals.apiReportedUsd,null);
  assert.equal(aggregate([row({costUsd:0})]).totals.apiReportedUsd,0);
  assert.equal(aggregate([row({})]).totals.missingCost,1);
});
test('subscription equivalents, estimates and unknown engines never become API spend',()=>{
  const {totals}=aggregate([row({id:'a',costUsd:1}),row({id:'b',costUsd:20,billingKind:'subscription'}),row({id:'c',costUsd:3,costSource:'estimated'}),row({id:'d',costUsd:4,billingKind:'unknown'})]);
  assert.equal(totals.apiReportedUsd,1); assert.equal(totals.subscriptionEquivalentUsd,20);
  assert.equal(totals.estimatedApiUsd,3); assert.equal(totals.unclassifiedUsd,4);
});
test('source identities deduplicate replay but retain independently billed attempts',()=>{
  const a=row({id:'harness:dag/run/attempt1',costUsd:1});
  const b=row({id:'harness:dag/run/attempt2',costUsd:2});
  assert.equal(aggregate([a,a,b]).totals.apiReportedUsd,3);
});
test('an unknown second group does not inherit zeros from the first group',()=>{
  const {groups}=aggregate([row({id:'a',costUsd:3}),row({id:'b',bot:'B',input:null,output:null})]);
  assert.equal(groups[1].input,null); assert.equal(groups[1].apiReportedUsd,null);
});
test('Codex cached input is already included in input and is not counted twice',()=>{
  const result=normalizeHarness(JSON.stringify({type:'turn.completed',usage:{input_tokens:100,cached_input_tokens:60,output_tokens:5}}),'codex');
  assert.equal(result.input,100); assert.equal(result.cachedInput,60); assert.equal(result.costUsd,null);
});
test('Claude JSON includes cache reads/writes in total input and preserves equivalent USD',()=>{
  const result=normalizeHarness(JSON.stringify({type:'result',total_cost_usd:0.2,usage:{input_tokens:10,cache_read_input_tokens:50,cache_creation_input_tokens:20,output_tokens:3}}),'claude');
  assert.equal(result.input,80); assert.equal(result.cachedInput,50); assert.equal(result.costUsd,0.2);
});
test('empty, failed and malformed harness output never fabricates zero usage',()=>{
  for (const text of ['', 'refused', '{invalid}', '{"type":"error"}'])
    assert.equal(normalizeHarness(text,'codex').input,null);
});
test('alerts use known API report only, plus actual failure and elapsed running state',()=>{
  const alerts=makeAlerts({monthlyApiUsd:5,maxRecentFailures:1,longRunSeconds:30},{apiReportedUsd:null,subscriptionEquivalentUsd:100},[{id:'r',dag:'d',statusLabel:'failed'},{id:'s',dag:'d',statusLabel:'running',startedAt:'2026-01-01T00:00:00Z'}],[],Date.parse('2026-01-01T00:01:00Z'));
  assert.deepEqual(alerts.map(a=>a.kind),['failures','longRun']);
});

test('collector exports only whitelisted fields, tolerates corrupt rows and replays without duplication',async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {collect}=require('../template/framework/scripts/observability.cjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-observation-'));
  const data=path.join(root,'.data');
  fs.mkdirSync(path.join(data,'omb/usage'),{recursive:true});
  fs.mkdirSync(path.join(data,'dagu/data/artifacts'),{recursive:true});
  const ledger={at:'2026-11-06T00:00:00Z',botId:'b',botName:'A',threadId:'t',turnId:'turn',model:'model',driverKind:'claudeAgent',instanceId:'claudeApi',input:10,output:2,costUsd:0,costSource:'reported',prompt:'PRIVATE-MARKER',trigger:{email:'PRIVATE-MARKER'}};
  fs.writeFileSync(path.join(data,'omb/usage/2026-11.jsonl'),JSON.stringify(ledger)+'\nBAD LINE\n');
  const original=global.fetch;
  global.fetch=async url=>({ok:true,json:async()=>String(url).includes('usage/traces')?{roots:[]}:{dagRuns:[]}});
  try {
    const env={FYSO_ROOT:root,FYSO_DATA:data,FYSO_DAGU_PORT:'1',FYSO_OMB_PORT:'2'};
    const first=await collect(env,new Date('2026-11-06T01:00:00Z'));
    const second=await collect(env,new Date('2026-11-06T01:00:00Z'));
    assert.deepEqual(first.usage,second.usage);
    assert.equal(first.usage.totals.apiReportedUsd,0);
    assert.equal(first.invalidRows,1);
    assert.ok(first.warnings.includes('invalidLedgerRows'));
    assert.equal(JSON.stringify(first).includes('PRIVATE-MARKER'),false);
  } finally {global.fetch=original;fs.rmSync(root,{recursive:true,force:true});}
});

test('unavailable services remain explicit while readable usage remains available',async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {collect}=require('../template/framework/scripts/observability.cjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-observation-down-'));
  const original=global.fetch; global.fetch=async()=>{throw new Error('offline');};
  try {
    const result=await collect({FYSO_ROOT:root,FYSO_DATA:path.join(root,'.data'),FYSO_DAGU_PORT:'1',FYSO_OMB_PORT:'2'},new Date('2026-11-06T01:00:00Z'));
    assert.equal(result.sources.traces,'unavailable');assert.equal(result.sources.runs,'unavailable');
    assert.equal(result.sources.ledger,'empty');assert.equal(result.usage.totals.apiReportedUsd,null);
  } finally {global.fetch=original;fs.rmSync(root,{recursive:true,force:true});}
});

// D84: subscription windows from OMB's plan-usage report.
const planReport = {fetchedAt:'2026-11-06T00:59:00.000Z',providers:[
  {id:'claude',name:'Claude',driver:'claude',plan:'Max',ok:true,error:null,token:'SECRET-MARKER',
    fiveHour:{available:true,usedPercent:42,remainingPercent:58,resetsAt:'2026-11-06T03:00:00.000Z'},
    weekly:{available:true,usedPercent:0,remainingPercent:100,resetsAt:'2026-11-10T00:00:00.000Z'},extra:[{label:'Opus',usedPercent:9}],models:[]},
  {id:'codex',name:'Codex',driver:'codex',plan:'Pro',ok:true,error:null,
    fiveHour:{available:false,usedPercent:null,remainingPercent:null,resetsAt:null},
    weekly:{available:true,usedPercent:63,remainingPercent:37,resetsAt:'2026-11-12T00:00:00.000Z'}},
  {id:'claudeApi',name:'Claude API',driver:'claude',plan:null,ok:true,error:null,
    fiveHour:{available:true,usedPercent:42,resetsAt:'2026-11-06T03:00:00.000Z'},weekly:{available:true,usedPercent:0,resetsAt:'2026-11-10T00:00:00.000Z'}},
  {id:'claude-2',name:'Claude',driver:'claude',plan:null,ok:false,error:'Sign in to Claude again ERROR-MARKER',
    fiveHour:{available:false,usedPercent:null,remainingPercent:null,resetsAt:null},weekly:{available:false,usedPercent:null,remainingPercent:null,resetsAt:null}},
]};

test('plan usage keeps reported percentages, zero stays zero and closed or failed windows stay unknown',()=>{
  const {normalizePlanUsage}=require('../template/framework/scripts/observability.cjs');
  const rows=normalizePlanUsage(planReport);
  const find=(id,w)=>rows.find(r=>r.instanceId===id && r.window===w);
  assert.equal(rows.length,8);
  assert.deepEqual(find('claude','fiveHour'),{instanceId:'claude',engine:'claude',plan:'Max',window:'fiveHour',usedPercent:42,resetsAt:'2026-11-06T03:00:00.000Z',checkedAt:'2026-11-06T00:59:00.000Z'});
  assert.equal(find('claude','weekly').usedPercent,0);
  assert.equal(find('codex','fiveHour').usedPercent,null); assert.equal(find('codex','fiveHour').resetsAt,null);
  assert.equal(find('codex','weekly').usedPercent,63);
  assert.equal(find('claude-2','weekly').usedPercent,null);
  const text=JSON.stringify(rows);
  for (const marker of ['SECRET-MARKER','ERROR-MARKER','Opus','remainingPercent']) assert.equal(text.includes(marker),false);
});

test('plan usage with missing, malformed or out-of-range data never invents a percentage',()=>{
  const {normalizePlanUsage}=require('../template/framework/scripts/observability.cjs');
  for (const bad of [null,{},{providers:'x'},'text']) assert.throws(()=>normalizePlanUsage(bad));
  assert.deepEqual(normalizePlanUsage({providers:[]}),[]);
  const rows=normalizePlanUsage({fetchedAt:'not a date',providers:[{id:'x',ok:true,fiveHour:{available:true,usedPercent:140,resetsAt:'soon'},weekly:{available:true,usedPercent:-3}},{ok:true},null]});
  assert.equal(rows.length,2);
  assert.ok(rows.every(r=>r.usedPercent===null && r.resetsAt===null && r.checkedAt===null && r.plan===null));
});

test('collector exports subscription windows, daily usage with engine and reasoning, and reuses a fresh check',async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {collect}=require('../template/framework/scripts/observability.cjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-observation-plan-'));
  const data=path.join(root,'.data');
  fs.mkdirSync(path.join(data,'omb/usage'),{recursive:true});
  const rows=[{at:'2026-11-05T10:00:00Z',botId:'b',botName:'A',threadId:'t',turnId:'1',model:'gpt',instanceId:'codex',input:100,cachedInput:60,output:20,reasoning:8,costUsd:null},
    {at:'2026-11-06T00:30:00Z',botId:'b',botName:'A',threadId:'t',turnId:'2',model:'gpt',instanceId:'codex',input:50,output:5,costUsd:null}];
  fs.writeFileSync(path.join(data,'omb/usage/2026-11.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const original=global.fetch; let planCalls=0;
  global.fetch=async url=>{
    if (String(url).includes('/api/plan-usage')) {planCalls++; return {ok:true,json:async()=>planReport};}
    return {ok:true,json:async()=>String(url).includes('usage/traces')?{roots:[]}:{dagRuns:[]}};
  };
  try {
    const env={FYSO_ROOT:root,FYSO_DATA:data,FYSO_DAGU_PORT:'1',FYSO_OMB_PORT:'2'};
    const first=await collect(env,new Date('2026-11-06T01:00:00Z'));
    assert.equal(first.sources.subscription,'ok'); assert.equal(first.subscription.length,6);
    assert.equal(first.subscription.some(r=>r.instanceId==='claudeApi'),false,'API-key engines have no subscription window');
    assert.deepEqual(first.daily.map(d=>[d.day,d.engine,d.input,d.reasoning]),[['2026-11-05','codex',100,8],['2026-11-06','codex',50,null]]);
    assert.equal(first.usage.totals.reasoning,8); assert.equal(first.usage.groups[0].engine,'codex');
    fs.mkdirSync(path.join(data,'panel'),{recursive:true});
    fs.writeFileSync(path.join(data,'panel/observability.json'),JSON.stringify(first));
    fs.writeFileSync(path.join(data,'panel/observability.json'),JSON.stringify({...first,subscription:[...first.subscription,{instanceId:'claudeApi',window:'weekly',usedPercent:1,checkedAt:first.subscription[0].checkedAt}]}));
    const reused=await collect(env,new Date('2026-11-06T01:02:00Z'));
    assert.equal(planCalls,1); assert.deepEqual(reused.subscription,first.subscription);
    const later=await collect(env,new Date('2026-11-06T01:10:00Z'));
    assert.equal(planCalls,2); assert.equal(later.sources.subscription,'ok');
  } finally {global.fetch=original;fs.rmSync(root,{recursive:true,force:true});}
});

test('an unavailable plan-usage report is explicit and does not affect token usage',async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {collect}=require('../template/framework/scripts/observability.cjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-observation-noplan-'));
  const original=global.fetch;
  global.fetch=async url=>String(url).includes('/api/plan-usage') ? {ok:false,status:404,json:async()=>({})} : {ok:true,json:async()=>String(url).includes('usage/traces')?{roots:[]}:{dagRuns:[]}};
  try {
    const result=await collect({FYSO_ROOT:root,FYSO_DATA:path.join(root,'.data'),FYSO_DAGU_PORT:'1',FYSO_OMB_PORT:'2'},new Date('2026-11-06T01:00:00Z'));
    assert.equal(result.sources.subscription,'unavailable'); assert.deepEqual(result.subscription,[]);
    assert.equal(result.sources.traces,'ok');
  } finally {global.fetch=original;fs.rmSync(root,{recursive:true,force:true});}
});

// D88: list-price table for engines that report no amount (Codex) and the optional subscription threshold.
test('a known model without a reported amount gets an estimated list-price equivalent; an unknown model stays unknown',()=>{
  const {loadPricing,applyPricing}=require('../template/framework/scripts/observability.cjs');
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fyso-pricing-'));
  try {
    const pricing=loadPricing(root);
    assert.equal(pricing.info.project,false); assert.match(pricing.info.checkedAt,/^\d{4}-\d{2}-\d{2}$/);
    assert.ok(pricing.info.sources.every(u=>u.startsWith('https://')));
    const rows=applyPricing([
      row({id:'sol',model:'gpt-6.1-sol',billingKind:'subscription',input:1e6,cachedInput:5e5,output:1e5}),
      row({id:'other',model:'some-new-model',billingKind:'subscription',input:1e6,output:1e5}),
      row({id:'reported',model:'gpt-6.1-sol',billingKind:'subscription',costUsd:0.5}),
      row({id:'noTokens',model:'gpt-6.1-sol',billingKind:'subscription',input:null,output:null}),
    ],pricing);
    assert.ok(Math.abs(rows[0].costUsd-2.05)<1e-9); assert.equal(rows[0].costSource,'estimated');
    assert.equal(rows[1].costUsd,null); assert.equal(rows[2].costUsd,0.5); assert.equal(rows[3].costUsd,null);
    assert.equal(pricing.info.priced,1);
    const {totals}=aggregate(rows);
    assert.ok(Math.abs(totals.subscriptionEquivalentUsd-2.55)<1e-9); assert.equal(totals.apiReportedUsd,null); assert.equal(totals.missingCost,2);
    fs.mkdirSync(path.join(root,'project'));
    fs.writeFileSync(path.join(root,'project/pricing.json'),JSON.stringify({checkedAt:'2099-01-01',sources:{x:'https://example.com/pricing'},models:{'gpt-6.1-sol':{input:1,cachedInput:1,output:1},'Custom':{input:1,cachedInput:0,output:0}}}));
    const local=loadPricing(root);
    assert.equal(local.info.project,true); assert.equal(local.info.checkedAt,'2099-01-01');
    assert.deepEqual(local.models['gpt-6.1-sol'],{input:1,cachedInput:1,output:1}); assert.ok(local.models.custom);
    const warnings=[];
    fs.writeFileSync(path.join(root,'project/pricing.json'),'{"models":{"bad":{"input":-1}}}');
    assert.equal(loadPricing(root,warnings).models.bad,undefined); assert.deepEqual(warnings,['invalidPricing']);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('the subscription threshold is optional and warns per account window at or above it',()=>{
  const windows=[{instanceId:'codex',engine:'codex',window:'weekly',usedPercent:85},{instanceId:'codex',engine:'codex',window:'fiveHour',usedPercent:null},{instanceId:'claude',engine:'claude',window:'fiveHour',usedPercent:40}];
  assert.deepEqual(makeAlerts({subscriptionPercent:null},{},[],[],0,windows),[]);
  assert.deepEqual(makeAlerts({},{},[],[],0,windows),[]);
  assert.deepEqual(makeAlerts({subscriptionPercent:80},{},[],[],0,windows),[{kind:'subscription',value:85,limit:80,engine:'codex',window:'weekly'}]);
});

function harnessFixture(prefix) {
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
  const data=path.join(root,'.data'), artifacts=path.join(data,'dagu/data/artifacts');
  const attempt=(name,runId,files)=>{
    const dir=path.join(artifacts,name,`dag-run_${runId}`,'attempt_1');
    fs.mkdirSync(path.dirname(dir),{recursive:true});
    fs.writeFileSync(dir+'.meta',JSON.stringify({name,dagRunId:runId,attemptId:'attempt_1',startedAt:'2026-11-06T00:30:00Z',dir:'/etc'}));
    for (const [file,text] of Object.entries(files)) {fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),text);}
  };
  return {root,data,attempt,env:{FYSO_ROOT:root,FYSO_DATA:data,FYSO_DAGU_PORT:'1',FYSO_OMB_PORT:'2'},cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}

test('any workflow reports usage through usage/<step>.jsonl, invalid lines become a warning, absent runs are fetched',async()=>{
  const {collect}=require('../template/framework/scripts/observability.cjs');
  const fx=harnessFixture('fyso-observation-usage-');
  const line=extra=>JSON.stringify({v:1,step:'triage',provider:'claude',model:'claude-sonnet',input:120,output:30,cachedInput:100,costUsd:0.5,...extra});
  fx.attempt('etendo-triage','run-1',{'usage/triage.jsonl':[line({}),line({provider:'opencode',model:null,costUsd:null}),'not json',line({input:-1}),line({v:2})].join('\n')+'\n','usage/notes.txt':'ignored'});
  fx.attempt('quiet-workflow','run-2',{});
  const original=global.fetch, requested=[];
  global.fetch=async url=>{
    url=String(url); requested.push(url);
    if (url.includes('usage/traces')) return {ok:true,json:async()=>({roots:[]})};
    if (url.endsWith('/dag-runs/etendo-triage/run-1')) return {ok:true,json:async()=>({dagRunDetails:{dagRunId:'run-1',name:'etendo-triage',statusLabel:'succeeded',startedAt:'2026-11-06T00:30:00Z'}})};
    return {ok:true,json:async()=>({dagRuns:Array.from({length:100},(_,i)=>({dagRunId:`obs-${i}`,name:'fyso-observability',statusLabel:'succeeded',startedAt:'2026-11-06T00:59:00Z'}))})};
  };
  try {
    const result=await collect(fx.env,new Date('2026-11-06T01:00:00Z'));
    const group=result.usage.groups.find(g=>g.bot==='etendo-triage' && g.model==='claude-sonnet');
    assert.equal(group.turns,1); assert.equal(group.input,120); assert.equal(group.cachedInput,100);
    assert.equal(group.billingKind,'subscription'); assert.equal(group.subscriptionEquivalentUsd,0.5); assert.equal(group.source,'harness');
    const other=result.usage.groups.find(g=>g.bot==='etendo-triage' && g.model==='opencode');
    assert.equal(other.billingKind,'unknown'); assert.equal(other.missingCost,1);
    assert.ok(result.warnings.includes('invalidUsageRows'));
    assert.equal(result.usage.groups.some(g=>g.bot==='quiet-workflow'),false);
    assert.equal(requested.some(u=>u.includes('quiet-workflow')),false);
    const run=result.runs.find(r=>r.id==='run-1');
    assert.equal(run.dag,'etendo-triage'); assert.equal(run.usage.turns,2); assert.equal(run.usage.output,60);
    assert.equal(result.usage.groups.some(g=>g.model==='unknown' && g.bot==='etendo-triage'),false);
  } finally {global.fetch=original;fx.cleanup();}
});

test('legacy dev-task agent.txt still counts as Builder; usage files take precedence when present',async()=>{
  const {collect}=require('../template/framework/scripts/observability.cjs');
  const fx=harnessFixture('fyso-observation-legacy-');
  const claude=JSON.stringify({type:'result',total_cost_usd:0.2,usage:{input_tokens:10,cache_read_input_tokens:50,cache_creation_input_tokens:20,output_tokens:3}});
  fx.attempt('fyso-dev-task','dev-1',{'agent.txt':claude});
  fx.attempt('fyso-dev-task','dev-2',{'agent.txt':claude,'usage/agent.jsonl':JSON.stringify({v:1,step:'agent',provider:'codex',model:'gpt-5',input:7,output:1,cachedInput:null,costUsd:null})+'\n'});
  const original=global.fetch;
  global.fetch=async url=>{
    url=String(url);
    if (url.includes('usage/traces')) return {ok:true,json:async()=>({roots:[]})};
    if (url.endsWith('/outputs')) return {ok:true,json:async()=>({outputs:{}})};
    return {ok:true,json:async()=>({dagRuns:['dev-1','dev-2'].map(id=>({dagRunId:id,name:'fyso-dev-task',statusLabel:'succeeded',startedAt:'2026-11-06T00:30:00Z'}))})};
  };
  try {
    const result=await collect(fx.env,new Date('2026-11-06T01:00:00Z'));
    const legacy=result.runs.find(r=>r.id==='dev-1').usage, modern=result.runs.find(r=>r.id==='dev-2').usage;
    assert.equal(legacy.input,80); assert.equal(legacy.subscriptionEquivalentUsd,0.2);
    assert.equal(modern.turns,1); assert.equal(modern.input,7);
    assert.deepEqual([...new Set(result.usage.groups.map(g=>g.bot))],['Builder']);
    assert.equal(result.warnings.length,0);
  } finally {global.fetch=original;fx.cleanup();}
});
