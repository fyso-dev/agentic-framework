# pack-software-production extension

A vertical for software production: one department template with five bots that
follow the delivery sequence of the Etendo bots (intake, plan, build, independent
review, status). It ships as an OpenMausBot department (D82), so the panel lists it
under *Add department*, previews it and imports it as a reviewed change. Installing
the extension changes nothing else in the project.

From a generated project:

```sh
mise run ext:add ./framework/extensions/pack-software-production -- --defaults
mise run pack-software-production:check
```

Then open the panel's bot setup, choose *Add department* and pick
*Producción de software*. Review the proposed `team.yaml` and apply it. Bots keep
`approval: ask`, so they propose before they act.

## What is in it

| Bot | Does | Never does |
|---|---|---|
| Requirements Intake | Turns a request or bug report into a task with observable acceptance criteria | Designs the solution |
| Software Planner | Writes the plan (scope, criteria, steps, tests, risks), then stops for approval | Changes code |
| Software Developer | Implements an approved plan with a failing-first regression test and recorded commands | Pushes, merges or rewrites shared history |
| Code Reviewer | Returns `VERDICT: APPROVED` or `CHANGES_REQUESTED` with severity-tagged findings | Edits code |
| Delivery Reporter | Summarizes progress, blockers, risks and decisions from facts it is given | Creates or closes tracker items |

Developer and Reviewer carry the `evidence-driven-delivery` skill. Enable it per bot
in the panel (D54); it is not switched on by installing the extension.

## Connect GitHub Issues

Work is tracked as GitHub Issues in one repository. The install asks for it as
`github_repo` (owner/repo); you can leave it empty and set it later.

1. Set the repository in `extensions/pack-software-production/github.yaml` (the file
   the install rendered; the state labels are there too).
2. Create the labels `needs-info`, `plan-review`, `approved`, `in-progress` and
   `in-review` in that repository.
3. Give the project GitHub access: connect GitHub in the panel's **Connectors** (D43),
   or make `mise run github:check` pass with the host's `gh` login.
4. Grant the GitHub tools to the department's bots in the panel. Give the Delivery
   Reporter and the Code Reviewer read-only access; the Developer also needs write
   access to branches and pull requests, never merge rights.
5. Run `mise run pack-software-production:check`. With a repository set, it verifies
   the access; with none, it reports that the department is not connected yet.

Flow: a person asks Requirements Intake for an issue; the Software Planner posts the
plan and adds `plan-review`; a person reads it and adds `approved`; the Software
Developer works on a branch and opens a draft PR (`in-progress`, then `in-review`);
the Code Reviewer posts its verdict on the PR. Only people merge and close.

## What it does not do

- It does not run CI or merge pull requests. The bots only read and write what
  their GitHub tools allow, and a person owns merges.
- It does not run code on its own. The Developer's tests run wherever the project
  runs them, and the Reviewer judges the evidence it is shown.
- It contains no company-specific rules, releases, or branch names.

## Open points before adoption

- **Models.** The department pins `claude/claude-sonnet-5-5` and
  `claude/claude-haiku-5-5`. A project on another engine should edit those lines
  before import, or use the panel's model choice after import. Check the names with
  `openmausbot models`.
- **Read-only bots.** Every bot starts with `tools: native:*`. Narrow the Reviewer
  and Reporter to read-only tools before the first real run.
- **Rooms.** The department has no room yet. Add one when the team needs a shared
  channel.

Contract and decision: the framework's `docs/PLAN.md` (D96) and `docs/team-templates.md`.
The guide people read after installing is this file, which stays in the extension source.
