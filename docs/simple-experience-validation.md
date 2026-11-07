# Simple experience validation — first scenario review

Date: 2026-11-07 · Verdict: needs simplification · Scope: documentation and inferred journeys only

## Review method

A fresh subagent used the [Simple Experience Reviewer](agents/simple-experience-reviewer.md), read the complete [proposal](simple-user-capabilities-proposal.md) and [18 use cases](business-professional-use-cases.md), and returned its review. It reported no runtime or observed usability validation. It received no parent conversation.

The proposal was updated toward four task entries during this review. Findings about the older three-starter offer are retained below and marked addressed at document level; the updated experience was not independently re-reviewed or implemented.

## Main finding

The strongest beginner offer is **Prepare a proposal, Compare offers, Draft a reply, and Organize notes**. Capability packs should support these actions behind the scenes. Each journey must keep its inputs, make the result usable and explain how to recover without restarting.

## Persona walkthroughs

| Persona | Material and first action | Useful output and follow-up | Likely failure and simplest recovery |
|---|---|---|---|
| Sales assistant at a small company | Choose Prepare a proposal; provide notes, supplied prices and optional company template | Editable proposal with missing terms marked; ask to change the delivery period | Template cannot be read: retain notes and prices, request only replacement text or file |
| Purchasing worker | Choose Compare offers; provide two offers | Referenced comparison; ask to focus on delivery | Different units or missing tax: label non-comparable values and suggest a question for the supplier |
| Independent consultant | Choose Organize notes; paste past notes and current update | Agenda, open questions and actions; ask for a 30-minute version | “Next Friday” is ambiguous: request the reference date once, retain all other material |

The reviewer estimated three or four meaningful user decisions in these journeys and expected no context re-entry. These are design estimates, not measured task times, click counts or usability scores. Preparing a company template is separate from repeat use; a first attempt should not require the person to create one.

## Findings and disposition

| Finding | Smallest proposed simplification | Disposition |
|---|---|---|
| Capability installation can precede useful work | Start from the requested task and prepare supporting pieces within the flow | Already described as target behavior; native installation/handoff remains to verify |
| Document starters omit replies and meeting preparation | Add Draft a reply and Organize notes | Addressed in the proposal during this review; not implemented |
| Handoff may lose task context or files | Show task and supplied material together; if native handoff is unavailable, collect material once in the destination | Clarified in the proposal; requires native verification |
| “Editable output” does not explain the finish | Specify editable document, copyable reply or exportable table and its corresponding action | Clarified in the proposal; actual artifact support requires execution |
| Recovery does not specify retained work | Preserve successful inputs and edits; replace only the failed input | Clarified in the proposal; behavior requires execution |

## Additional useful ideas

- Update an existing proposal using changed scope and supplied prices, with changes visible. Depends on reliable document editing and retained material.
- Turn a supplier comparison into clarification questions grouped by supplier. Reuses the same files.
- Turn an approved procedure into a new-starter checklist with source references. Does not require company-wide indexing.

Offer these as follow-up suggestions in an existing task rather than more home-screen categories.

## Recommendation

Start with the four file/paste-based tasks. Add business exports or one connection later; schedule a report after its manual version is useful. Keep development methods, connector administration and software-building choices away from the primary beginner entry. Professional drafting and source-bound summaries can help specialists; professional conclusions require their own domain evaluation.

The proposal is plausible for these task families, but research and agent review do not establish that Fyso is already simple. Observe real target users choosing a starter, supplying ordinary material, finding a source or missing term, recovering from a failed file, requesting an edit and using the final result. Those observations remain outstanding.
