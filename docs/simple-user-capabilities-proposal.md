# Fyso — ready-to-use capabilities for everyday work

Date: 2026-11-07 · Status: product proposal for discussion

Audience: business owners, employees and independent professionals without technical AI skills. See the [18 researched use-case scenarios](business-professional-use-cases.md) and the reusable [Simple Experience Reviewer](agents/simple-experience-reviewer.md). Scenarios establish preliminary product fit; usability and integrations still require direct observation and execution.

The first [independent scenario review](simple-experience-validation.md) supports task-based entry and identifies continuity, usable output and recovery as the main remaining experience questions.

## What we propose

Turn existing tools and skills into ready-to-use capabilities that people can add to their Fyso project. Each capability brings the assistant, instructions, connections and examples needed for a recognizable task.

The person chooses what they want to accomplish, connects an account or provides files, and starts working. Fyso handles the assembly of the existing pieces. Advanced configuration remains available when needed.

For example: choose “Work with documents”, provide a PDF and ask for a summary, a comparison or a draft. The relevant skills are already selected; the user does not have to search for or install them individually.

This document describes what we could offer. Proposed capabilities and integrations still require implementation and compatibility checks; they are not a claim of delivered functionality.

## Capabilities we could offer

| Capability | What the person can do | Existing foundation to reuse |
|---|---|---|
| **Documents and office work** | Summarize PDFs, compare documents, draft proposals, prepare presentations and work with spreadsheets | Selected Anthropic document skills and native file/tool support |
| **Business assistant** | Consult indicators, understand objectives, identify changes and prepare a business brief | Fyso Biz and a business-focused bot |
| **Connected work** | Use information from connected applications and perform supported actions from a conversation | Native OMB connectors first; Activepieces where additional connectors are useful |
| **Repeat a useful task** | Turn a successful report or recurring check into a scheduled activity | Existing Dagu workflows, scheduling and history |
| **Build and improve software** | Ask Builder to create or modify an application using established development practices | Existing Builder, selected Superpowers procedures and Vercel Agent Skills |
| **Develop and review an idea** | Describe a proposal, receive a clear draft and have a separate reviewer identify gaps | Elephant Goldfish author/reviewer pattern and task-appropriate standards |

These are candidate capabilities, not a requirement to build all six at once. Start with documents and office work, then business assistance. Add integrations and recurring tasks around concrete uses people request.

## What the experience would look like

**Ease of use is the main product criterion.** A capability is useful only if a person can understand how to start and obtain a useful result without learning the underlying software. Reusing a tool also means integrating its experience; exposing several disconnected setup screens is insufficient.

1. Start with a few clear actions such as “Summarize a document”, “Compare proposals” or “Review my business”, with an example of the result.
2. Choose an action and provide files or connect the account it requires. Prepare the assistant and skills behind that action through the existing project setup; ask for additional configuration only when necessary.
3. Continue in the selected assistant with the task context preserved. Use a suggested starter or describe the task in ordinary language.
4. Receive the draft, file or answer, with references where applicable. Offer clear next actions such as edit, download or try again.
5. If the task is useful repeatedly, offer scheduling in ordinary language, with the schedule and last result visible.

Conversation stays in OMB. The panel helps people discover, add, connect and open capabilities. A task-specific extension page is an option when it offers a useful result view that the native tools cannot provide.

### Example: compare two proposals

The person chooses “Compare proposals”, provides two files and receives a comparison table with differences, missing information and references. They can then ask “Focus on delivery times” without selecting another bot or providing the files again. The desired flow is a design target; verify native handoff and file support before promising it.

### Experience requirements

- Keep the task, files and relevant context when moving from the panel to the native assistant. If native handoff is limited, make the remaining step explicit and as small as possible.
- If task/file handoff is unavailable, collect material once in the destination assistant. Avoid a panel upload that the person must repeat in the conversation.
- Reuse existing authorized connections. Request a connection when its task needs it, and explain why.
- Present only meaningful choices. Select the default assistant, skills and model in the prepared capability.
- Use short progress messages describing the work. Keep technical details available separately.
- Explain failures with an actionable next step, such as choosing another file or reconnecting an account.
- Retain successful inputs and edits after a failed file. Request only its replacement or the missing detail, rather than restarting the task.
- Name the supported output and its next action: copy the reply, edit the document or export the table. Do not promise a file type before verifying native output support.
- Ask for a decision when missing information or an external action requires it; avoid repeated approvals for routine internal steps.
- Keep sources, missing information and consequential changes visible. Simplicity must help the person understand the result.

Judge the first delivery by observing whether a beginner can start, obtain a useful result and request a change without technical coaching. If the integration makes that difficult, simplify the journey before adding more capabilities.

## How the sources fit together

| Source | What we would take from it |
|---|---|
| [Anthropic Skills](https://github.com/anthropics/skills) | Practical skills and resources for documents and specialized work |
| [Superpowers](https://github.com/obra/superpowers) | Selected development, debugging and verification procedures for Builder |
| [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills) | React, accessibility, performance and interface practices |
| [skills.sh](https://skills.sh/) | Discovery of additional skills for a curated selection |
| [Agent Skills](https://agentskills.io/specification) | The native skill format, preserving portability |
| [Elephant Goldfish](https://github.com/google/elephant-goldfish-model) | Drafting with project context and reviewing with fresh eyes |

The earlier [skills evaluation](skills-ecosystem-evaluation.md) remains supporting material. Select and test useful skills, keep their source and revision, and reuse existing installation formats.

Elephant Goldfish can help us design the capabilities and can inform a future “Review my proposal” capability. Its review ceremony should stay behind a simple interaction: describe the idea, receive a draft, see concrete objections and decide what to change. Adapting this experience is proposed work; running EGM as-is still involves its own commands and checkpoints.

## Keep the product simple

- Describe capabilities through recognizable tasks and examples.
- Provide prepared assistants and selected skills, so beginners can start without configuring an agent.
- Reuse native connections and account authorization. Use read-only access when the provider offers it; explain limitations where it does not. Do not build a separate permissions system for this proposal.
- Discover file and workload limits during initial trials, use the limits already supplied by each tool, and explain unsupported inputs or incomplete results.
- Ask only for information needed to complete the task. Make results editable and show missing information.
- Keep model choice, skill installation and execution details in advanced settings.

## What we need to build

The main work is packaging and integration:

- Choose a small useful set of skills for each capability.
- Prepare the corresponding native bot definitions and starter examples.
- Use the existing extension mechanism to distribute the pieces that belong together. Verify native bot/skill installation before deciding whether any small glue is missing.
- Present those capabilities in the existing marketplace/panel and connect them to the current connector setup.
- Verify that a person can add a capability and complete its sample task without technical assistance.

Reuse [OMB, Dagu and the current panel](PLAN.md), [native connectors](connectors.md) and [extension slots/pages](extensions-contract.md). Any additional format or service should answer an observed integration gap.

## Recommended first delivery

Offer four task entries rather than asking beginners to choose a capability pack:

1. **Prepare a proposal:** turn client notes, a template and supplied terms into an editable draft.
2. **Compare documents or offers:** produce a referenced comparison and clarification questions.
3. **Draft a reply:** use a pasted message and supplied context to prepare an editable response.
4. **Organize notes and next steps:** turn meeting or project notes into a usable action list or agenda.

Keep “Describe what you need” available for requests outside these starters. Summaries remain available within document work. The underlying capabilities still group reusable skills and tools, but users start with recognizable work. Software building and development methods remain supporting capabilities rather than the primary entry for this audience.

This is a proposed starting point because it can demonstrate useful work with files before requiring several connected services. First verify the selected skills, file handling and editable output in OMB. Use that proof to determine the actual supported formats and any necessary UI integration.

Next, offer **Business assistant** around the existing Biz integration: “What changed this month?”, “How is this objective progressing?” and “Prepare a short business brief”. Follow with a recurring brief through Dagu if users find the manual result useful.

## Experience references

- [NN/g: How AI Literacy Shapes GenAI Use](https://www.nngroup.com/articles/ai-literacy/) — help people express their needs and judge results.
- [NN/g: Less Chat, More Answer](https://www.nngroup.com/articles/less-chat-more-answer/) — prioritize useful answers and actions.
- [Google PAIR](https://pair.withgoogle.com/guidebook-v2/) and [Microsoft HAX](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/) — clarify capabilities, expectations and recovery.
- [Cowork plugins](https://claude.com/resources/articles/cowork-plugins) — reference for grouping connections and procedures around work domains.
- [Developing NotebookLM](https://blog.google/innovation-and-ai/products/developing-notebooklm/) — reference for starting with familiar source material and suggested tasks.

These references inform the proposal; they do not establish that the proposed Fyso experience is already usable or integrated.
