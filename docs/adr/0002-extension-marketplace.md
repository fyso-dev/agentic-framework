# ADR 0002 — Extension marketplace (D31)

Date: 2026-11-06 · Status: accepted · Phase 7 follow-up

## Context

Extensions (D30) are Copier templates kept in their own repos and installed with `mise run ext:add <src>`. Nothing tells a person **which extensions exist**, and installing one needs a terminal. PLAN §12.1 said "no registry is needed": that remains true for the list of *installed* extensions (the answers files), but not for discovery.

Before building anything, two questions: does an existing tool already give us extensions plus a catalog (so we would be reinventing it), and is there an open-source integration base (like Composio) that bots could use instead of writing extensions?

## Existing software checked

### Devbox (Jetify) — closest match for the extension mechanism

Devbox [plugins](https://www.jetify.com/docs/devbox/guides/creating-plugins) are a `plugin.json` with `env`, `create_files` and `init_hook`; services are a `process-compose.yaml` that Devbox merges and runs with [process-compose](https://github.com/jetify-com/devbox/blob/main/plugins/README.md), exactly like our `process.yaml` slot. Third-party plugins are included from git (`"include": ["github:org/repo?dir=…"]`).

| | Devbox | This framework |
|---|---|---|
| Tool pinning, env, services with process-compose | yes | yes (mise + process-compose) |
| Catalog / discovery of third-party plugins | none: built-ins are compiled into the binary ([jetify-com/devbox-plugins](https://github.com/jetify-com/devbox-plugins) is a small repo), others are found on GitHub | catalog repos + `ext:search` |
| Install from a UI | no | panel → Dagu workflow |
| Upgrades | `create_files` copies files; no merge with local edits found in the docs | `copier update` (3-way merge) |
| Routes, MCP servers, workflows, secrets, panel tiles | would still need our slots | slots (contract §2) |
| Requirements | [Nix required](https://www.jetify.com/docs/devbox/installing-devbox); Windows only through WSL2 ([devbox#10](https://github.com/jetify-com/devbox/issues/10)) | mise with aqua-signed binaries (D1, D21) |

**Result:** Devbox validates the design (same engine, same "merge fragments" pattern) but would replace mise with Nix without removing any of our own pieces. The catalog and the panel install do not exist there either. Kept: mise + Copier.

Self-hosted app stores (Runtipi, Umbrel, CasaOS, Coolify templates) do have a catalog repo and an install button, but they are built on Docker; this framework runs native processes (PLAN §3).

### Integration bases for bots (the "open-source Composio" question)

Bots consume tools through MCP (`.mcp.json`, team file `tools: allow mcp:<server>:*`), so the base must speak MCP.

| Option | License | Fit |
|---|---|---|
| [Official MCP Registry](https://modelcontextprotocol.io/registry) | open; API + `server.json`, designed for subregistries | The catalog of MCP servers. Adding one = an entry in `project/mcp.json`; no extension needed |
| [Activepieces](https://mcp.so/servers/activepieces) | MIT (Community Edition) | ~760 "pieces" (SaaS connectors with OAuth), each exposed as MCP. The open-source Composio replacement; fits as an **extension** (`fyso-ext-activepieces`). Native run without Docker not yet verified |
| [ACI.dev](https://mcp.so/servers/aci) | Apache 2.0 | 600+ tools behind one MCP server; 2026 maintenance status not confirmed |
| [ToolHive](https://github.com/stacklok/toolhive) | Apache 2.0 | Runs MCP servers isolated, but in containers |
| [Nango](https://nango.dev/docs/guides/platform/self-hosting.md) | Elastic License; free self-host is auth only | Not open source |
| Metorial, n8n | FSL / fair-code | Not open source |

Sources for the comparison: [TrueFoundry](https://www.truefoundry.com/blog/composio-alternatives), [Scalekit](https://www.scalekit.com/blog/composio-alternatives), [GitHub topic composio-alternative](https://github.com/topics/composio-alternative).

## Decision (D31)

1. **Catalogs are git repos** with a `marketplace.yaml` at the root (the model of Claude Code plugin marketplaces). `project/marketplaces.yaml` lists the catalogs a project uses; the official one is `gh:fyso-dev/fyso-extensions`. Reviewed through PRs, no server.
2. **Versions are git tags** of each extension repo, read live with `git ls-remote`. The catalog never stores versions; publishing a release is pushing a tag.
3. **CLI:** `mise run ext:search [text]`; `mise run ext:add <id>` resolves the id through the catalogs and pins the latest tag. `ext:add` passes the first free port of the extension block as `extension_port`.
4. **Panel:** browse the catalogs and install/upgrade through two Dagu workflows (`fyso-ext-catalog`, `fyso-ext-install`), like the bots actions. Install commits only the extension's slots. Upgrade runs `copier update` in a clean `git worktree` of `HEAD` and fast-forwards, because a running project always has uncommitted state. New processes and routes load without a restart (`process-compose project update`, Caddy restart). Removing stays a terminal task.
5. **Integrations for bots** are not a framework concern: MCP servers come from the official MCP Registry (into `project/mcp.json`), and large connector sets come as extensions (first candidate: Activepieces).

## Consequences

- Custom code: `marketplace.cjs` (~140 lines), the `apply`/`search` branches of `ext.sh`, two workflow files and one panel section.
- Extension authors must keep `$VARS` out of the process-compose shell (single quotes after `run-ext.sh`) and run probes through `run-ext.sh`: process-compose expands commands with the environment of the last `mise run up`, which lacks an extension installed from the panel (contract §3).
- OpenMausBot keeps the environment of its start: new MCP servers and `BOT_*` secrets from a hot install reach bots after the next `mise run up`.
- Next: a spike to run Activepieces natively as an extension; a panel search over the MCP Registry.
