# Dagu human-task queue failure recovery

On 2026-11-14 UTC, Dagu 2.24.0 ran a disposable workflow with one human task and one dependent `outputs.write` step. All services, ports and data were isolated from the user fixture. The fault was injected after the task entered `waiting` by replacing the fixture's queue directory with a regular file. The workflow used only fictional input.

| Operation | Observed result |
| --- | --- |
| Complete with `alpha` while queue is unavailable | HTTP 503, `human_task_resume_failed`, `completionStored: true`, `resumePending: true` |
| Read run | Run `waiting`, `humanTaskResumePending: true`, task `succeeded`, dependent step `not_started` |
| Repeat `alpha` before repair | HTTP 503, completion remains stored |
| Submit different input `beta` | HTTP 409 conflict |
| Restore queue and POST `human-tasks/resume` | HTTP 200, `queued: true`; run reaches `succeeded` |
| Read outputs | `answer: alpha` |
| Repeat `alpha` after success | HTTP 200, `alreadyCompleted: true`, `queued: false` |
| Submit `beta` after success | HTTP 409 conflict |

The response was retained and the same completion did not enqueue a duplicate in this experiment. This does not prove exactly-once behavior for arbitrary downstream side effects. A generic HTTP 503 from an intermediary does not establish that Dagu saved anything: inspect the response code and details and then the run state. The official [Dagu API reference](https://docs.dagu.sh/web-ui/api) documents the resume endpoint and the specific error shape.

Reproduce with a fresh isolated Dagu data directory and ports: start a workflow with `human.task` followed by an output step; wait for the task; make only the disposable queue path unavailable; complete with a fictional value; inspect the response and run; retry identical and different values; restore the path; invoke the human-task resume endpoint and inspect the output and repeat requests. Terminate the disposable instance afterward.

## Browser recovery

A second isolated Dagu 2.24.0 fixture ran a human-request workflow with `ask`, `record`, and `deliver` steps. A real completion was submitted with fictional values while its queue directory was deliberately unavailable, producing Dagu's 503 with saved completion and pending resume. Chromium used a disposable profile and loaded the modified extension page through a local HTTP bridge to that Dagu instance; the bridge had no authentication and was bound to loopback. The user-facing fixture was not involved.

The page displayed the stored-answer recovery action. After the fixture queue was restored, clicking **Retry resuming** posted to Dagu's native resume endpoint and received HTTP 200. The run reached `succeeded`, all three steps succeeded, and its outputs retained the fictional answer and responder. No browser `pageerror` events were observed. This test used the isolated worktree workflow and a local bridge; it does not validate the user-facing gateway or arbitrary downstream effects. The disposable Dagu was stopped afterward.

The original fictional screenshot is not included in this documentation draft.

## Reproducible fixture

`tests/human-requests-503-e2e.sh` exercises the current extension workflow and panel with Dagu and Chromium on loopback using a disposable bridge without authentication. It requires explicit `FYSO_TEST_DAGU_PORT`, `FYSO_TEST_CHROME` and `FYSO_TEST_PANEL_ASSETS`, and may require `FYSO_TEST_DAGU` and `NODE_PATH`. It checks the five-port block and verifies that the listener belongs to its own process group before sending requests. A separate occupied-port canary confirmed it exits before connecting to that listener. The fixture does not establish containment for detached descendants or the normal project lifecycle.
