"""Real process-compose/Copier acceptance: connect only after native readiness."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]

class HookLifecycle(unittest.TestCase):
    def test_hot_install_and_upgrade_wait_for_their_service(self):
        for tool in ['process-compose', 'uvx', 'node']:
            if not shutil.which(tool):
                self.skipTest(f'{tool} unavailable')
        with tempfile.TemporaryDirectory(prefix='extension-hook-') as temporary:
            base = Path(temporary)
            project = base / 'project'
            project.mkdir()
            scripts = project / 'framework/scripts'
            shutil.copytree(ROOT / 'template/framework/scripts', scripts)
            shutil.copy2(ROOT / 'template/framework/mcp.json', project / 'framework/mcp.json')
            (project / 'project/bots').mkdir(parents=True)
            (project / 'project/bots/team.yaml').write_text('version: 1\nbots: []\n')
            (project / '.data').mkdir()
            (project / 'README.md').write_text('keep this project file\n')
            (project / '.gitignore').write_text('.data/\nbin/\n')
            # D58 activation restarts the login authority as well as Caddy. Keep both
            # native process names in this fixture; no auth server is needed here.
            (project / 'process-compose.yaml').write_text('version: "0.5"\nprocesses:\n  caddy:\n    command: sleep 300\n  web-auth:\n    command: sleep 300\n')
            toolbin = project / 'bin'
            toolbin.mkdir()
            (toolbin / 'yaml').symlink_to(ROOT / 'template/framework/panel/node_modules/yaml/bin.mjs')
            # Tool installation/environment refresh is an external boundary. Use
            # native Copier and process-compose for their actual lifecycle.
            mise = toolbin / 'mise'
            mise.write_text('#!/usr/bin/env bash\nset -eu\ncase "$1" in\n exec) shift; if [[ "${1:-}" == -- ]]; then shift; fi; exec "$@" ;;\n trust|install) exit 0 ;;\n *) exit 1 ;;\nesac\n')
            mise.chmod(0o755)
            slug = 'hook-' + uuid.uuid4().hex[:10]
            socket = f'/tmp/fyso-{slug}-19400.sock'
            ambient = {key:value for key,value in os.environ.items() if key in {'PATH','HOME','USER','TMPDIR','LANG','LC_ALL','TERM'}}
            env = {**ambient, 'PATH':str(toolbin)+os.pathsep+os.environ['PATH'],
                   'FYSO_ROOT':str(project), 'FYSO_DATA':str(project / '.data'),
                   'FYSO_PROJECT':slug, 'FYSO_PROJECT_NAME':'Hook fixture', 'FYSO_HTTP_PORT':'19400'}
            def run(args, cwd=project):
                result = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True, timeout=120)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                return result.stdout
            def commit(directory):
                run(['git', 'add', '.'], directory)
                run(['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'], directory)
            source = base / 'service.git'
            slot = source / 'extensions/service'
            slot.mkdir(parents=True)
            (source / 'copier.yml').write_text('_min_copier_version: "9.19.1"\n_answers_file: .copier-answers.ext-service.yml\n_templates_suffix: .jinja\n_exclude: [copier.yml, .git]\n')
            (source / '.copier-answers.ext-service.yml.jinja').write_text('{{ _copier_answers | to_nice_yaml -}}\n')
            def version(number):
                marker = f'.data/service-ready-{number}'
                (slot / 'process.yaml').write_text('version: "0.5"\nprocesses:\n  ext-service:\n'
                    f'    command: bash -c "sleep 1; touch {marker}; exec sleep 300"\n'
                    '    readiness_probe:\n      exec:\n'
                    f'        command: test -f {marker}\n'
                    '      period_seconds: 1\n      failure_threshold: 30\n')
                (slot / 'connect.sh').write_text(f'#!/usr/bin/env bash\nset -eu\ntest -f {marker}\nprintf "{number}\\n" >> .data/hook-runs\n')
                commit(source)
                run(['git', 'tag', f'v{number}.0.0'], source)
            run(['git', 'init', '-q'], source)
            version(1)
            catalog = base / 'catalog'
            catalog.mkdir()
            (catalog / 'marketplace.yaml').write_text(f'name: Fixture\nextensions:\n  - id: service\n    src: {source.as_uri()}\n    name: Service\n')
            run(['git', 'init', '-q'], catalog)
            commit(catalog)
            (project / 'project/marketplaces.yaml').write_text(f'- {catalog.as_uri()}\n')
            run(['git', 'init', '-q'], project)
            commit(project)
            run(['git', 'config', 'user.name', 'Fixture'])
            run(['git', 'config', 'user.email', 'fixture@example.invalid'])
            try:
                run(['process-compose', '-f', 'process-compose.yaml', 'up', '--detached', '--unix-socket', socket])
                result = json.loads(run(['bash', 'framework/scripts/ext.sh', 'apply', 'add', 'service']))
                self.assertEqual(result['version'], 'v1.0.0')
                self.assertEqual((project / '.data/hook-runs').read_text().splitlines(), ['1'])
                version(2)
                result = json.loads(run(['bash', 'framework/scripts/ext.sh', 'apply', 'update', 'service']))
                self.assertEqual(result['version'], 'v2.0.0')
                self.assertEqual((project / '.data/hook-runs').read_text().splitlines(), ['1', '2'])
                self.assertEqual((project / 'README.md').read_text(), 'keep this project file\n')
            finally:
                subprocess.run(['process-compose', 'down', '--unix-socket', socket], cwd=project, env=env,
                               capture_output=True, timeout=30)

if __name__ == '__main__':
    unittest.main()
