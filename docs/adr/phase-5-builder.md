# Phase 5 — Builder implementation and local verification

Date: 2026-11-06 UTC. Decision: D24. Local phase delivery: **complete**. Original remote PR acceptance: **deferred by the user**.

The interrupted branch already contained the initial workflow and Builder soul.
The implementation was recovered without merging the interrupted branch.
It orchestrates Dagu's native `git.worktree.add`, `harness.run` and
`git.worktree.remove` actions, plus one glue script for guards and publication.

## Behavior

`fyso-dev-task` accepts `TASK`, `BASE`, `BRANCH`, `PROVIDER`, `MODEL`, and `PUBLISH`.
It creates a fresh feature branch and worktree, runs Claude or Codex, stages the
result, rejects an empty change, scans staged files for machine-specific paths
and secrets, runs the executable `project/check.sh` from the original checkout
against the candidate working directory, then commits on the feature branch.
The hook must leave the candidate unchanged; unstaged changes fail verification.

D24: `PUBLISH=false` returns the local branch and commit. `PUBLISH=true` requires
an authenticated `gh` and `origin`, pushes the branch and opens a PR. A publication
failure fails the run and preserves its worktree. The PR body uses a temporary
file so task text keeps its newlines. Successful runs remove only the worktree;
the feature branch remains. Failed runs preserve their files for manual recovery.
Snapshots keep their existing behavior; D24 applies only to Builder publication.

Claude uses `acceptEdits`, explicit tools, project settings only, strict MCP
configuration, no transcript persistence, a turn limit and a timeout. Codex uses
`workspace-write`, `approval_policy="never"`, ephemeral sessions and a timeout.
These flags are not a guarantee that host configuration is isolated: Codex still
loads user hooks and skills, as the real run confirmed. Host CLI versions and
subscription logins remain user-managed. `gh` is pinned in mise for publication.

## Evidence

A fresh project was rendered through Copier with the new Builder and workflow
symlink, using port block **19240–19249** and its own data directories.
No existing user Dagu, OMB or process-compose session was controlled.

- `mise run up`: created Workflow Architect, Run Operator and Builder.
- `mise run doctor`: **all checks passed**, including both CLI logins, Dagu API,
  Caddy authentication, OMB environment identity, and team drift. A later doctor
  rerun also passed, with the existing nonfatal bot-drift warning after snapshots.
- Dagu **2.24.0**, run `builder-codex-proof`, **02:44:02–02:44:40 UTC**:
  worktree creation → real Codex subscription turn → change gate → checks →
  commit → local result → worktree removal all succeeded. Exactly one file,
  `project/BUILDER-PROOF.md`, changed relative to the Builder commit's parent. No Builder commit was made on
  the base branch; the stack's independent snapshot job can still commit there (D5).
- Run `builder-claude-proof`, **02:43:35–02:43:38 UTC**: the Claude harness
  reached the subscription CLI but failed with its five-hour usage limit.
  Downstream commit and publication were aborted, and the failure handler
  preserved the worktree. Successful Claude execution remains unverified on 2.24.0.
- Nine regression tests (`python3 -m unittest discover -s tests -v`, with pinned
  gitleaks on PATH): empty changes; failure recovery; new staged local paths;
  local delivery without changing main; secret detection; project check failures;
  staged-candidate replacement by checks; invalid provider/protected branch;
  foreign paths; publication errors (some
  scenarios share a test). All passed.
- Dagu's native validator accepted the workflow; shell syntax and path checks passed.

Native harness reference:
[Dagu v2.24.0 harnesses](https://github.com/dagucloud/dagu/blob/v2.24.0/skills/dagu/references/harnesses.md).

## Updating existing projects

Copier owns `framework/`, but preserves existing `project/bots/team.yaml`.
An update therefore installs the workflow and soul without replacing the team's
customizations. Add a Builder entry referencing
`${FYSO_ROOT}/framework/bots/souls/builder.md` to the existing team, preview with
`mise run bots:plan`, and apply with `mise run bots:apply`.
New projects receive that entry automatically.

## Local completion and deferred remote acceptance

The user authorized committing the implementation and completing this phase, and
explicitly deferred configuring a Git remote. Local scope is complete: the real
Codex change passed the gate and checks and became a feature-branch commit. The
original real-template-issue-through-PR acceptance is deferred until a remote is
configured; it was not executed or silently treated as passed. Successful Claude
execution on 2.24.0 remains unverified because of its subscription limit.
Phases 6–8 have not started.

The browser-access regression reported during handoff was also corrected (D25).
See [delivery evidence](../../artifacts/delivery-evidence/phase-5/README.md).
