// Resolve the project's native Tinyauth YAML into a private runtime file.
// Tinyauth 5.2 uses the first applicable config loader: YAML and env do not merge.
const fs = require('node:fs'), path = require('node:path');

/**
 * Apps routed by installed extensions (D58). Whoever may open the panel can already
 * install and run extensions, so an extension's app inherits the panel's access rule
 * unless the project declares that app in project/auth/tinyauth.yaml.
 */
function withExtensionApps(config, root) {
  const panel = config.apps?.panel;
  if (!panel) return config;
  for (const file of fs.globSync('extensions/*/Caddyfile', {cwd:root}).sort()) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [, app] of text.matchAll(/^http:\/\/([a-z][a-z0-9-]*)\.\{\$FYSO_WEB_DOMAIN\}/gm)) {
      if (!Object.hasOwn(config.apps, app)) config.apps[app] = structuredClone(panel);
    }
  }
  return config;
}
// Provider fragments use Tinyauth's native schema. Project-owned providers take
// precedence. A fragment with pending credentials leaves local login available.
function withExtensionProviders(config, root, read, expand, env) {
  const providers = { ...config.oauth?.providers };
  for (const file of fs.globSync('extensions/*/tinyauth.providers.yaml', {cwd:root}).sort()) {
    const extension = path.basename(path.dirname(file));
    if (!fs.existsSync(path.join(root, `.copier-answers.ext-${extension}.yml`))) continue;
    const fragment = read(path.join(root, file));
    for (const [id, provider] of Object.entries(fragment || {})) {
      if (Object.hasOwn(providers, id)) continue;
      const required = JSON.stringify(provider).matchAll(/\$\{(FYSO_AUTH_[A-Z0-9_]+)\}/g);
      if ([...required].some(([, name]) => !env[name])) continue;
      Object.defineProperty(providers, id, { value: expand(provider), enumerable: true });
    }
  }
  if (Object.keys(providers).length) config.oauth = { ...config.oauth, providers };
  return config;
}
module.exports = {withExtensionApps, withExtensionProviders};

if (require.main === module) {
  const {createRequire} = require('node:module');
  const {execFileSync} = require('node:child_process');
  const yaml = createRequire(fs.realpathSync(execFileSync('which', ['yaml'], {encoding:'utf8'}).trim()))('yaml');
  const env = process.env;
  const expand = value => {
    if (typeof value === 'string') return value.replace(/\$\{(FYSO_AUTH_[A-Z0-9_]+)\}/g, (_, name) => {
      if (!env[name]) throw Error(`Missing authentication secret: ${name}`);
      return env[name];
    });
    if (Array.isArray(value)) return value.map(expand);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,expand(item)]));
    return value;
  };
  try {
    const config = withExtensionApps(expand(yaml.parse(fs.readFileSync(path.join(env.FYSO_ROOT, 'project/auth/tinyauth.yaml'), 'utf8'))), env.FYSO_ROOT);
    withExtensionProviders(config, env.FYSO_ROOT, file => yaml.parse(fs.readFileSync(file, 'utf8')), expand, env);
    const runtime = path.join(env.FYSO_DATA, 'web-auth/runtime');
    fs.mkdirSync(runtime, {recursive:true, mode:0o700});
    const web = require('./web-origin.cjs');
    config.appUrl = web.origin('auth', env);
    config.server = {address:'127.0.0.1', port:Number(env.FYSO_AUTH_PORT)};
    config.database = {driver:'sqlite', path:path.join(runtime,'sessions.db')};
    // Project identity (D92): the login shows the project's name on the design system's dark
    // background; a ui block declared in project/auth/tinyauth.yaml wins.
    const brand = require('./brand.cjs').resolve(env);
    config.ui = {title: brand.name, backgroundImage: '/fyso-brand/login-background.svg', ...config.ui};
    config.labelProvider = 'none'; config.analytics = {enabled:false}; config.resources = {enabled:false};
    config.auth = {...config.auth, users:env.FYSO_AUTH_USERS.split(/[\n,]+/).filter(Boolean), secureCookie:web.scheme(env) === 'https', subdomainsEnabled:true, trustedProxies:['127.0.0.1/32']};
    // Remote MCP sign-in (D90): this login is the OAuth server of the panel's /mcp.
    const oauth = require('./mcp-oauth.cjs');
    const mcpEnv = {...env, FYSO_WEB_SCHEME: web.scheme(env), FYSO_AUTH_UPSTREAM: ''};
    if (oauth.enabled(mcpEnv)) {
      const declared = config.oidc?.clients?.mcp || {};
      config.oidc = {...config.oidc, privateKeyPath:path.join(runtime,'oidc/private.pem'), publicKeyPath:path.join(runtime,'oidc/public.pem'),
        clients:{...config.oidc?.clients, mcp:oauth.tinyauthClient(mcpEnv, declared)}};
    }
    const panel = config.apps?.panel?.users || {};
    // The redirect addresses the login trusts for the client: registration (D91) accepts only these.
    const redirectUris = config.oidc?.clients?.mcp?.trustedRedirectUris || [];
    fs.writeFileSync(oauth.accessFile(env), JSON.stringify({allow:panel.allow || '', block:panel.block || '', policy:config.auth?.acls?.policy || 'allow', redirectUris})+'\n', {mode:0o600});
    fs.writeFileSync(path.join(runtime,'config.yaml'), yaml.stringify(config), {mode:0o600});
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
