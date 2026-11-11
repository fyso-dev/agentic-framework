// Encrypt native Tinyauth user entries. Never print credentials or decrypted YAML.
const fs = require('node:fs'), path = require('node:path');
const {createRequire} = require('node:module');
const {spawnSync, execFileSync} = require('node:child_process');
const yaml = createRequire(fs.realpathSync(execFileSync('which', ['yaml'], {encoding:'utf8'}).trim()))('yaml');
const [action, username] = process.argv.slice(2);
function run(args, input) {
  const result = spawnSync('sops', args, {input, encoding:'utf8', maxBuffer:4 * 1024 * 1024});
  if (result.status !== 0) throw Error('SOPS could not update the encrypted users; secrets were not changed');
  return result.stdout;
}
// sops reads a file, and on Linux /dev/stdin cannot be opened when stdin is the socket node provides.
function encrypt(args, text) {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fyso-sops-'));
  try {
    const file = path.join(dir, 'plain');
    fs.writeFileSync(file, text, {mode:0o600});
    return run([...args, file]);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
}
try {
  if (!['init','add','remove'].includes(action) || !/^[a-zA-Z][a-zA-Z0-9_.-]{1,63}$/.test(username || '')) throw Error('Invalid action or username');
  const original = fs.readFileSync('secrets.enc.yaml', 'utf8');
  const secrets = yaml.parse(run(['decrypt', '--output-type', 'yaml', 'secrets.enc.yaml']));
  const entries = String(secrets.FYSO_AUTH_USERS || '').split(/[\n,]+/).filter(Boolean);
  if (action === 'init' && entries.length) process.exit(0);
  const users = new Map(entries.map(entry => [entry.split(':')[0], entry]));
  if (action === 'remove') {
    if (!users.has(username)) throw Error('User does not exist');
    if (username === process.env.FYSO_ADMIN_USER || users.size === 1) throw Error('Cannot remove the bootstrap administrator or the last local user');
    users.delete(username);
  } else {
    const entry = fs.readFileSync(0, 'utf8');
    if (!entry.startsWith(`${username}:$2`) || entry.includes('\n') || entry.includes(',')) throw Error('Invalid native bcrypt user entry');
    users.set(username, entry);
  }
  secrets.FYSO_AUTH_USERS = [...users.values()].join(',');
  const encrypted = encrypt(['encrypt', '--filename-override', 'secrets.enc.yaml', '--input-type', 'yaml', '--output-type', 'yaml'], yaml.stringify(secrets));
  // A concurrent editor must never be overwritten.
  if (fs.readFileSync('secrets.enc.yaml', 'utf8') !== original) throw Error('Secrets changed concurrently; retry');
  const temporary = `secrets.enc.yaml.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, encrypted, {mode:0o600, flag:'wx'});
    fs.renameSync(temporary, 'secrets.enc.yaml');
  } finally { fs.rmSync(temporary, {force:true}); }
  // Runtime sessions are not configuration. Changing credentials logs out everyone.
  // The shell wrapper requires the stack to be stopped before this mutation.
  const runtime = path.join(process.env.FYSO_DATA, 'web-auth/runtime');
  for (const name of ['sessions.db', 'sessions.db-wal', 'sessions.db-shm']) fs.rmSync(path.join(runtime,name), {force:true});
  console.log('Encrypted local users updated; all web sessions invalidated. App permissions are in project/auth/tinyauth.yaml.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
