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
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.environ.get('FYSO_TEST_TINYAUTH') and os.environ.get('FYSO_TEST_CADDY'), 'requires explicit native test binaries')
class WebAuthHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix='fyso-web-auth-')
        cls.root = Path(cls.tmp.name)
        cls.port = int(os.environ.get('FYSO_TEST_AUTH_PORT_BASE', '19800'))
        cls.domain = f'security-{cls.port}.localhost'
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
                    'daguCredential': self.headers.get('Authorization') == cls.dagu_auth,
                    'ombCredential': self.headers.get('Authorization') == 'Bearer fixture-omb-token',
                    'user': self.headers.get('Remote-User'),
                    'groups': self.headers.get('Remote-Groups'),
                    'nativeCookiePreserved': 'native-app=preserved' in self.headers.get('Cookie', ''),
                    'webCookieLeaked': 'tinyauth-session-' in self.headers.get('Cookie', ''),
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
        binary_dir = cls.root / 'bin'; binary_dir.mkdir()
        (binary_dir / 'yaml').symlink_to(ROOT / 'template/framework/panel/node_modules/yaml/bin.mjs')
        config_env = {**os.environ, 'PATH': str(binary_dir) + os.pathsep + os.environ['PATH'],
            'FYSO_ROOT':str(cls.root), 'FYSO_DATA':str(cls.root), 'FYSO_WEB_DOMAIN':cls.domain,
            'FYSO_HTTP_PORT':str(cls.port), 'FYSO_AUTH_PORT':str(cls.port + 9), 'FYSO_AUTH_USERS':cls.users}
        subprocess.run(['node', str(ROOT / 'template/framework/scripts/web-auth-config.cjs')], env=config_env, check=True)
        cls.auth_env = {**os.environ, 'TINYAUTH_CONFIGFILE':str(cls.root / 'web-auth/runtime/config.yaml')}
        cls.start_auth()
        env = {**os.environ, 'FYSO_ROOT': str(cls.root), 'FYSO_DATA': str(cls.root),
            'XDG_CONFIG_HOME':str(cls.root / 'caddy-config'), 'XDG_DATA_HOME':str(cls.root / 'caddy-data'),
            'FYSO_PANEL_ROOT': str(cls.root / 'panel'), 'FYSO_HTTP_PORT': str(cls.port),
            'FYSO_WEB_DOMAIN': cls.domain, 'FYSO_AUTH_PORT': str(cls.port + 9),
            'FYSO_DAGU_PORT': str(cls.port + 1), 'FYSO_OMB_PORT': str(cls.port + 4),
            'FYSO_CADDY_ADMIN_PORT': str(cls.port + 8), 'FYSO_BIND': '127.0.0.1',
            'FYSO_DAGU_AUTH': cls.dagu_auth, 'FYSO_OMB_TOKEN': 'fixture-omb-token'}
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
        headers['Host'] = f'{app}.{cls.domain}:{cls.port}'
        if cookie: headers['Cookie'] = cookie
        if body is not None: body = json.dumps(body); headers['Content-Type'] = 'application/json'
        connection.request(method, path, body, headers)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read().decode()
        connection.close()
        return result

    def login(self, username='admin'):
        status, headers, _ = self.request('auth', '/api/user/login', 'POST', {'username':username, 'password':self.password}, Origin=f'http://auth.{self.domain}:{self.port}')
        self.assertEqual(status, 200)
        cookie = headers.get('Set-Cookie', '')
        self.assertIn(f'Domain={self.domain}', cookie)
        self.assertIn('HttpOnly', cookie); self.assertIn('SameSite=Lax', cookie)
        return cookie.split(';')[0]

    def test_01_pages_redirect_and_apis_deny_without_browser_popup(self):
        for app in ['panel','dagu','omb']:
            status, headers, _ = self.request(app, **{'User-Agent':'Mozilla/5.0 Chrome/130.0.0.0'})
            self.assertEqual(status, 302); self.assertIn(f'auth.{self.domain}', headers['Location'])
            self.assertNotIn('Www-Authenticate', headers)
            status, headers, _ = self.request(app, '/api/probe', **{'User-Agent':'Mozilla/5.0 Chrome/130.0.0.0'})
            self.assertEqual(status, 401); self.assertNotIn('Www-Authenticate', headers)

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
                            Origin=f'http://{app}.{self.domain}:{self.port}')
                        self.assertEqual(status, 200)
                        data = json.loads(body)
                        self.assertFalse(data['webCookieLeaked'])
                        self.assertTrue(data['nativeCookiePreserved'])
                        self.assertEqual(data['user'], 'admin')

    def test_04_session_context_and_logout_revoke_cookie_replay(self):
        cookie = self.login()
        status, _, body = self.request('panel', '/api/session', cookie=cookie)
        self.assertEqual(status, 200); self.assertEqual(json.loads(body)['auth']['username'], 'admin')
        self.assertEqual(self.request('panel', '/api/session/logout', 'POST', {}, cookie=cookie, Origin=f'http://panel.{self.domain}:{self.port}')[0], 200)
        for app in ['panel','dagu','omb']:
            self.assertEqual(self.request(app, '/api/probe', cookie=cookie)[0], 401)

    def test_05_cross_origin_and_cross_site_requests_are_blocked(self):
        cookie = self.login()
        for app in ['panel','dagu','omb','auth']:
            for headers in [{'Origin':'https://foreign.invalid'}, {'Sec-Fetch-Site':'cross-site'}]:
                self.assertEqual(self.request(app, '/api/probe', 'POST', {}, cookie=cookie, **headers)[0], 403)
        # Sibling apps are same-site, but must not be able to forge each other's writes.
        self.assertEqual(self.request('dagu', '/api/probe', 'POST', {}, cookie=cookie, Origin=f'http://omb.{self.domain}:{self.port}')[0], 403)

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
        config.write_text(original.replace('sessionExpiry: 3600', 'sessionExpiry: 1').replace('sessionMaxLifetime: 28800', 'sessionMaxLifetime: 2'))
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


if __name__ == '__main__':
    unittest.main()
