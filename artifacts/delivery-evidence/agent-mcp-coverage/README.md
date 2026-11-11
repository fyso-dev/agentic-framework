# Agent understanding and MCP coverage (D57)

## Overview

An agent that reaches a project only through its `fyso` MCP server (Claude Desktop, Codex) could read a generic guide and manage bots and extensions. It could not see what the project contains, read any of its files, or touch workflows, runs, the wiki or code. This change closes most of that, mostly by forwarding Dagu's own MCP instead of writing new tools.

## Measured

Inventory: 37 things a person or agent does to understand a project and build on it ([`tests/fixtures/agent-coverage.json`](../../../tests/fixtures/agent-coverage.json), checked by a test). Seven are left to a person on purpose (secrets, start/stop, logins, OAuth, removing extensions, web users, connecting an assistant), so 30 are in scope.

| | Before (D33) | After (D57) |
|---|---|---|
| Tools a desktop agent sees | 14 | 29 (26 `fyso_*` + 3 forwarded `dagu_*`) |
| In-scope actions covered | 12 of 30 (40%) | 28 of 30 (93%) |
| Project-specific text at `initialize` | none (5,888 chars, the same for every project) | a brief of this project's bots, workflows, extensions, wiki and MCP servers |
| Project files readable | none | `project/`, `extensions/`, `AGENTS.md`, `README.md`, framework guides, skills, examples, souls |
| Works with the stack stopped | guide only | guide, project map, file reads |

Not covered yet (2): adding or removing a custom MCP server for bots (the panel does it through the gateway, there is no workflow to wrap), and writing a project file directly. The second is reachable today through `fyso-dev-task`, which produces a branch a person merges; see the proposal in [agent-surface.md](../../../docs/agent-surface.md#open-decisions).

## Real run

[`transcript.json`](transcript.json): a disposable project generated from this branch (port block 29700, Dagu 2.24.0, OpenMausBot 0.1.141, its own age key and data), stack up, `mise run doctor` green before and after. The server was started the way `agent:connect` registers it, from `/`. No other project on the machine was touched.

| Step | Tool | Result |
|---|---|---|
| Project map | `fyso_project` | 5 declared bots, 14 workflows with owner and params, guides |
| List and read files | `fyso_files`, `fyso_file_read` | `project/` listed; `AGENTS.md` read |
| Boundaries | `fyso_file_read` | `secrets.enc.yaml`, `project/auth/tinyauth.yaml` and `project/../.data/…` refused |
| Processes and logs | `fyso_logs` | 5 processes; last 3 Dagu lines |
| Bot application access | `fyso_app_access` | permissions and revision of Run Operator |
| Connector preferences | `fyso_connector_preferences` | both switches off, not versioned |
| Authoring reference | `dagu_read` | Dagu's own reference |
| New workflow | `dagu_change` preview, then apply | `project/workflows/orders-summary.yaml` written by Dagu |
| Run and wait | `dagu_execute` | succeeded in 2.1 s; listed in run history |
| Missing workflow | `dagu_execute` | tool error `resource_not_found` |
| Wiki | `dagu_change`, `dagu_read` | `project/wiki/operations/orders-summary.md` written and found by search |
| Code task | `dagu_execute` on `fyso-dev-task` | Claude Code created `project/apps/orders/app.yaml` on branch `agent/orders-app`, one commit, 14 s |
| Stack stopped | `fyso_project`, `fyso_file_read` | still answer; `dagu_read` and `fyso_logs` say the stack is down and how it starts; the 3 Dagu tools stay listed from the last good list |

The brief in the transcript names a `welcome-customer` workflow and one wiki page: an earlier exploratory run on the same disposable project left them there.

## Workflow scopes (D60)

[`workflow-scopes.json`](workflow-scopes.json): the scope `ventas`, configured and exercised on the same disposable project.

| Step | Through | Result |
|---|---|---|
| Classes | `fyso_workflow_scopes` | 13 system workflows (`fyso-*`), 3 project workflows unscoped, 3 bots with full Dagu access |
| Create the scope | `fyso_workflow_scope_save` | 2 project workflows labelled `workspace=ventas`, 1 system workflow granted, `dagu-ventas` in `project/mcp.json`, one commit |
| Invalid requests | `fyso_workflow_scope_save` | a system workflow as member and the name `system` refused |
| Give it to a bot | `fyso_bot_plan`, `fyso_bot_apply` | bot created with `["native:*", "mcp:dagu-ventas:*"]`; without `native:*` OpenMausBot refused the plan |
| See it | `fyso_workflow_scopes`, `fyso_project` | scope lists its workflows, grant and bot; each workflow shows `class` and `scope` |
| Remove while in use | `fyso_workflow_scope_delete` | refused: "bots still use dagu-ventas" (removed and recreated earlier with no bot) |
| Scope server | 22 calls | 7 allowed (list, spec, run, run history, read by URI, granted system workflow, reference); 15 refused (other project and system workflows, inline spec, `targetType`, free query, URI outside and with a path escape, wiki, search, change, platform tool) |
| **Real bot turn** | OpenMausBot in the browser, Claude Haiku 4.5 | listed the 3 workflows, ran `orders-summary` with `SHOP=este` (run confirmed in Dagu), and reported the refusal of `fyso-snapshot` and `hello` |

The first bot turn failed: OpenMausBot reported `dagu-ventas` as `CONNECTION_CLOSED`. The entry started through `mise exec`, which could not decrypt the project's secrets inside the bot's environment. It now runs plain `node` and uses the Dagu header OpenMausBot already gives bots; the second turn is the one recorded.

## Automated

`node --test tests/fyso-mcp.test.cjs tests/agent-connect.test.cjs`: 21 passed with the pinned `yaml` package on `PATH` (19 passed and 2 skipped without it). Scope cases: the guard's allow and refuse table (over 40 calls), saving, replacing, moving and removing scopes in a git repository, and the scope server against a fake Dagu (nothing refused reaches Dagu; run lists filtered). Earlier cases: project map from a repository fixture; file confinement (secrets, login users, hidden files, runtime data, `..`, absolute paths, symlinks leaving the project, binary files); Dagu forwarding against a fake Dagu MCP (definitions and results unchanged, only `dagu_*`, session recovery, event-stream answers, last good list when Dagu is down); `--no-dagu`; workflow parameters of the new tools; the inventory figures above.

The confinement test caught a defect during this work: the folder listing followed a symlink out of the project. Fixed before the live run.

## Not verified

- A scope does not isolate a bot: Claude bots keep native tools, and nothing here tests a bot trying to bypass the scope through its shell.
- Only one scope and one bot were exercised live; no extension (`ext-*`) workflow existed in the disposable project, so that class was covered by tests only.
- No desktop app conversation was exercised (Claude Desktop, Codex): the server was driven over stdio by a script.
- `fyso_app_access_plan` / `_apply` and `fyso_connector_preferences_save` ran only against the fake Dagu; the disposable project had no authorized application to grant, and the workflows behind them are unchanged.
- OpenMausBot bots were not re-tested with the `--no-dagu` argument in `.mcp.json`; `doctor` (bots match the team file) passed with it.
- Distributions (D56, `dist:*`) merged while this was built: they are not in the inventory, and the real run predates the rebase onto them. The Node tests were rerun after the rebase (18 passed).
- The panel's own "open conversation" prompt still names only `fyso_context` and `fyso_status`; changing it needs a panel build.
