# Skills ecosystem — evaluation proposal

Date: 2026-11-07 · Status: deferred evaluation; no adoption decision

This shortlist is incorporated into the broader [simple user capabilities proposal](simple-user-capabilities-proposal.md), which describes beginner-focused capabilities, reusable software, UX references, Elephant Goldfish and a recommended first delivery. Retain this file as the supporting skill-source evaluation.

## Purpose

Reuse existing skills and development practices in Fyso rather than authoring a new library from scratch. The user requested saving this shortlist for later evaluation. This proposal does not change the current phase, install packages or authorize implementation.

## Candidate sources

| Source | Available foundation | Proposed use in Fyso |
|---|---|---|
| [Superpowers](https://github.com/obra/superpowers) | Skills covering design, planning, TDD, debugging, review and verification; an opinionated development workflow | First candidate to evaluate for Builder methodology. Select useful procedures and reconcile its approval, worktree and delegation behavior with project rules |
| [Anthropic Skills](https://github.com/anthropics/skills) | Instructions, scripts and resources for documents, design, web testing, MCP creation and enterprise tasks | Capabilities for specialist bots producing documents, reports and presentations or validating applications |
| [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills) | React performance, accessibility, UX and writing guidelines | Practices for the panel and web applications built by Builder; select rules applicable to the actual stack |
| [skills.sh](https://skills.sh/) | Skill discovery directory and installation CLI | Discovery source for a curated selection; directory presence alone is not evidence of quality or OMB compatibility |
| [Agent Skills specification](https://agentskills.io/specification) | Portable `SKILL.md` format with optional scripts, references and assets | Compatibility reference; retain native formats rather than introduce another skill schema |
| [Elephant Goldfish](https://github.com/google/elephant-goldfish-model) | Context-aware design and fresh-context document review with configurable personas and standards | Internal proposal/specification review; evaluate separately from development execution and user-facing tasks |

Sources were reviewed at documentation level on the date above. Installation, runtime compatibility and task outcomes have not been verified. Recheck upstream content and licenses at the exact revision selected for evaluation.

## Suggested optional packs

- **Development:** planning, systematic debugging, review and verification, initially drawing from Superpowers.
- **Office and business:** documents, spreadsheets, presentations and reports, initially drawing from Anthropic Skills.
- **Frontend:** React, accessibility, performance and UI review, initially drawing from Vercel Agent Skills.

These are proposed groupings, not a new packaging format or an implemented marketplace feature. Keep skills separate from MCP tool access and Dagu execution orchestration. Avoid importing a second orchestrator through a skill pack.

## Evaluation gates

1. Select a small representative subset, starting with Superpowers debugging and verification procedures.
2. Record upstream repository, exact tag or commit, per-skill license, dependencies and intended bots. Determine redistribution rights before bundling anything.
3. Inspect instructions and scripts for conflicts with project authorization, Git ownership, snapshots, secrets and isolation. Identify assumptions about tools, hooks or agent runtimes.
4. Verify discovery and loading separately in the intended OMB and coding-agent surfaces. A shared file format does not guarantee equivalent execution behavior.
5. Run representative normal, ambiguous and failing tasks in an isolated generated project. Check activation, output quality, evidence, unnecessary approvals and context cost against the existing behavior.
6. Verify updates and removal preserve project-owned skills and configuration. Keep upgrades explicit and reproducible.
7. Record results before selecting a distribution mechanism. Prefer existing native installation and framework extension capabilities where they meet the requirements.

## Open questions

- Which skills should be available to Builder, business bots and operators respectively?
- Should Fyso reference upstream packages, vendor selected skills or distribute optional extensions?
- How will skill revisions and provenance be recorded using existing native configuration?
- Which Superpowers procedures add value without duplicating Dagu orchestration or imposing unnecessary ceremony?
- What dependencies and licenses apply to each selected Anthropic document skill?

## Recommended starting point

Evaluate **Superpowers first** as a development-practice foundation, followed by selected Anthropic and Vercel skills. Use skills.sh for discovery and the Agent Skills specification for compatibility. Adoption remains pending evidence from the evaluation gates above.
