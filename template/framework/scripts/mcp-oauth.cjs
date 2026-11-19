// OAuth sign-in for the remote MCP (D90). The web login this project trusts, Tinyauth
// (an OpenID Connect provider since 5.1), is the authorization server: it signs people
// in, asks for consent and issues the tokens. That login is either the project's own
// or a shared one on this host (the hub, D61, FYSO_AUTH_UPSTREAM). This module only
// lets MCP clients find it and checks the tokens they bring:
// - protected resource metadata (RFC 9728) for the panel's /mcp, naming the issuer the
//   login itself announces in its discovery document (never derived from our domain);
// - with the project's own login, that discovery document again at the RFC 8414
//   address, with the PKCE method Tinyauth implements but does not advertise (MCP
//   clients refuse without it). A shared login serves its own;
// - a token check against the same login: its userinfo must answer for the token, the
//   subject must be the one Tinyauth derives for this client (UUIDv5 of
//   "user:client_id"), so a token issued to another client of a shared login is
//   refused, and the user must be allowed: Tinyauth's OIDC does not apply app ACLs.
// Tinyauth has no dynamic client registration, so the client is pre-registered:
// - own login: client `fyso-mcp`, registered here, secret FYSO_MCP_CLIENT_SECRET in
//   secrets.enc.yaml, allowed users = the panel's access rule;
// - shared login: the hub registers the client and keeps its secret; the project gets
//   FYSO_MCP_CLIENT_ID and the allowed users FYSO_MCP_ALLOW (Tinyauth filter syntax).
// With the own login, clients that register themselves (ChatGPT, claude.ai) get that
// same client from a registration endpoint (RFC 7591, D91): it hands out `fyso-mcp` and
// its secret for trusted redirect addresses only, so the secret works as a public
// client's. Sign-in, consent, PKCE S256, the fixed redirect list and the allowed users
// keep protecting the tokens. Tinyauth does not return `iss` with the authorization
// response (RFC 9207); without it ChatGPT uses a redirect per connection, which a fixed
// list cannot hold. The gateway passes the two answers that carry the code or the error
// back to the client through here, and `iss` is added.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const web = require('./web-origin.cjs');

const OWN_CLIENT_ID = 'fyso-mcp';
const SCOPE = 'openid profile';
// Claude Code needs a fixed local port for the callback of a pre-registered client.
const CALLBACK_PORT = 33418;
const REDIRECT_URIS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
  `http://localhost:${CALLBACK_PORT}/callback`,
  `http://127.0.0.1:${CALLBACK_PORT}/callback`,
  'https://chatgpt.com/connector_platform_oauth_redirect',
];
const RESOURCE_PATH = '/.well-known/oauth-protected-resource';
const AUTHORIZATION_SERVER_PATH = '/.well-known/oauth-authorization-server';
const REGISTRATION_PATH = '/oauth/register';
// Tinyauth's answers that send the browser back to the client: a redirect from
// /authorize (errors) and the JSON its consent page follows (the code, or an error).
const AUTHORIZATION_RESPONSE_PATHS = ['/authorize', '/api/oidc/authorize-complete'];
// Written by web-auth-config.cjs next to the own login's runtime configuration.
const accessFile = env => path.join(env.FYSO_DATA || '', 'web-auth/runtime/mcp-access.json');

const shared = env => !!env.FYSO_AUTH_UPSTREAM;
const clientId = env => shared(env) ? env.FYSO_MCP_CLIENT_ID || '' : OWN_CLIENT_ID;
const upstream = env => `http://${shared(env) ? env.FYSO_AUTH_UPSTREAM : `127.0.0.1:${env.FYSO_AUTH_PORT}`}`;

// On only with an HTTPS address (Tinyauth's issuer must be https) and a client: the own
// login's secret, or the client id the hub gave this project.
function enabled(env = process.env) {
  if (env.FYSO_WEB_SCHEME !== 'https') return false;
  if (shared(env)) return /^[A-Za-z0-9._-]{1,128}$/.test(env.FYSO_MCP_CLIENT_ID || '');
  return !!env.FYSO_AUTH_PORT && (env.FYSO_MCP_CLIENT_SECRET || '').length >= 32;
}

// The own login's native client, merged into its generated configuration. A project
// may add redirect addresses in project/auth/tinyauth.yaml under
// oidc.clients.mcp.trustedRedirectUris.
function tinyauthClient(env, declared = {}) {
  const extra = Array.isArray(declared.trustedRedirectUris) ? declared.trustedRedirectUris : [];
  return {
    clientId: OWN_CLIENT_ID,
    clientSecret: env.FYSO_MCP_CLIENT_SECRET,
    trustedRedirectUris: [...new Set([...REDIRECT_URIS, ...extra])],
    name: `Fyso ${env.FYSO_PROJECT || ''}`.trim(),
  };
}

async function discovery(env = process.env, fetchImpl = fetch) {
  const response = await fetchImpl(`${upstream(env)}/.well-known/openid-configuration`, {signal: AbortSignal.timeout(5000)});
  if (!response.ok) throw Error(`login discovery answered ${response.status}`);
  const metadata = await response.json();
  if (typeof metadata?.issuer !== 'string' || !metadata.issuer.startsWith('https://')) throw Error('login discovery has no https issuer');
  return metadata;
}
// Tinyauth 5.2 verifies S256 (and plain) but does not list them. Registration and `iss`
// come from this module (D91).
async function authorizationServerMetadata(env = process.env, fetchImpl = fetch) {
  const metadata = await discovery(env, fetchImpl);
  return {...metadata, code_challenge_methods_supported: ['S256'],
    registration_endpoint: `${metadata.issuer}${REGISTRATION_PATH}`, authorization_response_iss_parameter_supported: true};
}

// RFC 7591 registration with the own login's single client. Only redirect addresses the
// login trusts are accepted: any other could never complete a sign-in.
const AUTH_METHODS = ['client_secret_basic', 'client_secret_post'];
function trustedRedirects(env) {
  try {
    const listed = JSON.parse(fs.readFileSync(accessFile(env), 'utf8')).redirectUris;
    if (Array.isArray(listed) && listed.length) return listed;
  } catch {}
  return REDIRECT_URIS;
}
function register(request, env = process.env) {
  const refuse = (error, description) => ({status: 400, body: {error, error_description: description}});
  if (!request || typeof request !== 'object' || Array.isArray(request)) return refuse('invalid_client_metadata', 'Send the client metadata as a JSON object.');
  const redirects = request.redirect_uris;
  if (!Array.isArray(redirects) || !redirects.length || !redirects.every(uri => typeof uri === 'string')) return refuse('invalid_redirect_uri', 'redirect_uris is required.');
  const trusted = trustedRedirects(env);
  const unknown = redirects.filter(uri => !trusted.includes(uri));
  if (unknown.length) return refuse('invalid_redirect_uri', `Not a redirect address this login trusts: ${unknown.join(', ')}`);
  const grants = request.grant_types ?? ['authorization_code'];
  if (!Array.isArray(grants) || !grants.every(grant => ['authorization_code', 'refresh_token'].includes(grant))) return refuse('invalid_client_metadata', 'Only authorization_code and refresh_token grants are supported.');
  const responses = request.response_types ?? ['code'];
  if (!Array.isArray(responses) || !responses.every(type => type === 'code')) return refuse('invalid_client_metadata', 'Only the code response type is supported.');
  // The login always checks the secret: a client asking for none gets one anyway (RFC 7591 §3.2.1).
  const method = AUTH_METHODS.includes(request.token_endpoint_auth_method) ? request.token_endpoint_auth_method : 'client_secret_basic';
  return {status: 201, body: {client_id: OWN_CLIENT_ID, client_secret: env.FYSO_MCP_CLIENT_SECRET, client_secret_expires_at: 0,
    client_name: `Fyso ${env.FYSO_PROJECT || ''}`.trim(), redirect_uris: redirects, grant_types: grants, response_types: ['code'],
    token_endpoint_auth_method: method, scope: SCOPE}};
}

// RFC 9207: the issuer travels with every code or error sent back to a client.
function withIssuer(target, issuer) {
  let address;
  try { address = new URL(target); } catch { return target; }
  if (address.origin === new URL(issuer).origin) return target;   // the login's own pages
  if (!address.searchParams.has('code') && !address.searchParams.has('error')) return target;
  address.searchParams.set('iss', issuer);
  return address.toString();
}
// Passes an authorization response path to the login unchanged, adding `iss` (when
// given) to where it sends the browser back. The gateway falls back to the login when
// this endpoint is down.
function forwardAuthorization(req, res, env = process.env, issuer = null) {
  const target = new URL(upstream(env));
  const headers = {...req.headers};
  for (const hop of ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection']) delete headers[hop];
  return new Promise((resolve, reject) => {
    const out = require('node:http').request({host: target.hostname, port: target.port, method: req.method, path: req.url, headers}, answer => {
      const back = {...answer.headers};
      delete back.connection; delete back['transfer-encoding'];
      if (back.location && issuer) back.location = withIssuer(back.location, issuer);
      const json = !!issuer && /application\/json/.test(back['content-type'] || '');
      if (!json) { res.writeHead(answer.statusCode, back); answer.pipe(res); answer.on('end', resolve); return; }
      const chunks = [];
      answer.on('data', chunk => chunks.push(chunk));
      answer.on('end', () => {
        let body = Buffer.concat(chunks);
        try {
          const parsed = JSON.parse(body.toString('utf8'));
          if (typeof parsed?.redirect_uri === 'string') {
            parsed.redirect_uri = withIssuer(parsed.redirect_uri, issuer);
            body = Buffer.from(JSON.stringify(parsed));
          }
        } catch {}
        back['content-length'] = String(body.length);
        res.writeHead(answer.statusCode, back); res.end(body); resolve();
      });
    });
    out.on('error', reject);
    req.pipe(out);
  });
}

const resourceMetadataUrl = env => `${web.origin('panel', env)}${RESOURCE_PATH}/mcp`;
async function resourceMetadata(env = process.env, fetchImpl = fetch) {
  const {issuer} = await discovery(env, fetchImpl);
  return {
    resource: `${web.origin('panel', env)}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: SCOPE.split(' '),
    bearer_methods_supported: ['header'],
    resource_name: `Fyso ${env.FYSO_PROJECT || ''}`.trim(),
  };
}
const challenge = env => `Bearer resource_metadata="${resourceMetadataUrl(env)}", scope="${SCOPE}"`;

// Tinyauth's filter syntax: a comma-separated list of names, or /regex/.
function matches(filter, name) {
  const value = String(filter || '').trim();
  if (!value) return false;
  if (value.length > 1 && value.startsWith('/') && value.endsWith('/')) {
    try { return new RegExp(value.slice(1, -1)).test(name); } catch { return false; }
  }
  return value.split(',').map(item => item.trim()).includes(name);
}
// Same order as Tinyauth's user rule for local users: block, then allow, then policy.
function allowed(access, name) {
  if (!access || !name) return false;
  if (matches(access.block, name)) return false;
  if (String(access.allow || '').trim()) return matches(access.allow, name);
  return access.policy === 'allow';
}
// Shared login: only the users the hub lists for this project; nobody when it lists none.
function access(env) {
  if (shared(env)) return {allow: env.FYSO_MCP_ALLOW || '', block: '', policy: 'deny'};
  try { return JSON.parse(fs.readFileSync(accessFile(env), 'utf8')); } catch { return null; }
}

// Tinyauth's subject: uuid.NewSHA1(uuid.NameSpaceURL, "username:client_id").
const NAMESPACE_URL = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
function subject(username, client) {
  const hash = crypto.createHash('sha1').update(NAMESPACE_URL).update(`${username}:${client}`).digest().subarray(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Valid tokens are remembered for a minute, so a client's burst of calls asks once.
const REMEMBER_MS = 60_000;
function verifier(env = process.env, fetchImpl = fetch) {
  const cache = new Map();
  const client = clientId(env);
  return async header => {
    const match = /^Bearer ([A-Za-z0-9._~+/=-]{16,512})$/.exec(String(header || ''));
    if (!match || !client) return null;
    const key = crypto.createHash('sha256').update(match[1]).digest('hex');
    const now = Date.now();
    const known = cache.get(key);
    if (known && known.until > now) return known.user;
    cache.delete(key);
    let info;
    try {
      const response = await fetchImpl(`${upstream(env)}/api/oidc/userinfo`, {headers: {Authorization: `Bearer ${match[1]}`}, signal: AbortSignal.timeout(5000)});
      if (!response.ok) return null;
      info = await response.json();
    } catch { return null; }
    const user = typeof info?.preferred_username === 'string' ? info.preferred_username : '';
    if (!user || info.sub !== subject(user, client)) return null;
    if (!allowed(access(env), user)) return null;
    if (cache.size > 1000) cache.clear();
    cache.set(key, {user, until: now + REMEMBER_MS});
    return user;
  };
}

module.exports = {OWN_CLIENT_ID, SCOPE, CALLBACK_PORT, REDIRECT_URIS, RESOURCE_PATH, AUTHORIZATION_SERVER_PATH,
  REGISTRATION_PATH, AUTHORIZATION_RESPONSE_PATHS,
  shared, clientId, enabled, tinyauthClient, discovery, resourceMetadata, resourceMetadataUrl, challenge,
  authorizationServerMetadata, register, withIssuer, forwardAuthorization, allowed, subject, verifier, accessFile};
