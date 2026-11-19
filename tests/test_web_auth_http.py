"""Real Caddy + unmodified Tinyauth; upstream echo fixtures prove gateway boundaries.

Set FYSO_TEST_TINYAUTH and FYSO_TEST_CADDY to explicit binaries. Uses only a
temporary directory and a caller-selected, unused block (default 19800).
"""
import base64
import http.client
import json
import os
from pathlib import Path
import shutil
from socketserver import ThreadingUnixStreamServer
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.environ.get('FYSO_TEST_TINYAUTH') and os.environ.get('FYSO_TEST_CADDY'), 'requires explicit native test binaries')
class WebAuthHTTP(unittest.TestCase):
    # People reach the gateway on its listening address; a subclass puts it behind
    # an HTTPS provider (D62), which changes the public scheme and drops the port.
    scheme = 'http'
    port_offset = 0
    web_domain = None

    @classmethod
    def origin(cls, app):
        return f'{cls.scheme}://{cls.host(app)}'

    @classmethod
    def host(cls, app):
        return f'{app}.{cls.domain}' + ('' if cls.scheme == 'https' else f':{cls.port}')

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix='fyso-web-auth-')
        cls.root = Path(cls.tmp.name)
        cls.port = int(os.environ.get('FYSO_TEST_AUTH_PORT_BASE', '19800')) + cls.port_offset
        cls.domain = cls.web_domain or f'security-{cls.port}.localhost'
        cls.processes = []
        cls.servers = []
        cls.logs = []
        cls.password = 'fixture-local-password-43'
        cls.dagu_auth = 'Basic ' + base64.b64encode(b'technical:fixture-service-password').decode()
        cls.addClassCleanup(cls.cleanup)
        for folder in ['project/auth', 'project/apps', 'extensions', 'panel', 'runtime']:
            (cls.root / folder).mkdir(parents=True)
        (cls.root / 'panel/index.html').write_text('<!doctype html><title>Protected panel</title>')
        (cls.root / 'panel/project.json').write_text('{"name":"Security fixture"}')
        public = cls.root / 'extensions/example-pages/panel'
        public.mkdir(parents=True)
        (public / 'index.html').write_text('<!doctype html><title>Extension</title>')
        (public / 'client.js').write_text('/* extension-owned asset */')
        (public / 'locales').mkdir()
        (public / 'locales/es.json').write_text('{"title":"Pending"}')
        (public.parent / 'secrets.yaml').write_text('names: []')
        shutil.copy(Path(os.environ.get('FYSO_TEST_GATEWAY_CONFIG', ROOT / 'template/Caddyfile')), cls.root / 'Caddyfile')
        config = (ROOT / 'template/project/auth/tinyauth.yaml.jinja').read_text().replace('{{ admin_user }}', 'admin')
        # A second local identity has access only to OMB; panel and Dagu remain denied.
        config = config.replace('  omb:\n    users:\n      allow: "admin"', '  omb:\n    users:\n      allow: "admin,viewer"')
        config += '\n  trustedext:\n    users:\n      allow: admin\n'
        (cls.root / 'project/auth/tinyauth.yaml').write_text(config)
        hashed = subprocess.check_output([os.environ['FYSO_TEST_CADDY'], 'hash-password', '--bcrypt-cost', '4'], input=cls.password.encode()).decode().strip()
        cls.users = f'admin:{hashed},viewer:{hashed}'
        (cls.root / 'project/apps/unconfigured').mkdir()
        (cls.root / 'project/apps/unconfigured/Caddyfile').write_text('http://unconfigured.{$FYSO_WEB_DOMAIN}:{$FYSO_HTTP_PORT} {\n import fyso_login\n reverse_proxy 127.0.0.1:{$FYSO_OMB_PORT}\n}\n')

        (cls.root / 'extensions/trustedext').mkdir()
        (cls.root / 'extensions/trustedext/Caddyfile').write_text('http://trustedext.{$FYSO_WEB_DOMAIN}:{$FYSO_HTTP_PORT} {\n import fyso_login\n reverse_proxy 127.0.0.1:{$FYSO_OMB_PORT}\n}\n')

        class Echo(BaseHTTPRequestHandler):
            def do_GET(self):
                body = json.dumps({
                    'path': self.path,
                    'bearer': self.headers.get('Authorization') == 'Bearer fixture-mcp-token',
                    'daguCredential': self.headers.get('Authorization') == cls.dagu_auth,
                    'ombCredential': self.headers.get('Authorization') == 'Bearer fixture-omb-token',
                    'user': self.headers.get('Remote-User'),
                    'groups': self.headers.get('Remote-Groups'),
                    'nativeCookiePreserved': 'native-app=preserved' in self.headers.get('Cookie', ''),
                    'webCookieLeaked': 'tinyauth-session-' in self.headers.get('Cookie', ''),
                    'authorization': self.headers.get('Authorization') is not None,
                }).encode()
                self.send_response(200); self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
            do_POST = do_GET

            def log_message(self, *_):
                pass
        for offset in [1, 4]:
            server = ThreadingHTTPServer(('127.0.0.1', cls.port + offset), Echo)
            cls.servers.append(server)
            threading.Thread(target=server.serve_forever, daemon=True).start()
        cls.setup_socket = Path('/tmp') / f'fyso-auth-setup-{cls.port}.sock'
        cls.mcp_socket = Path('/tmp') / f'fyso-auth-mcp-{cls.port}.sock'
        cls.ext_socket = Path('/tmp') / f'fyso-ext-sockext-{cls.port}.sock'
        cls.addClassCleanup(lambda: cls.ext_socket.unlink(missing_ok=True))
        for socket_path in [cls.setup_socket, cls.mcp_socket, cls.ext_socket]:
            socket_path.unlink(missing_ok=True)
            server = ThreadingUnixStreamServer(str(socket_path), Echo)
            cls.servers.append(server)
            threading.Thread(target=server.serve_forever, daemon=True).start()
        cls.addClassCleanup(lambda: cls.mcp_socket.unlink(missing_ok=True))
        cls.addClassCleanup(lambda: cls.setup_socket.unlink(missing_ok=True))
        binary_dir = cls.root / 'bin'; binary_dir.mkdir()
        (binary_dir / 'yaml').symlink_to(ROOT / 'template/framework/panel/node_modules/yaml/bin.mjs')
        config_env = {**os.environ, 'PATH': str(binary_dir) + os.pathsep + os.environ['PATH'],
            'FYSO_ROOT':str(cls.root), 'FYSO_DATA':str(cls.root), 'FYSO_WEB_DOMAIN':cls.domain,
            'FYSO_HTTP_PORT':str(cls.port), 'FYSO_AUTH_PORT':str(cls.port + 9), 'FYSO_AUTH_USERS':cls.users,
            'FYSO_WEB_SCHEME':cls.scheme}
        subprocess.run(['node', str(ROOT / 'template/framework/scripts/web-auth-config.cjs')], env=config_env, check=True)
        cls.auth_env = {**os.environ, 'TINYAUTH_CONFIGFILE':str(cls.root / 'web-auth/runtime/config.yaml')}
        cls.start_auth()
        env = {**os.environ, 'FYSO_ROOT': str(cls.root), 'FYSO_DATA': str(cls.root),
            'XDG_CONFIG_HOME':str(cls.root / 'caddy-config'), 'XDG_DATA_HOME':str(cls.root / 'caddy-data'),
            'FYSO_PANEL_ROOT': str(cls.root / 'panel'), 'FYSO_HTTP_PORT': str(cls.port),
            'FYSO_WEB_DOMAIN': cls.domain, 'FYSO_AUTH_UPSTREAM': f'127.0.0.1:{cls.port + 9}',
            'FYSO_WEB_SCHEME': cls.scheme, 'FYSO_WEB_PORT_SUFFIX': '' if cls.scheme == 'https' else f':{cls.port}',
            'FYSO_DAGU_PORT': str(cls.port + 1), 'FYSO_OMB_PORT': str(cls.port + 4),
            'FYSO_CADDY_ADMIN_PORT': str(cls.port + 8), 'FYSO_BIND': '127.0.0.1',
            'FYSO_CONNECTOR_SETUP_SOCKET': str(cls.setup_socket), 'FYSO_MCP_SOCKET': str(cls.mcp_socket), 'FYSO_DAGU_AUTH': cls.dagu_auth, 'FYSO_OMB_TOKEN': 'fixture-omb-token'}
        cls.start([os.environ['FYSO_TEST_CADDY'], 'run', '--config', str(cls.root / 'Caddyfile')], env)
        cls.wait_port(cls.port)

    @classmethod
    def start(cls, args, env):
        log = (cls.root / f'process-{len(cls.processes)}.log').open('wb')
        cls.logs.append(log)
        process = subprocess.Popen(args, env=env, cwd=cls.root / 'runtime', stdout=log, stderr=log)
        cls.processes.append(process)
        return process

    @classmethod
    def start_auth(cls):
        cls.auth = cls.start([os.environ['FYSO_TEST_TINYAUTH']], cls.auth_env)
        cls.wait_port(cls.port + 9, '/api/healthz')

    @classmethod
    def wait_port(cls, port, path='/'):
        for _ in range(150):
            try:
                connection = http.client.HTTPConnection('127.0.0.1', port, timeout=1)
                connection.request('GET', path); response = connection.getresponse(); response.read(); connection.close()
                return
            except OSError:
                time.sleep(.1)
        raise AssertionError(f'Isolated service did not start on {port}: ' + '\n'.join(line for log in cls.root.glob('process-*.log') for line in log.read_text().splitlines() if 'ERR' in line or 'error' in line.lower())[-2500:])

    @classmethod
    def cleanup(cls):
        for process in reversed(cls.processes):
            if process.poll() is None:
                process.terminate()
                try: process.wait(timeout=10)
                except subprocess.TimeoutExpired: process.kill(); process.wait()
        for server in cls.servers:
            server.shutdown(); server.server_close()
        for log in cls.logs: log.close()
        cls.tmp.cleanup()

    @classmethod
    def request(cls, app, path='/', method='GET', body=None, cookie=None, **headers):
        connection = http.client.HTTPConnection('127.0.0.1', cls.port, timeout=10)
        headers['Host'] = cls.host(app)
        if cookie: headers['Cookie'] = cookie
        if body is not None: body = json.dumps(body); headers['Content-Type'] = 'application/json'
        connection.request(method, path, body, headers)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read().decode()
        connection.close()
        return result

    def login(self, username='admin'):
        status, headers, _ = self.request('auth', '/api/user/login', 'POST', {'username':username, 'password':self.password}, Origin=self.origin('auth'))
        self.assertEqual(status, 200)
        cookie = headers.get('Set-Cookie', '')
        self.assertIn(f'Domain={self.domain}', cookie)
        self.assertIn('HttpOnly', cookie); self.assertIn('SameSite=Lax', cookie)
        self.assertEqual('Secure' in cookie, self.scheme == 'https')
        return cookie.split(';')[0]

    def test_connector_setup_uses_web_session_and_private_technical_upstream(self):
        route = '/api/composio/setup'
        self.assertEqual(self.request('panel', route, 'POST', {'apiKey':'fixture-key'})[0], 401)
        cookie = self.login()
        origin = self.origin('panel')
        status, _, body = self.request('panel', route, 'POST', {'apiKey':'fixture-key'}, Cookie=cookie, Origin=origin, Authorization='Bearer forged')
        self.assertEqual(status, 200)
        echo = json.loads(body)
        self.assertTrue(echo['daguCredential'])
        self.assertFalse(echo['webCookieLeaked'])
        self.assertEqual(self.request('panel', route, 'POST', {}, Cookie=cookie, Origin='https://foreign.invalid')[0], 403)
        self.assertEqual(self.request('panel', '/api/composio/private', Cookie=cookie)[0], 404)
        status, _, body = self.request('panel', '/api/connectors/mcp', 'POST', {'name':'fixture'}, Cookie=cookie, Origin=origin)
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)['daguCredential'])
        self.assertFalse(json.loads(body)['webCookieLeaked'])
        self.assertEqual(self.request('panel', '/api/connectors/mcp', 'POST', {})[0], 401)
        # D65: the remote MCP commands (token included) need the web session and the same private glue.
        self.assertEqual(self.request('panel', '/api/agent/remote', 'POST', {})[0], 401)
        status, _, body = self.request('panel', '/api/agent/remote', 'POST', {}, Cookie=cookie, Origin=origin)
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)['daguCredential']); self.assertFalse(json.loads(body)['webCookieLeaked'])
        self.assertEqual(self.request('panel', '/api/agent/remote', 'POST', {}, Cookie=cookie, Origin='https://foreign.invalid')[0], 403)
        self.assertEqual(self.request('panel', '/api/agent/other', 'POST', {}, Cookie=cookie, Origin=origin)[0], 404)

    def test_extension_api_reaches_only_its_socket_behind_the_web_session(self):
        # D79: /api/ext/<id>/<path> → /tmp/fyso-ext-<id>-<port>.sock with the session's identity only.
        route = '/api/ext/sockext/teams?fresh=1'
        self.assertEqual(self.request('panel', route)[0], 401)
        cookie = self.login()
        status, _, body = self.request('panel', route, cookie=cookie, Authorization='Bearer forged', **{'Remote-User': 'forged'})
        self.assertEqual(status, 200)
        seen = json.loads(body)
        self.assertEqual(seen['path'], '/teams?fresh=1')
        self.assertEqual(seen['user'], 'admin')
        self.assertFalse(seen['authorization']); self.assertFalse(seen['webCookieLeaked'])
        origin = self.origin('panel')
        self.assertEqual(self.request('panel', '/api/ext/sockext/logout', 'POST', {}, cookie=cookie, Origin=origin)[0], 200)
        self.assertEqual(self.request('panel', '/api/ext/sockext/logout', 'POST', {}, cookie=cookie, Origin='https://foreign.invalid')[0], 403)
        for path in ['/api/ext/Bad_Id/x', '/api/ext/sockext']:
            self.assertEqual(self.request('panel', path, cookie=cookie)[0], 404, path)
        self.assertEqual(self.request('panel', '/api/ext/missing/x', cookie=cookie)[0], 502)
        self.assertEqual(self.request('panel', route, cookie=self.login('viewer'))[0], 403)
        for app in ['dagu', 'omb']:
            self.assertNotEqual(json.loads(self.request(app, route, cookie=cookie)[2] or '{}').get('path'), '/teams?fresh=1', app)

    def test_00_remote_mcp_route_skips_the_login_and_only_exists_on_the_panel(self):
        # D63: the endpoint authenticates its own bearer token; the gateway must hand it over untouched.
        status, _, body = self.request('panel', '/mcp', 'POST', {}, Authorization='Bearer fixture-mcp-token')
        self.assertEqual(status, 200); seen = json.loads(body)
        self.assertEqual(seen['path'], '/mcp'); self.assertTrue(seen['bearer'])
        status, _, body = self.request('panel', '/mcp', 'POST', {}, **{'Remote-User': 'admin'})
        self.assertEqual(status, 200); self.assertFalse(json.loads(body)['bearer'])
        for path in ['/mcp/', '/mcp/x', '/mcpx']:
            self.assertEqual(self.request('panel', path, 'POST', {}, Authorization='Bearer fixture-mcp-token')[0], 401, path)
        for app in ['dagu', 'omb']:
            self.assertEqual(self.request(app, '/mcp', 'POST', {}, Authorization='Bearer fixture-mcp-token')[0], 401, app)

    def test_00_remote_mcp_oauth_discovery_skips_the_login(self):
        # D90: MCP clients read both documents without a session; only these paths reach the endpoint.
        for path in ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']:
            status, _, body = self.request('panel', path)
            self.assertEqual(status, 200, path); self.assertEqual(json.loads(body)['path'], path)
        status, _, body = self.request('auth', '/.well-known/oauth-authorization-server')
        self.assertEqual(status, 200); self.assertEqual(json.loads(body)['path'], '/.well-known/oauth-authorization-server')
        self.assertNotEqual(self.request('auth', '/.well-known/openid-configuration')[0], 404)
        for app in ['dagu', 'omb']:
            self.assertNotEqual(json.loads(self.request(app, '/.well-known/oauth-protected-resource/mcp')[2] or '{}').get('path'),
                '/.well-known/oauth-protected-resource/mcp', app)

    def test_01_pages_redirect_and_apis_deny_without_browser_popup(self):
        for app in ['panel','dagu','omb']:
            status, headers, _ = self.request(app, **{'User-Agent':'Mozilla/5.0 Chrome/130.0.0.0'})
            self.assertEqual(status, 302); self.assertTrue(headers['Location'].startswith(self.origin('auth') + '/'), headers['Location'])
            self.assertNotIn('Www-Authenticate', headers)
            status, headers, _ = self.request(app, '/api/probe', **{'User-Agent':'Mozilla/5.0 Chrome/130.0.0.0'})
            self.assertEqual(status, 401); self.assertNotIn('Www-Authenticate', headers)

    def test_extension_pages_share_sessions_without_exposing_private_slots(self):
        page = '/extensions/example-pages/panel/index.html'
        self.assertEqual(self.request('panel', page)[0], 401)
        cookie = self.login()
        for path in [page, '/extensions/example-pages/panel/client.js', '/extensions/example-pages/panel/locales/es.json']:
            self.assertEqual(self.request('panel', path, cookie=cookie)[0], 200)
        self.assertEqual(self.request('panel', '/extensions/example-pages/secrets.yaml', cookie=cookie)[0], 404)
        self.assertEqual(self.request('panel', page, 'POST', {}, cookie=cookie,
            Origin=self.origin('panel'))[0], 405)
        self.assertEqual(self.request('panel', page, cookie=self.login('viewer'))[0], 403)

    @unittest.skipUnless((ROOT / 'template/framework/extensions/human-requests/extensions/human-requests/panel').is_dir(), 'requires human-requests extension')
    def test_human_requests_page_assets_use_the_existing_gateway(self):
        source = ROOT / 'template/framework/extensions/human-requests/extensions/human-requests/panel'
        target = self.root / 'extensions/human-requests/panel'
        shutil.copytree(source, target)
        cookie = self.login()
        for asset in ['index.html', 'pending.js', 'pending.css', 'locales/es.json', 'locales/en.json']:
            path = '/extensions/human-requests/panel/' + asset
            self.assertEqual(self.request('panel', path)[0], 401, path)
            self.assertEqual(self.request('panel', path, cookie=cookie)[0], 200, path)
        self.assertEqual(self.request('panel', '/extensions/human-requests/skills/human-requests/SKILL.md', cookie=cookie)[0], 404)

    def test_02_basic_auth_and_forged_identity_do_not_bypass_sessions(self):
        status, _, _ = self.request('panel', '/config/project.json', Authorization=self.dagu_auth,
            **{'Remote-User':'admin', 'Remote-Groups':'owners', 'X-Auth-Request-User':'admin'})
        self.assertEqual(status, 401)

    def test_03_one_login_covers_panel_dagu_omb_and_replaces_upstream_credentials(self):
        cookie = self.login()
        self.assertEqual(self.request('panel', '/', cookie=cookie)[0], 200)
        for app, path, field in [('dagu','/api/probe','daguCredential'), ('panel','/api/dagu/probe','daguCredential'), ('omb','/api/probe','ombCredential')]:
            status, _, body = self.request(app, path, cookie=cookie, Authorization='Bearer attacker', **{'Remote-User':'attacker', 'Remote-Groups':'owners'})
            self.assertEqual(status, 200)
            data = json.loads(body); self.assertTrue(data[field]); self.assertEqual(data['user'], 'admin')
            self.assertFalse(data['groups']); self.assertFalse(data['webCookieLeaked'])

    def test_03b_authority_paths_do_not_leak_session_cookies_on_application_hosts(self):
        cookie = self.login() + '; native-app=preserved'
        for app in ['dagu', 'omb', 'trustedext']:
            for resource in ['/api/session', '/api/session/logout']:
                for method in ['GET', 'POST']:
                    with self.subTest(app=app, path=resource, method=method):
                        status, _, body = self.request(app, resource, method,
                            {} if method == 'POST' else None, cookie=cookie,
                            Origin=self.origin(app))
                        self.assertEqual(status, 200)
                        data = json.loads(body)
                        self.assertFalse(data['webCookieLeaked'])
                        self.assertTrue(data['nativeCookiePreserved'])
                        self.assertEqual(data['user'], 'admin')

    def test_04_session_context_and_logout_revoke_cookie_replay(self):
        cookie = self.login()
        status, _, body = self.request('panel', '/api/session', cookie=cookie)
        self.assertEqual(status, 200); self.assertEqual(json.loads(body)['auth']['username'], 'admin')
        self.assertEqual(self.request('panel', '/api/session/logout', 'POST', {}, cookie=cookie, Origin=self.origin('panel'))[0], 200)
        for app in ['panel','dagu','omb']:
            self.assertEqual(self.request(app, '/api/probe', cookie=cookie)[0], 401)

    def test_05_cross_origin_and_cross_site_requests_are_blocked(self):
        cookie = self.login()
        for app in ['panel','dagu','omb','auth']:
            for headers in [{'Origin':'https://foreign.invalid'}, {'Sec-Fetch-Site':'cross-site'}]:
                self.assertEqual(self.request(app, '/api/probe', 'POST', {}, cookie=cookie, **headers)[0], 403)
        # Sibling apps are same-site, but must not be able to forge each other's writes.
        self.assertEqual(self.request('dagu', '/api/probe', 'POST', {}, cookie=cookie, Origin=self.origin('omb'))[0], 403)

    def test_06_per_application_permissions_and_unconfigured_apps_deny(self):
        cookie = self.login('viewer')
        for app in ['panel','dagu']:
            self.assertEqual(self.request(app, '/api/probe', cookie=cookie)[0], 403)
        self.assertEqual(self.request('omb', '/api/probe', cookie=cookie)[0], 200)
        self.assertEqual(self.request('auth', '/api/auth/caddy', cookie=cookie)[0], 404)
        self.assertEqual(self.request('unconfigured', '/api/probe', cookie=self.login())[0], 403)

    def test_07_wrong_password_and_retry_lockout(self):
        # Separate fixture identity so the admin's valid-session tests stay independent.
        for _ in range(5):
            self.assertEqual(self.request('auth', '/api/user/login', 'POST', {'username':'viewer','password':'incorrect-password'})[0], 401)
        self.assertEqual(self.request('auth', '/api/user/login', 'POST', {'username':'viewer','password':self.password})[0], 429)

    def test_08_sessions_survive_restart_and_expire(self):
        cookie = self.login()
        self.auth.terminate(); self.auth.wait(timeout=10); self.start_auth()
        self.assertEqual(self.request('dagu', '/api/probe', cookie=cookie)[0], 200)
        config = self.root / 'web-auth/runtime/config.yaml'
        original = config.read_text()
        self.auth.terminate(); self.auth.wait(timeout=10)
        config.write_text(original.replace('sessionExpiry: 2592000', 'sessionExpiry: 1').replace('sessionMaxLifetime: 2592000', 'sessionMaxLifetime: 2'))
        try:
            self.start_auth(); cookie = self.login(); time.sleep(2.1)
            self.assertEqual(self.request('dagu', '/api/probe', cookie=cookie)[0], 401)
        finally:
            self.auth.terminate(); self.auth.wait(timeout=10)
            config.write_text(original); self.start_auth()

    def test_99_authority_failure_does_not_open_access(self):
        cookie = self.login()
        self.auth.terminate(); self.auth.wait(timeout=10)
        try:
            for app in ['panel','dagu','omb']:
                self.assertIn(self.request(app, '/api/probe', cookie=cookie)[0], [502,503])
        finally: self.start_auth()


class WebAuthBehindHTTPS(WebAuthHTTP):
    """The same boundaries when an HTTPS provider fronts the loopback gateway (D62)."""
    scheme = 'https'
    port_offset = 20
    web_domain = 'host1.proxy.example.test'

    def test_05b_the_listening_address_is_not_an_accepted_origin(self):
        cookie = self.login()
        listening = f'http://panel.{self.domain}:{self.port}'
        self.assertEqual(self.request('panel', '/api/session/logout', 'POST', {}, cookie=cookie, Origin=listening)[0], 403)


if __name__ == '__main__':
    unittest.main()
