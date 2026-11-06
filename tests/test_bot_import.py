"""Native-format import regression fixtures; no real provider or runtime mutation."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class BotImportTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="fyso-import-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        shutil.copytree(ROOT / "template/framework/scripts", self.root / "framework/scripts")
        (self.root / "project/bots").mkdir(parents=True)
        self.project = self.root / "project/bots/team.yaml"
        self.original = '# Keep this comment\nversion: 1\nbots:\n  - name: Existing\n    model: codex/gpt-test\n'
        self.project.write_text(self.original)
        tools = self.root / "bin"
        tools.mkdir()
        omb = tools / "openmausbot"
        omb.write_text('''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
assert '--port' in sys.argv
if sys.argv[1]=='bots':
 print(json.dumps({'bots':[{'id':'native-id','name':'Imported'}]}));sys.exit(0)
assert sys.argv[1:3]==['team','export'], 'runtime mutations are forbidden'
out=Path(sys.argv[sys.argv.index('--out')+1]);out.parent.mkdir(parents=True,exist_ok=True)
bot={'name':'Imported','title':'Preserve native profile','model':'codex/gpt-test','soul':'Preserve these instructions','approval':'ask','computer':'off','cwd':os.environ['FYSO_ROOT']}
if os.environ.get('TEST_DEFAULT_FOLDER')=='1':
 bot.pop('cwd');bot.pop('computer')
if os.environ.get('TEST_SKILL')=='1':
 bot['skills']=[{'file':'skills/imported/helper/SKILL.md'}]
 skill=out.parent/'skills/imported/helper/SKILL.md';skill.parent.mkdir(parents=True);skill.write_text('A portable imported skill')
out.write_text(json.dumps({'version':1,'bots':[bot]}))
''')
        omb.chmod(0o755)
        preload = self.root / "native.cjs"
        preload.write_text("global.fetch=async(url,opts={})=>{if(opts.method && opts.method!=='GET')throw Error('runtime mutation forbidden');return {ok:true,json:async()=>url.endsWith('/skills')?{skills:[{name:'helper',origin:'imported'}]}:{bots:[{id:'native-id',name:'Imported'}]}}};")
        self.env = dict(os.environ, FYSO_ROOT=str(self.root), FYSO_DATA=str(self.root / ".data"), FYSO_OMB_PORT="19284", BOT_ID="native-id", PATH=str(tools)+os.pathsep+os.environ["PATH"], NODE_OPTIONS="--require "+str(preload), GIT_AUTHOR_NAME="Test", GIT_AUTHOR_EMAIL="test@example.invalid", GIT_COMMITTER_NAME="Test", GIT_COMMITTER_EMAIL="test@example.invalid")
        self.git("init", "-q")
        self.git("add", "project")
        self.git("commit", "-qm", "fixture")
        self.before = self.git("rev-parse", "HEAD").strip()

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root, env=self.env, text=True)

    def invoke(self, **changes):
        return subprocess.run(["node", "-e", "require('./framework/scripts/import-bot.cjs').importBot().then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exit(1)})"], cwd=self.root, env=dict(self.env, **changes), capture_output=True, text=True)

    def test_inline_profile_import_commits_without_empty_sidecar_path_and_replays(self):
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["botId"], "native-id")
        self.assertNotEqual(data["commit"], self.before)
        text = self.project.read_text()
        self.assertTrue(text.startswith(self.original))
        self.assertIn("Preserve these instructions", text)
        self.assertNotIn(str(self.root), text)
        self.assertEqual(self.git("diff", "--name-only", self.before).strip(), "project/bots/team.yaml")
        self.assertTrue(json.loads(self.invoke().stdout)["replayed"])
        self.assertEqual(self.git("rev-parse", "HEAD").strip(), data["commit"])

    def test_selected_imported_skills_are_copied_and_committed(self):
        result = self.invoke(TEST_SKILL="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        relative = "project/bots/imported/native-id/skills/imported/helper/SKILL.md"
        self.assertEqual((self.root / relative).read_text(), "A portable imported skill")
        self.assertIn("imported/native-id/skills/imported/helper/SKILL.md", self.project.read_text())
        self.assertEqual(self.git("show", "HEAD:"+relative), "A portable imported skill")

    def test_dirty_project_is_rejected_and_commit_failure_rolls_back_only_import(self):
        self.project.write_text(self.original+"# local work\n")
        result = self.invoke()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("uncommitted changes", result.stderr)
        self.assertTrue(self.project.read_text().endswith("# local work\n"))
        self.project.write_text(self.original)
        self.git("config", "core.hooksPath", ".git/hooks")
        hook = self.root / ".git/hooks/pre-commit"
        hook.write_text("#!/bin/sh\nexit 1\n")
        hook.chmod(0o755)
        result = self.invoke(TEST_SKILL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.project.read_text(), self.original)
        self.assertFalse((self.root / "project/bots/imported/native-id").exists())
        self.assertEqual(self.git("diff", "--cached", "--name-only"), "")
        self.assertEqual(self.git("rev-parse", "HEAD").strip(), self.before)

    def test_omitted_native_defaults_do_not_inherit_project_defaults(self):
        self.project.write_text('version: 1\ndefaults:\n  computer: off\n  cwd: ${FYSO_ROOT}\nbots:\n  - name: Existing\n    model: codex/gpt-test\n')
        self.git("add", "project")
        self.git("commit", "-qm", "defaults fixture")
        result = self.invoke(TEST_DEFAULT_FOLDER="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        text = self.project.read_text()
        self.assertNotIn('defaults:', text)
        existing, imported = text.split('  - name: Imported')
        self.assertIn('computer: off', existing)
        self.assertIn('cwd: ${FYSO_ROOT}', existing)
        self.assertNotIn('cwd:', imported)
        self.assertNotIn('computer:', imported)
