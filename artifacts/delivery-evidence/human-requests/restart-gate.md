# Human request — restart while waiting

Status: **passed in a manually assembled isolated fixture; not a generated-project lifecycle or release acceptance**.

## Environment

On 2026-11-14 UTC, a Claude-backed bot in OpenMausBot 0.1.141, Dagu 2.24.0 and Node 24.15.0 used dedicated loopback ports and disposable data. A separate Caddy/Tinyauth gateway and browser profile represented a second person. The Dagu API used unauthenticated loopback access only in this fixture. All four components were stopped and restarted with the same fixture data; no user's existing service was touched.

The request YAML used SHA-256 `a86346a9f1e3682d93b310621ee6a4d913587f5b43e383c7e70fd1a03717fab9`, delivery script `98c279c858728f3018102754a44e7110fe92d9740df53c5372faf00902c73582`, and answer validator `b106306389b1adb1e70743a690feac5b7a8af2c2eace7d26de5155b94e245ef3`. Dagu was launched directly using a clean environment and explicitly selected pinned executables, without modifying global mise trust. This is not the normal `mise`/process-compose lifecycle.

## Observed sequence

1. A real bot created fictional run `gate-restart-008` through Dagu MCP in a fresh task. The request asked for approval of an isolated demonstration. The bot was instructed to create a single-line test file only after approval; the file was absent before the answer.
2. The run was waiting. The isolated gateway, login authority, Dagu and OpenMausBot were all stopped. They were then restarted with the same data. Dagu still reported `ask=waiting`, with `record` and `deliver` not started.
3. The person signed in using a separate browser session and answered `aprobado`. Login and completion returned HTTP 200; the page reported the answer saved and the browser observed no console errors. Screenshots and browser evidence are in [restart-browser.md](restart-browser.md).
4. Dagu reported `ask`, `record` and `deliver` succeeded. The same originating task contained one matching answer message. The bot checked the Dagu run state and reported writing the test-only file, which contained one line.

## Reproduction outline

Start the pinned versions on distinct loopback ports and data directories. Configure an isolated bot to access that Dagu MCP. Ask the bot to create a request with its own task ID as origin and to perform only a reversible, local test effect after approval. Confirm the request is waiting and the effect is absent. Stop all four isolated components; restart them using the same data; answer from an independent authenticated browser. Inspect Dagu step states, the originating task, the matching message count and the test effect. Do not include real credentials, sensitive messages or host-specific paths in shared evidence. A turnkey executable harness for this full chain has not yet been retained.

## Limits

This confirms this single waiting-run restart scenario and controlled local effect. It does not prove general exactly-once external actions, privacy or per-person authorization. It does not validate a production deployment, a full generated stack, a green doctor, or HTTP-origin delivery. The return-retry scenario is recorded separately in [integrated-gate.md](integrated-gate.md).
