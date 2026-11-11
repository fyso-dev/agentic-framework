"""Framework update recovery through real Git/Copier and bounded activation fixtures."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
COPIER = ['uvx', '--from', 'copier==9.19.1', 'copier']


class FrameworkUpdate(unittest.TestCase):
    def test_retry_after_activation_failure_and_noop(self):
        cases = [('install', False, False), ('mcp', False, False), ('panel', False, False),
                 ('', True, False), ('', False, True)]
        for failing_step, relative, alternative in cases:
            with self.subTest(failing_step=failing_step, relative=relative, alternative=alternative), \
                    tempfile.TemporaryDirectory(prefix='update R&D # ') as tmp:
                base = Path(tmp)
                source, project, toolbin = [base / name for name in ['source', 'project', 'bin']]
                source.mkdir()
                project.mkdir()
                toolbin.mkdir()
                env = {**os.environ, 'PATH': str(toolbin) + os.pathsep + os.environ['PATH'],
                       'GIT_AUTHOR_NAME': 'Fixture', 'GIT_AUTHOR_EMAIL': 'fixture@example.invalid',
                       'GIT_COMMITTER_NAME': 'Fixture', 'GIT_COMMITTER_EMAIL': 'fixture@example.invalid',
                       'REF': '', 'SRC': '', 'FYSO_PROJECT': 'update-fixture', 'FYSO_HTTP_PORT': '0'}

                def run(args, cwd=project, check=True):
                    result = subprocess.run(args, cwd=cwd, env=env, capture_output=True,
                                            text=True, timeout=120)
                    if check:
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    return result

                def commit(cwd):
                    run(['git', 'add', '.'], cwd)
                    run(['git', 'commit', '-qm', 'fixture'], cwd)

                (source / 'copier.yml').write_text('_subdirectory: template\n')
                (source / 'template').mkdir()
                (source / 'template/.copier-answers.yml.jinja').write_text(
                    '{{ _copier_answers | to_nice_yaml -}}\n')
                payload = source / 'template/payload.txt'
                payload.write_text('v1\n')
                run(['git', 'init', '-q'], source)
                commit(source)
                run(['git', 'tag', 'v1.0.0'], source)
                run(COPIER + ['copy', '--trust', '--defaults',
                              '../source' if relative else str(source), '.'], project)
                env['SRC'] = '../source' if alternative else ''
                scripts = project / 'framework/scripts'
                scripts.mkdir(parents=True)
                for name in ['update.sh', 'lib.sh', 'extensions.cjs']:
                    shutil.copy2(ROOT / 'template/framework/scripts' / name, scripts)
                for name, step in [('mcp-config.cjs', 'mcp'), ('panel-data.cjs', 'panel')]:
                    (scripts / name).write_text(
                        "const fs=require('fs');\n"
                        f"fs.appendFileSync('.data/activation', '{step}\\n');\n"
                        f"if(fs.readFileSync('.data/fail','utf8').trim()==='{step}') process.exit(1);\n")
                (project / '.gitignore').write_text('.data/\n')
                (project / '.data').mkdir()
                (toolbin / 'mise').write_text('#!/usr/bin/env bash\nset -eu\n'
                    'echo install >> .data/activation\n'
                    '[ "$(cat .data/fail)" != install ]\n')
                (toolbin / 'mise').chmod(0o755)
                run(['git', 'init', '-q'])
                commit(project)
                payload.write_text('v2\n')
                commit(source)
                run(['git', 'tag', 'v2.0.0'], source)
                fail = project / '.data/fail'
                fail.write_text(failing_step)
                failed = run(['bash', 'framework/scripts/update.sh'], check=False)
                if failing_step:
                    self.assertNotEqual(failed.returncode, 0)
                else:
                    self.assertEqual(failed.returncode, 0, failed.stdout + failed.stderr)
                    self.assertTrue(json.loads(failed.stdout)['changed'])
                self.assertEqual((project / 'payload.txt').read_text(), 'v2\n')
                answers = json.loads(run(['node', '-e',
                    'console.log(JSON.stringify(require("./framework/scripts/extensions.cjs").read(process.argv[1])))',
                    '.copier-answers.yml']).stdout)
                self.assertEqual(answers['_src_path'], '../source' if relative else str(source))
                applied_head = run(['git', 'rev-parse', 'HEAD']).stdout
                for _ in range(2):
                    fail.write_text('')
                    (project / '.data/activation').write_text('')
                    result = json.loads(run(['bash', 'framework/scripts/update.sh']).stdout)
                    self.assertFalse(result['changed'])
                    self.assertIsNone(result['commit'])
                    self.assertEqual((project / '.data/activation').read_text().splitlines(),
                                     ['install', 'mcp', 'panel'])
                    self.assertEqual(run(['git', 'rev-parse', 'HEAD']).stdout, applied_head)
                    self.assertEqual(run(['git', 'status', '--porcelain']).stdout, '')
                    self.assertEqual(len(run(['git', 'worktree', 'list']).stdout.splitlines()), 1)


if __name__ == '__main__':
    unittest.main()
