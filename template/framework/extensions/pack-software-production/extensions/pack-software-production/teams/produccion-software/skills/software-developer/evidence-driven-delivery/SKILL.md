---
name: evidence-driven-delivery
description: Use for bug fixes, regression work and any change that must be independently verified. Require a failing-before and passing-after test, reproducible commands, explicit evidence and an honest blocked state.
---

# Evidence-driven delivery

A clean diff is not proof. Build a chain of evidence that another person can reproduce.

## Required sequence

1. **State the gap on the current base.** Record the commit, the files, the reproduction and the failure you expect.
2. **Write or extend a regression test** that fails on the unmodified code for the reported behavior. If it cannot fail on the base, explain why and do not claim regression coverage.
3. **Implement the smallest fix** the approved plan describes. Preserve the work of other people.
4. **Run the regression test after the fix**, then the affected tests and any gate the project requires.
5. **Check the delivery state**: the change is committed on its own branch, the reviewer's verdict is APPROVED for this exact commit, and the remote matches the reviewed commit.

## Evidence to keep

For each step, record the exact command and a short result: the base commit, the failing run, the passing run, the affected test set and its counts, any gate stage that was skipped or failed before this change (with proof), and the final verdict.

Keep long output in a log file and put a short index in the report, with file names and line ranges rather than pasted logs.

## Honest states

- `done`: the change is committed, reviewed for this commit, and every required check passed.
- An open change that still needs a review, a push, a check or a human decision is not done.
- If an environment or a credential blocks the work, use `needs-human`, name the exact missing action and the command that resumes the work. Never hide a failure behind an older passing result.
