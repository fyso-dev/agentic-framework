// Public web addresses (D62). The gateway always listens on loopback HTTP at
// FYSO_HTTP_PORT. FYSO_WEB_SCHEME=https, set by an HTTPS provider extension, means
// people reach it through that extension's TLS terminator on the default port.
function scheme(env = process.env) {
  const value = env.FYSO_WEB_SCHEME || 'http';
  if (value !== 'http' && value !== 'https') throw Error(`FYSO_WEB_SCHEME must be http or https, not "${value}"`);
  return value;
}
const portSuffix = (env = process.env) => scheme(env) === 'https' ? '' : `:${env.FYSO_HTTP_PORT}`;
function origin(app, env = process.env, domain = env.FYSO_WEB_DOMAIN) {
  return `${scheme(env)}://${app}.${domain}${portSuffix(env)}`;
}
// App links are declared on the listening address (http://<app>.<domain>:<port>).
function publicUrl(url, env = process.env, domain = env.FYSO_WEB_DOMAIN) {
  if (typeof url !== 'string' || scheme(env) === 'http') return url;
  const listening = `.${domain}:${env.FYSO_HTTP_PORT}`;
  const match = /^http:\/\/([a-z][a-z0-9-]*)(\.[^/]+)(\/.*)?$/.exec(url);
  return match && match[2] === listening ? `${origin(match[1], env, domain)}${match[3] || ''}` : url;
}
module.exports = {scheme, portSuffix, origin, publicUrl};
