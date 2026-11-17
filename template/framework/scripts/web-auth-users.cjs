// Encrypt native Tinyauth user entries (FYSO_AUTH_USERS: bcrypt hashes, what the login
// service reads) and, next to them, each user's password (FYSO_AUTH_PASSWORDS: a JSON
// map) so it can be read again (D64). Only `show` prints a credential, to its caller's
// terminal; nothing else prints credentials or decrypted YAML.
// stdin for init/add: the native entry, then optionally a line with the password.
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
  if (!['init','add','remove','show'].includes(action) || !/^[a-zA-Z][a-zA-Z0-9_.-]{1,63}$/.test(username || '')) throw Error('Invalid action or username');
  const original = fs.readFileSync('secrets.enc.yaml', 'utf8');
  const secrets = yaml.parse(run(['decrypt', '--output-type', 'yaml', 'secrets.enc.yaml']));
  const entries = String(secrets.FYSO_AUTH_USERS || '').split(/[\n,]+/).filter(Boolean);
  let passwords = {};
  try { passwords = JSON.parse(secrets.FYSO_AUTH_PASSWORDS || '{}') || {}; } catch { passwords = {}; }
  if (action === 'show') {
    if (!entries.some(entry => entry.split(':')[0] === username)) throw Error(`User ${username} does not exist`);
    if (typeof passwords[username] !== 'string' || !passwords[username]) {
      throw Error(`The password of ${username} is not stored: it was set before passwords were kept. Set a new one with: mise run web-auth:password -- --new${username === process.env.FYSO_ADMIN_USER ? '' : ` ${username}`}`);
    }
    console.log(passwords[username]);
    process.exit(0);
  }
  if (action === 'init' && entries.length) process.exit(0);
  const users = new Map(entries.map(entry => [entry.split(':')[0], entry]));
  if (action === 'remove') {
    if (!users.has(username)) throw Error('User does not exist');
    if (username === process.env.FYSO_ADMIN_USER || users.size === 1) throw Error('Cannot remove the bootstrap administrator or the last local user');
    users.delete(username);
    delete passwords[username];
  } else {
    const input = fs.readFileSync(0, 'utf8');
    const at = input.indexOf('\n');
    const entry = at < 0 ? input : input.slice(0, at), password = at < 0 ? '' : input.slice(at + 1);
    if (!entry.startsWith(`${username}:$2`) || entry.includes(',') || password.includes('\n')) throw Error('Invalid native bcrypt user entry');
    users.set(username, entry);
    // A hash without its password (an installer that sends only the entry) leaves no stale one behind.
    if (password) passwords[username] = password; else delete passwords[username];
  }
  secrets.FYSO_AUTH_USERS = [...users.values()].join(',');
  if (Object.keys(passwords).length) secrets.FYSO_AUTH_PASSWORDS = JSON.stringify(passwords); else delete secrets.FYSO_AUTH_PASSWORDS;
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
