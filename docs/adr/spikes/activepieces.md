# Spike: Activepieces as a native extension (D31 follow-up)

Date: 2026-11-06 · Result: **yes, with two conditions** · Version: Activepieces `0.87.3-hotfix.1`

Question: can Activepieces (MIT Community Edition, open-source alternative to Composio) run **without Docker** as a framework extension and give bots its connectors through MCP?

## What was run

Shallow clone of the release tag, built and started natively on macOS arm64, isolated port 8690, data in a throwaway directory.

| Step | Command | Result |
|---|---|---|
| Dependencies | `bun install --frozen-lockfile` (bun 1.3.1 and node 24.15.0 pinned through mise) | 6,241 packages, 2 min, 2.4 GB `node_modules` |
| Build | `npx turbo run build --filter=web --filter=@activepieces/engine --filter=api --filter=worker` (same as the `Dockerfile`) | 34 s; 77 MB `dist` |
| Run | `node packages/server/api/dist/src/bootstrap.js` (`AP_CONTAINER_TYPE=APP`) + `node packages/server/worker/dist/src/bootstrap.js`, with `AP_DB_TYPE=PGLITE`, `AP_REDIS_TYPE=MEMORY`, `AP_ENVIRONMENT=prod` | API ready in **3 s**; the worker connects after a few retries |
| Onboarding | `POST /api/v1/authentication/sign-up`, then `POST /api/v1/platforms {name}` with the onboarding token | platform + project created (sign-up alone returns no platform in this version) |
| MCP | `POST /api/v1/projects/:id/mcp-server/token` → `POST /mcp` (StreamableHTTP) | `initialize` OK, **42 tools** (`ap_research_pieces`, `ap_list_connections`, `ap_run_action`, flows, tables, runs) |
| Real action | `ap_run_action` `@activepieces/piece-date-helper` / `get_current_date` | `{"result":"2026-11-06"}` in 4 s; the piece is downloaded on demand |

Resources: API ~540 MB RSS, worker ~85 MB; 89 MB of PGLite data; 2.8 GB for the built source tree. The catalog lists 13,851 piece versions fetched from the Activepieces cloud (internet needed for new pieces).

## Findings

- **Native works.** Two processes (API, worker) map directly to two process-compose processes; PGLite and the in-memory queue remove PostgreSQL and Redis (single instance only, which matches a project).
- **Tools are Composio-like.** `ap_run_action` runs any piece action once with a saved connection (`ap_list_connections`); flows with the MCP trigger become extra tools. Connections (OAuth to Gmail, Slack…) are created in the Activepieces UI.
- **MCP auth is OAuth only** (dynamic client registration, PKCE, 15-minute access tokens, 30-day refresh tokens). `/mcp-server/token` mints a 15-minute token for scripts. Claude Code supports this flow; a headless bot needs one browser login per Claude config. Whether OpenMausBot bots share the user's Claude Code MCP credentials is **not verified yet**.
- **Behind Caddy:** OAuth metadata URLs are built from `X-Forwarded-Host` (verified: with `activepieces.localhost:18400` the `resource_metadata` URL keeps the port). Caddy sends that header by default.
- **No gateway login on its routes.** Caddy basic auth and MCP OAuth both use `Authorization`, so the extension's route must not `import fyso_login`; Activepieces has its own users (same reasoning as D22 for OMB).
- **Install cost.** A build from source needs ~3 GB and ~3 minutes per version. An extension should build once per version in `.data/ext/activepieces/` (mise task), not on every start.
- **License.** MIT outside `packages/ee/` and `packages/server/api/src/app/ee/`; the Community Edition runs without them.

## Conditions for `fyso-ext-activepieces`

1. Build per version into `.data/ext/activepieces/<version>` from a mise task (bun + node pinned), start the two processes from there through `run-ext.sh`.
2. Route without `fyso_login`; `AP_FRONTEND_URL` = `http://activepieces.localhost:${FYSO_HTTP_PORT}`; secrets `AP_ENCRYPTION_KEY`, `AP_JWT_SECRET` declared in `secrets.yaml`.
3. Verify the MCP OAuth login path for OMB bots before calling it done.
