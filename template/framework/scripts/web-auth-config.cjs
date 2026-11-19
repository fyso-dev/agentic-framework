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
/**
 * Fyso branding of the login page (issue #83): only Tinyauth's native `ui.title` and
 * `ui.backgroundImage`. The image is embedded as a data URL so the resources file
 * server stays disabled; values the project sets under `ui` win.
 */
function withBranding(config, dir = path.join(__dirname, '../web-auth')) {
  const image = fs.readFileSync(path.join(dir, 'background.webp')).toString('base64');
  config.ui = {title:'Fyso', backgroundImage:`data:image/webp;base64,${image}`, ...config.ui};
  return config;
}
module.exports = {withExtensionApps, withBranding};

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
    const config = withBranding(withExtensionApps(expand(yaml.parse(fs.readFileSync(path.join(env.FYSO_ROOT, 'project/auth/tinyauth.yaml'), 'utf8'))), env.FYSO_ROOT));
    const runtime = path.join(env.FYSO_DATA, 'web-auth/runtime');
    fs.mkdirSync(runtime, {recursive:true, mode:0o700});
    const web = require('./web-origin.cjs');
    config.appUrl = web.origin('auth', env);
    config.server = {address:'127.0.0.1', port:Number(env.FYSO_AUTH_PORT)};
    config.database = {driver:'sqlite', path:path.join(runtime,'sessions.db')};
    config.labelProvider = 'none'; config.analytics = {enabled:false}; config.resources = {enabled:false};
    config.auth = {...config.auth, users:env.FYSO_AUTH_USERS.split(/[\n,]+/).filter(Boolean), secureCookie:web.scheme(env) === 'https', subdomainsEnabled:true, trustedProxies:['127.0.0.1/32']};
    fs.writeFileSync(path.join(runtime,'config.yaml'), yaml.stringify(config), {mode:0o600});
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
