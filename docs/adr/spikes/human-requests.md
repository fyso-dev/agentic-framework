# Spike: human requests for agents (Dagu `human.task` and the alternatives)

Date: 2026-11-13 · Result: **yes, natively, with glue for recipient, identity and cancellation** · Version: Dagu `2.24.0` (the project's pin)

Question: can an agent ask a person a question or request a decision (a person outside its conversation, or the same person later) and get the answer back programmatically, using software the framework already runs? Is there a dedicated product that does this better?

Proposal built on this spike: [human-requests-proposal.md](../../human-requests-proposal.md).

## Later isolated observations (2026-11-14 UTC)

A manually assembled isolated fixture subsequently exercised a real bot-created request, an answer from a second authenticated browser, and return to the same OpenMausBot task after a stopped-service failure. Two delivery-only retries produced one matching answer message and one controlled local test effect. A separate waiting-run restart fixture also completed. These observations concern fictional data and one controlled effect, not general exactly-once external actions or sensitive approvals. The browser used SDK mock mode; gateway, authentication and Dagu were real isolated services. See [recovery](../../../artifacts/delivery-evidence/human-requests/integrated-gate.md) and [restart](../../../artifacts/delivery-evidence/human-requests/restart-gate.md). A separate [Dagu 503 recovery fixture](../../../artifacts/delivery-evidence/human-requests/dagu-503-recovery.md) verified native resume after a stored completion; its browser used an unauthenticated loopback bridge, not the gateway. An authenticated gateway fixture separately showed recorded answers in recent activity after refresh. Run history is subject to Dagu retention and is not a permanent audit log.

The complete generated-project lifecycle, unskipped green doctor, external HTTP receiver, and independent non-technical user acceptance remain unverified. The later architectural direction is recorded in [D76](../../PLAN.md#2-decisions-log); this original spike's observations and survey below remain historical.

## What was run

The pinned Dagu binary, started alone with its own temporary home and ports on `127.0.0.1` (29801–29805), `DAGU_AUTH_MODE=basic` as `run-dagu.sh` does. No project's Dagu was touched; the processes were stopped and the directory removed. One workflow: a `human.task` step (`ask`) with a flat form, followed by a step that echoes its outputs.

| Step | Call (base `/api/v1`, basic auth) | Result |
|---|---|---|
| Create | `POST /dags/hitl-probe/start` with `params`, a caller-chosen `dagRunId` and `labels: ["assignee=alice"]` | 200, `dagRunId` returned |
| List pending | `GET /dag-runs?status=7&labels=human-request` | waiting runs with `labels`, `params`, `triggerActor`. `status` is numeric: `status=waiting` returns 400; Waiting is `7`. `labels` matches labels of the workflow and labels given at start |
| Read the question | `GET /dag-runs/hitl-probe/{id}` | `nodes[].step.humanTask.{prompt,form}`, prompt resolved, form normalized |
| Answer | `POST /dag-runs/hitl-probe/{id}/human-tasks/ask/complete` with the values | 200, `alreadyCompleted:false`, `resumeRequested:true`; the next step received the values |
| Invalid answer | same, value outside `enum` or missing a required field | 400 with the detail |
| Same answer again (any key order, even after the run ended) | same | 200, `alreadyCompleted:true`, no second resume |
| Different answer again | same | 409, "already completed with different input" |
| Restart the server while waiting | — | the run stayed listed and completed afterwards |
| Push back without `with.push_back` | `POST …/human-tasks/ask/push-back` | 400. The successful path was not run |
| Cancel a waiting `human.task` | `POST …/steps/ask/reject`, `…/approve`, `…/stop`, `DELETE` of the run, dequeue, `PATCH …/steps/ask/status`, `dagu stop` | **all refused or without effect**; the run stayed waiting and still accepted the answer |
| `approval` gate on a step | `POST …/steps/{step}/approve`, `/reject` | work; the run ends `rejected` on reject. Not idempotent: a second call returns 400 |
| Notification rule | `PUT /dags/{file}/notifications`, `events: ["dag.run.waiting"]`, target `webhook` | POST arrived 10–25 s later with `dagName`, `dagRunId`, `runPath`, `status`, without the prompt. Stored under the Dagu home, not in git |
| `handler_on.wait` | in the workflow YAML | ran once per run with `DAG_WAITING_STEPS=ask` |
| Audit log | `GET /audit` | 403, "Audit logs require a Dagu Pro license" |

## Findings

**Schema of `human.task` at v2.24.0** (`specs/031-human-task.md` at the tag, confirmed by the run):

- `id` is required. `with` accepts only `prompt` (required), `form`, `artifacts` and `push_back {rewind_to, form}`.
- `form` is a flat object. Property types: `string`, `integer`, `number`, `boolean`, with `title`, `description`, `default`, `enum`, `oneOf`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`. No nested objects or arrays.
- Outputs are read as `${steps.<id>.outputs.<prop>}`. An optional property that is omitted and has no `default` publishes nothing: the reference stays literal and the next step fails. Give every optional property a `default`.
- There is no recipient, reviewer, notification or expiry field. "An open task has no step timeout or automatic expiration"; `timeout_sec`, `retry_policy`, `mail_on_error` and a step `worker_selector` are invalid on it.

**Versions.** `human.task` arrived in v2.11.0, `push_back` in v2.17.2, MCP `dagu_execute` approve/push_back/reject in v2.22.0. All are in v2.24.0. The latest release is v2.26.0 (2026-11-07); the only human-task change found since the pin is #3619 (push-back feedback kept out of first-run prompts). The comparison's file list is cut at 300, so other changes are not excluded.

**Actor.** Dagu stores the authenticated user (`humanTaskCompletedBy`, `approvedBy`, `rejectedBy`, `triggerActor`), not a free field. With the framework's technical Basic credential (D19, D40) every answer is recorded as that one user. The local CLI records the operating-system user.

**License.** Human tasks, approvals, `handler_on.wait` and notification rules ran without a license. The license checker gates only `audit`, `rbac` and `sso`.

**Limits stated upstream.**

- `human.task` works only in a root workflow. It fails in child runs (`dag.run`, `dag.enqueue`, `parallel`) and is invalid in `foreach.steps` and `handler_on`.
- `approval` gates work in sub-workflows, but the workflow cannot set `worker_selector`.
- Resuming always goes through the queue and needs the scheduler running.
- A run uses the copy of the workflow saved when it started.
- Push-back feedback is capped at 16 KiB.

**Retention.** From source only: cleanup removes finished runs and Waiting counts as active. Not run.

## Not verified

- The Cockpit "Review" column in 2.24.0 (the web interface was not opened) and access control per workspace for answering.
- The whole path through Caddy and the panel, and returning an answer to an OpenMausBot conversation.
- The successful push-back path, `mail_on.wait` (present in source, absent from the JSON schema of `mail_on`), and history cleanup against a waiting run.
- Whether a form's `enum` can be filled from run parameters.
- In which release `approval` appeared.

## Gaps that need glue

1. **Recipient:** none natively. Run labels (`assignee=…`) are filterable but not enforced.
2. **Who answered:** always the technical user under the shared credential. The caller must send the person's name as a form value.
3. **Cancel and expiry:** no native way in 2.24.0. A `cancel` choice in the form and an external sweep of old runs.
4. **Inbox:** the list returns runs, not tasks. Each run's detail must be read for the prompt and form.
5. **Notification with content:** the native webhook rule carries no prompt and is not versioned. A `handler_on.wait` script can compose the message and lives in the YAML.
6. **Audit trail:** paid. The available record is each run's state.

## Dedicated products surveyed

Facts read from each project's repository and documentation on 2026-11-13. None was installed.

| Product | License | State | Self-hosting needs | Fit |
|---|---|---|---|---|
| HITLy (`hitly-net/hitly`) | Apache-2.0; SSO and billing in a private overlay | Alpha, one person, 0 stars, no releases, active (commit on 2026-11-13) | PostgreSQL 16, Node; no published image | Best API fit: typed questions (text, single, multi, number), self-hostable MCP, `Idempotency-Key`, cancel, deadline. Recipient per project or by manual delegation |
| Gatewerk (`gatewerk/gatewerk`) | Server AGPL-3.0, SDK and MCP Apache-2.0, proprietary `ee/` | One person, 11 commits, none since 2026-08-15, no outside contributions | PostgreSQL 16, API, web | Best human side: `assignee`, chains, Slack and email, reviewer recorded. No idempotency or cancel in its spec |
| awaithumans | Apache-2.0; verifier add-on paid | 27 stars, one author, v0.1.8, no commits since 2026-07-15 | SQLite or PostgreSQL | Typed answer, timeout, routing by role, Slack and email. Only the SDK is documented |
| AgentGate (`agentkitai/agentgate`) | MIT | 33 stars, one author, v0.15.0, no commits since 2026-08-01 | SQLite by default | REST, signed webhooks, MCP. Approve or deny only |
| withHuman (`withHumanAI/withHuman`) | Apache-2.0 | 19 stars, active, v1.0.66 | One image or binary | Approve or deny only. Audit log, SSO and MCP gateway are hosted-only |
| Preloop | Apache-2.0; quorum, RBAC and SSO commercial | 96 stars, very active, v1.0.2 | Compose or Helm | A full control plane (MCP firewall, model gateway); `ask_user` accepts choices or text. Too large for this |
| Squidbrake | Apache-2.0, but more than one person and Slack or email need a license | Six weeks old | SQLite | Rejected |
| Placet | Not confirmable | Repository returns 404, site unreachable | — | Rejected |
| gotoHuman | Hosted service; only its MCP server is MIT | — | — | Rejected: not self-hostable |
| HumanLayer | Apache-2.0 | 12.9k stars, active | — | Rejected: now a coding-agent orchestrator; no approvals API in its README |

None documents login through a reverse-proxy header, so each would add a second login beside the shared web session.

**Other engines and standards.**

- Kestra (Apache-2.0): pause task with inputs, resume API and timeout behavior. Valid, but a second workflow engine.
- Windmill: resume URLs and recorded approvers; forms and group restriction only in its paid editions.
- n8n: approve or deny by chat or email, a wait node with a resume URL. License not checked here.
- LangGraph Agent Inbox: repository archived. `interrupt()` is a primitive that needs a checkpointer and an interface of its own.
- MCP elicitation (spec 2025-06-18): a server asks the user of the connected client, with a flat schema. It does not reach a third person or a later time.
- A2A 1.0.0: `input-required` is a paused task state resumed with the same task ID. No inbox or assignment.
- No open standard for a "human task" for agents was found. Temporal signals, Inngest `waitForEvent`, Trigger.dev waitpoints and open-source helpdesks were not investigated.

## Other ways inside the existing stack

Read from the source of the pinned OpenMausBot package (0.1.141) and from this repository. Nothing here was run.

| Approach | Reuses | Limit |
|---|---|---|
| OpenMausBot's native question card and "Needs you" list (`/api/needs-you`) | The card survives the end of the turn; answering it continues the same conversation | One shared OpenMausBot session (D25), so no recipient. Pending items show for 7 days; unanswered approvals are denied by timeout. Bots only, not desktop or CLI agents. Not an API another program can answer |
| A question as a wiki page (the D75 pattern) | Dagu's wiki operation, SilverBullet as the list, snapshot to git | Not programmatic: no states, no typed answer, no contract |
| Recorded reversible assumptions in the wiki | Same, plus a rule in `agent-context.md` | No callback; unfit for irreversible decisions. Useful as the default for reversible ones |
| Messaging (OpenMausBot email tools, Composio connectors) | Existing connectors | The only option with real individual identity. No visible pending state; an inbound webhook exposes a port. OpenMausBot 0.1.141 has no Telegram |
| A mailbox bot per person in `team.yaml` | `fyso_bot_run` | A model in the middle; untested |
| GitHub issues through `gh` | Real identity | Excludes non-technical people and moves data off the host |

## Conclusion

Dagu's native `human.task` in the pinned version is a working programmatic primitive: create, list, read, answer, idempotent retry and survival across a restart all passed over REST without a license. The dedicated products are all alpha or one-person projects that add PostgreSQL and a second login and do not solve identity under a shared login either. HITLy is the fallback if the experience for non-technical people proves unacceptable.

## Sources

- <https://docs.dagu.sh/writing-workflows/human-in-the-loop>
- <https://github.com/dagucloud/dagu/blob/v2.24.0/specs/031-human-task.md>
- <https://github.com/dagucloud/dagu/blob/v2.24.0/api/v1/api.yaml>
- <https://github.com/dagucloud/dagu/blob/v2.24.0/internal/service/frontend/api/v1/humantasks.go>
- <https://github.com/dagucloud/dagu/blob/v2.24.0/internal/service/frontend/api/v1/manual_steps.go>
- <https://github.com/dagucloud/dagu/blob/v2.24.0/internal/license/checker.go>
- <https://github.com/dagucloud/dagu/releases>
- <https://hitly.net/docs>, <https://hitly.net/docs/self-host>, <https://github.com/hitly-net/hitly>
- <https://github.com/gatewerk/gatewerk>
- <https://github.com/awaithumans/awaithumans-human-in-the-loop-ai-agents>
- <https://github.com/agentkitai/agentgate>
- <https://github.com/withHumanAI/withHuman>, <https://agentapprovalprotocol.io>
- <https://docs.preloop.ai/>
- <https://github.com/batrapulkit/squidbrake>
- <https://github.com/placet-io/placet> (404), <https://docs.placet.io>
- <https://docs.gotohuman.com/>, <https://www.gotohuman.com/pricing>
- <https://github.com/humanlayer/humanlayer>
- <https://kestra.io/docs/workflow-components/tasks/flowable-tasks>
- <https://www.windmill.dev/docs/flows/flow_approval>
- <https://docs.n8n.io/advanced-ai/human-in-the-loop-tools/>
- <https://docs.langchain.com/oss/python/langgraph/interrupts>
- <https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation>
- <https://a2a-protocol.org/latest/specification/>
