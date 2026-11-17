const test = require('node:test');
const assert = require('node:assert/strict');
const {sweep} = require('../template/framework/extensions/human-requests/extensions/human-requests/sweep.cjs');
const {deliver} = require('../template/framework/extensions/human-requests/extensions/human-requests/deliver.cjs');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawnSync} = require('node:child_process');

test('sweep expires only overdue requests belonging to this extension', async () => {
  const calls = [];
  const runs = [
    {name: 'ext-human-requests-request', dagRunId: 'old', labels: ['deadline=1767225600']},
    {name: 'ext-human-requests-request', dagRunId: 'future', labels: ['deadline=1830297600']},
    {name: 'other', dagRunId: 'other', labels: ['deadline=1767225600']},
    {name: 'ext-human-requests-request', dagRunId: 'bad', labels: ['deadline=invalid']},
    {name: 'ext-human-requests-request', dagRunId: 'ambiguous', labels: ['deadline=1767225600', 'deadline=1767225601']},
  ];
  const fake = async (url, options) => {
    calls.push({url, options});
    return {ok: true, json: async () => options.method === 'POST' ? {} : url.includes('/dag-runs?') ? {dagRuns: runs} : {dagRunDetails: {nodes:[{step:{id:'ask'}, statusLabel:'waiting'}]}}};
  };
  await sweep({FYSO_DAGU_PORT: '1234', FYSO_ADMIN_USER: 'u', FYSO_ADMIN_PASSWORD: 'p'}, fake, Date.parse('2027-01-01T00:00:00Z'));
  const posted = calls.filter(c => c.options.method === 'POST');
  assert.equal(posted.length, 1);
  assert.match(posted[0].url, /\/old\/human-tasks\/ask\/complete$/);
  assert.deepEqual(JSON.parse(posted[0].options.body), {answer: '', comment: '', responder: 'system', decision: 'expired'});
});

test('delivery rejects unconfigured callbacks and invalid project ports', async () => {
  const base = {REQUEST_DECISION: 'answered'};
  const dependencies = {validateAnswer:async()=>{}};
  await assert.rejects(deliver({...base, REQUEST_ORIGIN_TYPE: 'http'}, dependencies), /not configured/);
  await assert.rejects(deliver({...base, REQUEST_ORIGIN_TYPE: 'omb', FYSO_OMB_PORT: ''}, dependencies), /Explicit project/);
  await assert.rejects(deliver({...base, REQUEST_ORIGIN_TYPE: 'omb', FYSO_OMB_PORT: '1234', REQUEST_ORIGIN_REF: '{"bot":"-x","task":"t"}'}, dependencies), /identifiers/);
});

test('OMB retries use a stable id for a request and preserve its payload', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fyso-hr-test-'));
  try {
    const stub = path.join(dir, 'openmausbot');
    fs.writeFileSync(stub, '#!/bin/sh\nprintf "%s\\n" "$@" > "$CAPTURE_ARGS"\ncat > "$CAPTURE_INPUT"\n', {mode: 0o700});
    const script = path.join(__dirname, '../template/framework/extensions/human-requests/extensions/human-requests/deliver.cjs');
    const args = path.join(dir, 'args'), input = path.join(dir, 'input');
    const env = {...process.env, PATH: `${dir}:${process.env.PATH}`, CAPTURE_ARGS: args, CAPTURE_INPUT: input,
      DAG_RUN_ID: 'request-123', REQUEST_DECISION: 'answered', REQUEST_ANSWER: 'alpha', REQUEST_ORIGIN_TYPE: 'omb',
      REQUEST_ORIGIN_REF: JSON.stringify({bot:'bot-1', task:'task-1'}), FYSO_OMB_PORT: '1234'};
    const run = overrides => {
      const runner = 'require(process.argv[1]).deliver(process.env,{validateAnswer:async()=>{}}).catch(e=>{console.error(e.message);process.exitCode=1})';
      const result = spawnSync(process.execPath, ['-e', runner, script], {env: {...env, ...overrides}, encoding: 'utf8'});
      assert.equal(result.status, 0, result.stderr);
      return {args: fs.readFileSync(args, 'utf8').trim().split('\n'), input: fs.readFileSync(input, 'utf8')};
    };
    const first = run({}), second = run({}), other = run({DAG_RUN_ID:'request-456'});
    const id = result => result.args[result.args.indexOf('--send-id') + 1];
    assert.match(id(first), /^hr_[0-9a-f]{64}$/);
    assert.equal(id(first), id(second));
    assert.notEqual(id(first), id(other));
    assert.equal(first.input, second.input);
    assert.match(first.input, /"answer":"alpha"/);
    assert.equal(first.args[first.args.indexOf('--wait') + 1], 'none');
    const runner = 'require(process.argv[1]).deliver(process.env,{validateAnswer:async()=>{}}).catch(e=>{console.error(e.message);process.exitCode=1})';
    const missing = spawnSync(process.execPath, ['-e', runner, script], {env:{...env, DAG_RUN_ID:''}, encoding:'utf8'});
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /stable Dagu run ID/);
    fs.writeFileSync(stub, '#!/bin/sh\necho rejected >&2\nexit 1\n', {mode:0o700});
    const rejected = spawnSync(process.execPath, ['-e', runner, script], {env, encoding:'utf8'});
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /delivery failed or is uncertain/);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

test('sweep continues after an ambiguous 503 and resumes only confirmed pending runs', async () => {
  const calls=[]; const env={FYSO_DAGU_PORT:'1234',FYSO_ADMIN_USER:'u',FYSO_ADMIN_PASSWORD:'p'};
  const runs=['a','b','c'].map(dagRunId=>({name:'ext-human-requests-request',dagRunId,labels:['deadline=1']}));
  const fake=async(url,options)=>{calls.push([url,options.method||'GET']);
    if(url.includes('/dag-runs?')) return {ok:true,json:async()=>({dagRuns:runs})};
    if(url.endsWith('/a/human-tasks/ask/complete')) return {ok:false,status:503};
    if(url.endsWith('/b')) return {ok:true,json:async()=>({dagRunDetails:{humanTaskResumePending:true,nodes:[{step:{id:'ask'},statusLabel:'succeeded'}]}})};
    if(options.method==='POST') return {ok:true,json:async()=>({})};
    return {ok:true,json:async()=>({dagRunDetails:{nodes:[{step:{id:'ask'},statusLabel:'waiting'}]}})};
  };
  await assert.rejects(sweep(env,fake,2000),/could not be processed/);
  assert.ok(calls.some(([url,method])=>method==='POST' && url.endsWith('/b/human-tasks/resume')));
  assert.ok(calls.some(([url,method])=>method==='POST' && url.endsWith('/c/human-tasks/ask/complete')));
  assert.ok(!calls.some(([url,method])=>method==='POST' && url.endsWith('/a/human-tasks/resume')));
  assert.ok(!calls.some(([url,method])=>method==='POST' && url.endsWith('/b/human-tasks/ask/complete')));
});
