"""Real Copier lifecycle against local tagged extension sources."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class ExtensionsE2E(unittest.TestCase):
    def test_tagged_install_update_remove(self):
        if not shutil.which('uvx') or not shutil.which('mise'):
            self.skipTest('Copier runner (uvx) or mise unavailable')
        with tempfile.TemporaryDirectory(prefix='extensions-') as tmp:
            base = Path(tmp)
            age_file = base / 'age.txt'
            password_file = base / 'web-password'
            password_file.write_text('fixture-extension-password-43\n')
            password_file.chmod(0o600)
            fixture_env={**os.environ, 'MISE_YES':'1', 'FYSO_INITIAL_PASSWORD_FILE':str(password_file), 'MISE_SOPS_AGE_KEY_FILE':str(age_file), 'SOPS_AGE_KEY_FILE':str(age_file)}
            def run(*args, cwd=base):
                result = subprocess.run(args, cwd=cwd, text=True, capture_output=True,
                                        env=fixture_env, timeout=300)
                if result.returncode and any(marker in result.stderr.lower() for marker in
                    ['could not resolve host', 'network is unreachable', 'failed to download', 'connection refused']):
                    self.skipTest('Network unavailable while obtaining pinned test tools')
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                return result.stdout
            probe = subprocess.run(['uvx', '--from', 'copier==9.19.1', 'copier', '--version'], capture_output=True, timeout=120)
            if probe.returncode:
                self.skipTest('Pinned Copier unavailable (cache/network)')
            source = base / 'framework'
            source.mkdir()
            shutil.copy(ROOT / 'copier.yml', source)
            shutil.copytree(ROOT / 'template', source / 'template', symlinks=True,
                            ignore=shutil.ignore_patterns('node_modules'))
            project = base / 'project'
            copier = ['uvx', '--from', 'copier==9.19.1', 'copier']
            run(*copier, 'copy', '--trust', '--defaults', str(source), str(project))
            self.assertTrue((project / 'framework/extensions/_template/copier.yml').exists())
            starter = base / 'starter'
            run(*copier, 'copy', '--trust', '--defaults', '-d', 'extension_id=demo',
                str(project / 'framework/extensions/_template'), str(starter))
            starter_project = base / 'starter-project'
            starter_project.mkdir()
            shutil.copy(project / '.copier-answers.yml', starter_project)
            run(*copier, 'copy', '--trust', '--defaults', str(starter), str(starter_project))
            self.assertTrue((starter_project / 'extensions/demo/process.yaml').exists())
            self.assertIn('# demo — Fyso extension', (starter / 'README.md').read_text())
            self.assertFalse((starter_project / 'README.md').exists())
            self.assertIn('8410', (starter_project / '.config/mise/conf.d/ext-demo.toml').read_text())
            ext = base / 'ext'
            shutil.copytree(ROOT / 'tests/fixtures/ext-sample', ext)
            def commit(directory, message):
                run('git', 'add', '.', cwd=directory)
                run('git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', message, cwd=directory)
            run('git', 'init', '-q', cwd=ext)
            commit(ext, 'v1')
            run('git', 'tag', 'v1', cwd=ext)
            run('mise', 'trust', cwd=project)
            run('mise', 'install', cwd=project)
            run('mise', 'run', 'setup', cwd=project)
            # A local catalog (D31) replaces the official one; ext:add resolves the id to its latest tag.
            catalog = base / 'catalog'
            catalog.mkdir()
            (catalog / 'marketplace.yaml').write_text(
                f'name: Local\nextensions:\n  - id: sample\n    src: {ext}\n    description: Sample\n')
            run('git', 'init', '-q', cwd=catalog)
            commit(catalog, 'catalog')
            (project / 'project/marketplaces.yaml').write_text(f'- {catalog}\n')
            run('git', 'init', '-q', cwd=project)
            commit(project, 'project')
            run('mise', 'run', 'ext:add', 'sample', '--', '--defaults', cwd=project)
            self.assertIn('_commit: v1', (project / '.copier-answers.ext-sample.yml').read_text())
            self.assertIn('8410', (project / '.config/mise/conf.d/ext-sample.toml').read_text())
            commit(project, 'install')
            # Dagu runs workflow steps with a cleared environment (run-dagu.sh): run-ext
            # must reload the project's mise env to see the extension's port.
            # Real node first, as under `mise run`; a mise shim would load the env by itself.
            node_dir = Path(run('mise', 'which', 'node', cwd=project).strip()).parent
            cleared = subprocess.run(['env', '-i', f"HOME={os.environ['HOME']}", f"PATH={node_dir}:{os.environ['PATH']}",
                                      f'FYSO_ROOT={project}', f'MISE_SOPS_AGE_KEY_FILE={age_file}', f'SOPS_AGE_KEY_FILE={age_file}', 'framework/scripts/run-ext.sh', 'sample', '--',
                                      'printenv', 'FYSO_EXT_SAMPLE_PORT'],
                                     cwd=project, text=True, capture_output=True, timeout=120)
            self.assertEqual(cleared.stdout.strip(), '8410', cleared.stderr)
            page = ext / 'extensions/sample/public/index.html'
            page.write_text('sample v2\n')
            commit(ext, 'v2')
            run('git', 'tag', 'v2', cwd=ext)
            self.assertIn('installed v1 → v2', run('mise', 'run', 'ext:search', 'sample', cwd=project))
            run('mise', 'run', 'ext:update', '--defaults', cwd=project)
            self.assertEqual((project / 'extensions/sample/public/index.html').read_text(), 'sample v2\n')
            self.assertIn('v2', run('mise', 'run', 'ext:list', cwd=project))
            commit(project, 'update')
            # The panel's path (fyso-ext-install): upgrade in a clean worktree of HEAD and
            # fast-forward, so unrelated uncommitted work (bot memory) stays as it was.
            page.write_text('sample v3\n')
            commit(ext, 'v3')
            run('git', 'tag', 'v3', cwd=ext)
            (project / 'state/unrelated.txt').write_text('work in progress\n')
            apply = ['mise', 'exec', '--', 'framework/scripts/ext.sh', 'apply', 'update', 'sample']
            result = json.loads(run(*apply, cwd=project))
            self.assertEqual((result['id'], result['mode'], result['version'], result['from'], result['changed']), ('sample', 'update', 'v3', 'v2', True))
            self.assertTrue(result['commit'])
            self.assertEqual((project / 'extensions/sample/public/index.html').read_text(), 'sample v3\n')
            self.assertIn('ext: update sample v3', run('git', 'log', '-1', '--format=%s', cwd=project))
            self.assertEqual(run('git', 'status', '--porcelain', cwd=project).strip(), '?? state/unrelated.txt')
            self.assertEqual(run('git', 'worktree', 'list', cwd=project).count('\n'), 1)
            # A pre-release is neither offered nor installed; updating reports no change and no commit.
            page.write_text('sample v4 beta\n')
            commit(ext, 'v4 beta')
            run('git', 'tag', 'v4-beta.1', cwd=ext)
            head = run('git', 'rev-parse', '--short', 'HEAD', cwd=project).strip()
            self.assertIn('installed v3', run('mise', 'run', 'ext:search', 'sample', cwd=project))
            same = json.loads(run(*apply, cwd=project))
            self.assertEqual((same['version'], same['from'], same['changed'], same['commit']), ('v3', 'v3', False, None))
            self.assertEqual(run('git', 'rev-parse', '--short', 'HEAD', cwd=project).strip(), head)
            self.assertEqual((project / 'extensions/sample/public/index.html').read_text(), 'sample v3\n')
            # A local edit to one of the extension's own files blocks the fast-forward.
            page.write_text('sample v4\n')
            commit(ext, 'v4')
            run('git', 'tag', 'v4', cwd=ext)
            (project / 'extensions/sample/public/index.html').write_text('local edit\n')
            blocked = subprocess.run(apply, cwd=project, env=fixture_env, text=True, capture_output=True, timeout=300)
            self.assertNotEqual(blocked.returncode, 0)
            self.assertIn("uncommitted changes in sample's files", blocked.stderr)
            self.assertEqual((project / 'extensions/sample/public/index.html').read_text(), 'local edit\n')
            run('git', 'checkout', '--', 'extensions/sample/public/index.html', cwd=project)
            (project / 'state/unrelated.txt').unlink()
            run('mise', 'run', 'ext:remove', 'sample', cwd=project)
            self.assertFalse((project / 'extensions/sample').exists())
            self.assertFalse((project / '.copier-answers.ext-sample.yml').exists())
            # The panel refuses a source outside the project: Copier would save that machine
            # path in the answers file and every later snapshot would fail check-paths.
            outside = subprocess.run(['mise', 'exec', '--', 'framework/scripts/ext.sh', 'apply', 'add', 'sample'],
                                     cwd=project, env=fixture_env, text=True, capture_output=True, timeout=300)
            self.assertNotEqual(outside.returncode, 0)
            self.assertIn('is a path of this machine', outside.stderr)
            self.assertFalse((project / '.copier-answers.ext-sample.yml').exists())
