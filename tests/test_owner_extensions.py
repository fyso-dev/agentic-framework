"""Real Copier packaging of the bundled owner extensions (D64-D70).

Generates a project from this checkout, installs each extension from the project's
own bundled copy, and checks the contract: only slot paths are written, nothing
else changes, and the installed files are what the framework's consumers read.
"""
import hashlib
import json
import os
from pathlib import Path
import tomllib
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
BUNDLED = ROOT / 'template/framework/extensions'
COPIER = ['uvx', '--from', 'copier==9.19.1', 'copier']
EXPECTED = {
    'office-docs': {'skills': ['excel-sheets', 'pdf-docs', 'powerpoint-decks', 'word-docs'],
                    'workflows': ['ext-office-docs-xlsx'], 'mcp': [], 'pages': []},
    'deliverables': {'skills': ['deliver-files'], 'workflows': [], 'mcp': ['deliverables'], 'pages': ['files']},
    'knowledge-skills': {'skills': ['brand-voice', 'business-interview', 'wiki-gardener'],
                         'workflows': ['ext-knowledge-skills-garden'], 'mcp': [], 'pages': []},
    'ops-assistant': {'skills': ['automate-this'],
                      'workflows': ['ext-ops-assistant-digest', 'ext-ops-assistant-spend-cap'], 'mcp': [], 'pages': []},
    'owner-loop': {'skills': ['ask-owner', 'notify-owner', 'request-key'],
                   'workflows': ['ext-owner-loop-ask', 'ext-owner-loop-notify'], 'mcp': [], 'pages': []},
    'pack-accounting': {'skills': [], 'workflows': [], 'mcp': [], 'pages': []},
}


def pinned(tool, binary):
    """A pinned tool's real binary: mise shims refuse to run inside an untrusted project."""
    if shutil.which('mise'):
        where = subprocess.run(['mise', 'where', tool], cwd=ROOT, capture_output=True, text=True, timeout=60)
        for candidate in (Path(where.stdout.strip()) / binary, Path(where.stdout.strip()) / 'bin' / binary):
            if where.returncode == 0 and candidate.is_file():
                return str(candidate)
    return None


def real_node():
    if not shutil.which('node'):
        return None
    probe = subprocess.run(['node', '-p', 'process.execPath'], cwd=ROOT, capture_output=True, text=True, timeout=60)
    return probe.stdout.strip() if probe.returncode == 0 else None


def tree(base):
    files = {}
    for path in sorted(base.rglob('*')):
        if path.is_file() and not path.is_symlink():
            files[path.relative_to(base).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return files


class OwnerExtensions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which('uvx'):
            raise unittest.SkipTest('Pinned Copier runner is unavailable')
        probe = subprocess.run([*COPIER, '--version'], capture_output=True, timeout=180)
        if probe.returncode:
            raise unittest.SkipTest('Pinned Copier unavailable (cache/network)')
        cls.tmp = tempfile.TemporaryDirectory(prefix='fyso-owner-ext-')
        cls.addClassCleanup(cls.tmp.cleanup)
        base = Path(cls.tmp.name).resolve()
        source = base / 'source'
        source.mkdir()
        shutil.copy2(ROOT / 'copier.yml', source)
        shutil.copytree(ROOT / 'template', source / 'template', symlinks=True,
                        ignore=shutil.ignore_patterns('node_modules', '__pycache__'))
        cls.project = base / 'project'
        cls.run_ok(*COPIER, 'copy', '--trust', '--defaults', str(source), str(cls.project), cwd=base)
        cls.written = {}
        for ext in EXPECTED:
            before = tree(cls.project)
            # `ext:add` always passes a port; extensions that need none must accept it.
            # Run from outside the project: uvx may be a mise shim, and the project's
            # mise.toml is not trusted here.
            cls.run_ok(*COPIER, 'copy', '--trust', '--defaults', '-d', 'extension_port=8410',
                       str(cls.project / 'framework/extensions' / ext), str(cls.project), cwd=base)
            after = tree(cls.project)
            cls.written[ext] = {
                'new': sorted(set(after) - set(before)),
                'changed': sorted(f for f in before if f in after and after[f] != before[f]),
                'removed': sorted(set(before) - set(after)),
            }

    @classmethod
    def run_ok(cls, *args, cwd):
        result = subprocess.run(args, cwd=cwd, text=True, capture_output=True, timeout=300)
        if result.returncode:
            raise AssertionError(result.stdout + result.stderr)
        return result.stdout

    def yaml(self, path, *, frontmatter=False):
        package = ROOT / 'template/framework/panel/node_modules/yaml'
        node = real_node()
        if not node or not package.exists():
            self.skipTest('node or the yaml package is unavailable')
        result = subprocess.run(
            [node, '-e', 'const fs=require("fs"); const text=fs.readFileSync(process.argv[2], "utf8"); console.log(JSON.stringify(require(process.argv[1]).parse(process.argv[3] === "frontmatter" ? text.split("---")[1] : text)))',
             str(package), str(path), 'frontmatter' if frontmatter else 'document'], capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_bundled_copies_reach_the_project_with_their_copier_configuration(self):
        for ext in EXPECTED:
            config = self.yaml(self.project / f'framework/extensions/{ext}/copier.yml')
            self.assertEqual(config['_answers_file'], f'.copier-answers.ext-{ext}.yml')

    def test_each_extension_writes_only_its_slots(self):
        for ext, change in self.written.items():
            allowed = (f'.copier-answers.ext-{ext}.yml', f'.config/mise/conf.d/ext-{ext}.toml',
                       f'extensions/{ext}/', f'project/workflows/ext-{ext}-')
            self.assertTrue(change['new'], ext)
            for file in change['new']:
                self.assertTrue(file.startswith(allowed), f'{ext} wrote outside its slots: {file}')
            self.assertEqual(change['changed'], [], f'{ext} changed files it does not own')
            self.assertEqual(change['removed'], [], f'{ext} removed files')
            self.assertIn(f'.copier-answers.ext-{ext}.yml', change['new'])
            # The authoring README stays in the extension source; the guide ships in the slot.
            self.assertTrue((self.project / f'extensions/{ext}/README.md').is_file(), ext)
            self.assertTrue((self.project / f'extensions/{ext}/doctor.sh').is_file(), ext)
            self.assertTrue((self.project / f'extensions/{ext}/secrets.yaml').is_file(), ext)
            for file in change['new']:
                self.assertFalse(file.endswith('.slotjinja'), file)
                text = (self.project / file).read_bytes()
                if '/vendor/' not in file:  # upstream i18next contains literal interpolation delimiters
                    self.assertNotRegex(text, rb'\{\{|\{%', f'{file} has unrendered template syntax')

    def test_inventory_reads_skills_workflows_pages_and_mcp_servers(self):
        panel_yaml = ROOT / 'template/framework/panel/node_modules/yaml/bin.mjs'
        yaml_cli = str(panel_yaml) if panel_yaml.exists() else pinned('npm:yaml@2.8.1', 'yaml')
        node = real_node()
        if not yaml_cli or not node:
            self.skipTest('node or the yaml package is unavailable (npm ci in the panel, or mise install)')
        bin_dir = Path(self.tmp.name) / 'bin'
        bin_dir.mkdir(exist_ok=True)
        if not (bin_dir / 'yaml').exists():
            (bin_dir / 'yaml').symlink_to(yaml_cli)
        env = {**os.environ, 'PATH': f'{bin_dir}{os.pathsep}{os.environ["PATH"]}'}
        result = subprocess.run(
            [node, '-e', 'console.log(JSON.stringify(require("./framework/scripts/extensions.cjs").inventory([])))'],
            cwd=self.project, env=env, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        inventory = {entry['id']: entry for entry in json.loads(result.stdout)}
        for ext, want in EXPECTED.items():
            got = inventory[ext]
            self.assertEqual(sorted(got['skills']), want['skills'], ext)
            self.assertEqual(sorted(got['workflows']), want['workflows'], ext)
            self.assertEqual(sorted(got['mcpServers']), want['mcp'], ext)
            self.assertEqual([page['id'] for page in got['pages']], want['pages'], ext)
            self.assertEqual(got['secrets'], [], ext)
        page = inventory['deliverables']['pages'][0]
        self.assertEqual(page['name_i18n'], {'es': 'Entregables', 'en': 'Deliverables'})
        # Extension ports and pages pass the same check `mise run doctor` runs.
        check = subprocess.run([node, 'framework/scripts/extensions.cjs', 'check'], cwd=self.project,
                               env={**env, 'FYSO_HTTP_PORT': '8400'}, capture_output=True, text=True, timeout=60)
        self.assertEqual(check.returncode, 0, check.stderr)

    def test_skills_have_native_frontmatter(self):
        for ext, want in EXPECTED.items():
            for skill in want['skills']:
                path = self.project / f'extensions/{ext}/skills/{skill}/SKILL.md'
                metadata = self.yaml(path, frontmatter=True)
                self.assertEqual(metadata['name'], skill)
                self.assertGreater(len(metadata['description']), 40, f'{ext}/{skill}: say when to use it')
                self.assertLess(len(path.read_text().splitlines()), 120, f'{ext}/{skill}: keep skills short')

    def test_panel_copy_is_localized_in_spanish_and_english(self):
        folders = [path for path in (self.project / 'extensions').glob('*/**/locales') if path.is_dir()]
        self.assertEqual(sorted(p.relative_to(self.project).as_posix() for p in folders),
                         ['extensions/deliverables/panel/locales', 'extensions/deliverables/ui/locales'])
        for folder in folders:
            es, en = (json.loads((folder / f'{lang}.json').read_text()) for lang in ('es', 'en'))
            self.assertEqual(sorted(es), sorted(en), folder)
            self.assertTrue(all(isinstance(v, str) and v.strip() for v in [*es.values(), *en.values()]))
        for file in ('app.yaml', 'pages/files.yaml'):
            self.assertEqual(self.yaml(self.project / 'extensions/deliverables' / file)['name'],
                             {'es': 'Entregables', 'en': 'Deliverables'})

    def test_shell_and_json_slots_are_well_formed(self):
        for script in sorted((self.project / 'extensions').glob('*/*.sh')):
            result = subprocess.run(['bash', '-n', str(script)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, f'{script}: {result.stderr}')
        config = json.loads((self.project / 'extensions/deliverables/mcp.json').read_text())
        self.assertEqual(config['mcpServers']['deliverables'],
                         {'type': 'stdio', 'command': 'bash', 'args': ['extensions/deliverables/mcp.sh']})

    def test_workflows_follow_the_contract_and_validate_with_the_pinned_dagu(self):
        workflows = sorted((self.project / 'project/workflows').glob('ext-*.yaml'))
        names = sorted(w.stem for w in workflows if not w.stem.startswith('ext-silverbullet'))
        self.assertEqual(names, sorted(n for want in EXPECTED.values() for n in want['workflows']))
        garden = self.yaml(self.project / 'project/workflows/ext-knowledge-skills-garden.yaml')
        self.assertEqual(garden['schedule'], '0 7 * * 1')
        self.assertEqual(next(p['PROVIDER'] for p in garden['params'] if 'PROVIDER' in p), 'claude')
        digest = self.yaml(self.project / 'project/workflows/ext-ops-assistant-digest.yaml')
        self.assertEqual(digest['schedule'], '0 8 * * 1')
        self.assertEqual(next(p['LANG_UI'] for p in digest['params'] if 'LANG_UI' in p), 'es')
        dagu = pinned('aqua:dagucloud/dagu@2.24.0', 'dagu')
        if not dagu:
            self.skipTest('the pinned Dagu 2.24.0 is not installed (mise install in a generated project)')
        # An isolated Dagu home: never the user's Dagu.
        home = Path(self.tmp.name) / 'dagu-home'
        home.mkdir(exist_ok=True)
        env = {'HOME': str(home), 'DAGU_HOME': str(home), 'PATH': os.environ['PATH'],
               'FYSO_ROOT': str(self.project), 'FYSO_DATA': str(self.project / '.data')}
        for workflow in workflows:
            if workflow.stem.startswith('ext-silverbullet'):
                continue
            result = subprocess.run([dagu, 'validate', str(workflow)], env=env, capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, f'{workflow.name}: {result.stdout}{result.stderr}')

    def test_answers_change_the_schedules_and_the_ai_step(self):
        with tempfile.TemporaryDirectory(prefix='fyso-owner-ext-answers-') as temporary:
            target = Path(temporary)
            shutil.copy2(self.project / '.copier-answers.yml', target)
            self.run_ok(*COPIER, 'copy', '--trust', '--defaults', '-d', 'garden_schedule=', '-d', 'garden_ai=false',
                        str(BUNDLED / 'knowledge-skills'), str(target), cwd=target)
            garden = self.yaml(target / 'project/workflows/ext-knowledge-skills-garden.yaml')
            self.assertNotIn('schedule', garden)
            self.assertEqual(next(p['PROVIDER'] for p in garden['params'] if 'PROVIDER' in p), 'none')
            self.run_ok(*COPIER, 'copy', '--trust', '--defaults', '-d', 'digest_schedule=', '-d', 'digest_language=en',
                        '-d', 'spend_schedule=30 6 * * *', str(BUNDLED / 'ops-assistant'), str(target), cwd=target)
            digest = self.yaml(target / 'project/workflows/ext-ops-assistant-digest.yaml')
            self.assertNotIn('schedule', digest)
            self.assertEqual(next(p['LANG_UI'] for p in digest['params'] if 'LANG_UI' in p), 'en')
            spend = self.yaml(target / 'project/workflows/ext-ops-assistant-spend-cap.yaml')
            self.assertEqual(spend['schedule'], '30 6 * * *')
            bad = subprocess.run([*COPIER, 'copy', '--trust', '--defaults', '--overwrite', '-d', 'digest_schedule=every monday',
                                  str(BUNDLED / 'ops-assistant'), str(target)], cwd=target, capture_output=True, text=True, timeout=300)
            self.assertNotEqual(bad.returncode, 0)

    def test_accounting_pack_is_an_unapplied_native_team(self):
        base = self.project / 'extensions/pack-accounting'
        team = self.yaml(base / 'team.yaml')
        self.assertEqual(team['version'], 1)
        self.assertEqual(len(team['bots']), 4)
        for bot in team['bots']:
            self.assertEqual(bot['approval'], 'ask')
            self.assertTrue(bot['model'].startswith('claude/'))
            soul = bot['soul']['file'].replace('${FYSO_ROOT}/', '')
            self.assertTrue((self.project / soul).is_file(), soul)
        tasks = tomllib.loads((self.project / '.config/mise/conf.d/ext-pack-accounting.toml').read_text())
        self.assertEqual(list(tasks['tasks']), ['pack-accounting:preview'])

    def test_office_tools_are_pinned(self):
        config = tomllib.loads((self.project / '.config/mise/conf.d/ext-office-docs.toml').read_text())
        self.assertEqual(config['tools']['github:jgm/pandoc'], '3.13')
        self.assertEqual(config['tools']['aqua:typst/typst'], '0.15.1')


if __name__ == '__main__':
    unittest.main()
