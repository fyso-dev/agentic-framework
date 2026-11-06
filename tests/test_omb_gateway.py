"""Real-stack gateway regression: set FYSO_TEST_HTTP_PORT to a disposable stack."""
import base64
import json
import os
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen


@unittest.skipUnless(os.environ.get("FYSO_TEST_HTTP_PORT"), "requires an isolated running stack")
class OmbGatewayTests(unittest.TestCase):
    def request(self, path, auth=True, host="omb", data=None, **headers):
        port = os.environ["FYSO_TEST_HTTP_PORT"]
        headers["Host"] = f"{host}.localhost:{port}"
        if auth:
            credentials = os.environ.get("FYSO_TEST_CREDENTIALS", "admin:admin")
            headers["Authorization"] = "Basic " + base64.b64encode(credentials.encode()).decode()
        req = Request(f"http://127.0.0.1:{port}{path}", headers=headers, data=data)
        try:
            with urlopen(req, timeout=10) as response:
                return response.status, response.read().decode()
        except HTTPError as error:
            return error.code, error.read().decode()

    def test_unauthenticated_browser_cannot_list_bots(self):
        self.assertEqual(self.request("/api/bots", auth=False)[0], 401)

    def test_authenticated_browser_can_list_bots_without_pairing(self):
        code, body = self.request("/api/bots", **{"Sec-Fetch-Site": "same-origin", "Sec-Fetch-Dest": "empty"})
        self.assertEqual(code, 200, body)
        self.assertGreater(len(json.loads(body)["bots"]), 0)
        self.assertNotIn("omb_sess_", body)

    def test_cross_site_api_is_blocked(self):
        self.assertEqual(self.request("/api/bots", **{"Sec-Fetch-Site": "cross-site"})[0], 403)
        self.assertEqual(self.request("/api/bots", Origin="https://foreign.invalid")[0], 403)

    def test_same_origin_browser_can_create_stream_ticket(self):
        origin = "http://omb.localhost:" + os.environ["FYSO_TEST_HTTP_PORT"]
        code, body = self.request("/api/auth/stream-ticket", data=b"{}", Origin=origin,
                                  **{"Sec-Fetch-Site": "same-origin", "Content-Type": "application/json"})
        self.assertEqual(code, 200, body)
        self.assertNotIn("omb_sess_", body)

    def test_panel_exposes_gateway_link_without_bearer(self):
        code, body = self.request("/config/project.json", host="panel")
        self.assertEqual(code, 200)
        self.assertIn("http://omb.localhost:", body)
        self.assertNotIn("omb_sess_", body)


if __name__ == "__main__":
    unittest.main()
