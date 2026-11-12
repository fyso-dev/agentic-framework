---
name: automate-this
description: Turn a routine a person describes ("every Monday send me…", "when X happens do Y", "automate this") into a Dagu workflow of the project, through preview and apply.
---

The person describes a routine in their own words. You produce a workflow in
`project/workflows/` that does it, and you show it before it exists. You need the
Dagu MCP (`dagu_read`, `dagu_change`, `dagu_execute`); without `dagu_change`, write
the proposal and hand it to a bot that has it (the Workflow Architect).

## 1. Understand, in plain words

Ask only what is missing, one question at a time:

- **When** does it run: a schedule (day, hour, time zone), by hand, or after something?
- **What goes in:** which files, systems or people supply the data? Is each one
  already connected to the project? (`fyso_project`, `fyso_connections`.)
- **What comes out:** a file, a message, a wiki page, a change in a system? For whom?
- **What must a person decide:** anything that sends, pays, deletes or publishes
  needs a person's yes. Say where you will put that approval.
- **What happens on failure:** who should know, and is a retry safe?

Then restate it in three to six numbered steps and get a yes. If a step needs a
connection or credential the project lacks, stop and say what is missing; do not
invent a way around it.

## 2. Write it with Dagu's own reference

- Read the installed Dagu authoring skill when available (discover it through the
  engine's skill list), then `dagu_read target=reference name=authoring` first, every time. Read one
  similar workflow of the project (`dagu_read target=dags`, then `dag_spec`) to follow
  its conventions.
- Prefer Dagu's built-in actions over shell (`http.request`, `xlsx.*`, `mail.send`,
  `template.render`, `harness.run`, `human.task`). Use `human.task` where a person
  must decide; its form values become `${steps.<id>.outputs.<name>}`.
- For connected applications use the project's Composio guide
  (`framework/skills/composio-workflows/SKILL.md`), never an API key typed into YAML.
- Name it for what it does (`facturas-semanales`), never with the `fyso-` or `ext-`
  prefix. Add a one-line `description`. Use `max_active_runs: 1`.
- No secret, password or token in the file. Secrets are added by a person with
  `mise run secrets`; reference them by name.
- No automatic retry on steps that send, pay or write to an outside system.

## 3. Preview, then apply

1. `dagu_change` in **preview** mode. Show the person: the steps in plain words, the
   schedule in their time zone, what it can change outside the project, and what it
   will cost to run if it uses AI.
2. Apply only after an explicit yes to that preview. A change to an existing
   workflow needs its own preview and yes.
3. Test once by hand (`dagu_execute … wait=true`) with harmless input, or with the
   sending step disabled if a real run would reach other people. Read the run
   (`dagu_read target=run`) and fix what failed.
4. Report: the workflow's name, when it runs next, where its results appear, how to
   pause it (remove or change `schedule`) and how to see its runs in the panel.

## Limits to say out loud

- A workflow does exactly its steps. If the routine needs judgment each time, say so
  and propose a bot conversation or a `harness.run` step instead.
- You do not change `fyso-*` or `ext-*` workflows, the team file or secrets.
- If you cannot verify a step (a system you cannot reach), mark it untested in your
  report.
