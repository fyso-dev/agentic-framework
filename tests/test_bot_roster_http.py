"""Read-only gateway checks; never creates bots or sends messages."""
import base64
import json
import os
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen


@unittest.skipUnless(os.environ.get("FYSO_TEST_HTTP_PORT"), "requires an isolated stack")
class BotRosterHTTPTests(unittest.TestCase):
    def request(self, method="GET", auth=True, path="/api/omb/bots"):
        port = os.environ["FYSO_TEST_HTTP_PORT"]
        headers = {"Host": f"panel.localhost:{port}"}
        if auth:
            credentials = os.environ.get("FYSO_TEST_CREDENTIALS", "admin:admin")
            headers["Authorization"] = "Basic " + base64.b64encode(credentials.encode()).decode()
        try:
            with urlopen(Request(f"http://127.0.0.1:{port}{path}", headers=headers, method=method), timeout=10) as response:
                return response.status, response.read().decode()
        except HTTPError as error:
            return error.code, error.read().decode()

    def test_native_roster_is_authenticated_and_read_only(self):
        self.assertEqual(self.request(auth=False)[0], 401)
        for method in ("POST", "PUT", "PATCH", "DELETE"):
            self.assertEqual(self.request(method=method)[0], 405)
        self.assertEqual(self.request(path="/api/omb/bots/not-a-bot")[0], 404)

    def test_roster_uses_native_ids_without_conversation_history(self):
        status, body = self.request()
        self.assertEqual(status, 200)
        bots = json.loads(body)["bots"]
        self.assertTrue(bots)
        self.assertEqual(len({bot["id"] for bot in bots}), len(bots))
        self.assertTrue(all(not bot.get("messages") for bot in bots))
        self.assertNotIn("omb_sess_", body)

    def test_versioning_metadata_requires_login_and_exposes_only_git_evidence(self):
        path = "/config/bot-versioning.json"
        self.assertEqual(self.request(auth=False, path=path)[0], 401)
        self.assertEqual(self.request(method="POST", path=path)[0], 405)
        status, body = self.request(path=path)
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertTrue(data["commit"])
        self.assertTrue(data["bots"])
        for field in ('"soul"', '"messages"', '"modelSelection"', 'omb_sess_'):
            self.assertNotIn(field, body)
