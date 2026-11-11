# SilverBullet extension

See the framework's `docs/silverbullet-extension.md` for the contract and evidence.
Published independently as [fyso-ext-silverbullet](https://github.com/fyso-dev/fyso-ext-silverbullet), starting at **v0.1.0**, in the official catalog.
From a generated project, install the tagged extension with:

```sh
mise run ext:add silverbullet -- --defaults
mise run doctor
```

The panel gets a **Conocimiento** (Knowledge) section with the editor and the
ways to feed it: write, ask a bot, or copy Markdown files into `project/wiki/`.
**Importar con IA** uploads a folder or zip (Uppy + tusd) and the
`ext-silverbullet-import` workflow turns it into pages with the project's
engine; it never overwrites a page.
The full-window editor is `http://docs.<slug>-<port>.localhost:<port>`, for the
people who may open the panel.
The service serves `project/wiki/`, without replacing existing pages. Removal
retains those project-owned files. Native MCP is not available in the pinned
stable release: the extension uses the official filesystem MCP instead.

Bots: installing does not enable the bundled `project-knowledge` skill. Switch
it on per bot in the panel (Bots → a bot → Profile → Skills), then review and
apply. For bots with a tool allow-list the toggle also selects the
`silverbullet` MCP server.

For catalog/Git installations, use `mise run ext:update silverbullet -- --defaults`.
The bundled copy remains available by path. Existing bundled installations can
migrate with `mise run ext:add gh:fyso-dev/fyso-ext-silverbullet -- --defaults
--overwrite --vcs-ref v0.1.0`. Wiki pages are preserved. See the full contract
for update and migration details.
