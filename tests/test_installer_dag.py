"""The macOS installer's Dagu workflow is generated from the template's pinned tools (D35)."""
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class InstallerDag(unittest.TestCase):
    def test_one_step_per_pinned_tool_in_dependency_order(self):
        tools = re.findall(r'^"([^"]+)" = "([^"]+)"', (ROOT / 'template/mise.toml.jinja').read_text().split('[tools]')[1].split('\n[')[0], re.M)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'dag.yaml'
            ids = subprocess.run([sys.executable, str(ROOT / 'installer/macos/make-dag.py'), str(ROOT / 'template/mise.toml.jinja'), str(out)],
                                 check=True, capture_output=True, text=True).stdout.split()
            text = out.read_text()
        self.assertEqual(ids[-1], 'web_auth')
        self.assertEqual(len(ids), len(tools) + 1)
        for step in ['generate', 'trust', *ids, 'setup', 'git', 'start']:
            self.assertRegex(step, r'^[a-zA-Z][a-zA-Z0-9_]*$')  # Dagu step id format
            self.assertIn(f'  - id: {step}\n', text)
        for tool, version in tools:
            self.assertIn(f'install "{tool}@{version}"', text)
        # The web login is never built at install time: no Go or pnpm step (D87).
        self.assertNotIn('core:go', text)
        self.assertNotIn('core:pnpm', text)
        # Tools never wait for the project; npm packages wait only for Node (D87).
        self.assertRegex(text, r'id: tool_openmausbot\n    run: cd / && MISE_NPM_PACKAGE_MANAGER=npm "\$MISE" exec "core:node@[0-9.]+" -- .*\n    depends: \[tool_node\]')
        self.assertRegex(text, r'id: tool_caddy\n    run: cd / && .*\n  - id:')
        # The bundled web login reaches its step as environment variables.
        self.assertRegex(text, r'id: web_auth\n    run: >-\n      cd "\$DIR" && FYSO_TINYAUTH_BUNDLED_BIN="\$TINYAUTH_BIN" FYSO_TINYAUTH_BUNDLED_META="\$TINYAUTH_META"\n.*run web-auth:install\n    depends: \[trust, tool_node\]')
        # setup waits only for what it uses; start waits for every tool and the web login;
        # the first commit comes after setup so it includes .sops.yaml and the secrets.
        self.assertIn('depends: [trust, tool_age, tool_sops, tool_node, tool_yaml, tool_caddy]', text)
        self.assertIn(f'depends: [git, {", ".join(ids)}]', text)
        self.assertRegex(text, r'id: git\n    run: >-\n(?:      .*\n)+    depends: \[setup\]')
        # Parameters reach commands as environment variables, never interpolated.
        self.assertNotIn('${params.', text)


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
