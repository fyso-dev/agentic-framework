# Owner loop

How a bot or a workflow reaches you: asks a question and continues with your answer,
gets a credential without seeing it, and tells you when something needs you. It adds
no service: Dagu and OpenMausBot already do these things, and the skills teach bots
to use them properly.

| Skill | What the bot does | Built on |
|---|---|---|
| `ask-owner` | Asks one clear question and waits; in workflows, a step that waits for a person; passes your chat answer on to a waiting workflow | OpenMausBot question cards; Dagu `human.task` and `dagu_execute action=approve` |
| `request-key` | Sends you to a protected form for a key or password; never asks you to paste it in chat | The panel's extension secrets form (sops + age); OpenMausBot `request_credential` for one-time secrets |
| `notify-owner` | Tells you about results, failures and limits | OpenMausBot notifications and `message_person`; `openmausbot send` from workflows |

Switch them on per bot: panel → Bots → a bot → Profile → Skills, then review and apply.

## Workflows

- `ext-owner-loop-ask` (param `QUESTION`): one question as a Dagu human task. The run
  waits until you answer in Dagu → Human tasks, or a bot passes on the answer you gave
  it in chat. The answer is the run's output `answer`.
- `ext-owner-loop-notify` (params `MESSAGE`, `BOT`): hands a message to one of the
  project's bots, which passes it on in its conversation. It costs one short bot turn.

## What is not there yet

- **Email or chat-app notices sent by Dagu itself.** Dagu can mail and has
  notification channels, but their credentials are not carried into this project's
  Dagu today. Until that is decided, workflows notify through a bot.
- **A form for a lasting secret no extension declares.** Such a key is still added in
  a terminal with `mise run secrets`.
- **Phone notifications** need OpenMausBot's own device pairing, which the project
  owner sets up in OpenMausBot.
