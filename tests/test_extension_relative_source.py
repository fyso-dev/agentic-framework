"""Real Copier upgrade with local paths, preserving answers and unrelated changes."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
COPIER = ['uvx', '--from', 'copier==9.19.1', 'copier']


class RelativeExtensionSource(unittest.TestCase):
    def test_upgrade_paths_with_replacement_metacharacters(self):
        for name in ['plain', 'R&D', 'release#1', 'R&D #1']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                base = Path(tmp) / name
                base.mkdir()
                source, project, toolbin = [base / n for n in ['fyso-ext-foo', 'project', 'bin']]
                source.mkdir()
                project.mkdir()
                toolbin.mkdir()
                env = {**os.environ, 'PATH': str(toolbin) + os.pathsep + os.environ['PATH'],
                       'GIT_AUTHOR_NAME': 'Fixture', 'GIT_AUTHOR_EMAIL': 'fixture@example.invalid',
                       'GIT_COMMITTER_NAME': 'Fixture', 'GIT_COMMITTER_EMAIL': 'fixture@example.invalid',
                       'FYSO_PROJECT': 'relative-fixture', 'FYSO_HTTP_PORT': '0'}

                def run(args, cwd=project):
                    result = subprocess.run(args, cwd=cwd, env=env, capture_output=True,
                                            text=True, timeout=120)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    return result.stdout

                def commit(cwd):
                    run(['git', 'add', '.'], cwd)
                    run(['git', 'commit', '-qm', 'fixture'], cwd)

                (source / 'copier.yml').write_text(
                    '_answers_file: .copier-answers.ext-foo.yml\n_exclude: [copier.yml, .git]\n')
                (source / '.copier-answers.ext-foo.yml.jinja').write_text(
                    '{{ _copier_answers | to_nice_yaml -}}\n')
                payload = source / 'extensions/foo/payload.txt'
                payload.parent.mkdir(parents=True)
                payload.write_text('v1\n')
                run(['git', 'init', '-q'], source)
                commit(source)
                run(['git', 'tag', 'v1.0.0'], source)
                run(COPIER + ['copy', '--trust', '--defaults', '../fyso-ext-foo', '.'])
                scripts = project / 'framework/scripts'
                scripts.mkdir(parents=True)
                for script in ['ext.sh', 'lib.sh', 'extensions.cjs']:
                    shutil.copy2(ROOT / 'template/framework/scripts' / script, scripts)
                for script in ['mcp-config.cjs', 'panel-data.cjs']:
                    (scripts / script).write_text('process.exit(0);\n')
                (toolbin / 'mise').write_text('#!/usr/bin/env bash\nset -eu\n'
                    'case "$1" in\n exec) shift; [ "$1" != -- ] || shift; exec "$@";;\n'
                    ' trust|install) exit 0;;\n *) exit 1;;\nesac\n')
                (toolbin / 'mise').chmod(0o755)
                yaml_path = shutil.which('yaml')
                self.assertIsNotNone(yaml_path, 'yaml CLI must be on PATH')
                run(['git', 'init', '-q'])
                commit(project)
                initial = run(['git', 'rev-parse', 'HEAD']).strip()
                (project / 'unrelated.txt').write_text('work in progress\n')
                payload.write_text('v2\n')
                commit(source)
                run(['git', 'tag', 'v2.0.0'], source)
                result = json.loads(run(['bash', 'framework/scripts/ext.sh', 'apply', 'update', 'foo']))
                self.assertEqual(result['version'], 'v2.0.0')
                self.assertEqual((project / 'extensions/foo/payload.txt').read_text(), 'v2\n')
                answers = json.loads(run(['node', '-e',
                    'console.log(JSON.stringify(require("./framework/scripts/extensions.cjs").read(process.argv[1])))',
                    '.copier-answers.ext-foo.yml']))
                self.assertEqual(answers['_src_path'], '../fyso-ext-foo')
                self.assertEqual(run(['git', 'rev-list', '--count', initial + '..HEAD']).strip(), '1')
                self.assertEqual(run(['git', 'status', '--porcelain']).strip(), '?? unrelated.txt')
                self.assertEqual(len(run(['git', 'worktree', 'list']).splitlines()), 1)
                head = run(['git', 'rev-parse', 'HEAD'])
                run(['bash', 'framework/scripts/ext.sh', 'apply', 'update', 'foo'])
                self.assertEqual(run(['git', 'rev-parse', 'HEAD']), head)


if __name__ == '__main__':
    unittest.main()
