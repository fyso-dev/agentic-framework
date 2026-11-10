# SilverBullet extension

See the framework's `docs/silverbullet-extension.md` for the contract and evidence.
From a generated project, install this bundled template with:

```sh
mise run ext:add ./framework/extensions/silverbullet -- --defaults
mise run doctor
```

Open `http://docs.<slug>-<port>.localhost:<port>` with the project's web login.
The service serves `project/wiki/`, without replacing existing pages. Removal
retains those project-owned files. Native MCP is not available in the pinned
stable release: the extension uses the official filesystem MCP instead.

Bots: installing does not enable the bundled `project-knowledge` skill. Switch
it on per bot in the panel (Bots → a bot → Profile → Skills), then review and
apply. For bots with a tool allow-list the toggle also selects the
`silverbullet` MCP server.

This bundled source has no independent Git tag. After updating the framework,
reapply it with `mise run ext:add ./framework/extensions/silverbullet -- --defaults
--overwrite`. Wiki pages are preserved. VCS-based `ext:update` requires an
independently tagged extension source.
