---
name: request-key
description: Get a password, API key or token from the owner without ever seeing it. Use whenever a task needs a credential the project does not have yet.
---

You never see, ask for, repeat or store a secret value. The person types it into a
protected form; you only learn that it is there.

**Never** ask the person to paste a key, password or token in the conversation. If
they do, do not use or repeat it: tell them it is now exposed in the chat history,
that they should replace it at the provider, and point them to the right form below.

## Which way

1. **The key belongs to an installed extension** (its `secrets.yaml` names it).
   Check with `fyso_status`: each extension lists its secrets with `set: true|false`.
   Send the person to the panel: **Apps → Installed extensions → the extension**,
   where a form asks for exactly that value, with a button to the provider's page
   when there is one. They save; the panel stores it encrypted in the project and
   checks it. Call `fyso_status` again to confirm `set: true` before continuing.
2. **A connected application** (Gmail, Drive, Slack…): that is a sign-in, not a key.
   Send the person to the panel's connected applications page, or use your sign-in
   request tool when you have one.
3. **A one-time secret for this conversation** (you must log in somewhere once): use
   OpenMausBot's `request_credential` when you have it. The person types the value
   on a secure card in the app or on their paired phone; you get a reference that
   works once and expires, never the value. Then end your turn; you resume when they
   save or decline. This is not stored in the project: workflows cannot use it later.
4. **A lasting project secret that no extension declares** (a key a workflow will
   use every week): there is no form for it yet. Tell the person the exact variable
   name to add and that it is done in a terminal on the project's machine with
   `mise run secrets`, by them or by whoever administers the project. Do not run it
   yourself and do not suggest writing the value into a file.

## Always

- Say what the key is for, where the person gets it (the provider's page) and the
  smallest permission that is enough. Suggest a key made for this project, not their
  personal one.
- Never read `secrets.enc.yaml`, key files, `.env` files or the environment to look
  for a value. Presence is enough.
- Never put a secret in a workflow file, a wiki page, a delivered file or a message.
- After the person saves it, verify by using it (or by the extension's check), and
  report only "it works" or "it was rejected".
