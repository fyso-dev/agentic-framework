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
        self.assertEqual(len(ids), len(tools))
        for step in ['generate', 'trust', *ids, 'git', 'setup', 'start']:
            self.assertRegex(step, r'^[a-zA-Z][a-zA-Z0-9_]*$')  # Dagu step id format
            self.assertIn(f'  - id: {step}\n', text)
        for tool, version in tools:
            self.assertIn(f'install "{tool}@{version}"', text)
        # npm tools need Node first; setup waits for every tool and git.
        self.assertRegex(text, r'id: tool_openmausbot\n    run: .*\n    depends: \[trust, tool_node\]')
        self.assertIn(f'depends: [git, {", ".join(ids)}]', text)
        # Parameters reach commands as environment variables, never interpolated.
        self.assertNotIn('${params.', text)


if __name__ == '__main__':
    unittest.main()
