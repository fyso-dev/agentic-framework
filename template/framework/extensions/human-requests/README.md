# Human requests extension

Copier extension for Dagu human tasks. Published independently as [fyso-ext-human-requests](https://github.com/fyso-dev/fyso-ext-human-requests), starting at **v0.1.0**, in the official catalog. From a generated project, install the tagged extension with `mise run ext:add human-requests -- --defaults`, then run `mise run doctor`. Enable the `human-requests` skill per bot in the panel. No extra service, port, or secret is required.

This is a beta. In isolated tests, a real bot created a request through Dagu 2.24.0, a second browser session answered through the authenticated gateway, and the answer returned to the same OpenMausBot conversation. A stopped-server retry was tested with a single fictional effect; the normal generated-stack lifecycle is not yet verified for that experiment. A saved answer is checked against the run's choices before delivery, including for API callers. Dagu stores the answer before this validation: an invalid submission cannot be corrected in place and needs a new request. See the skill for the creation contract.

## Bot setup (scoped Dagu access)

Enable the `human-requests` skill for each bot that needs it. For a bot without full Dagu access, use the panel's **Add MCP** flow to create an enabled stdio server with an exclusive name, command `node`, and these arguments:

```json
["${FYSO_ROOT}/framework/scripts/fyso-mcp.cjs", "--scope", "human-requests", "--system", "ext-human-requests-request"]
```

Assign that MCP server and its Dagu read and execute tools to the bot. The named scope includes the explicitly granted request workflow and any project workflows labeled for that scope. Choose a name that does not collide with an existing native MCP server: restore updates servers with matching names. Managed definitions are saved in `project/omb-mcp.json` and restored through the native OpenMausBot API when the project starts; see the framework's connectors documentation for the existing snapshot and restore behavior. The server definition contains no credentials; the platform supplies Dagu connection settings at runtime.

This workflow scope is a guardrail, not a security boundary: a bot with `native:*` can run commands outside the scoped MCP. Individual identity and authorization are still required for sensitive decisions.

On OpenMausBot 0.1.141 with the Codex CLI 0.169.0, a Codex bot does not see this server or any other project MCP server; it sees the host user's personal Codex servers instead. That is a problem of the engine integration, not of this setup, and the same bot on a Claude model completes the whole flow. Until it is resolved, use a Claude model for bots that create requests. Details are in the framework's delivery evidence for human requests.

For catalog/Git installations, use `mise run ext:update human-requests -- --defaults`. The bundled copy remains available by path (`./framework/extensions/human-requests`), but an installation from it has no `_commit` and cannot use Copier's normal update. Commit pending project changes, then migrate it once with `mise run ext:add gh:fyso-dev/fyso-ext-human-requests -- --defaults --overwrite --vcs-ref v0.1.0`; existing answers are reused.

The recipient label is a routing hint, not authorization. The responder is self-declared. HTTP return is disabled until an operator configures a single exact HTTPS destination and credential; the receiver must implement the [idempotency contract](extensions/human-requests/HTTP.md). OpenMausBot accepts a deterministic send ID for duplicate messages, but acknowledgement does not prove the bot completed its work or that external effects are exactly once. Do not use this for sensitive approvals without individual identity and access controls.
