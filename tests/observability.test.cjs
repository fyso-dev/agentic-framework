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
