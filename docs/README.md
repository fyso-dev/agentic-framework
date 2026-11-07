# Docs Index — Fyso Agentic Framework

This index is layered. Read it top-down: each layer assumes the ones above it. Change a lower layer freely; changing a higher layer needs a recorded decision (Layer 1).

Keep this index current: when a doc is added, a decision is taken or a phase changes status, update it in the same change.

---

## Layer 0 — Principle and vision
*Why this exists and what it must feel like. Rarely changes.*

| Topic | Where |
|---|---|
| Principle: orchestrate existing software, never reinvent, always feel simple | [PLAN §0](PLAN.md#0-principle) |
| Goal and tool map (need → existing software) | [PLAN §1](PLAN.md#1-goal) |
| Brand: Fyso (working name: Fyso Agentic Framework) | [PLAN header](PLAN.md) |

## Layer 1 — Decisions
*What was decided and why. Append-only: a new decision supersedes an old one, it does not erase it.*

| Topic | Where |
|---|---|
| Decisions log (D1–D34; D6, D9, D22 superseded; D16 resolved by D20) | [PLAN §2](PLAN.md#2-decisions-log) |
| Architecture decision records | [adr/0001-spikes.md](adr/0001-spikes.md): Phase 0 results and D19–D21 · [adr/0002-extension-marketplace.md](adr/0002-extension-marketplace.md): marketplace, Devbox and Composio alternatives compared (D31) |

## Layer 2 — Architecture
*How the pieces fit together.*

| Topic | Where |
|---|---|
| Runtime architecture (Caddy, OMB, Dagu, panel; herdr as a dev tool) | [PLAN §3](PLAN.md#3-architecture) |
| Isolation: own instances, data dirs and port blocks | [PLAN §3.1](PLAN.md#31-isolation-every-project-runs-its-own-instances) |
| Repository layout and ownership (`framework/` vs `project/`, Copier) | [PLAN §4](PLAN.md#4-repository-layout-copier) |

## Layer 3 — Contracts and specs
*The formats, behaviors and screens each part must honor.*

| Topic | Where |
|---|---|
| Install from the private GitHub repository: prerequisites, startup, updates and recovery | [installation.md](installation.md) |
| Configuration (native formats only) | [PLAN §5](PLAN.md#5-configuration--native-formats-only) |
| Versioning: snapshot, memory, replication | [PLAN §6](PLAN.md#6-versioning--the-simple-model) |
| Bots and the `dev-task` flow | [PLAN §7](PLAN.md#7-bots) |
| Engine and model selection: switching, mixing providers, recommended models (open issue) | [engine-selection.md](engine-selection.md) |
| Auth (subscription and API keys) and health checks | [PLAN §8](PLAN.md#8-auth-and-health-checks) |
| Panel: customization layer over OMB, rules and i18n | [PLAN §9](PLAN.md#9-panel-customization-layer--launcher-the-only-real-custom-code) |
| Panel design spec v2 (for Claude Design) | [panel-spec.md](panel-spec.md) |
| Conversational Bot Architect: native CRUD, snapshots and target protection | [bot-architect.md](bot-architect.md) |
| Bot observability: sources, accounting, correlation and advisory alerts | [observability.md](observability.md) |
| Panel ↔ framework contract (files, Dagu API, action workflows) | [panel-contract.md](panel-contract.md) |
| Extensibility: tools/services as Copier extensions; bot tools (MCP) and skills; NetBird as reference example | [PLAN §12](PLAN.md#12-extensibility-d17) |
| Extensions contract: slots, lifecycle tasks, generated `.mcp.json`, panel data, marketplace (D30, D31) | [extensions-contract.md](extensions-contract.md) |
| Agent surface: the `fyso` platform MCP (typed tools over the panel workflows) and Dagu's MCP + skill for coding agents (D33) | [agent-surface.md](agent-surface.md) |
| Multi-host: a host is an SSH alias; Dagu workers + OMB VPS computers | [PLAN §13](PLAN.md#13-multi-host-d18) |

## Layer 4 — Execution
*What is being built, in what order, and where it stands.*

| Phase | Goal | Status |
|---|---|---|
| 0 | Spikes: verify the unknowns | ✅ done · [ADR 0001](adr/0001-spikes.md) |
| 1 | Run it: mise, process-compose, Caddy, `up/down/doctor` | ✅ done |
| 2 | Bots: team file, auth, Dagu MCP | ✅ done |
| 3 | Snapshot and replicate | ✅ done |
| 4 | Panel: customization layer (checklist, bots, apps), i18n | ✅ done |
| 5 | Builder (dogfooding) with Dagu `harness.run` | ✅ local delivery complete; remote Builder acceptance pending |
| 5.5 | Bot observability: conversations, execution and AI consumption | ✅ verified locally · [contract](observability.md) |
| 5.6 | Conversational Bot Architect: native bot CRUD and versioning | ✅ verified locally · [contract](bot-architect.md) |
| 6 | Deploy and template lifecycle | ⬜ not started |
| 7 | Extensions: slots, `_template`, sample (NetBird documented, not built) | ✅ done · [contract](extensions-contract.md) |
| 7.1 | Marketplace (git catalogs, panel install) and integrations: Activepieces extension, MCP Registry in the panel | 🟡 marketplace done · next: `fyso-ext-activepieces`, MCP Registry search · [PLAN](PLAN.md#phase-71--marketplace-and-integrations-d31) |
| 7.2 | Agent surface: `fyso` MCP + Dagu MCP and skill for coding agents | ✅ verified locally · [contract](agent-surface.md) |
| 7.3 | Menu bar app: SwiftBar plugin listing every running project (D34) | ✅ verified locally (SwiftBar 2.1.1 on Test 1) |
| 8 | Multi-host: execution hosts over SSH (Dagu workers, OMB computers) | ⬜ not started |

Details and exit criteria: [PLAN §10](PLAN.md#10-phases). Risks: [PLAN §11](PLAN.md#11-risks).

## Layer 5 — Findings and log
*What was learned while building. Feeds back into Layers 1–3.*

| Date | Entry |
|---|---|
| 2026-11-05 | [Phase 0 harness spike](adr/spikes/harness.md): **yes** — Dagu v2.22.4 `harness.run` ran Claude Code and Codex on the subscription logins (no API key) inside throwaway worktrees and returned the result as outputs and artifacts. Caveats for `dev-task`: a denied permission still exits 0 (add a diff gate); the user's CLI config applies (pin the Codex approval policy); stdout is not live; step `working_dir` does not resolve `${steps.*}`. Phase 0 remains open |
| 2026-11-05 | [Phase 0 tooling spike](adr/spikes/tooling.md): exact mise pins with explicit sandbox verification failures/fallbacks; SOPS and fnox age round trips; Dagu Git Sync API edit → commit/push verified against a local bare repo (local-URL clone limitation). Phase 0 remains open |
| 2026-11-05 | [Gateway Phase 0 spike](adr/spikes/gateway.md): cwd Claude MCP works with none/basic auth; Dagu proxy login requires an SSO license and does not authenticate REST/MCP headers; OMB needs pairing, supports proxied SSE, denies framing; panel no-backend flow passes with none/basic auth |
| 2026-11-05 | Research: OMB exposes a team file (`team apply/export`), a Bot API (tool-less turns), MCP servers per bot `cwd`, and memory as Markdown files. Dagu v2 exposes REST `/api/v1`, MCP at `/mcp`, and proxy-header auth |
| 2026-11-05 | Plan simplified around the principle: custom code reduced to the panel SPA and glue scripts |
| 2026-11-05 | The user already runs Dagu (`:18083`, coordinator `:50055`) and OMB (`:8799`, `:8800`, `:8810`, `:8811`). Isolation rules and port blocks were added; spikes use blocks 8410, 8500 and 8600 (8700 has a port in use) |
| 2026-11-05 | Reuse review: Dagu ships `harness.run` (runs Claude Code / Codex), `chat.completion` and Git Sync. herdr leaves the runtime and stays as a dev tool (D15); fnox enters Phase 0 (D16) |
| 2026-11-05 | The panel becomes a customization layer over OMB for the person setting up the project. Chat removed (D13, D14). Panel spec v2 |
| 2026-11-05 | Spike `omb` done: env vars reach the `claude` child (a bad `CLAUDE_CODE_OAUTH_TOKEN` breaks bots, no fallback); team export → apply round-trips with `No changes.`; `--dry-run --json` is a stable preview; memory restores by bot name. OMB needs Node ≥ 24 |
| 2026-11-05 | Extensibility accepted (D17): extensions are Copier templates filling fixed slots; NetBird documented as the reference example, not built |
| 2026-11-05 | Multi-host accepted (D18): a host is an SSH alias; Dagu distributed workers + OMB "bring your own VPS" computers; state stays on the control host |
| 2026-11-05 | **Phase 0 closed** ([ADR 0001](adr/0001-spikes.md)). All four spike branches merged. New decisions: D19 (Dagu basic auth with Caddy's credentials, since proxy auth needs a paid SSO license), D20 (sops + age), D21 (pinned tested versions) |
| 2026-11-05 | **Phase 1 done.** The template generates a project that installs (signature checks on), sets up secrets and runs Dagu + OMB + Caddy with one login, in ~30 s. New D22 (OMB not behind the gateway login; direct on localhost) and D23 (bind to 127.0.0.1 by default). `copier update` verified |
| 2026-11-05 | **Phase 2 done.** Bots are created from `team.yaml` on the first start. The Workflow Architect created and ran a workflow through the Dagu MCP. Bots reuse Dagu's built-in skill via MCP (no copy). Known limit: bots can read the Dagu credentials; they need a separate credential before any server deployment |
| 2026-11-05 | [Phase 4 plumbing](adr/phase-4-plumbing.md): action workflows, read-only configuration and panel gateway; isolated verification recorded in the ADR |
| 2026-11-05 | **Phase 3 done.** The Dagu-scheduled `fyso-snapshot` commits bots and memory (after gitleaks). Wiping `.data/` and running `up` restores bots, memory (the bot recalled the fact) and workflows. Framework workflows reach Dagu through file symlinks (`DAGU_DAG_DISCOVERY_SYMLINKS`); step env is allowlisted (`DAGU_ENV_PASSTHROUGH_PREFIXES`) |
| 2026-11-05 | **Phase 4 panel SPA.** Vite + React + TypeScript in `framework/panel/`, coded against [panel-contract.md](panel-contract.md) and the Claude Design boards: checklist, bots (draft → `fyso-bots-plan` → `fyso-bots-apply`), apps with health, one action component for Dagu runs, ES/EN, light/dark, mock mode. `team.yaml` `${VAR}` placeholders are not valid YAML inside flow maps (`soul: { file: ${FYSO_ROOT}/… }`); the panel swaps them for tokens while parsing |
| 2026-11-05 | **Phase 4 done.** Panel SPA (from the Claude Design boards) + plumbing, built in parallel by Claude and Codex against `panel-contract.md`. Verified end to end against the real stack: checklist 4/4, launcher with health, and edit → preview → apply (snapshot commit, then `bots: update from panel`, model changed in OMB) |
| 2026-11-06 | [Phase 5 Builder](adr/phase-5-builder.md): recovered the interrupted implementation; real Codex → worktree → checks → local commit → cleanup succeeded on Dagu 2.24.0. Generated stack doctor passed. Nine regression tests cover guards and failures. Claude hit its subscription limit. D24 makes remote publication explicit; remote PR acceptance is deferred by the user; local delivery is complete |
| 2026-11-06 | OMB browser access corrected (D25): the packaged server rejects unpaired browsers even on loopback. Caddy holds a native session behind project login; panel links use the gateway. Verified in Chrome and with real HTTP regressions; `doctor` now checks browser-style access. [Evidence](../artifacts/delivery-evidence/phase-5/README.md) |
| 2026-11-06 | Observability work started before deployment: reuse native OMB usage/traces and Dagu history; capture structured harness usage separately. [Contract](observability.md) |
| 2026-11-06 | **Phase 5.5 verified.** Native conversation + delegation, explicit conversation/run linkage, structured Codex usage, restart persistence, browser refresh and guarded summary endpoint. Node 10/Python 16 checks passed; local doctors green. [Evidence](../artifacts/delivery-evidence/observability/README.md) |
| 2026-11-06 | Bot Architect goal started after observability verification: native partial team plans, exact-ID deletion, snapshots before/after mutations, versioned project configuration and real conversational CRUD proof. [Contract](bot-architect.md) |
| 2026-11-06 | **Phase 5.6 verified.** Real conversational create/read/update/delete, native Git audit preserving unrelated bots, imported-skill restore, stale/replay/secret/protected guards, and local user installation. Fixed portable native snapshot bundles and relative team references. Final suite: Node 13/Python 21; doctors green. [Evidence](../artifacts/delivery-evidence/bot-architect/README.md) |
| 2026-11-06 | Native bot discovery (D28): the panel now polls the project OMB roster, including its chief and bots created in the native UI. Manual configuration drafts remain separate and preserved. [Evidence](../artifacts/delivery-evidence/bot-discovery/README.md) |
| 2026-11-06 | Initial private publication in `fyso-dev/agentic-framework`; repository installation guide uses the explicit `preview` branch pending PR review. Full Phase 6 lifecycle acceptance remains pending. |
| 2026-11-06 | [Repository install proof](../artifacts/delivery-evidence/repository-install/README.md): generated directly from GitHub with Copier 9.19.1, initialized Git, installed/resolved pinned tools, encrypted secrets, started isolated services and passed doctor. Fixture stopped afterward. |
| 2026-11-06 | Corrected duplicate bot lists: one native roster with matching configuration actions and pending drafts. Chief/native-only bots remain visible; unchanged stale declarations no longer resurrect native deletions. |
| 2026-11-06 | Native bot import (D29): distinguish project/snapshot/native-only definitions using committed Git evidence and import one native profile into project configuration without modifying OMB. [Verified evidence](../artifacts/delivery-evidence/bot-import/README.md). |
| 2026-11-06 | Unified bot actions: every row opens OMB, while configuration edit and native import remain explicit sibling actions. |
| 2026-11-06 | Initial delivery PR #1 merged into `main` (`9847295`). Installation documentation now targets `main`; historical preview evidence retains its original ref. |
| 2026-11-06 | **Phase 7 done.** Extensions are Copier templates with their own answers file that fill fixed slots ([contract](extensions-contract.md), D30). Verified: mise conf.d, process-compose multi-file merge, Caddy empty-glob import, Dagu recursive discovery (opt-in, kept flat). `.mcp.json` is now generated. Sample v1 → v2 → remove on a live project, doctor green, panel shows extensions. The extension starter ships an authoring README; generated projects document the `ext:*` tasks. |
| 2026-11-06 | **Extension marketplace (D31, [ADR 0002](adr/0002-extension-marketplace.md)).** Git catalogs + version tags; `ext:search`, `ext:add <id>`, panel install/upgrade through Dagu. Verified live: install commits only the slots, upgrade from the panel with uncommitted bot state (clean worktree + fast-forward), new process and route loaded without a restart, doctor green. Findings: process-compose runs commands with the environment of `up` (extensions keep `$VARS` in single quotes after `run-ext.sh`); a fresh project is never clean (restore writes `state/`). Devbox plugins (Nix) and Docker app stores do not replace this; bot integrations come from the MCP Registry and Activepieces (next spike) |
| 2026-11-06 | [Activepieces spike](adr/spikes/activepieces.md): **yes, natively.** Built from the release with bun/node pinned by mise (~3 min, ~3 GB); API ready in 3 s on PGLite + in-memory queue; its MCP (42 tools, OAuth with refresh) ran a piece action (`ap_run_action`) on the native worker. Conditions for the extension: build per version in `.data/ext/`, route without `fyso_login` (MCP OAuth uses `Authorization`), verify the OAuth login path for OMB bots |
| 2026-11-06 | **Agent surface (D33, [contract](agent-surface.md)).** Own MCP server `fyso` (stdio, no dependencies) with typed tools over the panel workflows; Dagu's MCP and skill for coding agents (`DAGU_MCP_AUTH` derived by mise, `mise run agent:setup`). Verified on Test 1: status, bots list, extension search, bot plan (preview), doctor; Dagu MCP 200; Claude Code lists both servers. Finding: until now a coding agent opened in a project could not use the Dagu MCP because `DAGU_MCP_AUTH` only existed inside OpenMausBot |
| 2026-11-06 | Optional engines (D32): Copier `engine` question picks Claude or Codex for every bot, the Builder and `fyso-dev-task`; doctor requires only engines a declared bot uses, and at least one. Verified by generating both variants (rendered models, Builder default, `dev-task` default, doctor login section on a Claude-only host); Node 19/Python 28 (13 skipped) passed. Prompted by Etendo Next, whose host has no Codex login. |
| 2026-11-06 | **Menu bar app (D34).** A SwiftBar plugin instead of a native app: `framework/tray/fyso.10s.py` finds running stacks by their process-compose sockets, reads states over the socket and the project from the socket owner's cwd; `mise run tray:install` links it into SwiftBar. Tests use a fake process-compose on a Unix socket (healthy, degraded, stale, none). Finding: SwiftBar runs plugins with a minimal PATH, so the plugin takes `mise` from the PATH of the running process-compose (started by `mise run up`) instead of hard-coding install locations |
