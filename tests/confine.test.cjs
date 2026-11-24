const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { policy, parseArgs, macosSocketRules, sandboxConfig, gitIdentity, scratchDir } = require('../template/framework/scripts/confine.cjs');

function fixture(fn) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'confine-')));
  try { return fn(home); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

test('a project reads and writes its folder; home, siblings and shared keys are denied', () => fixture(home => {
  const root = path.join(home, 'projects/demo');
  fs.mkdirSync(root, { recursive: true });
  const shared = path.join(home, '.config/mise/age.txt');
  const p = policy({ root, project: 'demo', port: '8400', sharedKeys: [shared], allowRead: [], allowWrite: [] }, { PATH: '/usr/bin' }, home);
  assert.deepEqual(p.denyRead, [home, path.join(home, 'projects'), shared]);
  assert.ok(p.allowRead.includes(root));
  assert.deepEqual(p.allowWrite, [root, p.scratch]);
  assert.equal(p.vars.HOME, path.join(root, '.data/confine/home'));
  assert.equal(p.vars.SOPS_AGE_KEY_FILE, path.join(root, '.data/confine/age.txt'));
  assert.equal(p.vars.FYSO_COMPOSIO_AGE_KEY_FILE, p.vars.SOPS_AGE_KEY_FILE);
}));

test('temporary files go to a private folder outside the project, one per project', () => fixture(home => {
  // sandbox-runtime denies `.git/hooks` and `.git/config` beneath the project: a temporary
  // git repository (Copier update, catalog clone) must be created outside it.
  const root = path.join(home, 'demo'), other = path.join(home, 'other');
  const p = policy({ root, sharedKeys: [], allowRead: [], allowWrite: [] }, { PATH: '' }, home);
  const q = policy({ root: other, sharedKeys: [], allowRead: [], allowWrite: [] }, { PATH: '' }, home);
  assert.equal(p.vars.TMPDIR, p.scratch);
  // Claude Code ignores TMPDIR; without this its Bash tool fails with EPERM on /tmp/claude-<uid>.
  assert.equal(p.vars.CLAUDE_CODE_TMPDIR, p.scratch);
  assert.ok(!p.scratch.startsWith(root + path.sep));
  assert.equal(path.dirname(p.scratch), fs.realpathSync('/tmp'));
  assert.match(path.basename(p.scratch), /^fyso-confine-[0-9a-f]{12}$/);
  assert.notEqual(p.scratch, q.scratch);
  assert.ok(p.allowRead.includes(p.scratch) && p.allowWrite.includes(p.scratch));
}));

test('the temporary folder is created private and a planted link is refused', () => fixture(home => {
  const dir = path.join(home, 'scratch');
  scratchDir(dir);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  scratchDir(dir); // an existing folder of ours is fine
  const link = path.join(home, 'planted');
  fs.symlinkSync(home, link);
  const { spawnSync } = require('node:child_process');
  const code = `require(${JSON.stringify(path.resolve(__dirname, '../template/framework/scripts/confine.cjs'))}).scratchDir(${JSON.stringify(link)})`;
  const result = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not a private folder/);
}));

test('only engine credential files are shared, not their folders', () => fixture(home => {
  const root = path.join(home, 'demo');
  fs.mkdirSync(path.join(home, '.claude/projects'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/.credentials.json'), '{}');
  fs.writeFileSync(path.join(home, '.claude/history.jsonl'), '');
  const p = policy({ root, sharedKeys: [], allowRead: [], allowWrite: [] }, { PATH: '' }, home);
  const credential = path.join(home, '.claude/.credentials.json');
  assert.ok(p.allowRead.includes(credential) && p.allowWrite.includes(credential));
  assert.ok(!p.allowRead.some(entry => entry === path.join(home, '.claude')));
  assert.equal(p.vars.CLAUDE_CONFIG_DIR, path.join(root, '.data/confine/home/.claude'));
  assert.equal(p.credentials.length, 1);
}));

test('the toolchain in the home folder is readable, unless it lies in a denied folder', () => fixture(home => {
  const root = path.join(home, 'work/demo');
  const tools = path.join(home, '.local/bin');
  const sibling = path.join(home, 'work/other/bin');
  for (const dir of [root, tools, sibling, path.join(home, '.local/share/claude/versions')]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(home, '.local/share/claude/versions/1.0'), '');
  fs.symlinkSync(path.join(home, '.local/share/claude/versions/1.0'), path.join(tools, 'claude'));
  const p = policy({ root, sharedKeys: [], allowRead: [], allowWrite: [] }, { PATH: [tools, sibling, '/usr/bin'].join(':') }, home);
  assert.ok(p.allowRead.includes(tools));
  assert.ok(p.allowRead.includes(path.join(home, '.local/share/claude/versions')));
  assert.ok(!p.allowRead.includes(sibling));
}));

test('options: repeatable keys, colon-separated extra paths, and the command after --', () => {
  const { options, command } = parseArgs(['--root', '/p', '--shared-key', '/k1', '--shared-key', '/k2', '--allow-read', '/a:/b', '--allow-write', '', '--', 'node', 'x']);
  assert.deepEqual(options.sharedKeys, ['/k1', '/k2']);
  assert.deepEqual(options.allowRead, ['/a', '/b']);
  assert.deepEqual(options.allowWrite, []);
  assert.deepEqual(command, ['node', 'x']);
});

test('macOS: Unix sockets are denied except DNS and the project\'s own', () => {
  const rules = macosSocketRules({ sockets: ['/tmp/fyso-demo-8400.sock', { prefix: '/tmp/fyso-ext-', suffix: '-8400.sock' }, { prefix: '/tmp/@dagu_', suffix: '.sock', create: true }] });
  assert.match(rules, /^\(deny network-outbound \(remote unix-socket\)\)/);
  assert.match(rules, /mDNSResponder/);
  // Seatbelt matches resolved paths: /tmp is a link on macOS, so rules name where it leads.
  const tmp = fs.realpathSync('/tmp');
  const re = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\/g, '\\\\');
  assert.ok(rules.includes(`(path-literal "${tmp}/fyso-demo-8400.sock")`));
  // Seatbelt regex has no `+`: one path component is [^/]*, as sandbox-runtime writes it.
  assert.ok(rules.includes(`(regex "^${re(tmp)}/fyso-ext-[^/]*-8400\\\\.sock$")`));
  assert.ok(rules.includes(`(allow file-write* (regex "^${re(tmp)}/@dagu_[^/]*\\\\.sock$"))`));
  assert.ok(!rules.includes("'"));
});

test('lib.sh confined_exec routes through confine.cjs unless FYSO_CONFINE=off, with a cleared environment', () => fixture(home => {
  const { spawnSync } = require('node:child_process');
  const lib = path.resolve(__dirname, '../template/framework/scripts/lib.sh');
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\necho "NODE $*"\necho "CANARY=${FYSO_CANARY-unset} MODE=${FYSO_CONFINE-unset}"\n', { mode: 0o755 });
  const run = mode => spawnSync('/bin/bash', ['-c', `source ${JSON.stringify(lib)}; confined_exec A=1 /bin/sh -c 'echo PLAIN A=$A CANARY=\${FYSO_CANARY-unset}'`], {
    encoding: 'utf8', env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, FYSO_ROOT: '/r', FYSO_DATA: '/r/.data', FYSO_PROJECT: 'demo', FYSO_HTTP_PORT: '8400', FYSO_CONFINE: mode, FYSO_CANARY: 'leak' },
  }).stdout;
  const strict = run('strict');
  assert.match(strict, /^NODE \/r\/framework\/scripts\/confine\.cjs run --root \/r --data \/r\/\.data --project demo --port 8400 --shared-key .* -- \/bin\/sh -c /m);
  assert.match(strict, /CANARY=unset MODE=strict/);
  assert.equal(run('off').trim(), 'PLAIN A=1 CANARY=unset');
}));

test('the Unix-socket switch goes where sandbox-runtime reads it: network.allowAllUnixSockets', () => fixture(home => {
  const p = policy({ root: path.join(home, 'demo'), sharedKeys: [], allowRead: [], allowWrite: [] }, { PATH: '' }, home);
  const config = sandboxConfig(p);
  assert.equal(config.network.allowAllUnixSockets, process.platform === 'linux');
  assert.equal('allowAllUnixSockets' in config, false);
  assert.equal(config.network.allowedDomains, undefined); // the network stays unrestricted
}));

test('only the git author identity is carried into the private home', () => fixture(home => {
  const file = path.join(home, 'gitconfig');
  fs.writeFileSync(file, '[user]\n\tname = Ada Lovelace\n\temail = ada@example.invalid\n[credential]\n\thelper = store\n');
  const saved = process.env.GIT_CONFIG_GLOBAL;
  process.env.GIT_CONFIG_GLOBAL = file;
  try {
    assert.equal(gitIdentity(), '\tname = "Ada Lovelace"\n\temail = "ada@example.invalid"\n');
    fs.writeFileSync(file, '[credential]\n\thelper = store\n');
    assert.equal(gitIdentity(), '');
  } finally {
    if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = saved;
  }
}));

// A confined process may write only inside the project. macOS mktemp without a template
// ignores TMPDIR and uses the user's temporary folder, which the sandbox denies: every
// framework script names its template under TMPDIR, and Dagu hands TMPDIR to its steps.
test('framework scripts create temporary files under TMPDIR, which Dagu passes to steps',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const dir=path.resolve(__dirname,'../template/framework/scripts');
  const bare=[];
  for (const name of fs.readdirSync(dir).filter(f=>f.endsWith('.sh'))) {
    fs.readFileSync(path.join(dir,name),'utf8').split('\n').forEach((line,i)=>{
      if (/mktemp( -[dtuq]+)*\s*(\)|;|$|\|)/.test(line.replace(/#.*$/,''))) bare.push(`${name}:${i+1}`);
    });
  }
  assert.deepEqual(bare,[],'mktemp needs an explicit "${TMPDIR:-/tmp}/…XXXXXXXX" template');
  const dagu=fs.readFileSync(path.join(dir,'run-dagu.sh'),'utf8').match(/DAGU_ENV_PASSTHROUGH_PREFIXES=(\S+)/)[1].split(',');
  assert.ok(dagu.includes('TMPDIR'),'Dagu steps must receive the confined TMPDIR');
  assert.ok(dagu.includes('CLAUDE_CODE_TMPDIR'),'Dagu steps that run Claude Code must receive its temporary folder');
});

// Confined Dagu steps cannot see the uv-managed Pythons of the user's home; without a
// pinned Python uvx falls back to the system one (3.9 on macOS) and Copier refuses it.
test('every framework Copier call runs on a pinned Python',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const dir=path.resolve(__dirname,'../template/framework/scripts');
  const calls=fs.readdirSync(dir).filter(f=>f.endsWith('.sh')).flatMap(name=>
    fs.readFileSync(path.join(dir,name),'utf8').split('\n').filter(line=>/uvx\b.*copier==/.test(line)).map(line=>({name,line})));
  assert.ok(calls.length>=3);
  for (const {name,line} of calls) assert.match(line,/uvx --python \d+\.\d+\.\d+ --from copier==/,name);
});

// fyso-update clones this repository inside the sandbox (Copier, confined Dagu step).
// sandbox-runtime never lets a confined process create these paths, so a tracked one
// makes every update from the panel fail.
test('the repository tracks no path the sandbox forbids creating',()=>{
  const {execFileSync}=require('node:child_process'),path=require('node:path');
  const files=execFileSync('git',['ls-files'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'}).split('\n').filter(Boolean);
  const forbidden=/(^|\/)(\.mcp\.json|\.gitconfig|\.gitmodules|\.bashrc|\.bash_profile|\.zshrc|\.zprofile|\.profile|\.ripgreprc)$|(^|\/)\.(vscode|idea)\/|(^|\/)\.claude\/(commands|agents)\//;
  assert.deepEqual(files.filter(f=>forbidden.test(f)),[]);
});
