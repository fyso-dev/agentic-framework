// Read-only doctor checks. Authenticated browser E2E belongs to the delivery suite.
const env = process.env;
const base = `http://127.0.0.1:${env.FYSO_HTTP_PORT}`;
async function check(host, path, status, headers = {}) {
  // Node's fetch may discard a custom Host header; native http preserves it.
  const result = await new Promise((resolve, reject) => {
    const request = require('node:http').request(base + path, {headers:{Host:`${host}.${env.FYSO_WEB_DOMAIN}:${env.FYSO_HTTP_PORT}`, ...headers}}, response => {
      response.resume(); response.on('end', () => resolve({status:response.statusCode, challenge:response.headers['www-authenticate']}));
    });
    request.on('error', reject); request.setTimeout(5000, () => request.destroy(Error('Gateway request timed out'))); request.end();
  });
  if (result.status !== status || result.challenge) throw Error(`${host}${path}: unexpected authentication boundary (${result.status})`);
}

(async () => {
  for (const host of ['panel','dagu','omb']) {
    await check(host, '/', 302, {'User-Agent':'Mozilla/5.0 Chrome/130.0.0.0'});
    await check(host, '/api/denied-probe', 401, {'User-Agent':'Mozilla/5.0 Chrome/130.0.0.0'});
    // Technical Basic credentials cannot bypass the browser session requirement.
    await check(host, '/api/denied-probe', 401, {Authorization:`Basic ${Buffer.from(`${env.FYSO_ADMIN_USER}:${env.FYSO_ADMIN_PASSWORD}`).toString('base64')}`});
  }
  await check('auth', '/api/auth/caddy', 404);
  console.log('Unauthenticated pages redirect to login; APIs deny access without browser challenges.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
