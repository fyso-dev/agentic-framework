const test = require('node:test');
const assert = require('node:assert/strict');
const {validateAnswer} = require('../template/framework/extensions/human-requests/extensions/human-requests/validate-answer.cjs');
const {deliver} = require('../template/framework/extensions/human-requests/extensions/human-requests/deliver.cjs');

const env = {FYSO_DAGU_PORT:'1234', FYSO_ADMIN_USER:'test-user', FYSO_ADMIN_PASSWORD:'fixture-secret'};
const answer = {requestId:'request-1',decision:'answered',answer:'Sí',responder:'Ana'};
const choices = values => 'choices-hex=' + Buffer.from(JSON.stringify(values),'utf8').toString('hex');
const record = labels => ({name:'ext-human-requests-request', dagRunId:'request-1', labels});
const fake = (data, status = 200) => async () => ({ok:status >= 200 && status < 300, text:async()=>JSON.stringify({dagRunDetails:data})});

test('validates exact Unicode choices against the immutable run', async () => {
  const labels = ['human-request', choices(['Sí','No'])];
  await validateAnswer(answer,env,fake(record(labels)));
  await assert.rejects(validateAnswer({...answer,answer:'Si\u0301'},env,fake(record(labels))),/Invalid request answer/);
  await assert.rejects(validateAnswer({...answer,answer:'yes'},env,fake(record(labels))),/Invalid request answer/);
  await assert.rejects(validateAnswer({...answer,answer:'  '},env,fake(record(labels))),/Invalid request answer/);
  await validateAnswer({...answer,answer:'Free text'},env,fake(record(['human-request'])));
});

test('fails closed for missing identity, unavailable Dagu and incorrect run', async () => {
  await assert.rejects(validateAnswer(answer,{...env,FYSO_ADMIN_PASSWORD:''},fake(record(['human-request']))),/Cannot validate/);
  await assert.rejects(validateAnswer(answer,env,fake(record(['human-request']),503)),/Cannot validate/);
  await assert.rejects(validateAnswer(answer,env,async()=>{throw Error('sensitive');}),error=>error.message === 'Cannot validate request');
  await assert.rejects(validateAnswer(answer,env,fake({...record(['human-request']),dagRunId:'another'})),/Cannot validate/);
  await assert.rejects(validateAnswer(answer,env,fake(record([]))),/Cannot validate/);
});

test('rejects duplicate, malformed and invalid UTF-8 choices', async () => {
  for (const labels of [
    ['human-request',choices(['Sí']),choices(['No'])],
    ['human-request','choices-hex=f'],
    ['human-request','choices-hex=ff'],
    ['human-request',choices([1])],
    ['human-request',choices(['yes','   '])],
  ]) await assert.rejects(validateAnswer(answer,env,fake(record(labels))),/Invalid request choices/);
});

test('cancellation and expiry carry no answer and invalid decisions fail', async () => {
  const fetcher=fake(record(['human-request',choices(['Sí','No'])]));
  await validateAnswer({...answer,decision:'cancelled',answer:''},env,fetcher);
  await validateAnswer({...answer,decision:'expired',answer:'',responder:'system'},env,fetcher);
  await assert.rejects(validateAnswer({...answer,decision:'cancelled'},env,fetcher),/Invalid request answer/);
  await assert.rejects(validateAnswer({...answer,decision:'other'},env,fetcher),/Invalid request decision/);
});

test('malformed choices cannot block cancellation or expiry but answered fails closed', async () => {
  for (const labels of [
    ['human-request','choices-hex=f'],
    ['human-request',choices(['yes']),choices(['no'])],
    ['human-request',choices(['yes','  '])],
  ]) {
    const fetcher=fake(record(labels));
    await validateAnswer({...answer,decision:'cancelled',answer:''},env,fetcher);
    await validateAnswer({...answer,decision:'expired',answer:'',responder:'system'},env,fetcher);
    await assert.rejects(validateAnswer({...answer,answer:'yes'},env,fetcher),/Invalid request choices/);
    await assert.rejects(validateAnswer({...answer,decision:'cancelled',answer:'yes'},env,fetcher),/Invalid request answer/);
  }
});

test('requires a named responder, and only system may identify expiry', async () => {
  const fetcher=fake(record(['human-request']));
  for (const decision of ['answered','cancelled']) {
    for (const responder of ['', ' \t', undefined, 123]) {
      await assert.rejects(validateAnswer({...answer,decision,responder,answer:decision === 'answered' ? 'Sí' : ''},env,fetcher),/Invalid request answer/);
    }
  }
  for (const responder of ['', 'Ana', ' system ', undefined]) {
    await assert.rejects(validateAnswer({...answer,decision:'expired',answer:'',responder},env,fetcher),/Invalid request answer/);
  }
});

test('invalid persisted answer never reaches HTTP delivery', async () => {
  let sent = false;
  const validate = (value, vars) => validateAnswer(value,vars,fake(record(['human-request',choices(['Sí','No'])])));
  await assert.rejects(deliver({...env,DAG_RUN_ID:'request-1',REQUEST_DECISION:'answered',REQUEST_ANSWER:'other',REQUEST_ORIGIN_TYPE:'http'}, {
    validateAnswer:validate, deliverHttp:async()=>{sent=true;},
  }),/Invalid request answer/);
  assert.equal(sent,false);
});

test('invalid persisted answer never reaches OMB delivery or none output', async () => {
  const validate = (value, vars) => validateAnswer(value,vars,fake(record(['human-request',choices(['Sí','No'])])));
  for (const origin of ['omb','none']) {
    await assert.rejects(deliver({...env,DAG_RUN_ID:'request-1',REQUEST_DECISION:'answered',REQUEST_ANSWER:'other',
      REQUEST_ORIGIN_TYPE:origin,REQUEST_ORIGIN_REF:'{"bot":"fixture","task":"fixture"}',FYSO_OMB_PORT:'1234'},
    {validateAnswer:validate}),/Invalid request answer/);
  }
});
