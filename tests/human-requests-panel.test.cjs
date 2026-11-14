const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../template/framework/extensions/human-requests/extensions/human-requests/panel/pending.js'), 'utf8');
const apiSource = source.slice(source.indexOf('const enc ='), source.indexOf('function Field('));
function context(fetch) {
  const ctx = vm.createContext({fetch, URLSearchParams, encodeURIComponent, window: {dispatchEvent() {}}, Event: class {}});
  vm.runInContext(`${apiSource}\nglobalThis.testApi = {api, listRequests, listHistory, historyDetail, assignee, deliveryState, readableDate, latestHistory, listPeople, recipientName, recipientMatches};`, ctx);
  return ctx.testApi;
}
const response = (status, data) => ({status, ok: status >= 200 && status < 300, json: async () => data});
test('optional people directory resolves stable IDs and preserves old or missing labels', async () => {
  const id='550e8400-e29b-41d4-a716-446655440000', other='00000000-0000-4000-8000-000000000000';
  const client=context(async url => url.includes('/wiki?') ? response(200,{items:[{id:'fyso-people/'+id}],pagination:{hasNextPage:false}}) : response(200,{content:JSON.stringify({version:1,name:'Ana'})}));
  const people=await client.listPeople(), run={labels:['assignee='+id]}, legacy={labels:['assignee=María']}, deleted={labels:['assignee='+other]}, team={labels:[]};
  assert.equal(people.length,1);assert.equal(client.recipientName(run,people),'Ana');
  assert.equal(client.recipientName(legacy,people),'María');assert.equal(client.recipientName(deleted,people),other);assert.equal(client.assignee(team),'team');
  assert.equal(client.recipientMatches(run,'ana','',people),true);assert.equal(client.recipientMatches(run,'',id,people),true);
  assert.equal(client.recipientMatches(legacy,'maría','',people),true);assert.equal(client.recipientMatches(team,'','team',people),true);
  assert.equal(client.recipientMatches(deleted,other,'',[]),true);
  await assert.rejects(context(async()=>response(404,{})).listPeople());
});

test('loads all waiting runs with label and cursor from Dagu', async () => {
  const calls = [];
  const api = context(async (url, init) => {calls.push([url, init]); return calls.length === 1 ? response(200, {dagRuns: [{name: 'one', labels: ['assignee=alice']}], nextCursor: 'next token'}) : response(200, {dagRuns: [{name: 'two'}]});});
  const runs = await api.listRequests();
  assert.equal(runs.length, 2);
  assert.match(calls[0][0], /status=7&labels=human-request/);
  assert.match(calls[1][0], /cursor=next\+token/);
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(api.assignee(runs[0]), 'alice');
  assert.equal(api.assignee(runs[1]), 'team');
});
test('rejects repeated cursors and malformed lists', async () => {
  const repeated = context(async () => response(200, {dagRuns: [], nextCursor: 'same'}));
  await assert.rejects(repeated.listRequests(), /Repeated cursor/);
  const invalid = context(async () => response(200, {}));
  await assert.rejects(invalid.listRequests(), /Invalid response/);
});
test('recent activity paginates, excludes waiting, and reports bounded results', async () => {
  const calls = [];
  const api = context(async url => {calls.push(url); return calls.length === 1
    ? response(200, {dagRuns: [{name:'waiting',statusLabel:'waiting'},{name:'failed',statusLabel:'failed'}],nextCursor:'next'})
    : response(200, {dagRuns: [{name:'done',statusLabel:'succeeded'}]});});
  const history = await api.listHistory();
  assert.equal(history.runs.length,2);
  assert.deepEqual(Array.from(history.runs,run => run.name),['failed','done']);
  assert.equal(history.truncated,false);
  assert.match(calls[1],/cursor=next/);
  let count=0;
  const bounded=context(async()=>response(200,{dagRuns:[],nextCursor:`page-${++count}`}));
  const partial=await bounded.listHistory();
  assert.equal(count,5);
  assert.equal(partial.truncated,true);
});
test('recent activity rejects malformed results and cursor loops', async () => {
  await assert.rejects(context(async()=>response(200,{})).listHistory(),/Invalid response/);
  await assert.rejects(context(async()=>response(200,{dagRuns:[],nextCursor:'repeat'})).listHistory(),/Repeated cursor/);
});
test('history details limit concurrent requests and release slots on failure', async () => {
  let active=0, peak=0, completed=0;
  const api=context(async url=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;completed++;return response(url.endsWith('/bad')?500:200,{dagRunDetails:{nodes:[]}});});
  const outcomes=await Promise.allSettled(Array.from({length:12},(_,index)=>api.historyDetail({name:'workflow',dagRunId:index===3?'bad':String(index)})));
  assert.equal(peak,4);assert.equal(completed,12);assert.equal(outcomes.filter(result=>result.status==='rejected').length,1);
});
test('history cancels queued detail work without starving remaining cards', async () => {
  let release, calls=0;
  const gate=new Promise(resolve=>{release=resolve;});
  const api=context(async()=>{calls++;await gate;return response(200,{dagRunDetails:{nodes:[]}});});
  const first=Array.from({length:4},(_,i)=>api.historyDetail({name:'workflow',dagRunId:String(i)}));
  const controller=new AbortController();
  const cancelled=api.historyDetail({name:'workflow',dagRunId:'cancelled'},controller.signal);
  const next=api.historyDetail({name:'workflow',dagRunId:'next'});
  controller.abort(); await assert.rejects(cancelled,/cancelled/);release();
  await Promise.all([...first,next]); assert.equal(calls,5);
});
test('preserves 503 so UI reports an uncertain outcome', async () => {
  const api = context(async () => response(503, {}));
  await assert.rejects(api.api('dag-runs/dag/id/human-tasks/ask/complete', {method: 'POST'}), error => error.status === 503);
  assert.match(source, /setSaved\('savedResumeFailed'\)/);
});
test('a blank boolean remains blank instead of becoming false', () => {
  const fieldSource = source.slice(source.indexOf('function Field('), source.indexOf('function Request('));
  let changed;
  const ctx = vm.createContext({h: (type, props, ...children) => ({type, props, children}), useTranslation: () => ({t: key => key})});
  vm.runInContext(`${fieldSource}\nglobalThis.field = Field;`, ctx);
  const label = ctx.field({name: 'accept', spec: {type: 'boolean'}, value: '', change: (_, value) => {changed = value;}, prefix: 'run'});
  const select = label.children[2];
  select.props.onChange({target: {value: ''}});
  assert.equal(changed, '');
  select.props.onChange({target: {value: 'false'}});
  assert.equal(changed, false);
});
test('503 copy does not assert that an intermediary saved the answer', () => {
  for (const language of ['es', 'en']) {
    const locale = JSON.parse(fs.readFileSync(path.join(__dirname, `../template/framework/extensions/human-requests/extensions/human-requests/panel/locales/${language}.json`), 'utf8'));
    assert.match(locale.pending.savedResumeFailed, language === 'es' ? /No se pudo confirmar/ : /Could not confirm/);
  }
});
test('provides a history link only from configured HTTP(S) Dagu URL', () => {
  assert.match(source, /\['http:', 'https:'\]\.includes\(url\.protocol\)/);
  assert.match(source, /url\.origin\}\/dags\/ext-human-requests-request/);
  for (const language of ['es', 'en']) {
    const locale = JSON.parse(fs.readFileSync(path.join(__dirname, `../template/framework/extensions/human-requests/extensions/human-requests/panel/locales/${language}.json`), 'utf8'));
    assert.ok(locale.pending.history);
  }
});
test('cancelling a request records cancellation without requiring an answer', async () => {
  const requestSource=source.slice(source.indexOf('function Request('),source.indexOf('function Pending('));
  const form={properties:{answer:{type:'string'},responder:{type:'string'},decision:{type:'string',enum:['answered','cancelled','expired']}},required:['decision']};
  const initial=[{node:{step:{id:'ask',humanTask:{prompt:'Example'}}},form},{answer:'',responder:'Ana',decision:'answered'},'',false,'',''];
  let index=0, submitted;
  const ctx=vm.createContext({h:(type,props,...children)=>({type,props:props||{},children}),useState:()=>[initial[index++],()=>{}],useEffect:()=>{},useTranslation:()=>({t:key=>key}),Field:()=>{},labelsOf:()=>[],assignee:()=> 'team',recipientName:()=> 'team',enc:encodeURIComponent,window:{confirm:()=>true},api:async(_path,options)=>{submitted=JSON.parse(options.body)}});
  vm.runInContext(`${requestSource}\nglobalThis.render=Request;`,ctx);
  const tree=ctx.render({run:{name:'ext-human-requests-request',dagRunId:'one'},onDone:()=>{}});
  function find(node){if(!node||typeof node!=='object')return null;if(node.type==='button'&&node.props.type==='button')return node;for(const child of node.children||[]){const result=find(child);if(result)return result;}return null;}
  find(tree).props.onClick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(submitted.decision,'cancelled');assert.equal(submitted.responder,'Ana');assert.ok(!('answer' in submitted));
});
test('delivery state distinguishes pending, failed and completed step without claiming agent completion', () => {
  const {deliveryState} = context(async () => response(200, {}));
  const detail = status => ({dagRunDetails:{nodes:[{step:{id:'deliver'},statusLabel:status}]}});
  assert.equal(deliveryState(detail('Not Started')), 'pending');
  assert.equal(deliveryState(detail('Running')), 'pending');
  assert.equal(deliveryState(detail('Failed')), 'failed');
  assert.equal(deliveryState({dagRunDetails:{nodes:[{step:{id:'deliver'},statusLabel:'failed',error:'exit status 1\\nrecent stderr (tail):\\nInvalid request answer\\n'}]}}), 'invalid');
  assert.equal(deliveryState(detail('Succeeded')), 'processed');
  assert.equal(deliveryState({}), 'unknown');
  for (const language of ['es', 'en']) {
    const locale = JSON.parse(fs.readFileSync(path.join(__dirname, `../template/framework/extensions/human-requests/extensions/human-requests/panel/locales/${language}.json`), 'utf8'));
    assert.match(locale.pending.delivery.processed, language === 'es' ? /no confirma/ : /does not confirm/);
  }
});
test('history dates are localized and malformed timestamps are omitted', () => {
  const {readableDate}=context(async()=>response(200,{}));
  assert.ok(readableDate('2026-11-13T12:00:00Z','es'));
  assert.ok(readableDate('2026-11-13T12:00:00Z','en'));
  assert.equal(readableDate('not-a-date','es'),'');
  assert.equal(readableDate('','es'),'');
});

test('pending stored answer can resume without reposting the form', async () => {
  const requestSource=source.slice(source.indexOf('function Request('),source.indexOf('function HistoryItem('));
  const initial=[{node:{step:{id:'ask',humanTask:{prompt:'Test'}}},form:{properties:{}}},{},'',false,'resumePending','',true];
  let index=0, call;
  const ctx=vm.createContext({h:(type,props,...children)=>({type,props:props||{},children}),useState:()=>[initial[index++],()=>{}],useEffect:()=>{},useTranslation:()=>({t:key=>key}),Field:()=>{},labelsOf:()=>[],assignee:()=> 'team',recipientName:()=> 'team',enc:encodeURIComponent,api:async(path,options)=>{call={path,options}},window:{confirm:()=>true}});
  vm.runInContext(`${requestSource}\nglobalThis.render=Request;`,ctx);
  const tree=ctx.render({run:{name:'ext-human-requests-request',dagRunId:'run-1'},onDone:()=>{}});
  function find(n){if(!n||typeof n!=='object')return; if(n.type==='button' && n.children.includes('pending.resume'))return n; for(const c of n.children||[]){const result=find(c);if(result)return result;}}
  const button=find(tree); assert.ok(button); await button.props.onClick();
  assert.equal(call.path,'dag-runs/ext-human-requests-request/run-1/human-tasks/resume');
  assert.equal(call.options.method,'POST'); assert.equal(call.options.body,'{}');
});

test('a slower initial history read cannot overwrite the newer refresh', async () => {
  const pending=[];
  const api=context(() => new Promise(resolve => pending.push(resolve)));
  const ref={current:0}; const applied=[];
  const first=api.latestHistory(ref,()=>true,data=>applied.push(data.runs[0].name),()=>{});
  const second=api.latestHistory(ref,()=>true,data=>applied.push(data.runs[0].name),()=>{});
  pending[1](response(200,{dagRuns:[{name:'new',statusLabel:'succeeded'}]})); await second;
  pending[0](response(200,{dagRuns:[{name:'old',statusLabel:'succeeded'}]})); await first;
  assert.deepEqual(applied,['new']);
});
