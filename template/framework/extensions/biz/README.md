# Fyso Biz — installable extension

Biz owns its pages, business adapter, contextual bot and MCP configuration. The framework only reads generic page registrations.

```sh
mise run ext:add framework/extensions/biz -- --defaults
mise run secrets
# Add BOT_FYSO_BIZ_TOKEN to encrypted secrets.
mise run down
mise run up
mise run biz:check
```

The extension registers its page through `extensions/biz/pages/overview.yaml`. The Fyso Biz tab appears after installation and uses `/#/extensions/biz/overview`. Its source, translations and styles live in `panel-src/`, compiled public assets in `extensions/biz/panel/`. The optional framework panel SDK is a standard hosted ES module; pages may also use plain static HTML. Authoring files are excluded from generated projects.

The idempotent connection hook creates **Biz Partner** through native Bot Architect plan/apply: inline business context, an offered model, project-root cwd/MCP access, computer off and ask approval. Reconnections reuse its ID and preserve customizations; unrelated name collisions fail. Missing secrets defer the hook until startup after configuration. Removing the extension retains the project-owned bot, data and encrypted secret.

Read-only Dagu adapters reuse native Biz tools: `contexto`, `listar_solicitudes` and `vision_objetivo`. The token stays in sops/process environment. Local panel access shares its owner's scope; no browser visitor gets separate Biz authentication. Native bots can perform instructed mutations under Biz permissions; requests, execution and acceptance are separate decisions.

Default origin: `https://fyso.biz`, endpoint `/api/mcp`. Set another origin with `-d biz_url=https://example.org`. The bundled source has no independent tag yet; reapply its Copier source for local updates. Git-source releases use the standard extension lifecycle once published.

Authoring and validation: `docs/fyso-biz.md` and `docs/extensions-contract.md` in the framework repository.
