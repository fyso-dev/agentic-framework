"""Native file production without any server or AI account.

Run with pinned document tools and Dagu on PATH. Each test generates a private
project through Copier and uses an isolated Dagu home; no machine service is used.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest
import zipfile

import test_owner_extensions as packaging


class OwnerRuntime(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        missing = [tool for tool in ('dagu', 'pandoc', 'typst') if not shutil.which(tool)]
        if missing:
            raise unittest.SkipTest('Pinned tools required on PATH: ' + ', '.join(missing))
        # Reuse the real packaging fixture, not the packaging tests themselves.
        cls.fixture = type('RuntimeFixture', (packaging.OwnerExtensions,), {})
        cls.fixture.setUpClass()
        cls.addClassCleanup(cls.fixture.doClassCleanups)
        cls.project = cls.fixture.project
        cls.env = {**os.environ, 'FYSO_ROOT': str(cls.project),
                   'FYSO_DATA': str(cls.project / '.data'),
                   'DAGU_HOME': str(cls.project / '.data/dagu-runtime'),
                   'DAGU_ENV_PASSTHROUGH_PREFIXES': 'FYSO_',
                   'DAGU_DAGS_DIR': str(cls.project / 'project/workflows')}

    def run_ok(self, *args, **extra):
        result = subprocess.run(args, cwd=self.project, env={**self.env, **extra},
                                text=True, capture_output=True, timeout=90)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result.stdout

    def test_word_powerpoint_and_pdf_are_real_documents(self):
        self.run_ok('bash', 'extensions/office-docs/doctor.sh')
        out = self.project / '.data/ext/office-docs/runtime'
        out.mkdir(parents=True, exist_ok=True)
        source = out / 'source.md'
        source.write_text('# Synthetic report\n\nOwner extension fixture.\n')
        for ext in ('docx', 'pptx', 'pdf'):
            target = out / ('report.' + ext)
            args = ['pandoc', str(source), '-o', str(target)]
            if ext == 'pdf':
                args += ['--pdf-engine=typst', '-V', 'mainfont=Libertinus Serif']
            self.run_ok(*args)
            if ext == 'pdf':
                self.assertTrue(target.read_bytes().startswith(b'%PDF-'))
            else:
                with zipfile.ZipFile(target) as package:
                    self.assertIn('[Content_Types].xml', package.namelist())
                    xml = ''.join(package.read(name).decode() for name in package.namelist()
                                  if name.endswith('.xml'))
                    self.assertIn('Owner extension fixture.', xml)

    def test_native_xlsx_workflow_writes_the_supplied_rows(self):
        work = self.project / '.data/ext/office-docs/work'
        work.mkdir(parents=True, exist_ok=True)
        (work / 'fixture.csv').write_text('Item,Amount\nExample,12\n')
        self.run_ok('dagu', 'start', '--quiet',
                    'project/workflows/ext-office-docs-xlsx.yaml', '--',
                    'SOURCE=.data/ext/office-docs/work/fixture.csv', 'NAME=Fixture', 'SHEET=Data')
        with zipfile.ZipFile(self.project / '.data/ext/office-docs/out/Fixture.xlsx') as package:
            text = ''.join(package.read(name).decode() for name in package.namelist()
                           if name.endswith('.xml'))
            self.assertIn('Example', text)
            self.assertIn('12', text)

    def test_gardener_runs_without_ai_and_preserves_the_original(self):
        page = self.project / 'project/wiki/index.md'
        original = '# Fixture\n[[Missing fixture page]]\n'
        page.write_text(original)
        self.run_ok('dagu', 'start', '--quiet',
                    'project/workflows/ext-knowledge-skills-garden.yaml', '--', 'PROVIDER=none')
        self.assertEqual(page.read_text(), original)
        reports = list((page.parent / 'Mantenimiento').glob('*.md'))
        self.assertEqual(len(reports), 1)
        self.assertIn('Missing fixture page', reports[0].read_text())


if __name__ == '__main__':
    unittest.main()
