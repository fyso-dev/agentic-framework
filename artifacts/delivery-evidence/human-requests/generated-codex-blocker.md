# Generated-project Codex integration blocker

On 2026-11-14, the normal generated-project lifecycle passed setup, startup and an unskipped green doctor. A real Codex-backed OpenMausBot 0.1.141 conversation then failed to access the project's scoped Dagu MCP. This is a failed end-to-end prerequisite, not a passing human-request conversation test.

The project-only native MCP definition was saved in `project/omb-mcp.json`, registered in OpenMausBot and passed its native connection test. Codex nevertheless reported that the server was unavailable. An intermediate attempt failed because OpenMausBot injected `OMB_MCP_RESTART` and its Codex driver rejected that reserved variable. Restarting only that project's OpenMausBot preserved its definition and conversation, but a further attempt still reported the MCP unavailable. No successful tool activity or controlled effect was observed. The bot reported that it did not create the request; a diagnostic CLI status used a potentially different Dagu configuration and does not independently establish absence from the active instance.

No personal OpenMausBot or Dagu service was used. The five original project bots were preserved; one fictional review bot was added. The disposable project remains running. A diagnostic Dagu CLI command created example DAG files in its own data directory; they were left intact.

The older real Claude-backed fixture validates a separate bot/browser/return path, not this generated Codex integration. The native Codex setup instructions remain unverified as a working solution. Do not claim full generated-project acceptance or release readiness. Resolving MCP availability in the OMB Codex driver remains required before claiming the complete goal.

## Follow-up, 2026-11-14: the cause is the Codex engine, not this extension

Same generated project and OpenMausBot 0.1.141, with the Codex CLI found on the host (0.169.0, not pinned by the project).

| Check | Observation |
| --- | --- |
| A standard project bot on Codex (Workflow Architect, `mcp:dagu:*`) asked to list workflows with its Dagu tools | Answered that Dagu was unavailable and listed the MCP servers it did see: the **host user's personal Codex servers**, among them the Dagu MCP of other projects. None of this project's servers |
| The fixture bot on Codex, with `mcp:dagu-hrfixture:*` and that server registered natively and passing OpenMausBot's connection test | Same: personal servers visible, the project's server absent |
| The `codex app-server` command line OpenMausBot launched for that turn | It passes `-c mcp_servers.<personal>.enabled=false` for each personal server and mounts `mcp_servers.dagu-hrfixture` through its gate proxy. The session did not reflect either |
| The same fixture bot switched to a Claude model | It saw `dagu-hrfixture` and its two tools at once |

So OpenMausBot asks Codex for the right thing and this Codex does not apply it. Codex 0.169.0 has an app-server daemon and a `proxy` subcommand; a session served by a long-lived daemon that loaded the user's configuration would explain it. That explanation was not proven. `.mcp.json` in the project root is read by OpenMausBot only for the Claude engine, so a Codex bot depends entirely on this mounting.

This affects every Codex bot of a generated project, with or without this extension, and it is an isolation problem: project bots can reach the user's personal MCP servers and other projects' Dagu. It needs its own decision: report it upstream, pin a Codex version the runtime supports, or make Claude the default engine until it is fixed. A doctor check that a Codex bot can see the project's Dagu would catch it.

## The full loop on the Claude engine

With the fixture bot on `claude/claude-sonnet-5-5`, in a new conversation and following only the extension's skill:

1. The bot created a request for its own conversation through the scoped Dagu MCP. Its first attempt was refused by the request validation; it read the error and created a valid one, which reached the waiting state with `assignee` and `choices-hex` labels.
2. A question sent as a push-back was answered by the bot in 4 seconds, without acting on the request.
3. After the decision, the delivery step succeeded and the bot continued in that conversation: it wrote the note in the chosen tone.

One framework change was needed: the scope guard of the scoped Dagu MCP (D60) refused the `labels` argument, which requests rely on. It now lets a run carry plain labels and still refuses any `workspace` label, the one that decides what a scope may see. This is a change to a security guard and should be reviewed as such.
