#!/usr/bin/python3
# <swiftbar.title>Fyso projects</swiftbar.title>
# <swiftbar.desc>Fyso Agentic Framework projects running on this Mac: health, links, stop.</swiftbar.desc>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
# <swiftbar.hideSwiftBar>true</swiftbar.hideSwiftBar>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
"""SwiftBar plugin (D34): one menu for every Fyso project running on this machine.

Discovery needs no registry: each running stack owns a process-compose socket
/tmp/fyso-<slug>-<port>.sock (framework/scripts/lib.sh). Process states come from
that socket, the project folder from the process-compose working directory, and
names and app links from the project's .data/panel/*.json. Projects seen running
are cached (a rebuildable cache, not configuration) so a stopped one can be started
again. Standard library only; SwiftBar runs plugins with a minimal PATH. Refreshes
every 10 s (file name). Menu actions call this file again: fyso.10s.py <action> <root>.
"""
import contextlib
import fcntl
import glob
import http.client
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time

SOCKETS = os.environ.get('FYSO_TRAY_SOCKETS', "/tmp/fyso-*.sock")
CACHE = os.environ.get('FYSO_TRAY_CACHE', os.path.expanduser("~/Library/Caches/fyso-tray/projects.json"))
SELF = os.path.abspath(__file__)
QUIET = os.environ.get('FYSO_TRAY_QUIET') == "1"  # tests: no SwiftBar refresh, no notifications
BUSY_MAX = 600  # seconds; `mise run up` gives up after 4 minutes



LOCALES = os.path.join(os.path.dirname(os.path.realpath(__file__)), "locales")  # real file, not the SwiftBar link


def language():
    """FYSO_TRAY_LANG, else the first macOS language with a locales/<lang>.json, else es (the default)."""
    available = {f[:-5] for f in os.listdir(LOCALES) if f.endswith(".json")}
    if os.environ.get('FYSO_TRAY_LANG') in available:
        return os.environ["FYSO_TRAY_LANG"]
    try:
        out = subprocess.run(["/usr/bin/defaults", "read", "-g", "AppleLanguages"], capture_output=True, text=True, timeout=2).stdout
        for code in re.findall(r'"?([A-Za-z]{2})[-_A-Za-z]*"?\s*[,)]', out):  # e.g. ( "es-AR", "en-US" )
            if code.lower() in available:
                return code.lower()
    except Exception:
        pass
    return "es"


def load_locale(lang):
    with open(os.path.join(LOCALES, "es.json")) as f:
        texts = json.load(f)  # missing keys fall back to es
    if lang != "es":
        with open(os.path.join(LOCALES, f"{lang}.json")) as f:
            texts.update(json.load(f))
    return texts


TEXTS = load_locale(language())


def t(key, **values):
    """Translated UI text; {{name}} placeholders as in i18next."""
    return re.sub(r"\{\{(\w+)\}\}", lambda m: str(values.get(m.group(1), m.group(0))), TEXTS.get(key, key))


class UnixHTTP(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__("localhost", timeout=2)
        self.path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(2)
        self.sock.connect(self.path)


def processes(sock):
    conn = UnixHTTP(sock)
    try:
        conn.request('GET', "/processes")
        return json.loads(conn.getresponse().read()).get('data') or []
    finally:
        conn.close()


def is_project(root):
    return bool(root) and os.path.isfile(os.path.join(root, ".copier-answers.yml"))


def project_root(sock):
    """(root, pid) of the process that listens on the socket: process-compose starts in the project root."""
    try:
        pids = subprocess.run(["/usr/sbin/lsof", "-t", sock], capture_output=True, text=True, timeout=3).stdout.split()
        for pid in pids:
            out = subprocess.run(["/usr/sbin/lsof", "-a", "-p", pid, "-d", "cwd", "-Fn"], capture_output=True, text=True, timeout=3).stdout
            for line in out.splitlines():
                if line.startswith("n") and is_project(line[1:]):
                    return line[1:], pid
    except Exception:
        pass
    return None, None


def read_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


def stack_path(pid):
    """PATH of the running process-compose. SwiftBar's PATH is minimal, but the stack was started by
    `mise run up` from the user's shell: its PATH holds mise and the engine CLIs (claude, codex)."""
    try:
        env = subprocess.run(["/bin/ps", "eww", "-o", "command=", "-p", str(pid)], capture_output=True, text=True, timeout=2).stdout
        # Environment follows the arguments, space-separated; PATH may itself contain spaces.
        found = re.findall(r" PATH=(.*?)(?= [A-Za-z_][A-Za-z0-9_]*=|$)", env.rstrip("\n"))
        return found[-1] if found else ""
    except Exception:
        return ""


def mise_path(path):
    for candidate in (shutil.which("mise", path=path) if path else None, shutil.which("mise"),
                      os.path.expanduser("~/.local/bin/mise")):
        if candidate and os.access(candidate, os.X_OK):
            return candidate
    return None


def load_cache():
    data = read_json(CACHE)
    return data if isinstance(data, dict) else {}


def save_cache(cache):
    try:
        tmp = CACHE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(cache, f, indent=1, sort_keys=True)
        os.replace(tmp, CACHE)
    except Exception:
        pass


@contextlib.contextmanager
def cache_edit():
    """Read-modify-write the cache under a lock: menu refreshes and actions run at the same time,
    and an unlocked refresh would write back a stale "busy" mark over a finished action."""
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE + ".lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        cache = load_cache()
        yield cache
        save_cache(cache)


def projects():
    found, seen = [], {}
    for sock in sorted(glob.glob(SOCKETS)):
        m = re.match(r"fyso-(.+)-(\d+)\.sock$", os.path.basename(sock))
        if not m:
            continue
        slug, port = m.group(1), m.group(2)
        item = {"slug": slug, "port": port, "sock": sock, "name": slug, "root": None, "procs": None, "apps": [], "state": "up"}
        try:
            item["procs"] = processes(sock)
        except (ConnectionRefusedError, FileNotFoundError):
            item["state"] = "stale"  # nobody listens: the stack crashed and left its socket behind
            found.append(item)
            continue
        except Exception:
            item["state"] = "no_answer"  # listening but not answering (busy or starting)
            found.append(item)
            continue
        root, pid = project_root(sock)
        root = os.path.realpath(root) if root else None
        item["root"] = root
        if root:
            path = stack_path(pid)
            item["mise"] = mise_path(path)
            info = read_json(os.path.join(root, ".data/panel/project.json")) or {}
            item["name"] = info.get('name') or slug
            item["apps"] = read_json(os.path.join(root, ".data/panel/apps.json")) or []
            if item["mise"]:
                seen[root] = {"name": item["name"], "port": port, "mise": item["mise"], "path": path or os.environ.get('PATH', "")}
        found.append(item)
    # Only the fields this refresh owns are written; busy/error belong to running actions.
    with cache_edit() as cache:
        for root, fields in seen.items():
            cache.setdefault(root, {}).update(fields)
        for root in [r for r in cache if not is_project(r)]:  # folders deleted since
            del cache[root]
        snapshot = json.loads(json.dumps(cache))
    for item in found:
        if item["root"] in snapshot:
            item["busy"], item["error"] = busy(snapshot[item["root"]]), snapshot[item["root"]].get('error')
    live = {p["root"] for p in found if p["root"]}
    for root, c in sorted(snapshot.items(), key=lambda rc: rc[1].get('name', "")):
        if root not in live:
            found.append({"state": "stopped", "root": root, "name": c.get('name') or os.path.basename(root),
                          "port": c.get('port', ""), "busy": busy(c), "error": c.get('error')})
    return found


def busy(entry):
    """Action in progress for a cached project ("start", "stop", "restart"), if recent."""
    entry = entry or {}
    return entry.get('busy') if time.time() - entry.get('since', 0) < BUSY_MAX else None


def proc_ok(proc):
    status = proc.get('status')
    if status == "Running":
        return proc.get('is_ready') == "Ready" or not proc.get('has_ready_probe', proc.get('is_ready') == "Ready")
    return status == "Disabled" or (status == "Completed" and proc.get('exit_code', 0) == 0)


def health(procs):
    if not procs:
        return "red"
    return "green" if all(proc_ok(p) for p in procs) else "orange"


def q(value):
    """SwiftBar parameter value; quoted when it has spaces (folders like "Mis proyectos")."""
    return f'"{value}"' if " " in value else value


def esc(text):
    return str(text).replace("|", "¦").replace("\n", " ")


def action(name, root):
    """Menu item that runs this plugin again with an action for one project."""
    return f"bash={q(SELF)} param1={name} param2={q(root)} terminal=false refresh=true"


def folder_items(root):
    return [f"--{t('folder')} | bash=/usr/bin/open param1={q(root)} terminal=false sfimage=folder",
            f"--{t('terminal')} | bash=/usr/bin/open param1=-a param2=Terminal param3={q(root)} terminal=false sfimage=terminal"]


def status_items(p):
    """Busy / failed lines under a project; True when an action is running (hide the other actions)."""
    log = os.path.join(p["root"], ".data", "logs", "tray.log") if p.get('root') else None
    if p.get('busy'):
        return [f"--{t('busy_' + p['busy'])} | color=gray sfimage=hourglass"] + (
            [f"--{t('log')} | bash=/usr/bin/open param1={q(log)} terminal=false sfimage=doc.text"] if log else []), True
    if p.get('error') and log:
        return [f"--{t('last_failed')} | color=red sfimage=exclamationmark.triangle",
                f"--{t('log')} | bash=/usr/bin/open param1={q(log)} terminal=false sfimage=doc.text", "-----"], False
    return [], False


def title_line(p, image, color, extra=""):
    label = f"{esc(p['name'])}  :{p['port']}"
    if p.get('busy'):
        return f"{label}  · {t('busy_' + p['busy'])} | sfimage=hourglass sfcolor=orange{extra}"
    return f"{label} | sfimage={image} sfcolor={color}{extra}"


def render(items):
    lines = []
    stopped = [p for p in items if p["state"] == "stopped"]
    items = [p for p in items if p["state"] != "stopped"]
    running = [p for p in items if p["state"] == "up"]
    states = [health(p["procs"]) for p in running]
    icon_color = "red" if "red" in states else "orange" if "orange" in states or len(running) < len(items) \
        or any(p.get('busy') for p in items + stopped) else None
    title = f"{len(running)}" if running else ""
    lines.append(f"{title} | sfimage=square.stack.3d.up{'.fill' if running else ''}" + (f" sfcolor={icon_color}" if icon_color else ""))
    lines.append("---")
    if not items:
        lines.append(f"{t('none')} | color=gray")
    else:
        lines.append(f"{t('running', n=len(running))} | color=gray size=12")
    for p in items:
        lines.append("---")
        panel = f"http://panel.localhost:{p['port']}"
        try:
            config = read_json(os.path.join(p['root'], '.data/panel/project.json')) or {}
            panel = config.get('urls', {}).get('panel', panel)
        except (OSError, ValueError, KeyError, TypeError):
            pass
        if p["state"] != "up":
            lines.append(f"{esc(p['name'])}  :{p['port']} | sfimage=exclamationmark.triangle sfcolor=orange refresh=true")
            lines.append(f"--{t(p['state'])} | color=gray")
            if p["state"] == "stale":
                lines.append(f"--{t('forget')} | bash=/bin/rm param1=-f param2={q(p['sock'])} terminal=false refresh=true sfimage=trash")
            continue
        lines.append(title_line(p, "circle.fill", health(p["procs"]), f" href={panel}"))
        extra, working = status_items(p)
        lines.extend(extra)
        lines.append(f"--{t('panel')} | href={panel} sfimage=rectangle.grid.2x2")
        for app in p["apps"]:
            if app.get('enabled', True) and app.get('url'):
                lines.append(f"--{esc(app.get('name', app.get('id')))} | href={app['url']} sfimage=arrow.up.right.square")
        lines.append("-----")
        lines.append(f"--{t('processes')} | color=gray size=12")
        for proc in sorted(p["procs"], key=lambda x: x.get('name', "")):
            mark = "checkmark.circle" if proc_ok(proc) else "xmark.circle"
            lines.append(f"--{esc(proc.get('name'))}  {esc(proc.get('status'))} | sfimage={mark} sfcolor={'green' if mark.startswith('check') else 'red'} size=12")
        if p["root"]:
            lines.append("-----")
            lines.extend(folder_items(p["root"]))
            if p.get('mise') and not working:
                name = esc(p["name"])
                lines.append(f"--{t('restart')} | sfimage=arrow.clockwise.circle")
                lines.append(f"----{t('restart_confirm', name=name)} | {action('restart', p['root'])} sfimage=arrow.clockwise")
                lines.append(f"--{t('stop')} | sfimage=stop.circle")
                lines.append(f"----{t('stop_confirm', name=name)} | {action('stop', p['root'])} sfimage=stop.fill sfcolor=red")
    if stopped:
        lines.append("---")
        lines.append(f"{t('stopped')} | color=gray size=12")
        for p in stopped:
            lines.append(title_line(p, "circle", "gray", " refresh=true"))  # SwiftBar disables rows without an action
            extra, working = status_items(p)
            lines.extend(extra)
            if not working:
                lines.append(f"--{t('start')} | {action('start', p['root'])} sfimage=play.fill sfcolor=green")
            lines.extend(folder_items(p["root"]))
            if not working:
                lines.append("-----")
                lines.append(f"--{t('forget')} | {action('forget', p['root'])} sfimage=trash")
    lines.append("---")
    lines.append(f"{t('refresh')} | refresh=true sfimage=arrow.clockwise")
    return "\n".join(lines)


def run_action(name, root):
    """start | stop | restart | forget one cached project. mise runs with the PATH the stack had,
    so processes started from the menu find the same tools as when started from a terminal.
    register (from `mise run tray:install`) caches a project with the caller's PATH."""
    root = os.path.realpath(root)
    tasks = {"start": ["up"], "stop": ["down"], "restart": ["down", "up"]}.get(name)
    with cache_edit() as cache:
        if name == "register" and is_project(root) and mise_path(os.environ.get('PATH', "")):
            info = read_json(os.path.join(root, ".data/panel/project.json")) or {}
            cache[root] = dict(cache.get(root, {}), name=info.get('name') or os.path.basename(root),
                               port=os.environ.get('FYSO_HTTP_PORT', ""), mise=mise_path(os.environ.get('PATH', "")),
                               path=os.environ.get('PATH', ""))
            return 0
        entry = dict(cache.get(root) or {})
        if not entry or not is_project(root):
            return 1
        if name == "forget":
            del cache[root]
            return 0
        if not tasks or not os.access(entry.get('mise', ""), os.X_OK):
            return 1
        if busy(entry):
            return 0  # double click: the first action is still running
        cache[root].update(busy=name, since=time.time(), error=None)
    refresh()
    env = dict(os.environ, PATH=entry.get('path') or os.environ.get('PATH', ""))
    logs = os.path.join(root, ".data", "logs")
    os.makedirs(logs, exist_ok=True)
    code, failed = 0, None
    with open(os.path.join(logs, "tray.log"), "a") as log:
        for task in tasks:
            log.write(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] $ mise run {task}\n")
            log.flush()
            code = subprocess.run([entry["mise"], "-C", root, "run", task], cwd=root, env=env,
                                  stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT).returncode
            if code:
                failed = task
                break
        log.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {name}: exit {code}\n")
    with cache_edit() as cache:
        if root in cache:
            cache[root].update(busy=None, since=0, error=failed)
    refresh()
    who = entry.get('name') or os.path.basename(root)
    notify(t('failed', name=who, task=failed) if failed else t('done_' + name, name=who))
    return code


def refresh():
    """Let SwiftBar show the new state now, not at the next 10 s refresh."""
    if not QUIET:
        subprocess.run(["/usr/bin/open", "-g", "swiftbar://refreshallplugins"], timeout=5)


def notify(text):
    if not QUIET:
        subprocess.run(["/usr/bin/osascript", "-e", "on run argv", "-e", 'display notification (item 1 of argv) with title "Fyso"',
                        "-e", "end run", text], timeout=5)


if __name__ == "__main__":
    if len(sys.argv) == 3:
        sys.exit(run_action(sys.argv[1], sys.argv[2]))
    print(render(projects()))
