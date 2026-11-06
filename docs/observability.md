# Bot observability contract — Phase 5.5

D26. A read-only panel summary over existing OMB and Dagu records. No custom server,
external telemetry service, or copy of conversation bodies is introduced.

## Sources and persistence

- OMB 0.1.140: native monthly `usage/*.jsonl` records and `/api/usage/traces`.
  The ledger is authoritative for settled OMB turns, not trace-root aggregate costs.
- Dagu 2.24.0: native `/api/v1/dag-runs` for recent run state and artifacts for
  structured Claude/Codex harness usage. One artifact attempt is counted once.
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
