// The menu bar app's CLI (installer/macos/app/Fyso.swift, D85/D86), compiled with swiftc and run
// against throwaway data only: its own FYSO_HOME, fake projects, a fake process-compose socket,
// a fake Fyso Biz authorization server and a fake GitHub releases list. macOS only.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {execFileSync, spawn} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const skip = process.platform !== 'darwin' ? 'macOS only' : false;
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fyso-app-test-')));
const contents = path.join(tmp, 'Contents');
const bin = path.join(contents, 'MacOS', 'fyso');
const fysoHome = path.join(tmp, 'home');

function setup() {
  fs.mkdirSync(path.dirname(bin), {recursive: true});
  fs.mkdirSync(path.join(contents, 'Resources'), {recursive: true});
  fs.cpSync(path.join(root, 'installer/macos/app/locales'), path.join(contents, 'Resources/locales'), {recursive: true});
  fs.writeFileSync(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>CFBundleName</key><string>Fyso</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>FysoEdition</key><string>core</string></dict></plist>`);
  execFileSync('swiftc', ['-swift-version', '5', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos15.0`,
    path.join(root, 'installer/macos/app/Fyso.swift'), '-o', bin], {stdio: 'inherit'});
}
if (!skip) setup();
test.after(() => fs.rmSync(tmp, {recursive: true, force: true}));

const baseEnv = {...process.env, FYSO_HOME: fysoHome, FYSO_TEST: '1', FYSO_LANG: 'en', FYSO_APP_CONTENTS: contents,
  FYSO_UPDATE_URL: 'http://127.0.0.1:9/none'};
/** Run the CLI asynchronously (the fake servers live in this process); resolves {code, out, err}. */
function fyso(args, env = {}, onLine) {
  return new Promise(resolve => {
    const child = spawn(bin, args, {env: {...baseEnv, ...env}});
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; if (onLine) for (const l of String(d).split('\n')) if (l) onLine(l); });
    child.stderr.on('data', d => { err += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
    child.on('close', code => { clearTimeout(timer); resolve({code, out, err}); });
  });
}
function project(name, slug, port) {
  const dir = path.join(tmp, slug);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, '.copier-answers.yml'), `project_name: ${name}\nproject_slug: ${slug}\nport_base: ${port}\n`);
  return dir;
}
const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));

test('lists registered instances and offers to add a running one that is not registered', {skip}, async () => {
  const known = project('Known', 'fysotestknown', 47910);
  const loose = project('Loose', 'fysotestloose', 47920);
  fs.mkdirSync(fysoHome, {recursive: true});
  fs.writeFileSync(path.join(fysoHome, 'projects.tsv'), `47910\t${known}\n`);
  // A fake process-compose: a Unix socket owned by a process whose cwd is the project folder.
  const socket = `/tmp/fyso-fysotestloose-47920.sock`;
  fs.rmSync(socket, {force: true});
  const pc = spawn(process.execPath, ['-e', `require('node:http').createServer((q,s)=>{s.setHeader('content-type','application/json');s.end(JSON.stringify({data:[{name:'caddy',status:'Running',is_ready:'Ready',has_ready_probe:true}]}))}).listen(${JSON.stringify(socket)},()=>console.log('up'))`],
    {cwd: loose, stdio: ['ignore', 'pipe', 'inherit']});
  await new Promise(r => pc.stdout.once('data', r));
  try {
    // Other stacks running on this Mac are listed too; keep only this test's projects.
    const mine = rows => rows.filter(r => r.folder.includes(path.basename(tmp)));
    const json = mine(JSON.parse((await fyso(['list', '--json'])).out));
    assert.deepStrictEqual(json.map(r => [r.name, r.registered, r.state]), [['Known', true, 'stopped'], ['Loose', false, 'running']]);
    const text = (await fyso(['list'])).out;
    assert.match(text, / \+ Loose/);
    assert.match(text, /fyso add/);
    assert.strictEqual((await fyso(['add', loose])).code, 0);
    const after = mine(JSON.parse((await fyso(['list', '--json'])).out));
    assert.deepStrictEqual(after.map(r => [r.name, r.registered]), [['Known', true], ['Loose', true]]);
  } finally {
    pc.kill(); fs.rmSync(socket, {force: true});
  }
});

/** Fake Fyso Biz: RFC 8414 metadata, dynamic registration, authorize (redirects at once), token, userinfo. */
async function fakeBiz() {
  const seen = {registrations: 0, tokens: []};
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, origin);
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      const send = (code, value) => { res.writeHead(code, {'content-type': 'application/json'}); res.end(JSON.stringify(value)); };
      if (url.pathname === '/.well-known/oauth-authorization-server') return send(200, {
        issuer: origin, authorization_endpoint: `${origin}/oauth/authorize`, token_endpoint: `${origin}/oauth/token`,
        registration_endpoint: `${origin}/oauth/register`, userinfo_endpoint: `${origin}/oauth/userinfo`, code_challenge_methods_supported: ['S256']});
      if (url.pathname === '/oauth/register') {
        seen.registrations++; const r = JSON.parse(body); seen.redirectUris = r.redirect_uris;
        return send(201, {client_id: 'app-client', redirect_uris: r.redirect_uris});
      }
      if (url.pathname === '/oauth/authorize') {
        seen.authorize = Object.fromEntries(url.searchParams);
        const back = new URL(url.searchParams.get('redirect_uri'));
        back.search = new URLSearchParams({code: 'the-code', state: url.searchParams.get('state')}).toString();
        res.writeHead(302, {location: back.toString()}); return res.end();
      }
      if (url.pathname === '/oauth/token') {
        const p = Object.fromEntries(new URLSearchParams(body)); seen.tokens.push(p);
        const crypto = require('node:crypto');
        const ok = p.code === 'the-code' && crypto.createHash('sha256').update(p.code_verifier).digest('base64url') === seen.authorize.code_challenge
          && p.redirect_uri === seen.authorize.redirect_uri;
        return ok ? send(200, {access_token: 'access-1', token_type: 'bearer', expires_in: 3600, refresh_token: 'refresh-1'}) : send(400, {error: 'invalid_grant'});
      }
      // Streamable HTTP MCP: initialize opens a session; tools/call answers as one SSE event.
      if (url.pathname === '/mcp' && seen.tools) {
        if (req.headers.authorization !== 'Bearer access-1') return send(401, {});
        const m = JSON.parse(body);
        if (m.method === 'initialize') { res.writeHead(200, {'content-type': 'application/json', 'mcp-session-id': 's-1'}); return res.end(JSON.stringify({jsonrpc: '2.0', id: m.id, result: {protocolVersion: '2025-06-18', capabilities: {}}})); }
        if (req.headers['mcp-session-id'] !== 's-1') return send(400, {});
        if (m.method === 'notifications/initialized') { res.writeHead(202); return res.end(); }
        seen.calls = [...(seen.calls || []), m.params];
        res.writeHead(200, {'content-type': 'text/event-stream'});
        // A tool this Biz does not offer answers as a tool error (an older Biz).
        const payload = seen.tools[m.params.name];
        const result = payload ? {content: [{type: 'text', text: JSON.stringify(payload)}]} : {isError: true, content: [{type: 'text', text: 'unknown tool'}]};
        return res.end(`event: message\ndata: ${JSON.stringify({jsonrpc: '2.0', id: m.id, result})}\n\n`);
      }
      if (url.pathname === '/oauth/userinfo') return req.headers.authorization === 'Bearer access-1' ? send(200, {name: 'Ana', email: 'ana@example.com'}) : send(401, {});
      send(404, {});
    });
  });
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  return {server, origin, seen};
}
/** Follow the authorization URL the CLI prints, as the browser would. */
function browse(line) {
  if (!line.startsWith('authorize: ')) return;
  const go = u => http.get(u, res => { res.resume(); if (res.headers.location) go(res.headers.location); });
  go(line.slice('authorize: '.length));
}

test('Biz sign-in receives the session on a loopback callback and hands it to the next instance', {skip}, async () => {
  const biz = await fakeBiz();
  const env = {FYSO_EDITION: 'biz', FYSO_BIZ_URL: biz.origin};
  try {
    assert.strictEqual((await fyso(['biz-status'], env)).code, 3);
    const login = await fyso(['biz-login'], env, browse);
    assert.strictEqual(login.code, 0, login.err);
    assert.match(login.out, /ana@example\.com/);
    assert.deepStrictEqual(biz.seen.redirectUris, ['http://127.0.0.1/callback']);
    assert.match(biz.seen.authorize.redirect_uri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    assert.strictEqual(biz.seen.authorize.code_challenge_method, 'S256');
    const grantFile = path.join(fysoHome, 'biz/oauth.json');
    assert.strictEqual(fs.statSync(grantFile).mode & 0o777, 0o600);
    const grant = JSON.parse(fs.readFileSync(grantFile, 'utf8'));
    assert.deepStrictEqual([grant.origin, grant.clientId, grant.accessToken, grant.refreshToken], [biz.origin, 'app-client', 'access-1', 'refresh-1']);

    // create: a fake installer registers a new project; the app moves the grant into it and
    // installs the Biz extension through the project's own mise task (recorded by a fake task).
    const made = path.join(tmp, 'bizproject');
    fs.writeFileSync(path.join(contents, 'Resources/fyso-installer.sh'), `#!/bin/bash
set -e
mkdir -p "${made}"
printf 'project_name: Biz Project\\nproject_slug: bizproject\\nport_base: 47930\\n' > "${made}/.copier-answers.yml"
printf 'echo "$*" > ext-add.args\\n' > "${made}/record.sh"
printf '[tasks."ext:add"]\\nrun = "bash record.sh"\\n' > "${made}/mise.toml"
printf '47930\\t%s\\n' "${made}" >> "$FYSO_HOME/projects.tsv"
`);
    const created = await fyso(['create'], {...env, MISE_TRUSTED_CONFIG_PATHS: made});
    assert.strictEqual(created.code, 0, created.out + created.err);
    const handed = path.join(made, '.data/ext/biz/oauth.json');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(handed, 'utf8')), grant);
    assert.strictEqual(fs.statSync(handed).mode & 0o777, 0o600);
    assert.ok(!fs.existsSync(grantFile), 'the app gives its grant away (Biz rotates refresh tokens)');
    assert.strictEqual(fs.readFileSync(path.join(made, 'ext-add.args'), 'utf8').trim(), `biz --defaults -d biz_url=${biz.origin}`);
    const status = await fyso(['biz-status'], env);
    assert.match(status.out, /sign in again/);
  } finally {
    biz.server.close();
  }
});

test('a person with departments connects with the organization only, no project', {skip}, async () => {
  const biz = await fakeBiz();
  const env = {FYSO_EDITION: 'biz', FYSO_BIZ_URL: biz.origin};
  const ventas = '0b6f1c1e-3c55-4a43-9a3e-5c1f0f6f4a11', soporte = '7d2e1a40-1b2c-4d3e-8f90-112233445566';
  const lider = {id: 'lider', name: 'Líder', custom: false, levels: {objetivos: 2, agentes: 2, fuentes: 2}};
  biz.seen.tools = {
    departamentos_framework: {organizacion: 'acme', departamentos: [
      {departamento_id: ventas, nombre: 'Ventas', rol: lider, equipos: [{equipo_id: 'e1', nombre: 'Ventas'}]},
      {departamento_id: soporte, nombre: 'Soporte', rol: {...lider, id: 'miembro', name: 'Miembro'}, equipos: []}]},
    // Still offered by Biz until its deprecation; the app must not need it.
    proyectos_framework: {organizacion: 'acme', proyectos: [{proyecto_id: ventas, nombre: 'Ventas', nivel: {id: 'n1', nombre: 'Operador'}, equipos: []}]}};
  const made = path.join(tmp, 'bizdepartments');
  fs.writeFileSync(path.join(contents, 'Resources/fyso-installer.sh'), `#!/bin/bash
set -e
mkdir -p "${made}"
printf 'project_name: Biz Departments\\nproject_slug: bizdepartments\\nport_base: 47950\\n' > "${made}/.copier-answers.yml"
printf 'echo "$*" > ext-add.args\\n' > "${made}/record.sh"
printf '[tasks."ext:add"]\\nrun = "bash record.sh"\\n' > "${made}/mise.toml"
printf '47950\\t%s\\n' "${made}" >> "$FYSO_HOME/projects.tsv"
`);
  try {
    assert.strictEqual((await fyso(['biz-login'], env, browse)).code, 0);
    // No project chooser: one call creates the instance, bound to the organization only.
    const created = await fyso(['create'], {...env, MISE_TRUSTED_CONFIG_PATHS: made});
    assert.strictEqual(created.code, 0, created.out + created.err);
    assert.match(created.out, /Ventas \(Líder\), Soporte \(Miembro\)/);
    assert.strictEqual(fs.readFileSync(path.join(made, 'ext-add.args'), 'utf8').trim(),
      `biz --defaults -d biz_url=${biz.origin} -d biz_access_organization=acme`);
    assert.ok(biz.seen.calls.every(c => c.name === 'departamentos_framework'));
  } finally {
    biz.server.close();
  }
});

test('an older Biz without departments falls back to binding the instance to a project', {skip}, async () => {
  const biz = await fakeBiz();
  const env = {FYSO_EDITION: 'biz', FYSO_BIZ_URL: biz.origin};
  const ventas = '0b6f1c1e-3c55-4a43-9a3e-5c1f0f6f4a11', soporte = '7d2e1a40-1b2c-4d3e-8f90-112233445566';
  biz.seen.tools = {proyectos_framework: {organizacion: 'acme', proyectos: [
    {proyecto_id: ventas, nombre: 'Ventas', nivel: {id: 'n1', nombre: 'Operador'}, equipos: [{equipo_id: 'e1', nombre: 'Ventas'}]},
    {proyecto_id: soporte, nombre: 'Soporte', nivel: {id: 'n2', nombre: 'Operador'}, equipos: []}]}};
  const made = path.join(tmp, 'bizmanaged');
  fs.writeFileSync(path.join(contents, 'Resources/fyso-installer.sh'), `#!/bin/bash
set -e
mkdir -p "${made}"
printf 'project_name: Biz Managed\\nproject_slug: bizmanaged\\nport_base: 47940\\n' > "${made}/.copier-answers.yml"
printf 'echo "$*" > ext-add.args\\n' > "${made}/record.sh"
printf '[tasks."ext:add"]\\nrun = "bash record.sh"\\n' > "${made}/mise.toml"
printf '47940\\t%s\\n' "${made}" >> "$FYSO_HOME/projects.tsv"
`);
  try {
    assert.strictEqual((await fyso(['biz-login'], env, browse)).code, 0);
    // Several projects and no choice: nothing is created; the CLI lists them.
    const unchosen = await fyso(['create'], {...env, MISE_TRUSTED_CONFIG_PATHS: made});
    assert.notStrictEqual(unchosen.code, 0);
    assert.match(unchosen.out, new RegExp(ventas));
    assert.match(unchosen.out + unchosen.err, /--project/);
    assert.ok(!fs.existsSync(made), 'no instance without a project');
    // An unassigned id is refused before the form.
    const unknown = await fyso(['create', '--project', 'ffffffff-ffff-4fff-8fff-ffffffffffff'], {...env, MISE_TRUSTED_CONFIG_PATHS: made});
    assert.notStrictEqual(unknown.code, 0);
    assert.match(unknown.out + unknown.err, /not assigned/);
    // The chosen project binds the extension to it (managed access).
    const created = await fyso(['create', '--project', ventas.toUpperCase()], {...env, MISE_TRUSTED_CONFIG_PATHS: made});
    assert.strictEqual(created.code, 0, created.out + created.err);
    assert.match(created.out, /Ventas \(Operador\)/);
    assert.strictEqual(fs.readFileSync(path.join(made, 'ext-add.args'), 'utf8').trim(),
      `biz --defaults -d biz_url=${biz.origin} -d biz_access_organization=acme -d biz_access_project=${ventas}`);
    assert.deepStrictEqual([...new Set(biz.seen.calls.map(c => c.name))].sort(), ['departamentos_framework', 'proyectos_framework']);
  } finally {
    biz.server.close();
  }
});

test('update check reads the newest macos-v release with this edition\'s dmg', {skip}, async () => {
  const releases = [
    {tag_name: 'v0.2.0', assets: [{name: 'Fyso.dmg', browser_download_url: 'x'}]},
    {tag_name: 'macos-v0.3.0', prerelease: true, assets: [{name: 'Fyso.dmg', browser_download_url: 'pre'}]},
    {tag_name: 'macos-v0.2.1', html_url: 'https://example.test/r/0.2.1', assets: [{name: 'Fyso.dmg', browser_download_url: 'https://example.test/Fyso.dmg'}]},
    {tag_name: 'macos-v0.2.0', assets: [{name: 'Fyso.dmg', browser_download_url: 'old'}]},
    {tag_name: 'macos-v0.4.0', assets: [{name: 'Fyso-Biz.dmg', browser_download_url: 'biz-only'}]},
  ];
  const server = http.createServer((q, s) => { s.setHeader('content-type', 'application/json'); s.end(JSON.stringify(releases)); });
  const port = await listen(server);
  try {
    const env = {FYSO_UPDATE_URL: `http://127.0.0.1:${port}/releases`};
    const core = await fyso(['update', '--check'], env);
    assert.match(core.out, /Update to version 0\.2\.1 — https:\/\/example\.test\/r\/0\.2\.1/);
    const biz = await fyso(['update', '--check'], {...env, FYSO_EDITION: 'biz'});
    assert.match(biz.out, /version 0\.4\.0/);
    releases.splice(2, 1); releases.splice(2, 1); releases.pop();
    assert.match((await fyso(['update', '--check'], env)).out, /0\.1\.0 is up to date/);
    const down = await fyso(['update', '--check'], {FYSO_UPDATE_URL: 'http://127.0.0.1:9/none'});
    assert.strictEqual(down.code, 1);
    assert.match(down.err, /Could not check/);
  } finally {
    server.close();
  }
});
