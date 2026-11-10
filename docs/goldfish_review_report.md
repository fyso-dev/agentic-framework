# Goldfish Annotated Review Report

Date: 2026-11-07 · Round: 1 · Status: historical review; resolution workflow ended by user redirection

The user redirected the work toward a clear product proposal. The target has since been rewritten; line references and proposed repairs below apply only to the reviewed SHA-256, not the current document. The user preferred native read-only access when available and tool-provided limits discovered during initial trials. Remaining repair proposals were not approved or applied. No further review round is pending.

**Target:** [Simple user capabilities proposal](simple-user-capabilities-proposal.md), full file, lines 1–157 at review time.

**Reviewed SHA-256:** `01c52e3a2337ac9cb1b0eb296a942eb6794c89a76a9af3b90d0fb4540a232272`.

**Method:** EGM `egm-review-loop` and `egm-resolve` from upstream revision `e9e1f06aa4e26e95cd4ed37210a0632202c429e9`. Configuration approved by the user. Direct native dispatch with `fork_turns: none`; reviewers had no parent conversation. Host instructions and the filesystem remained available; exclusion of those was not tested.

## Completion and scope

| Reviewer | Standard | Completion | Findings |
|---|---|---|---|
| `goldfish_design_r1` / `design_critic` | `feature-spec-standard` | completed | 2 Major; 0 Blocker; 0 Nit |
| `goldfish_structure_r1` / `structural` | `heilmeier-standard` | completed | 1 Major; 0 Blocker; 1 Nit |

Both reviewers reported reading their assigned persona and standard, the full target, PLAN, panel contract, connector contract, extension contract and skills evaluation. Both also read the documentation index and global instructions. Reports returned through the native agent tool; the parent did not independently inspect child tool traces. Source URLs were excluded as approved. Neither reviewer reported browsing, memory retrieval, edits, delegation or runtime checks.

There are **3 Major findings and 1 Nit**. Round 1 is **not clean** and the process has **not converged**. No fixes below have been applied. These are document findings, not observed runtime defects or results from user testing.

## Prioritized findings and proposed resolution

### design_critic-1-1 — Effective authority does not establish the read-only boundary

- **Reviewer / severity:** `design_critic` / Major.
- **Affected scope:** target lines 19–21, 65, 107–110, 121, 137.
- **Discrepancy:** The proposal promises read-only/draft-only behavior without distinguishing a task instruction from the actual authority of its bot and connection. The connector contract says MCP wildcards can include writes and native tool selection is not shell/network isolation.
- **Rationale:** A pilot could use a broadly authorized bot while the team believes that a read-only task instruction limits its authority.
- **AI suggestion:** PROPOSE FIX.
- **Justification:** Valid against the supplied connector contract. Negative tests alone do not establish an enforceable authority boundary.
- **Proposed edit:** Insert the following paragraph after the task-handoff paragraph in “Fit with the current architecture”:

  > Before proof runs, record the effective provider, MCP and engine-native authority of the selected bot. A read-only instruction is not an access control. Verify provider-enforced read-only credentials where available and a tested approval boundary for any remaining write path, including shell/network paths. A wildcard or tool picker alone is insufficient. If the chosen surface cannot establish the intended boundary, use synthetic fixtures with no live write-capable credentials, identify remaining local write authority, and record live read-only enforcement as unverified. Participant sessions must not depend on an unverified live-data access boundary. Test document instructions that attempt to authorize actions outside the selected task.

### design_critic-1-2 — Workload and per-run limits are undefined

- **Reviewer / severity:** `design_critic` / Major.
- **Affected scope:** target lines 19, 113, 120–127, 134.
- **Discrepancy:** The text/PDF subset, latency target and spending envelope do not define document volume, context volume, concurrent runs or behavior when limits are exceeded.
- **Rationale:** The proposed duration and latency gates cannot be interpreted consistently across small text fixtures and large or scanned documents.
- **AI suggestion:** PROPOSE FIX.
- **Justification:** Define the limit-setting gate now; let measured native capabilities determine the numbers before execution.
- **Proposed edit:** Insert the following paragraph before “Proposed pilot gates”:

  > Before proof runs, freeze a workload sheet for the selected task: supported formats and scan/OCR handling; document count, bytes and pages; extracted text/context limit; provider/account and data period where applicable; simultaneous runs; maximum run duration; and per-run model/resource budget. Each field must have a numeric value or an explicit not-applicable explanation. Start with one active run. Derive supported document values from the native capability check, not from an arbitrary product promise. Inputs over the supported limit must receive a plain-language explanation and a supported alternative; never truncate silently. Record cancellation and timeout behavior, including any work that cannot be stopped. A proof run cannot begin with an unresolved applicable limit.

### structural-1-1 — Resource-cost envelope is incomplete

- **Reviewer / severity:** `structural` / Major.
- **Affected scope:** target lines 125–127.
- **Discrepancy:** Duration and participants are named, but compute footprint, provider fees, model usage and reviewer effort are deferred and unbounded.
- **Rationale:** A reader cannot compare the pilot resource demand against a prepared native bot or direct specialist tool. Bounded provisional assumptions are sufficient; exact prices need not be invented.
- **AI suggestion:** PROPOSE FIX.
- **Justification:** Add explicit human/run bounds and a no-new-spend starting assumption. Keep provider pricing and measured machine footprint as pre-execution gates.
- **Proposed edit:** Replace the two cost/estimate paragraphs beginning “The 5–9 working-day range” and “Dollar cost is not yet estimated” with:

  > For one task, reserve 5–9 engineer person-days, up to 4 product/design review hours and five participant sessions of up to 45 minutes each. These are provisional resource limits, not booked capacity or a delivery commitment. Recruitment and upstream blockers can extend calendar time; exceeding the effort envelope requires a revised plan. Start with an existing development machine and existing subscription access, no new always-on service, at most 20 engineering proof runs and 10 participant/comparison runs. These bounds measure trial volume, not production capacity. Additional EGM review work must be counted in the review allowance or explicitly re-estimated.
  >
  > The default incremental monetary envelope is zero: no new paid service or chargeable API trial without an agreed price-based ceiling. Existing subscriptions are already paid resources, not free compute. Before running the pilot, record engine/provider billing, measured memory/disk needs, applicable quotas, per-run limits and expected total usage. If the existing machine/subscription cannot support the frozen workload, obtain a revised resource and spending envelope before continuing. Report paid API spend, subscription usage and token-equivalent estimates separately. Dollar estimates remain unknown until provider pricing and the selected workload are established.

  The resource numbers above are a proposed planning envelope for user approval, not empirical estimates or already approved expenditure. This report does not authorize pilot execution.

### structural-1-2 — Intermediate progression gate should be explicit

- **Reviewer / severity:** `structural` / Nit.
- **Affected scope:** target lines 120–123, 129–139.
- **Discrepancy:** Final acceptance measures are clear; the isolated-proof stage lacks an explicit condition for progressing to participant sessions.
- **Rationale:** An intermediate examination exists in substance but its passing evidence is less clear.
- **AI suggestion:** PROPOSE FIX.
- **Justification:** One short gate closes this gap and ties the other three proposed fixes to a reviewable decision.
- **Proposed edit:** Append to pilot step 2:

  > Progress to participant sessions only when the frozen sample produces the agreed editable artifact with traceable sources, seeded factual/access/document-instruction checks pass, supported file and connection failures have understandable recovery, and the workload, authority and resource gates above are recorded. Otherwise revise the task or stop the pilot. Keep exact fixtures and APIs in the subsequent scoped design.

## Coverage and boundaries reported by reviewers

The design critic found the alternatives substantive and accepted that exact APIs, files and production architecture are deferred. The structural reviewer found the objectives, audience, existing practice, proposed approach, impact, risks, timeline and final examinations covered. It found no substantive formatting defect and did not require renaming headings to match the standard.

No items are contested, escalated or declined. All four proposed fixes await the user's decision. Applying fixes would not make Round 1 clean retroactively; another fresh review must assess them. The skill requires an explicit human decision before another round and two consecutive clean rounds for convergence, with a five-round cap.

## Resolution choices

- **Auto accept:** apply all four proposed document changes, preserving unrelated work.
- **Continue / no changes:** leave the proposal unchanged and record the remaining findings.
- **Interactive breakdown:** discuss the findings one at a time before applying changes.
- **Custom instruction:** approve, reject or amend specific finding IDs.

This report authorizes no installation, implementation, commit, publication, deployment or production-data access.
