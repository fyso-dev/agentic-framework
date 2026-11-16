# Department templates

A **department template** is one OpenMausBot department (team) with its bots, rooms, shared instructions and skills, in OpenMausBot's own team file format. It moves a department between projects: shipped by an extension, published to Fyso Business, pulled by another project and kept in sync. Decision: [PLAN D82](PLAN.md#2-decisions-log).

## Delivery

- **Outcome:** a person installs an extension that ships the *Ventas* and *Marketing* departments, adds them to project A, publishes one to Fyso Business, and project B pulls it with its full configuration. Later changes on either side are synchronized; when both sides changed, synchronization stops and the person chooses.
- **Level:** testable beta on the local Biz (`http://localhost:8787`) with two generated projects. Production Biz follows through a reviewed fyso-business PR.
- **Excluded:** merging concurrent edits, renaming or deleting departments, credentials, conversation history, memory, Biz-side editing of a template's agents, rooms delivered through the dispatcher.

Acceptance checklist:

- [x] Installing the demo extension offers its two departments; adding one writes and commits its files and proposes the `team.yaml` change that the person reviews and applies.
- [x] Publishing a department from project A creates a Biz team whose export returns the same package.
- [x] Project B lists that team and pulls it; after apply, its bots have the same soul, model, approval, skills, department instructions and rooms.
- [x] A change in A publishes a new version and B pulls it; a change in B publishes and A pulls; a change on both sides reports a conflict and changes nothing until the person chooses.
- [x] Framework regressions, the Biz extension tests, fyso-business tests and `mise run doctor` on both projects pass. fyso-business (`feat/mcp-publicar-equipo`): typecheck, lint and 6957 tests pass. Its committed verify flow still has to run on a Branch Preview before its PR.

Checkpoint 2026-11-15, two projects generated from this branch and the local Biz. Every step ran through the Dagu workflows the panel calls (`fyso-bot-architect`, `fyso-bots-plan`, `fyso-bots-apply`, `ext-biz-team`); the panel screens themselves were not driven in a browser for this run.

- Project B (port block 34800) installed `teams-demo` and imported *Ventas* and *Marketing*: each plan created the department, two bots and the room. The OMB export then returned the extension package's digest.
- B published both to Biz as version 1. Project A (34700) pulled them; its export returned the same digests.
- A change in A (a bot title) became version 2 and B pulled it. A change in B (a skill file, applied) became version 3 and A pulled it. Each plan showed only the changed field.
- With both sides changed, B showed `conflict`; publishing returned `version_conflict`, pulling returned `conflict`, and git stayed clean. *Publish mine* made version 5, which A pulled. In a second conflict, *pull from Biz* replaced B's edit with version 6.
- Results: 118 framework CI tests, 52 Biz extension tests, `check-paths` and `mise run doctor` on both projects pass.

## The package (`omb-team/1`)

```json
{
  "formato": "omb-team/1",
  "departamento": "Ventas",
  "team": "<OpenMausBot team file text>",
  "skills": [{"path": "skills/<bot-slug>/<skill>/SKILL.md", "contenido": "<Markdown>"}]
}
```

- `team` is the text `openmausbot team export --team <name>` writes, normalized so it is portable: exactly one entry in `teams:`, the bots whose `team:` is that department, and the rooms of that department. `cwd` and every machine path are removed; a bot that needs the project root gets it from the receiving project's `defaults`. Engine keys and secrets are never included (OMB already writes placeholders). `chief` and `manages` are dropped: bot-management powers are granted by a person in the receiving project (D81).
- Skill entries in `team` use relative paths `skills/<bot-slug>/<skill>/SKILL.md`; each has one `skills[]` element with the same `path`.
- **Canonical form.** Every package is reduced to one form before it is digested, proposed or written: bots and rooms sorted by name; keys in OMB's export order (`name`, `team`, `title`, `description`, `soul`, `model`, `approval`, `computer`, `tools`, `skills`; any other key after them, sorted); soul and brief without trailing whitespace (OMB writes them with `|-`); each bot's skills at `skills/<bot-slug>/<skill-slug>/SKILL.md` (a skill shared by two bots is carried once per bot; files no bot references are dropped); a missing `approval` or `computer` stated as `ask` and `off`, because OMB exports both for every bot and would otherwise fill them from the receiving project's `defaults` or its own default (`approval: full`). `model` is required.
- The package digest is the SHA-256 of the canonical JSON (keys sorted) of the canonical form. It identifies a version's content in any project: a department exported after package P was imported and applied normalizes back to exactly the canonical form of P, so both digests are equal (verified on OMB 0.1.141 with a real export and with a hand-written package).
- Size: at most 512 KB in total, at most 64 skills.

## Where packages live

| Source | Location | Owner |
|---|---|---|
| Extension | `extensions/<ext>/teams/<slug>/team.yaml` and `extensions/<ext>/teams/<slug>/skills/**` | the extension (new slot, extensions contract §2) |
| Fyso Business | the team's published version (`publicar_equipo`, `exportar_equipo.paquete`) | Biz |
| Project | `project/bots/teams/<slug>/` (skills and brief files) plus the department's entries in `project/bots/team.yaml` | the project |

## Core capability (framework)

`framework/scripts/team-template.cjs`, run through the `fyso-bot-architect` workflow:

- `OP=team-templates`: lists the packages extensions ship.
- `OP=team-export DEPARTMENT=<name>`: exports the department from this project's OMB (explicit port) and returns the package and its digest.
- `OP=team-import`: writes the package's skill files under `project/bots/teams/<slug>/`, commits them on their own, and returns the proposed `team.yaml` (the department's `teams:` entry, bots and rooms replaced, everything else kept). The panel opens it as a draft; the person reviews it and applies it as any other change. Bot names already used in another department are rejected (`name_taken`).

The extension never writes `project/bots/team.yaml`; adding a department is a person's action.

Module API (`require(path.join(FYSO_ROOT, 'framework/scripts/team-template.cjs'))`, used by fyso-ext-biz):

| Function | Result |
|---|---|
| `departments(root)` | department names `project/bots/team.yaml` declares in `teams:` or its bots and rooms use, in file order, once each |
| `exportDepartment(name, {root})` | Promise of `{package, digest}`; uses `FYSO_OMB_PORT` (never discovers OMB) and rejects `omb_export_failed` when the department does not exist |
| `validate(pkg)` | throws on an invalid package |
| `digest(pkg)` | hex SHA-256 of the canonical form |
| `canonicalize(pkg)` | the canonical form |
| `importPackage(pkg, {root, source, slug})` | Promise of `{proposedTeamYaml, currentTeamYaml, commit, slug, departamento, digest}`; writes and commits the skill files (gitleaks scan) and never applies `team.yaml`. `pkg` may be `null` with `source: "extension:<ext>/<slug>"` |

Workflow parameters and output (`RESULT`, JSON):

| `OP` | Parameters | Output |
|---|---|---|
| `team-templates` | — | `{templates: [{source: "extension:<ext>/<slug>", extension, slug, departamento, brief?, bots: [{name, title?}], rooms: [name], skills: <count>, digest}]}`; an invalid template has `{source, extension, slug, error}` instead |
| `team-export` | `DEPARTMENT` | `{package, digest}` |
| `team-import` | `PACKAGE_B64` (base64 of the package JSON) **or** `SOURCE=extension:<ext>/<slug>`; optional `SLUG` (default: the extension directory, else the slug of the department name) | `{proposedTeamYaml, currentTeamYaml, commit, slug, departamento, digest, source?}`; `commit` is `null` when the skill files were already committed |

Errors are the run's failure message: `unsupported_format`, `invalid_package: <detail>`, `too_large`, `too_many_skills`, `unsafe_path: <path>`, `name_taken: <bot or room>`, `slug_taken: <slug> (<department>)` (the skill directory belongs to another department; pass another `SLUG`), `uncommitted_changes: <dir>`, `omb_export_failed: <OMB error>`, `secret_detected`. The import proposes before writing, so a rejected package changes nothing; it scans the written files with gitleaks before committing. The proposed `team.yaml` inlines souls and the department brief as the package carries them; skill entries point at `${FYSO_ROOT}/project/bots/teams/<slug>/skills/…`; department bots have no `cwd` and inherit the project's `defaults.cwd`. Bots of the department that the package no longer has are removed from the proposal, so the plan shows them as deletions for the person to accept or discard.

## Fyso Business (fyso-business)

- `publicar_equipo({paquete, equipo_id?, version_base?, departamento_id?})`: without `equipo_id` creates a team from the package (its name, and its shared instructions as the team prompt) at version 1; with it, publishes a new version only when `version_base` equals the current version, else returns `version_conflict` with the current version. Same write authorization as the team catalog; the package is validated (format, size, one department).
- `exportar_equipo` also returns `paquete` (the package of the published version) when the team has one; existing fields are unchanged.

## Synchronization (fyso-ext-biz)

`project/biz-teams.json` records, per department: `equipo_id`, the Biz `version` and the package `digest` at the last publish or pull. *Synchronize* compares:

| Local digest changed | Biz version changed | Action |
|---|---|---|
| no | no | nothing |
| no | yes | pull (import, review, apply) |
| yes | no | publish with `version_base` |
| yes | yes | conflict: show both; the person chooses *pull from Biz* (local edits stay in git history) or *publish mine* |

Each publish or pull commits `project/biz-teams.json`.
