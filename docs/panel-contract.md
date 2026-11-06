# Panel ↔ framework contract (Phase 4)

The panel is a static SPA. It has **no backend of its own** (PLAN §9, D13). It reads files that Caddy serves read-only, and it acts by starting Dagu workflows and reading their outputs. This file is the contract between the SPA (`framework/panel/`) and the plumbing (`framework/workflows/`, `framework/scripts/`, `Caddyfile`).

All URLs are relative to the panel origin `http://panel.localhost:<port>`. The browser is already authenticated with basic auth (D11), and Caddy forwards the same `Authorization` header to Dagu (D19).

## 1. Read-only files

| URL | Source | Content |
|---|---|---|
| `GET /config/project.json` | written by `up.sh` into `.data/panel/` | `{ "name": "Foo project", "slug": "foo-project", "env": "local" \| "server", "urls": { "dagu": "...", "omb": "..." } }` |
| `GET /config/team.yaml` | `project/bots/team.yaml` | The OMB team file, as text |
| `GET /config/apps.json` | written by `up.sh` from built-ins + `project/apps/*/app.yaml` | `App[]`, see below |

```ts
type App = {
  id: string
  name: string                       // already resolved for the default locale
  name_i18n?: Record<string, string> // optional per-locale names, e.g. { en: "...", es: "..." }
  description: string
  description_i18n?: Record<string, string>
  icon: string                       // generic name: "workflow" | "bot" | "users" | …
  url: string
  group: "framework" | "project"
  enabled: boolean
  accessNote?: string
  accessNote_i18n?: Record<string, string>
}
```

**App health.** The panel probes each app with `fetch(app.url, { mode: "no-cors" })` and shows **ok** if the request resolves, **down** if it rejects, **unknown** until the first probe ends. "Degraded" is not used for now.

### Native live bot roster (D28)

`GET /api/omb/bots` forwards exactly `/api/bots?messages=0` to the project OMB with the server-held session and project basic login. Writes return 405; other `/api/omb/*` paths return 404. This is the native authenticated response, which can include profile and queued-message metadata; no general OMB administration proxy is exposed. The SPA displays only ID, name, title and model. It polls every five seconds without overlapping requests, includes the chief, and marks failed refreshes explicitly. Runtime discovery never rewrites the local draft or `project/bots/team.yaml`. One list joins native IDs with uniquely named configuration entries; unchanged entries use current native display metadata, while pending drafts remain visible. Every bot row offers the OMB gateway link. Configured bots additionally offer an explicit manual edit action, and eligible native-only bots offer import. Actions are sibling controls rather than nested links. Ambiguous names never select an arbitrary form; native edits are versioned through existing snapshots, while Bot Architect writes its selected project entry.

## 2. Dagu API (through `/api/dagu/`)

Caddy proxies `/api/dagu/*` on the panel origin to Dagu (`/api/v1/*`), so there is no CORS. The panel only uses:

| Call | Use |
|---|---|
| `POST /api/dagu/dags/{name}/enqueue` with body `{ "params": "<JSON object as string>" }` | Start an action. Returns `{ "dagRunId": "…" }`. **Always `enqueue`, never `start`**: `start` fails while another run is active (Phase 3 finding) |
| `GET /api/dagu/dag-runs/{name}/{dagRunId}` | Poll the status: `.dagRunDetails.statusLabel` |
| `GET /api/dagu/dag-runs/{name}/{dagRunId}/outputs` | Results: `.outputs.<key>` (keys are lowercase) |
| `GET /api/dagu/dags/{name}/dag-runs?limit=1` | Last run of an action (e.g. the last snapshot) |

Status mapping (the action component's 5 states, panel-spec.md):

| Visual | `statusLabel` |
|---|---|
| in progress | `running`, `queued`, `waiting` |
| ok | `succeeded`, `partially_succeeded` |
| failed | `failed`, `aborted`, `rejected` |
| never | no run |

"See logs in Dagu" links to `<urls.dagu>/dags/{name}`.

## 3. Action workflows

Each one lives in `framework/workflows/<name>.yaml` and is exposed as `project/workflows/fyso-<name>.yaml` (symlink, see PLAN Phase 3). Its outputs are JSON strings, which the panel parses with `JSON.parse`.

### `fyso-setup-check` — checklist data (no params)

Output `check`:

```ts
{
  checkedAt: string                  // ISO time
  engines: Array<{                   // only engines used by the project's bots, plus claude/claudeApi/codex when ready
    id: string                       // OMB engine instance: "claude" | "claudeApi" | "codex" | …
    label: string                    // "Claude"
    kind: "subscription" | "api"
    ok: boolean                      // signed in / key configured
    models: string[]                 // model ids offered by that engine
    fixHint?: string                 // command to fix, e.g. "claude /login"
  }>
  bots: {
    count: number                    // bots in project/bots/team.yaml (excluding MausBot)
    pending: number                  // changes `team apply --dry-run` would make (created + changed + deleted)
    ok: boolean                      // pending === 0
  }
  dagu: {
    ok: boolean                      // the Dagu MCP answers for the bots
    botsConnected: number            // bots whose cwd has .mcp.json with the dagu server
  }
}
```

The fourth checklist step (last save to git) does not come from here: the panel reads the last `fyso-snapshot` run.

### `fyso-bots-plan` — preview (param `TEAM_B64`)

- `TEAM_B64`: base64 (UTF-8) of the proposed `team.yaml`. Empty means the current file.
- Nothing is written.

Output `plan` is the `openmausbot team apply --dry-run --json` result as-is:

```ts
{ plan: string[], created: number, changed: number, unchanged: number, deleted: number, warnings?: unknown[] }
```

The plan lines are OMB's English prose (spike `omb`). The panel shows them verbatim inside the preview and does not translate them.

### `fyso-bots-apply` — apply (param `TEAM_B64`)

Steps, in this order (D13 rule 4):
1. Snapshot: export bots and memory and commit them, so tuning done in OMB is kept.
2. Write `TEAM_B64` to `project/bots/team.yaml`, after validating it with `--dry-run`. If validation fails, nothing is written.
3. `openmausbot team apply`.
4. Commit `project/bots/team.yaml` with the message `bots: update from panel`.

Output `apply`: `{ created, changed, deleted, commit: string }`. On failure the run fails, and the panel shows the action's failed state with the link to the logs.

### `fyso-ext-catalog` and `fyso-ext-install` — marketplace (D31)

Read the extension catalogs (output `catalog`) and install or upgrade one extension (params `ID`, `MODE`; output `result`). Shapes and behavior: [extensions-contract.md §8](extensions-contract.md#8-marketplace-d31).

### `fyso-snapshot` — save now (exists)

Started with `enqueue` and no params. Output `result`: `"no changes"` or `"committed <sha>"`.

## 4. Editing `team.yaml` in the browser

The panel parses and writes `team.yaml` with the `yaml` package's `Document` API, which **keeps comments and order**. It changes only the fields of the form:
- `name`
- `title` (role)
- `model` (`<engine>/<model>`)
- `soul` (base instructions), written inline only if the person edited it; a `{ file: … }` soul stays a file reference otherwise
- `tools`

Skills are out of scope for v1: they are listed read-only. "Uses workflows" maps to the bot `cwd` being the project root, `${FYSO_ROOT}`.

## 5. i18n

UI strings: `framework/panel/src/locales/{es,en}.json` (D12). Server data (plan lines, Dagu errors) is shown as received.

## 4. Observability (Phase 5.5, D26)

`GET /config/observability.json` serves the private, rebuildable summary emitted
by `fyso-observability`; POST/PUT/DELETE are rejected. Native record sources,
UTC-month scope, cost semantics and source availability are specified in
[observability.md](observability.md). The TypeScript wire shape lives in
`framework/panel/src/api/observability.ts`.

The screen uses the existing Dagu enqueue/poll flow to refresh the exporter and
polls the summary every 15 seconds. A summary older than five minutes is stale.
A 404 is an actionable no-summary state, not zero consumption. Failed source
reads are explicit; collection does not overwrite previous data on fatal errors.
Bot/model selectors filter usage, and bot selects conversation roots containing
that bot. Conversation aggregates retain the entire delegation tree; filtering
does not allocate shared work by guesswork. Run/alert lists remain project-wide.

Optional native identifiers `SOURCE_THREAD`/`SOURCE_TURN` on `fyso-dev-task` are
captured as the run's `ORIGIN` JSON output, independently of agent success.
`harness.run` publishes Claude JSON or Codex JSONL as `agent.txt`; the exporter
reads only whitelisted usage numbers and never serves that raw artifact. Legacy
artifacts without structured data retain unknown consumption.

## Bot versioning metadata and import

`GET /config/bot-versioning.json` is an exact read-only Caddy file route. It contains `{collectedAt, commit, bots:[{name,team,project,snapshot}]}`, derived from committed `project/bots/team.yaml` and `state/bots/team.yaml`; no instructions, chat or secret values are exported. The panel polls every five seconds. The file refreshes at startup, snapshot commit, native import and observability collection (two-minute schedule); the commit and collection time identify its evidence. Missing evidence or ambiguous identities produce an unverified label and disable import.

Import uses the existing `fyso-bot-architect` Dagu enqueue/poll/output contract with `{OP:"import",BOT_ID:"<native ID>"}` and returns `{action,botId,name,commit,replayed}`. The panel reloads configuration after success, without resetting a draft. Drafts disable this action until applied or discarded.
