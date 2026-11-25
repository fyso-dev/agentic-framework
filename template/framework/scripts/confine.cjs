// Confine a process to this project's folder (D93, docs/confinement.md). The processes
// that run agent code (OpenMausBot with the bots' shells, Dagu with workflow steps and
// harness.run) start through here. The OS sandbox is Anthropic's sandbox-runtime used as
// a library (Seatbelt on macOS, bubblewrap on Linux), pinned in mise.toml. Only the
// file system and local IPC are confined: the network stays open, servers keep their ports.
//   confine.cjs run [options] -- <command> [args…]   run confined (plainly when FYSO_CONFINE=off)
//   confine.cjs check                                sandbox prerequisites of this host
//   confine.cjs selftest [options]                   prove the confinement holds here
// Options: --root <project> --data <.data> --project <slug> --port <http port>
//          --shared-key <age key file> (repeatable) --allow-read <path> --allow-write <path>
// Without the sandbox a confined process does not start: only FYSO_CONFINE=off runs it plainly.
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const {execFileSync, spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');

const fail = message => { console.error(`confine: ${message}`); process.exit(1); };
const inside = (child, parent) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
const real = p => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const quote = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

// Engine logins shared on purpose (PLAN §3.1): only the credential file of each engine,
// linked into the private home. Their history, sessions and settings stay out of reach.
const ENGINES = [
  {name:'claude', env:'CLAUDE_CONFIG_DIR', dir:'.claude', files:['.credentials.json']},
  {name:'codex', env:'CODEX_HOME', dir:'.codex', files:['auth.json']},
  {name:'pi', env:'PI_CODING_AGENT_DIR', dir:'.pi/agent', files:['auth.json']},
];

function parseArgs(argv) {
  const options = {sharedKeys:[], allowRead:[], allowWrite:[]};
  const multi = {'--shared-key':'sharedKeys', '--allow-read':'allowRead', '--allow-write':'allowWrite'};
  const single = {'--root':'root', '--data':'data', '--project':'project', '--port':'port'};
  let i = 0;
  for (; i < argv.length && argv[i] !== '--'; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (value === undefined) fail(`${flag} needs a value`);
    if (multi[flag]) { if (value) options[multi[flag]].push(...value.split(path.delimiter).filter(Boolean)); }
    else if (single[flag]) options[single[flag]] = value;
    else fail(`unknown option ${flag}`);
  }
  return {options, command: argv.slice(i + 1)};
}

// The whole policy as data: what may be read and written, and the environment the
// confined process gets. Pure, so it can be tested without a sandbox.
function policy(options, env = process.env, home = os.homedir()) {
  if (!options.root || !path.isAbsolute(options.root)) fail('--root must be the absolute project folder');
  const root = path.resolve(options.root);
  const data = path.resolve(options.data || path.join(root, '.data'));
  const privateHome = path.join(data, 'confine/home');
  const projectKey = path.join(data, 'confine/age.txt');
  const parent = path.dirname(root);
  // Siblings of the project (other projects) and the shared age keys are never readable.
  // Folders above the project are denied around it: its own allowRead is more specific.
  const denyRead = [...new Set([home, parent, ...options.sharedKeys].filter(Boolean).map(p => path.resolve(p)))]
    .filter(p => p !== path.parse(p).root && p !== root && !inside(p, root));
  const credentials = [];
  for (const engine of ENGINES) {
    const realDir = path.resolve(env[engine.env] || path.join(home, engine.dir));
    for (const file of engine.files) {
      const target = path.join(realDir, file);
      if (fs.existsSync(target)) credentials.push({engine, file, target: real(target)});
    }
  }
  const sockets = projectSockets(options);
  // Temporary files live outside the project: sandbox-runtime always denies writes to
  // `.git/hooks` and `.git/config` beneath the project, so no temporary git repository
  // (Copier's update, a catalog or skill clone) could be created inside it, and git would
  // climb to the project's own repository instead. One folder per project, owned by us.
  const scratch = path.join(real('/tmp'), `fyso-confine-${crypto.createHash('sha256').update(root).digest('hex').slice(0, 12)}`);
  const vars = {
    // Claude Code ignores TMPDIR: its Bash tool writes /tmp/claude-<uid>/ and
    // /tmp/claude-<id>-cwd unless CLAUDE_CODE_TMPDIR points elsewhere.
    HOME: privateHome, TMPDIR: scratch, CLAUDE_CODE_TMPDIR: scratch,
    XDG_CONFIG_HOME: path.join(privateHome, '.config'), XDG_CACHE_HOME: path.join(privateHome, '.cache'),
    XDG_DATA_HOME: path.join(privateHome, '.local/share'), XDG_STATE_HOME: path.join(privateHome, '.local/state'),
    MISE_DATA_DIR: env.MISE_DATA_DIR || path.join(home, '.local/share/mise'),
    MISE_CACHE_DIR: path.join(privateHome, '.cache/mise'), MISE_STATE_DIR: path.join(privateHome, '.local/state/mise'),
    MISE_TRUSTED_CONFIG_PATHS: root,
    // Inside, the only age key is the project's own (D93): it opens this project's secrets only.
    MISE_SOPS_AGE_KEY_FILE: projectKey, SOPS_AGE_KEY_FILE: projectKey, FYSO_COMPOSIO_AGE_KEY_FILE: projectKey,
    FYSO_CONFINED: options.project || '1',
  };
  for (const engine of ENGINES) vars[engine.env] = path.join(privateHome, engine.dir);
  return {
    root, data, privateHome, scratch, projectKey, credentials, sockets, vars,
    denyRead,
    allowRead: [...new Set([root, scratch, ...toolchain(env, home, denyRead), ...credentials.map(c => c.target), ...options.allowRead.map(p => path.resolve(p))])],
    allowWrite: [...new Set([root, scratch, ...credentials.map(c => c.target), ...options.allowWrite.map(p => path.resolve(p))])],
  };
}

// Unix sockets of this project's own services (lib.sh): process-compose, the remote MCP,
// connector setup and extension APIs, plus the socket Dagu opens for each run, which it
// always puts in /tmp (an abstract socket on Linux). Every other socket stays unreachable.
const DAGU_RUN_SOCKETS = {prefix:'/tmp/@dagu_', suffix:'.sock', create:true};
function projectSockets({project, port}) {
  if (!port) return [DAGU_RUN_SOCKETS];
  return [`/tmp/fyso-${project || 'unknown'}-${port}.sock`, `/tmp/fyso-mcp-${port}.sock`,
    `/tmp/fyso-connectors-${port}.sock`, {prefix:'/tmp/fyso-ext-', suffix:`-${port}.sock`}, DAGU_RUN_SOCKETS];
}

// Folders the toolchain is read from: mise's data, every PATH entry in the home folder
// and where its links lead (the claude CLI links into ~/.local/share/claude), unless it
// lies in a denied folder other than the home folder itself.
function toolchain(env, home, denyRead) {
  const denied = denyRead.filter(p => p !== home);
  const dirs = new Set([env.MISE_DATA_DIR || path.join(home, '.local/share/mise')]);
  for (const dir of String(env.PATH || '').split(path.delimiter).filter(Boolean)) {
    if (!inside(real(dir), home)) continue;
    dirs.add(real(dir));
    let entries = [];
    try { entries = fs.readdirSync(dir, {withFileTypes:true}); } catch {}
    for (const entry of entries) if (entry.isSymbolicLink()) dirs.add(path.dirname(real(path.join(dir, entry.name))));
  }
  return [...dirs].filter(dir => inside(dir, home) && !denied.some(d => inside(dir, d) || inside(d, dir)));
}

async function runtime() {
  let cli;
  try { cli = fs.realpathSync(execFileSync('which', ['srt'], {encoding:'utf8'}).trim()); }
  catch { fail("sandbox-runtime is missing; run 'mise install'"); }
  const {SandboxManager} = await import(pathToFileURL(path.join(path.dirname(cli), 'index.js')).href);
  if (!SandboxManager.isSupportedPlatform()) fail(`no OS sandbox for ${process.platform}; set FYSO_CONFINE=off to run unconfined`);
  const deps = SandboxManager.checkDependencies();
  for (const warning of deps.warnings) console.error(`confine: warning: ${warning}`);
  if (deps.errors.length) {
    const hint = process.platform === 'linux' ? ' (apt install bubblewrap socat; dnf install bubblewrap socat)' : '';
    fail(`sandbox prerequisites missing: ${deps.errors.join('; ')}${hint}`);
  }
  return SandboxManager;
}

// The private home: state, caches and logins of confined processes stay in the project.
function prepareHome(p) {
  for (const dir of ['', '.cache', '.config/mise', '.local/share', '.local/state'])
    fs.mkdirSync(path.join(p.privateHome, dir), {recursive:true, mode:0o700});
  scratchDir(p.scratch);
  if (!fs.existsSync(p.projectKey)) fail(`no project age key at ${p.projectKey}; run 'mise run up' (it creates it)`);
  link(p.projectKey, path.join(p.privateHome, '.config/mise/age.txt'));
  for (const c of p.credentials) {
    fs.mkdirSync(path.join(p.privateHome, c.engine.dir), {recursive:true, mode:0o700});
    link(c.target, path.join(p.privateHome, c.engine.dir, c.file));
  }
  // Git reads the author from ~/.gitconfig; carry only that identity, not the whole file
  // (credential helpers, aliases and includes stay out). Written from outside the sandbox.
  const identity = gitIdentity();
  const gitconfig = path.join(p.privateHome, '.gitconfig');
  if (identity) fs.writeFileSync(gitconfig, `# Written by confine.cjs from the user's git identity.\n[user]\n${identity}`, {mode:0o600});
  else fs.rmSync(gitconfig, {force:true});
}
// /tmp is shared: the folder must be a real directory of ours, private, never a link
// someone else planted.
function scratchDir(dir) {
  try { fs.mkdirSync(dir, {mode:0o700}); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || (process.getuid && st.uid !== process.getuid()))
    fail(`${dir} is not a private folder of this user; remove it and try again`);
  if ((st.mode & 0o077) !== 0) fs.chmodSync(dir, 0o700);
}
function gitIdentity() {
  const lines = [];
  for (const key of ['name', 'email']) {
    let value = '';
    try { value = execFileSync('git', ['config', '--global', '--get', `user.${key}`], {encoding:'utf8', stdio:['ignore', 'pipe', 'ignore']}).trim(); } catch {}
    if (value) lines.push(`\t${key} = ${JSON.stringify(value)}\n`);
  }
  return lines.join('');
}
function link(target, at) {
  try { if (fs.readlinkSync(at) === target) return; } catch {}
  fs.rmSync(at, {force:true});
  fs.symlinkSync(target, at);
}

// sandbox-runtime leaves every network operation open when the network is not
// restricted, Unix sockets included; through them a confined process could drive
// programs outside (another project's process-compose, tmux, ssh-agent). macOS: deny
// connecting to Unix sockets except the system resolver and this project's own.
// Linux: the seccomp filter that blocks them all is replaced by hiding /tmp and the
// user's runtime folder, then binding this project's own sockets back.
const OPEN_NETWORK = '(allow network*)';
const sbpl = s => `"${s.replace(/[\\"]/g, '\\$&')}"`;
const regex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Seatbelt matches resolved paths: /tmp is a link on macOS, so use where it leads.
const resolvedTmp = s => s.replace(/^\/tmp(?=\/)/, real('/tmp'));
function macosSocketRules(p) {
  const rules = ['(deny network-outbound (remote unix-socket))',
    '(allow network-outbound (remote unix-socket (path-literal "/private/var/run/mDNSResponder")))'];
  // Sockets inside the project are its own (OMB's permission broker in .data/omb).
  if (p.root) rules.push(`(allow network-outbound (remote unix-socket (subpath ${sbpl(real(p.root))})))`);
  for (const s of p.sockets) {
    const at = typeof s === 'string'
      ? `(path-literal ${sbpl(resolvedTmp(s))})`
      : `(regex ${sbpl(`^${regex(resolvedTmp(s.prefix))}[^/]*${regex(s.suffix)}$`)})`;
    rules.push(`(allow network-outbound (remote unix-socket ${at}))`);
    // Dagu creates its run sockets itself: the file and its bind.
    if (s.create) rules.push(`(allow file-write* ${at})`, `(allow network-bind (local unix-socket ${at}))`);
  }
  // Not IPC, but needed: Node's os.uptime() (OpenMausBot) reads the boot time.
  rules.push('(allow sysctl-read (sysctl-name "kern.boottime"))');
  return rules.join('\n');
}
function blockUnixSockets(wrapped, p) {
  if (process.platform !== 'darwin') return wrapped;
  if (wrapped.split(OPEN_NETWORK).length !== 2) fail('unexpected macOS sandbox profile; cannot confine Unix sockets (sandbox-runtime version changed?)');
  // The profile travels inside single quotes: it must not contain one.
  const rules = macosSocketRules(p);
  if (rules.includes("'")) fail('a socket path contains a quote');
  return wrapped.replace(OPEN_NETWORK, `${OPEN_NETWORK}\n${rules}`);
}
function linuxSockets(p) {
  const runtimeDir = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`;
  const own = [];
  for (const s of p.sockets) {
    if (typeof s === 'string') { if (fs.existsSync(s)) own.push(s); continue; }
    for (const name of fs.readdirSync('/tmp')) {
      const full = `/tmp/${name}`;
      if (full.startsWith(s.prefix) && full.endsWith(s.suffix)) own.push(full);
    }
  }
  return {denyRead: ['/tmp', runtimeDir].filter(d => fs.existsSync(d)), allowRead: own};
}

function sandboxConfig(p) {
  const linux = process.platform === 'linux' ? linuxSockets(p) : {denyRead:[], allowRead:[]};
  return {
    // No allowedDomains: the network is not restricted. On Linux the seccomp filter that
    // blocks every Unix socket is off; linuxSockets() limits them through the file system.
    network: {allowAllUnixSockets: process.platform === 'linux'},
    // macOS: Go programs (gh) verify TLS through com.apple.trustd.agent. The network is
    // already open here, so this adds no new way out.
    enableWeakerNetworkIsolation: process.platform === 'darwin',
    allowPty: true,
    filesystem: {
      denyRead: [...p.denyRead, ...linux.denyRead],
      allowRead: [...p.allowRead, ...linux.allowRead],
      allowWrite: [...p.allowWrite, p.privateHome],
      denyWrite: [],
    },
  };
}

async function confined(p, command, {stdio = 'inherit'} = {}) {
  const sandbox = await runtime();
  prepareHome(p);
  await sandbox.initialize(sandboxConfig(p));
  const vars = Object.entries(p.vars).map(([k, v]) => `${k}=${quote(v)}`).join(' ');
  const line = `cd ${quote(p.root)} && exec env ${vars} ${command.map(quote).join(' ')}`;
  const wrapped = blockUnixSockets(await sandbox.wrapWithSandbox(line), p);
  return {sandbox, child: spawn(wrapped, {shell:true, stdio})};
}

// Stay as the parent so the sandbox is cleaned up; pass on signals and the exit code.
function relay(child, cleanup) {
  for (const signal of ['SIGINT', 'SIGQUIT']) process.on(signal, () => {});
  for (const signal of ['SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
  child.on('error', error => fail(error.message));
  child.on('exit', (code, signal) => {
    cleanup();
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

const enabled = () => {
  const mode = process.env.FYSO_CONFINE || 'strict';
  if (!['strict', 'off'].includes(mode)) fail(`FYSO_CONFINE must be strict or off, not "${mode}"`);
  return mode === 'strict';
};

async function run(argv) {
  const {options, command} = parseArgs(argv);
  if (!command.length) fail('usage: confine.cjs run [options] -- <command> [args…]');
  if (!enabled()) return relay(spawn(command[0], command.slice(1), {stdio:'inherit'}), () => {});
  const {sandbox, child} = await confined(policy(options), command);
  relay(child, () => sandbox.cleanupAfterCommand());
}

// Inside: the project is readable and writable; the home folder's other content, the
// project's siblings and the shared age keys are not; a Unix socket served from outside
// does not answer; the project's own secrets open with the project key.
async function selftest(argv) {
  const {options} = parseArgs([...argv, '--']);
  if (!enabled()) { console.log('confinement is off (FYSO_CONFINE=off)'); return; }
  const p = policy(options);
  const probes = p.denyRead.filter(d => d !== os.homedir() && fs.existsSync(d));
  const parent = path.dirname(p.root);
  for (const name of fs.existsSync(parent) ? fs.readdirSync(parent) : []) {
    const sibling = path.join(parent, name);
    if (sibling !== p.root && probes.length < 12) probes.push(sibling);
  }
  const socketDir = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(), 'confine-'));
  const socket = path.join(socketDir, 's');
  const server = require('node:net').createServer(c => c.end());
  await new Promise((resolve, reject) => server.listen(socket, resolve).on('error', reject));
  const connect = 'require("net").connect(process.argv[1]).on("connect",()=>process.exit(0)).on("error",()=>process.exit(1))';
  const script = [
    'ls "$1" >/dev/null || { echo "cannot read the project folder"; exit 2; }',
    'probe="$1/.data/confine/selftest.$$"; : > "$probe" && rm -f "$probe" || { echo "cannot write the project folder"; exit 2; }',
    `node -e '${connect}' "$2" 2>/dev/null && { echo "can connect to a Unix socket outside the project"; exit 3; }`,
    // Dagu needs to serve and reach its own run sockets (see DAGU_RUN_SOCKETS).
    `node -e 'const s=require("net").createServer().listen(process.argv[1],()=>require("net").connect(process.argv[1]).on("connect",()=>{s.close();process.exit(0)}).on("error",()=>process.exit(1))).on("error",()=>process.exit(1))' "/tmp/@dagu_confine-selftest_$$.sock" || { echo "cannot open a Dagu run socket"; exit 5; }`,
    '[ ! -f "$1/secrets.enc.yaml" ] || sops decrypt "$1/secrets.enc.yaml" >/dev/null 2>&1 || { echo "the project age key does not open secrets.enc.yaml"; exit 4; }',
    'shift 2; for p in "$@"; do if [ -d "$p" ]; then ls "$p" >/dev/null 2>&1; else head -c1 "$p" >/dev/null 2>&1; fi && { echo "can read $p"; exit 3; }; done; exit 0',
  ].join('\n');
  const {sandbox, child} = await confined(p, ['/bin/sh', '-c', script, 'selftest', p.root, socket, ...probes], {stdio:['ignore', 'pipe', 'inherit']});
  let out = '';
  child.stdout.on('data', chunk => { out += chunk; });
  child.on('exit', code => {
    sandbox.cleanupAfterCommand();
    server.close();
    fs.rmSync(socketDir, {recursive:true, force:true});
    if (code !== 0) fail(`the confinement does not hold: ${out.trim() || `exit ${code}`}`);
    console.log(`confined to ${p.root} (${probes.length} outside paths, Unix sockets, project key)`);
    process.exit(0);
  });
}

module.exports = {policy, parseArgs, macosSocketRules, sandboxConfig, gitIdentity, scratchDir, ENGINES};

if (require.main === module) {
  const [mode, ...rest] = process.argv.slice(2);
  (async () => {
    if (mode === 'run') await run(rest);
    else if (mode === 'check') { if (enabled()) await runtime(); }
    else if (mode === 'selftest') await selftest(rest);
    else fail('usage: confine.cjs run [options] -- <command…> | check | selftest [options]');
  })().catch(error => fail(error.message));
}
