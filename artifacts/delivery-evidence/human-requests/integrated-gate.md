# Integrated human request — isolated recovery evidence

Status: **the observed recovery scenario passed in a manually assembled isolated fixture**. This does not establish production readiness, a normal generated-project lifecycle, or exactly-once execution of arbitrary side effects.

## Environment

On 2026-11-14 UTC, an isolated OpenMausBot 0.1.141 using a real Claude bot, Dagu 2.24.0 and Node 24.15.0 used separate temporary data and loopback ports. A separate Caddy/Tinyauth gateway and browser profile represented the person. No user's OpenMausBot, Dagu, or web session was used. Dagu used no authentication only within the isolated loopback fixture; its admin strings were synthetic.

The tested files were byte-identical to the integrated worktree at the end of the experiment:

| File | SHA-256 |
|---|---|
| `project/workflows/ext-human-requests-request.yaml` | `a86346a9f1e3682d93b310621ee6a4d913587f5b43e383c7e70fd1a03717fab9` |
| `extensions/human-requests/deliver.cjs` | `98c279c858728f3018102754a44e7110fe92d9740df53c5372faf00902c73582` |
| `extensions/human-requests/validate-answer.cjs` | `b106306389b1adb1e70743a690feac5b7a8af2c2eace7d26de5155b94e245ef3` |

The actual experimental workflow YAML was not changed for this run. Dagu was started directly with an `env -i` environment comparable to framework `clean_exec`, an explicitly selected pinned PATH, and no inherited `SHELL`. This does not prove what a standard `mise`/process-compose installation selects. No global mise trust was changed.

## Recovery scenario

1. In a real isolated task, the bot used Dagu MCP to create run `gate-final-retry-007`, with a fictional approval question, explicit choices and a return to that same task. Its test-only instruction was to append one line to an isolated file **only after approval**. The file did not exist before the answer.
2. The isolated OpenMausBot was stopped. In the independent authenticated browser, the person selected `aprobado` and submitted it through the gateway. Login and completion returned HTTP 200; the page reported the answer saved and the browser check observed no console errors. The browser evidence is documented in [final-retry-browser.md](final-retry-browser.md).
3. Dagu reported `ask=succeeded`, `record=succeeded`, `deliver=failed`. Its public run-outputs endpoint returned the submitted `answer`, `comment`, `responder` and `decision`, despite the failed delivery.
4. OpenMausBot was restarted against the same test data. A delivery-only retry succeeded. The bot received the message in the same conversation, checked the run, and appended one line to the test-only file.
5. Repeating the same delivery-only retry succeeded. The isolated message database contained **one** matching user-answer message, and the controlled effect file contained **one** line. Two bot text messages observed in the conversation announced and reported the action; they are not evidence of two separate turns. The selected workflow's deterministic `send-id` was used. The response was not submitted again.

## Limits and next checks

- These results concern one controlled local effect, not a general exactly-once guarantee. An agent's external side effects need their own idempotency and authorization.
- A successful delivery step means OpenMausBot accepted the message; it does not by itself prove completion of subsequent bot work.
- This was a manually assembled gateway and runtime fixture, not a full generated-project doctor or release test. The earlier scenario's gateway fixture had unrelated core 404s; this final browser run reported zero console errors.
- Individual identity and recipient authorization remain outside this test. The responder name is self-declared. Do not use the flow for sensitive approvals.
- HTTP-origin return, cancellation, expiry, missing task and restart-while-waiting need matching tests against the final integrated revision and its normal generated environment; separate earlier evidence covers only portions.

## Reproduction outline

Use the pinned binaries and distinct loopback ports and data directories. Start isolated Dagu with the framework-equivalent clean environment, OpenMausBot with an explicit port, and a separate authenticated gateway/browser. Give a test-only bot access to the isolated Dagu MCP and have it create a root request with a stable run ID, choices and exact originating task. Stop only that OpenMausBot, answer through the second browser, and verify `ask` and `record` succeeded while `deliver` failed. Restart that same isolated server and run `dagu retry --run-id <run> --step deliver ext-human-requests-request` twice. Compare the matching message count and controlled test-effect count, and inspect the same conversation. Do not place real credentials, customer data or absolute host paths in evidence. A turnkey executable harness for this complete chain has not yet been retained.
