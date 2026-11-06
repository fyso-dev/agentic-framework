# Extensions contract (Phase 7, D17, D30)

An **extension** is a small Copier template, applied on top of a generated project, that adds a tool or service by dropping files into **fixed slots**. Each slot is read by software that already merges several files (mise, process-compose, Caddy, Dagu, Claude Code / OMB). There is no plugin loader. This file is the contract between:

- the **plumbing**: `framework/scripts/`, `Caddyfile`, `mise.toml.jinja`, `framework/extensions/_template/`, the sample fixture and the tests;
- the **panel**: `framework/panel/`.

`<ext>` is the extension id: `^[a-z][a-z0-9-]{1,30}$`. It is the same everywhere below.

## 1. Lifecycle

| Action | Command | What it runs |
|---|---|---|
| Install | `mise run ext:add <src> [-- copier args]` | `copier copy --trust <src> .` then `mise trust` on the new conf.d file, regenerate `.mcp.json` and panel config |
| Upgrade | `mise run ext:update [<ext>]` | `copier update --trust --answers-file <f>` for one extension or each `.copier-answers.ext-*.yml`. Copier refuses a dirty tree, so when one upgrade changes files the task stops and asks for a commit before the next |
| List | `mise run ext:list` | id, source, version (`_commit`) from each answers file |
| Remove | `mise run ext:remove <ext>` | deletes the slot files of §2 and the answers file. Copier has no uninstall |

- Each extension's `copier.yml` sets `_answers_file: .copier-answers.ext-<ext>.yml`. The answers files **are** the list of installed extensions, versioned in git. There is no registry.
- `src` is anything Copier accepts: `gh:org/fyso-ext-foo`, a git URL, or a local path. Pin with `--vcs-ref <tag>`.
- Copier needs a clean git tree for `update`. The tasks fail with Copier's own message; they do not stash.

## 2. Slots

An extension writes **only** these paths. It never edits a file that another template owns (`.gitignore`, `mise.toml`, `Caddyfile`, `.mcp.json`, `project/bots/team.yaml`…).

| Slot | Path | Read by |
|---|---|---|
| Tools, env, tasks | `.config/mise/conf.d/ext-<ext>.toml` | mise (verified on 2026.11.2: env and tasks load; the file needs `mise trust`) |
| Processes | `extensions/<ext>/process.yaml` | process-compose: `up.sh` passes one extra `-f` per file (verified: merge works and `depends_on` crosses files) |
| Routes | `extensions/<ext>/Caddyfile` | Caddy: `import {$FYSO_ROOT}/extensions/*/Caddyfile` (verified: an empty glob is valid) |
| Panel tile | `extensions/<ext>/app.yaml` | `panel-data.cjs` → `apps.json`, with `group: "extension"` |
| Health check | `extensions/<ext>/doctor.sh` | `mise run doctor` runs each one |
| Secret names | `extensions/<ext>/secrets.yaml` | `run-ext.sh`, doctor, panel |
| MCP servers | `extensions/<ext>/mcp.json` | merged into `.mcp.json` (§4) |
| Skills | `extensions/<ext>/skills/<name>/SKILL.md` | OMB, when a person lists them in `team.yaml` (not automatic, see §6) |
| Workflows | `project/workflows/ext-<ext>-*.yaml` | Dagu (flat file; see §6 for subdirectories) |
| Ignore rules | `extensions/<ext>/.gitignore` | git (nested ignore files) |
| Runtime data | `.data/ext/<ext>/` | the extension's own process (never committed) |

### `secrets.yaml`

```yaml
# Names only. Values live in secrets.enc.yaml (`mise run secrets`).
- name: SAMPLE_TOKEN
  description: {es: Token de ejemplo, en: Sample token}
  required: true
```

### `app.yaml`

Same shape as `project/apps/*/app.yaml` (panel-contract §1). `url` is required and is usually the extension's route, e.g. `http://sample.localhost:${FYSO_HTTP_PORT}`. `panel-data.cjs` replaces `${VAR}` with values from `FYSO_*` env vars only.

### Ports

The project block (`port_base`…`+8`) is full. Extensions use the **extension block** `port_base + 10` … `port_base + 19`. Each extension asks for its port in its `copier.yml`, with a default read from the project's answers (`_external_data`), and writes it as `FYSO_EXT_<EXT>_PORT` in its conf.d file (`<EXT>` = id in upper case, `-` → `_`). `doctor` fails when two `FYSO_EXT_*_PORT` values collide or fall outside the extension block.

## 3. Processes and secrets

Every framework process starts from a cleared environment (Phase 1). Extensions follow the same rule through one wrapper:

```yaml
# extensions/sample/process.yaml
version: "0.5"
processes:
  ext-sample:
    command: framework/scripts/run-ext.sh sample -- miniserve --port "$FYSO_EXT_SAMPLE_PORT" extensions/sample/public
    readiness_probe:
      exec: { command: extensions/sample/doctor.sh }
```

`run-ext.sh <ext> -- <cmd…>` runs `<cmd>` with only `PATH`, `HOME`, `FYSO_*`, and the names listed in `extensions/<ext>/secrets.yaml`. It fails with a clear message when a `required: true` secret is empty. Process names must start with `ext-<ext>`.

## 4. `.mcp.json` is generated

`.mcp.json` stops being a template file. `framework/scripts/mcp-config.cjs` writes it on `up`, `ext:add` and `ext:remove` by merging `mcpServers` from, in order:

1. `framework/mcp.json` (the Dagu server, owned by the template);
2. `project/mcp.json` (owned by the project, optional);
3. `extensions/*/mcp.json`.

A duplicate server name fails, naming both files. `${VAR}` placeholders are kept as they are (Claude Code expands them). `.mcp.json` is in `.gitignore`; its sources are in git.

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
}
```

`set` is `true` when the env var is non-empty. **The value is never written** (rule: the panel never shows secret values). The panel shows extensions read-only in v1: installing, upgrading and removing are terminal tasks (§1).

## 6. Known limits (v1)

- **Skills are not enabled automatically.** `team.yaml` belongs to the project. The panel lists an extension's skills; a person (or the Bot Architect) adds them to a bot.
- **Dagu subdirectories:** supported in 2.24.0 when `DAGU_DAG_DISCOVERY_RECURSIVE=true`; discovery is flat by default. Verified against [store.go](https://github.com/dagu-org/dagu/blob/v2.24.0/internal/persis/file/dag/store.go) and `TestRecursiveDiscoverySupportsNestedDAGOperations` / the default root-only test in [store_test.go](https://github.com/dagu-org/dagu/blob/v2.24.0/internal/persis/file/dag/store_test.go). Keep flat prefixed workflow slots in v1.
- **Removal is manual-ish:** `ext:remove` deletes the slots but not data in `.data/ext/<ext>/` or secrets in `secrets.enc.yaml`.

## 7. Test fixture and template

- `framework/extensions/_template/` — Copier template to start a new extension (`copier copy framework/extensions/_template ../fyso-ext-foo`). It produces a repo with every slot of §2 filled with a commented example.
- `tests/fixtures/ext-sample/` — the minimal sample extension (a static file server pinned in its conf.d file, one route, one tile, one doctor, one secret, one MCP entry, one workflow). Tests make a throwaway git repo of it, tag `v1`, install it into a generated project, tag `v2` with a change, and check `ext:update` applies it.

Fixture verification: miniserve `0.35.0` is an exact [GitHub release](https://github.com/svenstaro/miniserve/releases/tag/v0.35.0) supported by the aqua registry. Copier `9.19.1` supports `_external_data`; the real lifecycle test reads the project port through it. During update Copier renders the old template in an empty temporary destination, so port validators tolerate absent external project answers there; doctor enforces the installed port range. Extension authoring README files must be excluded from output to preserve project-owned files.

process-compose `1.124.0` accepts `-f` on startup but rejects it for client commands (`process list`, logs, down). All startup fragments are loaded once; status/logs/down target that same project Unix socket.
