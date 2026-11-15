"""Optional native Dagu integration for the clean_exec XDG boundary.

Set FYSO_TEST_DAGU_BIN to the pinned Dagu 2.24.0 binary. This creates only
temporary data and loopback listeners and runs a stub, never the mise CLI.
"""
import base64
import json
import shutil
import shlex
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / 'template/framework/scripts/lib.sh'
DAGU = os.environ.get('FYSO_TEST_DAGU_BIN')


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


@unittest.skipUnless(DAGU, 'set FYSO_TEST_DAGU_BIN to the pinned Dagu binary')
class DaguCleanExecXdg(unittest.TestCase):
    def test_server_step_inherits_only_explicit_isolation_and_project_environment(self):
        version = subprocess.run([DAGU, 'version'], capture_output=True, text=True, check=True).stdout.strip()
        self.assertEqual(version, '2.24.0')
        with tempfile.TemporaryDirectory(prefix='fyso-dagu-xdg-') as directory:
            root = Path(directory)
            dags = root / 'project/workflows'
            dags.mkdir(parents=True)
            scripts = root / 'framework/scripts'
            scripts.mkdir(parents=True)
            shutil.copy2(LIB, scripts / 'lib.sh')
            shutil.copy2(ROOT / 'template/framework/scripts/run-dagu.sh', scripts / 'run-dagu.sh')
            (root / 'bin').mkdir()
            (root / 'bin/dagu').symlink_to(DAGU)
            stub = root / 'mise-stub'
            stub.write_text('#!/bin/sh\nprintf "%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n" "${XDG_STATE_HOME-}" "${XDG_CONFIG_HOME-}" "${XDG_DATA_HOME-}" "${XDG_CACHE_HOME-}" "${MISE_DATA_DIR-}" "${MISE_CACHE_DIR-}" "${MISE_STATE_DIR-}" "${FYSO_PROJECT-}" "${CANARY_SECRET-}" "${MISE_SOPS_AGE_KEY_FILE-}" > ' + shlex.quote(str(root / 'observed')) + '\n')
            stub.chmod(0o700)
            (dags / 'probe.yaml').write_text('type: graph\nsteps:\n  - id: probe\n    command: ' + str(stub) + '\n')
            ports = set()
            while len(ports) < 5:
                ports.add(free_port())
            port, scheduler, worker, coordinator, coordinator_health = ports
            env = os.environ.copy()
            env.update({
                'PATH': str(root / 'bin') + os.pathsep + env.get('PATH', ''),
                'FYSO_ROOT': str(root), 'FYSO_DATA': str(root / 'data'), 'FYSO_PROJECT': 'test',
                'FYSO_HTTP_PORT': '8400', 'FYSO_DAGU_PORT': str(port),
                'FYSO_DAGU_SCHEDULER_PORT': str(scheduler), 'FYSO_DAGU_WORKER_HEALTH_PORT': str(worker),
                'FYSO_DAGU_COORDINATOR_PORT': str(coordinator), 'FYSO_DAGU_COORDINATOR_HEALTH_PORT': str(coordinator_health),
                'FYSO_OMB_PORT': '8404', 'OPENMAUSBOT_URL': 'http://127.0.0.1:8404',
                'FYSO_ADMIN_USER': 'fixture', 'FYSO_ADMIN_PASSWORD': 'fictional-fixture',
                'XDG_STATE_HOME': str(root / 'state'), 'XDG_CONFIG_HOME': str(root / 'config'),
                'XDG_DATA_HOME': str(root / 'xdg-data'), 'XDG_CACHE_HOME': str(root / 'xdg-cache'),
                'MISE_DATA_DIR': str(root / 'mise-data'), 'MISE_CACHE_DIR': str(root / 'mise-cache'), 'MISE_STATE_DIR': str(root / 'mise-state'),

                'CANARY_SECRET': 'must-not-leak', 'MISE_SOPS_AGE_KEY_FILE': 'must-not-leak',
            })
            command = ['bash', str(scripts / 'run-dagu.sh')]
            with (root / 'server.log').open('w') as log:
                process = subprocess.Popen(command, env=env, cwd=root, stdout=log, stderr=log, start_new_session=True)
            try:
                base = 'http://127.0.0.1:' + str(port)
                for _ in range(150):
                    self.assertIsNone(process.poll(), 'isolated Dagu server exited')
                    try:
                        with urllib.request.urlopen(base + '/api/v1/health', timeout=1):
                            break
                    except OSError:
                        time.sleep(.1)
                else:
                    self.fail('isolated Dagu server did not become ready')
                request = urllib.request.Request(base + '/api/v1/dags/probe/start',
                    data=json.dumps({'dagRunId': 'xdg-probe'}).encode(),
                    headers={'Content-Type': 'application/json', 'Authorization': 'Basic ' + base64.b64encode(b'fixture:fictional-fixture').decode()}, method='POST')
                with urllib.request.urlopen(request, timeout=3) as response:
                    self.assertEqual(response.status, 200)
                observed = root / 'observed'
                for _ in range(150):
                    if observed.exists():
                        break
                    time.sleep(.1)
                else:
                    self.fail('stub did not execute')
                values = observed.read_text().splitlines()
                self.assertEqual(values[:8], [env[k] for k in ('XDG_STATE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'MISE_DATA_DIR', 'MISE_CACHE_DIR', 'MISE_STATE_DIR', 'FYSO_PROJECT')])
                self.assertEqual(values[8:], ['', ''])
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == '__main__':
    unittest.main()
