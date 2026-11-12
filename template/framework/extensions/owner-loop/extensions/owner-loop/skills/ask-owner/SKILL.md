---
name: ask-owner
description: Ask the owner a question and continue with their answer, from a conversation or from a workflow that must wait for a person. Use when a decision, a missing fact or an approval is the person's, not yours.
---

Ask when the answer is the person's to give: a choice between options, a fact only
they know, permission for something that sends, pays, deletes or publishes. Do not
ask what the wiki, the project or the conversation already answers.

## A good question

- One question, complete on its own: what you need, why, and what happens with each
  answer. Offer two to four concrete options when you can, and say which you would
  pick.
- Their language, no jargon, no internal names.
- Say what you will do meanwhile and what stays blocked.

## In a conversation

Ask in the conversation and end your turn. When your engine offers a question tool
(OpenMausBot shows it as a card and notifies the person's devices), use it; otherwise
write the question as your last message. Continue when they answer. To reach a
person who is not in this conversation, use `message_person` when you have it.

Do not guess and continue. Do not ask the same thing twice: if you were told, it is
in the conversation or in your memory.

## In a workflow

Workflows wait for a person with Dagu's own **human task**. Put this step where the
decision is needed (in the workflow itself; it cannot run in a sub-workflow):

```yaml
  - id: ask
    depends: [prepare]
    action: human.task
    with:
      prompt: "Send the 14 reminders listed in the attached report?"
      form:
        type: object
        properties:
          decision: {type: string, title: Decision, enum: [send, do not send]}
          note: {type: string, title: Note}
        required: [decision]
  - id: send
    depends: [ask]
    preconditions:
      - condition: ${steps.ask.outputs.decision}
        expected: send
```

Form values that are required or have a default become `${steps.<id>.outputs.<name>}`.
The run shows as **waiting** until someone answers in Dagu (Human tasks). Read
`dagu_read target=reference name=authoring` before writing it.

For a single question with no workflow of its own, start the ready one:
`dagu_execute name=ext-owner-loop-ask params="QUESTION=…"`. Keep the run id; when
the run succeeds, its output `answer` holds what the person wrote.

## Passing an answer on

When a workflow waits and the person answers **you** in a conversation:

1. Find it: `dagu_read target=runs` (status waiting), then `dagu_read target=run`
   for the step that waits, its form and its `attemptId`.
2. Repeat the question to the person exactly, and get their answer.
3. Complete it with their words, not yours:
   `dagu_execute action=approve name=<workflow> dagRunId=<run> stepName=<step>
   attemptId=<attempt> inputs={…}`.
4. Say that you passed it on. Never answer a waiting task on your own judgment, and
   never approve on behalf of someone who has not answered.
