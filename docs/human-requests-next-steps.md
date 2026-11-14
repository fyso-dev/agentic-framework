# Human requests: historical prototype brief

> **Historical snapshot, 2026-11-13.** This brief predates the local WIP safeguard and subsequent isolated experiments. The prototype was saved in local commit `499d2c5`; users/passwords were separated in local commit `0af9ed5`. A manually assembled bot/browser recovery fixture subsequently passed the controlled scenario, but normal generated-project lifecycle and doctor remain unverified. The current proposed direction and outstanding acceptance gates are in [the proposal](human-requests-proposal.md) and [D76](PLAN.md#2-decisions-log). The instructions and status below are retained as historical context, not as the current checklist.

Date: 2026-11-13 · Status: **prototype exists, not delivered; the central behavior is unproven**. This document is the working brief for whoever continues. It takes no decision.

Read first: [proposal](human-requests-proposal.md) · [spike](adr/spikes/human-requests.md).

## The need

- An agent must be able to ask a person who is not in its conversation. The project may have several people, possibly behind one shared login.
- An agent must be able to leave a question or decision for the person it is talking to, to be answered later.
- It must be programmatic: other software creates requests and receives answers through an API.

## What is settled

| Topic | Position | Where |
|---|---|---|
| Mechanism | Dagu's native `human.task`: a request is one run with a human step and a return step | Proposal |
| Dedicated products | None adopted. All surveyed are alpha or one-person projects. HITLy is the fallback | Spike |
| Packaging | An extension first (`human-requests`), no change to the core. Promotion to the core later, by recorded criteria | Proposal |
| Recorded decision | None. No entry in the PLAN, no phase | — |

Verified on an isolated Dagu 2.24.0: create, list, read, answer, idempotent retry and survival across a restart, over REST, without a license. Known gaps: no recipient field, the recorded actor is the technical user, a waiting task cannot be cancelled and never expires.

## The prototype

A previous session built a prototype in a temporary git worktree named `fyso-human-requests-ext`, under the system temporary directory, on a detached HEAD at the same commit as `preview`'s feature base. **Nothing is committed, pushed or published.** Its own handoff is `HANDOFF-HUMAN-REQUESTS.md` at the root of that worktree. A disposable generated project (`fyso-hr-project`, same location) was used for the checks.

A second worktree, `fyso-human-requests-panel`, exists beside it and was not inspected.

### What works locally

- Requests can be created, listed, answered, cancelled and expired, and an identical answer can be retried, in a generated project with Dagu 2.24.0.
- The authenticated browser path through the gateway sent an answer and a cancellation and saw the workflow complete, with `origin=none`.
- A basic list of people can be managed. Creating one keeps existing sessions.

### What is missing

- **The central behavior:** a real agent asks, the right person finds the question, and the answer returns to that conversation so the work continues. Not demonstrated.
- **Return to the origin:** delivery to an OpenMausBot conversation is unverified and a retry may duplicate the action. The HTTP return is disabled on purpose.
- **People:** names do not verify identity and do not restrict who sees or answers. Created people have no individual access.
- **Experience:** no notification, no personal inbox, poor context on who asked and why, poor delivery state. The supplier example is a fictional fixture.
- **Checks:** the generated stack's doctor was not green (two engine authentication checks were skipped on purpose) and the full installer suites did not complete. A project-local `PATH` correction was needed to reach the pinned Dagu and was not ported.

### What went beyond the agreed scope

The agreement was an extension with no core change. The worktree modifies 33 tracked files outside the extension:

| Change | Files | Concern |
|---|---|---|
| A **Users** screen in the core panel, with navigation and routing | `template/framework/panel/src/**`, built assets in `panel/dist/` | A core feature that was not requested here and implies a model of people that does not exist yet |
| A web-users API inside the private setup adapter | `web-users-api.cjs` (new), `composio-setup.cjs`, `run-composio-setup.sh`, `template/Caddyfile` | New privileged endpoints (list, create, change, delete users) on an adapter built for another purpose |
| Password policy: explicitly set passwords accept 4–72 bytes | `web-auth-users.cjs`, `web-auth-users.sh`, `docs/web-auth.md`, tests | Weakens D40 and D64. Needs its own decision |
| Installer changes | `installer/macos/**`, `installer/qt/**`, `tests/test_qt_installer.py`, `docs/installation.md` | Unfinished: their suites did not complete |
| `copier.yml`, `docs/README.md` | — | Not reviewed |

The extension itself was placed in `template/framework/extensions/human-requests/` (bundled in the template) and not in its own repository, as the proposal assumed. Decide which is intended before publishing.

None of these diffs was reviewed line by line for this document.

### The order was inverted

The proposal listed two verifications before any build: the return to a real OpenMausBot conversation, and the path through the gateway. The interface was built first. The gateway path is now shown; the return is still unproven, and it is the one that decides whether the feature is useful.

## Instructions

Rules that apply to every step:

- Do not merge, push, publish to the catalog, reset or remove worktrees without the owner's explicit go-ahead.
- Do not commit unless asked. Step 1 needs that go-ahead.
- Never connect to the user's own Dagu or OpenMausBot. Use a disposable generated project with its own ports and data directory, and pass an explicit OpenMausBot port on every CLI call.
- Do not use this feature for sensitive approvals. Under D40 anyone with panel access is a trusted operator; a recipient label or a typed name is neither identity nor authorization.
- Build no more interface until step 3 passes.

### Step 1 — Safeguard the prototype

The work lives uncommitted in a temporary directory and can be lost.

1. In the prototype worktree, run `git status` and confirm the file list matches the table above.
2. With the owner's go-ahead, create a local branch there (suggested: `proto/human-requests`) and commit everything as one work-in-progress commit. Do not push.
3. Check whether the disposable project is still running before assuming it is. A fixture account `test_sesion` remains in it.

### Step 2 — Separate the two scopes

From the safeguarded branch, split the work into two branches off `preview`:

- **Extension only:** `template/framework/extensions/human-requests/**`, `tests/human-requests-extension.test.cjs`, `tests/human-requests-panel.test.cjs`, and its evidence folder. If the extension page cannot work without a core change, list exactly which change and why; that list is the input for the promotion decision in the proposal.
- **Users, passwords and installers:** everything else. Park it. It needs its own proposal covering the model of people, the risk of short passwords and whether user management belongs on the setup adapter. Do not ship it with the extension.

Leave `docs/README.md` conflicts for the end: the main checkout also changes it.

### Step 3 — Prove the return (the gate)

One experiment, no new interface. In a disposable generated project with the extension-only branch:

1. A real OpenMausBot bot, in a real conversation, creates a request through the Dagu tools it already has. Record the conversation's task ID.
2. A person answers from a second browser session, through the gateway.
3. The answer arrives **in that same conversation** and the bot continues the work with it. Capture the conversation before and after.
4. Force a failure of the return step (stop OpenMausBot before answering), then retry the failed step. The answer must be delivered once, the person must not be asked again, and the bot must not act twice.
5. Answer a request whose conversation no longer exists. Record what the request shows.
6. Restart the stack while a request is waiting and repeat step 2.

Pass criteria: steps 3 and 4 succeed and are reproducible from a written procedure. Record the evidence under `artifacts/delivery-evidence/human-requests/` and the result in the spike document.

If step 3 or 4 fails, stop and report. Options then are a different return path (the bot polls the run's state on its next turn) or OpenMausBot's native question card for the same-person case; do not work around it with more glue without a recorded decision.

### Step 4 — Walk one real scenario

Needed from the owner: **which real case to use**. Until one is given, use this default from the framework itself: the bot that builds changes needs a person outside the conversation to approve before it applies them (installing an extension, changing a bot).

For the chosen case, write down, in this order:

1. Which agent asks, and at which point of its work.
2. Which person must answer, and how the agent knows who that is.
3. What that person needs to see to answer without opening anything else: who asks, why, what happens with each choice, what happens if nobody answers.
4. How the person finds out there is a question.
5. What the agent does with each answer, with a cancellation and with an expiry.

Replace the fictional supplier fixture with this case.

### Step 5 — Define the first usable version

Only after steps 3 and 4. Decide each item against the chosen scenario, not in general:

| Item | Question to answer |
|---|---|
| Identity | Is a self-declared name under a shared login enough, or are individual web users required first? |
| Routing | Is a recipient label that only filters enough, or must other people not see the request? |
| Discovery | Is a Pending tab enough, or is a notification required? If so, a `handler_on.wait` script, versioned in the YAML |
| Context | Which fields from step 4.3 are mandatory in every request |
| Delivery state | What the person sees when the answer was saved but not delivered |
| HTTP return | Enable it for other software, and with which credential |
| Skill | Enabled by hand per bot, or proposed by the Bot Architect on connection |

Then update the proposal with the result and record the decision in the PLAN before building further.

### Step 6 — Before any release decision

- `mise run doctor` green on a generated project, with no skipped check.
- The complete installer suites, only if installer changes remain in scope.
- The `PATH` issue that hid the pinned Dagu in the test stack: reproduce it and fix it in the template, or show it was specific to the test setup.
- `scripts/check-paths.sh` passes.
- `docs/README.md` updated in the same change.

## Open questions for the owner

1. Which real scenario to use in step 4.
2. Go-ahead to commit the prototype to a local branch (step 1).
3. Whether the extension lives bundled in the template or in its own repository and the catalog.
4. Whether the Users screen and the password change are wanted at all, and if so as a separate piece of work.
