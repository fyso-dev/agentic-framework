# Conversational Bot Architect — Phase 5.6

D27. Bot Architect translates a request into native OMB team operations, through
`fyso-bot-architect`. It does not write application code or invent another bot
registry. The manual panel remains a supported fallback.

## Contract

The workflow accepts `OP=list|read|connections|plan|apply`, `ACTION=create|update|delete`,
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
description, model, soul (inline), approval, computer (off), cwd (project root), tools (native allow/deny lists).
Engine keys, chief assignments, connected-app account grants and remote computers are outside this CRUD
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

## Native-only discovery and import (D29)

The single bot roster labels committed project definitions, committed native snapshots, and profiles found only in OMB. A snapshot can version a native-created bot without declaring it in the project. Labels mean a saved definition exists, not that later native edits are already saved. Metadata comes from Git HEAD, refreshed at startup, successful snapshots/imports and scheduled observability collection. Unavailable evidence stays unverified.

The `Import and version` action submits `OP=import` with the exact native `BOT_ID` to `fyso-bot-architect`. It exports the native format, excludes host-owned ambient skills, copies the selected imported skill bundle under `project/bots/imported/<id>/`, appends just that profile and commits only those project paths. It never sends bot turns or writes to native OMB. Existing committed declarations replay without another mutation. Local panel drafts disable import; dirty project team files, ambiguous native names, secrets and nonportable references fail before commit. Import failure rolls back only this operation's local project writes.

The operation creates a local configuration commit. Unlike the scheduled snapshot, import itself does not push; configure project replication deliberately. Names remain OMB's native team matching key; do not treat them as globally stable IDs.

Import preserves effective native settings when the export omits native defaults. If shared project defaults would be inherited, it materializes those defaults on existing declarations and removes the shared defaults before appending the imported profile. Existing effective bot definitions remain unchanged; only the native YAML representation changes.

## Native connectors (D41)

`OP=connections` returns a credential-free inventory of native OMB MCP server
names and framework/project/extension MCP source names. It does not probe servers
or list connected-app accounts. `fyso_connections` exposes the same read operation
to desktop agents. Use OMB Apps for connection creation, OAuth, native connection
testing and connected-app account grants; use Bot Architect for versioned MCP
`tools` selections. See [connectors.md](connectors.md).

Tools updates replace the native selection as a whole; omit the field to preserve
it. The native dry-run checks engine support. Codex requires `native:*` in an
explicit allowlist because it cannot narrow engine-native tools; an allowlist
containing only `native:*` removes MCP access. Other engines can reject different
selections. Native validation errors are returned to the caller.

Plans with tools capture the connection revision; changing a declared endpoint or
the native connection catalog invalidates apply. Unknown, disabled native-only
servers and native per-bot server exclusions fail before preview. Native OMB
still controls authentication, effective tool catalogs, approvals and execution.
