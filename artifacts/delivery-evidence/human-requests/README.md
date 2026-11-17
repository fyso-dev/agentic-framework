# Human requests — local validation

[Local test walkthrough](try-it.md).

Status: **experimental; not a release or a complete generated-stack acceptance**. The current evidence uses fictional, non-sensitive requests. Recipient labels route requests but do not enforce access; responder names are self-declared.

| Scope | Observation | Evidence |
| --- | --- | --- |
| Bot → browser → same conversation and delivery retry | A real bot created a request in an assembled isolated fixture. A second authenticated browser answered, and two delivery retries produced one matching message and one controlled test effect. The extension page used SDK mock mode. | [Recovery gate](integrated-gate.md), [browser](final-retry-browser.md) |
| Restart while waiting | Four fixture components restarted; the response reached the originating task and one controlled effect was observed. | [Restart gate](restart-gate.md), [browser](restart-browser.md) |
| Saved completion with resume failure | Dagu 2.24 retained the response after a forced queue failure; the native resume endpoint and an isolated browser recovery action succeeded. | [503 recovery](dagu-503-recovery.md) |
| Generated project, native Dagu runner | Copier 9.19.1 generated a project and installed the bundled extension; its `run-dagu.sh` started isolated Dagu 2.24, a fictional request was answered and `ask`, `record`, and `deliver` succeeded with `origin=none`. No mise command was used. | [Generated Dagu test](generated-dagu.md) |
| Generated project, panel and gateway | The generated panel showed the installed page; a fictional response went through the authenticated gateway and remained visible after reload. The workflow used `origin=none` and Dagu was started directly. | [Generated panel test](generated-gateway.md) |
| Inbox, structured requests, questions to the agent, menu counter | The redesigned page and the generic page counter ran in a browser against a running generated demo; on a generated project a real bot answered a person's question from its conversation and continued there after the decision. The bot did not create the request itself. | [Inbox and question](inbox-and-question.md) |
| Generated Codex conversation | Real provider responded, but scoped MCP was unavailable even after a native connection test and own-instance restart. Follow-up: Codex bots of the project see the host user's personal MCP servers and none of the project's; the same bot on a Claude model completed the whole loop, creating its own request. | [Integration blocker](generated-codex-blocker.md) |
| Normal generated setup, startup and doctor | Actual mise tasks passed with all services ready and genuine engine status checks. A successful model conversation remains separate. | [Lifecycle smoke](generated-lifecycle.md) |

The older screenshot below depicts a fictional request in an earlier prototype and is not evidence for the current generated-project or bot flows.

![Earlier Pending prototype](pending.png)

HTTP callbacks have isolated tests, including a fictional receiver and TLS; receiver-side idempotency and external networking require independent validation. The extension is published as `gh:fyso-dev/fyso-ext-human-requests` (v0.1.0) and supports Copier's normal update lifecycle from that source; installations from the bundled directory must migrate once (see [pi-beta](pi-beta.md#published-versioned-source)). No real sensitive approval or extension installation was authorized by the fictional examples.
