const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {client} = require('../template/framework/scripts/dagu-client.cjs');

// Fake Dagu: two workflows, one that may overlap and one that must not.
function fakeDagu() {
  const calls = [];
  const runs = new Map();
  const server = http.createServer((req, res) => {
    const send = body => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(body)); };
    let m;
    if ((m = /^\/api\/v1\/dags\/([^/]+)$/.exec(req.url))) {
      calls.push(`spec ${m[1]}`);
      return send({dag: {maxActiveRuns: m[1] === 'reads' ? 4 : 1}});
    }
    if ((m = /^\/api\/v1\/dags\/([^/]+)\/(start|enqueue)$/.exec(req.url)) && req.method === 'POST') {
      calls.push(`${m[2]} ${m[1]}`);
      const id = `run-${calls.length}`; runs.set(id, 0);
      return send({dagRunId: id});
    }
    if ((m = /^\/api\/v1\/dag-runs\/[^/]+\/([^/]+)\/outputs$/.exec(req.url))) return send({outputs: {result: '{"ok":true}'}});
    if ((m = /^\/api\/v1\/dag-runs\/[^/]+\/([^/]+)$/.exec(req.url))) {
      const seen = runs.get(m[1]) + 1; runs.set(m[1], seen);
      return send({dagRunDetails: {statusLabel: seen > 1 ? 'succeeded' : 'running'}});
    }
    res.writeHead(404).end();
  });
  return {server, calls};
}

test('starts workflows that may overlap, queues the rest, and asks Dagu once per workflow (D80)', async () => {
  const {server, calls} = fakeDagu();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const dagu = client({FYSO_DAGU_PORT: String(server.address().port), FYSO_ADMIN_USER: 'u', FYSO_ADMIN_PASSWORD: 'p'});
    const started = Date.now();
    assert.deepEqual((await dagu.run('reads', {}, {output: 'result'})).output, {ok: true});
    // The first polls come quickly: a run that finishes at once is read in well under a second.
    assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
    await dagu.run('reads', {}, {output: 'result'});
    await dagu.run('writes', {}, {output: 'result'});
    assert.deepEqual(calls, ['spec reads', 'start reads', 'start reads', 'spec writes', 'enqueue writes']);
  } finally { server.close(); }
});
