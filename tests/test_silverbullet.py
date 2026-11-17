"""Real SilverBullet HTTP + official filesystem MCP against temporary project data.

Run with the extension's pinned tools on PATH (mise exec -- python3 ...).
"""
import base64
import json
import os
from pathlib import Path
import select
import shutil
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / 'template/framework/extensions/silverbullet/extensions/silverbullet'


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class SilverBulletIntegration(unittest.TestCase):
    def setUp(self):
        for tool in ('silverbullet', 'mcp-server-filesystem', 'caddy'):
            if not shutil.which(tool):
                self.skipTest(f'{tool} missing; run with the installed extension mise environment')
        self.tmp = tempfile.TemporaryDirectory(prefix='fyso-silverbullet-test-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.space = self.root / 'project/wiki'
        self.space.mkdir(parents=True)
        shutil.copytree(EXT, self.root / 'extensions/silverbullet')
        shutil.copytree(ROOT / 'template/framework/scripts', self.root / 'framework/scripts')
        # run-ext.sh loads the project's mise environment, which a bare temporary
        # directory lacks; the pinned tools are already on PATH here.
        self.root.joinpath('framework/scripts/run-ext.sh').write_text(
            '#!/usr/bin/env bash\nshift 2\nexec "$@"\n')
        self.port, self.gateway = free_port(), free_port()
        self.env = {k: v for k, v in os.environ.items()
                    if not k.startswith(('FYSO_', 'SB_'))}
        self.env.update(FYSO_ROOT=str(self.root), FYSO_DATA=str(self.root / '.data'),
                        FYSO_EXT_SILVERBULLET_PORT=str(self.port),
                        FYSO_HTTP_PORT=str(self.gateway), FYSO_WEB_DOMAIN='localhost')
        self.children = []
        self.addCleanup(self.stop_children)

    def stop_children(self):
        for child in reversed(self.children):
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=5)
            for stream in (child.stdin, child.stdout, child.stderr):
                if stream:
                    stream.close()

    def spawn(self, args, pipes=False):
        child = subprocess.Popen(args, cwd=self.root, env=self.env,
                                 stdin=subprocess.PIPE if pipes else subprocess.DEVNULL,
                                 stdout=subprocess.PIPE if pipes else subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL, text=True, bufsize=1)
        self.children.append(child)
        return child

    def request(self, path, *, gateway=False, auth=True, data=None, headers=None):
        port = self.gateway if gateway else self.port
        values = {'Host': f'docs.localhost:{self.gateway}'} if gateway else {}
        if gateway and auth:
            values['Authorization'] = 'Basic ' + base64.b64encode(b'fixture:fixture').decode()
        values.update(headers or {})
        request = urllib.request.Request(f'http://127.0.0.1:{port}{path}',
                                         data=data, headers=values)
        try:
            response = urllib.request.urlopen(request, timeout=3)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.read()

    def ready(self, gateway=False):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            try:
                if self.request('/.fs/index.md', gateway=gateway)[0] == 200:
                    return
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(0.1)
        self.fail('Isolated server did not become ready')

    def start(self):
        child = self.spawn(['bash', 'extensions/silverbullet/start.sh'])
        self.ready()
        return child

    def rpc(self, child, ident, method, params):
        child.stdin.write(json.dumps({'jsonrpc': '2.0', 'id': ident,
                                      'method': method, 'params': params}) + '\n')
        child.stdin.flush()
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if select.select([child.stdout], [], [], 0.2)[0]:
                line = child.stdout.readline()
                self.assertTrue(line, 'MCP process closed stdout')
                reply = json.loads(line)
                if reply.get('id') == ident:
                    self.assertNotIn('error', reply, reply)
                    return reply['result']
        self.fail(f'MCP timed out: {method}')

    def test_seed_restart_and_doctor_preserve_existing_pages(self):
        self.space.joinpath('index.md').write_text('# Existing home\n')
        child = self.start()
        self.assertEqual(self.request('/.fs/index.md'), (200, b'# Existing home\n'))
        child.terminate()
        child.wait(timeout=10)
        self.start()
        self.assertEqual(self.space.joinpath('index.md').read_text(), '# Existing home\n')
        # Only the editor runs here; the upload receiver is covered by the project doctor.
        result = subprocess.run(['bash', 'extensions/silverbullet/doctor.sh', 'editor'],
                                cwd=self.root, env=self.env, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode())

    def test_mcp_writes_reach_http_and_escape_is_denied(self):
        self.start()
        config = json.loads((EXT / 'mcp.json').read_text())['mcpServers']['silverbullet']
        # Match OMB's cleared environment: the MCP must not require FYSO_ROOT.
        self.env.pop('FYSO_ROOT')
        args = [item.replace('${FYSO_ROOT}', str(self.root)) for item in config['args']]
        mcp = self.spawn([config['command'], *args], pipes=True)
        self.rpc(mcp, 1, 'initialize', {'protocolVersion': '2025-03-26',
                 'capabilities': {}, 'clientInfo': {'name': 'fyso-test', 'version': '1'}})
        mcp.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
        mcp.stdin.flush()
        tools = self.rpc(mcp, 2, 'tools/list', {})
        self.assertIn('write_file', [tool['name'] for tool in tools['tools']])
        page = self.space / 'Agent-proof.md'
        result = self.rpc(mcp, 3, 'tools/call', {'name': 'write_file',
                          'arguments': {'path': str(page), 'content': '# Agent proof\n'}})
        self.assertFalse(result.get('isError'), result)
        self.assertEqual(self.request('/.fs/Agent-proof.md'), (200, b'# Agent proof\n'))
        result = self.rpc(mcp, 4, 'tools/call', {'name': 'read_text_file',
                          'arguments': {'path': str(page)}})
        self.assertIn('# Agent proof', str(result))
        request = urllib.request.Request(f'http://127.0.0.1:{self.port}/.fs/Web-proof.md',
                                         data=b'# Web proof\n', method='PUT')
        with urllib.request.urlopen(request, timeout=3) as response:
            self.assertEqual(response.status, 200)
        result = self.rpc(mcp, 7, 'tools/call', {'name': 'read_text_file',
                          'arguments': {'path': str(self.space / 'Web-proof.md')}})
        self.assertIn('# Web proof', str(result))
        self.root.joinpath('outside.md').write_text('Outside sentinel')
        result = self.rpc(mcp, 5, 'tools/call', {'name': 'read_text_file',
                          'arguments': {'path': str(self.root / 'outside.md')}})
        self.assertTrue(result.get('isError'), result)
        result = self.rpc(mcp, 6, 'tools/call', {'name': 'write_file',
                          'arguments': {'path': str(self.root / 'escaped.md'), 'content': 'deny'}})
        self.assertTrue(result.get('isError'), result)
        self.assertFalse(self.root.joinpath('escaped.md').exists())

    def test_gateway_route_requires_the_project_login(self):
        # The real login snippet and its cross-site guard belong to the framework
        # Caddyfile (web-auth tests); here a stub proves the route imports it.
        self.start()
        password_hash = subprocess.check_output(['caddy', 'hash-password', '--plaintext', 'fixture'], text=True).strip()
        config = self.root / 'test.Caddyfile'
        config.write_text('{\n admin off\n auto_https off\n default_bind 127.0.0.1\n}\n'
                          '(fyso_login) {\n basic_auth {\n fixture ' + password_hash + '\n }\n}\n'
                          'import extensions/silverbullet/Caddyfile\n')
        self.spawn(['caddy', 'run', '--config', str(config), '--adapter', 'caddyfile'])
        self.ready(gateway=True)
        self.assertEqual(self.request('/.fs/index.md', gateway=True, auth=False)[0], 401)
        self.assertEqual(self.request('/.fs/index.md', gateway=True)[0], 200)


class SilverBulletLifecycle(unittest.TestCase):
    def test_copier_reapply_and_remove_retain_project_documents(self):
        if not shutil.which('uvx') or not shutil.which('yaml'):
            self.skipTest('Pinned Copier runner and framework yaml tool required')
        with tempfile.TemporaryDirectory(prefix='fyso-silverbullet-lifecycle-') as tmp:
            project = Path(tmp)
            project.joinpath('.copier-answers.yml').write_text('port_base: 29400\n')
            copier = ['uvx', '--from', 'copier==9.19.1', 'copier', 'copy', '--trust',
                      '--defaults', '--overwrite', str(EXT.parents[1]), str(project)]
            def run(args, expected=0):
                result = subprocess.run(args, cwd=project, capture_output=True, text=True,
                                        timeout=120, env={**os.environ,
                                        'MISE_TRUSTED_CONFIG_PATHS': str(project)})
                self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
                return result
            run(copier)
            config = project / '.config/mise/conf.d/ext-silverbullet.toml'
            self.assertIn('29410', config.read_text())
            self.assertIn('{{ os(', config.read_text())
            self.assertFalse(project.joinpath('copier.yml').exists())
            page = project / 'project/wiki/index.md'
            page.parent.mkdir(parents=True)
            page.write_text('# Existing knowledge\n')
            cache = project / '.data/ext/silverbullet/retained'
            cache.parent.mkdir(parents=True)
            cache.write_text('runtime sentinel')
            run(copier)
            self.assertEqual(page.read_text(), '# Existing knowledge\n')
            run(['node', str(ROOT / 'template/framework/scripts/ext-lifecycle.cjs'),
                 'remove', 'silverbullet'])
            self.assertEqual(page.read_text(), '# Existing knowledge\n')
            self.assertTrue(cache.exists())
            self.assertFalse(config.exists())
            self.assertFalse(project.joinpath('extensions/silverbullet').exists())


if __name__ == '__main__':
    unittest.main()
