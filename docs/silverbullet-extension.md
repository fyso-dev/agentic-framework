# SilverBullet knowledge extension

An opt-in Copier extension published as [fyso-ext-silverbullet](https://github.com/fyso-dev/fyso-ext-silverbullet), starting at **v0.1.0**.
A bundled copy remains under `template/framework/extensions/silverbullet/`.
It fills the existing extension slots ([contract](extensions-contract.md)) without
changing a project's team file or framework configuration. Decisions: **D53**
(the extension), **D54** (per-bot skill toggle), **D58** (panel page and
web access) and **D59** (AI import), [PLAN](PLAN.md).

## Components and source of truth

| Concern | Existing component |
|---|---|
| Web wiki | SilverBullet **2.12.1**, native release binary through mise's GitHub backend |
| Agent tools | Official `@modelcontextprotocol/server-filesystem` **2.2.0**, installed through mise |
| Documents | **`project/wiki/`**, already used by Dagu and included in the framework snapshot paths |
| Panel section | **Conocimiento / Knowledge**, an extension-owned page (`pages/knowledge.yaml`, `panel/`) that embeds the editor and explains how to feed it |
| Browser access | `http://docs.<slug>-<port_base>.localhost:<port_base>`, behind the framework's web login (`import fyso_login`); panel users may open it (D58) |
| Process | `ext-silverbullet`, loopback only, on the extension port (first free port of `port_base + 10…19`) |
| Agent instructions | `project-knowledge` skill, enabled per bot in the panel |
| Import: upload | [tusd](https://github.com/tus/tusd) **2.10.1** (process `ext-silverbullet-upload`, Unix socket, no port) and the [Uppy](https://uppy.io) **6.0.7** picker |
| Import: conversion | `ext-silverbullet-import` workflow: `extract-zip` **2.0.1**, pandoc **3.13**, gitleaks, and Dagu's `harness.run` agent (Claude Code or Codex) |

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
mise run ext:add silverbullet -- --defaults
mise run doctor
```

`ext:add` picks the first free extension port, installs the pinned tools and,
when the stack is running, loads the process and the gateway route without a
restart. The official catalog lists `silverbullet`; its source is
`gh:fyso-dev/fyso-ext-silverbullet`, with versions from Git tags. The panel
marketplace can install it. To pin this release without catalog lookup:

```sh
mise run ext:add gh:fyso-dev/fyso-ext-silverbullet -- --defaults --vcs-ref v0.1.0
```

The bundled copy can still be installed with
`mise run ext:add ./framework/extensions/silverbullet -- --defaults`.
The framework template preserves its `copier.yml` and uses `.slotjinja`
internally, so outer Copier rendering does not consume its variables.

## In the panel

Installing adds **Conocimiento** (Knowledge) to the panel's navigation. The
page belongs to the extension and uses the existing page slot and panel SDK
([contract §9](extensions-contract.md#9-extension-owned-tabs-and-pages)); the
framework's panel has no SilverBullet code. It shows:

- **The real SilverBullet editor**, embedded. It is the same site as the
  `docs.` route, loaded with the person's web session, so nothing is copied or
  re-implemented. "Open in a new tab" keeps the full-window editor one click away.
- **How to feed it**, as three ways that all write the same files:
  1. *Write it* in the editor.
  2. *Ask a bot*: the page lists the project's bots with their state (has
     access, changed but not applied, or a **Give access** link that opens the
     bot's profile at the `project-knowledge` switch of D54) and an example
     request to copy.
  3. *Bring what you already have*: **Import with AI** (below), or copy
     Markdown files into `project/wiki/`.
- The guide folds away; the choice is remembered in that browser.

The first home page (`index.md`, written only when absent) repeats the three
ways and proposes three starting pages. It is seeded in Spanish, the panel's
default language; it is project content and can be rewritten.

The `project-knowledge` skill tells a bot when to write, not only how to read:
on request (document, note, remember), updating an existing page before
creating one, linking new pages from the home page and reporting which page
changed.

### Web access (D58)

Web login denies apps that no rule names. An extension cannot edit the
project-owned `project/auth/tinyauth.yaml`, so the framework gives each
extension site the **panel's** access rule when it writes Tinyauth's runtime
configuration: people who may open the panel may open the knowledge base. To
restrict it, declare the app yourself; a declared app is never changed:

```yaml
# project/auth/tinyauth.yaml
apps:
  docs:
    users:
      allow: "admin"
```

`ext:add` and `ext:update` restart the login authority so the rule applies at
once. Existing web sessions survive that restart.

## Import with AI (D59)

**Import with AI**, on the third card of the Knowledge page, turns documents a
team already has into pages:

1. **Pick.** Drop or choose a folder, a zip or single files. The picker is Uppy;
   uploads are resumable (tus) and go to `.data/ext/silverbullet/uploads/`, not
   into the wiki. Hidden files, `node_modules` and `__MACOSX` are left out.
2. **Convert.** The person presses **Turn into pages**. Nothing runs before
   that: the page says that the content goes to the project's AI provider.
3. **Read the report.** The editor opens `Importaciones/<date time>` (`Imports/…`
   in English): new pages, pages not imported because the name existed, files
   not read, and the agent's notes. The home page gets one link to the list of
   imports.

The workflow `ext-silverbullet-import` (params `BATCH`, `PROVIDER`, `MODEL`,
`LANG_UI`; output `RESULT`) is the same shape as `fyso-dev-task`:

| Step | What it does |
|---|---|
| `prepare` | Moves the uploads of that batch into a private work directory (`.data/ext/silverbullet/import/<run>/source`), with client names reduced to safe relative paths. Extracts zips, converts `.docx .odt .rtf .epub .html` to Markdown with pandoc, keeps text formats and PDFs, lists the rest as not read. Fails on a credential (gitleaks, file names only) and over the limits |
| `agent_claude` / `agent_codex` | Dagu `harness.run` in the work directory: reads `source/`, writes pages by topic in `out/` with links and a source line, and optional `notes.md`. It gets the list of existing pages to link to and not to reuse |
| `gate` | `out/` must hold only Markdown pages with safe names, within the size limits and without credentials. Links are removed, never followed |
| `publish` | Copies pages that do **not** exist yet into `project/wiki/`; existing pages are never changed. Writes the report, links it, removes the work directory, prints `RESULT` (`report`, `created`, `conflicts`, `skipped`, `files`) |

On failure the uploaded originals are deleted; pages the agent already wrote
stay in the work directory for inspection. Uploads nobody converted are dropped
after a day, on the next import.

Limits of this first version: **200 files** and **4 MB of text** per import
(import a smaller folder, more than once), 1 GB per uploaded file, 300 pages
written. PDFs are passed to the agent unconverted: Claude Code reads them,
Codex may list them as not read. Scanned documents get no OCR. There is no
review step before pages appear: they are additive, the report lists them, and
the project's Git history is the undo.

The agent's file access is narrowed with the engine's own permission rules
(Claude: read below the work directory, write below `out/`; Codex:
`workspace-write` sandbox). That is not an OS sandbox, and uploaded documents
are untrusted text: the prompt tells the agent to treat them as data, and the
gate checks what comes out, but review imported pages before relying on them.

## Connect agents

Install adds a stdio server named `silverbullet` to the generated `.mcp.json`.
Bots that run in the project root load it. The launcher goes through
`run-ext.sh`, then runs the official filesystem server with `--confine-roots`
and the absolute path of `project/wiki/`, derived from the script's own
location (OMB does not pass `FYSO_ROOT` to bots). A client's Roots cannot
expand the configured directory.

Enable it per bot in the panel: from the Knowledge page press **Give access**
next to the bot, or open **Bots → a bot → Profile → Skills**; switch
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
server for them; switching the skill off removes that selector and marks the
skill entry `enabled: false` (OMB does not uninstall a skill left out of the file). The Connectors
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
- The embedded editor is a frame of the `docs.` site. It keeps SilverBullet's
  own look and does not follow the panel's dark theme or language.
- Hot install reaches bots on the next start: a bot gets the `silverbullet`
  MCP server after `mise run up` restarts OpenMausBot (extensions-contract §6).
- Concurrent browser and MCP edits can race. Read before editing, coordinate
  writers and review Git changes. No cross-client transactional locking is added.

## Update and remove

For catalog or Git-source installations:

```sh
mise run ext:update silverbullet -- --defaults
mise run doctor
```

An existing **bundled local-directory** installation has inventory version
`null`, so Copier's VCS-based `ext:update` cannot update it. After updating
the parent framework, migrate it to the published source explicitly:

```sh
mise run ext:add gh:fyso-dev/fyso-ext-silverbullet -- --defaults --overwrite --vcs-ref v0.1.0
```

Existing answers are reused and wiki pages are outside the extension payload.
Review and commit pending project changes before the next `ext:update`.
To stay on the bundled source, reapply it with
`mise run ext:add ./framework/extensions/silverbullet -- --defaults --overwrite`.
Do not use `silverbullet upgrade` or `upgrade-edge`: versions belong to the
extension's pinned mise configuration.

To remove, run `mise run ext:remove silverbullet` and restart the project's
stack. `project/wiki/` and `.data/ext/silverbullet/` remain. Switch the skill
off on the bots that used it first.

## Verification of the AI import (2026-11-10, D59)

On the same generated project (macOS, Claude engine),
`tests/silverbullet-import-browser.cjs` uploaded a folder (text, Markdown,
Word) and a zip through the picker, started the workflow from the page and
checked the result on disk: 7 pages by topic that kept the facts of the
sources, a report linking each of them, one link from the home page, and no
upload left behind. A document with a credential-shaped value was refused
before the agent ran and wrote nothing. `tests/silverbullet-import.test.cjs`
covers the glue steps without network or agent. Results and screenshots:
[evidence](../artifacts/delivery-evidence/silverbullet/README.md). It takes the
same environment variables as the test below and runs one real agent turn.
Not verified: the Codex engine, PDFs, folders near the limits, Linux.

## Verification of the panel page and web access (2026-11-10, D58)

On a project generated from the branch (slug `sbint`, port block 29600, macOS),
`tests/silverbullet-panel-browser.cjs` drove a real browser through the login,
the Knowledge section, the embedded editor, a file dropped into `project/wiki/`,
the "Give access" link, the folded guide, English, and a restart of the login
authority. Results, screenshots and what was not verified:
[evidence](../artifacts/delivery-evidence/silverbullet/README.md).

```sh
FYSO_TEST_WEB_PANEL=http://panel.<slug>-<port>.localhost:<port> \
FYSO_TEST_WEB_PASSWORD_FILE=<file> FYSO_TEST_PROJECT_ROOT=<project> \
  node <framework-checkout>/tests/silverbullet-panel-browser.cjs
```

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
  cited the page. At that time the turn needed `${FYSO_DAGU_PORT}` written
  literally in the local `.mcp.json`; the generator does that itself since D55.

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
