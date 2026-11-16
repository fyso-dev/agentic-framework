# Bot observability contract — Phase 5.5

D26. A read-only panel summary over existing OMB and Dagu records. No custom server,
external telemetry service, or copy of conversation bodies is introduced.

## Sources and persistence

- OMB 0.1.140: native monthly `usage/*.jsonl` records and `/api/usage/traces`.
  The ledger is authoritative for settled OMB turns, not trace-root aggregate costs.
- Dagu 2.24.0: native `/api/v1/dag-runs` for recent run state and artifacts for
  structured harness usage: `usage/<step>.jsonl` from any workflow, or Claude/Codex
  `agent.txt` output. One artifact attempt (or usage line) is counted once.
- `fyso-observability` runs every two minutes and on startup/manual refresh. It
  exports `.data/panel/observability.json` atomically. The file is ignored by git;
  it contains no message bodies, prompts, user emails, credentials or raw logs.
- `project/observability.json` holds versioned advisory thresholds and explicit
  billing-kind mappings by native instance ID for custom engines. Existing project files are preserved
  by Copier. Built-in Claude/Codex subscription engines and Claude API are known;
  unknown engines remain unclassified unless explicitly mapped.
- Runtime history survives process restarts in project data directories. It is
  not part of the memory snapshot. Deleting `.data` deletes observability history;
  backup/retention policy belongs to deployment, not git snapshots.

## Workflow usage artifacts

Any Dagu workflow step that calls a model may report what it consumed, so the
panel counts it under the workflow's name. The step appends to
`usage/<step>.jsonl` inside its run's artifacts directory
(`${context.paths.artifacts_dir}/usage/<step>.jsonl`, the directory the attempt's
`.meta` file describes). One JSON object per line, one line per model call:

```json
{"v":1,"step":"<step id>","provider":"claude|codex|opencode|<other>","model":"<model id or null>","input":<int|null>,"output":<int|null>,"cachedInput":<int|null>,"costUsd":<number|null>}
```

- `v` is `1`; `step` and `provider` are non-empty strings.
- `input` is total input tokens **including** cached reads (and, for Claude,
  cache writes), the same convention as harness parsing. `cachedInput` is the
  subset of `input` read from cache. `output` is output tokens.
- `costUsd` is the amount the engine reported for that call. Unknown values are
  `null` (or omitted), never guessed or zero-filled.
- `model` falls back to `provider` in the panel when null.
- The billing kind comes from `provider` through the built-in engine kinds and
  `billingKinds` in `project/observability.json` (`claude`/`codex` are
  subscription engines; `opencode` and any other provider stay unclassified
  unless mapped there).
- Only these fields are read. Never write prompts, responses or transcripts to
  these files.

The collector scans the attempts of every workflow started in the current UTC
month. A line that is not valid JSON or breaks the rules above is skipped and
reported as the `invalidUsageRows` warning. Records use the source `harness`, the
run ID, and the identity `harness:<dag>/<run>/<attempt>/<file>:<line>`; the
group name is the workflow name (`Builder` for `fyso-dev-task`, see below).
Only regular `*.jsonl` files directly inside `usage/` are read; the directory
is derived from the `.meta` file location, never from its `dir` field.

When an attempt has no `usage/*.jsonl` file, the collector falls back to the
`agent.txt` artifact written by `harness.run` (Claude JSON or Codex JSONL), for
any workflow whose `agent.txt` contains those structured events. For
`fyso-dev-task` this keeps the original behaviour: its usage is grouped under
`Builder`, and dev-task runs without any usage stay explicitly uncovered. If an
attempt has both, `usage/` wins, so a call is never counted twice.

The recent-runs list is bounded (`/api/v1/dag-runs?limit=100`, dominated by the
two-minute `fyso-observability` schedule). Runs that have usage this month but
fall outside that list are fetched individually, newest first, up to 50 per
collection; beyond that the list is marked as capped. Monthly totals do not
depend on the run list.

## Cost semantics

Show API-reported USD (not an invoice), subscription equivalent USD, estimated API
USD, and unclassified USD separately. Missing amounts and token data stay null,
with coverage counts. Zero is displayed only when actually reported. Cached input
is a subset of input, not added to the total again. Subscription fees and quotas
are not inferred from tokens. Native billing markup is not provider spend.

OMB rows are keyed by its native ledger identity; trace roots are navigation and
execution context only, never another cost source. Harness attempts have separate
`dag/run/attempt` identities. Retries consume tokens independently and are retained.
Successful and failed attempts with no structured usage are explicitly uncovered.
Corrupt or unavailable inputs make coverage partial rather than silently complete.

## Correlation

`fyso-dev-task` accepts optional `SOURCE_THREAD` and `SOURCE_TURN` parameters. The
Builder passes native context identifiers only when it actually knows them. An explicit `ORIGIN` Dagu output preserves the relationship after restart.
Parameter strings and prompt text are never parsed for identifiers. Never match by prompt text or
time proximity. Without an identifier, show an unlinked run. Delegations inside
OMB use OMB's own trace tree. A conversation and its harness run keep separate
usage records so their actual distinct consumption is not collapsed or duplicated.

## Panel and alerts

The Observability screen shows the UTC month, collection time/staleness, source
availability, per-bot/model consumption, conversations/delegations with native
trace details, recent runs with status/duration/retries, and coverage warnings.
Filters by bot and model apply to consumption/conversations; run correlation is
explicit. Links open native OMB/Dagu details. Refresh is a Dagu action.

Project settings define `monthlyApiUsd`, `longRunSeconds`, `maxRecentFailures`.
Null disables a threshold. Alerts are advisory and visible locally; no messages
are sent, no bot is paused and no budget enforcement is implied. Monetary alerts
use known reported API cost only, and explicitly flag incomplete coverage.

## Verification

Pure fixture tests cover zero vs missing, estimates/subscriptions, retries,
deduplication, cache normalization, malformed data and secret-free exports.
A disposable stack verifies native APIs, structured harness execution and linkage,
manual refresh, unavailable/empty states, persistence after restart, read-only
Caddy access, localization and browser rendering. Record real vs fixture evidence
separately. Validate through `mise run doctor` before calling the phase done.
