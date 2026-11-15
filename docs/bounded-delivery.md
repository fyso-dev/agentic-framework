# Bounded development and delivery

This workflow prevents integration work from turning into an open-ended sequence of prototypes, environment rebuilds and acceptance checks. It applies to framework development, not automatically to generated projects. It supplements existing authorization, isolation and verification rules; it does not weaken them.

## 1. Agree on the result, then test the uncertainty

Use the current task document as the single source of truth. Record the user-visible outcome, delivery level, exclusions and a finite acceptance checklist before substantial implementation. Infer routine choices from the request; do not block work on a questionnaire. Use the [brief template](templates/delivery-brief.md) when no suitable record exists.

Identify the dependency most likely to invalidate the approach. Test it first using the pinned software and intended transport, identity and runtime. For a human request, the critical path is: a real agent creates a request, a person answers through the intended authenticated interface, and the same agent conversation receives the answer. A successful form submission or direct callback script proves only part of that path.

Build the smallest vertical slice needed for this experiment. Do not polish dependent screens, add a user-management system or generalize adapters while the critical integration remains unproven. Independent work may continue when it does not depend on that assumption.

## 2. Use checkpoints to change decisions

The default investigation checkpoint is 30 minutes of active investigation. It is a reassessment interval, not a completion estimate. Set a different interval when justified and record it. At the checkpoint, record the hypothesis, result, elapsed time and next discriminating experiment in a few lines.

After two failures testing the same hypothesis, do not repeat the same operation unchanged. Choose a different experiment, a compatible authorized fallback, or a concrete blocker. Waiting is justified only by a verified live process or job; record its handle and expected completion or timeout. Never restart solely because observation timed out.

Report a material estimate overrun when discovered: what was learned, why the original assumption failed, and what changes next. Do not silently spend hours on a new provider, authentication model or infrastructure prerequisite. A short progress message without new evidence is not progress.

If approval review rejects an operation, preserve its reason and investigate a compliant alternative. Do not keep issuing equivalent requests. Ask the user only if a required action remains blocked or a material decision exceeds existing authorization.

## 3. Separate delivery levels

| Level | Required evidence | What it does not establish |
|---|---|---|
| Prototype | Named hypothesis demonstrated; simulated parts identified | A usable end-to-end feature |
| Testable beta | Agreed user journey works in the intended isolated generated project; relevant regressions and required doctor pass; concrete access instructions and limitations | General availability, all platforms or production readiness |
| Release | Beta evidence plus the agreed packaging, upgrade, installation and publication requirements | Production acceptance unless explicitly tested |

Determine installer coverage from the delivery path: a beta installed through an existing project does not automatically require every installer platform. Changes to installer behavior still need relevant verification. Security and isolation requirements remain mandatory at every level. Missing credentials or permissions must be reported as blockers, not hidden by mocks or excluded retroactively.

Classify additional findings as blocking the agreed outcome, relevant regression, or deferred improvement. Add acceptance items only with a specific reason. Do not change the definition of done merely because another check is possible. Explicit user scope changes update the checklist and expected work immediately.

## 4. Verify once at the right boundary

Run focused checks while editing, then the required integration and delivery checks on the candidate. Record the revision or working-tree state, command, outcome and limitations. Re-run affected checks after relevant changes; do not repeat an unchanged full suite to produce another status update. A new test should cover a meaningful failure mode rather than mirror implementation.

Keep fixture evidence distinct from the generated product path. State which exact journey passed and which boundary remains untested. A passing direct script, synthetic browser test or doctor alone cannot substitute for the agreed journey.

## 5. Preserve continuity and close

Keep source and a concise checkpoint in a durable task record, not only in a temporary project. Store no credentials in it. Record the branch/revision, fixture identity, completed checks, remaining blocker, live handles and exact next action. Machine-specific locations belong in local handoff messages or untracked state, not tracked documentation.

On resume, inspect the checkpoint and current state before rebuilding. Reuse valid evidence and healthy fixtures. Keep other agents' work and unrelated services intact. If delegation is authorized, give each agent a bounded output, file ownership and acceptance criteria; do not duplicate the same investigation.

When acceptance passes, hand over the usable result and stop adding improvements. Follow the existing commit/publication authorization. If acceptance is blocked, report the exact failing boundary, available partial result and smallest next action without calling the goal complete.

## Why these rules exist

The November 2026 human-requests work exposed a sequencing problem: UI and account work preceded proof of the real conversational return path. Later integration, recovery, packaging and engine issues forced additional experiments. Temporary fixture loss also required reconstruction. These observations motivate earlier integration proof, explicit delivery levels and durable checkpoints; they do not establish an exact time allocation or make every later validation unnecessary.
