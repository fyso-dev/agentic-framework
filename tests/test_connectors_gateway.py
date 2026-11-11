"""Opt-in restrictions on the real isolated panel → OMB connector gateway."""
import base64
import json
import os
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen


@unittest.skipUnless(os.environ.get('FYSO_TEST_HTTP_PORT'), 'requires disposable connector stack')
class ConnectorsGateway(unittest.TestCase):
    def request(self, path, method='GET', auth=True, **headers):
        port = os.environ['FYSO_TEST_HTTP_PORT']
        headers['Host'] = f'panel.localhost:{port}'
        if auth:
            headers['Authorization'] = 'Basic ' + base64.b64encode(b'admin:admin').decode()
        if method in ['POST', 'PATCH']:
            headers['Content-Type'] = 'application/json'
        try:
            with urlopen(Request(f'http://127.0.0.1:{port}{path}', method=method, headers=headers,
                                 data=b'{}' if method in ['POST', 'PATCH'] else None), timeout=15) as response:
                return response.status, response.read().decode()
        except HTTPError as error:
            return error.code, error.read().decode()

    def test_native_catalog_and_redacted_mcp_metadata(self):
        for path in ['/api/omb/connectors/catalog', '/api/omb/connectors/connected', '/api/omb/mcp/servers']:
            code, body = self.request(path)
            self.assertEqual(code, 200, path)
            self.assertNotIn('omb_sess_', body)
            self.assertIsInstance(json.loads(body), dict)

    def test_unauthenticated_and_foreign_requests_are_rejected(self):
        self.assertEqual(self.request('/api/omb/mcp/servers', auth=False)[0], 401)
        self.assertEqual(self.request('/api/omb/mcp/servers', Origin='https://foreign.invalid')[0], 403)
        self.assertEqual(self.request('/api/omb/mcp/servers', method='POST',
                                      **{'Sec-Fetch-Site': 'cross-site'})[0], 403)

    def test_other_native_apis_and_methods_stay_closed(self):
        for path in ['/api/omb/settings', '/api/omb/mcp', '/api/omb/bots/arbitrary', '/api/omb/connectors/private/execute']:
            self.assertEqual(self.request(path)[0], 404, path)
        self.assertEqual(self.request('/api/omb/mcp/servers', method='PUT')[0], 405)


if __name__ == '__main__':
    unittest.main()
