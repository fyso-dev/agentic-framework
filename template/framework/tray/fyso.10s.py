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
import glob
import http.client
import json
import os
import re
import shutil
import socket
import subprocess
import sys

SOCKETS = os.environ.get("FYSO_TRAY_SOCKETS", "/tmp/fyso-*.sock")
CACHE = os.environ.get("FYSO_TRAY_CACHE", os.path.expanduser("~/Library/Caches/fyso-tray/projects.json"))
SELF = os.path.abspath(__file__)

TEXT = {
    "es": {"none": "No hay proyectos Fyso corriendo", "running": "{n} proyecto(s) corriendo", "panel": "Panel",
           "processes": "Procesos", "folder": "Abrir carpeta", "terminal": "Abrir terminal aquí",
           "stop": "Detener…", "stop_confirm": "Detener {name} (mise run down)",
           "restart": "Reiniciar…", "restart_confirm": "Reiniciar {name} (down + up)",
           "stopped": "Detenidos", "start": "Iniciar", "no_answer": "no responde",
           "stale": "socket huérfano (el stack se cerró mal)", "forget": "Quitar del menú", "refresh": "Actualizar"},
    "en": {"none": "No Fyso projects running", "running": "{n} project(s) running", "panel": "Panel",
           "processes": "Processes", "folder": "Open folder", "terminal": "Open terminal here",
           "stop": "Stop…", "stop_confirm": "Stop {name} (mise run down)",
           "restart": "Restart…", "restart_confirm": "Restart {name} (down + up)",
           "stopped": "Stopped", "start": "Start", "no_answer": "not answering",
           "stale": "stale socket (the stack did not shut down cleanly)", "forget": "Remove from menu", "refresh": "Refresh"},
}


def language():
    if os.environ.get("FYSO_TRAY_LANG") in TEXT:
        return os.environ["FYSO_TRAY_LANG"]
    try:
        out = subprocess.run(["/usr/bin/defaults", "read", "-g", "AppleLanguages"], capture_output=True, text=True, timeout=2).stdout
        first = re.search(r'\(\s*"?([A-Za-z]{2})', out)  # e.g. ( "es-AR", "en-US" )
        return "en" if first and first.group(1).lower() == "en" else "es"
    except Exception:
        return "es"


T = TEXT[language()]


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
        conn.request("GET", "/processes")
        return json.loads(conn.getresponse().read()).get("data") or []
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
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        tmp = CACHE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(cache, f, indent=1, sort_keys=True)
        os.replace(tmp, CACHE)
    except Exception:
        pass


def projects():
    found = []
    cache = load_cache()
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
            item["name"] = info.get("name") or slug
            item["apps"] = read_json(os.path.join(root, ".data/panel/apps.json")) or []
            if item["mise"]:
                cache[root] = {"name": item["name"], "port": port, "mise": item["mise"], "path": path or os.environ.get("PATH", "")}
        found.append(item)
    live = {p["root"] for p in found if p["root"]}
    cache = {root: c for root, c in cache.items() if is_project(root)}  # folders deleted since
    save_cache(cache)
    for root, c in sorted(cache.items(), key=lambda rc: rc[1].get("name", "")):
        if root not in live:
            found.append({"state": "stopped", "root": root, "name": c.get("name") or os.path.basename(root), "port": c.get("port", "")})
    return found


def proc_ok(proc):
    status = proc.get("status")
    if status == "Running":
        return proc.get("is_ready") == "Ready" or not proc.get("has_ready_probe", proc.get("is_ready") == "Ready")
    return status == "Disabled" or (status == "Completed" and proc.get("exit_code", 0) == 0)


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
    return [f"--{T['folder']} | bash=/usr/bin/open param1={q(root)} terminal=false sfimage=folder",
            f"--{T['terminal']} | bash=/usr/bin/open param1=-a param2=Terminal param3={q(root)} terminal=false sfimage=terminal"]


def render(items):
    lines = []
    stopped = [p for p in items if p["state"] == "stopped"]
    items = [p for p in items if p["state"] != "stopped"]
    running = [p for p in items if p["state"] == "up"]
    states = [health(p["procs"]) for p in running]
    icon_color = "red" if "red" in states else "orange" if "orange" in states or len(running) < len(items) else None
    title = f"{len(running)}" if running else ""
    lines.append(f"{title} | sfimage=square.stack.3d.up{'.fill' if running else ''}" + (f" sfcolor={icon_color}" if icon_color else ""))
    lines.append("---")
    if not items:
        lines.append(f"{T['none']} | color=gray")
    else:
        lines.append(f"{T['running'].format(n=len(running))} | color=gray size=12")
    for p in items:
        lines.append("---")
        panel = f"http://panel.localhost:{p['port']}"
        if p["state"] != "up":
            lines.append(f"{esc(p['name'])}  :{p['port']} | sfimage=exclamationmark.triangle sfcolor=orange")
            lines.append(f"--{T[p['state']]} | color=gray")
            if p["state"] == "stale":
                lines.append(f"--{T['forget']} | bash=/bin/rm param1=-f param2={q(p['sock'])} terminal=false refresh=true sfimage=trash")
            continue
        color = health(p["procs"])
        lines.append(f"{esc(p['name'])}  :{p['port']} | href={panel} sfimage=circle.fill sfcolor={color}")
        lines.append(f"--{T['panel']} | href={panel} sfimage=rectangle.grid.2x2")
        for app in p["apps"]:
            if app.get("enabled", True) and app.get("url"):
                lines.append(f"--{esc(app.get('name', app.get('id')))} | href={app['url']} sfimage=arrow.up.right.square")
        lines.append("-----")
        lines.append(f"--{T['processes']} | color=gray size=12")
        for proc in sorted(p["procs"], key=lambda x: x.get("name", "")):
            mark = "checkmark.circle" if proc_ok(proc) else "xmark.circle"
            lines.append(f"--{esc(proc.get('name'))}  {esc(proc.get('status'))} | sfimage={mark} sfcolor={'green' if mark.startswith('check') else 'red'} size=12")
        if p["root"]:
            lines.append("-----")
            lines.extend(folder_items(p["root"]))
            if p.get("mise"):
                name = esc(p["name"])
                lines.append(f"--{T['restart']} | sfimage=arrow.clockwise.circle")
                lines.append(f"----{T['restart_confirm'].format(name=name)} | {action('restart', p['root'])} sfimage=arrow.clockwise")
                lines.append(f"--{T['stop']} | sfimage=stop.circle")
                lines.append(f"----{T['stop_confirm'].format(name=name)} | {action('stop', p['root'])} sfimage=stop.fill sfcolor=red")
    if stopped:
        lines.append("---")
        lines.append(f"{T['stopped']} | color=gray size=12")
        for p in stopped:
            lines.append(f"{esc(p['name'])}  :{p['port']} | sfimage=circle sfcolor=gray")
            lines.append(f"--{T['start']} | {action('start', p['root'])} sfimage=play.fill sfcolor=green")
            lines.extend(folder_items(p["root"]))
            lines.append("-----")
            lines.append(f"--{T['forget']} | {action('forget', p['root'])} sfimage=trash")
    lines.append("---")
    lines.append(f"{T['refresh']} | refresh=true sfimage=arrow.clockwise")
    return "\n".join(lines)


def run_action(name, root):
    """start | stop | restart | forget one cached project. mise runs with the PATH the stack had,
    so processes started from the menu find the same tools as when started from a terminal.
    register (from `mise run tray:install`) caches a project with the caller's PATH."""
    cache = load_cache()
    root = os.path.realpath(root)
    if name == "register" and is_project(root) and mise_path(os.environ.get("PATH", "")):
        info = read_json(os.path.join(root, ".data/panel/project.json")) or {}
        cache[root] = {"name": info.get("name") or os.path.basename(root), "port": os.environ.get("FYSO_HTTP_PORT", ""),
                       "mise": mise_path(os.environ.get("PATH", "")), "path": os.environ.get("PATH", "")}
        save_cache(cache)
        return 0
    entry = cache.get(root)
    if not entry or not is_project(root):
        return 1
    if name == "forget":
        cache.pop(root)
        save_cache(cache)
        return 0
    tasks = {"start": ["up"], "stop": ["down"], "restart": ["down", "up"]}.get(name)
    if not tasks or not os.access(entry.get("mise", ""), os.X_OK):
        return 1
    env = dict(os.environ, PATH=entry.get("path") or os.environ.get("PATH", ""))
    logs = os.path.join(root, ".data", "logs")
    os.makedirs(logs, exist_ok=True)
    with open(os.path.join(logs, "tray.log"), "a") as log:
        for task in tasks:
            log.write(f"$ mise run {task}\n")
            log.flush()
            code = subprocess.run([entry["mise"], "-C", root, "run", task], cwd=root, env=env,
                                  stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT).returncode
            if code:
                return code
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 3:
        sys.exit(run_action(sys.argv[1], sys.argv[2]))
    print(render(projects()))
