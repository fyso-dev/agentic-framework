// End to end against a real Tinyauth 5.2.0: generated config -> login -> authorize with
// PKCE -> token with the client secret -> fyso-mcp accepts it; viewer and wrong client refused.
// D91: a client that registers itself (ChatGPT's redirect) gets the client, and the
// authorization answers passed through fyso-mcp carry `iss`.
// Run by mcp-oauth-tinyauth.test.cjs: node mcp-oauth-tinyauth.cjs <repo> <tinyauth> <caddy> <yaml-bin-dir>
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const {spawn, execFileSync} = require('node:child_process');
const [repo, tinyauth, caddy, yamlDir] = process.argv.slice(2);
const scripts = path.join(repo, 'template/framework/scripts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fyso-oauth-e2e-'));
const port = 29000 + Math.floor(Math.random() * 500) * 10;
const PASSWORD = 'fixture-password-1', SECRET = crypto.randomBytes(32).toString('base64url');
const children = [];
const done = code => { for (const c of children) c.kill(); fs.rmSync(root, {recursive: true, force: true}); process.exit(code); };
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) done(1); };
const wait = async (url, tries = 100) => { for (let i = 0; i < tries; i++) { try { await fetch(url); return; } catch { await new Promise(r => setTimeout(r, 100)); } } throw Error(`not up: ${url}`); };

(async () => {
  fs.mkdirSync(path.join(root, 'project/auth'), {recursive: true});
  fs.writeFileSync(path.join(root, 'project/auth/tinyauth.yaml'),
    fs.readFileSync(path.join(repo, 'template/project/auth/tinyauth.yaml.jinja'), 'utf8').replaceAll('{{ admin_user }}', 'admin'));
  const hash = execFileSync(caddy, ['hash-password', '--bcrypt-cost', '4'], {input: PASSWORD}).toString().trim();
  const env = {...process.env, PATH: `${yamlDir}:${process.env.PATH}`, FYSO_ROOT: root, FYSO_DATA: root, FYSO_PROJECT: 'demo',
    FYSO_WEB_DOMAIN: 'demo.example.com', FYSO_HTTP_PORT: String(port), FYSO_AUTH_PORT: String(port + 9),
    FYSO_AUTH_USERS: `admin:${hash},viewer:${hash}`, FYSO_WEB_SCHEME: 'https', FYSO_MCP_CLIENT_SECRET: SECRET, FYSO_AUTH_UPSTREAM: ''};
  execFileSync(process.execPath, [path.join(scripts, 'web-auth-config.cjs')], {env, stdio: 'inherit'});
  const runtime = path.join(root, 'web-auth/runtime');
  check(fs.readFileSync(path.join(runtime, 'config.yaml'), 'utf8').includes('clientId: fyso-mcp'), 'generated config registers the client');
  const auth = spawn(tinyauth, [], {cwd: runtime, env: {PATH: process.env.PATH, HOME: process.env.HOME, TINYAUTH_CONFIGFILE: path.join(runtime, 'config.yaml')}, stdio: ['ignore', 'ignore', 'pipe']});
  children.push(auth); let authLog = ''; auth.stderr.on('data', d => authLog += d);
  const base = `http://127.0.0.1:${port + 9}`;
  await wait(`${base}/api/healthz`).catch(e => { console.log(authLog); throw e; });
  const headers = {Host: 'auth.demo.example.com', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'auth.demo.example.com'};
  const discovery = await (await fetch(`${base}/.well-known/openid-configuration`, {headers})).json();
  check(discovery.issuer === 'https://auth.demo.example.com', `issuer is the login's own (${discovery.issuer})`);

  async function tokenFor(user, clientId = 'fyso-mcp', secret = SECRET) {
    const login = await fetch(`${base}/api/user/login`, {method: 'POST', headers: {...headers, 'Content-Type': 'application/json'}, body: JSON.stringify({username: user, password: PASSWORD})});
    const cookie = (login.headers.getSetCookie() || []).map(c => c.split(';')[0]).join('; ');
    if (!login.ok || !cookie) throw Error(`login ${user}: ${login.status} ${await login.text()}`);
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const redirect = 'https://claude.ai/api/mcp/auth_callback';
    // What the MCP client opens in the browser: the issuer's /authorize, as the discovery names it.
    const query = new URLSearchParams({client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'openid profile', state: 'xyz', code_challenge: challenge, code_challenge_method: 'S256', resource: 'https://panel.demo.example.com/mcp'});
    const start = await fetch(`${base}/authorize?${query}`, {headers: {...headers, Cookie: cookie}, redirect: 'manual'});
    const location = start.headers.get('location') || '';
    const ticket = new URL(location, 'https://auth.demo.example.com').searchParams.get('oidc_ticket');
    if (!ticket) throw Error(`authorize ${user}: ${start.status} ${location}`);
    const complete = await fetch(`${base}/api/oidc/authorize-complete`, {method: 'POST', headers: {...headers, Cookie: cookie, 'Content-Type': 'application/json'},
      body: JSON.stringify({ticket})});
    const body = await complete.json();
    if (!complete.ok || !body.redirect_uri) throw Error(`authorize ${user}: ${complete.status} ${JSON.stringify(body)}`);
    const code = new URL(body.redirect_uri).searchParams.get('code');
    const token = await fetch(`${base}/api/oidc/token`, {method: 'POST', headers: {...headers, 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`},
      body: new URLSearchParams({grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier})});
    const result = await token.json();
    if (!token.ok) throw Error(`token ${user}: ${token.status} ${JSON.stringify(result)}`);
    return result;
  }
  // A wrong PKCE verifier must fail: proves S256 is enforced.
  const admin = await tokenFor('admin');
  check(typeof admin.access_token === 'string' && admin.access_token.length > 16, 'real token issued with PKCE S256 and client secret');
  let wrongSecret = false; try { await tokenFor('viewer', 'fyso-mcp', 'x'.repeat(43)); } catch { wrongSecret = true; }
  const viewer = await tokenFor('viewer');
  check(wrongSecret, 'a wrong client secret gets no token');

  const socket = path.join(root, 'mcp.sock');
  const mcp = spawn(process.execPath, [path.join(scripts, 'fyso-mcp.cjs'), '--http', socket], {env, stdio: ['ignore', 'ignore', 'pipe']});
  children.push(mcp);
  await new Promise(resolve => mcp.stderr.once('data', resolve));
  const call = (method, urlPath, hdrs = {}, body) => new Promise((resolve, reject) => {
    const req = http.request({socketPath: socket, path: urlPath, method, headers: {'Content-Type': 'application/json', ...hdrs}}, res => {
      let text = ''; res.on('data', c => text += c); res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null}));
    });
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const init = {jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}};
  const prm = await call('GET', '/.well-known/oauth-protected-resource/mcp');
  check(prm.body.authorization_servers[0] === discovery.issuer, 'protected resource names the real issuer');
  const as = await call('GET', '/.well-known/oauth-authorization-server');
  check(as.body.issuer === discovery.issuer && as.body.code_challenge_methods_supported[0] === 'S256' && as.body.token_endpoint.endsWith('/api/oidc/token'), 'authorization server metadata from the real login, with S256');
  const ok = await call('POST', '/mcp', {Authorization: `Bearer ${admin.access_token}`}, init);
  check(ok.status === 200 && ok.body.result.serverInfo.name === 'fyso', 'admin (panel user) token opens the MCP');
  const list = await call('POST', '/mcp', {Authorization: `Bearer ${admin.access_token}`}, {jsonrpc: '2.0', id: 2, method: 'tools/list'});
  check(list.body.result.tools.some(t => t.name === 'fyso_status'), 'tools listed with the OAuth token');
  check((await call('POST', '/mcp', {Authorization: `Bearer ${viewer.access_token}`}, init)).status === 401, 'viewer (not a panel user) is refused');
  check((await call('POST', '/mcp', {Authorization: 'Bearer not-a-real-token-123456'}, init)).status === 401, 'unknown token is refused');
  // D91, the way ChatGPT connects: register, authorize through the endpoint (as the gateway
  // routes it), get `iss` with the code, exchange it with the registered credentials.
  const raw = (method, urlPath, hdrs = {}, body) => new Promise((resolve, reject) => {
    const req = http.request({socketPath: socket, path: urlPath, method, headers: hdrs}, res => {
      let text = ''; res.on('data', c => text += c); res.on('end', () => resolve({status: res.statusCode, headers: res.headers, text}));
    });
    req.on('error', reject); req.end(body);
  });
  check(as.body.registration_endpoint === `${discovery.issuer}/oauth/register` && as.body.authorization_response_iss_parameter_supported === true, 'metadata names the registration endpoint and iss support');
  const chatgpt = 'https://chatgpt.com/connector_platform_oauth_redirect';
  const refused = await call('POST', '/oauth/register', {}, {redirect_uris: ['https://evil.example/callback']});
  check(refused.status === 400 && refused.body.error === 'invalid_redirect_uri', 'registration refuses an untrusted redirect');
  const reg = await call('POST', '/oauth/register', {}, {client_name: 'ChatGPT', redirect_uris: [chatgpt], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'client_secret_post'});
  check(reg.status === 201 && reg.body.client_id === 'fyso-mcp' && reg.body.client_secret === SECRET && reg.body.token_endpoint_auth_method === 'client_secret_post', 'registration returns the client');
  {
    const login = await fetch(`${base}/api/user/login`, {method: 'POST', headers: {...headers, 'Content-Type': 'application/json'}, body: JSON.stringify({username: 'admin', password: PASSWORD})});
    const cookie = (login.headers.getSetCookie() || []).map(c => c.split(';')[0]).join('; ');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const query = new URLSearchParams({client_id: reg.body.client_id, redirect_uri: chatgpt, response_type: 'code', scope: 'openid profile', state: 'st', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', resource: 'https://panel.demo.example.com/mcp'});
    const start = await raw('GET', `/authorize?${query}`, {...headers, Cookie: cookie});
    const ticket = new URL(start.headers.location || '', discovery.issuer).searchParams.get('oidc_ticket');
    check(start.status === 302 && !!ticket && !start.headers.location.includes('iss='), 'authorize passes through to the consent page unchanged');
    const bad = await raw('GET', `/authorize?${new URLSearchParams({...Object.fromEntries(query), response_type: 'token'})}`, {...headers, Cookie: cookie});
    const badUrl = new URL(bad.headers.location || 'x:', discovery.issuer);
    check(bad.status === 302 && badUrl.origin === 'https://chatgpt.com' && badUrl.searchParams.get('error') && badUrl.searchParams.get('iss') === discovery.issuer, 'an error sent back to the client carries iss');
    const complete = await raw('POST', '/api/oidc/authorize-complete', {...headers, Cookie: cookie, 'Content-Type': 'application/json'}, JSON.stringify({ticket}));
    const back = new URL(JSON.parse(complete.text).redirect_uri);
    check(complete.status === 200 && back.origin + back.pathname === chatgpt && back.searchParams.get('iss') === discovery.issuer && back.searchParams.get('state') === 'st', 'the code sent back to the client carries iss');
    const exchange = await fetch(`${base}/api/oidc/token`, {method: 'POST', headers: {...headers, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({grant_type: 'authorization_code', code: back.searchParams.get('code'), redirect_uri: chatgpt, code_verifier: verifier, client_id: reg.body.client_id, client_secret: reg.body.client_secret, resource: 'https://panel.demo.example.com/mcp'})});
    const issued = await exchange.json();
    check(exchange.ok && (await call('POST', '/mcp', {Authorization: `Bearer ${issued.access_token}`}, init)).status === 200, 'the registered client\'s token opens the MCP');
  }
  // Tinyauth keeps one session per user and client: signing in again revokes the old token.
  const second = await tokenFor('admin');
  check((await call('POST', '/mcp', {Authorization: `Bearer ${second.access_token}`}, init)).status === 200, 'a new sign-in works');
  // The endpoint remembers a valid token for a minute; the login itself no longer knows it.
  check((await fetch(`${base}/api/oidc/userinfo`, {headers: {Authorization: `Bearer ${admin.access_token}`}})).status === 401, 'the previous token of the same user and client is revoked by the login');
  done(0);
})().catch(error => { console.log(`FAIL ${error.message}`); done(1); });
