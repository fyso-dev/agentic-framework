# Connector source recovery

Recovered on 2026-11-08 from local tool-input records after the temporary worktree and generated project disappeared. The persistent worktree is under the repository data directory; no machine-specific path is part of the source contract.

## Recovered scope

- Connector panel, app connection state and custom native MCP/OAuth controls.
- Per-bot connector selection, native Bot Architect validation and discovery MCP tool.
- Composio process environment mapping without importing host credentials.
- Native Claude source preferences, their workflow and startup restoration.
- ES/EN resources, browser test sources and Node regression coverage.
- Historical evidence narratives, explicitly marked as recovered records.

## Current validation

- Panel TypeScript and production build: passed.
- `node --test tests/*.test.cjs`: 56 passed, 0 failed.
- `bash scripts/check-paths.sh`: passed.
- Git whitespace checks: passed.

Socket-based Node tests used local-listener permission. No external provider was contacted by those tests. The production bundle retains Vite's chunk-size advisory.

## Boundaries

The recovery retains the original branch baseline (`ff52fba`); it has not been integrated with newer main authentication and extension changes. Decision identifiers in the recovered contracts belong to that historical baseline and must be reconciled during integration.

The generated test project, its encrypted configuration, running services and historical PNG captures were not recovered. Historical browser assertions in evidence documents describe the previous run, not a new acceptance run. Screenshot links are marked unavailable rather than recreated from invented output.

A new isolated project and its Composio project key are required before real account authorization and bot tool execution can be verified. No personal OpenMausBot instance, inherited credentials, external account or user connection was accessed. No commit, remote publication, service restart or deployment is part of this recovery.
