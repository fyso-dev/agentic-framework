"""Real Caddy + unmodified Tinyauth; upstream echo fixtures prove gateway boundaries.

Set FYSO_TEST_TINYAUTH and FYSO_TEST_CADDY to explicit binaries. Uses only a
temporary directory and a caller-selected, unused block (default 19800).
For the managed-policy integration, set FYSO_TEST_BIZ_EXTENSION to a generated
project containing the installed Biz extension with managed access enabled.
The separate feedback test requires the feedback-capable extension and uses
the local Biz fixture (leave FYSO_TEST_BIZ_ORIGIN unset).
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
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.environ.get('FYSO_TEST_TINYAUTH') and os.environ.get('FYSO_TEST_CADDY'), 'requires explicit native test binaries')
class WebAuthFixture(unittest.TestCase):
    # People reach the gateway on its listening address; a subclass puts it behind
    # an HTTPS provider (D62), which changes the public scheme and drops the port.
    scheme = 'http'
    port_offset = 0
    web_domain = None

    @classmethod
    def setup_extra_services(cls, env):
        pass

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
        cls.panel_data = cls.root / '.data'
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
        (cls.panel_data / 'panel').mkdir(parents=True)
        (cls.panel_data / 'panel/project.json').write_text('{"name":"Security fixture"}')
        public = cls.root / 'extensions/example-pages/panel'
        public.mkdir(parents=True)
        (public / 'index.html').write_text('<!doctype html><title>Extension</title>')
        (public / 'client.js').write_text('/* extension-owned asset */')
        (public / 'locales').mkdir()
        (public / 'locales/es.json').write_text('{"title":"Pending"}')
        (public.parent / 'secrets.yaml').write_text('names: []')
        (public.parent / 'authorize.caddy').write_text(
            '@fixturePolicy path /__policy_fixture /api/dagu/__policy_fixture\n'
            'forward_auth @fixturePolicy 127.0.0.1:{$FYSO_OMB_PORT} {\n'
            '    uri /__policy_decision\n'
            '    header_up X-Fyso-Policy-Host {host}\n'
            '    header_up X-Fyso-Policy-Path {path}\n'
            '}\n'
        )
        shutil.copy(Path(os.environ.get('FYSO_TEST_GATEWAY_CONFIG', ROOT / 'template/Caddyfile')), cls.root / 'Caddyfile')
        config = (ROOT / 'template/project/auth/tinyauth.yaml.jinja').read_text().replace('{{ admin_user }}', 'admin')
        # A second local identity has access only to OMB; panel and Dagu remain denied.
        config = config.replace('  omb:\n    users:\n      allow: "admin"', '  omb:\n    users:\n      allow: "admin,viewer"')
        if getattr(cls, 'biz_extension', None):
            config = config.replace('  panel:\n    users:\n      allow: "admin"', '  panel:\n    users:\n      allow: "admin,viewer"')
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
                if self.path == '/__policy_decision':
                    allowed = (self.headers.get('Remote-User') == 'admin'
                               and self.headers.get('Authorization') is None
                               and self.headers.get('X-Forwarded-Method') == 'GET'
                               and self.headers.get('X-Fyso-Policy-Path') in ('/__policy_fixture', '/api/dagu/__policy_fixture')
                               and self.headers.get('X-Fyso-Policy-Host') in (
                                   f'panel.{cls.domain}', f'dagu.{cls.domain}', f'omb.{cls.domain}')
                               and 'tinyauth-session-' not in self.headers.get('Cookie', ''))
                    self.send_response(204 if allowed else 403)
                    self.end_headers()
                    return
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
        for offset in ([4] if getattr(cls, "dagu_binary", None) else [1, 4]):
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
        env = {**os.environ, 'FYSO_ROOT': str(cls.root), 'FYSO_DATA': str(cls.panel_data),
            'XDG_CONFIG_HOME':str(cls.root / 'caddy-config'), 'XDG_DATA_HOME':str(cls.root / 'caddy-data'),
            'FYSO_PANEL_ROOT': str(cls.root / 'panel'), 'FYSO_HTTP_PORT': str(cls.port),
            'FYSO_WEB_DOMAIN': cls.domain, 'FYSO_AUTH_UPSTREAM': f'127.0.0.1:{cls.port + 9}',
            'FYSO_WEB_SCHEME': cls.scheme, 'FYSO_WEB_PORT_SUFFIX': '' if cls.scheme == 'https' else f':{cls.port}',
            'FYSO_DAGU_PORT': str(cls.port + 1), 'FYSO_OMB_PORT': str(cls.port + 4),
            'FYSO_CADDY_ADMIN_PORT': str(cls.port + 8), 'FYSO_BIND': '127.0.0.1',
            'FYSO_CONNECTOR_SETUP_SOCKET': str(cls.setup_socket), 'FYSO_MCP_SOCKET': str(cls.mcp_socket), 'FYSO_DAGU_AUTH': cls.dagu_auth, 'FYSO_OMB_TOKEN': 'fixture-omb-token'}
        cls.setup_extra_services(env)
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

class WebAuthHTTP(WebAuthFixture):
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

    def test_extension_policy_receives_authenticated_identity_before_app_credentials(self):
        for app, path in [
            ('panel', '/api/dagu/__policy_fixture'),
            ('dagu', '/__policy_fixture'),
            ('omb', '/__policy_fixture'),
        ]:
            with self.subTest(app=app):
                status, _, body = self.request(app, path, cookie=self.login(), Authorization='Bearer caller')
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body)['user'], 'admin')
                self.assertIn(self.request(app, path, **{'Remote-User': 'admin'})[0], (302, 401))

        status, _, _ = self.request('omb', '/__policy_fixture', cookie=self.login('viewer'),
                                    **{'Remote-User': 'admin'})
        self.assertEqual(status, 403)

    def test_extension_oauth_return_accepts_cross_site_navigation_with_session(self):
        route = '/extensions/sockext/oauth/callback?state=example&code=example'
        navigation = {'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate'}
        cookie = self.login()
        status, _, body = self.request('panel', route, cookie=cookie, **navigation)
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertEqual(data['path'], '/profile/callback?state=example&code=example')
        self.assertEqual(data['user'], 'admin')
        self.assertFalse(data['webCookieLeaked'])
        self.assertIn(self.request('panel', route, **navigation)[0], (302, 401))
        self.assertEqual(self.request('panel', '/api/ext/sockext/profile/callback', cookie=cookie, **navigation)[0], 403)

    def test_panel_access_without_provider_returns_no_policy(self):
        status, _, body = self.request('panel', '/api/panel-access', cookie=self.login())
        self.assertEqual(status, 204)
        self.assertEqual(body, '')

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

    def test_00_remote_mcp_registration_and_authorization_answers_reach_the_endpoint(self):
        # D91: registration and the two answers that carry the code gain `iss` in the endpoint.
        for method, path in [('POST', '/oauth/register'), ('GET', '/authorize?client_id=x'), ('POST', '/api/oidc/authorize-complete')]:
            status, _, body = self.request('auth', path, method, {} if method == 'POST' else None)
            self.assertEqual(status, 200, path); self.assertEqual(json.loads(body)['path'], path)
        for app in ['panel', 'dagu', 'omb']:
            self.assertNotEqual(json.loads(self.request(app, '/oauth/register', 'POST', {})[2] or '{}').get('path'), '/oauth/register', app)

    def test_98_authorization_answers_fall_back_to_the_login_without_the_endpoint(self):
        # The login keeps working for every app when the MCP endpoint is down.
        server = next(s for s in self.servers if getattr(s, 'server_address', None) == str(self.mcp_socket))
        server.shutdown(); server.server_close(); self.servers.remove(server); self.mcp_socket.unlink(missing_ok=True)
        status, headers, body = self.request('auth', '/authorize?client_id=x')
        self.assertIn(status, [302, 303], body); self.assertNotIn('"path"', body or '')
        self.assertEqual(self.request('auth', '/oauth/register', 'POST', {})[0], 502)

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


class BizPolicyGateway(WebAuthFixture):
    scheme = 'https'
    port_offset = 40
    biz_extension = os.environ.get('FYSO_TEST_BIZ_EXTENSION')
    dagu_binary = os.environ.get('FYSO_TEST_DAGU')

    @classmethod
    def setUpClass(cls):
        if not cls.biz_extension:
            raise unittest.SkipTest('requires a generated project with the managed Biz extension')
        source = Path(cls.biz_extension) / 'extensions/biz'
        for filename in ('authorize.caddy', 'panel-access.caddy'):
            if not (source / filename).is_file():
                raise RuntimeError(
                    f'FYSO_TEST_BIZ_EXTENSION requires a generated project with managed access '
                    f'enabled and a rendered extensions/biz/{filename}'
                )
        super().setUpClass()

    @classmethod
    def setup_extra_services(cls, env):
        if cls.dagu_binary:
            workflows = cls.root / 'workflows'
            workflows.mkdir()
            (workflows / 'invoice.yaml').write_text(
                'name: invoice\nsteps:\n  - name: record\n    command: echo authorized-invoice\n'
            )
            cls.start([cls.dagu_binary, 'start-all'], {
                **env, 'DAGU_HOME': str(cls.root / 'dagu'), 'DAGU_DAGS_DIR': str(workflows),
                'DAGU_HOST': '127.0.0.1', 'DAGU_PORT': str(cls.port + 1),
                'DAGU_SCHEDULER_PORT': str(cls.port + 2), 'DAGU_WORKER_HEALTH_PORT': str(cls.port + 3),
                'DAGU_COORDINATOR_HOST': '127.0.0.1', 'DAGU_COORDINATOR_PORT': str(cls.port + 6),
                'DAGU_COORDINATOR_HEALTH_PORT': str(cls.port + 7), 'DAGU_PEER_INSECURE': 'true',
                'DAGU_AUTH_MODE': 'basic', 'DAGU_AUTH_BASIC_USERNAME': 'technical',
                'DAGU_AUTH_BASIC_PASSWORD': 'fixture-service-password',
            })
            cls.wait_port(cls.port + 1, '/api/v1/health')
        source = Path(cls.biz_extension) / 'extensions/biz'
        installed = cls.root / 'extensions/biz'
        installed.mkdir()
        for filename in ('authorize.caddy', 'panel-access.caddy'):
            shutil.copy(source / filename, installed / filename)
        cls.feedback_issue = 'https://github.com/fyso-dev/agentic-framework/issues/24'
        cls.feedback_posts = []
        cls.permissions = {
            'operator': {'app:panel', 'workflow:invoice:run', 'workflow:invoice:read', 'action:feedback:submit'},
            'reader': {'app:panel'},
        }
        cls.external_biz = os.environ.get('FYSO_TEST_BIZ_ORIGIN')
        cls.biz_project = os.environ.get('FYSO_TEST_BIZ_PROJECT', 'project')
        cls.biz_organization = 'acme' if cls.external_biz else 'fixture'
        origin = cls.external_biz or f'http://127.0.0.1:{cls.port + 12}'

        class BizFixture(BaseHTTPRequestHandler):
            def do_GET(self):
                parsed = urlparse(self.path)
                if parsed.path == '/.well-known/oauth-authorization-server':
                    return self.send_json({
                        'authorization_endpoint': f'{origin}/oauth/authorize',
                        'token_endpoint': f'{origin}/oauth/token',
                        'registration_endpoint': f'{origin}/oauth/register',
                        'code_challenge_methods_supported': ['S256'],
                    })
                principal = self.headers.get('Authorization', '').removeprefix('Bearer ')
                if principal not in cls.permissions:
                    return self.send_json({}, 401)
                if parsed.path == '/oauth/userinfo':
                    return self.send_json({'sub': principal, 'scope': 'framework_access', 'organization': 'fixture'})
                query = parse_qs(parsed.query)
                if parsed.path == '/oauth/framework-access' and query.get('organization') == ['fixture'] and query.get('project') == ['project']:
                    permissions = cls.permissions[principal]
                    if 'capability' in query:
                        return self.send_json({'allowed': query['capability'][0] in permissions})
                    return self.send_json({'capabilities': sorted(permissions)})
                return self.send_json({}, 404)

            def do_POST(self):
                body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
                if self.path == '/oauth/register':
                    return self.send_json({'client_id': 'fixture-client'}, 201)
                if self.path == '/oauth/token':
                    code = parse_qs(body.decode()).get('code', [''])[0]
                    if code in cls.permissions:
                        return self.send_json({'access_token': code, 'token_type': 'Bearer', 'expires_in': 300})
                parsed = urlparse(self.path)
                if parsed.path == '/oauth/framework-feedback':
                    cls.feedback_posts.append(json.loads(body))
                    if parse_qs(parsed.query, keep_blank_values=True) != {
                        'organization': ['fixture'], 'project': ['project'],
                    }:
                        return self.send_json({}, 400)
                    if self.headers.get('Authorization') != 'Bearer operator':
                        return self.send_json({}, 403)
                    return self.send_json({'number': 24, 'url': cls.feedback_issue}, 201)
                return self.send_json({}, 400)

            def send_json(self, data, status=200):
                body = json.dumps(data).encode()
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_):
                pass

        if not cls.external_biz:
            biz = ThreadingHTTPServer(('127.0.0.1', cls.port + 12), BizFixture)
            cls.servers.append(biz)
            threading.Thread(target=biz.serve_forever, daemon=True).start()
        socket = Path('/tmp') / f'fyso-ext-biz-{cls.port}.sock'
        cls.addClassCleanup(lambda: socket.unlink(missing_ok=True))
        cls.start(['node', str(source / 'gateway.cjs')], {
            **env, 'FYSO_EXT_SOCKET': str(socket), 'FYSO_EXT_BIZ_PORT': str(cls.port + 11),
            'FYSO_BIZ_URL': origin, 'FYSO_BIZ_ACCESS_ORGANIZATION': cls.biz_organization,
            'FYSO_BIZ_ACCESS_PROJECT': cls.biz_project,
        })
        cls.wait_port(cls.port + 11, '/health')

    def link_biz_profile(self, user, profile):
        local = self.login(user)
        status, headers, _ = self.request('panel', '/api/ext/biz/profile/login', 'POST', {}, cookie=local,
                                           Origin=self.origin('panel'))
        self.assertEqual(status, 303)
        state = parse_qs(urlparse(headers['Location']).query)['state'][0]
        binding = headers['Set-Cookie'].split(';', 1)[0]
        if self.external_biz:
            with urlopen(Request(headers['Location'], headers={'X-Test-Profile': profile}), timeout=10) as consent:
                callback = urlparse(json.loads(consent.read())['redirectTo'])
            path = f'{callback.path}?{callback.query}'
        else:
            path = '/extensions/biz/oauth/callback?' + urlencode({'state': state, 'code': profile})
        status, headers, _ = self.request('panel', path, cookie=f'{local}; {binding}', **{'Sec-Fetch-Site': 'cross-site'})
        self.assertEqual(status, 303)
        return f"{local}; {headers['Set-Cookie'].split(';', 1)[0]}"

    def test_biz_policy_gateway_revocation_for_two_profiles(self):
        operator = self.link_biz_profile('admin', 'operator')
        reader = self.link_biz_profile('viewer', 'reader')
        route = '/api/dagu/dags/invoice/enqueue'
        status, _, body = self.request('panel', route, 'POST', {}, cookie=operator)
        self.assertIn(status, (200, 201, 202), body)
        self.assertEqual(self.request('panel', route, 'POST', {}, cookie=reader)[0], 403)
        if self.dagu_binary:
            run = json.loads(body)['dagRunId']
            details = '/api/dagu/dag-runs/invoice/' + run
            for _ in range(100):
                status, _, body = self.request('panel', details, cookie=operator)
                if status == 200 and json.loads(body)['dagRunDetails']['statusLabel'] == 'succeeded':
                    break
                time.sleep(.1)
            else:
                self.fail(f'The allowed workflow did not complete, last HTTP status {status}')
            self.assertEqual(self.request('panel', details, cookie=reader)[0], 403)
        status, _, body = self.request('panel', '/api/panel-access', cookie=reader)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'capabilities': ['app:panel']})
        if self.external_biz:
            with urlopen(Request(self.external_biz + '/__fixture/revoke', method='POST'), timeout=10) as result:
                self.assertEqual(result.status, 204)
        else:
            self.permissions['operator'].remove('workflow:invoice:run')
        self.assertEqual(self.request('panel', route, 'POST', {}, cookie=operator)[0], 403)

        old_profile = reader.split('; ', 1)[1]
        status, _, _ = self.request('panel', '/api/session/logout', 'POST', {}, cookie=reader,
                                    Origin=self.origin('panel'))
        self.assertIn(status, (200, 204))
        reader_again = f"{self.login('viewer')}; {old_profile}"
        status, _, body = self.request('panel', '/api/panel-access', cookie=reader_again)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'capabilities': []})

    def test_biz_feedback_revocation_blocks_submission(self):
        if self.external_biz:
            self.skipTest('requires the local Biz fixture to observe upstream feedback requests')
        extension = Path(self.biz_extension) / 'extensions/biz'
        self.assertTrue(
            (extension / 'feedback.cjs').is_file(),
            'FYSO_TEST_BIZ_EXTENSION requires a feedback-capable Biz installation with extensions/biz/feedback.cjs',
        )
        page_asset = extension / 'panel/feedback.html'
        self.assertTrue(page_asset.is_file(), 'requires the built Biz feedback page')
        installed = self.root / 'extensions/biz'
        shutil.copytree(page_asset.parent, installed / 'panel')
        shutil.copytree(extension / 'pages', installed / 'pages')
        (self.root / '.copier-answers.ext-biz.yml').write_text('{}\n')
        subprocess.run(
            ['node', str(ROOT / 'template/framework/scripts/panel-data.cjs'), 'config'],
            cwd=self.root, check=True, timeout=30,
            env={**os.environ, 'PATH': str(self.root / 'bin') + os.pathsep + os.environ['PATH'],
                 'FYSO_ROOT': str(self.root), 'FYSO_DATA': str(self.panel_data),
                 'FYSO_WEB_DOMAIN': self.domain, 'FYSO_HTTP_PORT': str(self.port),
                 'FYSO_WEB_SCHEME': self.scheme},
        )

        route = '/api/ext/biz/profile/feedback'
        report_id = '28056ceb-01f7-45d2-a813-4bb5c2446310'
        unsent_id = '28056ceb-01f7-45d2-a813-4bb5c2446311'
        folder = self.root / 'project/wiki/feedback'
        folder.mkdir(parents=True)
        for feedback_id in (report_id, unsent_id):
            (folder / (feedback_id + '.md')).write_text(
                f'# Feedback\n\n- ID: {feedback_id}\n\n## Title\n\nFailure\n\n'
                '## Component\n\nPanel\n\n## Description and evidence\n\nEvidence\n')

        operator_permissions = self.permissions['operator']
        page_permission = 'page:extension:biz'
        operator_permissions.add(page_permission)
        self.addCleanup(operator_permissions.discard, page_permission)
        operator = self.link_biz_profile('admin', 'operator')
        reader = self.link_biz_profile('viewer', 'reader')
        status, _, body = self.request('panel', '/config/extensions.json', cookie=operator)
        self.assertEqual(status, 200, body)
        inventory = json.loads(body)
        biz = [entry for entry in inventory if entry['id'] == 'biz']
        self.assertEqual(len(biz), 1, inventory)
        feedback_pages = [
            entry for entry in biz[0]['pages']
            if entry.get('name_i18n', {}).get('en', entry['name']) == 'Report to Fyso'
        ]
        self.assertEqual(len(feedback_pages), 1, biz[0]['pages'])
        page = feedback_pages[0]['url']
        self.assertEqual(page, '/extensions/biz/panel/feedback.html')
        self.assertEqual(self.request('panel', page, cookie=reader)[0], 403)
        status, _, body = self.request('panel', page, cookie=operator)
        self.assertEqual(status, 200, body)
        self.assertEqual(body.encode(), page_asset.read_bytes())
        operator_permissions.remove(page_permission)
        self.assertEqual(self.request('panel', page, cookie=operator)[0], 403)
        operator_permissions.add(page_permission)

        preview = route + '?id=' + report_id
        origin = self.origin('panel')
        data = {'id': report_id, 'title': 'Reviewed', 'body': 'Sanitized'}
        self.assertEqual(self.request('panel', preview, cookie=reader)[0], 403)
        status, _, body = self.request('panel', preview, cookie=operator)
        self.assertEqual(status, 200, body)
        self.assertEqual(json.loads(body)['body'], 'Component: Panel\n\nEvidence')
        self.assertEqual(self.request('panel', route, 'POST', data, cookie=reader, Origin=origin)[0], 403)
        self.assertEqual(self.request('panel', route, 'POST', data, cookie=operator,
                                      Origin='https://foreign.example')[0], 403)
        status, _, body = self.request('panel', route, 'POST', data, cookie=operator, Origin=origin)
        self.assertEqual(status, 200, body)
        self.assertEqual(json.loads(body)['url'], self.feedback_issue)
        self.assertEqual(self.feedback_posts, [data])
        status, _, body = self.request('panel', preview, cookie=operator)
        self.assertEqual(status, 200, body)
        self.assertEqual(json.loads(body)['receipt']['number'], 24)

        unsent_preview = route + '?id=' + unsent_id
        self.assertEqual(self.request('panel', unsent_preview, cookie=operator)[0], 200)
        self.permissions['operator'].remove('action:feedback:submit')
        self.addCleanup(self.permissions['operator'].add, 'action:feedback:submit')
        self.assertEqual(self.request('panel', unsent_preview, cookie=operator)[0], 403)
        status, _, body = self.request('panel', route, 'POST', {**data, 'id': unsent_id},
                                       cookie=operator, Origin=origin)
        self.assertEqual(status, 403, body)
        self.assertEqual(self.feedback_posts, [data])


if __name__ == '__main__':
    unittest.main()
