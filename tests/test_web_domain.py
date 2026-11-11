"""D61 generation and upgrade contracts through the real Copier CLI."""
import os
from pathlib import Path
import subprocess
import tempfile
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[1]
COPIER = ['uvx', '--from', 'copier==9.19.1', 'copier']


class WebDomain(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='fyso-domain-')
        self.addCleanup(self.tmp.cleanup)
        self.project = Path(self.tmp.name) / 'project'
        self.env = {**os.environ, 'GIT_AUTHOR_NAME': 'Fixture',
                    'GIT_AUTHOR_EMAIL': 'fixture@example.invalid',
                    'GIT_COMMITTER_NAME': 'Fixture', 'GIT_COMMITTER_EMAIL': 'fixture@example.invalid'}
        self.ref = self.run_cli(['git', 'rev-parse', 'HEAD'], ROOT).stdout.strip()

    def run_cli(self, args, cwd=None, check=True):
        result = subprocess.run(args, cwd=cwd, env=self.env,
                                capture_output=True, text=True, timeout=180)
        if check:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def generate(self, ref=None, *answers):
        self.run_cli(COPIER + ['copy', '--trust', '--defaults', '--vcs-ref', ref or self.ref,
            '-d', 'project_name=Domain fixture', '-d', 'project_slug=domain-fixture',
            '-d', 'port_base=38600', *answers, str(ROOT), str(self.project)])

    def config(self):
        return tomllib.loads((self.project / 'mise.toml').read_text())['env']

    def test_defaults_keep_local_login(self):
        self.generate()
        self.assertEqual(self.config()['FYSO_WEB_DOMAIN'], 'domain-fixture-38600.localhost')
        self.assertEqual(self.config()['FYSO_AUTH_UPSTREAM'], '')

    def test_localhost_is_reserved_for_legacy_redirects(self):
        result = self.run_cli(COPIER + ['copy', '--trust', '--defaults', '--vcs-ref',
            self.ref, '-d', 'web_domain=localhost', str(ROOT), str(self.project)], check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('localhost is reserved', result.stdout + result.stderr)

    def test_shared_login_setup_and_user_ownership(self):
        self.generate(None, '-d', 'web_domain=team.private.test',
                      '-d', 'auth_upstream=127.0.0.1:38709')
        self.assertEqual(self.config()['FYSO_WEB_DOMAIN'], 'team.private.test')
        self.assertEqual(self.config()['FYSO_AUTH_UPSTREAM'], '127.0.0.1:38709')
        key = Path(self.tmp.name) / 'fixture-age.txt'
        self.env.update(SOPS_AGE_KEY_FILE=str(key), MISE_SOPS_AGE_KEY_FILE=str(key), MISE_YES='1')
        self.run_cli(['mise', 'trust'], self.project)
        result = self.run_cli(['mise', 'run', 'setup'], self.project)
        self.assertIn('Web users belong to the shared login', result.stdout)
        decoded = self.run_cli(['mise', 'exec', '--', 'sops', 'decrypt', '--output-type',
                               'json', 'secrets.enc.yaml'], self.project)
        import json
        self.assertNotIn('FYSO_AUTH_USERS', json.loads(decoded.stdout))
        result = self.run_cli(['mise', 'run', 'web-auth:users', 'add', 'someone'],
                              self.project, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('manage users and app permissions there', result.stdout + result.stderr)

    def test_upgrade_from_rc1_preserves_project_configuration(self):
        self.generate('v0.1.0-rc.1')
        owned = self.project / 'project/auth/tinyauth.yaml'
        owned.write_text(owned.read_text() + '\n# Project-owned permission choices\n')
        before = owned.read_bytes()
        self.run_cli(['git', 'init', '-q'], self.project)
        self.run_cli(['git', 'add', '.'], self.project)
        self.run_cli(['git', 'commit', '-qm', 'fixture'], self.project)
        self.run_cli(COPIER + ['update', '--trust', '--defaults', '--skip-answered',
                              '--vcs-ref', self.ref], self.project)
        self.assertEqual(self.config()['FYSO_WEB_DOMAIN'], 'domain-fixture-38600.localhost')
        self.assertEqual(self.config()['FYSO_AUTH_UPSTREAM'], '')
        self.assertEqual(owned.read_bytes(), before)
        self.assertFalse(list(self.project.rglob('*.rej')))


if __name__ == '__main__':
    unittest.main()
