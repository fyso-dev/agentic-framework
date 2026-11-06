# Fyso Agentic Framework — Implementation Plan

Status: **draft for review** · Date: 2026-11-05 · No code written yet.

Brand: **Fyso**. "Fyso Agentic Framework" is a working name; the final product name comes later. The panel, the docs and the generated projects use Fyso branding. The panel's visual design is produced in **Claude Design** from [docs/panel-spec.md](panel-spec.md); the implementation follows that design. `@fyso/ui` is not used.

## 0. Principle

> **Orchestrate existing software. Never reinvent the wheel. Always feel simple.**

Every piece of this framework is an existing tool, wired together with configuration files and a few small scripts. Custom code is allowed only when no existing tool does the job, and it must stay small: the panel SPA and some glue scripts. When in doubt, choose the option with fewer moving parts.

## 1. Goal

A reusable, versioned template for agentic projects. Each project gets:

| Need | Existing software |
|---|---|
| Conversational bots with memory | **OpenMausBot** (OMB) |
| Workflows, scheduling, run history | **Dagu** |
| Coding agents (Claude Code, Codex) run by workflows | **Dagu `harness.run`** |
| One entry point, routing, login | **Caddy** |
| Run all processes natively | **process-compose** |
| Pinned tool versions, env, tasks | **mise** |
| Encrypted secrets in git | **sops + age** (fnox kept as a later option) |
| Create projects and update them from the template | **Copier** |
| Secret scanning before commits | **gitleaks** |
| PRs | **gh** |
| Customization layer + launcher (the only real custom code) | small **Vite + React** SPA |

**Development tool, not runtime:** **herdr** is how humans and coordinating agents develop the framework in parallel (Claude and Codex in worktrees). Generated projects do not depend on it.

## 2. Decisions log

Append-only. A superseded decision stays, marked with what replaced it.

| # | Decision |
|---|---|
| D1 | Native runtime: **mise + process-compose**. Docker Compose is optional, for deployment only |
| D2 | Bots can use **subscription CLIs** and **API keys**, per bot (native OMB team file) |
| D3 | Secrets: **sops + age**, loaded into the env by mise. No custom secret layer. *Compared with fnox in Phase 0 (D16)* |
| D4 | **Configure in the apps, the framework records to git.** A snapshot job saves everything to git. *Refined by D13: structural bot config goes through the customization layer* |
| D5 | Snapshot: **one scheduled commit straight to the current branch, no PRs**. It includes the complete memory folder |
| D6 | ~~Front chat uses the OMB Bot API only~~ *Superseded by D14* |
| D7 | Distribution: **Copier**, semver tags on the template repo |
| D8 | Initial bots: **Workflow Architect**, **Run Operator**, **Builder** (dogfooding) |
| D9 | ~~herdr core runs coding agents from `dev-task`~~ *Superseded by D15* |
| D10 | One gateway (Caddy) with one subdomain per app. The native OMB and Dagu UIs are first-class apps |
| D11 | Login: **local `admin` / `admin`** via Caddy basic auth (password from secrets). Extended later with existing tools (Authelia, Pocket ID, oauth2-proxy) |
| D12 | **Simple i18n from day one**: `i18next` + `react-i18next` with one JSON file per locale (`es` default, `en`). Dates, relative times and numbers use the browser's built-in `Intl` APIs |
| D13 | **Customization layer over OMB.** The panel is for the person customizing the project; they then use OMB as-is. See §9 for its 4 rules |
| D14 | **No chat in the panel.** Users chat in OMB's own UI. The Bot API is not used for now |
| D15 | **The Builder runs coding agents with Dagu `harness.run`**, not herdr. herdr is a development tool only |
| D16 | **fnox is evaluated against sops** in Phase 0; the winner becomes the secrets tool |
| D17 | **Extensions are Copier templates that fill fixed slots.** Bot tools are **MCP servers**, bot skills are **Agent Skills** (`SKILL.md`), and bot packs use the **OMB team package** format. NetBird is documented as the reference example; it is not built for now. See §12 |
| D19 | **Dagu login = basic auth with the same credentials as Caddy**, Dagu bound to `127.0.0.1`. Trusted-header proxy auth needs a paid Dagu SSO license (spike `gateway`). The browser asks once; Caddy validates and forwards the same `Authorization` header |
| D20 | **D16 resolved: sops + age.** Both passed a real round trip through mise; sops is more mature. fnox stays an option for 1Password/Vault later (spike `tooling`) |
| D21 | **Pinned, tested versions:** Dagu `2.24.0`, OpenMausBot `0.1.140`, Node `24`. Policy: pin releases at least a week old, and re-run the spike checks before bumping |
| D22 | **OMB is not behind the gateway login.** Its own device pairing protects it, and a basic-auth header could clash with its own auth. Locally the panel links to `http://127.0.0.1:<omb port>`, where OMB trusts the owner and no pairing is needed |
| D23 | **Local by default:** Caddy binds `127.0.0.1` unless `FYSO_BIND` is set (a server). `admin/admin` is never reachable from the LAN by accident |
| D18 | **Multi-host = a host is an SSH alias.** One control host keeps all state; execution hosts run Dagu workers and OMB bot computers, both reached over SSH. No mesh, no open ports, no cluster scheduler. See §13 |

## 3. Architecture

```
                         Browser
                            │  login: admin / admin (Caddy basic_auth)
                ┌───────────▼────────────┐
                │        Caddy           │  routes · login · read-only config files · Dagu API passthrough
                └─┬──────────┬─────────┬─┘
      panel.<host> │  dagu.<host> │ omb.<host> │ <app>.<host>
                   ▼          ▼         ▼           ▼
           Panel SPA       Dagu UI    OMB UI     project apps
      (customization +     (native)   (native)   (project/apps/*)
          launcher)
              │ every action = a Dagu workflow (setup-*, snapshot)
              ▼
   OpenMausBot ── MCP (/mcp) ──▶ Dagu ── dev-task (harness.run: claude / codex)
                                  │
                                  └── snapshot (hourly) ──▶ git commit (+ push)
```

- **There is no backend to write.**
  - **Caddy** handles the routing (one subdomain per app; `*.localhost` in dev, `*.<domain>` with automatic HTTPS on a server) and the login (`basic_auth`). It also serves the project's config files read-only to the panel, and passes Dagu API calls through.
  - **Dagu login (D19):** Dagu uses basic auth with the same `admin` credentials as Caddy and listens only on `127.0.0.1`. The browser asks once and Caddy forwards the same header, so there is no second prompt and Dagu cannot be reached without going through Caddy.
  - **OMB** keeps its own device pairing and opens in a new tab.
  - **Every panel action is a Dagu workflow** started with parameters. Dagu does the work, keeps the logs and allows retries. The same workflows run from the terminal with `mise run …`.
- **OMB and Dagu are coupled in only one place:** OMB reaches Dagu through Dagu's built-in MCP server (`.mcp.json` in the bot `cwd`).

### 3.1 Isolation: every project runs its own instances

A project must never touch the user's own Dagu or OMB, nor another project's. Everything is isolated through settings the tools already have, all set in `mise.toml` `[env]`:

| Tool | Data isolation | Port isolation | Trap to avoid |
|---|---|---|---|
| Dagu | `DAGU_HOME=.data/dagu`, `DAGU_DAGS_DIR=project/workflows` | `DAGU_PORT`, `DAGU_COORDINATOR_PORT`, `DAGU_COORDINATOR_HEALTH_PORT`, `DAGU_SCHEDULER_PORT`, `DAGU_WORKER_HEALTH_PORT` | The coordinator defaults to `:50055` and collides with any other Dagu |
| OMB | `openmausbot serve --data-dir .data/omb` | `OMB_PORT`, `OMB_WEBHOOK_PORT` | **The CLI auto-discovers ports 8799/18799/28799**, which are the user's desktop app. Always export `OPENMAUSBOT_URL` / `OMB_PORT`, and never use those ports |
| Caddy | `.data/caddy` (`XDG_DATA_HOME`/`XDG_CONFIG_HOME`) | Unprivileged HTTP port; `admin localhost:<port>` instead of the default `:2019` | — |
| herdr (dev only) | Its own named session: `herdr --session <name>` | its own socket | Never drive the user's default session |

**What is shared on purpose:** the `claude` / `codex` CLI logins (the subscription). Bot transcripts and memory stay inside `.data/omb`.

**Environment hygiene (spikes `omb`, `harness`):**
- **OMB:** every variable in the `openmausbot serve` environment reaches the bots' `claude` processes, and bots have a shell. Start `serve` with only the secrets bots may see.
- **Dagu:** start it with a cleared environment (`HOME`, `PATH`, locale and `DAGU_*` only). Subscription logins reach the CLIs through `HOME` (macOS keychain, `~/.codex/auth.json`), not through env vars.
- **"Is this our instance?"** check: `openmausbot doctor --json` returns `server.environmentId`, which must match `<data-dir>/environment-id`.

**Port block.** Each project gets a base port from Copier (`port_base`, default `8400`) and fixed offsets:

| Offset | Service | Offset | Service |
|---|---|---|---|
| +0 | Caddy (`http://panel.localhost:8400`, `dagu.localhost:8400`, …) | +5 | OMB webhook receiver |
| +1 | Dagu UI/API | +6 | Dagu coordinator |
| +2 | Dagu scheduler | +7 | Dagu coordinator health |
| +3 | Dagu worker health | +8 | Caddy admin |
| +4 | OMB | +9 | Panel dev server |

Two projects (or a project and its spikes) run side by side by using different blocks. `mise run doctor` checks that the ports are free before `up`, and checks that `OPENMAUSBOT_URL` answers with this project's data dir, not the user's desktop.

## 4. Repository layout (Copier)

```
agentic-framework/                    # template repo, tagged vX.Y.Z
├── copier.yml                        # questions, _skip_if_exists, _migrations, _tasks
├── docs/
├── tests/                            # renders a project and runs a smoke test (CI)
└── template/
    ├── mise.toml.jinja               # pinned tools, secrets env, tasks (up, down, doctor, auth, snapshot, restore)
    ├── process-compose.yaml          # dagu, omb, caddy, panel  (+ project/apps/*/process.yaml merged)
    ├── Caddyfile                     # core routes  (+ import project/apps/*/Caddyfile)
    ├── secrets file (sops or fnox)
    ├── .mcp.json                     # Dagu MCP for bots and for humans' agents
    ├── AGENTS.md / CLAUDE.md
    ├── framework/                    # OWNED BY TEMPLATE (updated by copier update)
    │   ├── panel/                    # Vite + React SPA: customization layer + launcher
    │   ├── workflows/                # framework DAGs: setup-*, snapshot, dev-task
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
- **Secrets:** an encrypted file edited with `sops` (or `fnox`). mise exports the values as env vars and every tool reads them from there.
- **Template choices:** `.copier-answers.yml`.

## 6. Versioning — the simple model

**Rule:** structural bot config comes from the customization layer (git → OMB). Day-to-day tuning happens in the apps and the framework records it (apps → git).

One Dagu DAG, `snapshot`, runs **every hour**, on demand from the panel, and **before every apply** from the customization layer. It skips the commit when nothing changed. Steps:

1. `openmausbot team export` → `project/bots/` (bots tuned in the OMB UI). The export always includes OMB's default `MausBot`, so `team.yaml` lists it too (with `computer: off`).
2. Copy each bot's memory folder (`MEMORY.md`, topics, logs) → `state/memory/<bot-name>/`, mapping botId → name with `openmausbot bots --json`. Daily logs (`memory/log/`) quote the start of user messages, so they always go through gitleaks.
3. `project/workflows/` already holds what Dagu edited, so there is nothing to export.
4. `gitleaks protect --staged` → `git commit -m "snapshot: <date>"` → `git push` if a remote is set.

No PRs and no branches for snapshots. The only PRs are the Builder's code changes (§7).

**Replicating a project** is `git clone` → `mise install` → `mise run up`. On a fresh data directory, `up` runs, in this order: `team apply`, then `restore-memory` (copies `state/memory/<bot-name>/` back by bot name; OMB re-indexes memory files on its own), then the bots may take turns. Bots, memory and workflows come back. **Chat history is not replicated.**

**Workflows alternative:** Dagu Git Sync can commit and push edits made in its UI (spike `tooling`). It is not needed while `project/workflows/` is the DAGs dir inside the repo, but it is the option if Dagu ever runs against a separate clone.

## 7. Bots

| Bot | Default model | Uses |
|---|---|---|
| **Workflow Architect** | `claude/…` (subscription) | Dagu MCP + skill `dagu-workflows` |
| **Run Operator** | `claudeApi/…` (cheap) | Dagu MCP (read, retry, stop) |
| **Builder** | `claude/…` (subscription) | Dagu MCP (starts `dev-task`), `gh` |

**`dev-task`** is a Dagu DAG built only from existing pieces (verified in spike `harness`):

1. `action: git.worktree.add` on a `feat/<issue>` branch (`base` must be a branch name, not `HEAD`).
2. `action: harness.run` runs Claude Code (`claude -p`) or Codex (`codex exec`) in that worktree, with the issue as its task:
   - `working_dir` is built from env vars (e.g. `${REPO}/.data/wt/${DAG_RUN_ID}`). `${steps.*}` and `${params.*}` are **not** resolved there, and fail silently.
   - The safety flags are pinned in the DAG: Claude `permission-mode` + `allowed-tools`; Codex `sandbox` + `approval_policy="never"`; always `timeout_sec`.
   - Never `bare: true` for Claude, because it skips the keychain login.
3. **Change gate:** fail if the worktree has no diff. A refused permission still exits 0.
4. Project checks.
5. `gh pr create`, then `action: git.worktree.remove`.

Notes:
- The agent's final text becomes the step output and a run artifact. Run and step status are live, but stdout appears only when the step ends.
- The agents load the user's own CLI config (Claude MCP servers and plugins, Codex hooks and skills). Limiting that for the Builder (`--strict-mcp-config`, Codex `ignore-user-config`) is a Phase 5 task, after checking that the logins survive it.

A human reviews and merges. The Builder never touches `main`. In the template repo, the Builder extends the framework itself.

## 8. Auth and health checks

- **`mise run auth`** uses the official CLIs:
  - `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, stored in the secrets file (or `claude /login` once).
  - `codex login --device-auth`.
  - `openmausbot engine set … --only-claude-api` for API keys.
- **Token caveat (spike `omb`):** `CLAUDE_CODE_OAUTH_TOKEN` takes precedence over the keychain login. An expired or wrong token breaks every Claude bot; there is no fallback. `doctor` must test it.
- **`mise run doctor`** runs the tools' own checks: `claude auth status`, `codex login status`, `openmausbot doctor`, and Dagu `/api/v1/health`. On a non-localhost domain, it also fails when the password is still `admin`. Its result is also a Dagu workflow output, which the panel's checklist reads.
- **VPS:** the same stack, native, with process-compose under systemd as an unprivileged user. Subscriptions are used only through the official CLIs; projects that serve third parties use API keys.

## 9. Panel: customization layer + launcher (the only real custom code)

A small Vite + React SPA served by Caddy at `panel.<host>`. It is for **the person customizing the project**. Everyone else uses OMB and Dagu directly, with everything already set up.

**Its 4 rules (D13):**
1. **It is not a second OMB.** It only handles what OMB cannot know: which bots the project has and on which engine, their Dagu connection, engine auth, isolation and snapshots. It has no chat and no full bot editor.
2. **It writes to git and applies with the tools' own CLIs** (`team apply`, `engine set`). It has no database.
3. **Every action is a Dagu workflow** (`setup-bots-apply`, `setup-auth-check`, `snapshot`, …) started with parameters. It reads files through Caddy (read-only) and run results through the Dagu API.
4. **Snapshot before apply.** Changes made in the OMB UI are exported to git before the layer applies its own, so nothing is lost.

**Screens:**
- **Setup checklist (home):** engines authenticated, bots applied, bots connected to Dagu, last git save. Each item has its state and a fix action.
- **Bots:** a simple form over `team.yaml` (name, role, engine, model, base instructions, skills). Saving shows the `team apply --dry-run` plan first, then applies.
- **Apps:** launcher tiles from `project/apps/*/app.yaml` plus the built-ins (Dagu, OMB), with health. They open in a new tab.

**i18n (D12):**
- Every UI string is a key in `framework/panel/src/locales/<lang>.json`. Spanish is the default and English ships too.
- The language comes from the browser, can be changed with a selector, and the choice is remembered in `localStorage`.
- Plurals use i18next's built-in plural rules. Dates and relative times use `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat`.
- Adding a language is adding one JSON file.
- App tiles (`app.yaml`) may declare `name` and `description` per locale, with a fallback to the default.

**What the panel does NOT do:** chat, edit workflows, edit secret values, or manage users.

## 10. Phases

### Phase 0 — Spikes ✅ done — see [adr/0001-spikes.md](adr/0001-spikes.md)
1. Does OMB pass `CLAUDE_CODE_OAUTH_TOKEN` (any env var) to `claude`?
2. Can mise pin `dagu`, `process-compose`, `openmausbot`, `caddy`, `sops`, `fnox` and `gitleaks`?
3. Can Dagu `harness.run` run Claude Code and Codex on a subscription, inside a given worktree directory, and return the result?
4. Does Dagu `/mcp` work from a bot's `.mcp.json`, and does Dagu proxy auth work behind Caddy?
5. Does the OMB UI work behind Caddy on a subdomain (SSE, cookies on `*.localhost`)?
6. Does `team export` → `team apply` round-trip with no changes, and is `team apply --dry-run` usable as a preview?
7. Can memory be mapped and restored by bot name?
8. fnox vs sops: providers, mise integration, maturity. Pick one.
9. Can Dagu Git Sync publish changes back to git, or only pull?
10. The panel's no-backend pattern: Caddy serves config files read-only, and the panel starts a Dagu workflow with parameters and reads its outputs.

**Exit:** `docs/adr/0001-spikes.md` and this plan updated.

### Phase 1 — Run it ✅ done
`copier.yml`, `mise.toml`, `process-compose.yaml`, `Caddyfile` with `admin/admin`, secrets init, `mise run up/down/doctor`.
**Exit:** after `copier copy` → `mise install` → `mise run up`, the Dagu and OMB UIs open behind one login.

**Result (2026-11-05):** `uvx copier copy` → `mise install` (8 tools, ~2 min, **full signature verification on**) → `mise run setup` → `mise run up` (ready in ~30 s, ~6 s warm) → `mise run doctor` all green. Verified:
- **Gateway:** panel and Dagu return 401 without login and 200 with it, and the Dagu API works through the gateway with one login.
- **Instance:** OMB is confirmed as the project's own (`environmentId`).
- **Ports:** only the project's block is used; the user's Dagu on `:50055` is untouched.
- **Workflows:** a workflow ran via the API with params and outputs.
- **Updates:** `copier update` applied a framework change and left `project/` and `secrets.enc.yaml` intact.

Implementation notes:
- **process-compose socket:** it lives in `/tmp/fyso-<slug>-<port>.sock`, because Unix socket paths are limited to ~104 characters on macOS.
- **Clean environments:** each process starts through a script that clears the environment. OMB only gets `BOT_*` secrets.
- **Secrets file:** mise tolerates a missing `secrets.enc.yaml` before `setup` runs.
- **Redaction:** mise redacts any value equal to a secret in task output, so `admin` shows as `[redacted]` while the password is still the default (cosmetic).

### Phase 2 — Bots
The team file with the 3 bots (the Builder inactive until Phase 5), `mise run auth`, Dagu MCP and the `dagu-workflows` skill.
**Exit:** asking the Architect for a workflow produces a DAG that runs in Dagu.

### Phase 3 — Snapshot and replicate
The `snapshot` DAG, `restore-memory`, gitleaks.
**Exit:** wipe `.data/`, run `mise run up`, and bots, memory and workflows are back.

### Phase 4 — Panel
The `setup-*` workflows, setup checklist, bots form with dry-run preview, launcher, and the app `_template`.
**Exit:** a person customizes the bots from the panel, the changes land in git and are applied, and OMB opens with everything set up.

### Phase 5 — Builder (dogfooding)
`dev-task` with `harness.run` and the Builder bot.
**Exit:** the Builder ships a real small issue to the template repo through a PR.

### Phase 6 — Deploy and template lifecycle
VPS guide, optional `compose.yaml`, Copier `_migrations`, template CI.
**Exit:** `copier update` vN → vN+1 applies cleanly to a sample project.

### Phase 7 — Extensions
Slot conventions, the `framework/extensions/_template` Copier template, a minimal sample extension used as a test fixture, and the panel's Extensions view. NetBird stays documented (§12.1) but is not built.
**Exit:** `copier copy` of the sample extension adds a working, health-checked tool to a project, and `copier update` upgrades it.

### Phase 8 — Multi-host
Execution hosts (§13): `hosts.yaml`, `mise run host:add`, the reverse SSH tunnel, the Dagu worker service, OMB self-hosted VPS computers, and the per-host doctor.
**Exit:** a second VPS joins with `mise run host:add`; a DAG pinned to its label runs there with its logs visible on the control host, and a bot uses it as its computer.

## 11. Risks

| Risk | Mitigation |
|---|---|
| OMB and Dagu release very often | Pin versions in `mise.toml`; upgrade deliberately with the CI smoke test |
| Two places configure bots (panel and OMB UI) | Panel = structure, OMB = tuning; snapshot before every apply (D13 rule 4) |
| ~~`harness.run` does not cover the Builder's needs~~ | Closed: verified in spike `harness` |
| A coding agent "succeeds" without doing anything (refusal exits 0) | Change gate in `dev-task` |
| mise installs only passed with signature checks disabled, inside Codex's sandbox | Phase 1 re-installs with full verification outside any sandbox before adopting the pins |
| Subscription limits shared by all bots | Mix models per bot; send the chatty ones to API keys |
| Secrets in memory or commits | OMB redaction + gitleaks before every snapshot commit |
| `admin/admin` exposed on a server | `doctor` fails on a public domain if the password was not changed |
| Hourly commits add noise to history | Commit only when something changed; squash or filter later if it bothers |

## 12. Extensibility (D17)

Two kinds of extension, and both reuse existing mechanisms. Nothing here needs a plugin loader.

### 12.1 New tools and services (e.g. NetBird)

**An extension is a small Copier template**, kept in its own repo (e.g. `fyso-ext-netbird`). It is applied on top of a project:

```sh
copier copy gh:fyso/ext-netbird . --answers-file .copier-answers.netbird.yml   # install
copier update --answers-file .copier-answers.netbird.yml                       # upgrade
```

Copier natively supports several templates per project, each with its own answers file. The set of `.copier-answers.*.yml` files therefore **is** the list of installed extensions, already versioned in git. No registry is needed.

Each extension drops files into **fixed slots**. Each slot is read by a tool that already merges multiple files:

| Slot | File the extension adds | Read by |
|---|---|---|
| Tool versions, env, tasks | `.config/mise/conf.d/<ext>.toml` *(to verify)* | mise |
| Processes | `extensions/<ext>/process.yaml` | process-compose (multiple `-f`) |
| Routes | `extensions/<ext>/Caddyfile` | Caddy (`import extensions/*/Caddyfile`) |
| Panel tile | `extensions/<ext>/app.yaml` | panel launcher |
| Health check | `extensions/<ext>/doctor.sh` | `mise run doctor` (runs each one) |
| Secrets it needs | `extensions/<ext>/secrets.yaml` (names only) | panel checklist + doctor |
| Workflows | `project/workflows/ext-<ext>-*.yaml` | Dagu |
| Reusable workflow steps | A **Dagu third-party action** (`action: owner/repo@version`, a repo with a `dagu-action.yaml` manifest), published by the extension | Dagu (Dagu also ships these to distributed workers) |
| Bot tools | an MCP server entry (§12.2) | OMB / Claude Code |
| Bot know-how | `extensions/<ext>/skills/<name>/SKILL.md` | OMB (team file `skills:`) |

`framework/extensions/_template` is the Copier template for writing new extensions. It works like `apps/_template`, one level up. Removal is manual: delete the slot files and the answers file. Copier has no uninstall.

**Worked example: NetBird.** NetBird is a WireGuard mesh VPN, here for private remote access to a project.
- **Simplest variant:** NetBird's hosted control plane plus the client. Self-hosting its management server is a later option.
- **Files:**
  - `conf.d/netbird.toml` pins the `netbird` client;
  - `secrets.yaml` declares `NETBIRD_SETUP_KEY`;
  - `process.yaml` runs `netbird up` with the setup key;
  - `doctor.sh` runs `netbird status`;
  - `app.yaml` is a tile linking to the NetBird dashboard;
  - the Caddyfile snippet binds the gateway to the NetBird interface instead of a public address;
  - an optional `netbird-ops` skill teaches the Run Operator how to check peers.

### 12.2 Bot capabilities

Use the standards OMB, Claude Code and Codex already support, in this order of preference:

| Need | Existing mechanism | Where it lives |
|---|---|---|
| Connect a SaaS app (Gmail, GitHub, Slack…) | **Composio**, built into OMB | OMB UI; no files |
| A tool for an external system | **An existing MCP server**, found in the official MCP Registry or the vendor's own | Project `.mcp.json` (the bot `cwd`); per-bot selection with the team file `tools: { allow: [mcp:<server>:*] }` |
| A tool with no MCP server yet | Wrap the system's CLI/API as a small MCP server, as the extension's custom code | Shipped by an extension |
| Procedural know-how ("how we deploy", "how to write a Dagu DAG") | **Agent Skills** (`SKILL.md` folders), an open format shared by OMB, Claude Code and Codex | `project/bots/skills/`, or shipped by extensions; listed per bot in `team.yaml` |
| A whole set of bots | **OMB team packages** (Markdown + YAML frontmatter, BotMRR / `openmausbot-teams` format), or our `team.yaml` | `project/bots/` |

Rules:
- Prefer an existing MCP server or skill over writing one.
- Pin external skills and MCP servers to a version or commit, never to `latest`.
- MCP tools keep OMB's approval cards. The `team.yaml` `tools` selection limits which bots see which servers.
- Skills from outside the project go through OMB's built-in scan (it switches off suspicious skills) and a human review before they are enabled.

### 12.3 To verify (before Phase 7)

1. Does mise load project-level `conf.d/*.toml` fragments, and from which path?
2. Does Dagu read DAGs from subdirectories, or is the `ext-<ext>-` filename prefix needed?
3. Does an MCP server exist for NetBird (official or community), or would the extension wrap its API?
4. Is there a CLI to install Agent Skills from a catalog that we can pin, or are skills copied by git commit?
5. How does Copier behave when several templates touch the same file (for example `.gitignore`)? Slots must avoid shared files.

## 13. Multi-host (D18)

**Maximum simplification: a host is an SSH alias.** The control host is the project; every other host is only a place to **run** things. Each tool reaches it with its own native mechanism, and **SSH is the only link between hosts**: no mesh, no open ports, no cluster software.

### 13.1 Topology

```
            Control host (the whole project, as today)
  ┌─────────────────────────────────────────────────────────┐
  │ Caddy · panel · OMB · Dagu server · git · snapshot      │
  │                                                         │
  │ process-compose keeps one `ssh -N -R` tunnel per host ───┼──┐
  └─────────────────────────────────────────────────────────┘  │  SSH only
                                                               ▼  (alias in ~/.ssh/config)
                        Execution host  "vps-eu"   (Linux + SSH + Docker)
                        ┌───────────────────────────────────────────────┐
                        │ dagu worker  → coordinator via the tunnel     │  Dagu: runs workflows here,
                        │               (localhost only, labels: eu)    │        routed by label
                        │ OMB bot computers (Cua containers)            │  OMB: bots use this machine,
                        │  ← OMB drives them with `docker -H ssh://`    │       "Bring your own VPS"
                        └───────────────────────────────────────────────┘
```

| Tool | Native multi-host mechanism | What runs on the execution host |
|---|---|---|
| **Dagu** | **Distributed workers**: they poll the coordinator over outbound gRPC and are routed by labels; logs and status flow back | `dagu worker`, pinned via mise. It reaches the coordinator at `localhost` through the reverse SSH tunnel |
| **OMB** | **Bring your own VPS**: the agent stays on the control host; OMB gives each bot a managed desktop container on the VPS over `docker -H ssh://<alias>`. It never opens a port and never runs an agent remotely | Docker; OMB manages the containers |

Everything with state stays on the control host: OMB and its data, the Dagu server, git, the snapshot and secrets. Replication (§6) does not change.

### 13.2 Adding a host

```sh
# 1. once, by hand: an SSH alias that works without a password
#    (~/.ssh/config: Host vps-eu …; the user is in the docker group on the VPS)
# 2. declare it
#    project/config/hosts.yaml:  - { alias: vps-eu, labels: [eu], omb_computer: true }
# 3. bring it up
mise run host:add vps-eu
```

`host:add` is a small glue task that only calls existing tools over SSH:
1. installs mise and the pinned `dagu` on the host,
2. starts `dagu worker` as a user service with its labels, pointed at `localhost:<coordinator port>`,
3. adds the reverse tunnel to the control host's process-compose, restarted automatically if it drops,
4. checks `docker info` for OMB.

Registering the alias in OMB (Settings → Self-hosted VPS) may stay a manual step; to verify.

Workflows choose the host with Dagu labels (`workerSelector`). Bots choose it with OMB's computer setting, `computer: cloud` with the self-hosted VPS backend.

`mise run doctor` checks, per host: SSH alias reachable, tunnel up, worker visible in Dagu with its labels, and Docker reachable for OMB.

### 13.3 What makes it simple

- **One credential type, SSH,** reused by both tools. OMB already requires it for its VPS feature.
- **No inbound ports on any host.** The control host dials out over SSH, and the worker reaches the coordinator through that tunnel.
- **No mesh required.** NetBird or Tailscale (extension, §12.1) become optional, for when hosts cannot be reached over SSH directly.
- **Execution hosts are disposable.** They hold no project state, so a lost host is re-added with `host:add`.

### 13.4 Deliberately not included

- **No cluster scheduler** (Nomad, k3s, Swarm). Services stay on the control host; only execution spreads. Revisit only if a project must run its own apps on several hosts, with Nomad as the candidate because it runs native processes.
- **No OMB high availability.** One OMB per project. A failed control host is recovered by replicating from git (§6).
- **No VPS provisioning.** Creating the server and its SSH access stays manual or uses the provider's CLI.
- **Coding agents on execution hosts.** `harness.run` on a worker would need a CLI login on that host. By default, agent steps carry the `control` label and run on the control host. If a project needs them elsewhere, it uses API keys there (§8 terms).

### 13.5 To verify (before Phase 8)

1. Dagu worker: env vars, labels, `workerSelector` syntax; a worker reaching the coordinator through a reverse SSH tunnel on localhost.
2. OMB self-hosted VPS: can the alias be set from a file or CLI, or only in Settings? Requirements on the VPS (x86_64, Docker).
3. process-compose: is the restart policy enough for the tunnel, or is `autossh` needed?
4. Do process-compose role fragments work (`-f` per role)?
