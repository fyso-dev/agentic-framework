# Human requests extension

Copier extension for Dagu human tasks, bundled with the framework template. From a generated project, install it with `mise run ext:add ./framework/extensions/human-requests -- --defaults`. Enable the `human-requests` skill per bot in the panel. No extra service, port, or secret is required.

This is an experimental local implementation, not a published catalog entry. In isolated tests, a real bot created a request through Dagu 2.24.0, a second browser session answered through the authenticated gateway, and the answer returned to the same OpenMausBot conversation. A stopped-server retry was tested with a single fictional effect; the normal generated-stack lifecycle is not yet verified for that experiment. A saved answer is checked against the run's choices before delivery, including for API callers. Dagu stores the answer before this validation: an invalid submission cannot be corrected in place and needs a new request. See the skill for the creation contract.

## Codex bot setup

Enable the `human-requests` skill for each bot that needs it. For a Codex bot, use the panel's **Add MCP** flow to create an enabled stdio server with an exclusive name, command `node`, and these arguments:

```json
["${FYSO_ROOT}/framework/scripts/fyso-mcp.cjs", "--scope", "human-requests", "--system", "ext-human-requests-request"]
```

Assign that MCP server and its Dagu read and execute tools to the bot. The named scope includes the explicitly granted request workflow and any project workflows labeled for that scope. Choose a name that does not collide with an existing native MCP server: restore updates servers with matching names. Managed definitions are saved in `project/omb-mcp.json` and restored through the native OpenMausBot API when the project starts; see the framework's connectors documentation for the existing snapshot and restore behavior. The server definition contains no credentials; the platform supplies Dagu connection settings at runtime.

This workflow scope is a guardrail, not a security boundary: a bot with `native:*` can run commands outside the scoped MCP. Individual identity and authorization are still required for sensitive decisions. The generated-project Codex conversation remained blocked despite a successful native MCP connection test and an OpenMausBot restart: the bot reported that the server was unavailable. This setup is not yet a verified working solution for Codex on OpenMausBot 0.1.141.

The bundled directory is not an independently versioned Copier source. An installation from that directory has no `_commit` reference, and `mise run ext:update human-requests` cannot update it through Copier's normal three-way update. Do not treat a framework update as an automatic update of an installed copy; a versioned extension source or a separately designed migration is still needed.

The recipient label is a routing hint, not authorization. The responder is self-declared. HTTP return is disabled until an operator configures a single exact HTTPS destination and credential; the receiver must implement the [idempotency contract](extensions/human-requests/HTTP.md). OpenMausBot accepts a deterministic send ID for duplicate messages, but acknowledgement does not prove the bot completed its work or that external effects are exactly once. Do not use this for sensitive approvals without individual identity and access controls.
