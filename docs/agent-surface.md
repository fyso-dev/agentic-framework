# Agent surface: the platform MCP and Dagu for coding agents (D32)

Two separate things, both available to any MCP client opened in a project (Claude Code, Codex, OpenMausBot bots):

1. **`fyso` — the platform's own MCP server.** Typed tools for what the panel does: inspect the project, build bots, install extensions, run checks and snapshots.
2. **Dagu for agents — Dagu's own MCP and authoring skill**, so an agent can design, run and debug workflows.

Both come from the project's generated `.mcp.json` (sources: `framework/mcp.json`, contract in [extensions-contract.md §4](extensions-contract.md#4-mcpjson-is-generated)).

## 1. `fyso` MCP server

`framework/scripts/fyso-mcp.cjs`, MCP over **stdio**, no dependencies, started as `mise exec -- node framework/scripts/fyso-mcp.cjs` from the project root (mise loads the ports and the decrypted login). No port, no process in the stack.

**Rule:** every change goes through the **same Dagu workflows as the panel** (contract in [panel-contract.md §3](panel-contract.md#3-action-workflows)); the server never edits project files itself. A tool waits for its run and returns the workflow output; a failed run comes back as a tool error with Dagu's step error and run id.

| Tool | Does | Through |
|---|---|---|
| `fyso_status` | project, health of Dagu/OMB/gateway, apps, installed extensions (secret **presence** only), bot versioning | `panel-data.cjs config` + `health.sh` (read-only) |
| `fyso_check` | setup checklist | `fyso-setup-check` |
| `fyso_doctor` | `mise run doctor` output and result | `doctor.sh` (read-only) |
| `fyso_bots_list`, `fyso_bot_read` | native bots, one profile + revision | `fyso-bot-architect` `OP=list\|read` |
| `fyso_bot_plan` | preview create/update/delete of one bot → `planId` | `fyso-bot-architect` `OP=plan` |
| `fyso_bot_apply` | apply a plan by `planId` (snapshot, apply, commit) | `fyso-bot-architect` `OP=apply` |
| `fyso_bot_import` | version a native-only bot | `fyso-bot-architect` `OP=import` |
| `fyso_ext_search` | catalog entries, latest version, install state | `fyso-ext-catalog` |
| `fyso_ext_install` | install (`add`) or upgrade (`update`) one extension | `fyso-ext-install` |
| `fyso_snapshot` | save bots and memory to git | `fyso-snapshot` |
| `fyso_observability` | conversations, execution, AI consumption | `fyso-observability` |

**Not exposed, on purpose** (terminal tasks for a person): secret values (`mise run secrets`), removing extensions (`mise run ext:remove`), starting/stopping the stack (`mise run up/down`). The server's `instructions` tell agents to plan before applying bots and never to ask for secret values.

## 2. Dagu for coding agents

- **MCP:** the `dagu` entry of `.mcp.json` (`http://127.0.0.1:${FYSO_DAGU_PORT}/mcp`, header `Authorization: ${DAGU_MCP_AUTH}`). `DAGU_MCP_AUTH` is derived by mise from the project login (`mise.toml`, never stored), so an agent started inside the project's mise environment (`mise activate`, or `mise exec -- claude`) authenticates. OpenMausBot sets the same value for bots. Tools: `dagu_read`, `dagu_execute`, `dagu_change`.
- **Skill:** `mise run agent:setup` installs Dagu's own `dagu` authoring skill, **pinned to this project's Dagu version**, with the [`skills`](https://github.com/vercel-labs/skills) CLI 1.7.6 (`dagucloud/dagu@v<version> --skill dagu -a claude-code codex --copy`, telemetry off) into `.claude/skills/dagu` and `.agents/skills/dagu`. Those folders are rebuildable and git-ignored. Bots keep reading the same reference over MCP (Phase 2).

## Verification (2026-11-06, Test 1 project)

- `fyso` over stdio, started exactly as `.mcp.json` does: `initialize`; `fyso_status` (services ok, apps, extensions); `fyso_bots_list` (4 native bots); `fyso_ext_search` (official catalog, install state); `fyso_bot_plan` (a "Soporte" bot, preview only, not applied); `fyso_doctor` (all checks passed).
- `DAGU_MCP_AUTH` from the sops-encrypted login matches the gateway header; Dagu MCP `initialize` → 200. `claude mcp list` in the project shows `dagu` and `fyso`.
- Tests: `tests/fyso-mcp.test.cjs` (stdio handshake, tool list, workflow params and parsed outputs, failures and bad arguments as tool errors).
- Not run here: `mise run agent:setup` (downloads the `skills` CLI from npm; run it once per project).
