#!/usr/bin/env python3
"""Small Linux/WSL adapter: validate a request, then run the shared native Dagu workflow."""
import argparse
import fcntl
import getpass
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import unicodedata

RES = Path(__file__).resolve().parent
DAGU = 'aqua:dagucloud/dagu@2.24.0'
GH = 'aqua:cli/cli@2.95.0'


def slug_for(name, folder, used):
    text = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    base = re.sub('[^a-z0-9]+', '-', text).strip('-')
    if not base or not base[0].isalpha():
        base = 'fyso-' + base
    base = base[:31].rstrip('-')
    if len(base) < 2:
        base += '-project'
    slug, n = base, 1
    while slug in used or (folder / slug).exists():
        n += 1
        suffix = f'-{n}'
        slug = base[:31-len(suffix)] + suffix
    return slug


def inventory(folder, registry):
    paths = list(folder.glob('*/.copier-answers.yml'))
    if registry.exists():
        paths += [Path(p) / '.copier-answers.yml' for p in registry.read_text().splitlines()]
    records = []
    for p in paths:
        if p.is_file():
            records.append(dict(re.findall(r"^(project_slug|port_base):\s*['\"]?([a-z0-9-]+)['\"]?\s*$", p.read_text(), re.M)))
    return records


def free_block(port, records, excluded=()):
    if not 1030 <= port <= 65520 or port % 10 or any(abs(int(r['port_base']) - port) < 20 for r in records if r.get('port_base','').isdigit()):
        return False
    if any(port <= int(number) < port + 20 for number in excluded):
        return False
    sockets = []
    try:
        for number in range(port, port + 20):  # core and extension blocks (D30)
            s = socket.socket(); sockets.append(s)
            s.bind(('0.0.0.0', number))
        return not any(Path('/tmp').glob(f'fyso-*-{port}.sock'))
    except OSError:
        return False
    finally:
        for s in sockets:
            s.close()


def install(request):
    lang = 'en' if request.get('lang') == 'en' else 'es'
    copy = json.loads((RES / 'locales' / f'{lang}.json').read_text())
    def msg(key, **args):
        return copy[key].format(**args)
    def run(args, **kwargs):
        kwargs.setdefault('cwd', state)
        child = subprocess.Popen([str(a) for a in args], start_new_session=True, **kwargs)
        try:
            code = child.wait()
        except BaseException:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
            raise
        if code:
            raise subprocess.CalledProcessError(code, str(args[0]))

    required = ['git', 'curl', 'bash', 'lsof', 'rsync']
    missing = [t for t in required if not shutil.which(t)]
    if missing:
        raise ValueError(msg('missing', tools=', '.join(missing)))
    name = request.get('name', '').strip()
    admin = request.get('admin', 'admin')
    engine = request.get('engine', 'claude')
    password = request.pop('password', '')
    folder = Path(request.get('folder') or '~/Fyso').expanduser()
    if (not name or not 12 <= len(password.encode('utf-8')) <= 72
            or any(c in name + str(folder) + password for c in '\r\n\x00')
            or not re.fullmatch('[A-Za-z0-9._-]+', admin) or engine not in ['claude', 'codex', 'pi']):
        raise ValueError(msg('invalid'))
    # Never put a WSL project on a Windows drive; Unix permissions and keys live in Linux.
    folder = folder.resolve()
    if request.get('wsl') and re.match(r'^/mnt/[a-zA-Z](?:/|$)', str(folder)):
        raise ValueError(msg('linux_folder'))
    folder.mkdir(parents=True, exist_ok=True)
    state = Path(os.environ.get('XDG_STATE_HOME', str(Path.home() / '.local/state'))) / 'fyso/installer'
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    state.chmod(0o700)
    with (state / 'lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError(msg('busy')) from None
        registry = state.parent / 'projects.txt'
        records = inventory(folder, registry)
        port = int(request.get('port') or next((p for p in range(8400, 9900, 20) if free_block(p, records, request.get('excluded_ports', []))), 0))
        if not free_block(port, records, request.get('excluded_ports', [])):
            raise ValueError(msg('port_busy', port=port))
        used = {r.get('project_slug') for r in records}
        used.update(p.name[5:].rsplit('-', 1)[0] for p in Path('/tmp').glob('fyso-*-*.sock'))
        slug = slug_for(name, folder, used)
        target = folder / slug
        print(msg('installing', name=name, folder=target), flush=True)
        env = {**os.environ, 'MISE_YES': '1'}
        mise = shutil.which('mise') or str(Path.home() / '.local/bin/mise')
        if not Path(mise).is_file():
            run(['bash', RES / 'mise-bootstrap.sh', '--version'], env={**env, 'MISE_INSTALL_PATH': mise})
        env['PATH'] = str(Path(mise).parent) + os.pathsep + env.get('PATH', '')
        source = request.get('source', 'gh:fyso-dev/agentic-framework')
        if source.startswith('gh:'):
            run([mise, 'install', GH], env=env)
            gh = [mise, 'exec', GH, '--', 'gh']
            status = subprocess.run([*gh, 'auth', 'status', '-h', 'github.com'], env=env)
            if status.returncode:
                # Native gh output contains the device code and URL, visible in Qt's log.
                run([*gh, 'auth', 'login', '-h', 'github.com', '-p', 'https', '-w'], env=env, stdin=subprocess.DEVNULL)
            run([*gh, 'auth', 'setup-git', '-h', 'github.com'], env=env)
            run([*gh, 'repo', 'view', source[3:], '--json', 'name'], env=env)
        run([mise, 'install', DAGU], env=env)
        with tempfile.TemporaryDirectory(prefix='password-', dir=state) as private:
            secret = Path(private) / 'initial-password'
            fd = os.open(secret, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w') as out:
                out.write(password + '\n')
            def git_config(key, fallback):
                return subprocess.run(['git', 'config', key], capture_output=True, text=True).stdout.strip() or fallback
            params = dict(DIR=target, NAME=name, SLUG=slug, PORT=port, ENGINE=engine, SOURCE=source,
                          REF=request.get('ref', 'main'), MISE=mise, ADMIN=admin, PASSWORD_FILE=secret,
                          GIT_NAME=git_config('user.name', getpass.getuser()),
                          GIT_EMAIL=git_config('user.email', getpass.getuser() + '@localhost.local'))
            run([mise, 'exec', DAGU, '--', 'dagu', 'start', '-q', '--dagu-home', state / 'dagu',
                 RES / 'fyso-install.yaml', '--', *[f'{k}={v}' for k, v in params.items()]], env=env)
        # Record even if doctor fails, so a partially configured project retains its identity.
        with registry.open('a') as out:
            out.write(str(target) + '\n')
        if engine == 'pi':
            status = subprocess.run([mise, '-C', target, 'exec', '--', 'pi', 'auth', 'check', '--provider', 'openai-codex', '--no-refresh'],
                                    env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if status.returncode:
                command = shlex.join(['mise', '-C', str(target), 'exec', '--', 'pi', 'auth', 'login', 'openai-codex'])
                doctor_command = shlex.join(['mise', '-C', str(target), 'run', 'doctor'])
                print(msg('pi_login_help', command=command, doctor_command=doctor_command), flush=True)
        print(msg('checking'), flush=True)
        run([mise, '-C', target, 'run', 'doctor'], env=env)
        print(msg('done', folder=target, url=f'http://panel.{slug}-{port}.localhost:{port}', admin=admin), flush=True)


def main():
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    parser = argparse.ArgumentParser()
    parser.add_argument('--request-file', type=Path)
    parser.add_argument('--watch-stdin', action='store_true')
    args = parser.parse_args()
    if args.request_file:
        private = args.request_file
        info = private.lstat()
        if (private.name != 'request.json' or not private.parent.name.startswith('fyso-request-')
                or not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077):
            parser.error('request-file must be a private, installer-owned temporary request')
        # Request files are private, transient handoffs, never package metadata.
        try:
            data = args.request_file.read_text(encoding='utf-8-sig')
        finally:
            args.request_file.unlink(missing_ok=True)
            try:
                args.request_file.parent.rmdir()
            except OSError:
                pass
    else:
        data = sys.stdin.readline() if args.watch_stdin else sys.stdin.read()
    if args.watch_stdin:
        # Windows keeps this pipe open while Qt owns the operation. Parent death or
        # cancellation closes it; stop only our own work, never the WSL distribution.
        def disconnected():
            sys.stdin.read()
            os.kill(os.getpid(), signal.SIGTERM)
        threading.Thread(target=disconnected, daemon=True).start()
    try:
        install(json.loads(data))
    except KeyboardInterrupt:
        return 130
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        # Do not print JSON request contents or command argv (could contain user data).
        print(str(error) if not isinstance(error, subprocess.CalledProcessError) else
              'Installation command failed (exit %s). See the preceding step output.' % error.returncode, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
