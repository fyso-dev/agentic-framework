// OAuth sign-in for the remote MCP (D88). The web login this project trusts, Tinyauth
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
];
const RESOURCE_PATH = '/.well-known/oauth-protected-resource';
const AUTHORIZATION_SERVER_PATH = '/.well-known/oauth-authorization-server';
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
// Tinyauth 5.2 verifies S256 (and plain) but does not list them.
async function authorizationServerMetadata(env = process.env, fetchImpl = fetch) {
  return {...await discovery(env, fetchImpl), code_challenge_methods_supported: ['S256']};
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
  shared, clientId, enabled, tinyauthClient, discovery, resourceMetadata, resourceMetadataUrl, challenge,
  authorizationServerMetadata, allowed, subject, verifier, accessFile};
