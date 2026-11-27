"""Project distributions (D56): publish → add → local changes → publish v2 → update.

Real git, Copier 9.19.1 (uvx), SOPS and age; no running stack (the client has never
started, so `up` would restore bots and memory from git).
Run: python3 -m unittest tests.test_distribution -v
"""
import base64
import hashlib
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ["aqua:getsops/sops@3.13.3", "aqua:FiloSottile/age@1.3.2", "npm:yaml@2.8.1", "aqua:gitleaks/gitleaks@8.30.1"]
IDENTITY = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
            "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com"}


def mise(*command, cwd, env=None, check=True):
    result = subprocess.run(["mise", "exec", *TOOLS, "--", *command], cwd=cwd, env=env,
                            capture_output=True, text=True)
    if check and result.returncode:
        raise AssertionError(f"{command} failed:\n{result.stdout}\n{result.stderr}")
    return result


def write(root, rel, text):
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


class FakeBiz:
    """The three Biz endpoints dist.cjs talks to (setup GET/PUT, recipients), over real HTTP."""
    TOKEN = "fixture-access-token"

    def __init__(self):
        self.setup = None            # dict(version, body, sha256, manifest)
        self.recipients = []
        self.deny = False
        self.requests = []
        biz = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def reply(self, status, body=b"", headers=None):
                self.send_response(status)
                for key, value in (headers or {}).items():
                    self.send_header(key, value)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def error(self, status, **payload):
                self.reply(status, json.dumps(payload).encode(), {"Content-Type": "application/json"})

            def handle_any(self, method):
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length) if length else b""
                biz.requests.append((method, self.path, dict(self.headers)))
                if self.headers.get("Authorization") != f"Bearer {FakeBiz.TOKEN}":
                    return self.error(401, error="unauthorized")
                route = self.path.removeprefix("/oauth/framework-access")
                if biz.deny and route == "/setup" and method == "GET":
                    return self.error(403, error="access_denied")
                if method == "GET" and route == "/recipients":
                    people = [{"person_id": str(i), "age_public_key": key, "registered_at": "2026-11-27T00:00:00Z"}
                              for i, key in enumerate(biz.recipients)]
                    return self.reply(200, json.dumps({"recipients": people, "etag": "r"}).encode(), {"Content-Type": "application/json"})
                if method == "GET" and route == "/setup":
                    if not biz.setup:
                        return self.error(404, error="no_setup")
                    s = biz.setup
                    return self.reply(200, s["body"], {"Content-Type": "application/octet-stream", "ETag": '"e"',
                                                       "X-Setup-Version": s["version"], "X-Setup-Sha256": s["sha256"]})
                if method == "PUT" and route == "/setup":
                    version = self.headers.get("X-Setup-Version", "")
                    current = biz.setup["version"] if biz.setup else "v0"
                    if int(version[1:]) <= int(current[1:]):
                        return self.error(409, error="version_conflict", current=current)
                    if hashlib.sha256(body).hexdigest() != self.headers.get("X-Setup-Sha256"):
                        return self.error(400, error="bad_sha")
                    biz.setup = {"version": version, "body": body, "sha256": self.headers["X-Setup-Sha256"],
                                 "manifest": json.loads(base64.b64decode(self.headers["X-Setup-Manifest"]))}
                    return self.reply(201, json.dumps({"version": version, "etag": "e"}).encode(), {"Content-Type": "application/json"})
                return self.error(404, error="not_found")

            def do_GET(self):
                self.handle_any("GET")

            def do_PUT(self):
                self.handle_any("PUT")

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def stop(self):
        self.server.shutdown()
        self.server.server_close()


@unittest.skipUnless(shutil.which("mise") and shutil.which("uvx"), "needs mise and uvx")
class DistBase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="fyso-dist-"))
        self.repo = self.tmp / "dist.git"
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(self.repo)], check=True)
        self.publisher = self.project("publisher")
        self.client = self.project("client")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def project(self, name):
        root = self.tmp / name
        port_base = {"publisher": "29820", "client": "29800"}[name]
        shutil.copytree(ROOT / "template/framework/scripts", root / "framework/scripts")
        write(root, ".gitignore", ".data/\n")
        key = self.tmp / f"{name}.age"
        mise("age-keygen", "-o", str(key), cwd=self.tmp)
        public = mise("age-keygen", "-y", str(key), cwd=self.tmp).stdout.strip()
        write(root, ".sops.yaml", f"creation_rules:\n  - path_regex: secrets\\.enc\\.yaml$\n    age: {public}\n")
        env = dict(os.environ, **IDENTITY, FYSO_ROOT=str(root), FYSO_DATA=str(root / ".data"),
                   FYSO_PROJECT=name, FYSO_HTTP_PORT=port_base, SOPS_AGE_KEY_FILE=str(key))
        env.pop("MISE_SOPS_AGE_KEY_FILE", None)
        setattr(self, f"{name}_env", env)
        setattr(self, f"{name}_key", public)
        subprocess.run(["git", "init", "-q", "-b", "main"], cwd=root, check=True)
        return root

    def secrets(self, root, env, values):
        result = subprocess.run(["mise", "exec", *TOOLS, "--", "sops", "encrypt", "--filename-override", "secrets.enc.yaml",
                                 "--input-type", "json", "--output-type", "yaml", "/dev/stdin"],
                                cwd=root, env=env, input=json.dumps(values), capture_output=True, text=True, check=True)
        (root / "secrets.enc.yaml").write_text(result.stdout)

    def decrypt(self, root, env):
        return json.loads(mise("sops", "decrypt", "--output-type", "json", "secrets.enc.yaml", cwd=root, env=env).stdout)

    def commit(self, root, env, message):
        subprocess.run(["git", "add", "-A"], cwd=root, env=env, check=True)
        subprocess.run(["git", "commit", "-q", "-m", message], cwd=root, env=env, check=True)

    def dist(self, root, env, *args):
        return mise(str(root / "framework/scripts/dist.sh"), *args, cwd=root, env=env)

    def tree_state(self, root):
        """Everything observable in a project: git status plus the content of every file (incl. .data)."""
        status = subprocess.run(["git", "status", "--porcelain", "--ignored"], cwd=root, capture_output=True, text=True).stdout
        files = {str(f.relative_to(root)): hashlib.sha256(f.read_bytes()).hexdigest()
                 for f in sorted(root.rglob("*")) if f.is_file() and ".git" not in f.relative_to(root).parts}
        return status, files


class DistributionTests(DistBase):
    def test_local_users_encrypt_from_node(self):
        root, env = self.publisher, self.publisher_env
        self.secrets(root, env, {"FYSO_ADMIN_PASSWORD": "fixture-technical-password"})
        scratch = self.tmp / 'sops-temporary'
        scratch.mkdir()
        env = {**env, 'TMPDIR': str(scratch)}
        runtime = root / '.data/web-auth/runtime'
        runtime.mkdir(parents=True)
        (runtime / 'sessions.db').write_text('fixture session')
        entry = 'admin:$2b$04$' + 'a' * 53
        result = subprocess.run(['mise', 'exec', *TOOLS, '--', 'node',
            'framework/scripts/web-auth-users.cjs', 'init', 'admin'],
            cwd=root, env=env, input=entry, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        saved = self.decrypt(root, env)
        self.assertEqual(saved['FYSO_AUTH_USERS'], entry)
        self.assertEqual(saved['FYSO_ADMIN_PASSWORD'], 'fixture-technical-password')
        self.assertNotIn(entry, result.stdout + result.stderr)
        self.assertEqual((root / 'secrets.enc.yaml').stat().st_mode & 0o777, 0o600)
        self.assertFalse((runtime / 'sessions.db').exists())
        self.assertEqual(list(scratch.iterdir()), [])

    def test_publish_install_update(self):
        p, pe, c, ce = self.publisher, self.publisher_env, self.client, self.client_env
        write(p, "project/bots/team.yaml", "version: 1\nbots:\n  - name: Ventas\n    cwd: ${FYSO_ROOT}\n")
        write(p, "project/bots/extra.md", "to be removed in v2\n")
        write(p, "project/wiki/index.md", "# Cliente\nv1\n")
        write(p, "project/auth/tinyauth.yaml", "users: publisher-only\n")
        write(p, "state/memory/Ventas/MEMORY.md", "- fact one\n")
        write(p, "state/memory/Ventas/memory/log/2026-11-10.md", "user said something private\n")
        write(p, "project/distribution.yaml", f"repo: {self.repo}\nsecrets: [API_KEY]\nrecipients: [{self.client_key}]\n")
        # An installed extension with a port of the publisher's block (29820 + 10).
        write(p, ".copier-answers.ext-wiki.yml", "_src_path: gh:org/fyso-ext-wiki\nextension_port: 29830\n")
        write(p, ".config/mise/conf.d/ext-wiki.toml", '[env]\nFYSO_EXT_WIKI_PORT = "29830"\n')
        write(p, "extensions/wiki/README.md", "wiki\n")
        self.secrets(p, pe, {"FYSO_ADMIN_PASSWORD": "publisher-pass", "API_KEY": "key-1"})
        self.commit(p, pe, "publisher v1")
        out = self.dist(p, pe, "publish").stdout
        self.assertIn("published v1", out)

        self.secrets(c, ce, {"FYSO_ADMIN_PASSWORD": "client-pass"})
        write(c, "project/bots/team.yaml", "version: 1\nbots: []\n")
        # The client's own extension already holds the first port of its block (29800 + 10),
        # and it has an older bot snapshot of its own.
        write(c, ".config/mise/conf.d/ext-own.toml", '[env]\nFYSO_EXT_OWN_PORT = "29810"\n')
        write(c, "state/bots/team.yaml", "version: 1\nbots:\n  - name: Old\n")
        self.commit(c, ce, "client init")
        # An untracked local page at a path the distribution delivers: replaced, but backed up.
        write(c, "project/wiki/index.md", "# Mine, never committed\n")
        self.dist(c, ce, "add", "../dist.git")   # relative: an absolute path would fail check-paths
        import tarfile
        backups = sorted((c / ".data/dist").glob("local-*-untracked.tgz"))
        self.assertEqual(len(backups), 1)
        with tarfile.open(backups[0]) as archive:
            self.assertEqual(archive.extractfile("project/wiki/index.md").read(), b"# Mine, never committed\n")
        self.assertIn('FYSO_EXT_WIKI_PORT = "29811"', (c / ".config/mise/conf.d/ext-wiki.toml").read_text())
        self.assertIn("extension_port: 29811", (c / ".copier-answers.ext-wiki.yml").read_text())
        self.assertIn('"29810"', (c / ".config/mise/conf.d/ext-own.toml").read_text())
        team = mise("node", "framework/scripts/dist.cjs", "team-source", cwd=c, env=ce).stdout.strip()
        self.assertEqual(team, "project/bots/team.yaml", "the delivered team, not the client's old snapshot")
        self.assertEqual((c / "project/wiki/index.md").read_text(), "# Cliente\nv1\n")
        self.assertIn("Ventas", (c / "project/bots/team.yaml").read_text())   # the distribution wins
        self.assertFalse((c / "project/auth/tinyauth.yaml").exists())         # instance login stays home
        self.assertFalse((c / "project/distribution.yaml").exists())
        self.assertEqual((c / "state/memory/Ventas/MEMORY.md").read_text(), "- fact one\n")
        self.assertFalse((c / "state/memory/Ventas/memory/log").exists())    # no conversations
        self.assertEqual(self.decrypt(c, ce), {"FYSO_ADMIN_PASSWORD": "client-pass", "API_KEY": "key-1"})
        self.assertIn("_commit: v1", (c / ".copier-answers.dist.yml").read_text())
        status = subprocess.run(["git", "status", "--porcelain"], cwd=c, capture_output=True, text=True).stdout
        self.assertEqual(status, "", "add commits everything it changed")

        # The client works: its bot learns something and someone edits the wiki locally.
        write(c, "state/memory/Ventas/MEMORY.md", "- fact one\n- client fact\n")
        write(c, "project/wiki/index.md", "# Cliente\nlocal edit\n")
        self.commit(c, ce, "client work")

        # The publisher improves the distribution.
        write(p, "project/wiki/index.md", "# Cliente\nv2\n")
        (p / "project/bots/extra.md").unlink()
        write(p, "state/memory/Ventas/MEMORY.md", "- fact one\n- publisher fact\n")
        self.secrets(p, pe, {"FYSO_ADMIN_PASSWORD": "publisher-pass", "API_KEY": "key-2"})
        self.commit(p, pe, "publisher v2")
        self.assertIn("published v2", self.dist(p, pe, "publish").stdout)
        self.assertIn("no changes", self.dist(p, pe, "publish").stdout)
        self.assertIn("→ mise run dist:update", self.dist(c, ce, "status").stdout)

        out = self.dist(c, ce, "update").stdout
        self.assertIn("memory merged: Ventas", out)
        self.assertEqual((c / "project/wiki/index.md").read_text(), "# Cliente\nv2\n")   # config: upstream wins
        self.assertFalse((c / "project/bots/extra.md").exists())                       # removed upstream
        memory = (c / "state/memory/Ventas/MEMORY.md").read_text()
        for line in ("- fact one", "- client fact", "- publisher fact"):
            self.assertIn(line, memory)
        self.assertEqual(self.decrypt(c, ce)["API_KEY"], "key-2")
        self.assertEqual(self.decrypt(c, ce)["FYSO_ADMIN_PASSWORD"], "client-pass")
        self.assertIn("_commit: v2", (c / ".copier-answers.dist.yml").read_text())
        log = subprocess.run(["git", "log", "--format=%s", "-1"], cwd=c, capture_output=True, text=True).stdout
        self.assertEqual(log.strip(), "dist: v2")
        # The client's port allocation survives updates (the delivered file says 29830 again).
        self.assertIn('FYSO_EXT_WIKI_PORT = "29811"', (c / ".config/mise/conf.d/ext-wiki.toml").read_text())

        # Updating again changes nothing: the client's merged memory is kept.
        self.assertIn("already at v2", self.dist(c, ce, "update").stdout)
        self.assertEqual((c / "state/memory/Ventas/MEMORY.md").read_text(), memory)

    def test_client_credentials_are_never_committed(self):
        p, pe, c, ce = self.publisher, self.publisher_env, self.client, self.client_env
        write(p, "project/wiki/index.md", "x\n")
        write(p, "project/distribution.yaml", f"repo: {self.repo}\n")
        self.commit(p, pe, "init")
        self.dist(p, pe, "publish")
        self.secrets(c, ce, {"FYSO_ADMIN_PASSWORD": "client-pass"})
        self.commit(c, ce, "client init")
        # A client-only file with a plaintext token, never seen by the publisher's scan.
        token = "ghp_" + "Z3kQ9mVt7RbX2pLw8NcY5hJd4FsA6uEo1TiG"
        write(c, "project/apps/svc/config.env", f"GITHUB_TOKEN={token}\n")
        result = mise(str(c / "framework/scripts/dist.sh"), "add", "../dist.git", cwd=c, env=ce, check=False)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("nothing was committed", result.stderr)
        log = subprocess.run(["git", "log", "--format=%s"], cwd=c, capture_output=True, text=True).stdout
        self.assertEqual(log.strip(), "client init")
        staged = subprocess.run(["git", "diff", "--cached", "--name-only"], cwd=c, capture_output=True, text=True).stdout
        self.assertEqual(staged, "")

    def test_private_secrets_are_never_sent(self):
        p, pe = self.publisher, self.publisher_env
        write(p, "project/wiki/index.md", "x\n")
        write(p, "project/distribution.yaml", f"repo: {self.repo}\nsecrets: [FYSO_ADMIN_PASSWORD]\nrecipients: [{self.client_key}]\n")
        self.commit(p, pe, "init")
        result = mise(str(p / "framework/scripts/dist.sh"), "publish", cwd=p, env=pe, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("never sent", result.stderr)


    def test_plan_git_transport_is_read_only_and_accurate(self):
        p, pe, c, ce = self.publisher, self.publisher_env, self.client, self.client_env
        write(p, "project/wiki/index.md", "v1\n")
        write(p, "project/bots/team.yaml", "version: 1\nbots:\n  - name: Ventas\n")
        write(p, "project/distribution.yaml", f"repo: {self.repo}\n")
        self.commit(p, pe, "v1")
        self.dist(p, pe, "publish")
        self.secrets(c, ce, {"FYSO_ADMIN_PASSWORD": "x"})
        write(c, "project/wiki/index.md", "mine\n")
        self.commit(c, ce, "client")
        before = self.tree_state(c)
        plan = json.loads(self.dist(c, ce, "plan", "../dist.git", "--json").stdout)
        self.assertEqual(self.tree_state(c), before)
        self.assertEqual((plan["mode"], plan["transport"], plan["version"], plan["current"]), ("add", "git", "v1", None))
        self.assertEqual(plan["files"]["replaced"], [{"path": "project/wiki/index.md", "local_edits": ["committed"]}])
        self.assertIn("project/bots/team.yaml", plan["files"]["added"])
        self.assertEqual(plan["bots"]["added"], ["Ventas"])
        self.assertIn("LOCAL EDITS LOST", self.dist(c, ce, "plan", "../dist.git").stdout)
        self.dist(c, ce, "add", "../dist.git")
        # After install nothing is replaced until the publisher changes something.
        plan = json.loads(self.dist(c, ce, "plan", "--json").stdout)
        self.assertEqual((plan["mode"], plan["up_to_date"], plan["files"]["replaced"]), ("update", True, []))


class BizDistributionTests(DistBase):
    def setUp(self):
        super().setUp()
        self.biz = FakeBiz()
        self.addCleanup(self.biz.stop)
        for env in (self.publisher_env, self.client_env):
            env.update(FYSO_DIST_BIZ_URL=self.biz.url, FYSO_DIST_BIZ_TOKEN_CMD=f"echo {FakeBiz.TOKEN}")
        self.tokens = []

    def run_dist(self, root, env, *args, check=True):
        result = mise(str(root / "framework/scripts/dist.sh"), *args, cwd=root, env=env, check=check)
        self.tokens.append(result.stdout + result.stderr)
        return result

    def test_publish_add_republish_for_new_recipient_update_and_plan(self):
        p, pe, c, ce = self.publisher, self.publisher_env, self.client, self.client_env
        write(p, "project/bots/team.yaml", "version: 1\nbots:\n  - name: Ventas\n")
        write(p, "project/bots/extra.md", "removed in v2\n")
        write(p, "project/wiki/index.md", "# v1\n")
        write(p, "project/wiki/guide.md", "guide v1\n")
        write(p, "project/mcp.json", json.dumps({"mcpServers": {"docs": {"url": "http://x"}}}))
        write(p, ".copier-answers.ext-wiki.yml", "_src_path: gh:org/fyso-ext-wiki\nextension_port: 29830\n")
        write(p, "extensions/wiki/README.md", "wiki\n")
        write(p, "project/distribution.yaml", "repo: biz\nsecrets: [API_KEY]\n")
        self.secrets(p, pe, {"FYSO_ADMIN_PASSWORD": "pp", "API_KEY": "key-1"})
        self.commit(p, pe, "publisher v1")

        # Nobody registered a key yet: a clear error, nothing uploaded.
        result = self.run_dist(p, pe, "publish", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("nobody has registered", result.stderr)
        self.assertIsNone(self.biz.setup)

        self.biz.recipients = [self.client_key]
        self.assertIn("published v1", self.run_dist(p, pe, "publish").stdout)
        sent = self.biz.setup
        self.assertEqual(sent["version"], "v1")
        self.assertEqual(sent["manifest"]["bots"], ["Ventas"])
        self.assertEqual(sent["manifest"]["extensions"], ["wiki"])
        self.assertEqual(sent["manifest"]["mcp_servers"], ["docs"])
        self.assertEqual(sent["manifest"]["secrets"], ["API_KEY"])
        self.assertEqual(sorted(sent["manifest"]), ["bots", "extensions", "files_count", "framework", "mcp_servers", "secrets"])
        self.assertGreater(sent["manifest"]["files_count"], 5)
        self.assertNotIn(b"key-1", sent["body"])
        self.assertIn("no changes", self.run_dist(p, pe, "publish").stdout)

        # Client: plan (read-only), add.
        self.secrets(c, ce, {"FYSO_ADMIN_PASSWORD": "cp"})
        write(c, "project/wiki/guide.md", "client edit\n")
        self.commit(c, ce, "client init")
        before = self.tree_state(c)
        plan = json.loads(self.run_dist(c, ce, "plan", "--json").stdout)
        self.assertEqual(self.tree_state(c), before, "dist:plan must not change anything")
        self.assertEqual((plan["mode"], plan["transport"], plan["version"]), ("add", "biz", "v1"))
        self.assertEqual(plan["files"]["replaced"], [{"path": "project/wiki/guide.md", "local_edits": ["committed"]}])
        self.assertEqual(plan["secrets"], {"names": ["API_KEY"], "decryptable": True})
        self.assertEqual(plan["extensions"]["added"], ["wiki"])
        self.assertEqual(plan["bots"]["added"], ["Ventas"])
        self.assertEqual(plan["mcp_servers"]["added"], ["docs"])
        self.run_dist(c, ce, "add", "biz")
        answers = (c / ".copier-answers.dist.yml").read_text()
        self.assertIn("_src_path: .data/dist/biz-source", answers)
        self.assertNotIn(str(self.tmp), answers)
        self.assertIn("_commit: v1", answers)
        self.assertEqual((c / "project/wiki/index.md").read_text(), "# v1\n")
        self.assertEqual(self.decrypt(c, ce)["API_KEY"], "key-1")
        self.assertIn("Biz (managed setup)", self.run_dist(c, ce, "status").stdout)

        # v2: files change AND a second person registers a key.
        key2 = self.tmp / "second.age"
        mise("age-keygen", "-o", str(key2), cwd=self.tmp)
        public2 = mise("age-keygen", "-y", str(key2), cwd=self.tmp).stdout.strip()
        self.biz.recipients = [self.client_key, public2]
        write(p, "project/wiki/index.md", "# v2\n")
        write(p, "project/wiki/new.md", "new\n")
        (p / "project/bots/extra.md").unlink()
        write(p, "project/bots/team.yaml", "version: 1\nbots:\n  - name: Ventas\n  - name: Soporte\n")
        self.secrets(p, pe, {"FYSO_ADMIN_PASSWORD": "pp", "API_KEY": "key-2"})
        self.commit(p, pe, "publisher v2")
        self.assertIn("published v2", self.run_dist(p, pe, "publish").stdout)
        self.assertIn("Latest:       v2  → mise run dist:update", self.run_dist(c, ce, "status").stdout)

        # The client edits locally: one committed, one uncommitted.
        write(c, "project/wiki/guide.md", "client edit 2\n")
        self.commit(c, ce, "client edit")
        write(c, "project/wiki/index.md", "# uncommitted\n")
        before = self.tree_state(c)
        plan = json.loads(self.run_dist(c, ce, "plan", "--json").stdout)
        self.assertEqual(self.tree_state(c), before, "dist:plan must not change anything")
        self.assertEqual((plan["mode"], plan["current"], plan["version"], plan["up_to_date"]), ("update", "v1", "v2", False))
        self.assertEqual(plan["files"]["added"], ["project/wiki/new.md"])
        self.assertEqual(plan["files"]["removed"], ["project/bots/extra.md"])
        self.assertEqual(plan["files"]["replaced"], [
            {"path": "project/bots/team.yaml", "local_edits": []},
            {"path": "project/wiki/guide.md", "local_edits": ["committed"]},
            {"path": "project/wiki/index.md", "local_edits": ["uncommitted"]}])
        self.assertEqual(plan["secrets"]["names"], ["API_KEY"])
        self.assertEqual(plan["bots"]["added"], ["Soporte"])
        self.assertEqual(plan["extensions"], {"added": [], "removed": []})

        self.run_dist(c, ce, "update")
        self.assertEqual((c / "project/wiki/index.md").read_text(), "# v2\n")
        self.assertFalse((c / "project/bots/extra.md").exists())
        self.assertEqual(self.decrypt(c, ce)["API_KEY"], "key-2")
        self.assertIn("_commit: v2", (c / ".copier-answers.dist.yml").read_text())
        self.assertIn("_src_path: .data/dist/biz-source", (c / ".copier-answers.dist.yml").read_text())

        # Recipients changed, files did not: re-encrypted and published as v3.
        key3 = self.tmp / "third.age"
        mise("age-keygen", "-o", str(key3), cwd=self.tmp)
        self.biz.recipients.append(mise("age-keygen", "-y", str(key3), cwd=self.tmp).stdout.strip())
        self.assertIn("published v3", self.run_dist(p, pe, "publish").stdout)
        self.assertIn("no changes", self.run_dist(p, pe, "publish").stdout)
        self.run_dist(c, ce, "update")
        self.assertIn("_commit: v3", (c / ".copier-answers.dist.yml").read_text())
        self.assertEqual(self.decrypt(c, ce)["API_KEY"], "key-2")

        # Tokens never reach output; every request carried the bearer token.
        self.assertFalse(any(FakeBiz.TOKEN in text for text in self.tokens))
        self.assertTrue(all(h.get("Authorization") == f"Bearer {FakeBiz.TOKEN}" for _, _, h in self.biz.requests))

    def test_errors_are_clear_and_failed_upload_is_forgotten(self):
        p, pe, c, ce = self.publisher, self.publisher_env, self.client, self.client_env
        write(p, "project/wiki/index.md", "x\n")
        write(p, "project/distribution.yaml", "repo: biz\n")
        self.commit(p, pe, "init")
        self.assertIn("published v1", self.run_dist(p, pe, "publish").stdout)
        write(p, "project/wiki/index.md", "y\n")
        self.commit(p, pe, "change")
        real, self.biz.setup = self.biz.setup, dict(self.biz.setup, version="v9")
        result = self.run_dist(p, pe, "publish", "v3", check=False)
        self.assertIn("version conflict: Biz already has v9", result.stderr)
        self.biz.setup = real
        self.assertIn("published v2", self.run_dist(p, pe, "publish").stdout)
        # A bad token command and a refused download.
        bad = dict(ce, FYSO_DIST_BIZ_TOKEN_CMD="false")
        result = mise(str(c / "framework/scripts/dist.sh"), "plan", "--json", cwd=c, env=bad, check=False)
        self.assertIn("did not print an access token", result.stderr)
        self.biz.deny = True
        result = self.run_dist(c, ce, "plan", "--json", check=False)
        self.assertIn("Biz denied access", result.stderr)


class DistributionUnitTests(unittest.TestCase):
    def test_targets(self):
        script = ROOT / "template/framework/scripts/dist.cjs"
        code = ("const d=require(process.argv[1]);console.log(JSON.stringify(['project/bots/team.yaml','project/distribution.yaml',"
                "'project/auth/tinyauth.yaml','state/memory/A/MEMORY.md','state/memory/A/memory/log/x.md','state/memory/A/memory/topic.md',"
                "'secrets.enc.yaml','.copier-answers.yml','.copier-answers.ext-silverbullet.yml','extensions/silverbullet/x','framework/x']"
                ".map(d.target)));console.log(d.cloneUrl('gh:org/repo'));console.log(d.nextVersion('',['v1','v9','x']))")
        result = subprocess.run(["node", "-e", code, str(script)], capture_output=True, text=True,
                                env=dict(os.environ, PATH=os.environ["PATH"]))
        if result.returncode and "yaml" in result.stderr:
            self.skipTest("needs the yaml CLI (mise)")
        lines = result.stdout.splitlines()
        self.assertEqual(json.loads(lines[0]), [
            "project/bots/team.yaml", None, None, "state/dist/memory/A/MEMORY.md", None,
            "state/dist/memory/A/memory/topic.md", None, None, ".copier-answers.ext-silverbullet.yml",
            "extensions/silverbullet/x", None])
        self.assertEqual(lines[1], "https://github.com/org/repo.git")
        self.assertEqual(lines[2], "v10")


if __name__ == "__main__":
    unittest.main()
