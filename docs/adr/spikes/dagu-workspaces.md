# Spike: a subset of workflows per bot with Dagu workspaces

Date: 2026-11-10 · Result: **yes, natively, with one structural cost** · Version: Dagu `2.24.0` (the project's pin)

Question: can an OpenMausBot bot be given only a subset of the project's workflows, using what Dagu already has, without a filtering proxy of our own?

## What was run

The pinned Dagu binary, started alone with its own home, workflow folder and ports (29721–29727), `DAGU_AUTH_MODE=builtin` and an initial administrator. No project's Dagu was touched. Three workflows: `ventas-report` (`labels: [workspace=ventas]`), `ops-backup` (`workspace=ops`) and `fyso-snapshot` (no label, as the framework's workflows are today).

| Step | Call | Result |
|---|---|---|
| Login | `POST /api/v1/auth/login` | JWT, 24 h (`DAGU_AUTH_TOKEN_TTL`, up to 8760 h) |
| Workspaces | `POST /api/v1/workspaces {name}` | `ventas`, `ops` created; a label alone does not create one |
| Key A | `POST /api/v1/api-keys`, `workspaceAccess: {all:false, grants:[{workspace:"ventas", role:"operator"}]}`, `allowedSurfaces:["mcp"]` | created |
| Key B | same, `ops` as `developer` | created |
| Third key | same | **403**: "Community edition supports up to 2 API keys" |

Each key then called Dagu's MCP (`Authorization: Bearer <key>`), the same three tools bots use.

| Through `/mcp` | Key A: `ventas`, operator | Key B: `ops`, developer |
|---|---|---|
| List workflows | only `ventas-report` | only `ops-backup` |
| Search "backup" (all workspaces) | nothing | `ops-backup` |
| Read own workflow's spec | yes | yes |
| Read the other workspace's spec | not found | not found |
| Read `fyso-snapshot` (no workspace) | not found | not found |
| Run own workflow | succeeded | succeeded |
| Run the other workspace's workflow | insufficient permissions | insufficient permissions |
| Run `fyso-snapshot` | insufficient permissions | insufficient permissions |
| Run history | own runs only | own runs only |
| Run an inline spec with no workspace | refused | refused |
| Run an inline spec labelled with its workspace | refused | **succeeded** |
| Create a workflow in its workspace | refused | yes |
| Create one in the other workspace, or with no workspace | refused | refused |
| Overwrite the other workspace's workflow | refused | refused (conflict) |
| Delete own workflow | not applicable | yes |
| Write a wiki page in its workspace | refused | yes |
| Write a wiki page in the other workspace or the default one | refused | refused |
| REST `/api/v1/dags` with the same key | 403, "not allowed for this surface" | 403 |

Also checked: a Basic header is rejected in builtin mode (401); with `DAGU_AUTH_BASIC_*` and `builtin` both set Dagu refuses to start ("auth.basic credentials are set but auth.mode is builtin"); the administrator's JWT opens `/mcp`; keys and their grants survive a restart.

## Findings

- **The scope is enforced, not cosmetic.** Lists and searches are narrowed, reads of anything else answer "not found", and execution is refused. Workflows without a workspace label, which is every `fyso-*` and `ext-*` workflow today, are invisible to a scoped key with no change to them.
- **Roles give the second axis.** `operator` runs and reads; `developer` also writes workflows and wiki pages, confined to its workspace.
- **`developer` means commands on the host.** A developer key can run an inline spec labelled with its own workspace, so it executes arbitrary commands as the project user. `operator` cannot. A bot that should only use a subset needs `operator`.
- **No license for workspaces or scoped keys, but two keys at most.** Two groups of bots per project in the community edition; more needs a Dagu license. Additional users also need one, so users are not a way around it.
- **Builtin auth replaces basic auth; they cannot coexist.** This is the cost. D19 chose basic auth so Caddy, the panel passthrough, `dagu-client.cjs`, the `fyso` MCP and the `dagu` entry of `.mcp.json` all send one static header derived from the project login. With builtin auth they need a bearer credential instead: the administrator's JWT (expires, 24 h by default) or an API key (spends one of the two).
- **Assignment is a label in the workflow file**, so it is versioned in `project/workflows/` like everything else. Workspaces themselves are Dagu state (created through the API), so `up` or restore has to recreate them, as it does bots.

## Limits of what a subset means

- It scopes the **Dagu tools** of a bot, not the bot's process. A bot with native tools (shell, files) in the project folder can still read `project/workflows/` and, today, the technical Dagu credential (known since Phase 2). The subset is a guardrail for what a bot does through MCP, and it becomes a boundary only for bots without shell access.
- All bots share one folder and therefore one generated `.mcp.json`, so the unit is a **group of bots per key**: one server entry per group (for example `dagu-ventas` with its key in a `BOT_*` secret), selected per bot with the existing selector (`mcp:dagu-ventas:*`).

## Recommendation

Feasible and not complex in itself: no code of ours filters anything. Do it only together with the auth change, as one decision that supersedes D19:

1. Dagu in builtin mode; the framework's own callers (Caddy, panel, `dagu-client.cjs`, `fyso` MCP) use a bearer credential. Prefer the administrator JWT with a long TTL renewed at `up`, so both API keys stay free for bot groups.
2. Workflows opt in with `labels: [workspace=<name>]`; `fyso-*` and `ext-*` stay unlabelled and therefore out of every scoped key.
3. Up to two bot groups, each an `operator` key in a `BOT_*` secret and its own entry in `project/mcp.json`; the default `dagu` entry stays for bots that need everything (Workflow Architect, Run Operator, Builder).

Not worth doing: a proxy of ours that filters workflows, or scoping by tool selector (it selects tools, not workflows).

## Not verified

- An OpenMausBot bot using a scoped entry end to end; only Dagu's side was exercised.
- The framework running on builtin auth (Caddy, panel, doctor, `fyso` MCP): this spike did not change the template.
- Whether the forwarded Dagu tools of D57 should use a scoped key for desktop agents.
- Behaviour of scheduled runs and of `fyso-dev-task` under builtin auth.
