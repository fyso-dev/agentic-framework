"""Opt-in mutating tests: FYSO_TEST_BOT_CRUD=1 on a disposable generated project only."""
import base64
import json
import os
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen


@unittest.skipUnless(os.environ.get("FYSO_TEST_BOT_CRUD") == "1", "requires explicit disposable CRUD fixture")
class BotArchitectHTTPTests(unittest.TestCase):
    @classmethod
    def api(cls, path, payload=None):
        port = os.environ["FYSO_TEST_HTTP_PORT"]
        headers = {"Host": f"panel.localhost:{port}", "Content-Type": "application/json",
                   "Authorization": "Basic " + base64.b64encode(os.environ.get("FYSO_TEST_CREDENTIALS", "admin:admin").encode()).decode()}
        with urlopen(Request(f"http://127.0.0.1:{port}/api/dagu/{path}", headers=headers,
                             data=None if payload is None else json.dumps(payload).encode()), timeout=15) as response:
            return json.load(response)

    @classmethod
    def action(cls, params, success=True):
        run = cls.api("dags/fyso-bot-architect/enqueue", {"params": json.dumps(params)})["dagRunId"]
        for _ in range(120):
            try:
                details = cls.api(f"dag-runs/fyso-bot-architect/{run}")["dagRunDetails"]
            except HTTPError:
                time.sleep(0.2)
                continue
            if details["statusLabel"] in ["failed", "aborted", "rejected"]:
                if success:
                    raise AssertionError(f"workflow failed: {run}")
                return {"failedRun": run}
            if details["statusLabel"] == "succeeded":
                if not success:
                    raise AssertionError(f"workflow unexpectedly succeeded: {run}")
                value = cls.api(f"dag-runs/fyso-bot-architect/{run}/outputs")["outputs"]["result"]
                return json.loads(value) if isinstance(value, str) else value
            time.sleep(0.5)
        raise AssertionError("fixture workflow timed out")

    @classmethod
    def plan(cls, action, patch=None, bot_id=None, success=True):
        params = {"OP": "plan", "ACTION": action}
        if patch is not None:
            params["BOT_B64"] = base64.b64encode(json.dumps(patch).encode()).decode()
        if bot_id:
            params["BOT_ID"] = bot_id
        return cls.action(params, success=success)

    @classmethod
    def setUpClass(cls):
        cls.name = "Guard Proof " + str(int(time.time()))
        plan = cls.plan("create", {"name": cls.name, "model": "codex/gpt-6.1-sol", "soul": "Read-only fixture; no external actions."})
        cls.creation_plan = plan["planId"]
        cls.receipt = cls.action({"OP": "apply", "PLAN_ID": cls.creation_plan})
        cls.bot_id = cls.receipt["botId"]

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, "bot_id", None):
            plan = cls.plan("delete", bot_id=cls.bot_id)
            cls.action({"OP": "apply", "PLAN_ID": plan["planId"]})

    def test_completed_plan_replays_original_receipt(self):
        result = self.action({"OP": "apply", "PLAN_ID": self.creation_plan})
        self.assertTrue(result["replayed"])
        self.assertEqual(result["botId"], self.bot_id)
        self.assertEqual(result["commit"], self.receipt["commit"])

    def test_stale_plan_does_not_overwrite_newer_change(self):
        first = self.plan("update", {"title": "First version"}, self.bot_id)
        stale = self.plan("update", {"title": "Must not apply"}, self.bot_id)
        self.action({"OP": "apply", "PLAN_ID": first["planId"]})
        self.action({"OP": "apply", "PLAN_ID": stale["planId"]}, success=False)
        current = self.action({"OP": "read", "BOT_ID": self.bot_id})
        self.assertEqual(current["bot"]["title"], "First version")

    def test_protected_delete_and_secret_are_rejected_before_mutation(self):
        bots = self.action({"OP": "list"})["bots"]
        chief = next(bot for bot in bots if bot["name"] == "MausBot")
        self.plan("delete", bot_id=chief["id"], success=False)
        name = self.name + " Secret"
        fake = "ghp_" + "Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv1Wx2"
        self.plan("create", {"name": name, "model": "codex/gpt-6.1-sol", "soul": "github_token = '" + fake + "'"}, success=False)
        after = self.action({"OP": "list"})["bots"]
        self.assertNotIn(name, [bot["name"] for bot in after])
        self.assertIn(chief["id"], [bot["id"] for bot in after])
