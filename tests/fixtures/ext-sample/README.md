# Sample extension

Install with `mise run ext:add <source> -- --vcs-ref v1 --defaults`.
The static server has no MCP protocol: its MCP entry is a configuration-merge
fixture only, not a working MCP endpoint. SAMPLE_TOKEN is optional and is never
served. Run `mise install` after adding it. Restart the project to load routes
and processes. The port defaults to the project's answers via Copier 9.19.1
`_external_data`.
