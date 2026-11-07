# Fyso Biz extension

Biz is a consumer of the framework's generic [extension pages contract](extensions-contract.md#9-extension-owned-tabs-and-pages), not a screen built into the framework SPA. Its own page source, translations, styles, compiled assets, bot and MCP connection live in `framework/extensions/biz` (the bundled Copier source). Installation writes only that extension's slots.

## Installation and user flow

```sh
mise run ext:add framework/extensions/biz -- --defaults
mise run secrets
# Add BOT_FYSO_BIZ_TOKEN to the encrypted YAML.
mise run down
mise run up
mise run biz:check
```

- The extension registers the **Fyso Biz** tab through `extensions/biz/pages/overview.yaml`. It appears only while installed; the generic route is `/#/extensions/biz/overview`.
- Its connection hook creates **Biz Partner** through native Bot Architect plan/apply with business context, `ask` approval, computer off and project-root cwd (the native `fyso-biz` MCP). It picks an actually offered model from an available engine. Repeat connections reuse the same owned bot without changing customizations; an unrelated name collision fails.
- Choose an authorized department to read KPIs and active objectives with their KRs. Open an objective's plan to see its native palancas, assignments, latest requests, pending check-in and open decisions.
- Parent navigation, language and theme come from the generic host. Page content and translations belong to Biz. The optional panel SDK reuses the existing Dagu action client, UI primitives, React runtime and authenticated project store via native ES modules.
- The panel is read-only. The dedicated bot uses native Biz tools; work creation, authorization, execution and acceptance remain separate explicit decisions.

The origin defaults to `https://fyso.biz`; the MCP endpoint is `/api/mcp`. For another origin, install with `-d biz_url=https://example.org`.

## Native business contract

The connected MCP server is authoritative. The read adapter uses initialization, paginated `tools/list`, JSON/SSE transport, HTTPS origins, disabled redirects, response-size bounds and request timeouts.

| Surface | Native read |
|---|---|
| Departments, KPIs, active objectives/KRs | `contexto({departamento_id?})` |
| Requests | `listar_solicitudes({})`, followed by selected-department filtering |
| Objective plan, palancas and decisions | `vision_objetivo({objetivo_id})`, only when advertised read-only |

Missing and denied capabilities are explicit. Null measurements remain distinct from zero; threshold ranges retain both bounds. A failed refresh clears previously displayed data. Changing department invalidates pending objective reads. Historical Dagu results from another connection are not reopened.

Tokens stay in sops and process environment, never URLs, workflow parameters, browser storage or page outputs. `.mcp.json` contains only an environment placeholder. People with access to the project's gateway share the token owner's Biz scope; use separate generated projects for separate credentials. Dagu retains selected business fields under the project's access and retention rules. Extension pages are trusted installed code, not a separate security principal.

## Authoring and distribution

Build the framework host/SDK and the independent Biz page from the framework checkout:

```sh
npm --prefix template/framework/panel run build
node template/framework/panel/node_modules/typescript/bin/tsc -p template/framework/extensions/biz/tsconfig.json --noEmit
node template/framework/panel/node_modules/vite/bin/vite.js build --config template/framework/extensions/biz/vite.config.mjs
```

Only compiled `extensions/biz/panel/` assets are installed; `panel-src/` and authoring configs are excluded by Copier. Another extension may use plain HTML or a different frontend; no Biz code or name is part of the host router/navigation.

The bundled source is currently a directory without an independent release tag. Reapply its Copier source after framework updates; publishing a separate repository/catalog release remains outside this local delivery. Terminal installation leaves slots uncommitted for review. Bot Architect owns the bot's guarded team changes and Git snapshots/commit. Removal deletes extension slots and hides the tab, but retains encrypted secrets, runtime data and the project-owned bot. Delete that bot explicitly through Bot Architect if desired.

## Test connection

Use ignored `.data/biz-test/connection.env` (mode `600`):

```dotenv
FYSO_BIZ_URL=https://fyso.biz
BOT_FYSO_BIZ_TOKEN=
BOT_FYSO_BIZ_SECONDARY_TOKEN=
FYSO_BIZ_TEST_DEPARTMENT_ID=
```

The optional second token should represent another test user's department scope. Never paste credentials into chat, source, screenshots or command arguments. The isolated project below `.data/biz-test/project` has its own port block, encrypted secrets, OMB and Dagu. [Validation evidence](../artifacts/delivery-evidence/fyso-biz/README.md).
