# Engine and model selection — open issue

Status: **open**. Requested by the lead on 2026-11-06 while adopting the
framework for Etendo Next. D30 is the first step; this file tracks the rest.

## Goal

The framework adapts to the AI subscriptions the customer actually has:

1. Switching a project from one provider to another is one easy action.
2. A project can distribute bots and runs across both providers.
3. Each role has **recommended** models per provider, and changing them is
   just as easy as accepting the recommendation.

## Where it stands (after D30)

| Capability | Today |
|---|---|
| Pick the provider at generation | ✅ Copier `engine` question sets every bot, the Builder default and `fyso-dev-task` default |
| Unused provider is optional | ✅ doctor and panel check require only engines a declared bot uses, and at least one |
| Change one bot's provider/model | ✅ panel bot form (engine + model selects) or `project/bots/team.yaml`, then plan/apply |
| Mix providers across bots | ✅ possible per bot, but nothing guides it |
| Change the provider for the whole project | ⚠️ manual: edit every `model:` line in `team.yaml`; the Builder soul and `dev-task` default stay on the generated engine |
| Recommended models per role | ⚠️ hardcoded in `template/project/bots/team.yaml.jinja`; not visible in the panel |
| Model list in the panel | ⚠️ OMB's raw list per engine (includes local Ollama models), with no recommendation |
| Model IDs stay valid | ❌ `codex/gpt-6.1-sol` is not listed by OMB 0.1.140 on the Etendo host (`gpt-6-sol` is); nothing detects stale IDs |

## Pending

1. **One source of recommendations.** A small project-owned file (e.g.
   `project/bots/models.yaml`) mapping role tiers to recommended models per
   provider:

   ```yaml
   recommended:
     claude: { strong: claude/claude-sonnet-5, fast: claude/claude-haiku-4-5 }
     codex:  { strong: codex/gpt-6-sol,        fast: codex/gpt-5.4-mini }
   ```

   Rendered from the template, owned by the project afterwards. The team file
   stays native OMB format with concrete models (no custom `auto:` syntax),
   so OMB plan/apply and drift detection keep working unchanged.
2. **Switch the whole project.** A Bot Architect / panel action "use
   provider X" that rewrites each bot's `model:` from the recommendations
   (keeping explicit per-bot overrides if asked), previews with
   `fyso-bots-plan` and applies with `fyso-bots-apply`. One snapshot, one
   commit.
3. **Distribute across providers.** Same action with a per-bot choice; the
   panel shows which provider each bot uses and flags bots on an engine that
   is not signed in.
4. **Builder and `dev-task` follow the project, not the generation answer.**
   Read the default provider from project configuration at run time instead
   of baking it into `builder.md` and `dev-task.yaml`. Optionally fall back to
   the other signed-in engine when the default one hits a subscription limit
   (observed in Phase 5 with Claude).
5. **Recommended first in the panel.** The bot form lists the recommended
   model for the bot's tier first, marked as such, then the rest of OMB's
   list.
6. **Validate model IDs.** Doctor and `bots:plan` warn when a declared or
   recommended model is not in `openmausbot models` for its engine.
7. **Fix the Codex default.** Confirm the correct Codex model IDs with the
   pinned OMB version and update the template recommendations.
8. **Detect at setup.** `mise run setup` could suggest the engine from the
   signed-in CLIs, since a Copier question cannot run commands.
9. **Decision record.** Add a decision (D31) once the recommendation file
   and switching action are agreed; keep native formats as the contract.

## Acceptance

- A Claude-only and a Codex-only project each pass doctor with the full team.
- Switching a running project from one provider to the other is one previewed
  action, leaves one commit, and doctor stays green.
- A mixed team (some bots on each) passes doctor when both are signed in and
  fails only for bots whose engine is signed out.
- The panel shows the recommended model per bot and lets the operator
  override it.
