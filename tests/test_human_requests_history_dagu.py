"""Exercise human-request history against an explicitly selected Dagu 2.24.0.

FYSO_TEST_DAGU must point to the pinned binary. The test creates its own home,
loopback server and data; no existing Dagu or OpenMausBot is accessed.
"""
import json
import os
import shutil
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / 'template/framework/extensions/human-requests/project/workflows/ext-human-requests-request.yaml'


@unittest.skipUnless(os.environ.get('FYSO_TEST_DAGU') and WORKFLOW.exists(), 'requires Dagu 2.24.0 and human-requests extension')
class HumanRequestsHistory(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.binary = os.environ['FYSO_TEST_DAGU']
        if subprocess.check_output([cls.binary, 'version'], text=True).strip() != '2.24.0':
            raise unittest.SkipTest('requires Dagu 2.24.0')
        cls.temp = tempfile.TemporaryDirectory(prefix='fyso-hr-history-')
        cls.addClassCleanup(cls.temp.cleanup)
        root = Path(cls.temp.name)
        extension = ROOT / 'template/framework/extensions/human-requests/extensions/human-requests'
        shutil.copytree(extension, root / 'extensions/human-requests')
        dags = root / 'dags'
        dags.mkdir()
        # The answer and record steps are the product workflow. Failing the
        # downstream step lets this test check history before any delivery.
        original = WORKFLOW.read_text()
        command = 'command: node extensions/human-requests/deliver.cjs'
        if command not in original:
            raise RuntimeError('workflow delivery command changed')
        (dags / 'ext-human-requests-request.yaml').write_text(original.replace(command, 'command: "false"'))
        sockets = []
        try:
            for _ in range(5):
                sock = socket.socket()
                sock.bind(('127.0.0.1', 0))
                sockets.append(sock)
            ports = [sock.getsockname()[1] for sock in sockets]
        finally:
            for sock in sockets:
                sock.close()
        cls.port = ports[0]
        env = {**os.environ, 'DAGU_HOME': str(root / 'dagu'), 'DAGU_DAGS_DIR': str(dags),
               'DAGU_HOST': '127.0.0.1', 'DAGU_PORT': str(ports[0]), 'DAGU_SCHEDULER_PORT': str(ports[1]),
               'DAGU_COORDINATOR_HOST': '127.0.0.1', 'DAGU_COORDINATOR_PORT': str(ports[2]),
               'DAGU_COORDINATOR_HEALTH_PORT': str(ports[3]), 'DAGU_WORKER_HEALTH_PORT': str(ports[4]),
               'DAGU_AUTH_MODE': 'none', 'DAGU_ENV_PASSTHROUGH_PREFIXES': 'FYSO_', 'FYSO_ROOT': str(root),
               'FYSO_DAGU_PORT': str(ports[0]), 'FYSO_ADMIN_USER': 'fixture', 'FYSO_ADMIN_PASSWORD': 'fixture'}
        env.pop('SHELL', None)
        cls.process = subprocess.Popen([cls.binary, 'start-all'], cwd=root, env=env,
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.addClassCleanup(cls.stop)
        cls.wait(lambda: cls.call('/health'))

    @classmethod
    def stop(cls):
        if cls.process.poll() is None:
            cls.process.terminate()
            try:
                cls.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                cls.process.kill()
                cls.process.wait()

    @classmethod
    def call(cls, path, body=None):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
        req = Request(f'http://127.0.0.1:{cls.port}/api/v1{path}', data=data,
                      headers={'Content-Type': 'application/json'})
        try:
            with urlopen(req, timeout=5) as response:
                return json.load(response)
        except HTTPError as error:
            raise AssertionError(f'fixture API {path}: HTTP {error.code}: {error.read().decode()}') from error

    @classmethod
    def wait(cls, fn):
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            try:
                result = fn()
                if result:
                    return result
            except (URLError, KeyError, ValueError):
                pass
            time.sleep(.2)
        raise AssertionError('isolated Dagu did not reach the expected state')

    def test_saved_history_survives_failed_delivery(self):
        cases = {
            'unicode': {'answer': 'Sí, "aprobado"\n$HOME & $(nothing)', 'comment': 'Señal: áé 🧪\nsegunda línea', 'responder': 'José', 'decision': 'answered'},
            'cancel': {'answer': '', 'comment': 'sin aprobación', 'responder': 'María', 'decision': 'cancelled'},
            'expire': {'answer': '', 'comment': '', 'responder': 'system', 'decision': 'expired'},
        }
        dag = 'ext-human-requests-request'
        for name, form in cases.items():
            with self.subTest(name=name):
                run = 'history-' + name
                self.call(f'/dags/{dag}/start', {'dagRunId': run, 'params': json.dumps({'REQUEST': json.dumps({'title':'History fixture','requester':'Fixture bot','doing':'Testing','needs':'An answer','if_silent':'Nothing happens'})})})
                detail = lambda: self.call(f'/dag-runs/{dag}/{run}')['dagRunDetails']
                self.wait(lambda: detail()['statusLabel'] == 'waiting')
                self.call(f'/dag-runs/{dag}/{run}/human-tasks/ask/complete', form)
                self.wait(lambda: detail()['statusLabel'] == 'failed')
                outputs = self.call(f'/dag-runs/{dag}/{run}/outputs')['outputs']
                card = json.loads(outputs.pop('hrCard'))
                self.assertEqual(card['request']['title'], 'History fixture')
                self.assertEqual(outputs, form)
                record_log = json.dumps(self.call(f'/dag-runs/{dag}/{run}/steps/record/log'), ensure_ascii=False)
                for value in form.values():
                    if value:
                        self.assertNotIn(value, record_log)


if __name__ == '__main__':
    unittest.main()
