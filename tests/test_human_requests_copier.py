"""Exercise bundled extension packaging using the pinned Copier executable."""
import os
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.environ.get('FYSO_TEST_COPIER'), 'Set FYSO_TEST_COPIER to Copier 9.19.1')
class HumanRequestsCopierTest(unittest.TestCase):
    def test_generated_project_can_install_bundled_extension(self):
        copier = os.environ['FYSO_TEST_COPIER']
        self.assertIn('9.19.1', subprocess.check_output([copier, '--version'], text=True))
        with tempfile.TemporaryDirectory(prefix='fyso-hr-copier-') as temp:
            root = Path(temp)
            source, project = root / 'source', root / 'project'
            source.mkdir()
            shutil.copy(ROOT / 'copier.yml', source)
            shutil.copytree(ROOT / 'template', source / 'template', symlinks=True,
                            ignore=shutil.ignore_patterns('node_modules', '__pycache__'))
            subprocess.run([copier, 'copy', '--defaults', '-d', 'project_name=Human Request Test',
                            '-d', 'project_slug=human-request-test', '-d', 'port_base=33600',
                            str(source), str(project)], check=True, capture_output=True, text=True)
            extension = project / 'framework/extensions/human-requests'
            self.assertTrue((extension / 'copier.yml').is_file())
            # A relative source keeps machine paths out of the project's answers file.
            subprocess.run([copier, 'copy', '--defaults', '-d', 'extension_port=33610',
                            './framework/extensions/human-requests', '.'],
                           cwd=project, check=True, capture_output=True, text=True)
            for relative in ('project/workflows/ext-human-requests-request.yaml',
                             'project/workflows/ext-human-requests-sweep.yaml',
                             'extensions/human-requests/pages/pending.yaml',
                             'extensions/human-requests/skills/human-requests/SKILL.md'):
                self.assertTrue((project / relative).is_file(), relative)
            answers = (project / '.copier-answers.ext-human-requests.yml').read_text()
            self.assertNotIn(str(root), answers)

    @unittest.skipUnless(os.environ.get('FYSO_TEST_NODE') and os.environ.get('FYSO_TEST_YAML_DIR'),
                         'Set FYSO_TEST_NODE and FYSO_TEST_YAML_DIR to the pinned tools')
    def test_generated_panel_inventory_contains_installed_page(self):
        copier, node = os.environ['FYSO_TEST_COPIER'], os.environ['FYSO_TEST_NODE']
        with tempfile.TemporaryDirectory(prefix='fyso-hr-inventory-') as temp:
            root = Path(temp)
            source, project = root / 'source', root / 'project'
            source.mkdir()
            shutil.copy(ROOT / 'copier.yml', source)
            shutil.copytree(ROOT / 'template', source / 'template', symlinks=True,
                            ignore=shutil.ignore_patterns('node_modules', '__pycache__'))
            subprocess.run([copier, 'copy', '--defaults', '-d', 'project_name=Human Request Test',
                            '-d', 'project_slug=human-request-test', '-d', 'port_base=33600',
                            str(source), str(project)], check=True, capture_output=True, text=True)
            subprocess.run([copier, 'copy', '--defaults', './framework/extensions/human-requests', '.'],
                           cwd=project, check=True, capture_output=True, text=True)
            env = {key: os.environ[key] for key in ('HOME', 'USER', 'LOGNAME') if key in os.environ}
            env.update({'PATH': os.pathsep.join([str(Path(node).parent), os.environ['FYSO_TEST_YAML_DIR'], '/usr/bin', '/bin']),
                        'FYSO_ROOT': str(project), 'FYSO_DATA': str(project / '.data'),
                        'FYSO_PROJECT': 'human-request-test', 'FYSO_PROJECT_NAME': 'Human Request Test',
                        'FYSO_HTTP_PORT': '33600', 'FYSO_WEB_SCHEME': 'http', 'FYSO_WEB_PORT_SUFFIX': ':33600'})
            subprocess.run([node, 'framework/scripts/panel-data.cjs', 'config'], cwd=project, env=env,
                           check=True, capture_output=True, text=True)
            inventory = json.loads((project / '.data/panel/extensions.json').read_text())
            extension = next(entry for entry in inventory if entry['id'] == 'human-requests')
            self.assertIn('human-requests', extension['skills'])
            self.assertEqual(extension['pages'], [{'id': 'pending', 'name': 'Pendientes',
                'name_i18n': {'es': 'Pendientes', 'en': 'Pending'},
                'url': '/extensions/human-requests/panel/index.html', 'icon': 'checklist'}])


if __name__ == '__main__':
    unittest.main()
