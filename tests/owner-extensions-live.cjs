// Explicit opt-in acceptance against a disposable generated stack, never auto-discovered.
// Create .owner-extensions-test in FYSO_ROOT; use project_slug=owner-check and a
// fixture-only local web user admin with password fixture-owner-check-43.
// Run through that project's `mise exec -- node <checkout>/tests/owner-extensions-live.cjs`.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {execFileSync} = require('node:child_process');
const env = process.env, root = fs.realpathSync(env.FYSO_ROOT || '.');
assert.equal(env.FYSO_PROJECT, 'owner-check');
assert.ok(fs.existsSync(path.join(root, '.owner-extensions-test')), 'disposable fixture marker required');
assert.ok(Number(env.FYSO_HTTP_PORT) >= 30000, 'reserved test port block required');
const domain = env.FYSO_WEB_DOMAIN, port = env.FYSO_HTTP_PORT;
async function request(app, uri, {cookie, method = 'GET', body, accept} = {}) {
  // Node fetch may replace Host with the URL authority. Use native HTTP explicitly.
  return new Promise((resolve, reject) => {
    const req = require('node:http').request({hostname: '127.0.0.1', port, path: uri, method,
      headers: {Host: `${app}.${domain}:${port}`, ...(cookie && {Cookie: cookie}),
        ...(accept && {Accept: accept}), ...(body && {'Content-Type': 'application/json', Origin: `http://${app}.${domain}:${port}`})}}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), {status: res.statusCode,
        headers: Object.fromEntries(Object.entries(res.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]))})));
    });
    req.setTimeout(10000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
}
async function main() {
  const unauthenticated = await request('files', '/');
  assert.ok([302, 303, 401].includes(unauthenticated.status), `unauthenticated files status ${unauthenticated.status}: ${await unauthenticated.text()}`);
  const login = await request('auth', '/api/user/login', {method: 'POST', body: {username: 'admin', password: 'fixture-owner-check-43'}});
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const source = path.join(root, 'project', 'owner-fixture.html');
  fs.writeFileSync(source, '<script>throw new Error("must download")</script>');
  const delivery = require(path.join(root, 'extensions/deliverables/deliver.cjs')).put(source, 'index.html');
  const listing = await request('files', '/', {cookie, accept: 'application/json'});
  assert.equal(listing.status, 200);
  assert.ok((await listing.json()).some(f => f.name === delivery.name));
  const download = await request('files', '/' + encodeURIComponent(delivery.name), {cookie});
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-disposition'), 'attachment');
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(download.headers.get('content-security-policy'), 'sandbox');
  assert.equal(await download.text(), fs.readFileSync(source, 'utf8'));
  for (const uri of ['/.ui/index.html', '/.ui/files.js', '/.ui/vendor/i18next-26.5.11.min.js'])
    assert.equal((await request('files', uri, {cookie})).status, 200, uri);
  assert.equal((await request('files', '/fixture', {cookie, method: 'POST', body: {}})).status, 405);
  assert.equal((await request('panel', '/extensions/deliverables/panel/index.html', {cookie})).status, 200);
  assert.equal((await request('panel', '/extensions/deliverables/secrets.yaml', {cookie})).status, 404);
  console.log('PASS: authenticated listing, download headers, panel assets, private slots and read-only route');

  const runId = 'owner-fixture-' + Date.now();
  const dagEnv = {...env, DAGU_HOME: path.join(env.FYSO_DATA, 'dagu'), DAGU_DAGS_DIR: path.join(root, 'project/workflows'), DAGU_ENV_PASSTHROUGH_PREFIXES: 'FYSO_'};
  execFileSync('dagu', ['start', '--quiet', '--run-id', runId, 'project/workflows/ext-owner-loop-ask.yaml', '--', 'QUESTION=Fixture answer only?'], {cwd: root, env: dagEnv, timeout: 30000});
  const auth = 'Basic ' + Buffer.from(`${env.FYSO_ADMIN_USER}:${env.FYSO_ADMIN_PASSWORD}`).toString('base64');
  const api = async suffix => {
    const response = await fetch(`http://127.0.0.1:${env.FYSO_DAGU_PORT}/api/v1/dag-runs/ext-owner-loop-ask/${runId}${suffix}`, {headers: {Authorization: auth}, signal: AbortSignal.timeout(10000)});
    assert.equal(response.status, 200); return response.json();
  };
  assert.equal((await api('')).dagRunDetails.statusLabel, 'waiting');
  execFileSync('dagu', ['human-task', 'complete', '--run-id', runId, '--step', 'ask', '--input', 'answer=Fixture confirmed', 'ext-owner-loop-ask'], {cwd: root, env: dagEnv, timeout: 30000});
  let status;
  for (let tries = 0; tries < 30; tries++) {
    status = (await api('')).dagRunDetails.statusLabel;
    if (status === 'succeeded') break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.equal(status, 'succeeded');
  assert.equal((await api('/outputs')).outputs.answer, 'Fixture confirmed');
  console.log('PASS: native human task waits, accepts the supplied answer and resumes with that output');
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
