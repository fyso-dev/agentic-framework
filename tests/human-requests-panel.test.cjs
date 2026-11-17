const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../template/framework/extensions/human-requests/extensions/human-requests/panel/pending.js'), 'utf8');
const apiSource = source.slice(source.indexOf('const enc ='), source.indexOf('function Field('));
function context(fetch) {
  const ctx = vm.createContext({fetch, URLSearchParams, encodeURIComponent, Intl, window: {dispatchEvent() {}}, Event: class {}, sdk: {}});
  vm.runInContext(`${apiSource}\nglobalThis.testApi = {api, listRequests, listHistory, runDetail, assignee, deadline, deliveryState, readableDate, latestHistory, listPeople, recipientName, isMine, parseCard, taskNode};`, ctx);
  return ctx.testApi;
}
const response = (status, data) => ({status, ok: status >= 200 && status < 300, json: async () => data});
test('optional people directory resolves stable IDs and preserves old or missing labels', async () => {
  const id='550e8400-e29b-41d4-a716-446655440000', other='00000000-0000-4000-8000-000000000000';
  const client=context(async url => url.includes('/wiki?') ? response(200,{items:[{id:'fyso-people/'+id}],pagination:{hasNextPage:false}}) : response(200,{content:JSON.stringify({version:1,name:'Ana'})}));
  const people=await client.listPeople(), run={labels:['assignee='+id]}, legacy={labels:['assignee=María']}, deleted={labels:['assignee='+other]}, team={labels:[]};
  assert.equal(people.length,1);assert.equal(client.recipientName(run,people),'Ana');
  assert.equal(client.recipientName(legacy,people),'María');assert.equal(client.recipientName(deleted,people),other);assert.equal(client.assignee(team),'team');
  assert.equal(client.isMine(run,{id,name:'Ana'}),true);assert.equal(client.isMine(run,{id:other,name:'Otra'}),false);
  assert.equal(client.isMine(legacy,{id:'',name:'maría'}),true);assert.equal(client.isMine(legacy,{id:'',name:'Ana'}),false);
  assert.equal(client.isMine(team,{id:other,name:'Otra'}),true,'team requests are for everyone');
  assert.equal(client.isMine(run,{id:'',name:''}),true,'without a chosen name nothing is hidden');
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
  const outcomes=await Promise.allSettled(Array.from({length:12},(_,index)=>api.runDetail({name:'workflow',dagRunId:index===3?'bad':String(index)})));
  assert.equal(peak,4);assert.equal(completed,12);assert.equal(outcomes.filter(result=>result.status==='rejected').length,1);
});
test('history cancels queued detail work without starving remaining cards', async () => {
  let release, calls=0;
  const gate=new Promise(resolve=>{release=resolve;});
  const api=context(async()=>{calls++;await gate;return response(200,{dagRunDetails:{nodes:[]}});});
  const first=Array.from({length:4},(_,i)=>api.runDetail({name:'workflow',dagRunId:String(i)}));
  const controller=new AbortController();
  const cancelled=api.runDetail({name:'workflow',dagRunId:'cancelled'},controller.signal);
  const next=api.runDetail({name:'workflow',dagRunId:'next'});
  controller.abort(); await assert.rejects(cancelled,/cancelled/);release();
  await Promise.all([...first,next]); assert.equal(calls,5);
});
test('preserves 503 so UI reports an uncertain outcome', async () => {
  const api = context(async () => response(503, {}));
  await assert.rejects(api.api('dag-runs/dag/id/human-tasks/ask/complete', {method: 'POST'}), error => error.status === 503);
  assert.match(source, /setSaved\('savedResumeFailed'\)/);
});
test('a blank boolean remains blank instead of becoming false', () => {
  const fieldSource = source.slice(source.indexOf('function Field('), source.indexOf('// A human task of another workflow'));
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
  assert.match(source, /url\.origin\}\/dags\/\$\{REQUEST\}/);assert.match(source, /const REQUEST = 'ext-human-requests-request'/);
  for (const language of ['es', 'en']) {
    const locale = JSON.parse(fs.readFileSync(path.join(__dirname, `../template/framework/extensions/human-requests/extensions/human-requests/panel/locales/${language}.json`), 'utf8'));
    assert.ok(locale.pending.history);
  }
});
// Render the request detail with stubbed hooks: `states` are its useState values in order
// (mode, answer, comment, question, busy, error, saved, delivery, confirmCancel).
const componentSource = source.slice(source.indexOf('const enc ='), source.indexOf('function HistoryItem('));
const cardPrompt = (extra = {}) => JSON.stringify({v:1, request:{title:'Example', requester:'Fixture bot', doing:'Testing', needs:'A choice', if_silent:'Nothing happens'}, thread:[], canAsk:true, blocking:false, ...extra});
function detail(states, data, me = {id:'', name:'Ana'}) {
  let index = 0; const calls = [];
  const ctx = vm.createContext({URLSearchParams, encodeURIComponent, Intl, Date, window: {dispatchEvent() {}}, Event: class {}, sdk: {}, setTimeout, clearTimeout,
    fetch: async (url, init) => { calls.push({url, init}); return response(200, {}); },
    h: (type, props, ...children) => ({type, props: props || {}, children}), useState: () => [states[index++], () => {}], useEffect: () => {}, useTranslation: () => ({t: key => key, i18n: {language: 'es'}})});
  vm.runInContext(`${componentSource}\nglobalThis.render = Detail;`, ctx);
  const tree = ctx.render({run: {name: 'ext-human-requests-request', dagRunId: 'run-1', labels: []}, data, me, people: [], onDone: () => {}, reload: () => {}});
  const find = (node, test) => { if (!node || typeof node !== 'object') return null; if (test(node)) return node; for (const child of [].concat(node.children || [])) { const result = find(child, test); if (result) return result; } return null; };
  return {tree, calls, find: test => find(tree, test)};
}
const waiting = (prompt, extra = {}) => ({dagRunDetails: {statusLabel: 'waiting', nodes: [{statusLabel: 'waiting', step: {id: 'ask', humanTask: {prompt}}, ...extra}]}});
test('cancelling a request records cancellation without requiring an answer', async () => {
  const view = detail(['decide', '', '', '', false, '', '', '', true], waiting(cardPrompt()));
  await view.find(node => node.type === 'button' && node.children.includes('pending.cancelYes')).props.onClick();
  const submitted = JSON.parse(view.calls[0].init.body);
  assert.match(view.calls[0].url, /dag-runs\/ext-human-requests-request\/run-1\/human-tasks\/ask\/complete$/);
  assert.equal(submitted.decision, 'cancelled'); assert.equal(submitted.responder, 'Ana'); assert.ok(!('answer' in submitted));
});
test('a decision needs a chosen name and an answer before anything is sent', async () => {
  const anonymous = detail(['decide', 'Yes', '', '', false, '', '', '', false], waiting(cardPrompt()), {id: '', name: ' '});
  await anonymous.find(node => node.type === 'form').props.onSubmit({preventDefault() {}});
  assert.equal(anonymous.calls.length, 0);
  const empty = detail(['decide', '', '', '', false, '', '', '', false], waiting(cardPrompt()));
  await empty.find(node => node.type === 'form').props.onSubmit({preventDefault() {}});
  assert.equal(empty.calls.length, 0);
  const valid = detail(['decide', 'Yes', 'because', '', false, '', '', '', false], waiting(cardPrompt()));
  await valid.find(node => node.type === 'form').props.onSubmit({preventDefault() {}});
  assert.deepEqual(JSON.parse(valid.calls[0].init.body), {decision: 'answered', responder: 'Ana', answer: 'Yes', comment: 'because'});
});
test('a question to the agent is a push-back at the iteration the person reviewed', async () => {
  const view = detail(['ask', '', '', ' Which two? ', false, '', '', '', false], waiting(cardPrompt({thread: [{iteration: 1, question: 'First', answer: 'Reply'}]}), {approvalIteration: 1}));
  await view.find(node => node.type === 'form').props.onSubmit({preventDefault() {}});
  assert.match(view.calls[0].url, /human-tasks\/ask\/push-back\?expectedIteration=1$/);
  assert.deepEqual(JSON.parse(view.calls[0].init.body), {HR_QUESTION: 'Which two?', HR_ASKER: 'Ana'});
  const closed = detail(['decide', '', '', '', false, '', '', '', false], waiting(cardPrompt({canAsk: false})));
  assert.equal(closed.find(node => node.type === 'button' && node.children.includes('pending.askAgent')), null, 'no origin conversation, no question');
});
test('a card is recognised only in its own format; other prompts stay plain text', () => {
  const {parseCard} = context(async () => response(200, {}));
  assert.equal(parseCard('Approve the release?'), null);
  assert.equal(parseCard(JSON.stringify({v: 2, request: {title: 'x'}})), null);
  assert.equal(parseCard(JSON.stringify({v: 1, request: {}})), null);
  const card = parseCard(cardPrompt({blocking: true, thread: 'broken'}));
  assert.equal(card.request.title, 'Example'); assert.equal(card.blocking, true); assert.equal(card.thread.length, 0);
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
  const data = {dagRunDetails: {humanTaskResumePending: true, nodes: [{statusLabel: 'succeeded', step: {id: 'ask', humanTask: {prompt: cardPrompt()}}}]}};
  const view = detail(['decide', '', '', '', false, '', '', '', false], data);
  const button = view.find(node => node.type === 'button' && node.children.includes('pending.resume'));
  assert.ok(button); await button.props.onClick();
  assert.match(view.calls[0].url, /dag-runs\/ext-human-requests-request\/run-1\/human-tasks\/resume$/);
  assert.equal(view.calls[0].init.method, 'POST'); assert.equal(view.calls[0].init.body, '{}');
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
