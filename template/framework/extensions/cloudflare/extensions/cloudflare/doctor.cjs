// Certificate metadata only. Never read or print the private key's contents.
const fs = require('node:fs'), path = require('node:path');
const {X509Certificate} = require('node:crypto');
function check(env = process.env) {
  const dir = path.join(env.FYSO_DATA, 'ext/cloudflare/lego/certificates');
  const name = env.FYSO_CLOUDFLARE_DOMAIN;
  const cert = new X509Certificate(fs.readFileSync(path.join(dir, `${name}.crt`)));
  const key = fs.statSync(path.join(dir, `${name}.key`));
  if (key.mode & 0o077) throw Error('Certificate private key permissions are too broad');
  const days = Math.floor((Date.parse(cert.validTo) - Date.now()) / 86400000);
  if (days < 14 || Date.parse(cert.validFrom) > Date.now()) throw Error('Certificate is expired, not yet valid or expires within 14 days');
  const names = fs.readFileSync(path.join(__dirname, 'names.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
  for (const host of names) {
    // A wildcard SAN must be present, not merely a matching single host.
    if (host.startsWith('*.')) {
      if (!cert.subjectAltName.split(/,\s*/).includes(`DNS:${host}`)) throw Error('Certificate is missing a requested wildcard');
    } else if (!cert.checkHost(host)) throw Error('Certificate is missing a requested name');
  }
  return {certificate: name, daysRemaining: days, names: names.length};
}
if (require.main === module) {
  try { console.log(JSON.stringify(check())); }
  catch { console.error('Cloudflare certificate check failed (missing/invalid certificate, names, expiry or key permissions)'); process.exitCode = 1; }
}
module.exports = {check};
