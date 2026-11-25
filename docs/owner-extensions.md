# Bundled extensions for business owners

D66–D72.
These are opt-in sources under `framework/extensions/` in a generated project.
They do not enable skills, install bots, grant tools or publish marketplace entries.

## Split and installation

Six packages keep optional dependencies and permissions separate: creating a document
does not publish it, wiki guidance does not need an editor, reporting does not need
AI, and an example accounting team does not change the running roster. None starts
a service or consumes an extension port. Each has its own Copier configuration,
answers file, mise tasks, names-only empty secrets declaration, doctor and guides.

From a generated project, install any one independently:

```sh
mise run ext:add ./framework/extensions/office-docs -- --defaults
mise run ext:add ./framework/extensions/deliverables -- --defaults
mise run ext:add ./framework/extensions/knowledge-skills -- --defaults
mise run ext:add ./framework/extensions/ops-assistant -- --defaults
mise run ext:add ./framework/extensions/owner-loop -- --defaults
mise run ext:add ./framework/extensions/pack-accounting -- --defaults
mise install
mise run doctor
```

Then select skills on each agent through the panel (D54). MCP additions reach OMB
on its next start. Bots with a D60 scoped server need explicit grants for each
`ext-*` workflow they should run. `automate-this` needs the full authoring surface:
scoped operator servers do not expose `dagu_change` or wiki tools.

Local bundled sources are not tagged repositories; use Copier reapplication with
review for local changes. `ext:update` requires a tagged git source. Independent
repositories/releases and official catalog entries are future D31 publication work.
Removal uses `mise run ext:remove <id>`; runtime data and secrets survive.

## office-docs

Files: `.config/mise/conf.d/ext-office-docs.toml`, four `skills/*/SKILL.md`,
`doctor.sh`, `xlsx-check.sh`, and `project/workflows/ext-office-docs-xlsx.yaml`.
Word and PowerPoint use Pandoc **3.13**; PDF uses that Pandoc with Typst **0.15.1**;
Excel uses pinned Dagu **2.24.0**'s `xlsx.write` and its other spreadsheet actions.
Optional project-owned reference documents carry the company's styles. Output is
runtime data under `.data/ext/office-docs/`; deliverables is an optional companion.

### License and version findings

Checked upstream on 2026-11-11: each of the
[docx](https://github.com/anthropics/skills/blob/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/docx/LICENSE.txt),
[xlsx](https://github.com/anthropics/skills/blob/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/xlsx/LICENSE.txt),
[pptx](https://github.com/anthropics/skills/blob/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/pptx/LICENSE.txt)
and [pdf](https://github.com/anthropics/skills/blob/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/pdf/LICENSE.txt)
license files declares Apache 2.0, which permits redistribution subject to its terms.
No claim that those current licenses forbid redistribution is made. We nevertheless
ship original thin skills: fewer dependencies, no separate document engine, and
bounded creation capabilities. No Anthropic material is copied.

Exact releases verified upstream:
[Pandoc 3.13](https://github.com/jgm/pandoc/releases/tag/3.13),
[Typst 0.15.1](https://github.com/typst/typst/releases/tag/v0.15.1),
[Dagu 2.24.0](https://github.com/dagu-org/dagu/tree/v2.24.0).
Pandoc does not read PPTX: inspect slide XML for structural tests and open in an
actual viewer for layout acceptance. Advanced office editing, recalculated formula
caches, scanned PDFs, forms and signatures are outside this package.

## deliverables

Files: `deliver.cjs`, `mcp.sh`, `mcp.json`, `Caddyfile`, `app.yaml`, `pages/files.yaml`,
`panel/`, `ui/`, `skills/deliver-files/SKILL.md` and `doctor.sh`.
The small stdio MCP has two tools: `deliver` copies a finished file and returns a
link; `deliveries` lists files. The CLI offers the same operations. A taken filename
gets a numeric suffix; existing links retain their files. Native
[Caddy browse JSON](https://caddyserver.com/docs/caddyfile/directives/file_server)
feeds the extension page. No database, upload API or additional server exists.

Files live under `.data/ext/deliverables/files/` and use the `files` application
behind `fyso_login`. D58 copies the panel rule unless the owner declares `apps.files`.
An explicit `files` rule can narrow access; it must also cover the person viewing
the embedded page. Links respect the D62 public scheme. All download responses
carry attachment, sandbox and nosniff headers, including root index cases. A hidden
reserved index filename keeps delivered `index.html` from replacing browse JSON.
The extension's own trusted UI is served separately under `/.ui/`.

Panel copy uses i18next **26.5.11** with Spanish default and English JSON resources.
The vendored UMD file is the installed panel dependency's exact distribution,
verified against [npm metadata](https://registry.npmjs.org/i18next/26.5.11); its MIT
license is alongside it in `panel/vendor/`. No CDN or unpinned network script.

Only project files up to 100 MB are accepted; resolved paths outside the project,
private configuration and common secret/key paths are refused. This is a path guard,
not content redaction or a malware scanner. Review content before handing it to the
tool. Do not manually place secrets or symlinks in the served folder: Caddy's file
root is not a filesystem sandbox. Retention and backup belong to the owner; these
runtime files are not git snapshots. The doctor checks folder/tool availability
and the unauthenticated boundary, not authenticated user ACL acceptance.

## knowledge-skills

Files: `skills/{business-interview,brand-voice,wiki-gardener}/SKILL.md`, `garden.cjs`,
`doctor.sh` and `project/workflows/ext-knowledge-skills-garden.yaml`.
This **complements but does not require SilverBullet**: Markdown stays in
`project/wiki/` and existing Dagu wiki tools or agent file tools also work.

Interview writes confirmed owner answers; brand voice reads one guide page; gardener
proposes fixes before editing. Scheduled native Dagu runs check links/dates and can
use `harness.run` for contradiction proposals. AI is an install-time option
(`garden_ai`, default true); disable it with `-d garden_ai=false`. Empty
`garden_schedule` disables scheduling. Defaults are Monday 07:00, server time.

Only an additive report page is published. The AI sees a bounded private copy
(500 pages/4 MB) and its proposals are untrusted. Existing pages are not automatically
repaired. A coding harness is not an OS-level read boundary; its safety flags and
provider sandbox have the same limitations as the reference SilverBullet import.
Failed runs retain the private work directory for recovery; remove it after review.
Provider execution and usefulness of contradiction findings need separate acceptance.

The focused `node --test tests/owner-extensions.test.cjs` check passed 13 tests,
including retained work when report names are exhausted.

## ops-assistant

Files: `digest.cjs`, `skills/automate-this/SKILL.md`, `doctor.sh` and the digest/spend
workflows in `project/workflows/`. Reports consume the existing observability export,
which already includes native Dagu run history, without another collector or AI.
Default schedules: Monday 08:00 digest, daily 09:00 spend checks, server time.
Both can be changed or disabled through Copier answers. Digest language is ES/EN.

`ext-ops-assistant-maintenance` is a manual workflow for extension installation
and update errors. Dagu validates a fixed operation and extension ID before
calling `fyso-ext-install` on the project host. The sanitized report stays in
the parent run. `add` and `update` reuse the catalog and Copier lifecycle.
`recover` refreshes and activates an already installed version. The parent
runs `doctor` after each successful operation. This covers a failure after Copier saved the version but before
runtime activation completed. Grant the maintenance workflow explicitly to a
bot through a scoped Dagu MCP to pre-authorize these three operations.

Caps live in project-owned `project/observability.json`, under `botMonthlyUsd`
(bot names or `*`) and `botMonthlyUsdBasis` (`api` default or `all`). API cost,
estimated API cost and subscription equivalents remain distinguishable. Unknown
spend stays unknown; warnings/exceedances based on known amounts are lower bounds.
Stale exports and exports for the wrong UTC month fail evaluation. For a current
export, incomplete sources, invalid rows or unknown costs leave below-cap spend
unverified; known eligible spend at or above the cap still establishes an exceedance.
The first new
exceedance per bot/month fails the workflow, making an advisory Dagu failure; a mark
in ignored runtime data suppresses duplicate alerts. Later runs still report the
exceeded state. No proactive phone/email notification is implied by a red run.

The focused checks cover edited report preservation, incomplete ledger handling and
workflow status counts.

This does not pause bots. The inspected OMB 0.1.141 package exposes workspace-wide
`budgets.monthlyUsd`, behind its `budgets` license feature, not a native per-bot pause.
The export provides monthly usage groups, not weekly trace costs; the digest reports
month-to-date cost per bot. Weekly activity reports are limited by export retention and show partial-source warnings;
month-crossing periods are explicitly incomplete. Every digest run creates a new page,
so existing pages and personal edits remain intact.

`automate-this` reads Dagu's authoring reference and the existing authoring skill,
uses `dagu_change` preview/apply and creates project workflows only. An approved
workflow definition alone does not authorize external writes during testing.

## owner-loop

Files: three `skills/*/SKILL.md`, `notify.sh`, `doctor.sh`, and native ask/notify
workflow examples. No credentials, process or notification service is added.
Pinned Dagu 2.24.0's schema and CLI offer `human.task` and `human-task complete`;
values flow through `outputs.write`. Human tasks must be in a root workflow.
Bots can pass the person's actual answer with native approval tools; they never
invent or approve an answer for them. Read the pinned authoring reference first.

Inspected the installed, pinned [OpenMausBot 0.1.141 package](https://www.npmjs.com/package/openmausbot/v/0.1.141):
its server includes `request_credential`, `message_person`, question/approval cards
and native notifications. Tool availability depends on the engine and installation;
`message_person` can be limited to a team's Cloud. These are conditional guidance,
not a claim that every local bot has every tool. The native credential-card path
uses a reference, while lasting extension secrets use the existing D50 protected
form and D51 check. No secret enters a DAG, chat, tool arguments or extension logs.

`notify.sh` hands an informational message to the specified project bot with an
explicit port. Successful submission is not proof a human received it. Device
pairing, the receiving conversation and the bot's reply still need acceptance.

Open spikes (no service built): direct Dagu mail/channel credentials through SOPS;
a protected form for lasting secrets that no extension declares; durable delivery
and identity mapping across channels; native per-bot budget enforcement. Use
`mise run secrets` for undeclared lasting keys, operated by the owner.

## pack-accounting

Files: native `team.yaml`, five `souls/*.md`, preview task and `doctor.sh`.
Client Intake, Bookkeeping Assistant, Deadline Keeper and Client Writer prepare
drafts; all ask before acting, with computer use off. The team uses the project's
selected engine defaults, matching core profiles. Installation does not apply it.
A person previews it, copies selected definitions/souls into project ownership,
then follows the existing bot review/apply workflow.

This is an unreviewed sample requiring a qualified accountant. It supplies no tax
rate, jurisdiction, legal deadline or filing integration. No real client acceptance
or regulatory correctness is claimed.

## Verification

See the tests and recorded results below. Native runtime checks create temporary
projects outside the checkout, use their own Dagu homes and avoid AI execution.
A passing packaging test is not live UI, provider or delivery acceptance.

```sh
node --test tests/extensions.test.cjs tests/extension-ready.test.cjs tests/extension-secrets.test.cjs tests/marketplace.test.cjs tests/owner-extensions.test.cjs
python3 -m unittest discover -s tests -p 'test_owner_extensions.py' -v
python3 -m unittest discover -s tests -p 'test_owner_extensions_runtime.py' -v
python3 -m unittest discover -s tests -p 'test_extension*.py' -v
bash scripts/check-paths.sh
```

The Python suites require Copier 9.19.1 through uvx. Set `UV_CACHE_DIR`,
`UV_TOOL_DIR`, `COPIER_CACHE_DIR`, `MISE_STATE_DIR` and `MISE_CACHE_DIR` to writable temporary folders
when sandboxed. Existing tests deliberately clear environment variables: a temporary
PATH wrapper may need to restore those cache/state overrides for their subprocesses.
Keep mise shims in a temporary `MISE_DATA_DIR` while reusing installed tool binaries.
Native runtime tests need the pinned document tools/Dagu on PATH;
existing lifecycle tests also need the project's pinned tools on PATH and the YAML
package resolvable. Skips are not passes. No changes to core runtime behavior were
needed: only `copier.yml`'s exclusion exception now retains every bundle's Copier
configuration instead of enumerating two names.


### Recorded acceptance (2026-11-12 UTC)

- New Node glue tests: 12 passed; combined existing extension/marketplace/secret/
  readiness suites plus these tests: 42 passed.
- Real Copier generation and six independent installs: 10 packaging tests passed,
  including unchanged non-slot files, answers, inventory and native Dagu validation.
- Native runtime suite: 3 passed. DOCX/PPTX ZIP structure and supplied content, PDF
  signature, native Dagu XLSX output, and a no-AI gardener report were checked.
  The first run exposed the empty Typst font list; explicitly selecting its bundled
  Libertinus Serif fixed the real PDF conversion.
- Disposable generated project, reserved block 31800–31819: `mise run setup`,
  `mise run up`, all six extension doctors and `mise run doctor` passed. OMB's native
  uptime call required execution outside the sandbox; no framework workaround was
  added. Test schedules were disabled, and no AI turn was requested.
- `mise exec -- node <checkout>/tests/owner-extensions-live.cjs` passed authenticated
  file listing/download, attachment/sandbox/nosniff headers (including `index.html`),
  localized asset availability, private-slot denial, read-only requests, and native
  Dagu human-task wait/answer/resume. The script requires an explicit disposable
  fixture marker; it never discovers a server automatically.
- Through the same project's Dagu: the real digest workflow wrote a report from its
  native observability export. `mise run pack-accounting:preview` produced four
  proposed creates without applying them.
- `mise run down` passed. No listeners remained in the full reserved block, all
  ports could bind with `SO_REUSEADDR`, and the process-compose socket was absent.
  A plain bind initially caught TCP TIME_WAIT on the former login port; that was
  not a remaining listener.
- Existing Python extension suites: page packaging, relative-source upgrade and
  tagged install/update/remove passed. The hook lifecycle initially failed because
  its pre-existing fixture lacked the `web-auth` process that D58 activation restarts;
  the fixture now supplies both native process names. Only the hook test needed a
  rerun after that correction and passed (1/1); core activation behavior was unchanged.
- `bash scripts/check-paths.sh`, a separate equivalent scan of all untracked files,
  and `git diff --check` passed at the time of this acceptance run.

Not verified: browser rendering/layout, AI interviews or contradiction quality,
real bot notification/device delivery, real credential-card/provider interaction,
accounting domain correctness, paid-usage reconciliation, Linux/Windows, HTTPS
provider acceptance, tagged publication or a real business deployment.

Owner choices before adoption: schedules and timezone, whether scheduled wiki AI
may read business pages, per-bot thresholds/basis, notification destination and
accountant approval of the sample. These do not block installing the independent
bundles with their documented defaults.

### Final integration follow-up

The ops doctor validates settings using a complete current synthetic export, matching the shared freshness and integrity checks. A dedicated executable regression verifies success with defaults and rejection of invalid caps. The final generated-stack doctor, authenticated HTTP/human loop and rendered page are recorded in the [integration evidence](../artifacts/delivery-evidence/owner-extensions/README.md); that local acceptance supersedes the earlier browser-rendering limitation. Provider, AI-quality and cross-platform limits remain.
