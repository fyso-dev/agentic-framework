---
name: composio-workflows
description: Include authenticated Composio connector actions in deterministic Dagu workflows.
---

# Composio in Dagu

1. Read `framework/docs/composio.md`. Inspect the selected tool's current schema in the Composio catalog; never guess slugs, arguments, or versions. OAuth connection setup belongs to the operator in Composio, not a scheduled DAG.
2. Have the operator put `COMPOSIO_API_KEY` in `secrets.enc.yaml` through `mise run secrets`. Never request the value in chat or use a `BOT_*` variable. The adapter decrypts that one key at execution time. Never interpolate it into YAML, commands, logs, or outputs.
3. Confirm the exact connected account, owning user, granted scopes and a pinned tool version. Use separate project-owned request JSON files for distinct accounts. Inspect arguments for secrets before versioning them.
4. Copy `framework/examples/composio-read.yaml` to `project/workflows/` and author the request under `project/composio/`. The adapter takes exactly one JSON file path; do not interpolate JSON or user text into shell commands.
5. Use Dagu MCP preview/apply and validation for the installed version. Capture small non-sensitive results with `output`; results are stored in Dagu logs/history. For private payloads, design a project-specific redaction/storage step before using this adapter.
6. Execute only authorized actions. Start with a read-only probe. Creating a workflow is not permission to send mail, publish, delete or make purchases. Do not run write examples merely to test them.
7. No automatic retries for writes: transport errors/timeouts have an unknown outcome. Check the provider before any retry or resume that could repeat an action. `successful: false` fails even with HTTP 200; errors deliberately omit provider bodies.

For an existing project, these framework files arrive through `copier update`; project workflows and bot definitions remain project-owned. Existing bots may need their soul/skill references updated explicitly with the Bot Architect. Never replace their profiles just to add these instructions.
