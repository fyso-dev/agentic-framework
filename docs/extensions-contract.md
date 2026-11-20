# Extensions contract (Phase 7, D17, D30, D31)

An **extension** is a small Copier template, applied on top of a generated project, that adds a tool or service by dropping files into **fixed slots**. Each slot is read by software that already merges several files (mise, process-compose, Caddy, Dagu, Claude Code / OMB). There is no plugin loader. This file is the contract between:

- the **plumbing**: `framework/scripts/`, `Caddyfile`, `mise.toml.jinja`, `framework/extensions/_template/`, the sample fixture and the tests;
- the **panel**: `framework/panel/`.

`<ext>` is the extension id: `^[a-z][a-z0-9-]{1,30}$`. It is the same everywhere below.

## Core versus extension placement

The framework grows primarily in extensibility. Keep the default installation understandable and useful without capabilities for unrelated use cases. This is a product boundary as well as a code boundary.

| Responsibility | Default home |
|---|---|
| Shared runtime, isolation, authentication boundary, generic extension lifecycle and hosting | Core |
| Domain workflows, provider integrations, specialized screens, tools and skills | Opt-in extension |
| One project's content, configuration and business rules | Project-owned files or a project distribution |

Before implementing a capability:

1. Check whether native software and existing extension slots already provide it.
2. Keep use-case behavior in an extension, including its UI, translations, setup, health checks and dependencies.
3. If a slot is missing, document the concrete limitation and add the smallest generic contract needed. Keep feature-name branches, specialized routes and domain-specific schemas out of the host. Avoid speculative plugin abstractions.
4. Verify both the default project without the extension and the installed extension. Uninstalled functionality must not add navigation, setup requirements, credentials, services or failing health checks to the default experience.

An extension should feel integrated once installed: use the shared navigation, language, theme, setup and lifecycle contracts. Modularity must not require the user to understand internal service wiring. Installation and removal must preserve project-owned data according to the documented lifecycle; removal must not silently delete user content.

### Promotion to core

Promote behavior only when all of the following are demonstrated:

- It is an essential shared framework responsibility or a reusable primitive needed by multiple concrete use cases, rather than a convenience for one feature.
- Existing extension contracts cannot meet the requirement cleanly, and a small generic slot has been considered first.
- A PLAN decision or ADR explains ownership, compatibility, default UI and operational cost, alternatives and acceptance checks for projects without the original feature.

Multiple extensions sharing a need justifies evaluating a shared primitive; it does not automatically justify moving their domain functionality into core. Bundling extension source or adding a feature flag does not make specialized behavior a core responsibility. Existing functionality is not migrated automatically under this policy: assess it within explicitly scoped work.

## 1. Lifecycle

| Action | Command | What it runs |
|---|---|---|
| Install | `mise run ext:add <id\|src> [-- copier args]` | A bare id is resolved through the catalogs (§8) and pinned to its latest tag. `copier copy --trust <src> . -d extension_port=<first free>` then `mise trust` on the new conf.d file, regenerate `.mcp.json` and panel config |
| Upgrade | `mise run ext:update [<ext>]` | `copier update --trust --answers-file <f>` for one extension or each `.copier-answers.ext-*.yml`. Copier refuses a dirty tree, so when one upgrade changes files the task stops and asks for a commit before the next |
| List | `mise run ext:list` | id, source, version (`_commit`) from each answers file |
| Search | `mise run ext:search [text]` | catalog entries with their latest tag and install state (§8) |
| Remove | `mise run ext:remove <ext>`, or the panel's Uninstall (`fyso-ext-remove`, §8, D83) | deletes the slot files of §2 and the answers file. Copier has no uninstall |

- Each extension's `copier.yml` sets `_answers_file: .copier-answers.ext-<ext>.yml`. The answers files **are** the list of installed extensions, versioned in git. There is no registry.
- `src` is anything Copier accepts: `gh:org/fyso-ext-foo`, a git URL, or a local path. Pin with `--vcs-ref <tag>`. Copier saves it in the answers file, which `check-paths` scans before every snapshot: a path inside the project is stored relative, and an absolute path outside it is refused by the panel and warned about by `ext:add` (publish the extension to git instead).
- Copier needs a clean git tree for `update`. The tasks fail with Copier's own message; they do not stash.

## 2. Slots

An extension writes **only** these paths. It never edits a file that another template owns (`.gitignore`, `mise.toml`, `Caddyfile`, `.mcp.json`, `project/bots/team.yaml`…).

| Slot | Path | Read by |
|---|---|---|
| Tools, env, tasks | `.config/mise/conf.d/ext-<ext>.toml` | mise (verified on 2026.11.2: env and tasks load; the file needs `mise trust`) |
| Processes | `extensions/<ext>/process.yaml` | process-compose: `up.sh` passes one extra `-f` per file (verified: merge works and `depends_on` crosses files) |
| Routes | `extensions/<ext>/Caddyfile` | Caddy: `import {$FYSO_ROOT}/extensions/*/Caddyfile` (verified: an empty glob is valid). Each `http://<app>.{$FYSO_WEB_DOMAIN}` site inherits the panel's web-login rule unless the project declares that app (D58) |
| Browser request authorization | `extensions/<ext>/authorize.caddy` | Caddy imports these directives inside `fyso_login`, after Tinyauth authenticates the request and before browser application handlers run. |
| Browser OAuth return | `GET /extensions/<ext>/oauth/callback` | Caddy routes this navigation to `GET /profile/callback` on the extension's private socket after web authentication and authorization. The extension must validate and consume the OAuth state and bind it to the initiating browser. |
| Panel permission report | `extensions/<ext>/panel-access.caddy` | A provider serves `GET /api/panel-access` after gateway authentication. HTTP 204 means unmanaged access. HTTP 200 with `{"capabilities":[]}` reports the current principal's effective permissions. The panel uses these for navigation and the gateway still checks protected requests. |
| Remote MCP authorization | `extensions/<ext>/mcp-authorize` | An empty marker enables checks on the extension's private socket. `POST /mcp-access/check` receives `principal`, `method`, and the optional `tool`; only HTTP 204 grants access. A principal may be a project credential, a validated local user, or a delegated credential of the form `fyso-ext-<ext>.<secret>`. For delegated authentication the issuing extension receives the SHA-256 digest with method `authenticate`. Only that extension receives the digest. |
| OAuth provider definitions | `extensions/<ext>/tinyauth.providers.yaml` | Native Tinyauth provider map, loaded only for extensions with a Copier answers file. Project provider IDs take precedence. Missing `${FYSO_AUTH_*}` values leave a provider pending. Project-owned app access rules still apply. |
| Page declarations | `extensions/<ext>/pages/*.yaml` | Generic panel navigation (§9) |
| Public page assets | `extensions/<ext>/panel/**` | Authenticated Caddy static file server (§9) |
| Panel tile | `extensions/<ext>/app.yaml` | `panel-data.cjs` → `apps.json`, with `group: "extension"` |
| Connection hook (optional) | `extensions/<ext>/connect.sh` | Runs through `run-ext.sh` after tools, processes and routes are loaded on install/update when running, and on `up`; native process-compose readiness probes gate the hook; missing secrets defer it. Must be idempotent and preserve unrelated project state |
| Health check | `extensions/<ext>/doctor.sh` | `mise run doctor` runs each one |
| Secret names | `extensions/<ext>/secrets.yaml` | `run-ext.sh`, doctor, panel |
| Setup step (optional) | `extensions/<ext>/setup.yaml` | Panel Setup checklist, `fyso-setup-check` (D51) |
| Instance switcher (optional) | `extensions/<ext>/switcher.yaml` | Panel top bar, one per project (§9, D94) |
| MCP servers | `extensions/<ext>/mcp.json` | merged into `.mcp.json` (§4) |
| Skills | `extensions/<ext>/skills/<name>/SKILL.md` | OMB, when a person enables them on a bot: the panel's bot detail has one toggle per extension skill (D54), or list them in `team.yaml` by hand (not automatic, see §6) |
| Department templates | `extensions/<ext>/teams/<slug>/team.yaml` and `extensions/<ext>/teams/<slug>/skills/**` | `fyso-bot-architect` `OP=team-templates`, listed by the panel's *Add department*; added only when a person chooses one and applies the proposed change (D82, see below) |
| Workflows | `project/workflows/ext-<ext>-*.yaml` | Dagu (flat file; see §6 for subdirectories). Files matching a longer installed id (`ext-<ext>-other-*` when `<ext>-other` is installed) belong to that extension |
| Ignore rules | `extensions/<ext>/.gitignore` | git (nested ignore files) |
| Runtime data | `.data/ext/<ext>/` | the extension's own process (never committed) |

### `secrets.yaml`

```yaml
# Names only. Values live in secrets.enc.yaml: set them in the panel (§5) or with `mise run secrets`.
- name: SAMPLE_TOKEN
  description: {es: Token de ejemplo, en: Sample token}
  url: https://example.com/settings/tokens   # optional, HTTPS: where the value is obtained (D50)
  required: true
```

### `teams/<slug>/` (D82)

One department template per directory, in OpenMausBot's own team file format: `team.yaml` declares exactly one `teams:` entry, the bots whose `team:` is that department and its rooms, with no `cwd`, machine path, `chief` or `manages`. Skill entries are relative, `skills/<bot-slug>/<skill>/SKILL.md`, and each file lives beside `team.yaml`. Limits: 512 KB and 64 skills ([department templates](team-templates.md)). `extensions.json` lists the slugs as `teams`; `OP=team-templates` lists an invalid template with its error, and it cannot be added. The extension never writes `project/bots/team.yaml`: adding a department is the person's action (`OP=team-import SOURCE=extension:<ext>/<slug>`), which copies the skills to `project/bots/teams/<slug>/` and opens the proposed `team.yaml` as a draft.

### `app.yaml`

Same shape as `project/apps/*/app.yaml` (panel-contract §1). `url` is required and is usually the extension's route, e.g. `http://sample.localhost:${FYSO_HTTP_PORT}`. `panel-data.cjs` replaces `${VAR}` with values from `FYSO_*` env vars only.

### Ports

The project block (`port_base`…`+8`) is full. Extensions use the **extension block** `port_base + 10` … `port_base + 19`. Each extension asks for its port in its `copier.yml` as the question **`extension_port`**, with a default read from the project's answers (`_external_data`), and writes it as `FYSO_EXT_<EXT>_PORT` in its conf.d file. `ext:add` passes the first port of the block that no installed extension uses as `-d extension_port=…`, so a second extension does not collide with the first (`<EXT>` = id in upper case, `-` → `_`). `doctor` fails when two `FYSO_EXT_*_PORT` values collide or fall outside the extension block.

## 3. Processes and secrets

Every framework process starts from a cleared environment (Phase 1). Extensions follow the same rule through one wrapper:

```yaml
# extensions/sample/process.yaml
version: "0.5"
processes:
  ext-sample:
    command: framework/scripts/run-ext.sh sample -- bash -c 'exec miniserve --port "$FYSO_EXT_SAMPLE_PORT" extensions/sample/public'
    readiness_probe:
      exec: { command: framework/scripts/run-ext.sh sample -- extensions/sample/doctor.sh }
```

**Keep `$VARS` away from process-compose's shell.** process-compose stores the command as written and runs it with `bash -c` and the environment of the last `mise run up`. An extension installed from the panel is loaded with `process-compose project update`, so that environment lacks its port and secrets. Put variables in single quotes after `run-ext.sh` (or in a script started by it), and run readiness probes through `run-ext.sh` too.

`run-ext.sh <ext> -- <cmd…>` loads the project's mise environment (Dagu steps run with a cleared one, so ports and secrets would be missing otherwise), then runs `<cmd>` with only `PATH`, `HOME`, `FYSO_*`, and the names listed in `extensions/<ext>/secrets.yaml`. It fails with a clear message when a `required: true` secret is empty. Process names must start with `ext-<ext>`.

## 4. `.mcp.json` is generated

`.mcp.json` stops being a template file. `framework/scripts/mcp-config.cjs` writes it on `up`, `ext:add` and `ext:remove` by merging `mcpServers` from, in order:

1. `framework/mcp.json` (the Dagu server, owned by the template);
2. `project/mcp.json` (owned by the project, optional);
3. `extensions/*/mcp.json`.

A duplicate server name fails, naming both files. `${VAR}` placeholders are kept as they are (Claude Code expands them), with one exception (D55): in a server `url`, `${FYSO_…_PORT}` is replaced with the project's port number when that variable is set. OpenMausBot validates the URL before expanding placeholders and rejects the server for bots with a tool selection. Ports are not secrets; credentials such as `${DAGU_MCP_AUTH}` are never written. `.mcp.json` is in `.gitignore`; its sources are in git.

## 5. Panel data

`GET /config/extensions.json`, written by `panel-data.cjs config` into `.data/panel/`, served read-only by Caddy like `apps.json`:

```ts
type Extension = {
  id: string
  src: string                 // _src_path from the answers file
  version: string | null      // _commit from the answers file
  apps: string[]              // ids of the apps this extension added to apps.json
  secrets: { name: string; description?: string; description_i18n?: Record<string,string>; required: boolean; set: boolean }[]
  mcpServers: string[]        // server names from its mcp.json
  workflows: string[]         // names of project/workflows/ext-<ext>-*.yaml, without .yaml
  skills: string[]            // folder names under skills/
  pages: {id: string; name: string; name_i18n?: Record<string,string>; icon?: string; url: string}[]
  switcher?: {url: string}    // from switcher.yaml (§9)
}
```

`set` is `true` when the env var is non-empty. **The value is never written** (rule: the panel never shows secret values). Installing, upgrading and uninstalling go through the marketplace workflows (§8), with no agent or model involved; `mise run ext:remove` stays available (§1).

The panel re-reads `project.json`, `apps.json`, `extensions.json` and `skills.json` with the bot roster: every five seconds and on window focus, plus right after a panel install or uninstall. An extension added or removed outside the page (terminal, an agent's `fyso_ext_install`, another tab, or a panel install the person navigated away from) appears without a manual refresh. An unchanged file keeps the shown state, and a failed background read keeps the last good data.

### Guided setup (D50)

Each installed extension with a `secrets.yaml` shows a form in the panel, open by itself while a required value is missing. Secrets with a `url` get a button that opens that page (deep-link the provider's key page). With several secrets, one field takes the block the provider shows (`NAME="value"` lines, optional `export`, quotes and comments; undeclared names are ignored) and the individual fields stay as a fallback. A blank field keeps the current value. `POST /api/extensions/<ext>/secrets` with `{"values": {"NAME": "value"}}` goes through the web-session gateway to the private connector-setup socket (D45), never through Dagu. The adapter accepts only names declared by that installed extension, writes each value with `sops set --value-stdin`, commits only `secrets.enc.yaml` (`extensions: configure <ext>`), and restores the file on any failure. It shares the connector-settings lock and refuses to write while `secrets.enc.yaml` has uncommitted changes.

Then `ext.sh configured <ext>` reloads the extension: when the stack runs, it restarts the processes in its `process.yaml` and runs connection hooks; it regenerates panel data and runs `doctor.sh` through `run-ext.sh`. The reply is `{saved, missing, check: ok|failed|none|unknown}`; doctor output is never returned. Make `doctor.sh` verify the credentials when it can, so the panel can say "saved and verified". Clearing a value stays a terminal task (`mise run secrets`).

### Setup step (D51)

An extension that must be configured before it works adds a step to the panel's **Setup** checklist with `extensions/<ext>/setup.yaml`:

```yaml
title: {es: Conectar Langfuse, en: Connect Langfuse}   # required
description: {es: …, en: …}                           # optional
```

The step shows the description and the guided form above, and counts toward the checklist. Its state comes from `fyso-setup-check` (the panel's "verify" action), not from the panel: **pending** while a required secret is empty, then **failed** or **done** by the extension's `doctor.sh` run through `run-ext.sh` (no doctor: done). Saving the form runs the check again. So a key that does not authenticate never shows as done.

## 6. Known limits (v1)

- **Skills are not enabled automatically.** `team.yaml` belongs to the project. A person enables an extension's skill per bot in the panel's bot detail (D54), or the Bot Architect adds it. The toggle writes the native entry `- file: ${FYSO_ROOT}/extensions/<ext>/skills/<name>/SKILL.md`; for a bot with a tool allow-list it also selects `mcp:<server>:*` for the extension's MCP servers, and removes that selector when switched off. Off keeps the skill entry with `enabled: false`, because OMB's team apply does not uninstall a skill that the file omits. It is available only for bots that run in the project root.
- **Dagu subdirectories:** supported in 2.24.0 when `DAGU_DAG_DISCOVERY_RECURSIVE=true`; discovery is flat by default. Verified against [store.go](https://github.com/dagu-org/dagu/blob/v2.24.0/internal/persis/file/dag/store.go) and `TestRecursiveDiscoverySupportsNestedDAGOperations` / the default root-only test in [store_test.go](https://github.com/dagu-org/dagu/blob/v2.24.0/internal/persis/file/dag/store_test.go). Keep flat prefixed workflow slots in v1.
- **Hot install reaches OpenMausBot on the next start.** OMB keeps the environment it started with: MCP servers and `BOT_*` secrets of an extension installed from the panel reach bots after `mise run up`. Processes, routes, workflows and panel data load right away.
- **Removal keeps data:** `ext:remove` and the panel's Uninstall delete the slots but not data in `.data/ext/<ext>/` or secrets in `secrets.enc.yaml`.

## 7. Test fixture and template

- `framework/extensions/_template/` — Copier template to start a new extension (`copier copy framework/extensions/_template ../fyso-ext-foo`). It produces a repo with every slot of §2 filled with a commented example and a `README.md` authoring guide (slots, rules, test and release), which the extension's `copier.yml` excludes from projects. Generated projects document the `ext:*` tasks in their `README.md` and `AGENTS.md`.
- `tests/fixtures/ext-sample/` — the minimal sample extension (a static file server pinned in its conf.d file, one route, one tile, one doctor, one secret, one MCP entry, one workflow). Tests make a throwaway git repo of it, tag `v1`, install it into a generated project, tag `v2` with a change, and check `ext:update` applies it.

Fixture verification: miniserve `0.35.0` is an exact [GitHub release](https://github.com/svenstaro/miniserve/releases/tag/v0.35.0) supported by the aqua registry. Copier `9.19.1` supports `_external_data`; the real lifecycle test reads the project port through it. During update Copier renders the old template in an empty temporary destination, so port validators tolerate absent external project answers there; doctor enforces the installed port range. Extension authoring README files must be excluded from output to preserve project-owned files.

process-compose `1.124.0` accepts `-f` on startup but rejects it for client commands (`process list`, logs, down). All startup fragments are loaded once; status/logs/down target that same project Unix socket.

## 8. Marketplace (D31)

Discovery only: the answers files remain the list of installed extensions. Rationale and the tools compared (Devbox, app stores, Composio alternatives): [ADR 0002](adr/0002-extension-marketplace.md).

### Catalogs

A catalog is a git repo with `marketplace.yaml` at the root:

```yaml
name: Fyso
extensions:
  - id: netbird                        # ^[a-z][a-z0-9-]{1,30}$, the extension id
    src: gh:fyso-dev/fyso-ext-netbird  # anything Copier and git accept (gh:, URL, path)
    name: {es: NetBird, en: NetBird}   # string or map of languages
    description: {es: Red privada entre hosts, en: Private network between hosts}
    tags: [network]
    homepage: https://netbird.io       # optional
```

`project/marketplaces.yaml` (owned by the project) lists catalog sources in order; without it, the official `gh:fyso-dev/fyso-extensions` is used. The first catalog that lists an id wins. A catalog that cannot be read is reported and the others still load. Private catalogs work with the user's git credentials.

**Versions are tags** of the extension repo (`v1.2.0`, `1.2`), read with `git ls-remote --tags`; the highest version-like tag is `latest`. A catalog never stores versions.

### `fyso-ext-catalog` (no params) → output `catalog`

`framework/scripts/marketplace.cjs json`, run by Dagu (it uses the network, so it is not part of `up`):

```ts
type Marketplace = {
  collectedAt: string
  catalogs: { source: string; name: string; error?: string }[]
  extensions: {
    id: string; src: string; catalog: string
    name: string; name_i18n?: Record<string,string>
    description: string; description_i18n?: Record<string,string>
    tags: string[]; homepage?: string
    latest: string | null      // highest version tag; null when the repo has none
    installed: boolean; version: string | null; update: boolean
    error?: string             // the repo could not be read
  }[]
}
```

The panel takes `installed`/`version`/`update` from `extensions.json` (always current) and only `latest` from this output.

### `fyso-ext-install` (params `ID`, `MODE` = `add` | `update`) → output `result`

`framework/scripts/ext.sh apply`, run through `mise exec` (Dagu steps start from a cleared environment). `ID` and `MODE` arrive as env vars, never on the command line.

- **add:** `ext:add <id> -- --defaults`, then commit **only** the extension's slots (§2) as `ext: add <id> <version>`. Other uncommitted work is left alone.
- **update:** a running project always has uncommitted state, and Copier refuses to update a dirty tree. The upgrade runs in a temporary `git worktree` of `HEAD`, is committed there as `ext: update <id> <version>`, and is fast-forwarded into the project. It fails with a clear message only when the extension's own files have local edits.
- Then `mise install`, and when the stack runs: `process-compose project update` with every fragment and a Caddy restart (`run-caddy.sh` reads extension ports fresh from mise). The panel tolerates the short gateway restart.

Output: `{ id, mode, version: string | null, commit: string }`.

### `fyso-ext-remove` (param `ID`) → output `result` (D83)

The panel's Uninstall button on an installed card opens an in-page confirmation, then runs `ext.sh apply` with `MODE=remove`: the same removal as `ext:remove`, panel and `.mcp.json` regeneration, one commit of **only** that extension's tracked slots (`ext: remove <id> <version>`), then the same activation as an install (`mise install`; with the stack running, `process-compose project update` drops the extension's processes, and web-auth and Caddy restart). Data in `.data/ext/<ext>/` and secrets in `secrets.enc.yaml` are kept. Skills of the extension switched on in `project/bots/team.yaml` are not edited; switch them off first. One lifecycle change runs at a time in the panel.

Output: `{ id, mode: "remove", version: string | null, commit: string }` (`version` is the removed one).

## 9. Extension-owned tabs and pages

### Live theme messages (SDK v1, optional)

SDK pages announce `{type: "fyso-panel-theme-ready"}` to their same-origin
parent. The panel checks the exact iframe window and origin, then sends
`{type: "fyso-panel-theme", theme: "light" | "dark"}` on readiness and later
mode changes. SDK `useTheme` validates the parent window, origin and enum before
updating the page class. The iframe's initial theme URL stays stable so editor
state is retained. Plain HTML pages that do not announce readiness keep the
existing theme-query reload behavior. This is additive to SDK v1.



An installed extension may contribute **zero, one or multiple pages**. The framework is a generic host; extension business screens, translations and assets are never imported by the host SPA.

| Slot | Native consumer |
|---|---|
| `extensions/<ext>/pages/<page>.yaml` | `extensions.cjs inventory` → `/config/extensions.json` → generic navigation/router |
| `extensions/<ext>/panel/**` | Caddy's authenticated, read-only static file server, only within the public panel directory |

A declaration reuses app metadata's localized `name`, `icon` and `url` fields:

```yaml
# extensions/example/pages/overview.yaml
name: {es: Mi página, en: My page}
icon: apps
url: /extensions/example/panel/index.html
```

The file stem is its page ID and follows the extension ID naming rule. The entry must be an existing `.html` file strictly below the same extension's `panel/` directory. Invalid paths, private slots and missing entries fail configuration generation. Labels may be strings or language maps. The extension inventory adds `pages: {id, name, name_i18n?, icon?, url}[]`; old inventories without this property contribute no pages.

The host derives navigation entries from installed registrations and serves `#/extensions/<ext>/<page>`. It embeds the declared page with a standard same-origin iframe, passing `lang`, `theme` and `page` query parameters. Multiple extensions/pages require no core changes. Removing the extension removes its entries on the next configuration reload. Opening an uninstalled page displays a generic unavailable state. Caddy permits GET/HEAD on public page assets; other extension paths return 404. No new backend or plugin evaluator is involved.

### Page counters (panel API 2)

A page may declare a counter. The panel shows it beside the page's entry in the side and bottom navigation, on every screen:

```yaml
# extensions/example/pages/inbox.yaml
name: {es: Pendientes, en: Pending}
icon: checklist
url: /extensions/example/panel/index.html
badge:
  dagu_runs: {status: waiting, labels: [human-request]}
  warn_labels: [blocking=true]   # optional
  attention: true                # optional
```

| Field | Meaning |
|---|---|
| `dagu_runs.status` | The run state to count. Only `waiting` is accepted |
| `dagu_runs.labels` | 1 to 5 labels a run must carry, all of them |
| `warn_labels` | 1 to 5 labels; when a counted run carries all of them, the counter uses the warning color |
| `attention` | `true` adds a notice to the top bar, "<page name>: <count>", linking to the page while the count is above zero |

The declaration is data. The panel runs the query itself against Dagu's run list through the existing gateway (`/api/dagu/dag-runs?status=7&labels=<first label>`, the remaining labels matched on each run), every 30 seconds while the tab is visible and when the person changes screen, at most 500 runs. No extension code is evaluated by the host, and a counter that cannot be read is not shown. A count is for the project, not for a person: a shared login does not tell the panel who is looking. Labels match `[A-Za-z0-9][A-Za-z0-9_.=-]{0,63}`; anything else fails configuration generation, as an invalid page does.

A page that changes the runs it counts calls the SDK's `refreshBadges()` so the menu does not wait for the next poll. Old inventories without `badge` show no counter.

### Conditional pages (panel API 5, D95)

A page may be listed in the menus only while its own extension says so, for example a page that needs the project to be connected to a service:

```yaml
# extensions/biz/pages/identity.yaml
name: {es: Identidad, en: Identity}
url: /extensions/biz/panel/identity.html
visible: {api: status, field: connected}   # GET /api/ext/biz/status → {"connected": true}
```

| Field | Meaning |
|---|---|
| `visible.api` | A path of the extension's own same-origin API (D79), `/api/ext/<ext>/<api>`; nothing else can be named |
| `visible.field` | A top-level field of that JSON answer; the page is listed only while it is exactly `true` |

The panel reads it with the counters' cadence (every 30 seconds while visible, on navigation, and when a page calls `refreshBadges()`). Until the answer is `true`, and on any error, the page stays out of the side and bottom menus; its URL still opens it, so the page keeps its own access checks. Frameworks before API 5 ignore the field and always list the page.

### Instance switcher (panel API 3)

When several instances share one login, for example the instances behind a host's hub, an extension can let people jump between their panels from the top bar:

```yaml
# extensions/hub/switcher.yaml
url: https://portal.example.com/environments.json   # or a path on the panel origin
```

The answer is data:

```json
{"items": [{"name": "Auditor", "url": "https://panel.auditor.example.com/"}, {"name": "EMOS", "url": "https://panel.emos.example.com/"}]}
```

| Rule | Detail |
|---|---|
| Declaration | One key, `url`: an http(s) URL without credentials, or a path starting with `/`. Anything else fails configuration generation. Only one installed extension may declare a switcher (`ext check` fails on two) |
| Request | `GET` with `Accept: application/json`, no cache. The session cookie is sent (`credentials: include`) only when the URL is on another origin; that server must answer with `Access-Control-Allow-Origin: <panel origin>` and `Access-Control-Allow-Credentials: true` |
| Items | At most 50; each needs a non-empty `name` and an http(s) `url` (relative URLs resolve against the panel). Others are dropped. The item on the panel's origin is marked as current instance |
| Display | A chevron beside the brand opens the list. Nothing is shown when no extension declares a switcher, the request fails, or the list names no other instance |

Who appears in the list is the list server's decision; the panel does not grant access, and each instance still checks its own login. No extension code runs in the host.

### Optional panel SDK

Direct `ext:add` and `ext:update` activate installed tools and reload the running project before connection hooks, just like panel operations. Hooks wait for core services and their own extension processes, with a two-minute timeout.

Static HTML and any frontend stack work without an SDK. Pages that want the existing look and Dagu interactions may import native ES modules from `/assets/extension-sdk.js`, and `/assets/panel.css` for the shared styles. `PANEL_API_VERSION` is `5`; version 2 added page counters and `refreshBadges`, version 3 the instance switcher, version 4 the project identity (D92), version 5 conditional pages (D95), and none removed anything.

The SDK exports `mountExtensionPage(Component, messagesByLanguage)`, React hooks/JSX runtime, `useTranslation`, `useStore`, `botRoster` (live bots plus team-file drafts, as on the Bots screen), `useDaguAction`, `ActionButton`, `ActionStatus`, `External`, `RelTime` and `refreshBadges`. `mountExtensionPage` applies the host's language/theme and initializes the same authenticated project client inside the page. Backend requests use gateway-root URLs, so nested extension pages do not need a base tag and may keep relative asset URLs. The extension owns its resource bundles. A bundler may map `@fyso/panel`, `react` and `react/jsx-runtime` to this single hosted ES module so React is reused rather than bundled again. [fyso-ext-biz](https://github.com/fyso-dev/fyso-ext-biz) is an independently versioned consumer; the extension starter provides a plain HTML example.

This is a rendering boundary, **not a sandbox for hostile code**. Extensions are already trusted Copier templates with executable hooks. Same-origin pages share the gateway's authenticated access; they do not receive decrypted secret values. Use the existing Dagu workflows for process-side integrations, and never pass credentials through URL parameters or browser storage.

The SDK version is also declared in `framework/panel/extension-api.json` (the source of `PANEL_API_VERSION`). Copier extensions may use native `_external_data` to validate this capability before writing files. This makes compatibility explicit without coupling an extension to a framework repository layout or branch.

### Project identity (panel API 4, D92)

SDK pages take the project's saved identity (accent, type and corners from `project.json` `brand`) like the panel. The core only applies the identity; editing it belongs to an extension. The SDK exports `FONTS`, `DEFAULT_ACCENT` and the `Brand`, `Look`, `Font` and `Radius` types, plus `previewLook(look)`, which shows a look on the page and on the panel around it until the next save or call. An editor saves with its own workflow that runs the core CLI `node framework/scripts/brand.cjs operate` (`OP=save`, `SETTINGS_B64` = base64 JSON `{name?, accent?, font?, radius?, icon?, loginBackground?}`; see the [panel contract](panel-contract.md)). The panel picks the saved identity up with its next `project.json` read. [fyso-ext-biz](https://github.com/fyso-dev/fyso-ext-biz) provides the editor, enabled only for a Fyso Biz session.

### Same-origin extension API (D79)

A page that needs fast reads, or an action that does not need a Dagu run, can call its own service through the panel origin instead of a workflow:

| Piece | Value |
|---|---|
| Route | `/api/ext/<id>/<path>` on the panel origin, behind `fyso_login` |
| Upstream | Unix socket `$FYSO_EXT_SOCKET` = `/tmp/fyso-ext-<id>-<FYSO_HTTP_PORT>.sock`, set by `run-ext.sh` when the port is known |
| What arrives | `/<path>` with its query string, the session's `Remote-User`/`Remote-Groups`/`Remote-Email`; never cookies or `Authorization` |
| Rules | Same as the panel's own APIs: viewers may not use it, writes need the panel `Origin`; ids follow `^[a-z][a-z0-9-]{1,30}$`; anything else under `/api/ext/` is 404 |

The extension's process creates the socket with mode 0600 and removes a stale one before listening. The short `/tmp` path follows the framework's other sockets because macOS limits socket paths to 104 bytes. When nothing listens, the gateway answers 502, so a page can fall back to its Dagu workflow on an older framework or a stopped process.

Use it for reads and small, idempotent actions. Keep changes that people review, that need run history or that write to the repository on Dagu workflows. The socket is private to the project user. Trust the identity headers only on this socket, never on a TCP port.

## 10. HTTPS provider (D62)

An extension that terminates TLS for the project declares it in its conf.d file
(`.config/mise/conf.d/ext-<ext>.toml`):

```toml
[env]
FYSO_WEB_SCHEME = "https"
```

The core then treats `https://<app>.<web_domain>` as the project's addresses
([web-auth.md](web-auth.md#https-through-a-provider-extension-d62)). The provider:

- delivers every `<app>.<web_domain>` name to `127.0.0.1:$FYSO_HTTP_PORT` (directly or
  through its own relay) and keeps the `Host` header;
- serves a certificate browsers and CLI clients trust without configuration;
- tells the person which `web_domain` to set (`copier update -d web_domain=…`), because
  that answer belongs to the project;
- states in its README and its doctor who can reach the addresses (public, peers only,
  groups). That is the provider administrator's decision, not the project's;
- is the only provider of the project. Nothing detects a second one yet.

Features that need HTTPS check the scheme, not a particular extension.

### Managed access compatibility

`framework/panel/access-api.json` version 1 marks projects with the browser
authorization, permission report, and remote MCP authorization slots.
Extensions that enable managed access should require this marker during
installation. Installing a policy extension into an older gateway must not
silently enable a mode that the gateway cannot enforce.
