"""Menu bar plugin (D34) against a fake process-compose served on a Unix socket."""
import json
import os
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, "template", "framework", "tray", "fyso.10s.py")

# Answers GET /processes with the JSON in argv[2]; started with cwd = a fake project root.
FAKE_PC = r"""
import http.server, socketserver, sys
body = sys.argv[2].encode()
class H(http.server.BaseHTTPRequestHandler):
    def address_string(self):
        return "unix"
    def do_GET(self):
        self.send_response(200 if self.path == "/processes" else 404)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args):
        pass
socketserver.UnixStreamServer(sys.argv[1], H).serve_forever()
"""


def proc(name, status="Running", ready="Ready", probe=True):
    return {"name": name, "status": status, "is_ready": ready, "has_ready_probe": probe, "exit_code": 0}


@unittest.skipUnless(sys.platform == "darwin" and shutil.which("lsof"), "macOS plugin (lsof)")
class TrayPluginTests(unittest.TestCase):
    def setUp(self):
        # Short directory: Unix socket paths are limited to ~104 characters on macOS.
        self.socks = tempfile.mkdtemp(prefix="ft", dir="/tmp")
        self.work = tempfile.mkdtemp(prefix="fyso tray ")  # a space, like "Mis proyectos"
        self.bin = os.path.join(self.work, "bin")
        os.makedirs(self.bin)
        mise = os.path.join(self.bin, "mise")
        with open(mise, "w") as f:
            f.write("#!/bin/sh\nexit 0\n")
        os.chmod(mise, os.stat(mise).st_mode | stat.S_IEXEC)
        self.servers = []

    def tearDown(self):
        for server in self.servers:
            server.kill()
            server.wait()
        shutil.rmtree(self.socks, ignore_errors=True)
        shutil.rmtree(self.work, ignore_errors=True)

    def project(self, slug, port, name, procs, apps=()):
        root = os.path.join(self.work, slug)
        os.makedirs(os.path.join(root, ".data", "panel"))
        open(os.path.join(root, ".copier-answers.yml"), "w").close()
        with open(os.path.join(root, ".data", "panel", "project.json"), "w") as f:
            json.dump({"name": name}, f)
        with open(os.path.join(root, ".data", "panel", "apps.json"), "w") as f:
            json.dump(list(apps), f)
        sock = os.path.join(self.socks, f"fyso-{slug}-{port}.sock")
        env = {"PATH": self.bin + os.pathsep + "/usr/bin:/bin", "HOME": os.environ.get("HOME", "")}
        server = subprocess.Popen([sys.executable, "-c", FAKE_PC, sock, json.dumps({"data": procs})], cwd=root, env=env)
        self.servers.append(server)
        for _ in range(100):
            try:
                with socket.socket(socket.AF_UNIX) as probe:
                    probe.connect(sock)
                break
            except OSError:
                time.sleep(0.05)
        else:
            self.fail("fake process-compose did not start")
        return os.path.realpath(root)

    def stale(self, slug, port):
        sock = socket.socket(socket.AF_UNIX)
        sock.bind(os.path.join(self.socks, f"fyso-{slug}-{port}.sock"))
        sock.close()  # the file stays, nobody listens: a crashed stack

    def run_plugin(self):
        env = {"PATH": "/usr/bin:/bin", "HOME": os.environ.get("HOME", ""),
               "FYSO_TRAY_SOCKETS": os.path.join(self.socks, "fyso-*.sock"), "FYSO_TRAY_LANG": "en"}
        out = subprocess.run([sys.executable, PLUGIN], capture_output=True, text=True, env=env, timeout=30)
        self.assertEqual(out.returncode, 0, out.stderr)
        return out.stdout.splitlines()

    def test_none_running(self):
        lines = self.run_plugin()
        self.assertEqual(lines[0], " | sfimage=square.stack.3d.up")
        self.assertIn("No Fyso projects running | color=gray", lines)

    def test_healthy_project(self):
        root = self.project("alpha", 18400, "Alpha", [proc("caddy"), proc("dagu"), proc("init", "Completed", "-", False)],
                            apps=[{"id": "dagu", "name": "Dagu", "url": "http://dagu.localhost:18400"},
                                  {"id": "off", "name": "Off", "url": "http://off.localhost:18400", "enabled": False}])
        lines = self.run_plugin()
        self.assertEqual(lines[0], "1 | sfimage=square.stack.3d.up.fill")
        self.assertIn("Alpha  :18400 | href=http://panel.localhost:18400 sfimage=circle.fill sfcolor=green", lines)
        self.assertIn("--Dagu | href=http://dagu.localhost:18400 sfimage=arrow.up.right.square", lines)
        self.assertFalse([l for l in lines if l.startswith("--Off")])
        self.assertIn(f'--Open folder | bash=/usr/bin/open param1="{root}" terminal=false sfimage=folder', lines)
        stop = [l for l in lines if l.startswith("----Stop Alpha")]
        self.assertEqual(len(stop), 1)
        # mise comes from the PATH of the running process-compose, not from SwiftBar's minimal PATH.
        self.assertIn(f'bash="{os.path.join(self.bin, "mise")}" param1=-C param2="{root}" param3=run param4=down', stop[0])

    def test_degraded_project(self):
        self.project("beta", 18500, "Beta", [proc("caddy"), proc("omb", ready="Not Ready")])
        lines = self.run_plugin()
        self.assertEqual(lines[0], "1 | sfimage=square.stack.3d.up.fill sfcolor=orange")
        self.assertIn("Beta  :18500 | href=http://panel.localhost:18500 sfimage=circle.fill sfcolor=orange", lines)
        self.assertIn("--omb  Running | sfimage=xmark.circle sfcolor=red size=12", lines)

    def test_stale_socket_next_to_running_project(self):
        self.project("alpha", 18400, "Alpha", [proc("caddy")])
        self.stale("gone", 18600)
        lines = self.run_plugin()
        self.assertEqual(lines[0], "1 | sfimage=square.stack.3d.up.fill sfcolor=orange")
        self.assertIn("gone  :18600 | sfimage=exclamationmark.triangle sfcolor=orange", lines)
        self.assertIn("--stale socket (the stack did not shut down cleanly) | color=gray", lines)
        self.assertTrue([l for l in lines if l.startswith("--Remove from menu | bash=/bin/rm param1=-f")])


if __name__ == "__main__":
    unittest.main()
