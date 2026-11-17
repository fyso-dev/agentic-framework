"""The macOS installer's Dagu workflow is generated from the template's pinned tools (D35)."""
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class InstallerDag(unittest.TestCase):
    def dag(self, target):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'dag.yaml'
            ids = subprocess.run([sys.executable, str(ROOT / 'installer/macos/make-dag.py'), str(ROOT / 'template/mise.toml.jinja'), str(out)],
                                 check=True, capture_output=True, text=True, env={**os.environ, 'FYSO_INSTALLER_OS': target}).stdout.split()
            return ids, out.read_text()

    def test_one_step_per_pinned_tool_in_dependency_order(self):
        block = (ROOT / 'template/mise.toml.jinja').read_text().split('[tools]')[1].split('\n[')[0]
        tools = re.findall(r'^"([^"]+)" = (?:"([^"]+)"|\{ version = "([^"]+)"(?:, os = \[([^\]]*)\])? \})', block, re.M)
        for target in ['macos', 'linux']:
            ids, text = self.dag(target)
            wanted = [(t, a or b) for t, a, b, only in tools if not only or f'"{target}"' in only]
            self.assertEqual(ids[-1], 'web_auth')
            self.assertEqual(len(ids), len(wanted) + 1)
            for step in ['generate', 'trust', *ids, 'setup', 'git', 'start']:
                self.assertRegex(step, r'^[a-zA-Z][a-zA-Z0-9_]*$')  # Dagu step id format
                self.assertIn(f'  - id: {step}\n', text)
            for tool, version in wanted:
                self.assertIn(f'install "{tool}@{version}"', text)
            # npm tools need Node and the project; other tools start at once (D87).
            self.assertRegex(text, r'id: tool_openmausbot\n    run: .*\n    depends: \[trust, tool_node\]')
            self.assertRegex(text, r'id: tool_caddy\n    run: cd / && .*\n  - id:')
            # setup waits only for what it uses; start waits for every tool and the web login;
            # the first commit comes after setup so it includes .sops.yaml and the secrets.
            self.assertIn('depends: [trust, tool_age, tool_sops, tool_node, tool_yaml, tool_caddy]', text)
            self.assertIn(f'depends: [git, {", ".join(ids)}]', text)
            self.assertRegex(text, r'id: git\n    run: >-\n(?:      .*\n)+    depends: \[setup\]')
            self.assertNotIn('${params.', text)
        mac, linux = self.dag('macos')[1], self.dag('linux')[1]
        # Go and pnpm only build the web login on macOS; Linux uses the upstream binary.
        self.assertIn('id: web_auth\n    run: cd "$DIR" && MISE_TASK_RUN_AUTO_INSTALL=false "$MISE" run web-auth:install\n    depends: [trust, tool_node, tool_go, tool_pnpm]', mac)
        self.assertIn('depends: [trust, tool_node]\n  - id: setup', linux)
        self.assertNotIn('core:go', linux)
        self.assertNotIn('core:pnpm', linux)


class InstallerResources(unittest.TestCase):
    def test_locales_cover_all_workflow_steps(self):
        with tempfile.TemporaryDirectory() as tmp:
            ids = subprocess.check_output([sys.executable, str(ROOT / 'installer/macos/make-dag.py'),
                                           str(ROOT / 'template/mise.toml.jinja'), str(Path(tmp) / 'dag.yaml')], text=True).split()
        for lang in ['es', 'en']:
            script = '. "$1"; shift; for sid; do key="STEP_$sid"; printf "%s\\n" "${!key}"; done'
            result = subprocess.run(['/bin/bash', '-eu', '-c', script, 'test',
                                     str(ROOT / f'installer/macos/locales/{lang}.sh'),
                                     'generate', 'trust', *ids, 'setup', 'git', 'start'], check=True, capture_output=True, text=True)
            self.assertEqual(len(result.stdout.splitlines()), len(ids) + 5)

    def test_repeated_names_get_unique_bounded_slug_and_directory(self):
        source = (ROOT / 'installer/macos/fyso-installer.sh').read_text()
        code = source[source.index('taken_slugs() {'):source.index('echo "name=$NAME')]
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            base = 'a' * 31
            (folder / base).mkdir()
            registry = folder / 'registry.tsv'
            installed = folder / 'installed'; installed.mkdir()
            (installed / '.copier-answers.yml').write_text(f'project_slug: {base[:-2]}-2\n')
            registry.write_text(f'8400\t{installed}\n')
            result = subprocess.run(['/bin/bash', '-eu', '-c',
                'FOLDER=$1; REGISTRY=$2; SLUG=$3; ' + code + '\nprintf "%s\\n%s\\n" "$SLUG" "$DIR"',
                'test', str(folder), str(registry), base], check=True, capture_output=True, text=True)
            slug, directory = result.stdout.splitlines()
            self.assertEqual(slug, base[:-2] + '-3')
            self.assertEqual(directory, str(folder / slug))


if __name__ == '__main__':
    unittest.main()
