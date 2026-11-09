# Panel MCP connection actions

The MCP page now runs `fyso-agent-connect` using the existing Dagu enqueue/poll action flow. Connect and Disconnect buttons replace copyable registration commands. The installer's native connector performs the change. The page explains that configuration belongs to the Dagu host/user and labels demo mode explicitly.

## Validation

- `npm run build --prefix template/framework/panel`: passed.
- `node --test tests/agent-connect.test.cjs`: 5 passed, using an isolated temporary home and fake native CLIs. Covers registration, disconnection, invalid inputs and connector failure propagation.
- `dagu validate template/framework/workflows/agent-connect.yaml`: passed (installed CLI warns about existing command syntax).
- `bash scripts/check-paths.sh`: passed.

## Limits

The updated button flow has not yet been exercised against a running generated Dagu stack or a real assistant account. No personal assistant configuration was modified. Generated-project doctor and updated browser captures remain pending. Earlier manual ES/EN inspection covered the guide before this action change.
