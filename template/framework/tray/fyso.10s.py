#!/usr/bin/python3
# <swiftbar.title>Fyso projects</swiftbar.title>
# <swiftbar.desc>Fyso Agentic Framework projects running on this Mac: health, links, stop.</swiftbar.desc>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
# <swiftbar.hideSwiftBar>true</swiftbar.hideSwiftBar>
"""SwiftBar plugin (D34): one menu for every Fyso project running on this machine.

Discovery needs no registry: each running stack owns a process-compose socket
/tmp/fyso-<slug>-<port>.sock (framework/scripts/lib.sh). Process states come from
that socket, the project folder from the process-compose working directory, and
names and app links from the project's .data/panel/*.json. Standard library only;
SwiftBar runs plugins with a minimal PATH. Refreshes every 10 s (file name).
"""
import glob
import http.client
import json
import os
import re
import shutil
import socket
import subprocess

SOCKETS = os.environ.get("FYSO_TRAY_SOCKETS", "/tmp/fyso-*.sock")

TEXT = {
    "es": {"none": "No hay proyectos Fyso corriendo", "running": "{n} proyecto(s) corriendo", "panel": "Panel",
           "processes": "Procesos", "folder": "Abrir carpeta", "terminal": "Abrir terminal aquí",
           "stop": "Detener…", "stop_confirm": "Detener {name} (mise run down)", "no_answer": "no responde",
           "stale": "socket huérfano (el stack se cerró mal)", "forget": "Quitar del menú", "refresh": "Actualizar"},
    "en": {"none": "No Fyso projects running", "running": "{n} project(s) running", "panel": "Panel",
           "processes": "Processes", "folder": "Open folder", "terminal": "Open terminal here",
           "stop": "Stop…", "stop_confirm": "Stop {name} (mise run down)", "no_answer": "not answering",
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


def project_root(sock):
    """(root, pid) of the process that listens on the socket: process-compose starts in the project root."""
    try:
        pids = subprocess.run(["/usr/sbin/lsof", "-t", sock], capture_output=True, text=True, timeout=3).stdout.split()
        for pid in pids:
            out = subprocess.run(["/usr/sbin/lsof", "-a", "-p", pid, "-d", "cwd", "-Fn"], capture_output=True, text=True, timeout=3).stdout
            for line in out.splitlines():
                if line.startswith("n") and os.path.isfile(os.path.join(line[1:], ".copier-answers.yml")):
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


def mise_path(pid):
    """mise binary for "Stop". SwiftBar's PATH is minimal, but process-compose was started by
    `mise run up`, so its own PATH (readable for our own processes) holds the user's mise."""
    path = ""
    try:
        env = subprocess.run(["/bin/ps", "eww", "-o", "command=", "-p", str(pid)], capture_output=True, text=True, timeout=2).stdout
        # Environment follows the arguments, space-separated; PATH may itself contain spaces.
        found = re.findall(r" PATH=(.*?)(?= [A-Za-z_][A-Za-z0-9_]*=|$)", env.rstrip("\n"))
        path = found[-1] if found else ""
    except Exception:
        pass
    for candidate in (shutil.which("mise", path=path) if path else None, shutil.which("mise"),
                      os.path.expanduser("~/.local/bin/mise")):
        if candidate and os.access(candidate, os.X_OK):
            return candidate
    return None


def projects():
    found = []
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
        item["root"] = root
        if root:
            item["mise"] = mise_path(pid)
            info = read_json(os.path.join(root, ".data/panel/project.json")) or {}
            item["name"] = info.get("name") or slug
            item["apps"] = read_json(os.path.join(root, ".data/panel/apps.json")) or []
        found.append(item)
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


def render(items):
    lines = []
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
            lines.append(f"--{T['folder']} | bash=/usr/bin/open param1={q(p['root'])} terminal=false sfimage=folder")
            lines.append(f"--{T['terminal']} | bash=/usr/bin/open param1=-a param2=Terminal param3={q(p['root'])} terminal=false sfimage=terminal")
            if p.get("mise"):
                lines.append(f"--{T['stop']} | sfimage=stop.circle")
                lines.append(f"----{T['stop_confirm'].format(name=esc(p['name']))} | bash={q(p['mise'])} param1=-C param2={q(p['root'])} param3=run param4=down terminal=false refresh=true sfimage=stop.fill sfcolor=red")
    lines.append("---")
    lines.append(f"{T['refresh']} | refresh=true sfimage=arrow.clockwise")
    return "\n".join(lines)


if __name__ == "__main__":
    print(render(projects()))
