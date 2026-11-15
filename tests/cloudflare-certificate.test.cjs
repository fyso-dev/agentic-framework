const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawnSync} = require('node:child_process');
const source = path.resolve(__dirname, '../template/framework/extensions/cloudflare/extensions/cloudflare');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fyso-cloudflare-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  fs.cpSync(source, path.join(root, 'extensions/cloudflare'), {recursive:true});
  fs.writeFileSync(path.join(root, 'extensions/cloudflare/names.txt'), 'jc.example.com\n*.jc.example.com\n');
  const env = {PATH:process.env.PATH, HOME:process.env.HOME, FYSO_DATA:path.join(root,'.data'),
    FYSO_CLOUDFLARE_DOMAIN:'jc.example.com', FYSO_CLOUDFLARE_EMAIL:'ops@example.com', CF_DNS_API_TOKEN:'fixture-private-token'};
  const bin = path.join(root,'bin'); fs.mkdirSync(bin); env.PATH = `${bin}:${env.PATH}`;
  const run = () => spawnSync('bash',['extensions/cloudflare/certificate.sh'],{cwd:root, env, encoding:'utf8'});
  return {root, env, bin, run};
}
test('provider failures never expose credentials to Dagu output',t=>{
  const f = fixture(t);
  fs.writeFileSync(path.join(f.bin,'lego'),'#!/bin/sh\nprintf "%s" "$CF_DNS_API_TOKEN" >&2\nexit 1\n',{mode:0o755});
  const r = f.run(); assert.notEqual(r.status,0);
  assert.ok(!(r.stdout+r.stderr).includes(f.env.CF_DNS_API_TOKEN));
  const log = path.join(f.env.FYSO_DATA,'ext/cloudflare/acme.log');
  assert.equal(fs.existsSync(log),false);
});
test('invalid names cannot reach the provider',t=>{
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root,'extensions/cloudflare/names.txt'),'https://example.com\n');
  fs.writeFileSync(path.join(f.bin,'lego'),'#!/bin/sh\necho SHOULD_NOT_RUN\n',{mode:0o755});
  const r=f.run(); assert.notEqual(r.status,0); assert.match(r.stderr,/Invalid certificate/);
  assert.equal(fs.existsSync(path.join(f.env.FYSO_DATA,'ext/cloudflare/acme.log')),false);
});
test('a missing certificate is an explicit doctor failure',t=>{
  const f=fixture(t);
  const r=spawnSync(process.execPath,['extensions/cloudflare/doctor.cjs'],{cwd:f.root,env:f.env,encoding:'utf8'});
  assert.notEqual(r.status,0); assert.match(r.stderr,/certificate check failed/);
  assert.ok(!r.stderr.includes(f.env.CF_DNS_API_TOKEN));
});
test('native certificate metadata gates repeated issuance/renewal commands',t=>{
  const f=fixture(t);
  fs.writeFileSync(path.join(f.bin,'lego'),`#!/bin/sh
printf '%s\\n' "$*" >> "$FYSO_DATA/arguments"
dir="$FYSO_DATA/ext/cloudflare/lego/certificates"
mkdir -p "$dir"
if [ ! -f "$dir/jc.example.com.crt" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=jc.example.com -addext 'subjectAltName=DNS:jc.example.com,DNS:*.jc.example.com' -keyout "$dir/jc.example.com.key" -out "$dir/jc.example.com.crt"
fi
`,{mode:0o755});
  for(let i=0;i<2;i++) {
    const r=f.run();assert.equal(r.status,0,r.stderr);
    assert.equal(JSON.parse(r.stdout).names,2);
    assert.ok(!r.stdout.includes(f.env.CF_DNS_API_TOKEN));
  }
  const calls=fs.readFileSync(path.join(f.env.FYSO_DATA,'arguments'),'utf8').trim().split('\n');
  assert.ok(calls[0].startsWith('run '));assert.equal(calls[0],calls[1]);
  assert.ok(!calls.join('\n').includes(f.env.CF_DNS_API_TOKEN));
  const key=path.join(f.env.FYSO_DATA,'ext/cloudflare/lego/certificates/jc.example.com.key');
  fs.chmodSync(key,0o644);
  const r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,/certificate check failed/);
});
