"""A native OMB team export must retain its required relative skill sidecars."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SnapshotSidecarTests(unittest.TestCase):
    def test_complete_bundle_is_portable_and_stale_sidecars_are_removed(self):
        with tempfile.TemporaryDirectory(prefix="fyso-snapshot-") as directory:
            root = Path(directory)
            shutil.copytree(ROOT / "template/framework/scripts", root / "framework/scripts")
            tools = root / "bin"
            tools.mkdir()
            omb = tools / "openmausbot"
            omb.write_text("""#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
if sys.argv[1]=='bots':
    print(json.dumps({'bots':[{'id':'fixture-bot','name':'A'}]}));sys.exit(0)
out=Path(sys.argv[sys.argv.index('--out')+1]);out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'version':1,'bots':[{'name':'A','cwd':os.environ['FYSO_ROOT'],'skills':[{'file':'skills/a/test/SKILL.md'},{'file':'skills/a/ambient/SKILL.md'}]}]}))
skill=out.parent/'skills/a/test/SKILL.md';skill.parent.mkdir(parents=True)
skill.write_text('Root: '+os.environ['FYSO_ROOT']+'\\nHome: '+os.environ['HOME']+'\\n')
""")
            omb.chmod(0o755)
            preload = root / "fake-native-api.cjs"
            preload.write_text("global.fetch=async()=>({ok:true,json:async()=>({skills:[{name:'test',origin:'imported'},{name:'ambient',origin:'native'}]})});")
            env = dict(os.environ, NODE_OPTIONS="--require " + str(preload), FYSO_ROOT=str(root), FYSO_DATA=str(root / ".data"),
                       FYSO_OMB_PORT="19244", PATH=str(tools) + os.pathsep + os.environ["PATH"])
            command = [str(root / "framework/scripts/snapshot.sh"), "bots"]
            subprocess.run(command, env=env, check=True, capture_output=True)
            skill = root / "state/bots/skills/a/test/SKILL.md"
            self.assertTrue(skill.exists())
            self.assertNotIn("ambient", (root / "state/bots/team.yaml").read_text())
            self.assertIn("${FYSO_ROOT}", skill.read_text())
            self.assertIn("${HOME}", skill.read_text())
            self.assertNotIn(str(root), skill.read_text())
            stale = skill.parent / "stale.md"
            stale.write_text("obsolete")
            subprocess.run(command, env=env, check=True, capture_output=True)
            self.assertFalse(stale.exists())

    def test_render_preserves_instruction_placeholders_and_resolves_only_file_paths(self):
        with tempfile.TemporaryDirectory(prefix="fyso-team-render-") as directory:
            root = Path(directory)
            team = root / "bots/team.yaml"
            team.parent.mkdir()
            team.write_text('version: 1\nbots:\n  - name: A\n    cwd: ${FYSO_ROOT}\n    soul: "Use ${FYSO_ROOT} as a variable"\n    skills:\n      - file: skills/example/SKILL.md\n  - name: B\n    soul: { file: ${FYSO_ROOT}/project/soul.md }\n')
            result = subprocess.run(["node", str(ROOT / "template/framework/scripts/render-team.cjs"), str(team)],
                                    env=dict(os.environ, FYSO_ROOT=str(root)), check=True, capture_output=True, text=True)
            import json
            data = json.loads(result.stdout)
            self.assertEqual(data["bots"][0]["soul"], "Use ${FYSO_ROOT} as a variable")
            self.assertEqual(data["bots"][0]["cwd"], str(root))
            self.assertEqual(data["bots"][0]["skills"][0]["file"], str(team.parent / "skills/example/SKILL.md"))
            self.assertEqual(data["bots"][1]["soul"]["file"], str(root / "project/soul.md"))
