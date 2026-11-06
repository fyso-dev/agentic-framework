"""Regression checks for Builder guards, using disposable Git repositories.

Run with gitleaks on PATH: python3 -m unittest discover -s tests -v
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class BuilderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="fyso-builder-")
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name)
        shutil.copytree(ROOT / "template/framework/scripts", self.repo / "framework/scripts")
        (self.repo / ".gitignore").write_text(".data/\n")
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "Builder test")
        self.git("config", "user.email", "builder@example.invalid")
        self.git("add", ".")
        self.git("commit", "-qm", "fixture")
        self.wt = self.repo / ".data/worktrees/test"
        self.wt.parent.mkdir(parents=True)
        self.git("worktree", "add", "-qb", "builder/test", str(self.wt))
        self.env = dict(os.environ, FYSO_ROOT=str(self.repo), FYSO_DATA=str(self.repo / ".data"),
                        WT=str(self.wt), BASE="main", TASK="Fixture change", PROVIDER="codex",
                        DAG_RUN_ID="test", DAGU_OUTPUT_FILE=str(self.repo / ".data/output"), PUBLISH="false")

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.repo), *args], check=True, capture_output=True, text=True).stdout

    def step(self, name, ok=True, **env):
        result = subprocess.run([str(self.repo / "framework/scripts/dev-task.sh"), name],
                                env=dict(self.env, **env), capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, ok, result.stdout + result.stderr)
        return result

    def test_empty_change_fails_and_cleanup_preserves_work(self):
        self.step("gate", ok=False)
        (self.wt / "recover.txt").write_text("recover me\n")
        self.step("cleanup")
        self.assertTrue((self.wt / "recover.txt").exists())

    def test_path_guard_includes_new_staged_files(self):
        (self.wt / "new.txt").write_text("/Users/" + "example/machine-specific\n")
        self.step("gate")
        self.step("check", ok=False)

    @unittest.skipUnless(shutil.which("gitleaks"), "gitleaks is required")
    def test_local_delivery_preserves_main(self):
        original = self.git("rev-parse", "main").strip()
        (self.wt / "new.txt").write_text("portable change\n")
        self.step("gate")
        self.step("check")
        self.step("commit")
        result = self.step("publish")
        self.assertIn('"changedFiles":1', result.stdout)
        self.assertEqual(self.git("rev-parse", "main").strip(), original)
        self.assertNotEqual(self.git("rev-parse", "builder/test").strip(), original)

    @unittest.skipUnless(shutil.which("gitleaks"), "gitleaks is required")
    def test_secret_blocks_commit(self):
        (self.wt / "key.txt").write_text("github_token = 'ghp_" + "Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv1Wx2'\n")
        self.step("gate")
        self.step("check", ok=False)

    @unittest.skipUnless(shutil.which("gitleaks"), "gitleaks is required")
    def test_project_checks_can_block_delivery(self):
        (self.repo / "project").mkdir()
        hook = self.repo / "project/check.sh"
        hook.write_text("#!/bin/sh\nexit 23\n")
        hook.chmod(0o755)
        (self.wt / "new.txt").write_text("portable change\n")
        self.step("gate")
        self.step("check", ok=False)

    @unittest.skipUnless(shutil.which("gitleaks"), "gitleaks is required")
    def test_checks_cannot_replace_staged_candidate(self):
        (self.repo / "project").mkdir()
        hook = self.repo / "project/check.sh"
        hook.write_text("#!/bin/sh\nprintf altered > new.txt\ngit add new.txt\n")
        hook.chmod(0o755)
        (self.wt / "new.txt").write_text("original candidate\n")
        self.step("gate")
        self.step("check", ok=False)

    def test_publish_failure_is_not_success(self):
        tools = self.repo / ".data/bin"
        tools.mkdir()
        gh = tools / "gh"
        gh.write_text("#!/bin/sh\nexit 1\n")
        gh.chmod(0o755)
        self.step("publish", ok=False, PUBLISH="true", PATH=str(tools) + os.pathsep + os.environ["PATH"])

    def test_invalid_provider_and_protected_branch(self):
        self.step("prepare", ok=False, PROVIDER="unknown")
        self.step("prepare", ok=False, BRANCH="main")

    def test_reject_foreign_worktree_path(self):
        self.step("cleanup", ok=False, WT=str(self.repo))


if __name__ == "__main__":
    unittest.main()
