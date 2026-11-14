# Human requests — local validation

Status: **experimental; not a release or a complete generated-stack acceptance**. The current evidence uses fictional, non-sensitive requests. Recipient labels route requests but do not enforce access; responder names are self-declared.

| Scope | Observation | Evidence |
| --- | --- | --- |
| Bot → browser → same conversation and delivery retry | A real bot created a request in an assembled isolated fixture. A second authenticated browser answered, and two delivery retries produced one matching message and one controlled test effect. The extension page used SDK mock mode. | [Recovery gate](integrated-gate.md), [browser](final-retry-browser.md) |
| Restart while waiting | Four fixture components restarted; the response reached the originating task and one controlled effect was observed. | [Restart gate](restart-gate.md), [browser](restart-browser.md) |
| Saved completion with resume failure | Dagu 2.24 retained the response after a forced queue failure; the native resume endpoint and an isolated browser recovery action succeeded. | [503 recovery](dagu-503-recovery.md) |
| Generated project, native Dagu runner | Copier 9.19.1 generated a project and installed the bundled extension; its `run-dagu.sh` started isolated Dagu 2.24, a fictional request was answered and `ask`, `record`, and `deliver` succeeded with `origin=none`. No mise command was used. | [Generated Dagu test](generated-dagu.md) |
| Generated project, panel and gateway | The generated panel showed the installed page; a fictional response went through the authenticated gateway and remained visible after reload. The workflow used `origin=none` and Dagu was started directly. | [Generated panel test](generated-gateway.md) |
| Full generated lifecycle, bot and `mise run doctor` | Not established. The generated Dagu test does not exercise the full stack, an actual bot, the panel gateway or engine authentication. | [Proposal and remaining acceptance](../../../docs/human-requests-proposal.md) |

The older screenshot below depicts a fictional request in an earlier prototype and is not evidence for the current generated-project or bot flows.

![Earlier Pending prototype](pending.png)

HTTP callbacks have isolated tests, including a fictional receiver and TLS; receiver-side idempotency and external networking require independent validation. The bundled extension does not currently support Copier's normal update lifecycle because it lacks a versioned source reference. No real sensitive approval or extension installation was authorized by the fictional examples.
