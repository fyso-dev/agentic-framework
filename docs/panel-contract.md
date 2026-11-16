# Panel ↔ framework contract (Phase 4)

The panel is a static SPA. It has **no backend of its own** (PLAN §9, D13). It reads files that Caddy serves read-only, and it acts by starting Dagu workflows and reading their outputs. This file is the contract between the SPA (`framework/panel/`) and the plumbing (`framework/workflows/`, `framework/scripts/`, `Caddyfile`).

All URLs are relative to `http://panel.<slug>-<port>.localhost:<port>`. Caddy authorizes the native shared web session (D40) and injects Dagu’s separate technical credential server-side. Browsers never send that credential. See [web authentication](web-auth.md) for access permissions and native identity limits.

`GET /api/session` exposes the native authority’s current public identity (`auth.authenticated`, `username`, `name`, `providerId`). `POST /api/session/logout` revokes the native session. Other logout methods return 405. API authentication failures return 401/403; a panel 401 reloads the page through the gateway login flow. Identity checks run on focus and every 30 seconds; a changed provider/user reloads all panel state. No credential, cookie value or upstream token is returned in project configuration.

## 1. Read-only files

| URL | Source | Content |
|---|---|---|
| `GET /config/project.json` | written by `up.sh` into `.data/panel/` | `{ "name": "Foo project", "slug": "foo-project", "env": "local" \| "server", "urls": { "dagu": "...", "omb": "..." }, "framework": { "commit": "58f57cf", "src": "https://…" } }` (`framework` from `.copier-answers.yml`) |
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

`GET /api/omb/bots` forwards exactly `/api/bots?messages=0` to the project OMB with the server-held session and project basic login. Writes return 405; other `/api/omb/*` paths return 404. This is the native authenticated response, which can include profile and queued-message metadata; no general OMB administration proxy is exposed. The SPA reads the roster, team declaration and version inventory together every five seconds and on window focus. It retains the last successful reads and marks refresh errors. A project bot without matching form data shows a synchronization status. Live bot links use the native ID, including when a bot changes position in the declaration. The list and detail show the native avatar from the authenticated OMB origin when it is a stored raster attachment. When the bot has no image or uses mascot mode, the panel draws the native standard silhouette and color as a static avatar. The source geometry is from OpenMausBot 0.1.141 under Apache-2.0. Bots with no native profile data show initials. A draft retains its original declaration and cannot be applied after that declaration changes. One list joins native IDs with uniquely named configuration entries; unchanged entries use current native display metadata, while pending drafts remain visible. Every bot row offers the OMB gateway link. Configured bots additionally offer an explicit manual edit action, and eligible native-only bots offer import. Actions are sibling controls rather than nested links. Ambiguous names never select an arbitrary form; native edits are versioned through existing snapshots, while Bot Architect writes its selected project entry.

## 2. Dagu API (through `/api/dagu/`)

Caddy proxies `/api/dagu/*` on the panel origin to Dagu (`/api/v1/*`), so there is no CORS. The panel only uses:

| Call | Use |
|---|---|
| `POST /api/dagu/dags/{name}/start` or `…/enqueue` with body `{ "params": "<JSON object as string>" }` | Start an action. Returns `{ "dagRunId": "…" }`. A workflow that declares `max_active_runs` other than 1 is **started** at once; every other one is **enqueued** (D80). `start` does not enforce `max_active_runs` in Dagu 2.24.0, so a workflow that must not overlap keeps `max_active_runs: 1` and waits in Dagu's queue (up to 3 s). `GET /api/dagu/dags/{name}` gives `dag.maxActiveRuns`; the panel reads it once per workflow and page load |
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

### `fyso-bots-plan` — preview (params `TEAM_B64`, `TEAM_BASE_B64`)

- `TEAM_B64`: base64 (UTF-8) of the proposed `team.yaml`. Empty means the current file.
- `TEAM_BASE_B64`: optional base64 of the declaration the panel draft was edited against. A different current declaration rejects the draft.
- Nothing is written.

Output `plan` combines the native dry run with removals of bots omitted from the
proposed project declaration. Native team apply keeps omitted bots by default.
For each removed declaration, the panel resolves a unique exact name to a native
ID, or reports that the bot is already absent. Protected and active bots are
rejected. A rename uses the native `was` field and preserves the bot ID.

```ts
{ plan: string[], created: number, changed: number, unchanged: number, deleted: number, warnings?: unknown[], removalRevision?: string }
```

The panel shows native plan lines verbatim and adds lines for explicit removals.
The revision binds those removals to the reviewed declaration, draft and runtime IDs.

### `fyso-bots-apply` — apply (params `TEAM_B64`, `TEAM_BASE_B64`, `REMOVAL_REVISION`)

1. Snapshot bots and memory before applying.
2. Validate the proposed team and recompute the removal revision. Require the revision from the preview if any declaration is being removed.
3. Apply the native team changes. Recheck each reviewed removal and delete by exact runtime ID. Verify that the ID disappeared.
4. Write and commit `project/bots/team.yaml` with the message `bots: update from panel`. Drop consumed rename aliases.

Native deletion removes the bot's conversation history. The snapshot covers configuration
and memory. If an apply stops partway through, open a fresh preview. A bot already
absent can still be removed from the declaration after review.

Output `apply`: `{ created, changed, deleted, commit: string }`. On failure the run fails, and the panel shows the action's failed state with the link to the logs.

### `fyso-ext-catalog`, `fyso-ext-install` and `fyso-ext-remove` — marketplace (D31, D83)

Read the extension catalogs (output `catalog`), install or upgrade one extension (params `ID`, `MODE`; output `result`) and uninstall one after an in-page confirmation (param `ID`; output `result`). Shapes and behavior: [extensions-contract.md §8](extensions-contract.md#8-marketplace-d31).

### `fyso-snapshot` — save now (exists)

Started with `enqueue` and no params. Output `result`: `"no changes"` or `"committed <sha>"`.

### `fyso-update` — framework update

Params `REF` (template tag, branch or commit; empty: Copier's latest tag) and `SRC` (another Copier source for this run only). Output `result`: `{ "from": "58f57cf", "to": "73b74c2", "commit": "1dcf4be" | null, "changed": true | false }`. The Framework card (Apps → Extensions) shows `project.framework.src` and `.commit`, a `REF` field (default `main`), `SRC` under an "alternative source" disclosure, and the result line; it reloads the config after a run. Conflicts and edited framework files fail the run before anything is applied (`framework/scripts/update.sh`).

Saved local sources and the optional `SRC` override resolve against the project directory before entering the temporary worktree. The original `_src_path` spelling is restored through YAML before committing, including paths with spaces and YAML punctuation.

No-change runs still install tools, regenerate configuration and reload the running stack. Retrying after an activation failure recovers these steps even when the template commit was already fast-forwarded; the result remains `changed: false` with `commit: null` when no additional commit is needed.

## 4. Editing `team.yaml` in the browser

The panel parses and writes `team.yaml` with the `yaml` package's `Document` API, which **keeps comments and order**. It changes only the fields of the form:
- `name`
- `title` (role)
- `model` (`<engine>/<model>`)
- `soul` (base instructions), written inline only if the person edited it; a `{ file: … }` soul stays a file reference otherwise
- `tools`
- `team` (OMB department, D81): chosen from the file's `teams:`, the departments bots and rooms already name and those the runtime reports, or typed; empty removes the key. OMB keeps a bot in its team when `team:` is removed, so the form says so.

The Bots list groups bots by team: bots without a team first, under OMB's "General", then the file's `teams:` order and any other team the runtime reports. A department declared in `teams:` stays listed while empty. The list's department button declares a new one (name up to 60 characters, unique without case, never "General"; optional inline shared instructions up to 24,000 bytes), and each department heading edits its inline shared instructions; a brief kept in a file shows its path read-only. Both write the local draft, count as pending changes and apply through the native plan (`team "X": create · brief set`). Drafts are matched with the file and with live bots by name and team first, then by name, so moving a bot shows as a pending change of that bot. Only the team-less chief (the default MausBot) is hidden; a team's chief is listed. `chief`, `manages`, brief files and `rooms:` are edited in `team.yaml` only; renaming and deleting a department happen in OMB.

*Add department* (D82) lists the department templates of installed extensions (`fyso-bot-architect` `OP=team-templates`): name, extension, shared instructions, agents, group chats and skill count, and a note when the department already exists (its agents and rooms are replaced). Choosing one runs `OP=team-import SOURCE=extension:<ext>/<slug>`, which commits the skill files under `project/bots/teams/<slug>/` and returns `proposedTeamYaml`; the panel sets it as the draft, so the person reviews and applies it through the normal plan. It is disabled while another draft is open. Errors such as `name_taken: <bot>` are shown as received.

Skills are listed read-only, except confirmed third-party skills (`skills.json`, D73) and the skills of installed extensions (`extensions.json`), which are toggles in the bot detail (D54, extensions-contract §6). "Uses workflows" maps to the bot `cwd` being the project root, `${FYSO_ROOT}`.

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


### Bot form connector selection

`Bot.tools` reads the effective native team-file allow/deny selection, including
team defaults. `BotInput.tools` is optional: omission preserves the existing YAML
node. An explicit change writes only that node and preserves other bot fields,
file references and unrelated profiles. Native draft preview/apply remains the
existing `fyso-bots-plan` / `fyso-bots-apply` workflow, not an immediate API patch.
The live native scope is used for initial form visibility when there is no draft;
subsequent roster polling never overwrites a connector selection the person edited.

### `fyso-agent-connect` — assistant MCP registration

Params: `TARGET` is exactly `claude-desktop`, `codex` or `claude-code`; `MODE` is `connect` (default) or `disconnect`. `MODE=remote` (D65, no `TARGET`) makes sure the remote MCP token exists and outputs `{mode, server, url, created}`, never the token; the page then reads the per-client commands from `POST /api/agent/remote` (private setup adapter, same session and origin rules as `/api/composio/setup`). The adapter validates both before invoking the installer's native `agent-connect.cjs`, without shell interpolation. Nonzero connector exit codes fail the run. Output `result` is `{ target, mode, message }`.

The MCP page enqueues this DAG and uses the shared action state, errors and Dagu log links. The workflow changes the configuration of the OS user running Dagu on that host, not the browser's machine. It does not launch or restart assistants. Demo mode explicitly labels simulated actions.

## Third-party skills (D73)

Apps → Skills uses `GET /config/skills.json`, `fyso-skills-catalog` and `fyso-skills-install`. Immutable preview, scan, human confirmation, states, params and native per-bot behavior: [contract](third-party-skills.md). Third-party Markdown is plain text. Pending skills cannot be switched on.
