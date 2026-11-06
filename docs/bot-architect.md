# Conversational Bot Architect — Phase 5.6

D27. Bot Architect translates a request into native OMB team operations, through
`fyso-bot-architect`. It does not write application code or invent another bot
registry. The manual panel remains a supported fallback.

## Contract

The workflow accepts `OP=list|read|plan|apply`, `ACTION=create|update|delete`,
`BOT_ID`, `BOT_B64` (base64 JSON for one native OMB team bot entry) and `PLAN_ID`.
List/read use native identities. This surface requires unique bot names across
teams; duplicate names are rejected rather than resolved by guesswork. Plans for create/update are OMB native partial
team files: bots absent from the file are kept. Deletion always uses the exact
native bot ID, never team prune. Human requests supply authority; the Architect
must not delete by a fuzzy name or invent authorization for another bot.

The workflow saves its native plan and base revision under ignored
`.data/bot-architect`. Apply requires the exact plan identifier and an unchanged
native configuration/project file revision. A completed plan returns its saved
receipt when retried. Dagu serializes this workflow. A concurrent manual OMB/panel
change can invalidate a plan and requires a new preview.

Only profile fields supported by this first version are accepted: name, title,
description, model, soul (inline), approval, computer (off), cwd (project root).
Engine keys, chief assignments, tools and remote computers are outside this CRUD
surface. New bots default to ask/off and this project's cwd; models remain native
OMB identifiers. Protected framework bots cannot be deleted, and the Architect
cannot modify its own active profile. Busy bots cannot be deleted.

Before mutation: snapshot bots and memory, scan and commit. After native apply:
merge/remove only the selected bot's entry in `project/bots/team.yaml`, scan and
commit it, then refresh the runtime snapshot and commit. Native source formats
remain portable. Snapshot bundles include imported skill sidecars and resolve
file references relative to the source team file. Ambient native CLI skills are
host-owned, are not copied into project snapshots and are rediscovered by OMB.
Known host paths are normalized only in the versioned copy; live data is untouched.
Instruction placeholders are preserved rather than expanded as file paths. The snapshot before deletion is the recovery point; retained
memory is not automatically restored unless the bot exists in the selected config.
A failed operation is reported as failed; no implicit rollback or success claim.

## Conversation entry point

Bot Architect uses this explicit project client:
`mise run bots:architect '<JSON workflow params>'`.
That client only enqueues/polls the same native Dagu workflow. It never performs
a mutation outside the workflow or targets an auto-discovered OMB server.

Explicit create/update/delete requests authorize applying the reviewed native
plan in the same conversation; an exploratory request authorizes preview only.
Ask one precise clarification for ambiguity, not repeated confirmations.

## Verification

Use disposable bots and project-owned instances. Prove conversational CRUD,
exact-target preservation, stale-plan rejection, completed-plan replay, protected
and busy target guards, secret rejection before mutation, and restoring a created
bot from the versioned snapshot. Record native API/CLI and Git evidence separately
from the bot's final text, and run project doctor before marking complete.

## Verified delivery

Real conversational CRUD, exact-definition Git audit, native imported-skill restore,
and the final 13 Node/21 Python regression suite passed. Both project doctors are
green. See [evidence and limits](../artifacts/delivery-evidence/bot-architect/README.md).
