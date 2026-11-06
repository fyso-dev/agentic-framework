// Read-only adapter over native OMB/Dagu records. No prompts or transcripts leave the sources.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const knownSum = values => values.some(v => numeric(v) !== null) ? values.reduce((n, v) => n + (numeric(v) ?? 0), 0) : null;
const kinds = {claude:'subscription', codex:'subscription', chatgpt:'subscription', claudeApi:'api', openai:'api', openrouter:'api', xaiApi:'api'};
const pick = (value, keys) => Object.fromEntries(keys.filter(k => value[k] !== undefined).map(k => [k, value[k]]));

function normalizeHarness(text, provider) {
  let events;
  try { events = [JSON.parse(text)]; }
  catch { events = text.split('\n').flatMap(line => {try {return [JSON.parse(line)];} catch {return [];}}); }
  const completed = events.filter(e => provider === 'codex' ? e.type === 'turn.completed' : e.type === 'result');
  if (!completed.length) return {input:null, output:null, cachedInput:null, costUsd:null};
  const usage = completed.map(e => {
    const u = e.usage || {};
    const cache = provider === 'codex' ? numeric(u.cached_input_tokens) : numeric(u.cache_read_input_tokens);
    const input = numeric(u.input_tokens);
    return {input:input === null ? null : input + (provider === 'claude' ? (cache ?? 0) + (numeric(u.cache_creation_input_tokens) ?? 0) : 0),
      output:numeric(u.output_tokens), cachedInput:cache, costUsd:numeric(e.total_cost_usd)};
  });
  return Object.fromEntries(['input','output','cachedInput','costUsd'].map(k => [k,knownSum(usage.map(u => u[k]))]));
}

function aggregate(records) {
  const seen = new Set();
  const groups = new Map();
  const empty = () => ({turns:0,input:null,output:null,cachedInput:null,apiReportedUsd:null,subscriptionEquivalentUsd:null,estimatedApiUsd:null,unclassifiedUsd:null,missingCost:0,missingTokens:0});
  const totals = empty();
  const add = (to, row) => {
    to.turns++;
    for (const k of ['input','output','cachedInput']) to[k] = knownSum([to[k],row[k]]);
    if (row.input === null || row.output === null) to.missingTokens++;
    if (numeric(row.costUsd) === null) {to.missingCost++; return;}
    const bucket = row.billingKind === 'subscription' ? 'subscriptionEquivalentUsd' : row.billingKind === 'api' ? (row.costSource === 'estimated' ? 'estimatedApiUsd' : row.costSource === 'reported' ? 'apiReportedUsd' : 'unclassifiedUsd') : 'unclassifiedUsd';
    to[bucket] = knownSum([to[bucket],row.costUsd]);
  };
  for (const row of records) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const key = JSON.stringify([row.bot,row.model,row.billingKind,row.source]);
    if (!groups.has(key)) groups.set(key,{...empty(),bot:row.bot,model:row.model,billingKind:row.billingKind,source:row.source});
    add(totals,row); add(groups.get(key),row);
  }
  return {totals,groups:[...groups.values()]};
}

function makeAlerts(settings, usage, runs, traces, now) {
  const alerts = [];
  if (numeric(settings.monthlyApiUsd) !== null && usage.apiReportedUsd !== null && usage.apiReportedUsd >= settings.monthlyApiUsd)
    alerts.push({kind:'budget',value:usage.apiReportedUsd,limit:settings.monthlyApiUsd});
  const failures = runs.filter(r=>['failed','aborted','rejected','partially_succeeded'].includes(r.statusLabel)).length;
  if (numeric(settings.maxRecentFailures) !== null && failures >= settings.maxRecentFailures)
    alerts.push({kind:'failures',value:failures,limit:settings.maxRecentFailures});
  if (numeric(settings.longRunSeconds) !== null) {
    for (const run of runs) if (['running','waiting'].includes(run.statusLabel) && Number.isFinite(Date.parse(run.startedAt)) && (now-Date.parse(run.startedAt))/1000 >= settings.longRunSeconds)
      alerts.push({kind:'longRun',runId:run.id,dag:run.dag,value:Math.round((now-Date.parse(run.startedAt))/1000),limit:settings.longRunSeconds});
    for (const trace of traces) if (trace.running && trace.durationMs/1000 >= settings.longRunSeconds)
      alerts.push({kind:'longConversation',traceId:trace.id,value:Math.round(trace.durationMs/1000),limit:settings.longRunSeconds});
  }
  return alerts;
}

async function collect(env = process.env, now = new Date()) {
  const root = env.FYSO_ROOT, data = env.FYSO_DATA;
  if (!root || !data || !env.FYSO_DAGU_PORT || !env.FYSO_OMB_PORT) throw new Error('missing project environment');
  const month = now.toISOString().slice(0,7), from = `${month}-01`;
  const warnings = [], sources = {};
  const settingsPath = path.join(root,'project/observability.json');
  let settings = {monthlyApiUsd:null,longRunSeconds:600,maxRecentFailures:1,billingKinds:{}};
  try {settings={...settings,...JSON.parse(fs.readFileSync(settingsPath,'utf8'))};} catch (e) {if (e.code !== 'ENOENT') warnings.push('invalidSettings');}
  const billing = {...kinds,...settings.billingKinds};
  const records = [], ledger = path.join(data,'omb/usage',`${month}.jsonl`);
  let invalidRows=0;
  try {
    for (const line of fs.readFileSync(ledger,'utf8').split('\n').filter(Boolean)) {
      try {
        const r = JSON.parse(line);
        if (!r.botId || !r.threadId || !r.at || !r.model || numeric(r.input) === null || numeric(r.output) === null) throw new Error('invalid row');
        if (r.at.slice(0,7) !== month || Date.parse(r.at) > now.getTime()) continue;
        records.push({id:`omb:${r.at}|${r.threadId}|${r.botId}`,source:'omb',threadId:r.threadId,turnId:r.turnId,parent:r.parent,bot:r.botName || r.botId,model:r.model,
          billingKind:['api','subscription'].includes(billing[r.instanceId]) ? billing[r.instanceId] : 'unknown',
          input:(r.usageStatus==='unavailable'||(!r.usageStatus&&!r.input&&!r.output))?null:numeric(r.input),output:(r.usageStatus==='unavailable'||(!r.usageStatus&&!r.input&&!r.output))?null:numeric(r.output),cachedInput:numeric(r.cachedInput),costUsd:numeric(r.costUsd),costSource:r.costSource || 'reported'});
      } catch {invalidRows++;}
    }
    sources.ledger='ok';
  } catch(e) {sources.ledger=e.code==='ENOENT'?'empty':'unavailable';}
  if (invalidRows) warnings.push('invalidLedgerRows');

  async function get(port, endpoint, auth) {
    const res = await fetch(`http://127.0.0.1:${port}${endpoint}`,{headers:auth?{Authorization:auth}:{},signal:AbortSignal.timeout(10000)});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  let traces = [], tracesTruncated=false;
  try {
    let offset=0;
    for (let page=0;page<5;page++) {
      const res=await get(env.FYSO_OMB_PORT,`/api/usage/traces?from=${from}&limit=100&offset=${offset}`);
      if (!Array.isArray(res.roots)) throw new Error('invalid traces');
      traces.push(...res.roots.map(r=>pick(r,['id','source','startedAt','endedAt','running','bots','usageStatus','durationMs','steps','tools','errors'])));
      if (res.next === undefined) break;
      offset=res.next; if(page===4) tracesTruncated=true;
    }
    sources.traces='ok';
  } catch {sources.traces='unavailable';}
  let runs=[],runsTruncated=false;
  const auth='Basic '+Buffer.from(`${env.FYSO_ADMIN_USER}:${env.FYSO_ADMIN_PASSWORD}`).toString('base64');
  const runShape = r => ({id:r.dagRunId,dag:r.name,statusLabel:r.statusLabel,startedAt:r.startedAt,finishedAt:r.finishedAt,retries:r.autoRetryCount ?? 0,sourceThread:null,sourceTurn:null});
  async function origin(run) {
    try {
      const outputs=(await get(env.FYSO_DAGU_PORT,`/api/v1/dag-runs/${encodeURIComponent(run.dag)}/${encodeURIComponent(run.id)}/outputs`,auth)).outputs || {};
      const context=typeof outputs.origin==='string' ? JSON.parse(outputs.origin) : outputs.origin || {};
      run.sourceThread=context.thread || null; run.sourceTurn=context.turn || null;
      run.provider=context.provider || null; run.model=context.model || null;
    } catch {warnings.push('runDetailsUnavailable');}
  }
  try {
    const res=await get(env.FYSO_DAGU_PORT,'/api/v1/dag-runs?limit=100',auth);
    if (!Array.isArray(res.dagRuns)) throw new Error('invalid runs');
    runsTruncated=!!res.nextCursor;
    runs=res.dagRuns.map(runShape);
    for (const run of runs.filter(r=>['fyso-dev-task','dev-task'].includes(r.dag))) await origin(run);
    sources.runs='ok';
  } catch {sources.runs='unavailable';}
  let artifactFailures=0;
  const artifacts=path.join(data,'dagu/data/artifacts');
  try {
    const identities=new Set();
    for (const file of fs.globSync('**/*.meta',{cwd:artifacts})) {
      try {
        const meta=JSON.parse(fs.readFileSync(path.join(artifacts,file),'utf8'));
        if (!['fyso-dev-task','dev-task'].includes(meta.name) || !meta.startedAt || new Date(meta.startedAt).toISOString().slice(0,7)!==month) continue;
        // CLI-named runs may be absent from the global list of discovered DAGs.
        if (!runs.some(r=>r.id===meta.dagRunId && r.dag===meta.name)) {
          try {
            const detail=await get(env.FYSO_DAGU_PORT,`/api/v1/dag-runs/${encodeURIComponent(meta.name)}/${encodeURIComponent(meta.dagRunId)}`,auth);
            const run=runShape(detail.dagRunDetails); await origin(run); runs.push(run);
          } catch {warnings.push('runDetailsUnavailable');}
        }
        const id=`harness:${meta.name}/${meta.dagRunId}/${meta.attemptId}`;
        if (identities.has(id)) continue; identities.add(id);
        // Derive the artifact directory from the metadata FILE, never trust meta.dir.
        const dir=path.join(artifacts,file.slice(0,-5));
        let text=''; try {text=fs.readFileSync(path.join(dir,'agent.txt'),'utf8');} catch {}
        let provider=/\"type\"\s*:\s*\"result\"/.test(text) ? 'claude' : /\"type\"\s*:\s*\"(?:thread.started|turn.completed)\"/.test(text) ? 'codex' : 'unknown';
        const usage=normalizeHarness(text,provider);
        records.push({id,source:'harness',bot:'Builder',model:runs.find(r=>r.id===meta.dagRunId && r.dag===meta.name)?.model || provider,billingKind:provider === 'unknown' ? 'unknown' : 'subscription',...usage,costSource:'reported',runId:meta.dagRunId});
      } catch {artifactFailures++;}
    }
    sources.harness='ok';
  } catch {sources.harness='unavailable';}
  if (artifactFailures) warnings.push('invalidArtifacts');
  // Runs without any usage artifact still have an explicitly unknown consumption record.
  for (const run of runs.filter(r=>['fyso-dev-task','dev-task'].includes(r.dag) && r.startedAt?.startsWith(month))) {
    if (!records.some(r=>r.source==='harness' && r.runId===run.id)) records.push({id:`uncovered:${run.dag}/${run.id}`,source:'harness',bot:'Builder',model:'unknown',billingKind:'unknown',input:null,output:null,cachedInput:null,costUsd:null,costSource:null,runId:run.id});
  }
  const turns=new Map(records.filter(r=>r.source==='omb' && r.turnId).map(r=>[`${r.threadId}~${r.turnId}`,r]));
  const rootOf = row => {
    let current=row;
    const seen=new Set();
    while (current.parent) {
      const key=`${current.parent.threadId}~${current.parent.turnId}`;
      if (seen.has(key) || !turns.has(key)) return key;
      seen.add(key); current=turns.get(key);
    }
    return current.turnId ? `${current.threadId}~${current.turnId}` : `row:${current.id.slice(4)}`;
  };
  for (const trace of traces) {
    const key=trace.id.startsWith('row~') ? 'row:'+decodeURIComponent(trace.id.slice(4)) : trace.id.split('~').map(decodeURIComponent).join('~');
    trace.usage=aggregate(records.filter(r=>r.source==='omb' && rootOf(r)===key)).totals;
  }
  for (const run of runs) {
    run.usage=aggregate(records.filter(r=>r.source==='harness' && r.runId===run.id)).totals;
    const turn=turns.get(`${run.sourceThread}~${run.sourceTurn}`);
    const key=turn ? rootOf(turn) : `${run.sourceThread}~${run.sourceTurn}`;
    run.traceId=traces.find(t=>t.id.split('~').map(decodeURIComponent).join('~')===key)?.id || null;
  }
  runs.sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));
  const usage=aggregate(records);
  return {version:1,collectedAt:now.toISOString(),from,to:now.toISOString().slice(0,10),sources,warnings:[...new Set(warnings)],invalidRows,
    coverage:{tracesTruncated,runsTruncated},usage,traces,runs,alerts:makeAlerts(settings,usage.totals,runs,traces,now.getTime())};
}

if (require.main === module) {
  const started=performance.now();
  collect().then(result=>{
    const target=path.join(process.env.FYSO_DATA,'panel/observability.json');
    fs.mkdirSync(path.dirname(target),{recursive:true});
    const temp=target+`.${process.pid}.tmp`;
    fs.writeFileSync(temp,JSON.stringify(result),{mode:0o600}); fs.renameSync(temp,target);
    console.log(JSON.stringify({collectedAt:result.collectedAt,sources:result.sources,records:result.usage.totals.turns,durationMs:Math.round(performance.now()-started)}));
  }).catch(()=>{console.error('observability collection failed; previous snapshot retained');process.exitCode=1;});
}
module.exports={normalizeHarness,aggregate,makeAlerts,collect};
