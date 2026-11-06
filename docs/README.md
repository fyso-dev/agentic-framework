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
| Decisions log (D1–D16; D6 and D9 superseded) | [PLAN §2](PLAN.md#2-decisions-log) |
| Architecture decision records | `adr/` *(starts with Phase 0: `adr/0001-spikes.md`)* |

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

## Layer 4 — Execution
*What is being built, in what order, and where it stands.*

| Phase | Goal | Status |
|---|---|---|
| 0 | Spikes: verify the unknowns | ⏳ next |
| 1 | Run it: mise, process-compose, Caddy, `up/down/doctor` | ⬜ not started |
| 2 | Bots: team file, auth, Dagu MCP | ⬜ not started |
| 3 | Snapshot and replicate | ⬜ not started |
| 4 | Panel: customization layer (checklist, bots, apps), i18n | ⬜ not started · 🎨 design spec v2 ready for Claude Design |
| 5 | Builder (dogfooding) with Dagu `harness.run` | ⬜ not started |
| 6 | Deploy and template lifecycle | ⬜ not started |

Details and exit criteria: [PLAN §10](PLAN.md#10-phases). Risks: [PLAN §11](PLAN.md#11-risks).

## Layer 5 — Findings and log
*What was learned while building. Feeds back into Layers 1–3.*

| Date | Entry |
|---|---|
| 2026-11-05 | Research: OMB exposes a team file (`team apply/export`), a Bot API (tool-less turns), MCP servers per bot `cwd`, and memory as Markdown files. Dagu v2 exposes REST `/api/v1`, MCP at `/mcp`, and proxy-header auth |
| 2026-11-05 | Plan simplified around the principle: custom code reduced to the panel SPA and glue scripts |
| 2026-11-05 | The user already runs Dagu (`:18083`, coordinator `:50055`) and OMB (`:8799`, `:8800`, `:8810`, `:8811`). Isolation rules and port blocks were added; spikes use blocks 8410, 8500 and 8600 (8700 has a port in use) |
| 2026-11-05 | Reuse review: Dagu ships `harness.run` (runs Claude Code / Codex), `chat.completion` and Git Sync. herdr leaves the runtime and stays as a dev tool (D15); fnox enters Phase 0 (D16) |
| 2026-11-05 | The panel becomes a customization layer over OMB for the person setting up the project. Chat removed (D13, D14). Panel spec v2 |
