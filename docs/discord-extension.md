# Discord extension

Status: published as [`fyso-dev/fyso-ext-discord` v0.1.0](https://github.com/fyso-dev/fyso-ext-discord/releases/tag/v0.1.0) in the official catalog (2026-11-20). Install with `mise run ext:add discord`.

## Intent

A project agent answers people in Discord. A message triggers the Discord bot in an enabled channel. The agent assigned
to that channel replies in a thread and keeps
the conversation's context for as long as the thread lives. This lets a team reach
its agents where it already talks, without opening the panel.

It is an opt-in extension (`gh:fyso-dev/fyso-ext-discord`), not core: it is one
provider integration (see [placement](extensions-contract.md#core-versus-extension-placement)).

## Goals

- Enable one agent per Discord channel, declared in a versioned project file.
- A mention, or any top-level human message in a channel configured to allow it, opens a thread for the agent to reply in.
- Inside a thread the bridge opened, every human message goes to the agent, mention or not.
- One Discord thread = one OpenMausBot conversation (task), so context carries across turns.
- Guided setup in the panel: one token, verified by `doctor.sh` before the step shows done.

## Non-goals (v1)

DMs; outbound attachments; approval buttons or human-request cards;
several guilds with different permissions; progress reactions;
slash commands; Discord-to-person identity mapping; any other chat platform.

## Anti-goals

- No inbound port, public URL or HTTPS requirement. The bridge only dials out.
- No new conversation engine, memory or queue: OpenMausBot owns conversations.
- Never talks to the user's personal OMB: every call passes the project's explicit port.
- No bot replies to itself or to other bots (no loops).
- No secret in tracked files or logs; the token never reaches agents (not `BOT_*`).

## Approaches considered

| | Approach | Trade-off | Outcome |
|---|---|---|---|
| A | **discord.js + a small bridge script** calling `openmausbot run` | Discord only; ~one small file of glue | **Chosen**: fewest moving parts, outbound only, fits existing slots |
| B | Vercel Chat SDK with its Discord adapter | Multi-platform later, but its Discord adapter expects a public HTTPS interactions endpoint plus a gateway listener | Rejected for now; revisit if other channels are requested |
| C | Matterbridge (Discord ↔ HTTP API) | Existing binary, but still needs glue from its API to OMB | Rejected: adds a binary without removing code |

Native options checked first: OpenMausBot 0.1.141 has no Discord channel (only
hosted Slack). Composio's Discord toolkit lets a bot *post*, but nobody can talk to
the bot from Discord. The custom glue is recorded here and in the PLAN decisions log.

## Design

### Pieces (all existing extension slots, [contract §2](extensions-contract.md#2-slots))

| Path | Purpose |
|---|---|
| `extensions/discord/bridge.cjs` | The bridge (discord.js gateway client → `openmausbot run`) |
| `extensions/discord/package.json` + `package-lock.json` | Pins discord.js exactly |
| `extensions/discord/process.yaml` | Process `ext-discord`, started through `run-ext.sh`, restart on failure |
| `extensions/discord/secrets.yaml` | `DISCORD_BOT_TOKEN` (required, `url` → Discord Developer Portal applications page) |
| `extensions/discord/setup.yaml` | Setup step "Connect Discord" with the steps below |
| `extensions/discord/doctor.sh` | Validates the token (`GET /users/@me`) and `project/discord.yaml` |
| `.config/mise/conf.d/ext-discord.toml` | Tasks `discord:check`, `discord:invite` and `discord:add` |
| `extensions/discord/pages/manage.yaml`, `panel/` | Discord page for connection, invites and channel assignments |
| `project/workflows/ext-discord-manage.yaml` | Reads the provider and applies explicit assignment edits from the panel |
| `extensions/discord/discord.example.yaml` | Commented example of the project file below |
| `project/discord.yaml` | Project-owned channel → agent map. **Not seeded by the install** (see below) |
| `.data/ext/discord/` | Runtime: `node_modules`, `threads.json` (thread id → OMB task id) |

### Configuration: `project/discord.yaml`

*Call (builder check):* the install does not create this file. `project/` is not an
extension slot (only `project/workflows/ext-*` is), and a file Copier drops there would
stay uncommitted and block the next `copier update`. Instead the person creates it:
`mise run discord:add <channel-id> <bot-id>` writes or extends it (the person commits),
or saves it in the Discord page, and the setup copy shows the example. No core change is needed. Without the file the
bridge connects and answers nothing; `doctor.sh` stays green and says no channel is enabled.

```yaml
# Which project agent answers in which Discord channel.
# Channel id: Discord → User settings → Advanced → Developer mode, then right-click the channel → Copy ID.
language: es                        # optional: es (default) | en, for the bridge's own status messages
channels:
  - channel: "123456789012345678"   # Discord channel id (string)
    bot: support                    # exact OMB bot id (fyso_bots_list / openmausbot bots)
    mentionRequired: true           # optional, default true
    instructions: Support channel.  # optional, up to 2,000 characters, sent at the start of each new thread
    # senderMode: card              # optional; default is the agent as sender
```

Access: anyone who can see the channel can talk to the agent. Discord's own channel
permissions decide who that is. No role allow-list in v1.

The bridge rereads the file when it changes (no restart needed). An unknown bot id or
a malformed file is reported by `doctor.sh` and logged; that channel is ignored.

### Message flow

1. `messageCreate` from a human (ignore bots, including itself, and webhooks).
2. In an enabled channel, start a thread when the message mentions the bot or
   the channel has `mentionRequired: false`. Start a public
   thread from that message (name: the first ~80 characters), run the agent with
   `--task new`, store `threadId → taskId`, reply in the thread.
3. If the message is in a thread whose id is in `threads.json`: run the same agent
   (the one of the thread's parent channel) with `--task <taskId>`. If the
   channel is assigned to a different agent, the next message starts a new
   conversation in the same Discord thread. Native tasks belong to their agent.
4. Anything else is ignored.

Call: `openmausbot run --bot <id> - --port $FYSO_OMB_PORT --json --task <new|id>
--timeout 30m --on-input exit --on-timeout leave`, message on stdin, the way
`fyso_bot_run` in `framework/scripts/fyso-mcp.cjs` does it. The message text sent to
the agent is prefixed with the Discord display name (`<name>: <text>`) so the agent
knows who spoke.

Discord messages may include up to five attachments, with a limit of 10 MB
per image and 25 MB total. The bridge retrieves them from Discord's
attachment CDN and uploads them through OpenMausBot's native image and file
endpoints. Supported images, documents, text, audio and video are passed
through as native turn attachments, including messages with no caption.
Unsupported files and upload failures produce a status notice in Discord.
The agent's ability to process each file type still follows its engine and
tool permissions.

In card mode the bridge refreshes Discord's typing indicator. In agent-as-sender
mode an agent-authored typing message is edited into the first reply message
or the approval status.

Replies: split at Discord's 2,000-character limit on paragraph/line boundaries,
code fences kept balanced. Mentions in the agent's reply are disabled
(`allowedMentions: {parse: []}`) so an agent cannot ping `@everyone`.

Exit codes from `openmausbot run`:

| Exit | Reply in thread |
|---|---|
| 0 | the agent's final reply |
| 3 (needs input) | "The agent is waiting for an answer in the panel." (i18n not needed: see language below) |
| 4 (timeout) | "Still working; I'll leave it running." The bridge sends the final reply when OpenMausBot settles the turn |
| other | "Something failed; check the panel." Details only in the process log, never in Discord |

Turns in one thread are serialized (one run at a time per thread; later messages wait
in order). Different threads run in parallel (to verify: one OMB bot running two tasks
at once; if it cannot, runs for the same bot queue instead).

*Call (builder check):* after exit 3 or 4 the thread is marked `waiting` or `working` in
`threads.json`. While marked, a new thread message is **not** forwarded: the bridge
replies with the fixed status line again. This keeps anyone in the channel from
answering a question the agent sent to the panel. Before refusing, the bridge checks
the task's state in OMB. After approval or timeout, the bridge follows the
original turn using its native `since` timestamp and delivers the final text
to the same Discord thread. The pending turn and chunk progress survive a
bridge restart. A reply that cannot be associated with a single user turn is
not relayed. With OpenMausBot 0.1.141 the probe is:

```sh
openmausbot wait --thread "$task_id" --port "$FYSO_OMB_PORT" --json \
  --timeout 5s --on-input exit --on-timeout leave --since "$turn_timestamp"
```

Exit 0 clears the mark. Exit 3 or 4 retains it. Exit 1 clears it only when the
structured result identifies a failed or stalled turn and its native job is
terminal. A transport or CLI failure retains the mark.

### Discord application setup (the setup step's description)

```sh
mise run ext:add discord
```

1. In the Developer Portal, create an application; in **Bot**, copy the token and
   enable the **Message Content** privileged intent (needed to read unmentioned
   messages inside threads).
2. Paste the token in the panel under **Setup → Connect Discord**.
3. Open the panel's **Discord** page: invite the bot with its single link, then add
   channels. Commit `project/discord.yaml`, which the page writes.

Terminal equivalents: `mise run discord:invite`, `mise run discord:add <channel-id> <bot-id>`,
`mise run discord:check`.

`doctor.sh` fails with a clear message when the token is invalid. A missing intent
shows up as a gateway close code (4014): the bridge logs it with the fix.

### Discord page

Open **Discord** in the panel navigation. It has two steps:

1. **Discord bot**: the gateway state and one action for the current state: set the
   token, enable Message Content Intent in the Developer Portal, or invite the bot.
   The single invitation requests view channel, send messages, send in threads,
   create public threads, read history, embed links, attach files and Manage Webhooks.
2. **Channels**: one row per assignment, "*Agent* answers when mentioned / every new
   message", with Change and Remove. Change edits in place; Add channel opens a short
   form: channel, agent, *When does it answer?* and optional *Instructions for this
   channel*. A channel with a problem shows one sentence with the fix and a link to
   the channel in Discord.

The extension workflow revalidates the channel and agent, rejects stale edits and
atomically writes `project/discord.yaml`; the bridge reloads it automatically. The
bot cannot discover private channels it cannot see; existing assignments stay
visible by ID when the bot loses access.

### Instructions for the agent

- **Per channel**: `instructions` is prefixed to the first turn of each new thread as
  `[Discord channel instructions]`. OpenMausBot keeps it in that conversation, so it
  costs one prefix per thread; changes apply to new threads.
- **Discord etiquette**: the extension ships a `discord` skill (short replies, no
  Markdown tables, no mentions, how to read `Name: message` turns), enabled per agent
  with the extension-skill toggle (D54).

### Agent identity in Discord

The bridge reads the assigned agent's current name, color and avatar from the
project OpenMausBot on its isolated port. Edit identity in OpenMausBot.

By default the agent is the sender: a bot-owned webhook in the channel posts with
the agent's name and avatar, and an agent-authored typing message is edited into
the reply. If a channel denies Manage Webhooks, the bridge falls back to a card
from the Discord bot (name, avatar and color in an embed), or the name as text
without Embed Links. `senderMode: card` forces the card. The choice is not in the
page: with the single invitation the agent identity almost always works.

Uploaded avatars are cached by OpenMausBot's immutable attachment path; built-in
mascots are rendered to PNG with the pinned Resvg library (no browser). PNGs and
webhook receipts persist under `.data/ext/discord/avatars/`, so unchanged images
are not uploaded again after a restart.

### Language

Bridge status messages are short fixed strings in Spanish and English, chosen by the
optional `language` key of `project/discord.yaml` (default `es`; there is no project-level
language setting to read). The agent's own replies are whatever the
agent writes. Setup copy in `secrets.yaml`/`setup.yaml` is `{es, en}` like other extensions.

## Constraints

- Node runtime from the project's mise; discord.js pinned exactly in the lockfile and
  installed with `npm ci` into `.data/ext/discord/` by the process command. The
  setup tasks can use the framework’s pinned YAML CLI before the process starts.
- Project isolation ([PLAN §3.1](PLAN.md#31-isolation-every-project-runs-its-own-instances)):
  explicit `--port`; no auto-discovery.
- No machine paths in tracked files; `scripts/check-paths.sh` passes.
- Uninstall (`ext:remove`) leaves `project/discord.yaml` in place (project-owned).

## Acceptance (testable beta)

1. Thin real path first: a generated project, a real Discord server, a mention in an
   enabled channel produces a thread and a real agent reply.
2. A second message in the thread, without mention, gets a reply that uses the first
   turn's context.
3. A message in a non-enabled channel, a bot message and the bridge's own messages get
   no reply.
4. A reply over 2,000 characters arrives complete in several messages.
5. Invalid token → setup step "failed"; valid → "done". `mise run doctor` green.
6. Default project without the extension: no new navigation, secrets, processes or
   failing checks.
7. Unit tests: config parsing, message splitting, routing decisions, exit-code mapping
   (no Discord network in unit tests).

## Verification

- 44 Node tests and the Copier 9.19.1 packaging test; `copier copy --vcs-ref v0.1.0
  gh:fyso-dev/fyso-ext-discord` installs the expected slots.
- On a generated macOS project (ports 18540–18559, OpenMausBot 0.1.141) with a real
  Discord server: a real reply with the agent as sender, reply recovery after an
  approval, `discord:check` and `mise run doctor` green, the page's status call and
  instruction save/clear against the real API, and `ext:search discord` from the catalog.
- Not yet verified end to end: a real inbound attachment, an avatar change
  propagating to Discord, a reinstall in a clean project. Files generated by the
  agent are not sent back to Discord.
