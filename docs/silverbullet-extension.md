# SilverBullet knowledge extension

An opt-in bundled Copier extension, under `template/framework/extensions/silverbullet/`.
It fills the existing extension slots ([contract](extensions-contract.md)) without
changing a project's team file or framework configuration. Decisions: **D53**
(the extension) and **D54** (per-bot skill toggle), [PLAN](PLAN.md).

## Components and source of truth

| Concern | Existing component |
|---|---|
| Web wiki | SilverBullet **2.12.1**, native release binary through mise's GitHub backend |
| Agent tools | Official `@modelcontextprotocol/server-filesystem` **2.2.0**, installed through mise |
| Documents | **`project/wiki/`**, already used by Dagu and included in the framework snapshot paths |
| Browser access | `http://docs.<slug>-<port_base>.localhost:<port_base>`, behind the framework's web login (`import fyso_login`) |
| Process | `ext-silverbullet`, loopback only, on the extension port (first free port of `port_base + 10…19`) |
| Agent instructions | `project-knowledge` skill, enabled per bot in the panel |

SilverBullet reads and edits the same Markdown files that agents access. The
extension creates an initial `index.md` on startup only if it does not exist.
It never overwrites an existing home page. No automatic Git commit is added by
the extension; the project's snapshot workflow and Git policy apply. An enabled
snapshot schedule already commits and pushes wiki changes.

Stable 2.12.1 contains **no native MCP server**. The native MCP documentation on
the upstream **edge** site describes a different development version. This
extension deliberately uses an existing filesystem server instead of shipping
a custom adapter or pinning an unreleased build.

## Install in a generated project

```sh
mise run ext:add ./framework/extensions/silverbullet -- --defaults
mise run doctor
```

`ext:add` picks the first free extension port, installs the pinned tools and,
when the stack is running, loads the process and the gateway route without a
restart. The extension is installed **by path** because it ships inside the
template; it is not in a marketplace catalog yet, so the panel's marketplace
does not list it for install. The framework template preserves the bundled
`copier.yml` and uses `.slotjinja` internally, so outer Copier rendering does
not consume its variables.

## Connect agents

Install adds a stdio server named `silverbullet` to the generated `.mcp.json`.
Bots that run in the project root load it. The launcher goes through
`run-ext.sh`, then runs the official filesystem server with `--confine-roots`
and the absolute path of `project/wiki/`, derived from the script's own
location (OMB does not pass `FYSO_ROOT` to bots). A client's Roots cannot
expand the configured directory.

Enable it per bot in the panel: **Bots → a bot → Profile → Skills**, switch
`project-knowledge` on, then **Review and apply** (D54). The panel writes the
native OMB entries and the existing flow plans, applies and commits them:

```yaml
    tools:
      allow:
        - native:*
        - mcp:dagu:*
        - mcp:silverbullet:*      # only for bots that have an allow-list
    skills:
      - file: ${FYSO_ROOT}/extensions/silverbullet/skills/project-knowledge/SKILL.md
```

Installation does **not** enable the skill on any bot. The framework's default
bots have a tool allow-list, so the toggle also selects the `silverbullet`
server for them; switching the skill off removes that selector. The Connectors
tab of the bot shows the server and can narrow it to single tools, for example
read-only tools for a bot that must not write.

The server supports listing, filename search, reading and editing. It does not
provide semantic search or full-text search over page contents. Read candidate
pages after filename search. Tool paths are relative to the wiki: `index.md`,
not `project/wiki/index.md`. Writes are immediate shared-file edits; there is
no separate proposal/review queue. Do not treat the folder allow-list as an OS
sandbox for a compromised process.

## Security and operational limits

- The service explicitly runs `--single`; the framework's `fyso_login` snippet
  owns authentication, strips browser `Authorization` and session cookies before
  the upstream, and rejects foreign-origin and cross-site write requests.
  Direct loopback access is available to local processes, as with other local
  framework services. This extension adds no secret values or credentials.
- `SB_SHELL_BACKEND=off`, `SB_RUNTIME_API=0`, `SB_REVISIONS=disabled`, and
  `SB_DISABLE_SERVICE_WORKER=1` keep execution, browser runtimes, extra revision
  storage and offline copies out of this integration. No extra browser install
  or database is required.
- Upstream considers single-space mode legacy. Multi-space mode would introduce
  account/configuration state and requires a separate migration design.
- Use consistent filename casing. Upstream recommends a case-sensitive server
  filesystem. macOS verification does not prove case-insensitive path behavior.
- Markdown is the agent-readable source. Uploading a PDF does not add OCR,
  extraction, embeddings or retrieval automatically.
- Concurrent browser and MCP edits can race. Read before editing, coordinate
  writers and review Git changes. No cross-client transactional locking is added.

## Update and remove

This bundled template is installed from a **local directory**, so its extension
inventory version is `null`, and Copier's VCS-based `ext:update` cannot update
it. After updating the parent framework, reapply the bundled extension:

```sh
mise run ext:add ./framework/extensions/silverbullet -- --defaults --overwrite
```

Existing answers are reused and wiki pages are outside the extension payload.
Do not use `silverbullet upgrade` or `upgrade-edge`: versions belong to the mise
template. For independently tagged distribution, move the bundled source into
its own Git repository and add it to a catalog (extensions-contract §8).

To remove, run `mise run ext:remove silverbullet` and restart the project's
stack. `project/wiki/` and `.data/ext/silverbullet/` remain. Switch the skill
off on the bots that used it first.

## Verification recorded on 2026-11-10

On a project generated from this branch (slug `sbmain`, port block 29500, macOS):

- `mise run ext:add ./framework/extensions/silverbullet -- --defaults` on the
  running stack: port 29510 chosen, tools installed, process and route loaded.
  The wiki route answered 401 without a session; **`mise run doctor` passed**,
  including `extensions/silverbullet/doctor.sh` and the isolation checks.
- `tests/test_silverbullet.py`: **4 passed**. Real SilverBullet and filesystem
  MCP: initialization, tool discovery, write/read, MCP → HTTP and HTTP → MCP
  visibility; denied reads and writes outside the wiki; home page preserved
  across restart; extension doctor; the route requires the login snippet;
  Copier reapplication and removal keep wiki and runtime data. Its MCP test
  removes `FYSO_ROOT`, reproducing OMB's bot environment.
- `tests/bot-form-connectors.test.cjs` covers the skill entry written by the
  panel; `tests/extensions.test.cjs`, `extension-ready` and `marketplace` pass.
- In a browser, the bot detail showed the `project-knowledge` toggle for the
  Workflow Architect. OMB's plan read `skill "project-knowledge" for "Workflow
  Architect": add` and, for the server, `update tools changed`; apply committed
  `project/bots/team.yaml`; `mise run bots:check` reported no drift. Switching
  the toggle on and off on another bot removed the server selector again.
- Asked a question answerable only from a synthetic wiki page, without naming
  any tool, the Workflow Architect (Claude) called
  `mcp__silverbullet__search_files` and `read_file`, answered correctly and
  cited the page. **Caveat:** this turn needed `${FYSO_DAGU_PORT}` written
  literally in the local `.mcp.json`; see the 2026-11-10 finding in the
  [docs index](README.md) about bots with a tool allow-list on OpenMausBot 0.1.141.

An earlier run (2026-11-09, before the port to the current template) is kept as
[sanitized tool evidence](../artifacts/delivery-evidence/silverbullet/agent-mcp-proof.json).

Run the integration suite with the extension's tools on PATH, from a project
that has the extension installed:

```sh
mise exec -- python3 <framework-checkout>/tests/test_silverbullet.py -v
```

The suite skips when the tools are absent. No Codex bot, Linux/Windows run,
remote deployment or installation in a real user project is claimed.

## Upstream references

- [Pinned release](https://github.com/silverbulletmd/silverbullet/releases/tag/2.12.1)
- [Pinned server CLI](https://github.com/silverbulletmd/silverbullet/blob/2.12.1/bin/silverbullet/src/main.rs)
- [Pinned authentication documentation](https://github.com/silverbulletmd/silverbullet/blob/2.12.1/docs/Authentication.md)
- [Edge MCP documentation, not the pinned release](https://edge.silverbullet.md/MCP)
- [Official filesystem MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- [mise GitHub backend](https://mise.jdx.dev/dev-tools/backends/github.html)
