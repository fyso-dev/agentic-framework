# Fyso Agentic Framework — Implementation Plan

Status: **Local runtime, Builder, observability and Bot Architect verified; remote PR deferred by the user** · Updated: 2026-11-06.

Brand: **Fyso**. "Fyso Agentic Framework" is a working name; the final product name comes later. The panel, the docs and the generated projects use Fyso branding. The panel's visual design is produced in **Claude Design** from [docs/panel-spec.md](panel-spec.md); the implementation follows that design. `@fyso/ui` is not used.

## 0. Principle

> **Orchestrate existing software. Never reinvent the wheel. Always feel simple.**

Every piece of this framework is an existing tool, wired together with configuration files and a few small scripts. Custom code is allowed only when no existing tool does the job, and it must stay small: the panel SPA and some glue scripts. When in doubt, choose the option with fewer moving parts.

**Grow extensibility before functionality.** The default framework should remain simple for its users. Projects install use-case capabilities as optional extensions. Core growth should primarily enable extensions through small generic contracts, rather than accumulate domain features, screens or required services. Existing universal runtime responsibilities remain in core; exceptions require the placement criteria in [the extensions contract](extensions-contract.md#core-versus-extension-placement).

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

2026-11-14 — **Extension-first product growth.** Clarifies D17, D30 and D41: use-case functionality is opt-in; the core owns generic extension capabilities and essential shared runtime behavior. A missing extension slot calls for a minimal reusable contract, not automatic inclusion of the feature in core. Promotion requires demonstrated shared need, an inadequate extension boundary and a recorded decision covering user-facing complexity and compatibility. See [placement criteria](extensions-contract.md#core-versus-extension-placement). This policy does not authorize a bulk migration of existing functionality.

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
| D34 | **(Superseded by D85.)** **Menu bar app = a SwiftBar plugin, no native app.** [SwiftBar](https://github.com/swiftbar/SwiftBar) (MIT, `brew install --cask swiftbar`) shows what a script prints and refreshes it. `framework/tray/fyso.10s.py` (Python stdlib) lists every Fyso project running on the Mac, with no registry: each stack owns `/tmp/fyso-<slug>-<port>.sock` (process-compose), the folder is the cwd of the process holding it, names and app links come from `.data/panel/*.json`. Per project: health dot, Panel/Dagu/OMB/extension links, processes, open folder/terminal, restart and stop (second-level submenus). Projects seen running are kept in a rebuildable cache (`~/Library/Caches/fyso-tray`) and listed as stopped with Start. While an action runs the project shows its progress (refreshed at once), and a macOS notification reports the result; a failure stays visible with a link to `.data/logs/tray.log`. Actions run `mise run up/down` with the PATH the stack had, because process-compose children inherit the environment of `up` and SwiftBar's PATH lacks the engine CLIs. Stale sockets are shown and can be removed. `mise run tray:install` links the plugin into SwiftBar's plugin folder and remembers that project; one link from any project is enough. macOS only |
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
| D55 | **The generated `.mcp.json` carries the project's port numbers literally in server URLs.** Amends D30 ("placeholders are kept"). `mcp-config.cjs` replaces `${FYSO_…_PORT}` inside a server `url` with the value from the environment, when set and numeric. With OpenMausBot 0.1.141 a bot that has a tool selection (every default bot) gates each MCP server and validates its URL without expanding placeholders, so the `dagu` entry was rejected and every Claude turn failed with "Tool selection requires a supported MCP server". Only URLs and only port variables are touched; headers and any other placeholder, including credentials, stay as written. `.mcp.json` is generated and git-ignored, and its sources in git keep the placeholders |
| D56 | **Projects are shared as distributions: a Copier template published from a prepared project, one-way.** `dist:publish` exports the project's committed `project/**` (minus `distribution.yaml` and `auth/`), `state/bots/**`, installed extensions and bot memory (without daily logs) into a separate Git repository with a generated `copier.yml`, after gitleaks and the machine-path check, and tags `vN`. Clients install with `copier copy` and update with `copier recopy --force` (own answers file `.copier-answers.dist.yml`, like extensions in D30): the distribution's files replace local configuration, as the user decided; uncommitted local edits are kept as a patch in `.data/dist/`. Memory arrives in `state/dist/memory/` and the `fyso-dist-update` workflow merges it into each bot's own memory with `git merge-file --union` against the previous delivery (memory accumulates; no LLM merge). Secrets travel only when named in `project/distribution.yaml`, SOPS-encrypted for the clients' age public keys (`dist:key`) plus the publisher's; per-installation credentials are refused. Rejected: a Git fork with an `upstream` remote (mixes the client's memory and snapshots with the publisher's history and shares the publisher's whole repository); `copier update` (three-way merge with conflict markers, where the user wants the publisher to win). Clients do not send changes back yet; no panel UI yet. [Contract](distribution.md) |
| D57 | **Agents understand the project and reach Dagu through the platform MCP.** Extends D33. (1) `fyso` describes the project, not only the framework: a project brief in `initialize.instructions`, `fyso_project` (map of bots, workflows, apps, extensions, MCP servers, wiki, guides) and read-only `fyso_files` / `fyso_file_read`, confined to project and guide files, never secrets, login users, runtime data or hidden files. (2) `fyso` forwards Dagu's own `dagu_read`, `dagu_execute` and `dagu_change` unchanged, because a desktop app cannot hold the project login the Dagu MCP needs; that covers workflows, runs, logs, the wiki and `fyso-dev-task` without new tools. On by default; the project's `.mcp.json` passes `--no-dagu`, since Dagu is already a server there. (3) The remaining panel workflows get tools: application access (read/plan/apply), connector preferences, process logs. The server still writes no project file. Rejected: own workflow tools (reinvents Dagu's), a file-write tool (bypasses the panel workflows and review; `fyso-dev-task` covers it on a branch), registering the Dagu MCP globally (would put the project login in desktop app configuration). The remote HTTP MCP of D52 must not forward Dagu's tools without its own scoping. [Contract](agent-surface.md) |
| D58 | **An extension's web app inherits the panel's access rule; the knowledge base is a panel section.** Web login denies unknown apps (`acls.policy: deny`), and an extension cannot edit the project-owned `project/auth/tinyauth.yaml`, so an installed extension's route answered "unauthorized" until a person edited that file. Whoever may open the panel can already install and run extensions, so the glue that writes Tinyauth's runtime config (`web-auth-config.cjs`) now gives each `http://<app>.{$FYSO_WEB_DOMAIN}` site of `extensions/*/Caddyfile` a copy of the `panel` rule, **unless the project declares that app**; `ext:add`/`ext:update` restart the login authority (sessions survive). No new slot or schema; project apps stay explicit. The SilverBullet extension adds a panel page through the existing page slot (extensions-contract §9): the real editor embedded in the panel, a guide with the three ways to feed it (write, ask a bot, drop Markdown files) and each bot's access with a link to its skill switch. Rejected: a custom editor or ingestion API (SilverBullet and the filesystem already do both). [Extension](silverbullet-extension.md) · [web login](web-auth.md) |
| D59 | **The knowledge base is seeded by AI from an uploaded folder or zip, with existing upload software and the existing agent action.** A browser cannot pick a server directory and the panel has no upload endpoint, so the SilverBullet extension adds one process: [tusd](https://github.com/tus/tusd) 2.10.1 (tus resumable uploads) on a **Unix socket** behind `fyso_login`, with no extra port, and [Uppy](https://uppy.io) 6.0.7 as the folder/zip picker, both pinned in mise (Uppy's browser files are linked from the installed npm package, not vendored). The picker is served on the knowledge base's own origin and framed by the Knowledge page, because the browser guard refuses writes from another origin; it reports its upload batch to the panel, and the **person** starts `ext-silverbullet-import`. That workflow reuses Dagu's `harness.run` exactly like `fyso-dev-task` (D15): glue steps (`import.cjs`) move the batch into a private work directory, unzip (`extract-zip`), convert Word/OpenDocument/HTML/EPUB/RTF with pandoc 3.13, stop on credentials (gitleaks) and on size limits; the agent reads `source/` and writes `out/`; a gate accepts only Markdown; publish copies **new** pages into `project/wiki/`, never overwrites, and writes a report page. No review branch: pages are additive, the report lists them and Git is the undo. Rejected: a typed server path (does not work from a browser), Filebrowser (own UI and users), WebDAV (custom Caddy build), uploading into the wiki itself (raw sources would become pages). [Extension](silverbullet-extension.md) |
| D60 | **Workflow scopes: a subset of workflows per group of bots, enforced by the platform MCP.** Workflows are classified: `fyso-*`, `ext-*` and links into `framework/` are *system* (framework workflows also carry the Dagu label `fyso=system`); the rest are *project*. A project workflow joins a scope with Dagu's own label `workspace=<scope>`; a system workflow only when the scope grants it by name. Each scope is an entry `dagu-<scope>` of `project/mcp.json` that runs `fyso-mcp.cjs --scope`, exposing Dagu's `dagu_read` and `dagu_execute` for that scope only (operator level: no changes, inline specs, searches or wiki; arguments allow-listed). Read with `fyso_workflow_scopes`, changed with `fyso_workflow_scope_save` / `_delete` through the `fyso-workflow-scopes` workflow, assigned with the existing bot selector. Chosen over Dagu's native workspace keys ([spike](adr/spikes/dagu-workspaces.md)) because those allow two keys without a license and require builtin auth, superseding D19; the labels are the same, so native enforcement can replace the filter later. Chosen over an MCP gateway: they scope tools per key, which OpenMausBot already does, and none filters by workflow. It is a guardrail, not a boundary: Claude bots keep native tools. [Contract](agent-surface.md#workflow-scopes-d60) |
| D61 | **The web domain and the login authority are Copier answers; the defaults keep every project local and separate.** `web_domain` (default `<slug>-<port>.localhost`) names the project's web addresses. `auth_upstream` (default empty: the project runs its own Tinyauth) points the gateway's `forward_auth` to a login service shared by several projects on the same host, loopback only. A project on a shared login starts no Tinyauth and holds no web users; users and application permissions live in the shared service, whose cookie domain must be a parent of each project's domain. The gateway still binds to loopback in every mode: a non-`localhost` domain is reached through a private forwarder (an SSH tunnel, `tailscale serve --tcp`), over HTTP. Public exposure, HTTPS and Secure cookies stay in Phase 6. The shared login service and its portal are not part of the template yet. [Contract](web-auth.md#configurable-domain-and-shared-login-d61) |
| D62 | **HTTPS comes from a provider extension; the core only knows the public scheme.** The gateway stays loopback HTTP in every mode and the core issues no certificates. A provider extension (NetBird reverse proxy, Tailscale, …) terminates TLS in front of it and declares `FYSO_WEB_SCHEME = "https"` in its mise conf.d file. With that value the applications are `https://<app>.<web_domain>` on the default port: the login builds its redirects from it and marks the session cookie `Secure`, the gateway accepts only that origin, and panel links, OMB's public address and the start message use it. Without a provider nothing changes (D61). Features that need HTTPS, first the remote MCP of D52, require a provider instead of a core certificate setup. Who can reach the provider's address (public, peers only, groups) is the provider's configuration and its administrator's decision; the extension states it. Rejected: certificates in the core (`lego`/ACME, a shared `fyso.dev` zone, an internal CA), because each network already has a terminator. This is the provider part of the Phase 6 HTTPS gate; a public server with its own domain is still open. [Contract](web-auth.md#https-through-a-provider-extension-d62) · [provider slot](extensions-contract.md#10-https-provider-d62) |
| D63 | **Remote MCP: the platform server over HTTP at `/mcp`, a project token, only behind an HTTPS provider.** Builds the remote part of D52. `fyso-mcp.cjs --http <socket>` serves the same tools over MCP Streamable HTTP (stateless JSON answers) on a private Unix socket, as the `mcp-remote` process; the panel site routes `/mcp` to it before the web login. The endpoint checks `Authorization: Bearer <FYSO_MCP_TOKEN>` itself in constant time, refuses requests that carry `Origin` (browsers, DNS rebinding) and answers "off" unless the public scheme is `https` (D62) and the token exists. It never forwards Dagu's tools (D57). `mise run agent:remote` creates the token in `secrets.enc.yaml` on first use (`--rotate` replaces it) and prints the address with the ready command for Claude Code and Codex; the panel's `#/mcp` page, opened remotely over HTTPS, shows the address and that task, never the token. Changes to D52's plan: the transport is ~60 lines in the existing server instead of the `mcp-proxy` bridge (no new pinned tool, no child process per session; the repo already speaks this protocol as a client in `dagu-mcp.cjs`), and the token reaches the person through the terminal only. Open: Claude Desktop, whose remote connectors take OAuth, and per-person tokens. [Agent surface §3](agent-surface.md#remote-clients-d63) |
| D64 | **Web passwords can be read again, generated ones are readable, and changing one does not stop the project.** Amends D40. The login service still receives only bcrypt hashes; each password is also kept encrypted in `secrets.enc.yaml` (`FYSO_AUTH_PASSWORDS`), because the people who can decrypt that file can already replace a hash, and an unrecoverable password turned every lapse into a reset on a stopped stack with an interactive terminal. `mise run web-auth:password` shows it, `-- --new` sets a generated one; a password nobody typed is four short groups (`kfmt-pwze-rqsu-7dnx`, ~79 bits) instead of 43 random characters; without a terminal one is generated instead of failing. Only the login service is stopped around a change and it reads the users fresh. Terminal only: the panel still shows no secret. Rejected for now: sign-in with Google or GitHub (native in Tinyauth), which needs an OAuth application per domain. [Contract](web-auth.md#configuration-and-ownership) |
| D65 | **The panel can run the remote MCP setup and show each client's command, token included.** Amends D63 and is the one exception to "the panel never shows secret values": this token exists to be pasted into a client, and sending people to a terminal on the project's machine was the main friction of connecting. On `#/mcp`, opened remotely over HTTPS, *Run* enqueues `fyso-agent-connect` with `MODE=remote`, which creates the token if it is missing and returns only the address; the panel then asks the private setup adapter (`POST /api/agent/remote`: web session, exact origin, the socket and credential of D45) for the commands of Claude Code, Codex, OpenCode, Gemini CLI and a generic JSON configuration. The token never is a Dagu parameter or output, is read from `secrets.enc.yaml` on each request, is not cached (`no-store`) and is not kept by the page after leaving it. Whoever may open the panel can get it: the panel already lets those people change bots, extensions and workflows. `mise run agent:remote` stays, with the same list from one module (`agent-remote.cjs`). Rotation stays a terminal action (`-- --rotate`). [Agent surface](agent-surface.md#remote-clients-d63) |
| D66 | **Business-owner capabilities ship as six independent, opt-in Copier extensions.** Separate document dependencies, file publication, wiki know-how, operational reporting, human interaction and an illustrative vertical team. None edits the project team or consumes an extension port. Install bundled sources by project-relative path; publication and marketplace registration remain D31 release work. Skills are selected per bot (D54); `ext-*` workflows need explicit grants in scoped servers (D60). [Contract and evidence](owner-extensions.md) |
| D67 | **Office documents use thin original skills over pinned tools.** Pandoc 3.13 produces Word and PowerPoint, Pandoc with Typst 0.15.1 produces PDF, and pinned Dagu 2.24.0 supplies native `xlsx.*` actions. No document engine or Python environment is built. The four Anthropic document-skill licenses at the inspected upstream revision are Apache 2.0; redistribution is allowed subject to its terms, but their broader dependency surface is unnecessary here. No Anthropic skill is vendored. [Sources and limits](owner-extensions.md#office-docs) |
| D68 | **Deliverables use Caddy's native file server and the existing web login.** A small CLI/stdio MCP copies finished project files into ignored runtime data, preserves existing deliveries and returns a public-scheme-aware download link (D62). An extension-owned ES/EN page lists native browse JSON. The `files` app inherits panel access unless the project overrides it (D58); downloads carry attachment, sandbox and nosniff headers. No upload service or file database. Content review and backup remain necessary. [Contract](owner-extensions.md#deliverables) |
| D69 | **Knowledge skills complement SilverBullet without requiring it.** Interview and brand guidance share project-owned Markdown wiki pages through existing file/wiki tools. A scheduled Dagu gardener checks links and dates; an optional native coding harness proposes contradictions in a private bounded copy. It publishes only an additive review report, never repairs existing pages automatically. AI provider execution and editorial quality need separate acceptance. [Contract](owner-extensions.md#knowledge-skills) |
| D70 | **Operations assistance reuses the existing observability export and Dagu history.** A deterministic digest writes a wiki report; a scheduled per-bot monthly threshold check fails on a new exceedance and preserves unknown costs. Stale or unavailable ledger data fails verification. This is an advisory alert, not enforcement: the inspected OMB native budget is workspace-wide and license-gated, with no per-bot pause mechanism. Workflow authoring stays native `dagu_change` preview/apply, with a human deciding external writes. [Contract](owner-extensions.md#ops-assistant) |
| D71 | **The owner loop teaches native human interaction instead of adding a service.** Dagu `human.task` waits for typed input; existing OMB question cards, credential requests and notifications are used only where available. Lasting extension secrets go through D50/D51, never chat or DAG inputs. A workflow may hand an informational message to an explicitly addressed project bot; delivery to a person still depends on that bot/channel. Generic undeclared-secret forms, direct Dagu channel credentials and durable cross-channel human routing remain open spikes. [Native findings](owner-extensions.md#owner-loop) |
| D72 | **The accounting pack is an unapplied native team YAML sample.** Four draft-only assistants use project engine defaults and require a qualified accountant's domain review. No jurisdiction, tax rate, official deadline or filing behavior is supplied. Preview uses the existing bot tooling; adoption copies selected bots into project ownership before normal review/apply. [Contract](owner-extensions.md#pack-accounting) |
| D73 | **Third-party Agent Skills: git copies with provenance and explicit review.** Discover via configured git repositories and best-effort anonymous skills.sh CLI search; copy a selected folder pinned to a full commit into project-owned `project/bots/skills/`, retain its license and provenance. Panel and MCP preview immutable content before apply. Native OMB scan plus human confirmation binds the retained folder digest; reuse D54 per-bot toggles and native disabled entries. No catalog service, plugin installer or support-file loader. OMB 0.1.141 imports SKILL.md only; supporting-file functionality is not claimed. [Spike](adr/spikes/skills-registry.md) · [Contract](third-party-skills.md) |

| D74 | **The existing remote MCP token grants the full project agent surface.** Supersedes the D63 exclusion of Dagu: the same authenticated HTTPS endpoint forwards Dagu's native tools, including execution and changes. The token therefore grants command execution as the project user. `fyso_bot_run` invokes the native OpenMausBot CLI on the explicit project port, with a new conversation by default or a specified task, and returns its reply. The caller must treat a timeout or interrupted request as potentially still running. No additional credentials or unscoped Dagu endpoint are exposed. [Agent surface](agent-surface.md#remote-clients-d63) |

| D75 | **Agent feedback stays in the project for human review.** `fyso_feedback` creates a distinct page under `project/wiki/feedback/` using Dagu's native wiki operation and returns its path. It sends no notification and opens no external issue. Agents omit secrets and personal data. Default new bots with tool allow-lists receive the one feedback selector; existing project-owned bot declarations are not changed. [Agent surface](agent-surface.md) |
| D76 | **Human requests are an opt-in bundled extension on Dagu human tasks, and the extension contract gains page counters.** One root run is one request: a validated card (who asks, what it was doing, what it needs, choices with their effect, what happens if nobody answers), a native human task, and a step that returns the decision to the origin. Before deciding, the person may ask the agent a question: a native push-back reruns the first step, which asks the originating OpenMausBot conversation and adds the reply to the card; the request stays open. The extension owns the Pending and People pages, the workflows and a per-bot skill; nothing about it lives in the core. To let an extension tell people something is waiting, a page may declare a counter (a Dagu run query as data, [contract §9](extensions-contract.md#page-counters-panel-api-2)) that the panel shows in its navigation and top bar; panel API 2. Recipients are routing labels, names are self-declared, the people directory creates no accounts, and no personal ACL, sensitive approval or notification outside the panel is implied; project operators are trusted under D40. An OMB return uses its native stable send identifier; message deduplication is not exactly-once execution of external effects. HTTP return is disabled by default and requires an operator-configured exact HTTPS endpoint and SOPS credential. The scoped Dagu MCP (D60) lets a run carry plain labels, which requests need, and still refuses any `workspace` label. Experimental: verified on a generated project with a real bot on the Claude engine creating its own request, answering a question and continuing after the decision; on the Codex engine bots do not see the project's MCP servers at all, a separate problem of that engine integration. [Proposal](human-requests-proposal.md) Since 2026-11-15 it is also published independently as `gh:fyso-dev/fyso-ext-human-requests` (v0.1.0) in the official catalog; the bundled copy remains for existing installations, which migrate once to the tagged source. |
| D77 | **Pi as an opt-in bot engine (beta; full generated lifecycle passed once on macOS).** Pin Pi and use its `openai-codex` ChatGPT login through OpenMausBot's native Pi driver. The project-owned Pi launcher disables independent MCP, extension and skill discovery; OMB mounts selected project tools explicitly. For the current conversation origin, the launcher extracts only validated bot and thread IDs from the native agents descriptor of this pinned OMB version. New Pi bot definitions allow the read-only `agents:list_threads` tool to make that descriptor available. Scoped Dagu structured replies also have a text representation, after filtering. New Pi projects restore a project-owned, credential-free native `dagu` server exposing only Dagu tools. Existing Claude and Codex choices remain available. Dagu's Builder and bundled SilverBullet import keep their supported Codex harness when Pi is chosen; Pi does not claim a new Builder harness. Doctor checks Pi authentication; a real generated-stack and independent isolation acceptance remain required. [Engine selection](engine-selection.md) |
| D78 | **Private HTTPS may use Cloudflare DNS-01 in a provider extension.** The core retains D62. A reusable Copier extension orchestrates pinned lego for certificate issuance/renewal, encrypted zone-scoped DNS credentials, native Dagu scheduling and Caddy TLS. Tailscale remains the private transport; application DNS records are unproxied and existing records are never replaced implicitly. The hub stays the single identity authority. DNS permissions, real issuance and browser acceptance are mandatory deployment gates. Implementation in progress: [contract](cloudflare-extension.md). |
| D79 | **Extensions may serve a same-origin API from a private socket.** The panel gateway routes `/api/ext/<id>/<path>` to `/tmp/fyso-ext-<id>-<FYSO_HTTP_PORT>.sock`, which `run-ext.sh` passes to the extension as `FYSO_EXT_SOCKET`; the extension creates it with mode 0600. The route sits behind the same web session, roles and origin checks as the panel's other APIs; the extension receives only the path after its id, the session's identity headers, and no cookies or `Authorization`. It exists because every panel read went through a Dagu enqueue plus polling (1.7 s average queue wait, up to 3.5 s, plus a 1.2 s poll) for work that takes 0.3 s. Dagu stays the place for changes that need run history or approval; the route is opt-in, and an extension without a socket answers 502. [Contract §9](extensions-contract.md#same-origin-extension-api-d79) |
| D80 | **Panel actions start at once when the workflow may overlap.** Dagu 2.24.0 scans its queue at most every 3 s, so every enqueued action waited 0–3 s before running. `start` runs at once but does not enforce `max_active_runs`: plain starts overlap, and concurrent `singleton` starts all ran in a test. So the panel and the CLI/MCP client (`dagu-client.cjs`) start a workflow whose native `max_active_runs` is not 1, and enqueue every other one; a workflow states it is safe to overlap with that native field, with no new schema. The framework's read-only checks and previews (`fyso-setup-check`, `fyso-bots-plan`, `fyso-ext-catalog`, `fyso-skills-catalog`) declare 4. Anything that writes the repository, OMB or shared files keeps 1. Polling starts at 200 ms and backs off to 1.2 s. Amends the Phase 3 "always enqueue" rule ([panel contract](panel-contract.md)). |
| D81 | **Teams are OpenMausBot-native sections declared in `team.yaml`.** The core adds no team schema: `teams:` (name, `brief`), a bot's `team:` and `rooms:` are OMB 0.1.141's own keys and pass through `bots:plan`/`bots:apply` as-is. A team's `brief` is shared instructions OMB adds to every member's system prompt. OMB matches a bot by name, preferring the same team, so the panel matches drafts and live bots by name and team first, then by name: moving a bot is a change of that bot, never a delete plus a create. The panel uses OMB's own vocabulary (es "departamento", en "department"; `brief` is "shared instructions"; `chief` is the department's "chief of staff"; rooms are "group chats"). It groups bots by department (bots without one under OMB's "General"), keeps a declared empty department listed, lets a person create a department and edit its inline shared instructions in the draft (OMB creates it empty on apply), and lets a bot choose or type a department, including ones created in OMB itself. OMB never renames or deletes a department from the file, so renaming and deleting happen in OMB; a brief kept in a file and rooms stay in `team.yaml`. Removing a bot's `team:` does not move it out of its team natively. `chief` (and `manages`) grant bot-management powers: they are set only when a person explicitly accepts them in `team.yaml`, never from an import (which keeps a bot's `team:` and drops `chief`/`manages`; omitted, OMB leaves the native powers as they are), Bot Architect or the MCP, which may only place a bot in an existing team. Only the team-less chief, the default MausBot, is hidden from the panel; a team's chief is listed. Saved app access is matched by name and team; after a move, explicitly save the permissions for the new team. Name alone cannot distinguish a move from a replacement, so orphaned permissions are never applied to another team. The core never uses `prune`. [Panel contract §4](panel-contract.md#4-editing-teamyaml-in-the-browser) · [Bot Architect](bot-architect.md) |
| D82 | **Department templates are native OMB team packages.** A department moves between projects as an `omb-team/1` package: OMB's own `team export --team` text, normalized to one `teams:` entry, its bots and rooms (no `cwd`, machine paths, `chief` or `manages`; skills as relative `skills/<bot>/<skill>/SKILL.md` carried with their content), identified by the SHA-256 of the canonical JSON of its canonical form (sorted bots and rooms, OMB's key order, text without trailing newlines, per-bot skill paths, explicit `approval`/`computer`), so a department imported, applied and exported again has the same digest in any project; at most 512 KB and 64 skills. The core adds generic capabilities only: `framework/scripts/team-template.cjs` through `fyso-bot-architect` (`OP=team-templates`, `team-export` on the project's explicit OMB port, `team-import`), and a new extension slot `extensions/<ext>/teams/<slug>/` (`team.yaml` in OMB's format plus `skills/**`). Import commits the skill files under `project/bots/teams/<slug>/` on their own and only *proposes* `team.yaml` (the department's entry, bots and rooms replaced, the rest kept with comments); the panel opens it as the draft and the person applies it through the native plan. A bot or room name already used by another department is rejected (`name_taken`). No extension writes `project/bots/team.yaml`. Publishing to Fyso Business and two-way synchronization live in fyso-business and fyso-ext-biz, not in the core. [Department templates](team-templates.md) |
| D83 | **The panel uninstalls extensions directly.** Uninstall on an installed extension card asks for an in-page confirmation and runs the `fyso-ext-remove` Dagu workflow: `ext.sh apply` with `MODE=remove` reuses `ext:remove`, commits only that extension's slots and reloads processes and routes like an install. No agent, bot or model takes part and no tokens are spent. Data in `.data/ext/` and secrets stay. Supersedes "removing is a terminal task" from D31/ADR 0002; `mise run ext:remove` remains. The panel also re-reads its config files every five seconds and on focus, so changes made outside the page appear. [extensions-contract §8](extensions-contract.md#fyso-ext-remove-param-id--output-result-d83) |
| D84 | **AI usage view: subscription percentage read from OpenMausBot, never inferred (extends D26).** The `fyso-observability` exporter reads OMB 0.1.141's own `GET /api/plan-usage` on loopback (no `refresh=1`; the framework never reads credentials or calls provider endpoints) and keeps only `{instanceId, engine, plan, window, usedPercent, resetsAt, checkedAt}` for the 5-hour and weekly windows; a check younger than 5 minutes is reused because the provider endpoints behind it are undocumented and rate limited. Closed, failed or out-of-range windows are `null` (*unknown*, a normal state). The panel shows it per engine account, labelled as subscription usage of the account (not the project), with reset and check times. Token-based USD stays an *estimated equivalent at list price*, never a percentage. The exporter also emits daily rows per agent/model/engine (with reasoning tokens) for a usage chart drawn with uPlot 1.6.32; the Dagu run log leaves this view (runs still feed alerts and harness usage). Rejected: reading `rate_limit_event` from OMB's native logs (internal format). A pricing table for Codex and an optional alert on the percentage were added by D88. |
| D85 | **One native menu bar app and CLI for every instance (supersedes D34).** `Fyso.app` (SwiftUI `MenuBarExtra`, one Swift file built with `swiftc`, no Xcode project) lives in the menu bar, opens at login (`SMAppService`) and lists the instances of the installer's registry (`projects.tsv`) with their state from each stack's process-compose socket. It opens a panel, creates an instance by running the bundled installer script (D35, unchanged), switches the *current* instance and starts/stops one with the project's own `mise run up/down`. The same binary with arguments is the `fyso` CLI (`list/open/create/switch/start/stop/status/add`), linked into `~/.local/bin`. A Biz edition (`EDITION=biz`) starts with the fyso.biz login. SwiftBar is no longer used. See [ADR 0003](adr/0003-menu-bar-app.md). |
| D86 | **Menu bar app release: signing, Biz session hand-off, updates from GitHub Releases (extends D85, D35).** (1) `Fyso.app` is signed with Developer ID and the hardened runtime, notarized and stapled by `installer/macos/sign.sh` (PR #65's flow) when `SIGN_IDENTITY`/`NOTARY_PROFILE` are set; credentials stay in the build Mac's keychain, never in the repo. Its executable is the native `fyso` binary, so PR #65's `launcher.c` is not needed. (2) **Biz sign-in** uses what Fyso Biz already offers to any OAuth client: RFC 8414 metadata, dynamic client registration, PKCE S256 and RFC 8252 loopback redirects (`@cloudflare/workers-oauth-provider` accepts any port on `127.0.0.1` for a registered loopback URI). The app registers one public client (`http://127.0.0.1/callback`), opens the browser and receives the code on a one-shot `127.0.0.1` listener; scope `mcp perfil`. The grant is kept in `FYSO_HOME/biz/oauth.json` (0600) in fyso-ext-biz's own format. *Create* in the Biz edition signs in first, runs the installer, moves the grant to the new project's `.data/ext/biz/oauth.json` and installs the public `biz` extension with the panel's own path (`ext.sh apply add biz`). Biz rotates refresh tokens, so a grant has one holder: the app gives it away and asks to sign in again before the next instance. (3) **Updates**: the app reads this public repository's GitHub Releases (`macos-v<X.Y.Z>` tags with `Fyso.dmg`/`Fyso-Biz.dmg`) at launch and daily; a newer version shows *Actualizar a la versión X*, which opens the dmg download in the browser, so the quarantine flag makes Gatekeeper check the notarized signature. Rejected for now: Sparkle (framework to embed and sign, EdDSA key to guard, appcast to host; reconsider when in-place install and relaunch are needed). (4) Running stacks missing from the registry are listed from their `/tmp/fyso-*.sock` owner's cwd (D34's method) with *Añadir a Fyso*. See [ADR 0003](adr/0003-menu-bar-app.md). |
| D87 | **Project creation never compiles the web login; the installer starts the slow parts first.** Measured cold install 213–250 s, of which ~80 s was building Tinyauth from source in `start` (its Go modules alone are ~630 MB on disk and its frontend ~200 MB of npm packages) plus the Go and pnpm downloads (~125 MB) it needed. Upstream Tinyauth publishes release binaries for Linux only (`tinyauth-amd64`/`-arm64`). **Linux:** `web-auth:install` downloads that upstream binary and checks the SHA-256 pinned in `mise.toml`. **macOS:** `installer/macos/build.sh` builds the pinned tag from the official source archive (checked against `FYSO_TINYAUTH_SHA256`) for arm64 and x86_64 with the upstream release flags, joins them with `lipo` and bundles the universal binary as `Contents/Helpers/tinyauth` (a Mach-O, signed with the app's other helpers; `sign.sh` rewrites its checksum with `build-tinyauth.sh --record` after signing it and before sealing the app, so the app's signature covers the recorded file), with its AGPL-3.0 `LICENSE`, the exact source URL/tag and checksums in `Resources/third-party/tinyauth/`. The installer passes it to `web-auth:install`, which copies it into a per-user cache keyed by version **and** source checksum (`${XDG_CACHE_HOME:-~/.cache}/fyso/web-auth/<version>-<sha256>-darwin/`, never shared across pins) only when the bundle's version, source checksum and binary checksum all match; each project copies from the cache after checking the binary's checksum. Building from source stays only as the fallback (no bundle, or a mismatch): Go and pnpm are no longer `[tools]` but pins (`FYSO_TINYAUTH_GO`, `FYSO_TINYAUTH_PNPM`) installed on demand by that fallback, which builds once per machine into the same cache. **Installer workflow:** every non-npm tool starts at once instead of after the project is generated; the web login gets its own step (*Inicio de sesión*) alongside the remaining tools; `setup` waits only for what it uses (age, sops, Node, YAML, Caddy); `start` waits for everything; steps run with mise's automatic installs off so a task never installs unrelated tools. **Not deferred, measured:** installing tools after the panel opens is unsafe because the long-lived services keep the `PATH` they started with (a tool installed later is invisible to Dagu and OpenMausBot until a restart), and the post-start work in `up` (restore, bot repair, connector and app-access restore, connect-extensions, the setup-check and observability enqueues, which already run in Dagu) takes ~2 s in total, so moving it would save nothing while leaving the first panel view without bots. Result on macOS 26 (arm64), fresh home folder, workflow until the panel answers: first project 199 → 95 s, second project 76 → 32 s; the app grows 34 → 105 MB (dmg 21 → 49 MB). Rejected: a Fyso-published binary in a GitHub release (a second distribution channel to maintain; the user chose bundling in the app). [Installer](installer.md#timings--d87) · [web login](web-auth.md#native-installation-and-verification) |
| D88 | **List-price table for amounts an engine does not report, and an optional subscription threshold (extends D26, D84).** Codex reports tokens but no USD. `framework/pricing.json` (template-owned) holds USD per million tokens for input, cached input and output per model ID, with the date it was checked and the official source URLs (OpenAI, checked 2026-11-16: `gpt-6.1-sol` 2.00/0.10/10.00, `gpt-6.1-terra` 1.00/0.05/5.00, `gpt-6-luna` 0.10/0.01/0.50, `gpt-6-astra` 10/1/50). An optional `project/pricing.json` with the same shape overrides or adds models. The exporter prices only a turn with known tokens, no reported amount and a model in the table (exact ID, case-insensitive); it becomes `costSource: estimated` in its usual bucket (subscription equivalent for a subscription engine), so it is always the *estimated equivalent at list price*, never a bill and never a percentage of a subscription. An unknown model stays *unknown*. Standard tier only: long-context, batch, fast and regional surcharges are not applied. The export carries the table's date, sources and whether a project override was used; the panel names them under the cost chart. `subscriptionPercent` in `project/observability.json` (default `null`, off) adds an advisory alert for each account window at or above it; it never stops a bot. Rejected: fetching prices at runtime (network, unpinned), inferring the percentage from tokens or USD. [observability.md](observability.md#list-price-table-d88) |
| D89 | **Biz to local is one-way; local changes are proposals decided on fyso.biz (amends D82).** Fyso Business is the source of truth for a department linked to a Biz team. A department with no Biz team is published once, to create the team (`publicar_equipo` without `equipo_id`). After that, a linked department is never published directly (fyso-ext-biz refuses with `linked_to_biz`): every local change becomes a *change proposal* (`proponer_cambio_equipo`, identified by `equipo_id` + `version_base`; states pending, accepted, rejected; a stale base returns `version_conflict`, and accepting an outdated proposal rejects it). An admin decides it on fyso.biz (`decidir_propuesta_equipo`). An accepted proposal returns to the project as a normal pull (import, review, apply), and a rejected one is shown with its reason while Biz stays on its current version. The Biz team name always wins: every sync takes the Biz team's current name, even without a new version. A department renamed locally is shown as *renamed*, with *restore Biz name* (proposed as a `team.yaml` change and reviewed and applied like a pull; the extension never writes `team.yaml` directly, per D82) or *propose new name*. This replaces D82's two-way synchronization and its conflict choice (*pull from Biz* / *publish mine*). The core is unchanged: the `omb-team/1` package, `team-export`/`team-import` and the `teams/` slot stay as D82 defines them. Implemented in [fyso-ext-biz #6](https://github.com/fyso-dev/fyso-ext-biz/pull/6) and [fyso-business #622](https://github.com/fyso-dev/fyso-business/pull/622) (ADR 0127). [Department templates](team-templates.md#synchronization-fyso-ext-biz) |
| D90 | **Remote MCP sign-in with OAuth through the web login (extends D63, closes its open Claude Desktop item).** `/mcp` also accepts an access token from the login the project trusts, Tinyauth, an OpenID Connect provider since 5.1; the project token stays. No OAuth server of our own: Tinyauth signs in, asks consent and issues opaque tokens. The endpoint serves RFC 9728 metadata naming the issuer that login's own discovery announces; with the project's own login it also serves that discovery at the RFC 8414 address with `code_challenge_methods_supported: [S256]` (Tinyauth 5.2 enforces S256 but does not advertise it, and MCP clients refuse without it). A token is accepted when the same login's `userinfo` answers for it, its `sub` equals Tinyauth's `UUIDv5(URL, "user:client_id")` for this project's client (a token for another client is refused) and the user is allowed: Tinyauth's OIDC applies no app ACLs. Own login: client `fyso-mcp` registered in the generated Tinyauth configuration (redirects of claude.ai/claude.com and Claude Code on port 33418), secret `FYSO_MCP_CLIENT_SECRET` created by `agent:remote`, allowed users = the panel's rule. Shared login (D61): the hub registers the client and keeps the secret and serves its own discovery; the project gets `FYSO_MCP_CLIENT_ID` and `FYSO_MCP_ALLOW` (none = nobody). No dynamic registration: people paste the client id and secret (Claude Desktop/claude.ai advanced settings, `claude mcp add --client-id`). Tinyauth keeps one session per user and client: a new sign-in revokes the previous token, so one user has one OAuth connection at a time; valid tokens are remembered by the endpoint for one minute. [Agent surface](agent-surface.md#oauth-sign-in-d90) |
| D91 | **Remote MCP dynamic registration and `iss` (amends D90).** ChatGPT asks for a Client ID when the login offers no registration, and without `iss` in the authorization response (RFC 9207) it uses a redirect per connection, which Tinyauth's fixed redirect list cannot hold. Tinyauth 5.2 has neither registration nor public clients (it always checks a secret) and does not return `iss`. Own login only: `https://auth.<web_domain>/oauth/register` (RFC 7591, served by the MCP endpoint) answers with the single client `fyso-mcp` and its secret when every requested redirect is one the login trusts (refused otherwise); the discovery adds `registration_endpoint` and `authorization_response_iss_parameter_supported`. The secret is thereby public, like a public client's: sign-in, consent, PKCE S256, the fixed redirect list (now with `https://chatgpt.com/connector_platform_oauth_redirect`) and the allowed users protect the tokens. Caddy sends Tinyauth's `/authorize` and `/api/oidc/authorize-complete` through the endpoint, which adds `iss` where they send the browser back to a client; when the endpoint is down Caddy goes to the login directly (`lb_policy first`). No OAuth server of our own: no state, no token handling. A shared login keeps D90's pasted client. [Agent surface](agent-surface.md#dynamic-registration-d91) |
| D92 | **One project identity in the browser: apps inside the panel, the project's name and mark everywhere.** Dagu and OpenMausBot open inside the panel frame (`embed: true` in `app.yaml`, route `#/apps/<id>`). Both send `X-Frame-Options: DENY` (OMB also `frame-ancestors 'none'`); the gateway's `fyso_framed` snippet replaces them with `frame-ancestors <panel origin>`, so only the panel frames them. Opened directly, each app still carries the project's identity through its native settings, resolved by one glue script (`brand.cjs`): Dagu `DAGU_UI_NAVBAR_TITLE` (also its tab title), Tinyauth `ui.title` and `ui.backgroundImage` (a declared `ui` block wins), OpenMausBot `OMB_BRAND_FILE` (applied only with a `whitelabel` licence, `OMB_LICENSE_KEY` in `secrets.enc.yaml`), and every app's favicon paths served by Caddy (`fyso_brand`) from `$FYSO_DATA/brand`. Defaults: the Fyso mark and violet with the project's name; an optional project-owned `project/brand.json` overrides name, accent and icon. The panel applies the same identity to itself (top bar, favicon, tab title, accent tokens derived from one colour) and edits it from *Puesta a punto → Identidad del proyecto* through the `fyso-brand` workflow, which validates, commits `project/brand.json` and `project/brand/icon.png`, and reinstalls the files Caddy serves; the login title, Dagu and OpenMausBot take a new name when the project restarts. Rejected: a Caddy plugin rewriting HTML titles (D40 forbids plugins; native settings exist). Without the OMB licence its own name and onboarding stay "MausBot". [Panel contract](panel-contract.md) |

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
- **Generated `.mcp.json`:** it merges the Dagu server with the extension's server and keeps the `${VAR}` placeholders (project ports in URLs became literal later, D55).
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

**Skills counterpart (D73, 2026-11-12):** third-party discovery, immutable preview/install, scan/human review and per-bot selection implemented; acceptance scope and open runtime checks are recorded in [third-party-skills.md](third-party-skills.md). This does not complete the pending MCP Registry item.

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
