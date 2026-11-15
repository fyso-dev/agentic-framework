# Department templates

A **department template** is one OpenMausBot department (team) with its bots, rooms, shared instructions and skills, in OpenMausBot's own team file format. It moves a department between projects: shipped by an extension, published to Fyso Business, pulled by another project and kept in sync. Decision: [PLAN D82](PLAN.md#2-decisions-log).

## Delivery

- **Outcome:** a person installs an extension that ships the *Ventas* and *Marketing* departments, adds them to project A, publishes one to Fyso Business, and project B pulls it with its full configuration. Later changes on either side are synchronized; when both sides changed, synchronization stops and the person chooses.
- **Level:** testable beta on the local Biz (`http://localhost:8787`) with two generated projects. Production Biz follows through a reviewed fyso-business PR.
- **Excluded:** merging concurrent edits, renaming or deleting departments, credentials, conversation history, memory, Biz-side editing of a template's agents, rooms delivered through the dispatcher.

Acceptance checklist:

- [ ] Installing the demo extension offers its two departments; adding one writes and commits its files and proposes the `team.yaml` change that the person reviews and applies.
- [ ] Publishing a department from project A creates a Biz team whose export returns the same package.
- [ ] Project B lists that team and pulls it; after apply, its bots have the same soul, model, approval, skills, department instructions and rooms.
- [ ] A change in A publishes a new version and B pulls it; a change in B publishes and A pulls; a change on both sides reports a conflict and changes nothing until the person chooses.
- [ ] Framework regressions, the Biz extension tests, fyso-business tests and `mise run doctor` on both projects pass.

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
- The package digest is the SHA-256 of its canonical JSON (keys sorted, `skills` sorted by `path`). It identifies a version's content.
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
