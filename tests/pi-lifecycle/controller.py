"""Full-lifecycle Pi beta acceptance in a disposable generated project (macOS).

Do not run without an independent review of this file and profile.sb.in.

The controller runs outside the sandbox only to: check host preconditions
(ports, fixed sockets, no other Dagu), watch for foreign Dagu processes during
the run, identify and stop fixture-owned processes, and compare global state.
Every project command runs inside the rendered sandbox profile.

Inputs (environment, all required unless noted):
  FYSO_TEST_MISE            pinned mise executable
  FYSO_TEST_COPIER          Copier 9.19.1 executable
  FYSO_TEST_MISE_INSTALLS   existing mise installs dir (tools are symlinked, read-only)
  FYSO_TEST_PI_INSTALL      an existing Pi 1.5.2 mise install dir to copy
  FYSO_TEST_TINYAUTH_DIR    dir with a prebuilt pinned tinyauth + version file
  FYSO_TEST_PLAYWRIGHT_NODE_PATH, FYSO_TEST_CHROME   browser step
  FYSO_TEST_PORT_BASE       optional; default searches a free block
Output: <fixture>/evidence/result.json plus logs, screenshots, rendered profile.
"""
import ctypes, hashlib, json, os, re, shutil, signal, socket, subprocess, sys, tempfile, threading, time
import urllib.request, urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
BOT = 'Pi Lifecycle Beta'
MODEL = 'pi/openai-codex/gpt-6-luna'
SLUG = 'pi-life'
PI_DIR = Path.home() / '.pi' / 'agent'
TMP = Path('/tmp').resolve()  # Dagu and lib.sh hard-code /tmp; macOS resolves it
DAGU_SOCKET = re.compile(r'^@dagu_(fyso|ext)-[A-Za-z0-9_.-]+_[0-9a-f]{6}\.sock$')


class Abort(RuntimeError):
    pass


def sh(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, **kw)


# ---------- host inspection (outside the sandbox, read-only) ----------

def processes():
    """pid -> (ppid, command, start epoch) for every process of this user."""
    out = sh(['/bin/ps', '-x', '-o', 'pid=,ppid=,lstart=,command='], env={'LC_ALL': 'C', 'PATH': '/usr/bin:/bin'}).stdout
    table = {}
    for line in out.splitlines():
        parts = line.strip().split(None, 7)
        if len(parts) >= 7 and parts[0].isdigit() and parts[1].isdigit():
            try: start = time.mktime(time.strptime(' '.join(parts[2:7]), '%a %b %d %H:%M:%S %Y'))
            except ValueError: continue
            table[int(parts[0])] = (int(parts[1]), parts[7] if len(parts) > 7 else '', start)
    return table


_SANDBOX = ctypes.CDLL('/usr/lib/system/libsystem_sandbox.dylib')
_SANDBOX.sandbox_check.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int]


def sandboxed(pid):
    return _SANDBOX.sandbox_check(pid, None, 0) == 1


def ancestors(table, pid=None):
    pid, seen = pid or os.getpid(), set()
    while pid and pid not in seen:
        seen.add(pid); pid = table.get(pid, (0,))[0]
    return seen


def cwd_map():
    out = sh(['/usr/sbin/lsof', '-a', '-d', 'cwd', '-u', str(os.getuid()), '-Fpn']).stdout
    result, pid = {}, None
    for line in out.splitlines():
        if line.startswith('p'): pid = int(line[1:])
        elif line.startswith('n') and pid is not None: result[pid] = line[1:]
    return result


def fixture_pids(fixture, t0, table=None):
    """Fixture-owned processes: started at or after t0, running inside a sandbox,
    not an ancestor of this controller, and either referencing the fixture
    (path followed by '/' or exact) in command/cwd or descending from such a process."""
    table = table or processes()
    roots = {str(fixture), str(fixture).replace('/private/var/', '/var/', 1)}
    def inside(text):
        return any(text == r or text.startswith(r + '/') or (r + '/') in text or text.endswith(' ' + r)
                   or (' ' + r + ' ') in text for r in roots)
    cwds = cwd_map()
    excluded = ancestors(table)
    eligible = {pid for pid, (_, _, start) in table.items()
                if start >= int(t0) and pid not in excluded and sandboxed(pid)}
    owned = {pid for pid in eligible if inside(table[pid][1]) or inside(cwds.get(pid, ''))}
    changed = True
    while changed:
        changed = False
        for pid in eligible - owned:
            if table[pid][0] in owned:
                owned.add(pid); changed = True
    return owned


def dagu_pids(table=None):
    table = table or processes()
    return {pid for pid, (_, cmd, _) in table.items()
            if cmd.split() and os.path.basename(cmd.split()[0]) == 'dagu'}


def listeners(port):
    out = sh(['/usr/sbin/lsof', '-nP', '-t', f'-iTCP:{port}', '-sTCP:LISTEN']).stdout
    return {int(x) for x in out.split() if x.isdigit()}


def free_block(start=34100, end=34900):
    for base in range(start, end, 10):
        if all(not listeners(p) and bindable(p) for p in range(base, base + 10)):
            return base
    raise Abort('No free 10-port block')


def bindable(port):
    for family, host in ((socket.AF_INET, '127.0.0.1'), (socket.AF_INET6, '::1')):
        s = socket.socket(family)
        try: s.bind((host, port))
        except OSError: return False
        finally: s.close()
    return True


def digest(path):
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


def global_state():
    """Names, link targets, sizes and mtimes; file contents only hashed, never stored.
    Pi's auth.json is never read: only its size and mtime are recorded."""
    state = {}
    home = Path.home()
    for base in [home / '.local/state/mise', home / '.config/mise']:
        entries = {}
        if base.exists():
            for p in sorted(base.rglob('*')):
                rel = str(p.relative_to(base))
                if p.is_symlink(): entries[rel] = 'link:' + os.readlink(p)
                elif p.is_file(): entries[rel] = digest(p)
        state[str(base.relative_to(home))] = entries
    pi = {}
    if PI_DIR.exists():
        for p in sorted(PI_DIR.iterdir()):
            st = p.lstat()
            pi[p.name] = {'size': st.st_size, 'mtime': st.st_mtime} if p.name == 'auth.json' else \
                ({'sha256': digest(p)} if p.is_file() else {'mtime': st.st_mtime})
    state['.pi/agent'] = pi
    state['.gitconfig'] = digest(home / '.gitconfig')
    state['tmp'] = sorted(n for n in os.listdir(TMP) if n.startswith(('@dagu_', 'fyso-')))
    return state


def diff_state(before, after):
    changes = []
    for key in sorted(set(before) | set(after)):
        a, b = before.get(key), after.get(key)
        if a == b: continue
        if isinstance(a, dict) and isinstance(b, dict):
            for k in sorted(set(a) | set(b)):
                if a.get(k) != b.get(k): changes.append(f'{key}/{k}')
        elif isinstance(a, list) and isinstance(b, list):
            changes += [f'{key}: +{n}' for n in sorted(set(b) - set(a))]
            changes += [f'{key}: -{n}' for n in sorted(set(a) - set(b))]
        else:
            changes.append(key)
    return changes


# ---------- the run ----------

class Run:
    def __init__(self):
        e = os.environ
        self.mise = Path(e['FYSO_TEST_MISE']).resolve(strict=True)
        self.copier = Path(e['FYSO_TEST_COPIER']).absolute()
        self.installs = Path(e['FYSO_TEST_MISE_INSTALLS']).resolve(strict=True)
        self.pi_install = Path(e['FYSO_TEST_PI_INSTALL']).resolve(strict=True)
        self.tinyauth = Path(e['FYSO_TEST_TINYAUTH_DIR']).resolve(strict=True)
        self.node_path = e['FYSO_TEST_PLAYWRIGHT_NODE_PATH']
        self.chrome = Path(e['FYSO_TEST_CHROME']).resolve(strict=True)
        self.fixture = Path(tempfile.mkdtemp(prefix='fyso-pi-life-')).resolve()
        self.project = self.fixture / 'project'
        self.evidence = self.fixture / 'evidence'
        self.evidence.mkdir()
        self.result = {'fixture': str(self.fixture), 'steps': [], 'checks': {}}
        self.abort_reason = None
        self.stop = threading.Event()

    def log(self, step, **data):
        entry = {'step': step, 't': round(time.time() - self.t0, 1), **data}
        self.result['steps'].append(entry)
        print(json.dumps(entry, ensure_ascii=False), flush=True)

    # --- preconditions ---
    def preflight(self):
        table = processes()
        foreign = dagu_pids(table)
        if foreign:
            raise Abort(f'Other Dagu processes are running: {sorted(foreign)}. Stop them first (option A).')
        base = int(os.environ.get('FYSO_TEST_PORT_BASE') or free_block())
        self.ports = list(range(base, base + 10))
        busy = [p for p in self.ports if listeners(p) or not bindable(p)]
        if busy: raise Abort(f'Fixture ports in use: {busy}')
        self.base = base
        self.sockets = {
            'PC_SOCKET': Path(f'{TMP}/fyso-{SLUG}-{base}.sock'),
            'CONNECTORS_SOCKET': Path(f'{TMP}/fyso-connectors-{base}.sock'),
            'MCP_SOCKET': Path(f'{TMP}/fyso-mcp-{base}.sock'),
        }
        for path in self.sockets.values():
            if os.path.lexists(path): raise Abort(f'Fixed socket path already exists: {path}')
        self.stale_sockets = {n for n in os.listdir(TMP) if DAGU_SOCKET.match(n)}
        self.result['checks']['preexistingDaguSockets'] = len(self.stale_sockets)
        self.before = global_state()
        self.log('preflight', portBase=base, foreignDagu=0)

    def recheck_host(self, when):
        """Ports and fixed sockets must still be free right before services start."""
        busy = [p for p in self.ports if listeners(p) or not bindable(p)]
        taken = [str(s) for s in self.sockets.values() if os.path.lexists(s)]
        if busy or taken: raise Abort(f'{when}: ports {busy} / sockets {taken} became occupied')

    def require_no_remote(self, when):
        """Inside the sandbox: the fixture repository must have no Git remote."""
        out = self.capture(['git', 'remote', '-v'])
        if out.strip(): raise Abort(f'{when}: fixture repository has a Git remote')

    def render_profile(self):
        rules = '\n'.join(
            f'(allow {op} ({d} tcp "localhost:{p}"))'
            for p in self.ports for op, d in
            [('network-bind', 'local'), ('network-inbound', 'local'), ('network-outbound', 'remote')])
        text = (HERE / 'profile.sb.in').read_text().replace('@PORT_RULES@', rules).replace('@TMP_ROOT@', str(TMP))
        self.profile = self.evidence / 'profile.sb'
        self.profile.write_text(text)
        params = {'FIXTURE': self.fixture,
                  'PI_AUTH_LOCK': PI_DIR / 'auth.json.lock', 'PI_TRUST_LOCK': PI_DIR / 'trust.json.lock',
                  'PI_SETTINGS_LOCK': PI_DIR / 'settings.json.lock', **self.sockets}
        self.sandbox = ['/usr/bin/sandbox-exec', '-f', str(self.profile)]
        for k, v in params.items(): self.sandbox += ['-D', f'{k}={v}']

    def environment(self):
        f = self.fixture
        tools = f / 'tools'; tools.mkdir()
        # ext.sh runs Copier through uvx; point it at the pinned local Copier offline.
        (tools / 'uvx').write_text('#!/bin/sh\nwhile [ "$#" -gt 0 ] && [ "$1" != copier ]; do shift; done\nshift\n'
                                   f'exec "{self.copier}" "$@"\n')
        (tools / 'uvx').chmod(0o755)
        mise_data = f / 'mise-data' / 'installs'; mise_data.mkdir(parents=True)
        for tool in self.installs.iterdir():
            if tool.name.startswith('npm-earendil-works-pi'): continue
            if tool.is_dir(): (mise_data / tool.name).symlink_to(tool)
        shutil.copytree(self.pi_install, mise_data / self.pi_install.name, symlinks=True)
        password = f / 'web-password'; password.write_text('fictional-web-password-' + os.urandom(6).hex() + '\n')
        password.chmod(0o600)
        self.password = password
        gitconfig = f / 'gitconfig'
        gitconfig.write_text('[user]\n\tname = Fixture\n\temail = fixture@example.invalid\n[commit]\n\tgpgsign = false\n')
        env = {k: os.environ[k] for k in ('HOME', 'USER', 'LOGNAME') if k in os.environ}
        env.update({
            'PATH': f'{self.mise.parent}:{tools}:/usr/bin:/bin:/usr/sbin:/sbin', 'TMPDIR': str(f),
            'XDG_STATE_HOME': str(f / 'state'), 'XDG_CONFIG_HOME': str(f / 'config'),
            'XDG_DATA_HOME': str(f / 'xdg-data'), 'XDG_CACHE_HOME': str(f / 'cache'),
            'MISE_DATA_DIR': str(f / 'mise-data'), 'MISE_CACHE_DIR': str(f / 'cache'),
            'MISE_STATE_DIR': str(f / 'state'), 'MISE_AUTO_INSTALL': 'false', 'MISE_YES': '1',
            'MISE_SOPS_AGE_KEY_FILE': str(f / 'age-key'), 'SOPS_AGE_KEY_FILE': str(f / 'age-key'),
            'FYSO_INITIAL_PASSWORD_FILE': str(password),
            'GIT_CONFIG_GLOBAL': str(gitconfig), 'GIT_CONFIG_NOSYSTEM': '1',
            'PYTHONDONTWRITEBYTECODE': '1', 'NO_COLOR': '1'})
        self.env = env

    # --- sandboxed commands ---
    def run(self, name, args, timeout=300, cwd=None, mise=True, env=None, check=True):
        self.check_abort()
        cmd = [*self.sandbox, *([str(self.mise), 'exec', '--'] if mise else []), *args]
        with open(self.evidence / f'{name}.log', 'w') as out:
            p = subprocess.run(cmd, cwd=cwd or self.project, env=env or self.env, stdin=subprocess.DEVNULL,
                               stdout=out, stderr=subprocess.STDOUT, timeout=timeout, start_new_session=True)
        self.log(name, exit=p.returncode)
        if check and p.returncode: raise Abort(f'{name} failed with exit {p.returncode}; see evidence/{name}.log')
        return (self.evidence / f'{name}.log').read_text()

    def capture(self, args, timeout=120):
        self.check_abort()
        p = subprocess.run([*self.sandbox, str(self.mise), 'exec', '--', *args], cwd=self.project, env=self.env,
                           stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=timeout,
                           start_new_session=True)
        if p.returncode: raise Abort(f'{args[:3]} failed ({p.returncode}): {p.stderr[-600:]}')
        return p.stdout

    def check_abort(self):
        if self.abort_reason: raise Abort(self.abort_reason)

    def watch(self):
        """Abort if a non-fixture Dagu appears (protects the Dagu socket rule)."""
        while not self.stop.wait(1.5):
            try:
                table = processes()
                foreign = dagu_pids(table) - fixture_pids(self.fixture, self.t0, table)
                if foreign:
                    self.abort_reason = f'Foreign Dagu appeared during the run: {sorted(foreign)}'
            except Exception as exc:  # losing the watch means losing the protection
                self.abort_reason = f'Dagu watch failed: {type(exc).__name__}'
            if self.abort_reason:
                self.kill_fixture()
                return

    # --- lifecycle ---
    def generate(self):
        source = self.fixture / 'source'
        source.mkdir()
        shutil.copy2(REPO / 'copier.yml', source / 'copier.yml')
        shutil.copytree(REPO / 'template', source / 'template', symlinks=True,
                        ignore=shutil.ignore_patterns('node_modules', '.data'))
        self.run('copier', [str(self.copier), 'copy', '--defaults', '--trust',
                            '-d', 'project_name=Pi Life', '-d', f'project_slug={SLUG}',
                            '-d', f'port_base={self.base}', '-d', 'engine=pi',
                            str(source), str(self.project)], cwd=self.fixture, mise=False)
        self.run('git-init', ['/bin/sh', '-c', 'git init -q && git add -A && git commit -qm "fixture: generated"'],
                 mise=False)
        web = self.project / '.data/web-auth/bin'; web.mkdir(parents=True)
        for name in ('tinyauth', 'version'): shutil.copy2(self.tinyauth / name, web / name)
        self.run('mise-trust', [str(self.mise), 'trust', '--yes', str(self.project / 'mise.toml')], mise=False)
        self.require_no_remote('after generation')

    def lifecycle(self):
        self.run('setup', ['mise', 'run', 'setup'])
        # The bundled working-tree copy, never the published catalog.
        self.run('ext-add', ['framework/scripts/ext.sh', 'add', './framework/extensions/human-requests',
                             '--', '--defaults'], timeout=300)
        answers = (self.project / '.copier-answers.ext-human-requests.yml').read_text()
        src = next((l.split(':', 1)[1].strip() for l in answers.splitlines() if l.startswith('_src_path:')), '')
        if src.rstrip('/') not in ('./framework/extensions/human-requests', 'framework/extensions/human-requests'):
            raise Abort(f'Extension installed from an unexpected source: {src!r}')
        self.require_no_remote('after extension')
        self.run('git-commit-ext', ['/bin/sh', '-c', 'git add -A && git commit -qm "fixture: extension" || true'],
                 mise=False)
        self.require_no_remote('before up')
        self.recheck_host('before up')
        self.run('up', ['mise', 'run', 'up'], timeout=400)
        self.run('doctor', ['mise', 'run', 'doctor'], timeout=300)
        self.result['checks']['doctor'] = 'passed'

    def bot_flow(self):
        env = dict(line.split('=', 1) for line in self.capture(['env']).splitlines() if '=' in line)
        omb_port, dagu_port = env['FYSO_OMB_PORT'], env['FYSO_DAGU_PORT']
        skill = self.project / 'extensions/human-requests/skills/human-requests/SKILL.md'
        if not skill.is_file(): raise Abort('Installed human-requests skill not found')
        team = self.fixture / 'team.yaml'
        team.write_text(
            'version: 1\nbots:\n  - name: ' + BOT + '\n    title: Fictional isolated test\n'
            f'    model: {MODEL}\n    approval: full\n    computer: "off"\n    cwd: {json.dumps(str(self.project))}\n'
            '    tools:\n      allow: ["native:read", "mcp:dagu:dagu_read", "mcp:dagu:dagu_execute", "mcp:agents:list_threads"]\n'
            f'    skills:\n      - file: {json.dumps(str(skill))}\n'
            '    soul: "You are an isolated test bot. All test requests are fictional. Use only assigned tools."\n')
        omb = ['openmausbot', '--port', omb_port, '--json']
        self.capture(['openmausbot', 'team', 'apply', str(team), '--port', omb_port, '--json', '--dry-run'])
        self.capture(['openmausbot', 'team', 'apply', str(team), '--port', omb_port, '--json'])
        sent = json.loads(self.capture(['openmausbot', 'send', BOT,
            'Para un saludo ficticio, creá un pedido para que una persona decida el tono. '
            'Respondé cualquier repregunta y continuá solo después de recibir la decisión.', *omb[1:]]))
        self.capture(['openmausbot', 'wait', BOT, *omb[1:]], timeout=240)
        self.log('bot-created-request', taskId=bool(sent.get('taskId')))
        root = self.project / '.data/dagu/data/dag-runs/ext-human-requests-request/dag-runs'
        found = []
        for f in root.rglob('status.jsonl'):
            d = json.loads(f.read_text().splitlines()[-1])
            p = str(d.get('params', ''))
            if sent['botId'] in p and sent['taskId'] in p and d.get('status') == 7: found.append(d)
        if len(found) != 1: raise Abort(f'Expected one waiting request for the exact origin, got {len(found)}')
        state = found[0]; run_id = state['dagRunId']
        prepare = next(n for n in state['nodes'] if n['step']['id'] == 'prepare')
        card = json.loads(Path(prepare['stdout']).read_text())
        if not card.get('canAsk'): raise Abort('Request cannot be clarified: origin not resolved')
        self.log('origin-verified', canAsk=True)
        panel = f"http://panel.{env['FYSO_WEB_DOMAIN']}:{env['FYSO_HTTP_PORT']}"
        benv = {**self.env, 'NODE_PATH': self.node_path, 'FYSO_TEST_EVIDENCE': str(self.evidence),
                'FYSO_TEST_TITLE': card['request']['title'], 'FYSO_TEST_BOT': BOT,
                'FYSO_TEST_PANEL_URL': panel, 'FYSO_TEST_WEB_DOMAIN': env['FYSO_WEB_DOMAIN'],
                'FYSO_TEST_PASSWORD_FILE': str(self.password), 'FYSO_TEST_CHROME': str(self.chrome)}
        self.run('browser', ['node', str(HERE / 'browser.cjs')], timeout=300, env=benv)
        auth = 'Basic ' + __import__('base64').b64encode(
            f"{env['FYSO_ADMIN_USER']}:{env['FYSO_ADMIN_PASSWORD']}".encode()).decode()
        status = None
        for _ in range(150):
            self.check_abort()
            req = urllib.request.Request(
                f'http://127.0.0.1:{dagu_port}/api/v1/dag-runs/ext-human-requests-request/{run_id}',
                headers={'Authorization': auth})
            with urllib.request.urlopen(req, timeout=5) as r:
                status = json.load(r)['dagRunDetails'].get('statusLabel')
            if status in ('succeeded', 'failed', 'cancelled', 'aborted'): break
            time.sleep(1)
        if status != 'succeeded': raise Abort(f'Request workflow ended as {status}')
        reply = None
        for _ in range(180):
            msgs = json.loads(self.capture(['openmausbot', 'messages', BOT, *omb[1:]]))
            entries = msgs.get('messages', [])
            idx = next((i for i, m in enumerate(entries) if m.get('role') == 'user' and run_id in m.get('text', '')
                        and '"decision":"answered"' in m.get('text', '')), None)
            if idx is not None:
                tail = entries[idx + 1:]
                if any(m.get('role') == 'bot' and m.get('kind') == 'digest' for m in tail):
                    reply = next((m.get('text') for m in reversed(tail)
                                  if m.get('role') == 'bot' and m.get('kind') == 'text' and m.get('text')), None)
            if reply: break
            time.sleep(1)
        if not reply or msgs.get('taskId') != sent['taskId']:
            raise Abort('Bot continuation in the same conversation was not observed')
        browser = json.loads((self.evidence / 'browser.json').read_text())
        self.result['checks']['botFlow'] = {'sameConversation': True, 'workflowStatus': status,
                                            'botAfterDecision': reply, 'browser': browser}
        self.log('bot-continued', sameConversation=True)

    # --- shutdown and cleanup (always) ---
    def shutdown(self):
        self.stop.set()
        if self.project.joinpath('mise.toml').exists():
            try:
                self.abort_reason, reason = None, self.abort_reason
                self.run('down', ['mise', 'run', 'down'], timeout=120, check=False)
                self.abort_reason = reason
            except Exception as exc:  # keep cleaning up
                self.log('down-error', error=str(exc)[:300])
        self.kill_fixture()
        try: self.require_no_remote('at the end')
        except Exception as exc: self.result['checks']['remoteAtEnd'] = str(exc)[:200]
        self.kill_fixture()
        table = processes()
        self.result['checks']['cleanup'] = {
            'fixtureProcesses': sorted(fixture_pids(self.fixture, self.t0, table)),
            'foreignDagu': sorted(dagu_pids(table)),
            'portsListening': [p for p in getattr(self, 'ports', []) if listeners(p)],
            'fixedSockets': [str(p) for p in getattr(self, 'sockets', {}).values() if os.path.lexists(p)],
            'daguSockets': sorted(n for n in os.listdir(TMP)
                                  if DAGU_SOCKET.match(n) and n not in getattr(self, 'stale_sockets', set())),
        }
        if hasattr(self, 'before'):
            self.result['checks']['globalStateChanges'] = diff_state(self.before, global_state())
        denials = sh(['/usr/bin/log', 'show', '--style', 'compact', '--start',
                      time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(self.t0)),
                      '--predicate', 'sender == "Sandbox" AND eventMessage CONTAINS "deny"']).stdout
        names = ('dagu', 'node', 'caddy', 'tinyauth', 'process-compose', 'mise', 'git', 'sh', 'bash', 'pi',
                 'python', 'copier', 'chrome', 'sops', 'age', 'curl', 'lsof')
        lines = [l for l in denials.splitlines() if 'deny' in l and
                 (str(self.fixture) in l or re.search(r'Sandbox: (' + '|'.join(names) + r')[^(]*\(', l))]
        (self.evidence / 'sandbox-denials.log').write_text('\n'.join(lines) + '\n')
        self.result['checks']['sandboxDenials'] = len(lines)

    def kill_fixture(self):
        """SIGTERM then SIGKILL fixture processes, re-verifying ownership right before signalling."""
        for sig, polls in ((signal.SIGTERM, 50), (signal.SIGKILL, 25)):
            owned = fixture_pids(self.fixture, self.t0)
            if not owned: return
            for pid in owned & fixture_pids(self.fixture, self.t0):
                try: os.kill(pid, sig)
                except ProcessLookupError: pass
            for _ in range(polls):
                time.sleep(0.2)
                if not fixture_pids(self.fixture, self.t0): return

    def main(self):
        self.t0 = time.time()
        ok = False
        try:
            self.preflight()
            self.render_profile()
            self.environment()
            threading.Thread(target=self.watch, daemon=True).start()
            self.generate()
            self.lifecycle()
            self.bot_flow()
            ok = True
        except (Abort, subprocess.TimeoutExpired, urllib.error.URLError, KeyError, ValueError) as exc:
            self.result['error'] = f'{type(exc).__name__}: {exc}'[:800]
        finally:
            self.shutdown()
            c = self.result['checks']['cleanup']
            clean = not (c['fixtureProcesses'] or c['portsListening'] or c['fixedSockets'] or c['daguSockets'])
            self.result['passed'] = (ok and clean and not self.result['checks'].get('globalStateChanges')
                                     and 'remoteAtEnd' not in self.result['checks'])
            (self.evidence / 'result.json').write_text(json.dumps(self.result, ensure_ascii=False, indent=2) + '\n')
            print(json.dumps({'passed': self.result['passed'], 'error': self.result.get('error'),
                              'cleanup': c, 'globalStateChanges': self.result['checks'].get('globalStateChanges'),
                              'evidence': str(self.evidence)}, ensure_ascii=False, indent=2))
        sys.exit(0 if self.result['passed'] else 1)


if __name__ == '__main__':
    if sys.platform != 'darwin': sys.exit('macOS only')
    Run().main()
