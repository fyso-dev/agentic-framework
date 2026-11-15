# Third-party Agent Skills (D73)

Owners can find a skill in Apps → Skills, read its origin, exact commit, license and SKILL.md, install it, review the native scan and explicitly confirm it. Confirmation makes it eligible for each agent's existing Skills toggle; save the agent and use Review and apply. Installation alone never selects a bot.

Evidence and alternatives: [registry spike](adr/spikes/skills-registry.md). D73 is reserved for skills; D66–D72 belong to the separate owner-extension delivery.

## Discovery and ownership

`project/skill-sources.yaml` lists git repositories and the optional `skills.sh` directory. Defaults: `gh:anthropics/skills`, `skills.sh`. Searches combine configured repositories with the CLI's anonymous `/api/search` endpoint. No search is sent until the owner submits it; only the entered query and result limit are sent to skills.sh. Do not put confidential text in public searches. The endpoint is best effort, unversioned and may stop working; source errors remain visible. Pasting `owner/repo`, a GitHub tree URL or a skills.sh URL discovers the corresponding repository without a public keyword request. There is no scraper, local index or hosted catalog.

Sources are public HTTPS git repositories without credentials or query strings. Terminal fixtures may use local repositories; panel apply rejects absolute machine paths. Clones disable credential helpers and git hooks, prompt no one, execute no fetched code, and are deleted after use. New dependencies: none; existing git, YAML, gitleaks and OpenMausBot versions remain pinned in mise.

A skill is a `SKILL.md` folder with name and description frontmatter. The installed folder is `project/bots/skills/<name>/`; `project/bots/third-party-skills.json` records source, exact repository path, full source commit, declared license, retained license filename, description, folder digest, scan and review. These are project-owned and must be committed with the project. Operations commit only that skill's folder and the provenance file, as extension installation does; unrelated paths are excluded. No framework checkout commit is required. The source path plus commit rebuilds the copy; `skills:update <name> <commit>` can restore a selected revision. There is no automatic background update.

Skill-local licenses take priority over a repository-root license. A root license travels with the copy. Missing licensing is shown as unknown, never inferred as permission. The owner must decide whether the terms permit their intended use. SKILL.md and license text are displayed as plain text, never executed or rendered as HTML.

## Native scan and human review

Installation runs the pinned OMB's native disabled-import scan against **only `FYSO_OMB_PORT` on loopback**, obtains warnings and validates the returned SKILL.md hash and disabled state. Each scan preserves the native name/frontmatter contract, uses a unique source marker to identify its disabled temporary import, verifies ownership before cleanup, and never deletes after a failed import. OMB exposes no conditional delete: a concurrent native administrator could still replace the probe between the ownership check and deletion. A failed or ambiguous cleanup leaves the skill unscanned and unconfirmable; retry with Scan now. Requires one available bot; no conversation or model turn runs.

A person reads the installed text, license, file list and scan warnings, checks the acknowledgement and clicks Confirm. The native scan is a heuristic over **SKILL.md only**, not an audit of scripts or a safety certification; warnings can be explicitly accepted by the person. Review binds to a SHA-256 digest of all retained paths and bytes, including supporting resources and license. A missing scan or any modified byte blocks approval. Every changed source commit clears scan/review, even if SKILL.md itself stayed unchanged.

`render-team.cjs` forces an unconfirmed third-party entry to native `enabled:false`, because omitting it would leave an older native copy enabled. This takes effect on bot apply, not by changing a running bot at install time. After upgrading, review the new content and review/apply the agents again. Existing native copies remain at their previous revision until apply. The panel cannot switch on a pending skill, but permits switching off a previously selected one. This gate is a configuration guardrail, not a boundary against an owner or agent with shell access or native OMB administration.

**OMB 0.1.141 imports SKILL.md only.** Scripts, assets and relative references are retained in the project and included in the review digest, but are not installed into the native bot workspace. The reader states this limitation. Skills requiring those files need a compatible native mechanism or an extension; import success does not demonstrate their functionality. This implementation never executes a fetched skill to validate it.

## Tasks and workflows

```sh
mise run skills:search brand
mise run skills:show anthropics/skills brand-guidelines <commit>
mise run skills:add anthropics/skills brand-guidelines <commit>
mise run skills:list
mise run skills:scan brand-guidelines
mise run skills:confirm brand-guidelines
mise run skills:update brand-guidelines <commit>
mise run skills:remove brand-guidelines
```

CLI `confirm` is an explicit human terminal action. Agents must not use it to substitute for the owner. Install/update resolve omitted revisions to a full commit before recording them. Panel installs and upgrades require the immutable preview commit and digest. Remove is refused while team.yaml (including inherited defaults) enables the skill; turn it off and apply first. Native disabled copies may remain after project removal; missing disabled file entries are omitted so they do not break team apply. Local supporting-file modifications invalidate approval and are overwritten only by an explicit update.

- `fyso-skills-catalog`: QUERY → `{sources, skills, installed}`; SRC/SKILL/COMMIT → `{preview}` with plain text/license/files/digest; NAME → `{local}` with scan/review state. OP=add/update creates an expiring runtime preview plan and returns `{planId, preview}`.
- `fyso-skills-install`: OP=add/update with SRC/SKILL or NAME, COMMIT and SHA256 applies the immutable panel preview. OP=scan retries the native scan. OP=confirm requires NAME and SHA256. OP=remove removes an unused skill. OP=apply-plan requires PLAN_ID. Output `result` identifies operation, source revision and current state.
- Plans last 30 minutes and bind source, name, commit, digest and installed-record revision. Stale plans fail; replay after consumption fails. The plan is runtime data, not a second configuration source.
- Both workflows use native Dagu enqueue/poll/output, `max_active_runs:1`, system labels and environment parameters, never shell-interpolated user strings. Project workflow copies follow the existing template pattern.
- `GET /config/skills.json` is a read-only authenticated Caddy route, rebuilt at startup and after each operation. It includes origin, commit, license, scan/review state and declared bot selections. Existing projects without the file display an empty list until regeneration.

MCP: `fyso_skill_search` discovers or reads untrusted text; `fyso_skill_plan` previews add/update; after explicit owner authorization, `fyso_skill_install {planId}` applies exactly that plan. No skill-confirmation, enabling or removal tool is exposed. This is consent by the MCP client's review flow, not a server that can infer a human identity from an agent's request. Dagu execution and shell tools remain broader trusted administration surfaces.

## Verification and limits

See [delivery evidence](../artifacts/delivery-evidence/third-party-skills/README.md) for commands and observed results. The pure fixture tests use disposable git repositories and fake directory/OMB servers; they do not establish upstream behavior. The spike's isolated native tests establish the actual scan protocol. Browser smoke uses the built-in mock backend and proves panel transitions only. The later integration acceptance verifies authenticated panel-to-Dagu delivery and native per-agent apply on a full disposable stack with doctor green. No claim of model-level skill execution or production acceptance follows.

## Change inventory

New core files: `template/framework/scripts/skills.cjs`, `template/framework/panel/src/screens/Skills.tsx`, `template/framework/workflows/skills-{catalog,install}.yaml`.

Modified core files (relative to `template/`):

- `Caddyfile`, `mise.toml.jinja`, `AGENTS.md.jinja`, `README.md.jinja`, `framework/agent-context.md`.
- `framework/scripts/fyso-mcp.cjs`, `framework/scripts/panel-data.cjs`, `framework/scripts/render-team.cjs`.
- `framework/panel/src/api/{http,mock,types}.ts`, `framework/panel/src/lib/{router,team}.ts`, `framework/panel/src/locales/{en,es}.json`, `framework/panel/src/screens/{Apps,BotForm}.tsx`, `framework/panel/src/store.tsx`, `framework/panel/src/styles.css`.
- Rebuilt `framework/panel/dist/assets/{Action,extension-sdk,index,mock}.js` and `panel.css`.

New project seeds: `template/project/skill-sources.yaml`, `template/project/workflows/fyso-skills-{catalog,install}.yaml`. Tests: new `tests/skills.test.cjs`, `tests/skills-browser.cjs`; updated `tests/fyso-mcp.test.cjs`. Documentation: this contract, spike, PLAN decision/phase and README index, panel contract/spec and agent surface; evidence index and sanitized screenshots.

### Native name and cleanup contract

Real combined-stack acceptance exposed a constraint that the original fake server omitted: OMB 0.1.141 requires the import name to equal the SKILL.md frontmatter name. The adapter therefore scans the unchanged original text under its actual name. A random **source marker**, rather than a renamed skill, identifies the owned disabled import. A matching existing native hash can supply its scan; a different existing copy is left untouched. Native `installPreparedSkill` refuses duplicate imports instead of replacing them. Cleanup happens only after a confirmed POST with a valid nonempty import timestamp and a fresh match of source marker, hash, disabled state and exact timestamp. Missing, malformed or changed timestamps leave the copy in place and the scan unconfirmed. Failed POSTs and changed ownership never trigger deletion. Native administration remains a trusted surface; the API has no atomic conditional-delete operation.

The fixture now parses frontmatter and enforces native name equality and duplicate refusal. It reproduces the earlier failure before the adapter fix, and checks collision/ownership preservation. Source evidence: the pinned npm package `openmausbot@0.1.141`, `dist-server/server/routes/bot-skills.js` and `dist-server/server/skills.js`; the combined real instance returned HTTP 400, “Skill name does not match its contents”, before the correction.
