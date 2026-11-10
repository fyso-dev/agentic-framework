# Guide: prepare a project for a client and keep it updated

You set up a Fyso project the way a client needs it (bots, workflows, extensions, documents, what the bots already know), hand it over, and keep sending improvements. The client works with it every day; your next version arrives without wiping what their bots learned.

How it works and every rule in detail: [distribution.md](distribution.md) (D55). This page is the step-by-step.

| | You (publisher) | The client |
|---|---|---|
| Owns | the configuration and documents | their installation, logins, conversations and what their bots learn |
| Changes configuration | in your project, then `dist:publish` | locally only for trying things: the next update replaces it |
| Gets updates | — | `dist:update` (or the `fyso-dist-update` workflow in Dagu) |

## Requirements

- Both sides: a Fyso project installed as in [installation.md](installation.md) (sections 1–2), on a framework version that includes distributions.
- A **private Git repository for the distribution**, separate from your project's repository. The client needs read access to it; you need write access.
- Optional: the client's age public key, only if you will send secrets.

## 1. Publisher: create the distribution repository

```sh
gh repo create my-org/acme-fyso --private
gh repo edit my-org/acme-fyso --add-topic fyso-distribution     # optional, to find them later
```

Give the client read access (a collaborator with *read*, or a deploy key on the machine that runs their project).

## 2. Publisher: prepare the project

Work in your project as usual: bots in the panel, workflows in Dagu, extensions from the marketplace, documents in `project/wiki/`. Let the bots learn what the client's bots should start with.

Then commit everything that should travel. Only committed files are published:

```sh
mise run snapshot          # bots and memory as they run now
git status                 # anything else under project/ or extensions/? commit it
```

Create `project/distribution.yaml` (it stays in your project, it is not sent):

```yaml
repo: gh:my-org/acme-fyso
```

Commit it, then publish:

```sh
git add project/distribution.yaml && git commit -m "dist: acme"
mise run dist:publish          # → published v1 (… files) to gh:my-org/acme-fyso
```

Before the first publish, check what will travel:

- [ ] Bots, souls and skills are the client's, not yours (no personal bots left in `project/bots/team.yaml`).
- [ ] `project/wiki/` has only documents the client may read.
- [ ] Bot memory (`state/memory/<bot>/MEMORY.md`) holds nothing private of yours. Daily logs never travel.
- [ ] Extensions the client needs are installed; their secret values are not sent (see §5).

`dist:publish` refuses to push when gitleaks finds a possible secret or a file has a path of your machine.

## 3. Client: install

The client (or you, on their machine) installs a normal Fyso project with [installation.md](installation.md) sections 1–2 (`copier copy`, `git init`, `mise install`, `mise run setup`). Then:

```sh
mise run dist:add gh:my-org/acme-fyso
mise run up            # if it was not running; a running project is updated live
mise run doctor
```

The panel now shows your bots, workflows, extensions and documents, and each bot starts with the memory you gave it.

## 4. The improvement cycle

You improve your project, commit and publish:

```sh
mise run snapshot && mise run dist:publish     # → published v2
```

The client sees it and updates:

```sh
mise run dist:status       # Version: v1   Latest: v2  → mise run dist:update
mise run dist:update       # or run fyso-dist-update in Dagu
```

What happens on update:

- Your configuration and documents **replace** theirs. If they had uncommitted edits, a patch is kept in `.data/dist/local-<time>.patch`; send it to you if something there should become part of the distribution.
- Memory is **merged**: what you added appears next to what their bots learned; nothing of theirs is removed.
- Files you deleted are deleted on their side too.
- Bots they created only on their side stay as they are.

The client's project must be running for `dist:update` once it has started (its bots and memory live in OpenMausBot).

## 5. Optional: send secrets

Only when the client should use **your** credentials (for example a shared API key):

1. The client runs `mise run dist:key` and sends you the line starting with `age1…` (a public key, safe to share).
2. You list the names and the key in `project/distribution.yaml`:

   ```yaml
   repo: gh:my-org/acme-fyso
   secrets: [ACME_API_TOKEN]
   recipients: [age1qqq…]          # one per client installation
   ```

3. Commit and `mise run dist:publish`. On their next `dist:add`/`dist:update`, the values are written into their `secrets.enc.yaml`.

Values are encrypted for those keys (and yours); nobody else can read them, not even with access to the repository. Each installation's own Dagu password and web users are never sent. If the client prefers their own credentials, leave `secrets` empty and they set them with `mise run secrets` or in the panel.

## 6. Several clients

One distribution repository per offer. Clients that need different configurations get different publisher projects (or different branches of yours, each with its own `distribution.yaml`). Add every client installation's key to `recipients` if they all receive secrets.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `project/distribution.yaml is missing` | Create it (§2) and commit it. |
| `no changes since the last version; nothing published` | Nothing committed changed. Run `mise run snapshot`, commit, publish again. |
| `gitleaks found possible secrets` / `machine-specific paths` | A file to publish has a credential or a path of your machine. Fix the file (memory: edit `state/memory/…`), commit, publish. |
| `… belong to each installation and are never sent` | Remove `FYSO_ADMIN_PASSWORD` / `FYSO_AUTH_USERS` from `secrets`. |
| Client: `start the project first (mise run up)` | The project already ran once; start it, then update. |
| Client: `failed to decrypt` on update | Their key is not in `recipients`, or it changed. Add the current `dist:key` output and publish again. |
| Client: `published with framework …, this project has …` | Their framework is older or newer than yours. Update the framework (installation.md, *Update an existing generated project*) if something is missing. |
| A client change disappeared after an update | Expected: configuration follows the publisher. Recover it from `.data/dist/local-*.patch` or the client's Git history and add it on the publisher side. |
