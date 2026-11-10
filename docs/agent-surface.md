# Agent surface: the platform MCP and Dagu for coding agents (D33)

Two separate things, both available to any MCP client opened in a project (Claude Code, Codex, OpenMausBot bots):

1. **`fyso` — the platform's own MCP server.** Typed tools for what the panel does: understand and inspect the project, build bots, install extensions, run checks and snapshots. For agents that reach only this server it also forwards Dagu's tools (D57).
2. **Dagu for agents — Dagu's own MCP and authoring skill**, so an agent can design, run and debug workflows.

Both come from the project's generated `.mcp.json` (sources: `framework/mcp.json`, contract in [extensions-contract.md §4](extensions-contract.md#4-mcpjson-is-generated)).

## 1. `fyso` MCP server

`framework/scripts/fyso-mcp.cjs`, MCP over **stdio**, no dependencies, started as `mise exec -- node framework/scripts/fyso-mcp.cjs --no-dagu` from the project root (mise loads the ports and the decrypted login). No port, no process in the stack.

**Rule:** every change goes through the **same Dagu workflows as the panel** (contract in [panel-contract.md §3](panel-contract.md#3-action-workflows)); the server never edits project files itself. A tool waits for its run and returns the workflow output; a failed run comes back as a tool error with Dagu's step error and run id.

| Tool | Does | Through |
|---|---|---|
| `fyso_project` | what the project contains: declared bots, workflows (owner, description, schedule, params), apps, extensions with their guides and skills, MCP servers, wiki pages, readable guides, recent commits | `project-map.cjs`, repository only (works with the stack stopped) |
| `fyso_files`, `fyso_file_read` | list and read the project's text files: `project/`, `extensions/`, `AGENTS.md`, `README.md`, framework guides, skills, examples and souls | `project-map.cjs` (read-only, confined, 256 KB) |
| `fyso_status` | project, health of Dagu/OMB/gateway, apps, installed extensions (secret **presence** only), bot versioning | `panel-data.cjs config` + `health.sh` (read-only) |
| `fyso_check` | setup checklist | `fyso-setup-check` |
| `fyso_doctor` | `mise run doctor` output and result | `doctor.sh` (read-only) |
| `fyso_bots_list`, `fyso_bot_read` | native bots, one profile + revision | `fyso-bot-architect` `OP=list\|read` |
| `fyso_bot_plan` | preview create/update/delete of one bot → `planId` | `fyso-bot-architect` `OP=plan` |
| `fyso_bot_apply` | apply a plan by `planId` (snapshot, apply, commit) | `fyso-bot-architect` `OP=apply` |
| `fyso_bot_import` | version a native-only bot | `fyso-bot-architect` `OP=import` |
| `fyso_app_access`, `fyso_app_access_plan`, `fyso_app_access_apply` | one bot's access to connected applications: read (+ revision), preview → `planId`, apply (verify, commit) | `fyso-app-access` `OP=read\|plan\|apply` |
| `fyso_connector_preferences`, `fyso_connector_preferences_save` | whether Claude bots load the person's own MCP servers and skills | `fyso-connector-preferences` `OP=read\|save` |
| `fyso_logs` | processes of the stack; last lines of one (at most 500) | `pc.sh process list\|logs` (read-only) |
| `fyso_ext_search` | catalog entries, latest version, install state | `fyso-ext-catalog` |
| `fyso_ext_install` | install (`add`) or upgrade (`update`) one extension | `fyso-ext-install` |
| `fyso_snapshot` | save bots and memory to git | `fyso-snapshot` |
| `fyso_observability` | conversations, execution, AI consumption | `fyso-observability` |

**Not exposed, on purpose** (terminal tasks for a person): secret values (`mise run secrets`), removing extensions (`mise run ext:remove`), starting/stopping the stack (`mise run up/down`), web login users, engine logins and application OAuth. The server's `instructions` tell agents to plan before applying bots and never to ask for secret values.

### Understanding the project (D57)

`initialize.instructions` is the operating guide followed by a **brief of this project**: its declared bots, project workflows, extensions, apps, wiki size and MCP servers. `fyso_project` returns the full map and names the files worth reading; `fyso_files` and `fyso_file_read` read them. All three read the repository only, so they answer with the stack stopped.

Readable: `AGENTS.md`, `README.md`, `project/**`, `extensions/**`, `framework/agent-context.md`, `framework/docs`, `framework/skills`, `framework/examples`, `framework/bots/souls`. Never readable: `secrets.enc.yaml` and anything outside those roots (`.data/`, `state/`, scripts), `project/auth/` (login users), hidden files, names containing `secret`, `credential` or `token`, key files, binary files, and links that leave the project. The server still writes nothing.

### Forwarded Dagu tools (D57)

A desktop app cannot use the `dagu` entry of `.mcp.json`: it needs the project login as a header. So `fyso` forwards Dagu's own three tools, `dagu_read`, `dagu_execute` and `dagu_change`, with **Dagu's names, schemas, annotations and results unchanged** (`dagu-mcp.cjs`: a streamable-HTTP client with the project's basic auth, one lazy session, reopened when Dagu restarts). Through them a desktop agent gets, with no code of ours:

| Need | Dagu call |
|---|---|
| List, read, search workflows; Dagu's authoring reference | `dagu_read target=dags\|dag_spec\|dag_search\|reference` |
| Create, edit, rename, delete a workflow (preview, then apply) | `dagu_change` |
| Run, stop, retry, approve; wait for the result | `dagu_execute` |
| Run history, step logs | `dagu_read target=runs\|run\|run_logs\|step_log` |
| Code on a branch | `dagu_execute name=fyso-dev-task wait=true` |
| Project wiki (`project/wiki/`): read, search, write | `dagu_read target=wiki\|wiki_page\|wiki_search`, `dagu_change type=upsert_wiki_page` |

- **Where:** on by default, so entries already registered by `agent:connect` gain the tools after `copier update` and a new conversation. `framework/mcp.json` passes `--no-dagu`: inside the project folder, and for bots, Dagu is already its own server and nothing is listed twice.
- **Dagu down:** the last good tool list is kept in `.data/panel/dagu-mcp-tools.json`, because desktop apps list tools once at start. A call then fails with "Dagu is not reachable" and how the stack is started. With no list ever fetched the three tools are absent.
- **Trust:** `dagu_execute` accepts inline specs, so it runs commands on the host as the project user. That is what the `dagu` server already gives agents opened in the project folder and what a locally registered stdio server can do anyway; the tools keep Dagu's `destructiveHint`, so desktop apps ask before calling them. **The remote HTTP MCP planned in D52 must not forward these tools as they are**; it needs its own scoping decision.

### Coverage

35 actions inventoried in [`tests/fixtures/agent-coverage.json`](../tests/fixtures/agent-coverage.json), 7 left to a person on purpose. Of the 28 in scope a desktop agent covered 12 (43%) with D33 and covers 26 (93%) now; a test keeps the figures and the tool names true. [Evidence and real run](../artifacts/delivery-evidence/agent-mcp-coverage/README.md).

### Open decisions

1. **Custom MCP servers for bots.** The panel adds and removes them through the gateway (`managed-mcp.cjs`), not through a workflow, so there is nothing to wrap. Proposal: a `fyso-managed-mcp` workflow with the same plan/apply shape as bots, then `fyso_mcp_plan` / `fyso_mcp_apply`; header values stay a person's job (sops).
2. **Writing project files** (`project/apps/*/app.yaml`, `project/mcp.json`, soul files). Proposal: no write tool. `fyso-dev-task` already does it on a branch that a person merges, verified in the real run; a direct write tool would be the first path that changes project files without the panel's workflows or a review.
3. **Distributions (D56)** merged while this was built: `dist:publish`, `dist:add` and `dist:update` are not in the inventory and have no tool. They replace `project/**` wholesale, so they look like a person's task; decide before adding them.
4. **A subset of workflows per bot.** Dagu does it natively with workspaces and scoped API keys ([spike](adr/spikes/dagu-workspaces.md)): enforced over MCP, free for two keys, but it needs builtin auth in place of basic auth (D19). Proposed as one decision together with that auth change; nothing in this change depends on it.
5. **The panel's opening prompt** (`#/mcp`) still names only `fyso_context` and `fyso_status`; align it with `agent-connect.cjs` in the next panel build.

## 2. Dagu for coding agents

- **MCP:** the `dagu` entry of `.mcp.json` (`http://127.0.0.1:${FYSO_DAGU_PORT}/mcp`, header `Authorization: ${DAGU_MCP_AUTH}`). `DAGU_MCP_AUTH` is derived by mise from the project login (`mise.toml`, never stored), so an agent started inside the project's mise environment (`mise activate`, or `mise exec -- claude`) authenticates. OpenMausBot sets the same value for bots. Tools: `dagu_read`, `dagu_execute`, `dagu_change`.
- **Skill:** `mise run agent:setup` installs Dagu's own `dagu` authoring skill, **pinned to this project's Dagu version**, with the [`skills`](https://github.com/vercel-labs/skills) CLI 1.7.6 (`dagucloud/dagu@v<version> --skill dagu -a claude-code codex --copy`, telemetry off) into `.claude/skills/dagu` and `.agents/skills/dagu`. Those folders are rebuildable and git-ignored. Bots keep reading the same reference over MCP (Phase 2).

## Shared operating context

`template/framework/agent-context.md` is the local, template-owned operating guide: architecture, ownership, isolation, task routing, procedures, verification and desktop tool limitations. The platform MCP includes the guide in `initialize.instructions` and exposes read-only `fyso_context` without Dagu or a running stack. CLI `AGENTS.md`, every default bot soul (including Chief), and desktop opening prompts point to the same guide. Role instructions keep their narrower permissions. No generated configuration or user-home instructions are overwritten.

Copier updates refresh the framework guide. Existing project-owned team declarations and runtime souls are preserved: adopting new role instructions requires an explicit bot update; this change does not silently reapply existing bots. New generated projects include the Chief soul by default.

## Verification (2026-11-06, Test 1 project)

- `fyso` over stdio, started exactly as `.mcp.json` does: `initialize`; `fyso_status` (services ok, apps, extensions); `fyso_bots_list` (4 native bots); `fyso_ext_search` (official catalog, install state); `fyso_bot_plan` (a "Soporte" bot, preview only, not applied); `fyso_doctor` (all checks passed).
- `DAGU_MCP_AUTH` from the sops-encrypted login matches the gateway header; Dagu MCP `initialize` → 200. `claude mcp list` in the project shows `dagu` and `fyso`.
- Tests: `tests/fyso-mcp.test.cjs` (stdio handshake, tool list, workflow params and parsed outputs, failures and bad arguments as tool errors).
- Not run here: `mise run agent:setup` (downloads the `skills` CLI from npm; run it once per project).

## 3. Connect desktop and CLI agents (D36)

`.mcp.json` only reaches agents opened inside the project folder. To manage a project from **Claude Desktop** or **Codex** anywhere:

```sh
mise run agent:connect                   # desktop apps found on this Mac (Claude Desktop, Codex)
mise run agent:connect claude-code       # Claude Code CLI as well (opt-in)
mise run agent:disconnect                # remove this project's entry
mise run agent:open [codex|claude-desktop]   # new conversation about this project
node framework/scripts/agent-connect.cjs status   # JSON: installed and connected, per agent
```

`agent:open` uses the apps' own deep links (read from their bundles): **`codex://threads/new?path=<project>&prompt=…`** opens a Codex thread in the project folder; **`claude://claude.ai/new?q=…`** opens a Claude Desktop chat, restarting Claude first when it runs, because it loads MCP servers only at start. The first message is typed in, not sent: it asks to use `fyso-<slug>` starting with `fyso_status`.

| Target | How | Notes |
|---|---|---|
| `claude-desktop` | merges `~/Library/Application Support/Claude/claude_desktop_config.json` (keeps other keys, writes `*.fyso-backup`) | no CLI exists for it; restart Claude Desktop |
| `codex` | `codex mcp add` (the ChatGPT app bundles the Codex CLI) | app and CLI share `~/.codex/config.toml` |
| `claude-code` | `claude mcp add --scope user` | opt-in |

The entry is named **`fyso-<slug>`**, one per project: a plain `fyso` may already exist (e.g. the Fyso cloud server). It runs `mise -C <project> exec -- node framework/scripts/fyso-mcp.cjs`, an absolute launcher, because desktop apps start servers with a minimal `PATH` and no project folder. Verified: started that way from `/` with only the system `PATH`, the server answers and `fyso_status` reports the project. Tests: `tests/agent-connect.test.cjs` (fake HOME and CLIs).

**From the panel (D52).** *Maneja el proyecto desde tu IA* (`#/mcp`, linked from Setup) runs the same script through the `fyso-agent-connect` workflow: `MODE=status` returns `{server, agents: [{id, label, desktop, found, connected}]}` (connected = `fyso-<slug>` in the Claude Desktop JSON, a `[mcp_servers.<name>]` table in `$CODEX_HOME/config.toml`, or the user-scope `mcpServers` of `~/.claude.json`); `connect`, `disconnect` and `open` (Codex, Claude Desktop) act on one agent. The actions change the Dagu host's apps, so the page shows them only when it is opened through a loopback name; remote access is the planned HTTP MCP with a token (D52).

The Dagu MCP is not registered globally: it needs the project's login as a header, which stays inside the project's mise environment. Desktop agents reach its tools through `fyso-<slug>` instead (forwarded, D57).

### Shared context verification (2026-11-06)

Nine targeted MCP/agent-connect tests passed, including real stdio initialization and an offline context call with no Dagu fixture, plus fake-home desktop/CLI registration checks. `git diff --check` and the repository path check passed. No desktop app or live bot conversation was exercised. `mise run doctor` is unavailable in the template checkout (no root runtime task); generated-stack doctor acceptance remains unverified.

### Understanding and coverage verification (2026-11-10)

Disposable project generated from the branch (port block 29700), stack up, doctor green before and after, server driven over stdio as `agent:connect` registers it. An agent-shaped sequence read the project map and files, was refused secrets, login users and runtime data, read logs and a bot's application access, then built a workflow, ran it, wrote and searched a wiki page and produced a code branch with `fyso-dev-task`, all through `fyso`. With the stack stopped the map and file reads still answered. 18 Node tests passed. No desktop app conversation was exercised. [Evidence](../artifacts/delivery-evidence/agent-mcp-coverage/README.md).
