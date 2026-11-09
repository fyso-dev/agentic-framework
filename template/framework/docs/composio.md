# Composio connector workflows

Composio maintains provider credentials and connected accounts. Dagu controls execution order. The framework uses a small Node REST adapter, not a second scheduler, SDK, or connector registry. No service restart or new port is needed.

## Setup

Connect the app in your Composio project and confirm account status/scopes. Add `COMPOSIO_API_KEY` using `mise run secrets`. The key is loaded with SOPS only inside the connector step; it is not added to the Dagu server environment or bot secret allowlist. The host must have access to the project's age key (the setup default or `SOPS_AGE_KEY_FILE`/`MISE_SOPS_AGE_KEY_FILE` at project startup). `run-dagu.sh` resolves that path into `FYSO_COMPOSIO_AGE_KEY_FILE`, which survives the existing `FYSO_` step allowlist. Only the key-file path is passed, never its contents. Distributed workers are outside this contract.

Create `project/composio/profile.json` using the verified schema and actual identifiers/version from your account:

```json
{
  "tool_slug": "GMAIL_GET_PROFILE",
  "connected_account_id": "REPLACE_WITH_ACCOUNT_ID",
  "user_id": "REPLACE_WITH_OWNER_ID",
  "version": "REPLACE_WITH_PINNED_VERSION",
  "arguments": {}
}
```

This is a shape example, not a ready-to-run request: confirm required arguments in the tool schema first. Do not store tokens or private message bodies in Git. Copy `framework/examples/composio-read.yaml` into `project/workflows/`, validate via your project's Dagu, then run an authorized read-only probe. No schedule is installed by default.

## Execution contract

`node framework/scripts/composio.cjs <request.json>` calls Composio REST v3 with `x-api-key`, explicit connected account, user and tool version. Unknown fields, implicit accounts and `latest` fail. HTTP errors, malformed responses, and tool-level failures exit nonzero. There are no retries. Success prints only the tool's `data` as JSON; Dagu captures stdout. Review data sensitivity before execution. Failure messages omit credentials, request arguments and provider response bodies.

For dynamic inputs, write JSON using a project script with a JSON serializer; never embed untrusted JSON in a shell command. Provider side effects can succeed before a timeout: resolve the outcome at the provider before retrying. Keep write actions behind explicit user authorization and design provider-specific idempotency where supported.

Agents: read `framework/skills/composio-workflows/SKILL.md` before authoring or recovering connector runs. The default Workflow Architect and Run Operator reference it; custom bots can load that same file without an MCP integration.

## Upstream references

- [Composio execute tool v3: authentication, body and result envelope](https://docs.composio.dev/reference/v3/api-reference/tools/postToolsExecuteByToolSlug)
- [Tool schemas and explicit execution](https://docs.composio.dev/docs/tools-direct/executing-tools)
- [Connected accounts](https://docs.composio.dev/docs/auth-configuration/connected-accounts)
