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
| Decisions log (D1–D23; D6, D9 superseded; D16 resolved by D20) | [PLAN §2](PLAN.md#2-decisions-log) |
| Architecture decision records | [adr/0001-spikes.md](adr/0001-spikes.md): Phase 0 results and D19–D21 |

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
| Configuration (native formats only) | [PLAN §5](PLAN.md#5-configuration--native-formats-only) |
| Versioning: snapshot, memory, replication | [PLAN §6](PLAN.md#6-versioning--the-simple-model) |
| Bots and the `dev-task` flow | [PLAN §7](PLAN.md#7-bots) |
| Auth (subscription and API keys) and health checks | [PLAN §8](PLAN.md#8-auth-and-health-checks) |
| Panel: customization layer over OMB, rules and i18n | [PLAN §9](PLAN.md#9-panel-customization-layer--launcher-the-only-real-custom-code) |
| Panel design spec v2 (for Claude Design) | [panel-spec.md](panel-spec.md) |
| Panel ↔ framework contract (files, Dagu API, action workflows) | [panel-contract.md](panel-contract.md) |
| Extensibility: tools/services as Copier extensions; bot tools (MCP) and skills; NetBird as reference example | [PLAN §12](PLAN.md#12-extensibility-d17) |
| Multi-host: a host is an SSH alias; Dagu workers + OMB VPS computers | [PLAN §13](PLAN.md#13-multi-host-d18) |

## Layer 4 — Execution
*What is being built, in what order, and where it stands.*

| Phase | Goal | Status |
|---|---|---|
| 0 | Spikes: verify the unknowns | ✅ done · [ADR 0001](adr/0001-spikes.md) |
| 1 | Run it: mise, process-compose, Caddy, `up/down/doctor` | ✅ done |
| 2 | Bots: team file, auth, Dagu MCP | ✅ done |
| 3 | Snapshot and replicate | ✅ done |
| 4 | Panel: customization layer (checklist, bots, apps), i18n | 🚧 in progress · SPA built in `template/framework/panel/` (mock mode, `dist/` committed); action workflows and Caddy routes pending |
| 5 | Builder (dogfooding) with Dagu `harness.run` | ⬜ not started |
| 6 | Deploy and template lifecycle | ⬜ not started |
| 7 | Extensions: slots, `_template`, sample (NetBird documented, not built) | ⬜ not started |
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
