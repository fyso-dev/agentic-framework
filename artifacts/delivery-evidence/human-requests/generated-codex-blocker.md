# Generated-project Codex integration blocker

On 2026-11-14, the normal generated-project lifecycle passed setup, startup and an unskipped green doctor. A real Codex-backed OpenMausBot 0.1.141 conversation then failed to access the project's scoped Dagu MCP. This is a failed end-to-end prerequisite, not a passing human-request conversation test.

The project-only native MCP definition was saved in `project/omb-mcp.json`, registered in OpenMausBot and passed its native connection test. Codex nevertheless reported that the server was unavailable. An intermediate attempt failed because OpenMausBot injected `OMB_MCP_RESTART` and its Codex driver rejected that reserved variable. Restarting only that project's OpenMausBot preserved its definition and conversation, but a further attempt still reported the MCP unavailable. No successful tool activity or controlled effect was observed. The bot reported that it did not create the request; a diagnostic CLI status used a potentially different Dagu configuration and does not independently establish absence from the active instance.

No personal OpenMausBot or Dagu service was used. The five original project bots were preserved; one fictional review bot was added. The disposable project remains running. A diagnostic Dagu CLI command created example DAG files in its own data directory; they were left intact.

The older real Claude-backed fixture validates a separate bot/browser/return path, not this generated Codex integration. The native Codex setup instructions remain unverified as a working solution. Do not claim full generated-project acceptance or release readiness. Resolving MCP availability in the OMB Codex driver remains required before claiming the complete goal.
