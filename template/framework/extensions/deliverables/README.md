# deliverables extension

A panel page and a login-protected site (`files.<web domain>`) where files produced
by bots appear with a download link, served by Caddy's native `file_server`, plus a
small `deliver` tool (CLI and stdio MCP). Contract, decision (D68) and evidence:
the framework's `docs/owner-extensions.md`.

From a generated project:

```sh
mise run ext:add ./framework/extensions/deliverables -- --defaults
mise run doctor
```

The guide people and agents read after installing is
`extensions/deliverables/README.md`. This file stays in the extension source.
