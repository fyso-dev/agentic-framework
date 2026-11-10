"""Project distributions (D56): publish → add → local changes → publish v2 → update.

Real git, Copier 9.19.1 (uvx), SOPS and age; no running stack (the client has never
started, so `up` would restore bots and memory from git).
Run: python3 -m unittest tests.test_distribution -v
"""
import json
import os
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


@unittest.skipUnless(shutil.which("mise") and shutil.which("uvx"), "needs mise and uvx")
class DistributionTests(unittest.TestCase):
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
        shutil.copytree(ROOT / "template/framework/scripts", root / "framework/scripts")
        write(root, ".gitignore", ".data/\n")
        key = self.tmp / f"{name}.age"
        mise("age-keygen", "-o", str(key), cwd=self.tmp)
        public = mise("age-keygen", "-y", str(key), cwd=self.tmp).stdout.strip()
        write(root, ".sops.yaml", f"creation_rules:\n  - path_regex: secrets\\.enc\\.yaml$\n    age: {public}\n")
        env = dict(os.environ, **IDENTITY, FYSO_ROOT=str(root), FYSO_DATA=str(root / ".data"),
                   FYSO_PROJECT=name, FYSO_HTTP_PORT="0", SOPS_AGE_KEY_FILE=str(key))
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

    def test_publish_install_update(self):
        p, pe, c, ce = self.publisher, self.publisher_env, self.client, self.client_env
        write(p, "project/bots/team.yaml", "version: 1\nbots:\n  - name: Ventas\n    cwd: ${FYSO_ROOT}\n")
        write(p, "project/bots/extra.md", "to be removed in v2\n")
        write(p, "project/wiki/index.md", "# Cliente\nv1\n")
        write(p, "project/auth/tinyauth.yaml", "users: publisher-only\n")
        write(p, "state/memory/Ventas/MEMORY.md", "- fact one\n")
        write(p, "state/memory/Ventas/memory/log/2026-11-10.md", "user said something private\n")
        write(p, "project/distribution.yaml", f"repo: {self.repo}\nsecrets: [API_KEY]\nrecipients: [{self.client_key}]\n")
        self.secrets(p, pe, {"FYSO_ADMIN_PASSWORD": "publisher-pass", "API_KEY": "key-1"})
        self.commit(p, pe, "publisher v1")
        out = self.dist(p, pe, "publish").stdout
        self.assertIn("published v1", out)

        self.secrets(c, ce, {"FYSO_ADMIN_PASSWORD": "client-pass"})
        write(c, "project/bots/team.yaml", "version: 1\nbots: []\n")
        self.commit(c, ce, "client init")
        self.dist(c, ce, "add", str(self.repo))
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

        # Updating again changes nothing: the client's merged memory is kept.
        self.assertIn("already at v2", self.dist(c, ce, "update").stdout)
        self.assertEqual((c / "state/memory/Ventas/MEMORY.md").read_text(), memory)

    def test_private_secrets_are_never_sent(self):
        p, pe = self.publisher, self.publisher_env
        write(p, "project/wiki/index.md", "x\n")
        write(p, "project/distribution.yaml", f"repo: {self.repo}\nsecrets: [FYSO_ADMIN_PASSWORD]\nrecipients: [{self.client_key}]\n")
        self.commit(p, pe, "init")
        result = mise(str(p / "framework/scripts/dist.sh"), "publish", cwd=p, env=pe, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("never sent", result.stderr)


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
