# Human requests for agents

Status: **experimental first-version design; not delivered or release-ready**. A manually assembled isolated fixture exercised the real bot-to-browser-to-bot path and one controlled recovery case. Normal generated-project setup, startup and an unskipped green doctor have now passed; the complete generated bot/browser conversation and acceptance by a non-technical user remain outstanding. This document defines the intended first version; it does not claim its deployment or acceptance.

Related: [D76](PLAN.md#2-decisions-log) · [original Dagu spike](adr/spikes/human-requests.md) · [continuation brief](human-requests-next-steps.md) · [recovery evidence](../artifacts/delivery-evidence/human-requests/integrated-gate.md) · [restart evidence](../artifacts/delivery-evidence/human-requests/restart-gate.md).

## Need and boundary

An agent may need to ask another person, or leave a question for its current interlocutor to answer later. A person can find the request in the project, answer or cancel it, and the originating work receives the result. Programs may create and read requests through Dagu's native API; an explicitly configured HTTP receiver is a separate return option. A question viewed or delivered is not an approval.

The first version is **self-hosted and for non-sensitive decisions by trusted project operators**. A shared login and self-declared names are allowed, but neither proves identity nor restricts a request to its named recipient. Under D40, panel access already grants broad project execution. No individual privacy, reviewer authorization, personal inbox or audit attribution is promised. Real installations, irreversible actions or sensitive approvals still follow their existing authorization and review processes.

## Architecture and packaging

Use Dagu 2.24.0's native `human.task`: one root workflow run is one request. A human task stores its values, a native `outputs.write` step records them for inspection, and a delivery step returns the result. Runs retain their workflow definition at creation. Use the current Dagu and OpenMausBot instances belonging to the generated project, never a person's desktop instance. No separate task product, database or service is introduced.

The first implementation is the opt-in **bundled Copier extension** at `template/framework/extensions/human-requests/`, ID `human-requests`. It is not a separately published repository or an official catalog release. It uses the existing extension slots:

| Piece | Slot |
|---|---|
| Request and expiry sweep | `project/workflows/ext-human-requests-request.yaml` and `ext-human-requests-sweep.yaml` |
| Pending page and localization | `extensions/human-requests/pages/` and `panel/`, using the panel SDK's theme and language, with Spanish and English text |
| Agent rule | `extensions/human-requests/skills/`; a person enables it manually per bot |
| Process, port, extra database | None |

In a generated project, `mise run ext:add ./framework/extensions/human-requests -- --defaults` selects this bundled source. A two-stage Copier 9.19.1 test copies the framework into a disposable project, checks that the bundled extension's Copier manifest is present, and installs the extension into that project. It does not run the project's lifecycle or prove that the `mise` task and activation work end to end. Reproduce with `FYSO_TEST_COPIER` pointing to the pinned Copier executable and `python3 -m unittest tests.test_human_requests_copier`.

A separate [generated-project Dagu test](../artifacts/delivery-evidence/human-requests/generated-dagu.md) used the generated `run-dagu.sh` with no mise command and confirmed an authenticated `origin=none` request through to its outputs. This does not cover the full generated stack, panel or bot.

The bundled source currently has no independent version reference: an isolated Copier test produced answers without `_commit`, and `copier update` rejected that installation. A framework update therefore does not automatically migrate an installed extension. A versioned extension source or a separately designed migration remains necessary before promising the normal extension-upgrade lifecycle.

An extension keeps this optional capability independently installable and removable without adding a core feature flag or background process. It cannot automatically provide the rule to every agent, add a pending count to the core navigation, or be assumed present by other extensions.

The SDK does **not** expose the run-list and human-task completion endpoints. The page needs the existing same-origin authenticated Caddy bridge `/api/dagu/*`, using gateway-root-relative requests. This bridge uses the project's technical Dagu identity and is not a per-person permission boundary. The check-list icon and shared environment handling are framework dependencies that must be reviewed separately; bundling the extension does not prove the feature can ship without any core changes. Desktop or CLI agents do not automatically receive the extension skill.

Promotion into core is a later, separately recorded decision if framework workflows or other extensions require it, nearly every project installs it, or a pending count is required in the main navigation. Promotion would rename the workflows to `fyso-*`, move the page into the core panel and move the agent rule to `agent-context.md`; it requires a new PLAN decision. Until then, extensions may not assume it is installed. Local-user/password changes and installers remain a separate workstream; this feature does not introduce a new user directory.

## Request contract

- The agent starts `ext-human-requests-request` through Dagu MCP or API with a caller-selected stable run ID, question, context, recipient, blocking indication and origin. A recipient is a routing label (`assignee=...`), not an access-control rule. `team` is the fallback only when the requester has not identified a person.
- The request must name the asking agent and work, explain why input is needed, what each option permits, and what happens if nobody responds. Agents do not invent recipients or claim an action was performed before it happens. Never include credentials or unnecessary personal data.
- The run carries `human-request`; optional choices are encoded in `choices-hex`, and optional expiry in one `deadline` label. Labels are visible to project operators. Dagu does not natively enforce the recipient or deadline. The page lists the waiting run and reads its prompt and flat form through the bridge.
- Answer and cancellation use the same native human-task completion call; expiration is recorded by `ext-human-requests-sweep`. Submission, delivery and completed agent work are distinct states. The page shows recent activity and the recorded answer, with delivery-step status; a delivery acknowledgement does not prove the bot acted.
- Dagu stores a submitted answer before the delivery-side choice guard checks it. If direct API input is invalid, the run fails without delivering the answer; it cannot be corrected in place and a replacement request is needed. The UI may validate earlier, but direct callers must not rely on UI validation.
- One `human.task` cannot be cancelled by a native waiting-run cancellation in the tested Dagu version, so cancellation is a recorded decision. Expiry completes overdue requests with `expired`; cancellation and expiry are never treated as approval.
- Answers survive a failed return in the run's recorded outputs. A retry must not ask the person again. Delivery to a missing task, ambiguous result and unavailable destination must remain visible rather than silently succeeding.

The tested Dagu 2.24.0 Unix socket implementation places run sockets in the host-wide temporary directory. Its suffix uses only six hexadecimal digits derived from the DAG name and run ID, and it removes that path before binding ([address](https://github.com/dagucloud/dagu/blob/v2.24.0/internal/cmn/sock/addr.go), [server](https://github.com/dagucloud/dagu/blob/v2.24.0/internal/cmn/sock/server.go)). Consequently, even different run IDs can collide across projects running the same DAG; checking whether the path exists beforehand does not eliminate a race. This is an upstream limitation, not an exactly-once guarantee. Assess and resolve it before treating concurrent multi-project use as release-ready.

### Origins and retry

- `none`: leave the answer in the run for the caller to read.
- `omb`: target the exact project bot and task on the explicit project OpenMausBot port. A deterministic native `--send-id` derived from run, bot and task coalesces repeated identical message submissions; a missing run ID fails closed. An accepted message is not a completed bot turn, and message deduplication does not establish exactly-once external effects. The caller must re-check context and use the normal action-specific safeguards.
- `http`: disabled until an operator configures one exact HTTPS destination and its SOPS bearer secret name in the project-owned workflow. An optional exact private IP opt-in supports trusted private/loopback **HTTPS** only; DNS answers must all match the pin and TLS certificate verification remains mandatory. Link-local/metadata and other special addresses stay blocked; redirects, URL credentials and query strings are rejected. No plain HTTP, including localhost. The receiver must atomically persist and enforce the deterministic `Idempotency-Key` with its effect and acknowledge it; an echoed header alone is not proof of deduplication. The key includes project and run IDs, so callers must choose run IDs globally unique across installations that use the same receiver. See [HTTP contract](../template/framework/extensions/human-requests/extensions/human-requests/HTTP.md).

No notifications or reminders are in this first version. A person discovers work by opening Pending; if the chosen real use case requires proactive notification, that is an explicit later decision rather than a hidden promise. The skill is opt-in manually per bot; extension installation does not modify project-owned `team.yaml`. For a reversible choice, the agent may proceed on a recorded assumption and disclose it; it creates a blocking request when the action cannot be undone or the answer changes what is done.

## Test-only scenario: proposed extension review

This scenario is fictional. It does **not** install an extension or authorize a real installation. Its five required answers are:

1. **Who asks and when?** A project agent has proposed a named extension and needs another person's decision before preparing a review. The request identifies the asking agent and originating task.
2. **Who answers and how is that known?** The recipient is named by the person assigning the work, or `team` when appropriate. The agent does not guess a person's identity. The label helps find the request but does not restrict access; the respondent's typed name is self-declared.
3. **What does the person need to see?** Extension name and source, why it is proposed, the test-only nature of the example, and consequences of each choice. `Approve review` allows only a subsequent review; `Decline` stops the proposal. Neither choice installs anything.
4. **How does the person find out?** They open Pending in the project panel. There is no notification in this version, so discovery depends on checking the page or existing human communication outside this feature.
5. **What happens afterward?** The agent in the originating task prepares the permitted review or stops, according to the recorded answer. Cancellation stops the proposal. Expiry is reported as unanswered. No response leaves the task waiting until an optional configured expiry; a delivery failure is visible separately from a saved answer.

This is a design walk-through and a test fixture, not a completed real-user evaluation. Whether a non-technical person can understand and answer it without help has not been established.

## Observed evidence and acceptance still required

On 2026-11-14 UTC, [a manually assembled isolated fixture](../artifacts/delivery-evidence/human-requests/integrated-gate.md) used a real Claude-backed OpenMausBot 0.1.141 task and Dagu 2.24.0. The bot created a request via MCP; a separate authenticated browser answered through Caddy/Tinyauth while that isolated OMB instance was stopped. The response was recorded, delivery failed, and two delivery-only retries after restart produced one matching message and one controlled local test effect. The browser page used SDK mock mode while gateway, authentication and Dagu were real. This is a passing observation for that fixture, **not** a turnkey reproducible full-project acceptance or a guarantee for arbitrary external effects.

A separate [Dagu 503 recovery experiment](../artifacts/delivery-evidence/human-requests/dagu-503-recovery.md) confirmed its specific stored-completion response and native resume endpoint. A browser fixture exercised the recovery action through a loopback bridge without authentication; it did not validate gateway behavior. A generic 503 does not establish that the answer was saved. In an authenticated gateway fixture, recent activity showed the recorded answer and responder after refresh. History depends on Dagu run retention and is not a permanent audit archive.

[A second isolated restart fixture](../artifacts/delivery-evidence/human-requests/restart-gate.md) showed the waiting request survived restart of its four components; an independent authenticated browser answered, the originating task received the message, and one controlled local effect appeared. The earlier individual browser and API checks also cover portions of cancellation, expiry and history. The HTTP transport has simulated, SOPS/age and TLS fixture tests; the DNS/CA adaptations and fictional receiver do not establish real external networking or receiver-side persistence.

Before deciding that the feature is usable or ready for release:

1. Make the full bot → second authenticated browser → same task flow reproducible in a normally generated project, including a delivery failure and safe retry. Preserve before/after conversation and step evidence, test a missing task and restart while waiting, and distinguish saved, accepted and acted outcomes.
2. Test actual callback receiver contract, including receiver authentication, exact destination policy, successful and failed acknowledgement, and repeat/timeout behavior. Do not claim receiver-side exactly-once effects without independent evidence.
3. Keep the [normal generated lifecycle smoke](../artifacts/delivery-evidence/human-requests/generated-lifecycle.md), relevant automated tests and `scripts/check-paths.sh` green. Actual setup, startup and doctor passed without skipped checks; engine directories had to be present in the fixture PATH. Installer suites are required only if that separate workstream is included.
4. Observe a non-technical person answering a real, non-sensitive scenario without help and validate the information, discovery and recovery path. The fictional scenario above is not that acceptance.
5. Keep `docs/README.md`, the spike findings and evidence current, and decide any publication or catalog entry separately. No push, merge, catalog publication or production deployment is implied by this document.
