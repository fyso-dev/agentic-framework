"""Real Copier packaging of the bundled owner extensions (D64-D70).

Generates a project from this checkout, installs each extension from the project's
own bundled copy, and checks the contract: only slot paths are written, nothing
else changes, and the installed files are what the framework's consumers read.
"""
import hashlib
import json
import os
from pathlib import Path
import re
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

    def test_bundled_copies_reach_the_project_with_their_copier_configuration(self):
        for ext in EXPECTED:
            self.assertTrue((self.project / f'framework/extensions/{ext}/copier.yml').is_file(), ext)
            answers = (BUNDLED / ext / 'copier.yml').read_text()
            self.assertIn(f'_answers_file: .copier-answers.ext-{ext}.yml', answers)
            self.assertRegex(ext, r'^[a-z][a-z0-9-]{1,30}$')

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
            self.assertEqual((self.project / f'extensions/{ext}/secrets.yaml').read_text().strip(), '[]', ext)
            self.assertNotIn('extension_port', (self.project / f'.copier-answers.ext-{ext}.yml').read_text(),
                             f'{ext} takes no port of the extension block')
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
                text = (self.project / f'extensions/{ext}/skills/{skill}/SKILL.md').read_text()
                match = re.match(r'---\nname: ([a-z0-9-]+)\ndescription: (.+)\n---\n', text)
                self.assertIsNotNone(match, f'{ext}/{skill}')
                self.assertEqual(match.group(1), skill)
                self.assertGreater(len(match.group(2)), 40, f'{ext}/{skill}: say when to use it')
                self.assertLess(len(text.splitlines()), 120, f'{ext}/{skill}: keep skills short')

    def test_panel_copy_is_localized_in_spanish_and_english(self):
        folders = [path for path in (self.project / 'extensions').glob('*/**/locales') if path.is_dir()]
        self.assertEqual(sorted(p.relative_to(self.project).as_posix() for p in folders),
                         ['extensions/deliverables/panel/locales', 'extensions/deliverables/ui/locales'])
        for folder in folders:
            es, en = (json.loads((folder / f'{lang}.json').read_text()) for lang in ('es', 'en'))
            self.assertEqual(sorted(es), sorted(en), folder)
            self.assertTrue(all(isinstance(v, str) and v.strip() for v in [*es.values(), *en.values()]))
        # Pages carry no hard-coded copy: text comes from the locale files.
        for page in ('panel/index.html', 'ui/index.html'):
            html = (self.project / 'extensions/deliverables' / page).read_text()
            self.assertNotRegex(html, r'>[^<>{}\n]*[A-Za-zÁÉÍÓÚáéíóú]{4,}[^<>{}\n]*</(h1|p|a|button|th|td|title)>', page)
        for file in ('app.yaml', 'pages/files.yaml'):
            text = (self.project / 'extensions/deliverables' / file).read_text()
            self.assertIn('es: Entregables', text)
            self.assertIn('en: Deliverables', text)

    def test_shell_and_json_slots_are_well_formed(self):
        for script in sorted((self.project / 'extensions').glob('*/*.sh')):
            result = subprocess.run(['bash', '-n', str(script)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, f'{script}: {result.stderr}')
            self.assertTrue(script.read_text().startswith('#!/usr/bin/env bash\n'), script)
            self.assertIn('set -euo pipefail', script.read_text(), script)
        config = json.loads((self.project / 'extensions/deliverables/mcp.json').read_text())
        self.assertEqual(config['mcpServers']['deliverables'],
                         {'type': 'stdio', 'command': 'bash', 'args': ['extensions/deliverables/mcp.sh']})

    def test_workflows_follow_the_contract_and_validate_with_the_pinned_dagu(self):
        workflows = sorted((self.project / 'project/workflows').glob('ext-*.yaml'))
        names = sorted(w.stem for w in workflows if not w.stem.startswith('ext-silverbullet'))
        self.assertEqual(names, sorted(n for want in EXPECTED.values() for n in want['workflows']))
        garden = (self.project / 'project/workflows/ext-knowledge-skills-garden.yaml').read_text()
        self.assertIn('schedule: "0 7 * * 1"', garden)
        self.assertRegex(garden, r'- PROVIDER: claude\b')
        self.assertIn('Write(./proposals.md)', garden)
        digest = (self.project / 'project/workflows/ext-ops-assistant-digest.yaml').read_text()
        self.assertIn('schedule: "0 8 * * 1"', digest)
        self.assertRegex(digest, r'- LANG_UI: es\b')
        # Every openmausbot call names this project's port (never the desktop app on 8799).
        for script in (self.project / 'extensions').glob('*/*.sh'):
            for line in script.read_text().splitlines():
                if re.search(r'(^|[|;&]\s*|\s)openmausbot\s+(send|run|team|wait)', line):
                    self.assertIn('--port "$FYSO_OMB_PORT"', line, script)
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
            garden = (target / 'project/workflows/ext-knowledge-skills-garden.yaml').read_text()
            self.assertNotIn('schedule:', garden)
            self.assertRegex(garden, r'- PROVIDER: none\b')
            self.run_ok(*COPIER, 'copy', '--trust', '--defaults', '-d', 'digest_schedule=', '-d', 'digest_language=en',
                        '-d', 'spend_schedule=30 6 * * *', str(BUNDLED / 'ops-assistant'), str(target), cwd=target)
            self.assertNotIn('schedule:', (target / 'project/workflows/ext-ops-assistant-digest.yaml').read_text())
            self.assertIn('schedule: "30 6 * * *"', (target / 'project/workflows/ext-ops-assistant-spend-cap.yaml').read_text())
            bad = subprocess.run([*COPIER, 'copy', '--trust', '--defaults', '--overwrite', '-d', 'digest_schedule=every monday',
                                  str(BUNDLED / 'ops-assistant'), str(target)], cwd=target, capture_output=True, text=True, timeout=300)
            self.assertNotEqual(bad.returncode, 0)

    def test_accounting_pack_is_a_cautious_native_team_file_without_domain_facts(self):
        base = self.project / 'extensions/pack-accounting'
        team = (base / 'team.yaml').read_text()
        self.assertIn('version: 1', team)
        self.assertEqual(team.count('approval: ask'), 4)
        self.assertNotIn('approval: full', team)
        self.assertEqual(len(re.findall(r'model: claude/', team)), 4, 'default engine is claude')
        for soul in re.findall(r'souls/([a-z-]+\.md)', team):
            text = (base / 'souls' / soul).read_text()
            self.assertIn('extensions/pack-accounting/souls/rules.md', text, soul)
        rules = (base / 'souls/rules.md').read_text()
        self.assertIn('review with a qualified accountant', rules)
        self.assertIn('Never fill the gap from memory', rules)
        # No invented regulation: no percentages, currency amounts, form or law numbers, country names.
        for file in sorted(base.rglob('*.md')) + [base / 'team.yaml']:
            text = file.read_text()
            self.assertNotRegex(text, r'\d+(\.\d+)?\s?%|[$€£]\s?\d|\b(IVA|VAT|IRS|AFIP|SAT|HMRC|GAAP|IFRS|NIIF)\b', file)
        # Applying is a person's decision: the only task is OpenMausBot's dry run on the project's port.
        tasks = (self.project / '.config/mise/conf.d/ext-pack-accounting.toml').read_text()
        self.assertIn('bots.sh plan extensions/pack-accounting/team.yaml', tasks)
        self.assertNotIn('apply', tasks)

    def test_guides_state_what_was_decided(self):
        office = (self.project / '.config/mise/conf.d/ext-office-docs.toml').read_text()
        self.assertIn('"github:jgm/pandoc" = "3.13"', office)
        self.assertIn('"aqua:typst/typst" = "0.15.1"', office)
        for conf in (self.project / '.config/mise/conf.d').glob('ext-*.toml'):
            self.assertNotRegex(conf.read_text(), r'latest|FYSO_EXT_[A-Z_]+_PORT', conf)
        caddy = (self.project / 'extensions/deliverables/Caddyfile').read_text()
        self.assertIn('http://files.{$FYSO_WEB_DOMAIN}:{$FYSO_HTTP_PORT}', caddy)
        self.assertIn('import fyso_login', caddy)
        self.assertIn('Content-Disposition attachment', caddy)
        self.assertNotIn('reverse_proxy', caddy, 'no server of its own')
        self.assertIn('does not need', (self.project / 'extensions/knowledge-skills/README.md').read_text())
        self.assertIn('does not pause', (self.project / 'extensions/ops-assistant/README.md').read_text())


if __name__ == '__main__':
    unittest.main()
