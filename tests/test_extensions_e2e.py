"""Real Copier lifecycle against local tagged extension sources."""
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
            def run(*args, cwd=base):
                result = subprocess.run(args, cwd=cwd, text=True, capture_output=True,
                                        env={**os.environ, 'MISE_YES': '1'}, timeout=300)
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
            run('git', 'init', '-q', cwd=project)
            commit(project, 'project')
            run('mise', 'run', 'ext:add', str(ext), '--', '--defaults', '--vcs-ref', 'v1', cwd=project)
            self.assertIn('8410', (project / '.config/mise/conf.d/ext-sample.toml').read_text())
            commit(project, 'install')
            # Dagu runs workflow steps with a cleared environment (run-dagu.sh): run-ext
            # must reload the project's mise env to see the extension's port.
            # Real node first, as under `mise run`; a mise shim would load the env by itself.
            node_dir = Path(run('mise', 'which', 'node', cwd=project).strip()).parent
            cleared = subprocess.run(['env', '-i', f"HOME={os.environ['HOME']}", f"PATH={node_dir}:{os.environ['PATH']}",
                                      f'FYSO_ROOT={project}', 'framework/scripts/run-ext.sh', 'sample', '--',
                                      'printenv', 'FYSO_EXT_SAMPLE_PORT'],
                                     cwd=project, text=True, capture_output=True, timeout=120)
            self.assertEqual(cleared.stdout.strip(), '8410', cleared.stderr)
            page = ext / 'extensions/sample/public/index.html'
            page.write_text('sample v2\n')
            commit(ext, 'v2')
            run('git', 'tag', 'v2', cwd=ext)
            run('mise', 'run', 'ext:update', '--defaults', cwd=project)
            self.assertEqual((project / 'extensions/sample/public/index.html').read_text(), 'sample v2\n')
            self.assertIn('v2', run('mise', 'run', 'ext:list', cwd=project))
            run('mise', 'run', 'ext:remove', 'sample', cwd=project)
            self.assertFalse((project / 'extensions/sample').exists())
            self.assertFalse((project / '.copier-answers.ext-sample.yml').exists())
