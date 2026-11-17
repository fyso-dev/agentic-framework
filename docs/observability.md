# Bot observability contract — Phase 5.5

D26, extended by D84 (AI usage view and subscription percentage) and D88 (list-price table and subscription threshold). A read-only panel summary over existing OMB and Dagu records. No custom server,
external telemetry service, or copy of conversation bodies is introduced.

## Sources and persistence

- OMB 0.1.140: native monthly `usage/*.jsonl` records and `/api/usage/traces`.
  The ledger is authoritative for settled OMB turns, not trace-root aggregate costs.
- Dagu 2.24.0: native `/api/v1/dag-runs` for recent run state and artifacts for
  structured Claude/Codex harness usage. One artifact attempt is counted once.
- `fyso-observability` runs every two minutes and on startup/manual refresh. It
  exports `.data/panel/observability.json` atomically. The file is ignored by git;
  it contains no message bodies, prompts, user emails, credentials or raw logs.
- OMB 0.1.141 `GET /api/plan-usage` (admin route, loopback, no `refresh=1`): the
  subscription windows OMB itself reads for its engines (D84). The exporter keeps
  `{instanceId, engine, plan, window, usedPercent, resetsAt, checkedAt}` for the
  `fiveHour` and `weekly` windows only; no account, token, error text or per-model
  lines. A check younger than five minutes is reused instead of asking again.
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
is a subset of input, not added to the total again; reasoning is a subset of output.
Subscription fees and quotas are not inferred from tokens. Native billing markup is
not provider spend.

## Subscription percentage (D84)

The percentage of a subscription window is shown only as the provider reports it
through OMB; it is never computed from tokens or USD. It belongs to the engine
account, not the project: it includes the person's use from other projects, other
machines and the provider's own apps, and is not attributed to agents. A window the
plan does not have, a failed check (sign-in, network) or an out-of-range value is
`null` and shown as *unknown*, which is a normal state. Provider endpoints behind
OMB are undocumented and may change; the framework never reads credentials itself.
The subscription equivalent USD stays labelled as an estimate at list price and is
never presented as a share of a quota.

## List-price table (D88)

Some engines report tokens but no amount (Codex). For those turns the exporter
estimates a list-price equivalent from `framework/pricing.json`: USD per million
tokens for `input`, `cachedInput` and `output` per model ID, with `checkedAt` and
the official `sources`. An optional `project/pricing.json` with the same shape
overrides or adds models; invalid entries are ignored with an `invalidPricing`
warning. A turn is priced only when it has input and output tokens, no reported
amount and an exact (case-insensitive) model match:
`(input − cachedInput) × input + cachedInput × cachedInput + output × output`,
divided by one million. Reasoning is part of output. The result is
`costSource: estimated` in the turn's usual bucket, so a subscription engine shows it
as *subscription · estimated equivalent*: never a bill, never a share of a quota.
Unknown models stay unknown. Only the standard tier is applied: long-context,
batch, fast and regional surcharges are not, so long prompts may be underestimated.
The export includes `pricing: {checkedAt, sources, project, priced}`; the panel names
the date and source under the cost chart. Re-check the official page before
changing a price and update `checkedAt`.

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

The *AI usage* screen (D84) shows the UTC month, collection time/staleness, source
availability, the subscription windows per engine account, a daily stacked bar chart
(tokens: new input, cached input, output; or cost by USD category), totals including
reasoning tokens, per agent/model/engine consumption, conversations/delegations with
native trace details, alerts and coverage warnings. Filters by period (month, last
7 days of the month, today), agent, model and engine apply to the chart, totals and
table; conversations follow agent and period. The exporter's `daily` rows (one per
UTC day, agent, model and engine) carry the same accounting fields as `usage.groups`.
Recent Dagu runs are still collected for alerts and harness usage but are no longer
listed here; the run log lives in Automations. Refresh is a Dagu action.

Project settings define `monthlyApiUsd`, `longRunSeconds`, `maxRecentFailures` and
`subscriptionPercent` (D88). Null disables a threshold; `subscriptionPercent` is null
by default and, when set, warns for each subscription window of an engine account at
or above that percentage (it is the account's usage, not the project's). Alerts are advisory and visible locally; no messages
are sent, no bot is paused and no budget enforcement is implied. Monetary alerts
use known reported API cost only, and explicitly flag incomplete coverage.

## Verification

Pure fixture tests cover zero vs missing, estimates/subscriptions, retries,
deduplication, cache normalization, malformed data and secret-free exports.
A disposable stack verifies native APIs, structured harness execution and linkage,
manual refresh, unavailable/empty states, persistence after restart, read-only
Caddy access, localization and browser rendering. Record real vs fixture evidence
separately. Validate through `mise run doctor` before calling the phase done.
