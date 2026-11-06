"""Integration acceptance against an isolated generated project with real verification records."""
import base64
import json
import os
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen


@unittest.skipUnless(os.environ.get("FYSO_TEST_HTTP_PORT"), "requires an isolated stack")
class ObservabilityHTTPTests(unittest.TestCase):
    def request(self, auth=True, method="GET"):
        port = os.environ["FYSO_TEST_HTTP_PORT"]
        headers = {"Host": f"panel.localhost:{port}"}
        if auth:
            headers["Authorization"] = "Basic " + base64.b64encode(os.environ.get("FYSO_TEST_CREDENTIALS", "admin:admin").encode()).decode()
        try:
            with urlopen(Request(f"http://127.0.0.1:{port}/config/observability.json", headers=headers, method=method), timeout=10) as res:
                return res.status, res.read().decode()
        except HTTPError as error:
            return error.code, error.read().decode()

    def test_summary_requires_login_and_rejects_writes(self):
        self.assertEqual(self.request(auth=False)[0], 401)
        self.assertEqual(self.request(method="POST")[0], 405)

    def test_actual_conversation_and_harness_usage_are_explicitly_linked(self):
        code, body = self.request()
        self.assertEqual(code, 200)
        data = json.loads(body)
        self.assertEqual(data["sources"]["traces"], "ok")
        self.assertTrue(data["traces"])
        linked = [run for run in data["runs"] if run["traceId"]]
        self.assertTrue(linked, "run the real correlated harness verification first")
        self.assertGreater(linked[0]["usage"]["input"], 0)
        self.assertIsNone(linked[0]["usage"]["apiReportedUsd"])
        self.assertIsNone(linked[0]["usage"]["subscriptionEquivalentUsd"])
        self.assertIn(linked[0]["traceId"], [trace["id"] for trace in data["traces"]])
        self.assertEqual(sum(t["usage"]["input"] or 0 for t in data["traces"]),
                         sum(g["input"] or 0 for g in data["usage"]["groups"] if g["source"] == "omb"))
        self.assertNotIn("omb_sess_", body)
        self.assertNotIn('"trigger"', body)
        self.assertNotIn('"prompt"', body)
        self.assertNotIn('"messages"', body)
