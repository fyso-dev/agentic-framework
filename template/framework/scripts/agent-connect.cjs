// Register this project's platform MCP server (fyso, D33) in desktop and CLI agents (D36),
// so they can configure the project from anywhere, not only inside its folder.
//
//   node agent-connect.cjs [connect|disconnect] [claude-desktop] [codex] [claude-code] [--list]
//   node agent-connect.cjs open [codex|claude-desktop]   (new conversation about this project)
//   node agent-connect.cjs status                         (JSON: which agents are installed and connected)
//
// Without targets: the desktop apps found on this Mac (Claude Desktop; Codex, whose app and
// CLI share ~/.codex/config.toml). Claude Code CLI is opt-in. The server is named
// fyso-<project slug>: a plain "fyso" may already be another server (Fyso cloud).
// Native CLIs are used where they exist (codex mcp, claude mcp); Claude Desktop has no CLI,
// so its JSON file is merged, with a backup.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const HOME = process.env.HOME || os.homedir();
const SLUG = process.env.FYSO_PROJECT || path.basename(ROOT);
const NAME = `fyso-${SLUG}`;
const OPEN = process.env.FYSO_OPEN || '/usr/bin/open';   // tests replace it
const CLAUDE_DESKTOP = path.join(HOME, 'Library/Application Support/Claude/claude_desktop_config.json');
const CODEX_CONFIG = path.join(process.env.CODEX_HOME || path.join(HOME, '.codex'), 'config.toml');
const CLAUDE_CODE = path.join(HOME, '.claude.json');

function which(cmd) {
  const r = spawnSync('/bin/sh', ['-c', `command -v ${cmd}`], {encoding: 'utf8'});
  return r.status === 0 ? r.stdout.trim() : null;
}
// Absolute launcher: desktop apps start servers with a minimal PATH and an unknown cwd.
function launcher() {
  const mise = process.env.MISE_EXE || which('mise') || path.join(HOME, '.local/bin/mise');
  return {command: mise, args: ['-C', ROOT, 'exec', '--', 'node', 'framework/scripts/fyso-mcp.cjs']};
}

const TARGETS = {
  'claude-desktop': {
    label: 'Claude Desktop',
    desktop: true,
    found: () => fs.existsSync('/Applications/Claude.app') || fs.existsSync(path.dirname(CLAUDE_DESKTOP)),
    connected: () => !!readJson(CLAUDE_DESKTOP)?.mcpServers?.[NAME],
    connect() {
      const data = fs.existsSync(CLAUDE_DESKTOP) ? JSON.parse(fs.readFileSync(CLAUDE_DESKTOP, 'utf8')) : {};
      if (fs.existsSync(CLAUDE_DESKTOP)) fs.copyFileSync(CLAUDE_DESKTOP, CLAUDE_DESKTOP + '.fyso-backup');
      data.mcpServers = {...(data.mcpServers || {}), [NAME]: launcher()};
      write(CLAUDE_DESKTOP, data);
      return 'restart Claude Desktop to load it';
    },
    disconnect() {
      if (!fs.existsSync(CLAUDE_DESKTOP)) return 'not configured';
      const data = JSON.parse(fs.readFileSync(CLAUDE_DESKTOP, 'utf8'));
      if (!data.mcpServers?.[NAME]) return 'not configured';
      delete data.mcpServers[NAME];
      write(CLAUDE_DESKTOP, data);
      return 'removed';
    },
  },
  codex: {
    label: 'Codex (app and CLI)',
    desktop: true,
    found: () => !!codexCli() || fs.existsSync(path.join(HOME, '.codex')),
    // config.toml table header: [mcp_servers.<name>] or [mcp_servers."<name>"].
    connected: () => { try { return new RegExp(`^\\[mcp_servers\\.("?)${NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1\\]\\s*$`, 'm').test(fs.readFileSync(CODEX_CONFIG, 'utf8')); } catch { return false; } },
    connect() {
      const codex = codexCli();
      if (!codex) throw Error('codex CLI not found (install Codex or the ChatGPT app)');
      spawnSync(codex, ['mcp', 'remove', NAME], {stdio: 'ignore'});
      const {command, args} = launcher();
      run(codex, ['mcp', 'add', NAME, '--', command, ...args]);
      return 'new Codex sessions load it';
    },
    disconnect() {
      const codex = codexCli();
      if (!codex) return 'not configured';
      return spawnSync(codex, ['mcp', 'remove', NAME], {stdio: 'ignore'}).status === 0 ? 'removed' : 'not configured';
    },
  },
  'claude-code': {
    label: 'Claude Code (CLI)',
    desktop: false,
    found: () => !!which('claude'),
    connected: () => !!readJson(CLAUDE_CODE)?.mcpServers?.[NAME],   // user scope lives at the top level
    connect() {
      const claude = which('claude');
      if (!claude) throw Error('claude CLI not found');
      spawnSync(claude, ['mcp', 'remove', '--scope', 'user', NAME], {stdio: 'ignore'});
      const {command, args} = launcher();
      run(claude, ['mcp', 'add', '--scope', 'user', NAME, '--', command, ...args]);
      return 'new Claude Code sessions load it';
    },
    disconnect() {
      const claude = which('claude');
      if (!claude) return 'not configured';
      return spawnSync(claude, ['mcp', 'remove', '--scope', 'user', NAME], {stdio: 'ignore'}).status === 0 ? 'removed' : 'not configured';
    },
  },
};

// The ChatGPT app bundles the Codex CLI; prefer one on PATH.
function codexCli() {
  return which('codex') || ['/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex', '/Applications/Codex.app/Contents/Resources/codex']
    .find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function run(cmd, args) {
  const r = spawnSync(cmd, args, {encoding: 'utf8'});
  if (r.status !== 0) throw Error(`${path.basename(cmd)} ${args.slice(0, 2).join(' ')} failed: ${(r.stderr || r.stdout).trim().split('\n').pop()}`);
}
function write(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

// First message of a new conversation, typed in but not sent (the person sends it).
function firstPrompt() {
  const name = process.env.FYSO_PROJECT_NAME || SLUG;
  return process.env.FYSO_LANG === 'en'
    ? `Use the ${NAME} tools to look at my Fyso project "${name}": read fyso_context, then start with fyso_status and tell me what I have and what to set up first.`
    : `Usa las herramientas de ${NAME} para revisar mi proyecto Fyso "${name}": lee fyso_context, después empieza con fyso_status y dime qué tengo y qué conviene configurar primero.`;
}
// Deep links registered by the apps (read from their bundles): Codex opens a new thread in the
// project folder with the prompt; Claude Desktop opens a new chat with it. Claude Desktop loads
// MCP servers only at start, so a running instance is restarted first.
function openAgent(id) {
  const q = encodeURIComponent(firstPrompt());
  if (id === 'codex') {
    run(OPEN, [`codex://threads/new?path=${encodeURIComponent(ROOT)}&prompt=${q}`]);
    return 'Codex: new conversation in this project';
  }
  if (id === 'claude-desktop') {
    if (spawnSync('/usr/bin/pgrep', ['-x', 'Claude']).status === 0) {
      spawnSync('/usr/bin/osascript', ['-e', 'tell application "Claude" to quit']);
      for (let i = 0; i < 40 && spawnSync('/usr/bin/pgrep', ['-x', 'Claude']).status === 0; i++) spawnSync('/bin/sleep', ['0.25']);
    }
    run(OPEN, [`claude://claude.ai/new?q=${q}`]);
    return 'Claude Desktop: new chat (restarted to load the server)';
  }
  throw Error(`cannot open ${id}: use codex or claude-desktop`);
}

function main(argv) {
  if (argv[0] === 'open') {
    const id = argv[1] || ['codex', 'claude-desktop'].find(t => TARGETS[t].found());
    if (!id) throw Error('no desktop agent found');
    console.log(`✓ ${openAgent(id)}`);
    return 0;
  }
  if (argv[0] === 'status') {
    const agents = Object.entries(TARGETS).map(([id, t]) => ({id, label: t.label, desktop: t.desktop, found: t.found(), connected: t.connected()}));
    console.log(JSON.stringify({server: NAME, agents}));
    return 0;
  }
  const action = ['connect', 'disconnect'].includes(argv[0]) ? argv.shift() : 'connect';
  if (argv.includes('--list')) {
    for (const [id, t] of Object.entries(TARGETS)) console.log(`${id}\t${t.found() ? 'found' : 'missing'}\t${t.desktop ? 'desktop' : 'cli'}\t${t.label}`);
    return 0;
  }
  const unknown = argv.filter(a => !TARGETS[a]);
  if (unknown.length) throw Error(`unknown target: ${unknown.join(', ')} (claude-desktop, codex, claude-code)`);
  const targets = argv.length ? argv : Object.keys(TARGETS).filter(id => TARGETS[id].desktop && TARGETS[id].found());
  if (!targets.length) { console.log('No desktop agent found. Name one: claude-desktop, codex, claude-code'); return 1; }
  let failed = 0;
  for (const id of targets) {
    try { console.log(`✓ ${TARGETS[id].label}: ${action === 'connect' ? `${NAME} added, ` : ''}${TARGETS[id][action]()}`); }
    catch (e) { failed++; console.log(`✗ ${TARGETS[id].label}: ${e.message}`); }
  }
  return failed ? 1 : 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = {main, NAME, launcher, firstPrompt};
