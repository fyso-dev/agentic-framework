// The project's own age key (D83). Confined processes cannot read the developer's or
// server's key, which may open other projects too, so each project gets a key of its own in
// .data/confine/age.txt and becomes one more recipient of its secrets.enc.yaml. Runs
// outside the sandbox (from `mise run up`), with the admin key, and is idempotent:
//   project-key.cjs ensure   create the key if missing and make it a recipient
//   project-key.cjs check    exit 1 unless the project key opens secrets.enc.yaml
// A lost key (.data wiped) is replaced by a new one; the old recipient stays listed but
// harmless, since nobody holds its private part.
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {execFileSync, spawnSync} = require('node:child_process');
const {createRequire} = require('node:module');

const root = process.env.FYSO_ROOT || process.cwd();
const data = process.env.FYSO_DATA || path.join(root, '.data');
const keyFile = path.join(data, 'confine/age.txt');
const secrets = path.join(root, 'secrets.enc.yaml');
const sopsConfig = path.join(root, '.sops.yaml');
const adminKey = process.env.MISE_SOPS_AGE_KEY_FILE || process.env.SOPS_AGE_KEY_FILE || path.join(os.homedir(), '.config/mise/age.txt');
const fail = message => { console.error(`project-key: ${message}`); process.exit(1); };

const publicKey = () => execFileSync('age-keygen', ['-y', keyFile], {encoding:'utf8'}).trim();
const opens = key => spawnSync('sops', ['decrypt', secrets], {env:{...process.env, SOPS_AGE_KEY_FILE:key}, stdio:'ignore'}).status === 0;

// The recipient also goes into .sops.yaml, so files sops creates later include it.
function addToSopsConfig(recipient) {
  if (!fs.existsSync(sopsConfig)) fail('.sops.yaml is missing; run mise run setup');
  const yaml = createRequire(fs.realpathSync(execFileSync('which', ['yaml'], {encoding:'utf8'}).trim()))('yaml');
  const doc = yaml.parseDocument(fs.readFileSync(sopsConfig, 'utf8'));
  const rules = doc.get('creation_rules');
  const rule = rules && rules.items.find(item => new RegExp(String(item.get('path_regex') || '.*')).test('secrets.enc.yaml'));
  if (!rule) fail('.sops.yaml has no creation rule for secrets.enc.yaml');
  const current = String(rule.get('age') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (current.includes(recipient)) return false;
  const node = doc.createNode([...current, recipient].join(',\n'));
  node.type = 'BLOCK_FOLDED';
  rule.set('age', node);
  fs.writeFileSync(sopsConfig, doc.toString());
  return true;
}

function ensure() {
  if (!fs.existsSync(keyFile)) {
    fs.mkdirSync(path.dirname(keyFile), {recursive:true, mode:0o700});
    execFileSync('age-keygen', ['-o', keyFile], {stdio:'ignore'});
    fs.chmodSync(keyFile, 0o600);
    console.log(`✓ Created the project age key (${path.relative(root, keyFile)})`);
  }
  const recipient = publicKey();
  const added = addToSopsConfig(recipient);
  if (fs.existsSync(secrets) && !opens(keyFile)) {
    if (!opens(adminKey)) fail(`cannot add the project key: your age key (${adminKey}) does not open secrets.enc.yaml`);
    // updatekeys re-encrypts the data key for the recipients .sops.yaml now lists.
    const result = spawnSync('sops', ['updatekeys', '--yes', secrets], {env:{...process.env, SOPS_AGE_KEY_FILE:adminKey}, encoding:'utf8'});
    if (result.status !== 0) fail(`sops updatekeys failed: ${(result.stderr || '').trim()}`);
    if (!opens(keyFile)) fail('the project key still does not open secrets.enc.yaml');
    console.log('✓ secrets.enc.yaml can be opened with the project key (commit .sops.yaml and secrets.enc.yaml)');
  } else if (added) console.log('✓ Added the project key to .sops.yaml');
}

const mode = process.argv[2];
if (mode === 'ensure') ensure();
else if (mode === 'check') {
  if (!fs.existsSync(keyFile)) fail('no project age key; run mise run up');
  if (fs.existsSync(secrets) && !opens(keyFile)) fail('the project age key does not open secrets.enc.yaml; run mise run up');
} else fail('usage: project-key.cjs ensure|check');
