"""Exercise bundled extension packaging using the pinned Copier executable."""
import os
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


if __name__ == '__main__':
    unittest.main()
