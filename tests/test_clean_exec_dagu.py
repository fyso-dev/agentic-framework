"""Optional native Dagu integration for the clean_exec XDG boundary.

Set FYSO_TEST_DAGU_BIN to the pinned Dagu 2.24.0 binary. This creates only
temporary data and loopback listeners and runs a stub, never the mise CLI.
"""
import json
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
            (root / 'dags').mkdir()
            (root / 'config.yaml').write_text('{}\n')
            stub = root / 'mise-stub'
            stub.write_text('#!/bin/sh\nprintf "%s\\n%s\\n%s\\n%s\\n" "${XDG_STATE_HOME-}" "${XDG_CONFIG_HOME-}" "${FYSO_XDG_SENTINEL-}" "${CANARY_SECRET-}" > "$FYSO_OUTPUT_FILE"\n')
            stub.chmod(0o700)
            (root / 'dags/probe.yaml').write_text('type: graph\nsteps:\n  - id: probe\n    command: ' + str(stub) + '\n')
            ports = set()
            while len(ports) < 3:
                ports.add(free_port())
            port, scheduler, worker = ports
            env = os.environ.copy()
            env.update({
                'DAGU_HOME': str(root / 'home'), 'DAGU_HOST': '127.0.0.1', 'DAGU_PORT': str(port),
                'DAGU_AUTH_MODE': 'none', 'DAGU_SCHEDULER_PORT': str(scheduler),
                'DAGU_WORKER_HEALTH_PORT': str(worker), 'DAGU_COORDINATOR_ENABLED': 'false',
                'DAGU_DAGS_DIR': str(root / 'dags'),
                'DAGU_ENV_PASSTHROUGH_PREFIXES': 'FYSO_,OPENMAUSBOT_,ALLOW_INSECURE_HTTP',
                'XDG_STATE_HOME': str(root / 'state'), 'XDG_CONFIG_HOME': str(root / 'config'),
                'FYSO_OUTPUT_FILE': str(root / 'observed'), 'FYSO_XDG_SENTINEL': 'ok',
                'CANARY_SECRET': 'must-not-leak',
            })
            allow = [name for name in env if name.startswith('DAGU_') or name in ('FYSO_OUTPUT_FILE', 'FYSO_XDG_SENTINEL')]
            command = ['bash', '-c', 'source "$1"; shift; clean_exec "$@"', 'probe', str(LIB)]
            command += [name + '=' + env[name] for name in allow]
            command += [DAGU, 'start-all', '--dagu-home', env['DAGU_HOME'], '--config', str(root / 'config.yaml'),
                        '--host', '127.0.0.1', '--port', str(port), '--dags', str(root / 'dags')]
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
                    headers={'Content-Type': 'application/json'}, method='POST')
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
                self.assertEqual(values[:3], [env['XDG_STATE_HOME'], env['XDG_CONFIG_HOME'], 'ok'])
                self.assertEqual(values[3:], [''])
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == '__main__':
    unittest.main()
