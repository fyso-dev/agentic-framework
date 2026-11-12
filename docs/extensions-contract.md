# Extensions contract (Phase 7, D17, D30, D31)

An **extension** is a small Copier template, applied on top of a generated project, that adds a tool or service by dropping files into **fixed slots**. Each slot is read by software that already merges several files (mise, process-compose, Caddy, Dagu, Claude Code / OMB). There is no plugin loader. This file is the contract between:

- the **plumbing**: `framework/scripts/`, `Caddyfile`, `mise.toml.jinja`, `framework/extensions/_template/`, the sample fixture and the tests;
- the **panel**: `framework/panel/`.

`<ext>` is the extension id: `^[a-z][a-z0-9-]{1,30}$`. It is the same everywhere below.

## 1. Lifecycle

| Action | Command | What it runs |
|---|---|---|
| Install | `mise run ext:add <id\|src> [-- copier args]` | A bare id is resolved through the catalogs (§8) and pinned to its latest tag. `copier copy --trust <src> . -d extension_port=<first free>` then `mise trust` on the new conf.d file, regenerate `.mcp.json` and panel config |
| Upgrade | `mise run ext:update [<ext>]` | `copier update --trust --answers-file <f>` for one extension or each `.copier-answers.ext-*.yml`. Copier refuses a dirty tree, so when one upgrade changes files the task stops and asks for a commit before the next |
| List | `mise run ext:list` | id, source, version (`_commit`) from each answers file |
| Search | `mise run ext:search [text]` | catalog entries with their latest tag and install state (§8) |
| Remove | `mise run ext:remove <ext>` | deletes the slot files of §2 and the answers file. Copier has no uninstall |

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
| Page declarations | `extensions/<ext>/pages/*.yaml` | Generic panel navigation (§9) |
| Public page assets | `extensions/<ext>/panel/**` | Authenticated Caddy static file server (§9) |
| Panel tile | `extensions/<ext>/app.yaml` | `panel-data.cjs` → `apps.json`, with `group: "extension"` |
| Connection hook (optional) | `extensions/<ext>/connect.sh` | Runs through `run-ext.sh` after tools, processes and routes are loaded on install/update when running, and on `up`; native process-compose readiness probes gate the hook; missing secrets defer it. Must be idempotent and preserve unrelated project state |
| Health check | `extensions/<ext>/doctor.sh` | `mise run doctor` runs each one |
| Secret names | `extensions/<ext>/secrets.yaml` | `run-ext.sh`, doctor, panel |
| Setup step (optional) | `extensions/<ext>/setup.yaml` | Panel Setup checklist, `fyso-setup-check` (D51) |
| MCP servers | `extensions/<ext>/mcp.json` | merged into `.mcp.json` (§4) |
| Skills | `extensions/<ext>/skills/<name>/SKILL.md` | OMB, when a person enables them on a bot: the panel's bot detail has one toggle per extension skill (D54), or list them in `team.yaml` by hand (not automatic, see §6) |
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
}
```

`set` is `true` when the env var is non-empty. **The value is never written** (rule: the panel never shows secret values). Installing and upgrading go through the marketplace (§8); removing is a terminal task (§1).

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
- **Removal is manual-ish:** `ext:remove` deletes the slots but not data in `.data/ext/<ext>/` or secrets in `secrets.enc.yaml`.

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

### Optional panel SDK v1

Direct `ext:add` and `ext:update` activate installed tools and reload the running project before connection hooks, just like panel operations. Hooks wait for core services and their own extension processes, with a two-minute timeout.

Static HTML and any frontend stack work without an SDK. Pages that want the existing look and Dagu interactions may import native ES modules from `/assets/extension-sdk.js`, and `/assets/panel.css` for the shared styles. `PANEL_API_VERSION` is `1`.

The SDK exports `mountExtensionPage(Component, messagesByLanguage)`, React hooks/JSX runtime, `useTranslation`, `useStore`, `botRoster` (live bots plus team-file drafts, as on the Bots screen), `useDaguAction`, `ActionButton`, `ActionStatus`, `External` and `RelTime`. `mountExtensionPage` applies the host's language/theme and initializes the same authenticated project client inside the page. Backend requests use gateway-root URLs, so nested extension pages do not need a base tag and may keep relative asset URLs. The extension owns its resource bundles. A bundler may map `@fyso/panel`, `react` and `react/jsx-runtime` to this single hosted ES module so React is reused rather than bundled again. [fyso-ext-biz](https://github.com/fyso-dev/fyso-ext-biz) is an independently versioned consumer; the extension starter provides a plain HTML example.

This is a rendering boundary, **not a sandbox for hostile code**. Extensions are already trusted Copier templates with executable hooks. Same-origin pages share the gateway's authenticated access; they do not receive decrypted secret values. Use the existing Dagu workflows for process-side integrations, and never pass credentials through URL parameters or browser storage.

The SDK version is also declared in `framework/panel/extension-api.json` (the source of `PANEL_API_VERSION`). Copier extensions may use native `_external_data` to validate this capability before writing files. This makes compatibility explicit without coupling an extension to a framework repository layout or branch.

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
