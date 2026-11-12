# Deliverables

A place in the panel where the files bots produce appear with a download link.

- **Panel:** *Entregables / Deliverables* lists the files, newest first.
- **Address:** `http://files.<web domain>:<port>/.ui/index.html`, behind the project's web login.
  People who may open the panel may open it; restrict it by declaring the app
  `files` in `project/auth/tinyauth.yaml`.
- **Tool for bots:** MCP server `deliverables` with `deliver` (copy a file there,
  return its link) and `deliveries` (list). Switch the `deliver-files` skill on per
  bot in the panel (Bots → a bot → Profile → Skills); for bots with a tool
  allow-list the switch also selects the server.
- **From a workflow or a terminal:**

  ```sh
  framework/scripts/run-ext.sh deliverables -- node extensions/deliverables/deliver.cjs put <file> --name "<name>"
  mise run deliverables:list
  ```

## What to know

- Files live in `.data/ext/deliverables/files/`. They are **runtime data**: not in
  git, not in snapshots, and not removed by `ext:remove`. Back the folder up with
  the machine, and delete old files there by hand.
- A delivery never replaces a file: a taken name gets a number.
- Only files inside the project, up to 100 MB. Secrets, keys, login files and
  snapshots are refused.
- Files are always sent as downloads, never rendered in the browser.
- New bots see the MCP server after the next `mise run up` (OpenMausBot reads
  `.mcp.json` at start).
