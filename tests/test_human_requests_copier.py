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
    @unittest.skipUnless(os.environ.get('FYSO_TEST_NODE') and os.environ.get('FYSO_TEST_YAML_DIR'),
                         'Set FYSO_TEST_NODE and FYSO_TEST_YAML_DIR to the pinned tools')
    def test_versioned_fixture_updates_real_extension_and_preserves_unrelated_work(self):
        copier, node = os.environ['FYSO_TEST_COPIER'], os.environ['FYSO_TEST_NODE']
        with tempfile.TemporaryDirectory(prefix='fyso-hr-versioned-') as temp:
            root = Path(temp); source = root / 'fyso-ext-human-requests'; project = root / 'project'; tools = root / 'bin'
            shutil.copytree(ROOT / 'template/framework/extensions/human-requests', source)
            project.mkdir(); tools.mkdir()
            env = {key: os.environ[key] for key in ('HOME', 'USER', 'LOGNAME', 'TMPDIR') if key in os.environ}
            env.update({'PATH': os.pathsep.join([str(tools), str(Path(node).parent), os.environ['FYSO_TEST_YAML_DIR'], '/usr/bin', '/bin']),
                        'FYSO_TEST_COPIER': copier, 'FYSO_PROJECT': 'hr-upgrade-fixture', 'FYSO_HTTP_PORT': '0',
                        'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_NOSYSTEM': '1',
                        'GIT_AUTHOR_NAME': 'Fixture', 'GIT_AUTHOR_EMAIL': 'fixture@example.invalid',
                        'GIT_COMMITTER_NAME': 'Fixture', 'GIT_COMMITTER_EMAIL': 'fixture@example.invalid'})
            def run(args, cwd=project):
                result = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True, timeout=90)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                return result.stdout
            def commit(cwd):
                run(['git', 'add', '.'], cwd); run(['git', 'commit', '-qm', 'fixture'], cwd)
            (tools / 'uvx').write_text('#!/bin/sh\nshift 3\nexec "$FYSO_TEST_COPIER" "$@"\n'); (tools / 'uvx').chmod(0o755)
            (tools / 'mise').write_text('#!/bin/sh\ncase "$1" in exec) shift; [ "$1" != -- ] || shift; exec "$@";; trust|install) exit 0;; *) exit 1;; esac\n'); (tools / 'mise').chmod(0o755)
            run(['git', 'init', '-q'], source); commit(source); run(['git', 'tag', 'v0.1.0'], source)
            run([copier, 'copy', '--defaults', '../fyso-ext-human-requests', '.'])
            scripts = project / 'framework/scripts'; scripts.mkdir(parents=True)
            for name in ['ext.sh', 'lib.sh', 'extensions.cjs', 'github-auth.cjs']:
                shutil.copy2(ROOT / 'template/framework/scripts' / name, scripts)
            for name in ['mcp-config.cjs', 'panel-data.cjs']:
                (scripts / name).write_text('process.exit(0);\n')
            run(['git', 'init', '-q']); commit(project)
            (project / 'unrelated.txt').write_text('work in progress\n')
            skill = source / 'extensions/human-requests/skills/human-requests/SKILL.md'
            skill.write_text(skill.read_text() + '\nFixture upgrade marker.\n')
            commit(source); run(['git', 'tag', 'v0.2.0'], source)
            result = json.loads(run(['bash', 'framework/scripts/ext.sh', 'apply', 'update', 'human-requests']))
            self.assertEqual(result['version'], 'v0.2.0')
            self.assertIn('Fixture upgrade marker.', (project / 'extensions/human-requests/skills/human-requests/SKILL.md').read_text())
            self.assertEqual((project / 'unrelated.txt').read_text(), 'work in progress\n')
            self.assertEqual(run(['git', 'status', '--porcelain']).strip(), '?? unrelated.txt')
            # The CLI update uses Copier directly and requires a clean project.
            commit(project)
            skill.write_text(skill.read_text() + 'Fixture CLI update marker.\n')
            commit(source); run(['git', 'tag', 'v0.3.0'], source)
            run(['bash', 'framework/scripts/ext.sh', 'update', 'human-requests', '--', '--defaults'])
            self.assertIn('Fixture CLI update marker.', (project / 'extensions/human-requests/skills/human-requests/SKILL.md').read_text())
            self.assertEqual((project / 'unrelated.txt').read_text(), 'work in progress\n')
            self.assertIn('v0.3.0', (project / '.copier-answers.ext-human-requests.yml').read_text())

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
                'url': '/extensions/human-requests/panel/index.html', 'icon': 'checklist',
                'badge': {'dagu_runs': {'status': 'waiting', 'labels': ['human-request']},
                          'warn_labels': ['blocking=true'], 'attention': True}},
                {'id': 'people', 'name': 'Personas', 'name_i18n': {'es': 'Personas', 'en': 'People'},
                 'url': '/extensions/human-requests/panel/people.html', 'icon': 'users'}])


if __name__ == '__main__':
    unittest.main()
