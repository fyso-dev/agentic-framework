# Fyso Agentic Framework — Implementation Plan

Status: **draft for review** · Date: 2026-11-05 · No code written yet.

Brand: **Fyso**. "Fyso Agentic Framework" is a working name; the final product name comes later. The panel, the docs and the generated projects use Fyso branding. The panel's visual design is produced in **Claude Design** from [docs/panel-spec.md](panel-spec.md); the implementation follows that design. `@fyso/ui` is not used.

## 0. Principle

> **Orchestrate existing software. Never reinvent the wheel. Always feel simple.**

Every piece of this framework is an existing tool, wired together with configuration files and a few small scripts. Custom code is allowed only when no existing tool does the job, and it must stay small: the control panel SPA and some glue scripts. When in doubt, choose the option with fewer moving parts.

## 1. Goal

A reusable, versioned template for agentic projects. Each project gets:

| Need | Existing software |
|---|---|
| Conversational bots with memory | **OpenMausBot** (OMB) |
| Workflows, scheduling, run history | **Dagu** |
| Coding agents on a subscription, in git worktrees | **herdr core** (`herdr server`) |
| One entry point, routing, login, secret injection | **Caddy** |
| Run all processes natively | **process-compose** |
| Pinned tool versions, env, tasks | **mise** |
| Encrypted secrets in git | **sops + age** |
| Create projects and update them from the template | **Copier** |
| Secret scanning before commits | **gitleaks** |
| PRs | **gh** |
| Launcher + bot chat (the only real custom code) | small **Vite + React** SPA |

## 2. Decisions log

| # | Decision |
|---|---|
| D1 | Native runtime: **mise + process-compose**. Docker Compose is optional, for deployment only |
| D2 | Bots can use **subscription CLIs** and **API keys**, per bot (native OMB team file) |
| D3 | Secrets: **sops + age**, loaded into the env by mise. No custom secret layer |
| D4 | **Configure in the apps, the framework records to git.** Dagu UI edits workflows, OMB UI edits bots. A snapshot job saves everything to git |
| D5 | Snapshot: **one scheduled commit straight to the current branch, no PRs**. It includes the complete memory folder |
| D6 | Front chat uses the **OMB Bot API** only. Bot API turns have no tools, so chat consults and does not act |
| D7 | Distribution: **Copier**, semver tags on the template repo |
| D8 | Initial bots: **Workflow Architect**, **Run Operator**, **Builder** (dogfooding) |
| D9 | herdr core runs coding agents, invoked from the Dagu `dev-task` workflow |
| D10 | One gateway (Caddy) with one subdomain per app. The native OMB and Dagu UIs are first-class apps |
| D11 | Login: **local `admin` / `admin`** via Caddy basic auth (password from secrets). Extended later with existing tools (Authelia, Pocket ID, oauth2-proxy) |
| D12 | **Simple i18n from day one**: `i18next` + `react-i18next` with one JSON file per locale (`es` default, `en`). Dates, relative times and numbers use the browser's built-in `Intl` APIs |

## 3. Architecture

```
                         Browser
                            │  login: admin / admin (Caddy basic_auth)
                ┌───────────▼────────────┐
                │        Caddy           │  routes · login · injects secrets into upstream headers
                └─┬──────────┬─────────┬─┘
      panel.<host> │  dagu.<host> │ omb.<host> │ <app>.<host>
                   ▼          ▼         ▼           ▼
          Panel SPA       Dagu UI    OMB UI     project apps
       (launcher + chat)  (native)   (native)   (project/apps/*)

   OpenMausBot ── MCP (/mcp) ──▶ Dagu ── dev-task ──▶ herdr core
                                  │
                                  └── snapshot (hourly) ──▶ git commit (+ push)
```

- **Caddy does the server-side work, so there is no backend to write.**
  - Routing: one subdomain per app; `*.localhost` in dev, `*.<domain>` with automatic HTTPS on a server.
  - Login: `basic_auth`.
  - Secrets: Caddy adds the Bot API key as an `Authorization` header on the panel's `/chat` route, so the browser never sees it.
  - Dagu login: Caddy forwards the authenticated user in a header that Dagu trusts (proxy auth), so Dagu needs no second login.
  - OMB keeps its own device pairing and opens in a new tab.
- **OMB and Dagu are coupled in only two places.** OMB reaches Dagu through Dagu's built-in MCP server (`.mcp.json` in the bot `cwd`). Dagu reaches herdr through the `herdr` CLI in DAG steps.

## 4. Repository layout (Copier)

```
agentic-framework/                    # template repo, tagged vX.Y.Z
├── copier.yml                        # questions, _skip_if_exists, _migrations, _tasks
├── docs/
├── tests/                            # renders a project and runs a smoke test (CI)
└── template/
    ├── mise.toml.jinja               # pinned tools, sops env, tasks (up, down, doctor, auth, snapshot, restore)
    ├── process-compose.yaml          # dagu, omb, herdr, caddy, panel  (+ project/apps/*/process.yaml merged)
    ├── Caddyfile                     # core routes  (+ import project/apps/*/Caddyfile)
    ├── .sops.yaml / secrets.enc.yaml
    ├── .mcp.json                     # Dagu MCP for bots and for humans' agents
    ├── AGENTS.md / CLAUDE.md
    ├── framework/                    # OWNED BY TEMPLATE (updated by copier update)
    │   ├── panel/                    # Vite + React SPA: launcher + chat
    │   ├── workflows/                # framework DAGs: snapshot, dev-task
    │   ├── bots/                     # base souls + skills (dagu-workflows, …)
    │   ├── scripts/                  # small glue: restore-memory, doctor checks
    │   └── apps/_template/           # skeleton for a new project app
    ├── project/                      # OWNED BY PROJECT (_skip_if_exists)
    │   ├── bots/team.yaml            # native OMB team file (+ souls/, skills/)
    │   ├── workflows/                # Dagu DAGS_DIR
    │   └── apps/<id>/                # app.yaml (tile) · process.yaml · Caddyfile · code
    ├── state/memory/                 # bot memory, written by snapshot
    └── .data/                        # runtime data (gitignored)
```

**Apps need no registry generator.** Each app is a folder with three small files in the formats the tools already read:
- `process.yaml` is a process-compose fragment; process-compose merges several files.
- `Caddyfile` is a snippet; Caddy imports it with a glob.
- `app.yaml` is the tile (name, icon, url, health path); the panel lists these.

Adding an app means copying `framework/apps/_template`.

## 5. Configuration — native formats only

- **Bots:** `project/bots/team.yaml` is the **OMB team file as-is**:
  - The `engines:` section sets keys as `{ env: NAME }`.
  - Each bot sets `model: claude/...` (subscription) or `claudeApi/...` (API key).
  - The only processing is `envsubst` for the absolute `cwd`.
- **Workflows:** plain Dagu YAML in `project/workflows/`, which is Dagu's DAGS_DIR.
- **Secrets:** `secrets.enc.yaml`, edited with `sops`. mise exports the values as env vars and every tool reads them from there.
- **Template choices:** `.copier-answers.yml`.

## 6. Versioning — the simple model

**Rule: configure in the apps; the framework writes it to git.**

One Dagu DAG, `snapshot`, runs **every hour** and also on demand from the panel. It skips the commit when nothing changed. Steps:

1. `openmausbot team export` → `project/bots/` (bots edited in the OMB UI).
2. Copy each bot's memory folder (`MEMORY.md`, topics, logs) → `state/memory/<bot-name>/`.
3. `project/workflows/` already holds what Dagu edited, so there is nothing to export.
4. `gitleaks protect --staged` → `git commit -m "snapshot: <date>"` → `git push` if a remote is set.

No PRs and no branches for snapshots. The only PRs are the Builder's code changes (§7).

**Replicating a project** is `git clone` → `mise install` → `mise run up`. On a fresh data directory, `up` runs `team apply` and `restore-memory`, which copies `state/memory/<bot-name>/` back by bot name. Everything comes back.

## 7. Bots

| Bot | Default model | Uses | Bot API |
|---|---|---|---|
| **Workflow Architect** | `claude/…` (subscription) | Dagu MCP + skill `dagu-workflows` | no |
| **Run Operator** | `claudeApi/…` (cheap) | Dagu MCP (read, retry, stop) | **yes**: panel chat |
| **Builder** | `claude/…` (subscription) | Dagu MCP (starts `dev-task`), `gh` | no |

**`dev-task`** is a Dagu DAG built only from existing CLIs:

1. `herdr worktree create`
2. `herdr agent start claude` → `agent prompt` with the issue
3. `agent wait`
4. Project checks
5. `gh pr create`

A human reviews and merges. The Builder never touches `main`. In the template repo, the Builder extends the framework itself.

## 8. Auth and health checks

- **`mise run auth`** uses the official CLIs:
  - `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, stored in sops (or `claude /login` once).
  - `codex login --device-auth`.
  - `openmausbot engine set … --only-claude-api` for API keys.
- **`mise run doctor`** runs the tools' own checks: `claude auth status`, `codex login status`, `openmausbot doctor`, `herdr status`, Dagu `/api/v1/health`. On a non-localhost domain, it also fails when the password is still `admin`.
- **VPS:** the same stack, native, with process-compose under systemd as an unprivileged user. Subscriptions are used only through the official CLIs; projects that serve third parties use API keys.

## 9. Panel (the only real custom code)

A small Vite + React SPA served by Caddy at `panel.<host>`:

- **Apps:** tiles from `project/apps/*/app.yaml` plus the built-ins (Dagu, OMB), with a green or red dot from each app's health URL. They open in a new tab.
- **Chat:** with the Run Operator through the Bot API. Caddy injects the key. The panel handles the `200` reply, `202 working` (poll) and `202 needs_approval` (link to OMB).
- **Status strip:** the last snapshot and a "snapshot now" button, which calls Dagu's start endpoint for `snapshot`.

**i18n (D12):**
- Every UI string is a key in `framework/panel/src/locales/<lang>.json`. Spanish is the default and English ships too.
- The language comes from the browser, can be changed with a selector, and the choice is remembered in `localStorage`.
- Plurals use i18next's built-in plural rules. Dates and relative times use `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat`.
- Adding a language is adding one JSON file.
- App tiles (`app.yaml`) may declare `name` and `description` per locale, with a fallback to the default.

**What the panel does NOT do:** it does not edit workflows, bots or secrets. The native UIs and `sops` already do that, and the snapshot records it.

## 10. Phases

### Phase 0 — Spikes (throwaway)
1. Does OMB pass `CLAUDE_CODE_OAUTH_TOKEN` to `claude`?
2. Can mise pin `dagu`, `herdr`, `process-compose`, `openmausbot`, `caddy`, `sops` and `gitleaks`?
3. Does `herdr server` run on Linux, and what is its license?
4. Can a Bot API key be created via CLI? If not, it is a documented manual step.
5. Does Dagu `/mcp` work from a bot's `.mcp.json`, and does Dagu proxy auth work behind Caddy?
6. Does the OMB UI work behind Caddy on a subdomain (SSE, cookies on `*.localhost`)?
7. Does `team export` → `team apply` round-trip with no changes?
8. Can memory be mapped and restored by bot name?
**Exit:** `docs/adr/0001-spikes.md` and this plan updated.

### Phase 1 — Run it
`copier.yml`, `mise.toml`, `process-compose.yaml`, `Caddyfile` with `admin/admin`, sops init, `mise run up/down/doctor`.
**Exit:** after `copier copy` → `mise install` → `mise run up`, the Dagu and OMB UIs open behind one login.

### Phase 2 — Bots
The team file with the 3 bots (the Builder inactive until Phase 5), `mise run auth`, Dagu MCP and the `dagu-workflows` skill.
**Exit:** asking the Architect for a workflow produces a DAG that runs in Dagu.

### Phase 3 — Snapshot and replicate
The `snapshot` DAG, `restore-memory`, gitleaks.
**Exit:** wipe `.data/`, run `mise run up`, and bots, memory and workflows are back.

### Phase 4 — Panel
Launcher, health dots, Bot API chat, snapshot button, and the app `_template`.
**Exit:** one login gives access to every app and to the chat with the Run Operator.

### Phase 5 — Builder (dogfooding)
`dev-task` with herdr and the Builder bot.
**Exit:** the Builder ships a real small issue to the template repo through a PR.

### Phase 6 — Deploy and template lifecycle
VPS guide, optional `compose.yaml`, Copier `_migrations`, template CI.
**Exit:** `copier update` vN → vN+1 applies cleanly to a sample project.

## 11. Risks

| Risk | Mitigation |
|---|---|
| OMB and Dagu release very often | Pin versions in `mise.toml`; upgrade deliberately with the CI smoke test |
| herdr is macOS-only or not redistributable | The Builder stays local, or falls back to an OMB bot with a worktree `cwd` |
| Subscription limits shared by all bots | Mix models per bot; send the chatty ones to API keys |
| Secrets in memory or commits | OMB redaction + gitleaks before every snapshot commit |
| `admin/admin` exposed on a server | `doctor` fails on a public domain if the password was not changed |
| Hourly commits add noise to history | Commit only when something changed; squash or filter later if it bothers |
