---
name: evidence-driven-delivery
description: Use when reviewing a change that must be independently verified. Check that each claimed result has a failing-before and passing-after test, a reproducible command and recorded output, and that a blocked state is reported honestly.
---

# Evidence-driven review

Review the evidence, not only the diff.

## What to verify

1. **The gap was stated on the base.** The change says what failed before, with a reproduction. Without it, ask for it as a finding.
2. **A regression test exists and would fail on the base.** Check that the test asserts the reported behavior. A test that passes on the base proves nothing about the fix.
3. **The fix is the smallest one the plan allows.** Flag unrelated edits as findings.
4. **Every claimed run has its command and output.** A result without a command is unverified; say so.
5. **The reviewed commit is the one being delivered.** A verdict for an older commit does not cover later changes.

## Honest states

Report `blocked` or `needs-human` when the evidence cannot be produced, and name the missing step. Do not approve a change because the evidence looks plausible.
