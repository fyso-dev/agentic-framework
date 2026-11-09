# Panel MCP connection guide

The panel exposes `#/mcp` with installer-equivalent instructions for Claude Desktop, Codex and Claude Code. Environment: local mock fixture. Validation: manual Chrome and automated build checks.

## User flow

Open Connect MCP → open a terminal in the generated project → start the project → copy the appropriate `agent:connect` command → restart the assistant session → request `fyso_context` and `fyso_status`. Optional disconnect commands preserve project data.

## Acceptance

| Behavior | Result | Evidence |
|---|---|---|
| Guide and all three native commands render | ✅ | Manual Chrome accessibility snapshot, Spanish and English mock fixture |
| Correct project server name | ✅ | Mock fixture renders `fyso-foo-project` |
| Type checking and production bundle | ✅ | `npm run build --prefix template/framework/panel` |
| Existing connector behavior | ✅ | `node --test tests/agent-connect.test.cjs`: 4 passed |
| Portable paths | ✅ | `bash scripts/check-paths.sh` |
| Generated stack doctor | ⚠️ | Root template has no doctor task; `mise run doctor` reports unknown command |
| Screenshot artifact | ⚠️ | Chrome screenshot tool denies output to the worktree because it is outside its configured workspace roots |

## Manual browser evidence

Entry: local Vite preview, `?mock=ready#/mcp`. Switching ES → EN renders the translated guide. The visible Spanish page includes all connection and disconnection commands, session instructions and the project server name. No console errors observed. Mock mode does not exercise backend requests or register a real assistant. Existing browser runner is not required for this static guide; manual inspection used the connected Chrome surface.

## Limitations

No live assistant configuration was changed. Clipboard behavior reuses the existing CopyLine component. Generated runtime doctor and screenshots remain pending; this is not full runtime acceptance.
