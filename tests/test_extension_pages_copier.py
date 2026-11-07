"""Exercise Copier's actual page-slot packaging, including the authoring starter."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class ExtensionPagesCopier(unittest.TestCase):
    def test_bundled_page_and_starter_generate_independent_page_slots(self):
        if not shutil.which('uvx'):
            self.skipTest('Pinned Copier runner is unavailable')
        with tempfile.TemporaryDirectory(prefix='fyso-page-packaging-') as temporary:
            base = Path(temporary)
            def run(*args):
                result = subprocess.run(args, cwd=base, text=True, capture_output=True, timeout=120)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            copier = ['uvx', '--from', 'copier==9.19.1', 'copier']
            source = base / 'source'
            source.mkdir()
            shutil.copy2(ROOT / 'copier.yml', source)
            shutil.copytree(ROOT / 'template', source / 'template', symlinks=True,
                            ignore=shutil.ignore_patterns('node_modules', '__pycache__'))
            project = base / 'project'
            run(*copier, 'copy', '--trust', '--defaults', str(source), str(project))
            self.assertTrue((project / 'framework/extensions/biz/copier.yml').is_file())
            self.assertTrue((project / 'framework/panel/dist/assets/extension-sdk.js').is_file())
            run(*copier, 'copy', '--trust', '--defaults', str(project / 'framework/extensions/biz'), str(project))
            self.assertTrue((project / 'extensions/biz/pages/overview.yaml').is_file())
            self.assertTrue((project / 'extensions/biz/panel/index.html').is_file())
            self.assertTrue((project / 'extensions/biz/panel/main.js').is_file())
            self.assertFalse((project / 'panel-src').exists())
            starter = base / 'starter'
            run(*copier, 'copy', '--trust', '--defaults', '-d', 'extension_id=demo-pages',
                str(project / 'framework/extensions/_template'), str(starter))
            run(*copier, 'copy', '--trust', '--defaults', str(starter), str(project))
            self.assertTrue((project / 'extensions/demo-pages/pages/overview.yaml').is_file())
            self.assertTrue((project / 'extensions/demo-pages/panel/locales/es.json').is_file())
            # Invoke the inventory consumer on the rendered declarations. yaml
            # is a dependency at this executable boundary, not source inspection.
            yaml_cli = ROOT / 'template/framework/panel/node_modules/yaml/bin.mjs'
            if not yaml_cli.exists():
                self.skipTest('Panel yaml dependency is not installed')
            (base / 'bin').mkdir()
            (base / 'bin/yaml').symlink_to(yaml_cli)
            result = subprocess.run(['node', '-e',
                'const x=require("./framework/scripts/extensions.cjs").inventory([]);'
                'if(x.length!==2||x.some(e=>e.pages.length!==1))process.exit(1)'],
                cwd=project, env={**os.environ, 'PATH':str(base / 'bin')+os.pathsep+os.environ['PATH']},
                capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)

if __name__ == '__main__':
    unittest.main()
