# Project distributions (D56)

Prepare a Fyso project the way a client needs it, publish it, and let the client install it and keep receiving your improvements. It works like `copier update` for the framework, one level down: the framework brings the machinery, a **distribution** brings a project's configuration, documents and bot memory.

```
framework template ──copier update──▶ every project            (framework/**)
publisher project  ──dist:publish──▶ distribution repo (tags v1, v2, …)
                                     └──dist:add / dist:update──▶ client projects
```

Flow is one-way: publisher → clients. Clients do not send changes back (not in scope yet). Step-by-step for a real client: [guide-share-project.md](guide-share-project.md).

## 1. What travels

| Travels | Stays in each installation |
|---|---|
| `project/**` (bots, souls, skills, app access, workflows, apps, `wiki/` documents, `mcp.json`, marketplaces, observability) | `project/distribution.yaml` (the publisher's settings) |
| `state/bots/**` (the bots as last exported from OMB) | `project/auth/**` (web login of the installation) |
| Installed extensions: `extensions/**`, `.copier-answers.ext-*.yml`, `.config/mise/conf.d/ext-*.toml` | `framework/**` (comes from the framework template), `.copier-answers.yml`, ports |
| Bot memory: `state/memory/<bot>/MEMORY.md` and `memory/**` → delivered to `state/dist/memory/<bot>/` | Daily logs `memory/log/**` (they quote user messages), conversations |
| Chosen secrets, encrypted for the clients (`state/dist/secrets.sops.yaml`) | Every other secret; `FYSO_ADMIN_PASSWORD` and `FYSO_AUTH_USERS` are never sent |

Only **committed** files are published (`git ls-tree HEAD`). Symlinks are skipped: they point into `framework/`, which every project already has.

## 2. Publisher

`project/distribution.yaml` (project-owned, not distributed):

```yaml
repo: gh:my-org/acme-fyso          # Git repository clients install from (any Copier source)
secrets: [OPENAI_API_KEY]          # names from secrets.enc.yaml to send; omit or [] = none
recipients: [age1…]                # clients' public keys, printed by `mise run dist:key` on their side
```

`mise run dist:publish [version]`:

1. Clones the repository, empties it and writes the files of §1 under `template/`, with a generated `copier.yml` (`_answers_file: .copier-answers.dist.yml`; no file is a Jinja template, so they arrive exactly as committed).
2. Runs gitleaks and the machine-path check on them. Nothing is pushed if either fails.
3. If `secrets` is set: decrypts `secrets.enc.yaml`, takes those names and encrypts them with SOPS for `recipients` plus the publisher's own key (stdin only, never a plaintext file). The publisher's key lets the next publish detect "no change".
4. Writes `state/dist/manifest.json` (delivered files and the publisher's framework version), commits, tags `vN` (next integer, or the version given) and pushes. Nothing changed → nothing published.

## 3. Client

| Command | What it does |
|---|---|
| `mise run dist:key` | Prints this installation's age public key, for the publisher's `recipients` |
| `mise run dist:add <repo> [version]` | `copier copy --overwrite` (latest tag by default) |
| `mise run dist:update [version]` | `copier recopy --force` (latest tag by default); also the `fyso-dist-update` Dagu workflow, param `VERSION` |
| `mise run dist:status` | Installed version and the latest tag in the repository |

Both `add` and `update` run three steps, which are also the steps of the `fyso-dist-update` workflow:

1. **fetch:** if the stack runs, a snapshot first (what the bots learned is committed). Uncommitted local edits of `project/`, `state/` and `extensions/` are saved as `.data/dist/local-<time>.patch`. Copier writes the distribution: **its files replace local edits** (decided: configuration follows the publisher). Files an earlier version delivered and the new one dropped are removed (manifest diff). Received secrets are written into `secrets.enc.yaml` with the project's own `.sops.yaml` rules; same-name values are replaced.
2. **merge-memory:** for each delivered memory file, a three-way merge of the client's `state/memory/<bot>/…` (mine), the previous delivery from git (base) and the new delivery (theirs) with `git merge-file --union`. Memory is free Markdown that accumulates, so both sides are kept where they differ. A file the publisher did not change since the last version is left alone; a new bot's memory is copied.
3. **apply:** if the stack runs: `mise install`, process-compose reload and Caddy restart (new extensions), bots applied from `state/bots/team.yaml` (or `project/bots/team.yaml`), app access, connector preferences, extension hooks, and the merged memory copied into OMB's workspaces of the changed bots. Before the first start nothing is live: `up` restores bots and memory from git. Then one commit `dist: vN`.

A project that already started must be running for `add`/`update` (its bots and memory live in OMB; merging only git would be overwritten by the next snapshot).

## 4. Limits and next steps

- No way back: client improvements to configuration are replaced on the next update unless they reach the publisher by other means (the local patch is kept in `.data/dist/`).
- The memory merge is line-based. A fact the publisher rewrote and the client also edited keeps both lines.
- Bots created only by the client stay (OMB's team apply does not delete unlisted bots); their configuration is not touched.
- A distribution published with a newer framework than the client's prints a note; the client updates the framework with `copier update`.
- Panel: not yet. Planned: a "new version available" card that enqueues `fyso-dist-update`.

## 5. Verification

`tests/test_distribution.py` (real git, Copier 9.19.1, SOPS, age, gitleaks): publish v1 with a secret for the client → add (configuration, documents, memory, secret; no auth, no logs, no publisher settings) → the client's bot learns and someone edits the wiki → publish v2 (wiki change, deleted file, new memory line, new secret value) → update (wiki replaced, file removed, memory has all three lines, secret updated, the client's own password kept) → a second update and a second publish change nothing. Private secrets are refused.

Live, on generated projects with a running client stack: `dist:add`, then `fyso-dist-update` through the Dagu API merged the publisher's new memory line into the bot's live OMB memory next to what the client's bot had learned, and `doctor` stayed green. [Evidence](../artifacts/delivery-evidence/distribution/README.md).
