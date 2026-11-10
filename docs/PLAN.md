# Fyso Agentic Framework — Implementation Plan

Status: **Local runtime, Builder, observability and Bot Architect verified; remote PR deferred by the user** · Updated: 2026-11-06.

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
| D11 | *Superseded by D40.* Login: **local `admin` / `admin`** via Caddy basic auth (password from secrets). Extended later with existing tools (Authelia, Pocket ID, oauth2-proxy) |
| D12 | **Simple i18n from day one**: `i18next` + `react-i18next` with one JSON file per locale (`es` default, `en`). Dates, relative times and numbers use the browser's built-in `Intl` APIs |
| D13 | **Customization layer over OMB.** The panel is for the person customizing the project; they then use OMB as-is. See §9 for its 4 rules |
| D14 | **No chat in the panel.** Users chat in OMB's own UI. The Bot API is not used for now |
| D15 | **The Builder runs coding agents with Dagu `harness.run`**, not herdr. herdr is a development tool only |
| D16 | **fnox is evaluated against sops** in Phase 0; the winner becomes the secrets tool |
| D17 | **Extensions are Copier templates that fill fixed slots.** Bot tools are **MCP servers**, bot skills are **Agent Skills** (`SKILL.md`), and bot packs use the **OMB team package** format. NetBird is documented as the reference example; it is not built for now. See §12 |
| D19 | *Browser login superseded by D40; technical Basic auth retained.* **Dagu login = basic auth with the same credentials as Caddy**, Dagu bound to `127.0.0.1`. Trusted-header proxy auth needs a paid Dagu SSO license (spike `gateway`). The browser asks once; Caddy validates and forwards the same `Authorization` header |
| D20 | **D16 resolved: sops + age.** Both passed a real round trip through mise; sops is more mature. fnox stays an option for 1Password/Vault later (spike `tooling`) |
| D21 | **Pinned, tested versions:** Dagu `2.24.0`, OpenMausBot `0.1.140`, Node `24`. Policy: pin releases at least a week old, and re-run the spike checks before bumping |
| D22 | *Superseded by D25.* **OMB is not behind the gateway login.** Its own device pairing protects it, and a basic-auth header could clash with its own auth. Locally the panel links to `http://127.0.0.1:<omb port>`, where OMB trusts the owner and no pairing is needed |
| D23 | *Refined by D40: HTTP startup now rejects non-loopback binding.* **Local by default:** Caddy binds `127.0.0.1` unless `FYSO_BIND` is set (a server). `admin/admin` is never reachable from the LAN by accident |
| D18 | **Multi-host = a host is an SSH alias.** One control host keeps all state; execution hosts run Dagu workers and OMB bot computers, both reached over SSH. No mesh, no open ports, no cluster scheduler. See §13 |
| D24 | **Builder publication is explicit:** `PUBLISH=false` by default; `true` requests push to `origin` and a PR, and publication errors fail the run. Failed worktrees stay available for inspection. This refines §7 without changing snapshot behavior (D5) |
| D25 | **OMB browser access uses the authenticated gateway.** The packaged 0.1.140 server requires a browser session even on loopback. Caddy obtains a native OMB session with `openmausbot connect`, keeps its token server-side, and injects its bearer after project basic auth. Cross-origin and cross-site API requests are rejected. Supersedes D22; direct CLI access remains project-local |
| D26 | **Observability before deployment (Phase 5.5):** native OMB usage/traces + Dagu runs remain authoritative. A scheduled read-only Dagu exporter writes a private, rebuildable panel summary. Structured harness output fills the CLI usage gap; API-reported cost, subscription equivalent, estimates and unknown values stay separate. Project-owned thresholds generate local advisory alerts; no external telemetry service or automatic stop |
| D27 | **Bot CRUD is conversational through Bot Architect.** A single Dagu workflow wraps OMB native partial team plans/apply and exact-ID DELETE (no prune). Plans are private, content-addressed, stale-checked and applied idempotently; snapshots surround mutations. Only the selected bot's project entry changes. The manual panel stays available; default Bot Architect uses Codex subscription |
| D28 | **Panel bot discovery reads the native live roster.** An exact GET-only gateway route forwards OMB `/api/bots?messages=0`; the panel polls every five seconds and includes the chief and OMB-created bots. One list joins the live roster with configuration and pending drafts; discovery never overwrites drafts. This adds visibility, not automatic reconciliation of native profiles into project declarations |
| D29 | **Native import and Git evidence stay explicit.** One bot roster distinguishes committed project declarations, committed native snapshots, and native-only profiles. A GET-only metadata file reports names from Git HEAD, never profile contents. Import uses the existing Bot Architect workflow to export one exact native ID and commit its native profile plus imported skill files, without runtime writes. Dirty project declarations, ambiguous names and local panel drafts block import. Existing defaults are materialized when needed to preserve effective profiles without unwanted inheritance |
| D30 | **Extension contract (Phase 7) closes the gaps in D17.** Each extension owns its answers file (`_answers_file: .copier-answers.ext-<ext>.yml`) and only the slot paths in [extensions-contract.md](extensions-contract.md); it never edits a file another template owns. `.mcp.json` becomes a generated file (framework + project + extensions sources in git), because a single template-owned file cannot be extended without conflicts and was overwritten by `copier update`. Extension processes start through `run-ext.sh`, which passes only `FYSO_*` and the secret names the extension declares (D40 excludes the reserved `FYSO_AUTH_*` namespace). Extensions use a second port block (`port_base+10…+19`). Thin `mise run ext:*` tasks wrap Copier; the panel lists extensions read-only |
| D31 | **Extension marketplace: catalogs are git repos, versions are tags.** Discovery is a `marketplace.yaml` in a git repo (official: `gh:fyso-dev/fyso-extensions`); `project/marketplaces.yaml` lists the catalogs a project uses. Versions are read live from each extension repo's tags. `ext:search` and `ext:add <id>` resolve ids; the panel installs and upgrades through the `fyso-ext-catalog` and `fyso-ext-install` workflows (install commits only the extension's slots, upgrade runs Copier in a clean worktree and fast-forwards, processes and routes load without a restart). Devbox plugins and self-hosted app stores were compared and do not replace this (Nix / Docker, no catalog or no merge). Bot integrations come from the MCP Registry and from extensions such as Activepieces. [ADR 0002](adr/0002-extension-marketplace.md) |
| D32 | **Engines are optional; the project picks one.** Copier asks for `engine` (`claude` or `codex`, default `claude`). It sets every bot's model in `project/bots/team.yaml`, the Builder's default `PROVIDER` and `fyso-dev-task`'s default. Doctor fails only when an engine used by a declared bot is not signed in, or when none is; any other engine is an optional warning. Projects switch engines by editing their team file. Refines D27's Codex default for Bot Architect |
| D33 | **Agent surface: the platform's own MCP server, separate from Dagu's.** `fyso` (stdio, no dependencies, `framework/scripts/fyso-mcp.cjs`) gives agents typed tools for what the panel does (status, checks, bots plan/apply/import, extension search/install, snapshot, observability); every change goes through the same Dagu workflows as the panel. Secrets, extension removal and stack start/stop stay terminal tasks. Separately, coding agents get Dagu's own MCP (`DAGU_MCP_AUTH` derived by mise) and Dagu's own skill pinned to the project's Dagu version (`mise run agent:setup`). [agent-surface.md](agent-surface.md) |
| D34 | **Menu bar app = a SwiftBar plugin, no native app.** [SwiftBar](https://github.com/swiftbar/SwiftBar) (MIT, `brew install --cask swiftbar`) shows what a script prints and refreshes it. `framework/tray/fyso.10s.py` (Python stdlib) lists every Fyso project running on the Mac, with no registry: each stack owns `/tmp/fyso-<slug>-<port>.sock` (process-compose), the folder is the cwd of the process holding it, names and app links come from `.data/panel/*.json`. Per project: health dot, Panel/Dagu/OMB/extension links, processes, open folder/terminal, restart and stop (second-level submenus). Projects seen running are kept in a rebuildable cache (`~/Library/Caches/fyso-tray`) and listed as stopped with Start. While an action runs the project shows its progress (refreshed at once), and a macOS notification reports the result; a failure stays visible with a link to `.data/logs/tray.log`. Actions run `mise run up/down` with the PATH the stack had, because process-compose children inherit the environment of `up` and SwiftBar's PATH lacks the engine CLIs. Stale sockets are shown and can be removed. `mise run tray:install` links the plugin into SwiftBar's plugin folder and remembers that project; one link from any project is enough. macOS only |
| D35 | **End-user installer: a macOS app that reuses swiftDialog and the Dagu CLI.** `Fyso Installer.app` (drag to Applications) shows a friendly window (swiftDialog, MIT, bundled) listing each dependency; the work is a Dagu workflow generated from the template's pinned tools and run with `dagu start` (no server, no UI), with a pinned mise bootstrap. No custom GUI. Signing/notarization and Windows/Linux are open. [installer.md](installer.md) |
| D36 | **Desktop agents connect to a project's `fyso` MCP with their own configuration tools.** `mise run agent:connect` registers `fyso-<slug>` (a plain `fyso` may already be another server) launched as `mise -C <project> exec -- node framework/scripts/fyso-mcp.cjs`: Claude Desktop by merging its JSON (backup kept, no CLI exists), Codex app and CLI through `codex mcp add` (they share `~/.codex/config.toml`), Claude Code CLI as an option through `claude mcp add --scope user`. Desktop apps first; the installer ends with this step. The Dagu MCP stays per project (`.mcp.json`). [agent-surface.md](agent-surface.md#3-connect-desktop-and-cli-agents-d36) |
| D37 | **Bot models follow what each engine offers.** Providers retire model names and OMB then rejects the whole team. `framework/scripts/team-models.cjs` moves a bot whose engine is available but no longer offers its model to that engine's default (from `openmausbot models`), editing only `model:` lines; `bots.sh apply` runs it first and commits the project file, and `mise run up` runs it on every start (also when the stack is already up), so `copier update` + `up` repairs existing projects. Startup applies only a partial team containing live bot names and replacement models; it never replays declaration profiles or recreates missing bots (initial creation belongs to snapshot restore). Engines not signed in are left alone. The template's fast Codex model is `gpt-6-luna` |
| D38 | **Linux graphical installer uses Qt Installer Framework, with Dagu retaining installation orchestration.** Reuse the framework wizard, progress and packaging instead of building a Zenity wizard lifecycle. Share pinned mise tools and the Copier/Dagu flow. Windows is proposed as a native Qt `.exe` delegating the runtime to WSL2 (initially Ubuntu), with explicit prerequisite/restart handling and separate Windows verification. Existing macOS swiftDialog delivery remains in place. Qt maintenance must preserve generated project data and Copier ownership. Linux Qt delivery and Windows support are not yet verified. [installer.md](installer.md#cross-platform-installer-direction--d38) |
| D39 | **Fyso Biz is an installable Copier extension with a native panel tab.** The framework owns navigation and the bundled installation workflow; the extension owns MCP, encrypted secret names and read-only Dagu adapters. Reuse Biz `contexto`, `listar_solicitudes` and `vision_objetivo` rather than implementing OKR or palanca logic. The token remains process-side; local panel access shares its owner’s scope. An idempotent extension connection hook creates Biz Partner through the native Bot Architect, with business context, project-root MCP access and ask approval; no direct team edits. Business mutations remain on the native Biz MCP. See [contract](fyso-biz.md). |
| D40 | **Local users and shared web sessions through native Tinyauth 5.2.0 + Caddy forward_auth.** Human credentials are encrypted native bcrypt entries; new Dagu technical credentials are random and separate. Project-and-port cookie domains isolate installations. App ACLs deny by default; cross-origin writes, identity spoofing and shared-cookie leakage to upstreams are blocked. Native OAuth/LDAP configuration provides future extensibility. Small build/config/user-management glue is allowed; no custom auth implementation or Caddy plugin. Supersedes D11 and the browser-login portion of D19/D25. Local HTTP remains loopback-only; remote HTTPS acceptance remains Phase 6. Native Dagu/OMB user isolation is not implied. [Contract](web-auth.md) |
| D41 | **Extensions own their tabs and pages; the framework only hosts them.** This supersedes the Biz-specific installation/page hosting assumed in D39. Installed native page declarations and static assets populate generic navigation and `#/extensions/<id>/<page>`, rendered through same-origin iframes with language/theme. An optional native ES-module panel SDK reuses existing React, UI and Dagu clients. No extension-specific screen, locale or route belongs in the core. Biz consumes this contract and creates its contextual bot through the native Bot Architect. See [extension pages](extensions-contract.md#9-extension-owned-tabs-and-pages). |
| D42 | **Composio connectors use explicit REST execution from Dagu.** A small Node adapter decrypts only `COMPOSIO_API_KEY` with SOPS inside each step, requires account/user/version and fails on tool-level errors. Native project DAGs and JSON inputs remain project-owned; no new service, SDK, scheduler or bot credential passthrough. Agent guidance ships in framework skills and default souls. No automatic write retries; live OAuth/provider acceptance remains pending. |
| D43 | **Connector management lives in the panel, backed by native OMB APIs.** The `Connectors` tab owns app discovery, account authorization, custom MCP creation/testing/toggling/removal and versioned per-bot MCP selection. Panel-created native definitions are persisted in `project/omb-mcp.json`, header values stay in SOPS and restore recreates definitions before bot selectors. A restricted same-origin Caddy proxy holds the OMB session and enforces origin/method checks before forwarding; the panel never sends credentials through Dagu. OAuth, account connections and MCP execution stay native OMB. Bot changes reuse the guarded Bot Architect preview/apply workflow. Replaces the initial link-out-only connector experience. See [connectors](connectors.md). |
| D44 | **Reuse OMB direct hosted MCP and native Claude preferences independently from Composio.** Mirror the pinned OMB Whop/Agentcard presets and their native OAuth flow. `fyso-connector-preferences` exposes only `claudeUserMcp` and `claudeUserSkills`, stores a native `{features: ...}` patch in project-owned `project/omb-connectors.json`, and restores it on `up`. Absence of that file never changes native settings. Personal configuration and skills are not copied into the project; tests never enable inheritance on the real host. See [connectors](connectors.md). |
| D45 | **Configure Composio in the panel using native SOPS and OMB activation.** A password field sends only the project key to a dedicated loopback setup adapter, never to Dagu. The adapter verifies project access with native Composio REST, updates only the encrypted SOPS key through stdin, versions that file and activates OMB through its native config API. The extra process is small glue because credential-bearing requests cannot use the Dagu history or a broad native config proxy. It uses a private Unix socket behind the existing web-session guard, gateway-held technical authentication, exact-origin checks and fixed API destinations; web login retains port `base + 9`. Native account OAuth and execution remain OMB. See [setup contract](connectors.md#guided-composio-setup-d45). |
| D46 | **Withdrawn on 2026-11-09 by user request; retained only as history.** Keep manual Composio setup first; offer native CLI login only as an experimental alternative. Pin official CLI 0.6.0 through mise. Reuse the dedicated setup adapter for native browser handoff and explicit organization/project selection with private project-local CLI state. Never report success from the CLI exit code alone; require an unmasked project key, verified encrypted save and OMB activation. The live trial authenticated and listed projects but exported a masked key, so it did not replace manual configuration. No unsupported key-creation API is used. [Live findings](adr/spikes/composio-cli.md). |
| D47 | **Manage native application access inside the panel.** OMB 0.1.141's strict team CLI schema excludes `composio`, `connectorScopes` and `connectorTools`. A narrow `fyso-app-access` workflow reads, previews and applies one exact bot through the native bot PATCH API. Native patch bodies plus native name/section identity are versioned in `project/bots/app-access/`, restored by stable identity after bot restoration and on `up`. Existing partial tool grants are preserved. The panel edits off/read/write without introducing another executor or permission policy. See [application permissions](connectors.md#application-permissions-in-the-panel-d47). |
| D48 | **Langfuse is an independent Copier extension that exports OMB's native traces over OTLP.** [fyso-ext-langfuse](https://github.com/fyso-dev/fyso-ext-langfuse) reads OMB `/api/usage/traces` (one engine-neutral record per conversation, the D26 source) from a scheduled Dagu workflow and posts Langfuse's native OTLP/HTTP JSON (`/api/public/otel/v1/traces`; the legacy `/ingestion` API is being retired). Rejected: Langfuse's per-engine Claude Code/Codex Stop hooks (template-owned `.claude/settings.json`, keys in every bot's environment, a pinned Python SDK, one mechanism per engine). Configuration is only Langfuse's standard variables in the encrypted secrets (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, optional `LANGFUSE_BASE_URL`, empty = Langfuse Cloud EU); the install asks no questions. Export is names, timing, tokens and cost only: no titles, tool details, prompts or replies, so there is no privacy switch. Keys are `LANGFUSE_*`, never `BOT_*`. No framework change was needed: conf.d, secrets, workflow, tile and doctor slots suffice. |
| D49 | **Bots as list + detail in three tabs, with one Save (B1.3).** Each bot opens in a detail with *Perfil* (name, role, engine/model, autonomy, activity), *Instrucciones* (Markdown editor) and *Conectores* (cards for project tools, MCP servers and Composio apps, plus an add picker). Icons carry the meaning; secondary text lives in tooltips. One *Guardar* writes the team.yaml draft (still applied with "Revisar y aplicar") and runs the existing `fyso-app-access` plan → apply for app grants in the same click; no new backend. `approval` (ask/full), already part of the OMB team format, becomes editable. Per-bot activity is aggregated in the browser from the existing `/config/observability.json` (traces by bot, usage groups by bot name), so it covers the snapshot window, not a fixed period. See [panel spec §3](panel-spec.md#3-bots). |
| D50 | **Extensions get guided setup of their declared secrets in the panel.** Supersedes the read-only extension list of D30. The form posts only to the existing private connector-setup adapter (D45: web-session gateway, Unix socket, exact origin), which accepts names from the installed extension's `secrets.yaml`, writes them with SOPS through stdin, commits only `secrets.enc.yaml`, then runs `ext.sh configured` (restart the extension's processes and hooks, refresh panel data, run its doctor). The form opens the provider's key page (optional HTTPS `url` per secret) and reads the `.env` block providers show after creating keys, so setup is open, copy, paste. No new process or port; `secrets.yaml` and `doctor.sh` already exist as slots. Values never pass through Dagu, arguments or replies. [Contract](extensions-contract.md#guided-setup-d50) |
| D51 | **Extensions can add a Setup step.** An optional `extensions/<ext>/setup.yaml` (title, description) adds a step to the panel's Setup checklist with the D50 form. `fyso-setup-check` decides its state like the other steps: pending while a required secret is empty, then the extension's own `doctor.sh` (done or failed). The checklist total follows the installed extensions. No new workflow, process or schema beyond the one optional file. [Contract](extensions-contract.md#setup-step-d51) |
| D52 | **"Maneja el proyecto desde tu IA": one-click only on the Dagu host; remote clients get a standard HTTP MCP with a token, later.** The panel page (`#/mcp`, linked from Setup, no longer in the menu) asks `fyso-agent-connect` for `MODE=status` (installed and connected, per agent) and offers *Conectar*, *Abrir conversación* (`agent-connect.cjs open`) and *Desconectar* per agent. These change the apps of the user that runs Dagu, so the actions show only when the panel is opened through a loopback name (`localhost`, `127.0.0.1`, `[::1]`, `*.localhost`); elsewhere the page says remote connection is not available yet. No SSH bridge. **Planned, not built:** the existing stdio server exposed over MCP Streamable HTTP by an off-the-shelf bridge (`mcp-proxy`) behind a Caddy route that requires `Authorization: Bearer <token>`, the token random per project in `secrets.enc.yaml`. Gated on Phase 6 HTTPS (D40 keeps HTTP loopback-only). Open: how the token reaches the person (shown once in the panel vs terminal only, given the panel never shows secret values) and Claude Desktop, whose remote connectors take OAuth, not a fixed token (`mcp-remote` shim or OAuth). [Agent surface §3](agent-surface.md#3-connect-desktop-and-cli-agents-d36) |
| D53 | **SilverBullet is an opt-in bundled knowledge extension.** Stable SilverBullet 2.12.1 serves the existing project-owned `project/wiki/`, already included in snapshots. The official filesystem MCP 2.2.0 exposes that same folder with `--confine-roots`; stable SilverBullet has no native MCP. No custom MCP, document schema or second copy. A small startup script seeds `index.md` only when absent. Single-space mode is deliberately used despite upstream deprecation to retain repo-owned configuration and the framework's web login; shell, Runtime API, service worker and separate revision storage are disabled. It ships inside the template (`framework/extensions/silverbullet`, installed by path) until it has its own repository and catalog entry (D31). Moving to multi-space/native MCP requires a new verified version and decision. See [extension contract and verification](silverbullet-extension.md) |
| D54 | **The panel switches extension skills per bot.** The bot detail lists the skills shipped by installed extensions (`extensions.json`) as toggles. A toggle adds one native OMB entry, `skills: [{ file: ${FYSO_ROOT}/extensions/<ext>/skills/<name>/SKILL.md }]`, in the draft `team.yaml`, and switches it off with the native `enabled: false` on that entry: OMB's team apply never removes a skill that the file leaves out. For a bot with a tool allow-list it also selects (on) or drops (off) the whole-server selector `mcp:<server>:*` of that extension's MCP servers, with the existing Connectors helpers, because a skill without its tools does nothing; Connectors shows and refines the result. The existing plan → apply → commit flow does the rest. Extensions still never edit `team.yaml` (D30): a person decides per bot. No new schema, workflow or script. The toggle needs the bot to run in the project root, where `.mcp.json` is loaded. Other skills stay read-only. Amends the "Skills: read-only in v1" note of Phase 4 |
| D55 | **Projects are shared as distributions: a Copier template published from a prepared project, one-way.** `dist:publish` exports the project's committed `project/**` (minus `distribution.yaml` and `auth/`), `state/bots/**`, installed extensions and bot memory (without daily logs) into a separate Git repository with a generated `copier.yml`, after gitleaks and the machine-path check, and tags `vN`. Clients install with `copier copy` and update with `copier recopy --force` (own answers file `.copier-answers.dist.yml`, like extensions in D30): the distribution's files replace local configuration, as the user decided; uncommitted local edits are kept as a patch in `.data/dist/`. Memory arrives in `state/dist/memory/` and the `fyso-dist-update` workflow merges it into each bot's own memory with `git merge-file --union` against the previous delivery (memory accumulates; no LLM merge). Secrets travel only when named in `project/distribution.yaml`, SOPS-encrypted for the clients' age public keys (`dist:key`) plus the publisher's; per-installation credentials are refused. Rejected: a Git fork with an `upstream` remote (mixes the client's memory and snapshots with the publisher's history and shares the publisher's whole repository); `copier update` (three-way merge with conflict markers, where the user wants the publisher to win). Clients do not send changes back yet; no panel UI yet. [Contract](distribution.md) |

## 3. Architecture

```
                         Browser
                            │  login: local users / shared Tinyauth session
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
  - **Caddy** handles the routing (one subdomain per app; `*.localhost` in dev, `*.<domain>` with automatic HTTPS on a server) and session authorization (`forward_auth` to native Tinyauth; D40). It also serves the project's config files read-only to the panel, and passes Dagu API calls through.
  - **Dagu login (D19, D40):** Dagu retains a technical Basic credential on loopback. Caddy injects it after native web-session authorization; browsers never receive it. No licensed native SSO is enabled.
  - **OMB** opens in a new tab behind the shared web session (D40). Caddy holds its native OMB session (D25); browsers need no pairing code.
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
| +4 | OMB | +9 | Native web login (D40) |

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

1. `openmausbot team export` → `state/bots/team.yaml` and required imported skill sidecars (bots tuned in the OMB UI). Ambient native CLI skills remain host-owned and are not copied. The export always includes OMB's default `MausBot`, so `team.yaml` lists it too (with `computer: off`).
2. Copy each bot's memory folder (`MEMORY.md`, topics, logs) → `state/memory/<bot-name>/`, mapping botId → name with `openmausbot bots --json`. Daily logs (`memory/log/`) quote the start of user messages, so they always go through gitleaks. Known home/project paths are normalized in the versioned copy only.
3. `project/workflows/` already holds what Dagu edited, so there is nothing to export.
4. Staged gitleaks and machine-path checks → `git commit -m "snapshot: <date>"` → `git push` if a remote is set.

No PRs and no branches for snapshots. The only PRs are the Builder's code changes (§7).

**Replicating a project** is `git clone` → `mise install` → `mise run up`. On a fresh data directory, `up` runs, in this order: `team apply`, then `restore-memory` (copies `state/memory/<bot-name>/` back by bot name; OMB re-indexes memory files on its own), then the bots may take turns. Bots, memory and workflows come back. **Chat history is not replicated.**

**Workflows alternative:** Dagu Git Sync can commit and push edits made in its UI (spike `tooling`). It is not needed while `project/workflows/` is the DAGs dir inside the repo, but it is the option if Dagu ever runs against a separate clone.

## 7. Bots

| Bot | Default model | Uses |
|---|---|---|
| **Workflow Architect** | project engine, strong model (subscription) | Dagu MCP + skill `dagu-workflows` |
| **Run Operator** | `claudeApi/…` (cheap) | Dagu MCP (read, retry, stop) |
| **Bot Architect** | project engine, strong model (subscription, D32) | Native OMB team plans through `fyso-bot-architect` |
| **Builder** | project engine, strong model (subscription) | Dagu MCP (starts `dev-task`), `gh` |

**`dev-task`** is a Dagu DAG built only from existing pieces (verified in spike `harness`):

1. `action: git.worktree.add` on a `feat/<issue>` branch (`base` must be a branch name, not `HEAD`).
2. `action: harness.run` runs Claude Code (`claude -p`) or Codex (`codex exec`) in that worktree, with the issue as its task:
   - `working_dir` is built from env vars (e.g. `${REPO}/.data/wt/${DAG_RUN_ID}`). `${steps.*}` and `${params.*}` are **not** resolved there, and fail silently.
   - The safety flags are pinned in the DAG: Claude `permission-mode` + `allowed-tools`; Codex `sandbox` + `approval_policy="never"`; always `timeout_sec`.
   - Never `bare: true` for Claude, because it skips the keychain login.
3. **Change gate:** fail if the worktree has no diff. A refused permission still exits 0.
4. Project checks.
5. With `PUBLISH=true`, push the feature branch to `origin` and run `gh pr create`; with `false`, return the local branch. Then `action: git.worktree.remove`. Failures preserve the worktree.

Notes:
- The agent's final text becomes the step output and a run artifact. Run and step status are live, but stdout appears only when the step ends.
- The agents load the user's own CLI config (Claude MCP servers and plugins, Codex hooks and skills). Limiting that for the Builder (`--strict-mcp-config`, Codex `ignore-user-config`) is a Phase 5 task, after checking that the logins survive it.

A human reviews and merges. The Builder never touches `main`. In the template repo, the Builder extends the framework itself.

## 8. Auth and health checks

Human web access follows [the local-user and shared-session contract](web-auth.md) (D40). Engine login below is independent.

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
- **Connect MCP:** Dagu actions connect or disconnect Claude Desktop, Codex and Claude Code using the installer’s native connector; session restart and tool verification remain guided steps.
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

### Phase 2 — Bots ✅ done
The team file with the 3 bots (the Builder inactive until Phase 5), `mise run auth`, Dagu MCP and the `dagu-workflows` skill.
**Exit:** asking the Architect for a workflow produces a DAG that runs in Dagu.

**Result (2026-11-05):** on the first `mise run up`, the bots are created from `project/bots/team.yaml`. Asked through `openmausbot run`, the Workflow Architect created `project/workflows/disk-report.yaml` with the Dagu MCP, applied it and ran it (`succeeded`). The file lands in the repo, ready to be versioned. `doctor` also checks bot drift (`team apply --check`).

Implementation notes:
- **No custom skill:** Dagu ships its authoring skill inside the binary and serves it over MCP (`dagu_references`). Bots use Dagu's own reference instead of a copy. This applies the reuse principle.
- **Paths and cwd:** `team.yaml` uses `${FYSO_ROOT}` for the absolute paths OMB requires; `bots.sh` substitutes it when applying. The bots' `cwd` is the project root, so they load `.mcp.json` (Dagu MCP), which developers' Claude Code also uses.
- **MausBot:** OMB's default bot is listed in `team.yaml`, so export and apply round-trip.
- **Dagu Wiki:** it lives in `project/wiki/` (`DAGU_WIKI_DIR`), not inside the workflows dir.
- **Deferred to Phase 5:** re-running the `harness.run` spike on Dagu 2.24.0.

### Phase 3 — Snapshot and replicate ✅ done
The `snapshot` DAG, `restore-memory`, gitleaks.
**Exit:** wipe `.data/`, run `mise run up`, and bots, memory and workflows are back.

**Result (2026-11-05):** a bot saved a fact to its memory, and the `fyso-snapshot` workflow (run by Dagu's scheduler) committed `state/bots/team.yaml` and `state/memory/<bot>/` after a gitleaks scan. Then `.data/` was deleted. On the next `mise run up`, the bots were recreated from the snapshot, the memory was restored by bot name, and the bot answered with the saved fact. The workflows were back as well.

Implementation notes:
- **Framework workflows inside the project:** Dagu reads one DAGs dir and does not follow directory symlinks. Each framework workflow lives in `framework/workflows/` (updated by the template) and is exposed through a **file symlink** `project/workflows/fyso-<name>.yaml`. This needs `DAGU_DAG_DISCOVERY_SYMLINKS=true`, and Copier keeps the links with `_preserve_symlinks: true`. New framework workflows get their link on `copier update`.
- **Env passed to steps:** Dagu passes only allowlisted env to steps. `DAGU_ENV_PASSTHROUGH_PREFIXES=FYSO_,OPENMAUSBOT_,ALLOW_INSECURE_HTTP` gives the framework workflows the project paths and ports, and no secrets.
- **Two bot files:**
  - `state/bots/team.yaml` is the runtime snapshot. Its paths are written back as `${FYSO_ROOT}` and the export timestamp is dropped, so diffs stay quiet.
  - `project/bots/team.yaml` stays the hand-written structure.
  - Restore prefers the snapshot, since it is the most complete picture.
- **`doctor`:** drift against `project/bots/team.yaml` is a warning, not a failure, because tuning in OMB is expected (D13).
- **`mise run snapshot`:** runs the same steps from the terminal.
- **To handle in Phase 4:** starting `fyso-snapshot` while another run is active fails (`max_active_runs: 1`), so the panel's "save now" must use Dagu's `enqueue` endpoint. Dagu also queued "catchup" runs for missed hours on a fresh data dir although the DAG sets no `catchup_window`. They are harmless (a snapshot with no changes commits nothing) but unexplained; to verify.

### Phase 4 — Panel ✅ done
The `setup-*` workflows, setup checklist, bots form with dry-run preview, launcher, and the app `_template`.
**Exit:** a person customizes the bots from the panel, the changes land in git and are applied, and OMB opens with everything set up.

**Result (2026-11-05):** built in parallel against [panel-contract.md](panel-contract.md). Claude built the SPA from the 17 Claude Design boards; Codex built the workflows, Caddy routes and config files. Verified on a generated project against the real stack:
- **Checklist:** it shows 4/4 with real data (Claude and Codex signed in, 2 bots applied, bots connected to Dagu, last save in git).
- **Apps:** the launcher shows Dagu and OMB with live health.
- **Edit flow, driven in a headless browser:**
  1. The person edits Run Operator's model.
  2. The preview shows OMB's plan line.
  3. "Apply" commits the snapshot first, then `bots: update from panel`.
  4. OMB shows the new model.
- **Theming:** ES/EN and light/dark work.

Fixes found by the end-to-end run:
- **Snapshot at start-up:** a scheduled snapshot that runs while OMB is still starting now retries (`retry_policy`).
- **Initial checklist:** `up` enqueues `fyso-setup-check`, so the checklist is filled on first open.
- **Engines:** the check lists only the engines the project's bots use, plus `claude`/`claudeApi`/`codex` when ready. Before, it listed all 26 OMB engines.

Deliberate differences from the design (from the SPA build):
- **Plan lines:** shown verbatim from OMB (English prose), not as structured diffs.
- **Skills:** read-only in v1. Extension skills became switchable per bot later (D54).
- **"Uses workflows":** it can only be turned on.
- **File-based instructions:** the form names the file; typing switches the bot to inline instructions.
- **Fonts:** Gilroy (400 and 700, woff2) and JetBrains Mono, both self-hosted; system fonts are only the fallback.
- **Chief bot:** MausBot is excluded from manual configuration forms; D28 includes it in the native live roster.
- **Additions:** a "Descartar cambios" link for the local draft, and a mobile ⋯ menu for language and theme.

The built `dist/` is committed (~0.5 MB), so generated projects need no Node build step. Mock mode (`?mock`) is for panel development.

### Phase 5 — Builder (dogfooding) — local delivery complete; remote Builder acceptance pending
`dev-task` with `harness.run` and the Builder bot.

Local implementation and evidence: [Phase 5 Builder](adr/phase-5-builder.md). Codex completed the full local flow on Dagu 2.24.0; Claude hit its subscription limit. The generated stack passed `mise run doctor`. The user requested the commit and explicitly deferred configuring a remote. Local delivery is complete. The repository was subsequently published in `fyso-dev/agentic-framework` with initial PR #1; the Builder itself has not yet executed a real remote publication acceptance run.
**Original remote exit:** the Builder ships a real small issue to the template repo through a PR. **Current local scope:** verified coding-agent change → checks → feature-branch commit, with the original user deferral recorded. The remote now exists; automated Builder publication acceptance remains pending.

### Phase 5.5 — Bot observability — verified locally
Conversation activity, delegation, execution history and AI usage on one read-only
panel screen. See [observability.md](observability.md) for sources, costs,
correlation, advisory alerts and verification requirements.
Verified implementation and evidence: [delivery record](../artifacts/delivery-evidence/observability/README.md).
**Exit:** a real conversation and a correlated dev-task expose their own usage,
failures and timing, without duplicate spend; unknown cost remains unknown;
restart preserves source history; partial/unavailable sources are explicit.

### Phase 5.6 — Conversational Bot Architect — verified locally
A bot manages project bot profiles using OMB's native team format through a Dagu
workflow, with snapshots and versioned project config. See [bot-architect.md](bot-architect.md).
Verified implementation and independent audit: [delivery evidence](../artifacts/delivery-evidence/bot-architect/README.md).
**Exit:** real conversational create/read/update/delete of a disposable bot,
unrelated bots unchanged, target restore from versioned config proven, regression
checks and `mise run doctor` green.

### Phase 6 — Deploy and template lifecycle
VPS guide, optional `compose.yaml`, Copier `_migrations`, template CI.
**Exit:** `copier update` vN → vN+1 applies cleanly to a sample project.

### Phase 7 — Extensions
Slot conventions, the `framework/extensions/_template` Copier template, a minimal sample extension used as a test fixture, and the panel's Extensions view. NetBird stays documented (§12.1) but is not built.
**Exit:** `copier copy` of the sample extension adds a working, health-checked tool to a project, and `copier update` upgrades it.

**Result (2026-11-06):** built against [extensions-contract.md](extensions-contract.md) (D30); Codex built the plumbing, Claude the panel and docs. Verified on a generated project (port block 8650):
- **Lifecycle:** `mise run ext:add <src> -- --vcs-ref v1` → `ext:update` to v2 → `ext:remove`, with the sample fixture from a tagged local repo (also an automated test).
- **Runtime:** the sample's process, route and doctor run; `mise run doctor` is green, including the extension checks; the route answers 200 through the gateway.
- **Generated `.mcp.json`:** it merges the Dagu server with the extension's server and keeps the `${VAR}` placeholders.
- **Panel:** Apps shows the extension tile with live health, plus an "Installed extensions" list (version, MCP/workflows/skills, secret presence only).
- **Tests:** Python 16 passed and 13 skipped (stack/fixture opt-in); Node 27 passed; `check-paths` clean.

Fixes found on review: `ext:update` stopped at the second extension because Copier refuses a dirty tree, so it now updates one extension at a time and asks for a commit between them; a Node test hit an untrusted mise conf.d file through the `node` shim.

### Phase 7.1 — Marketplace and integrations (D31)
Discovery of extensions through git catalogs, install and upgrade from the panel, and the integration bases for bots ([ADR 0002](adr/0002-extension-marketplace.md)).

**Done (2026-11-06):** git catalogs + `ext:search` / `ext:add <id>`, panel install/upgrade through Dagu ([contract §8](extensions-contract.md#8-marketplace-d31)); official catalog `fyso-dev/fyso-extensions` with `sample` (`fyso-dev/fyso-ext-sample`); options compared: Activepieces verified natively ([spike](adr/spikes/activepieces.md)), MCP Registry API verified, ACI.dev and ToolHive rejected.

**Next, in order:**
1. **`fyso-ext-activepieces`** — first real catalog entry. Start by verifying the MCP OAuth login path for OpenMausBot bots (the only open risk); then a mise task that builds each version once into `.data/ext/activepieces/<version>` (bun + node pinned), two processes (API, worker) through `run-ext.sh`, a route without `fyso_login`, `AP_ENCRYPTION_KEY`/`AP_JWT_SECRET` in `secrets.yaml`, its MCP in the `mcp.json` slot.
   **Exit:** installed from the marketplace on a generated project, a bot runs a piece action with a real connection (e.g. Gmail) through MCP, doctor green.
2. **MCP Registry search in the panel** — search `registry.modelcontextprotocol.io`, show official publishers first, hide `oci` packages (Docker), write the chosen server into `project/mcp.json` with `${VAR}` placeholders for `isSecret` values (bots only see `BOT_*` secrets).
   **Exit:** a server added from the panel appears in the generated `.mcp.json` and a bot can call it after `mise run secrets` and a restart.

### Phase 7.4 — Linux and Windows graphical installers (D38)

Implementation in `installer/qt/`: Qt IFW 4.7.0 wizard and native build recipe, shared
Dagu workflow, Linux adapter and Windows/WSL2 PowerShell adapter. Local Linux ARM64
build and real runtime HTTP routes verified; full acceptance remains open because
no coding engine is authenticated in the fixture. Windows native build, UAC,
restart/resume, browser routing and real WSL cancellation require a Windows host.

- [x] Shared workflow generation; preserve the existing macOS entry point.
- [x] Qt wizard, ES/EN copy, private requests and separate helper/project ownership.
- [x] Linux runtime install and authenticated panel/Dagu/OMB routes in an isolated VM.
- [x] Windows adapter protocol tests with an executable shim; no production accounts.
- [ ] Doctor green with a real selected engine login on Linux.
- [ ] Native Windows executable build and end-to-end WSL2 acceptance.
- [ ] Clean-host binary dependency acceptance for each supported Linux architecture.

See [installer implementation](../installer/qt/README.md) and
[delivery evidence](../artifacts/delivery-evidence/installer-cross-platform/README.md).

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
| Bots can read the Dagu credentials (`DAGU_MCP_AUTH`, the same as the gateway login) | Accepted for local use. Before any server deployment, give bots their own Dagu credential (Dagu `builtin` auth with an MCP-scoped API key) |
| HTTP web login exposed remotely | Startup rejects non-loopback binding; Phase 6 must verify HTTPS and Secure cookies before remote access |
| Hourly commits add noise to history | Commit only when something changed; squash or filter later if it bothers |

## 12. Extensibility (D17)

Two kinds of extension, and both reuse existing mechanisms. Nothing here needs a plugin loader.

### 12.1 New tools and services (e.g. NetBird)

**An extension is a small Copier template**, kept in its own repo (e.g. `fyso-ext-netbird`). It is applied on top of a project:

```sh
copier copy gh:fyso/ext-netbird . --answers-file .copier-answers.netbird.yml   # install
copier update --answers-file .copier-answers.netbird.yml                       # upgrade
```

Copier natively supports several templates per project, each with its own answers file. The set of `.copier-answers.*.yml` files therefore **is** the list of installed extensions, already versioned in git. No registry is needed for that list; discovering extensions that are not installed yet uses git catalogs (D31, [ADR 0002](adr/0002-extension-marketplace.md)).

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

### 12.3 Verified before Phase 7 (2026-11-06)

The exact contract is [extensions-contract.md](extensions-contract.md) (D30). It supersedes the slot table in §12.1 where they differ.

1. **mise conf.d:** yes. mise 2026.11.2 loads `.config/mise/conf.d/*.toml` (env and tasks); each new file needs `mise trust`.
2. **Dagu subdirectories:** see the contract §6. The `ext-<ext>-` prefix stays until confirmed.
3. **NetBird MCP:** not checked; NetBird is not built (§12.1).
4. **Skills catalog CLI:** not needed in v1. Skills ship inside the extension and are enabled per bot by a person.
5. **Shared files:** avoided by contract. Extensions write only slot paths; ignore rules go in `extensions/<ext>/.gitignore`, and `.mcp.json` is generated.
6. **Also verified:** process-compose merges several `-f` files and `depends_on` crosses files; Caddy accepts an `import` glob that matches nothing.

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

Packaging update (2026-11-07): the Biz implementation described in D39 lives in its own `fyso-dev/fyso-ext-biz` repository and the official catalog; D41 remains generic framework infrastructure. No Biz implementation is bundled in the framework.
