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
| `mise run dist:add <repo\|biz> [version]` | `copier copy --overwrite` (latest tag by default); `biz` installs the organization's setup from Biz (§6) |
| `mise run dist:plan [repo\|biz] [version] [--json]` | Read-only preview of what `add` / `update` would do (§7) |
| `mise run dist:update [version]` | `copier recopy --force` (latest tag by default); also the `fyso-dist-update` Dagu workflow, param `VERSION` |
| `mise run dist:status` | Installed version and the latest tag in the repository |

Both `add` and `update` run three steps, which are also the steps of the `fyso-dist-update` workflow:

1. **fetch:** if the stack runs, a snapshot first (what the bots learned is committed). Uncommitted local edits of `project/`, `state/` and `extensions/` are saved as `.data/dist/local-<time>.patch`, and untracked files there as `local-<time>-untracked.tgz`. Copier writes the distribution: **its files replace local edits** (decided: configuration follows the publisher). Files an earlier version delivered and the new one dropped are removed (manifest diff). **Extension ports are rebound** to this project's block (PLAN §3.1): each `FYSO_EXT_*_PORT` of a delivered `.config/mise/conf.d/ext-<id>.toml`, and the matching `extension_port` in `.copier-answers.ext-<id>.yml`, gets a free port of `base + 10..19`, keeping the port this project already used for it, so updates do not move it. Received secrets are written into `secrets.enc.yaml` with the project's own `.sops.yaml` rules; same-name values are replaced.
2. **merge-memory:** for each delivered memory file, a three-way merge of the client's `state/memory/<bot>/…` (mine), the previous delivery from git (base) and the new delivery (theirs) with `git merge-file --union`. Memory is free Markdown that accumulates, so both sides are kept where they differ. A file the publisher did not change since the last version is left alone; a new bot's memory is copied.
3. **apply:** if the stack runs: `mise install`, process-compose reload and Caddy restart (new extensions), the **delivered** team applied (`state/bots/team.yaml` when the distribution has one, else its `project/bots/team.yaml`; never the client's own pre-update snapshot) and re-exported to `state/bots/`, app access, connector preferences, extension hooks, and the merged memory copied into OMB's workspaces of the changed bots. Before the first start nothing is live: `up` restores bots and memory from git. Then one commit `dist: vN`, after the same gitleaks and machine-path checks as a snapshot: client-only files under `project/` were never scanned by the publisher. If a check fails, the distribution stays in place uncommitted and nothing reaches Git history.

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

## 6. Biz transport

`repo: biz` in `project/distribution.yaml` publishes to Fyso Biz instead of a git repository (Biz stores one setup per organization and only displays it). Git repositories keep working unchanged. The framework knows only HTTP, not Biz's OAuth: the caller (the Biz extension) provides two environment variables.

| Variable | Meaning |
|---|---|
| `FYSO_DIST_BIZ_URL` | Biz base URL (the OAuth worker); endpoints live under `/oauth/framework-access` |
| `FYSO_DIST_BIZ_ORGANIZATION` | The organization's tenant slug; sent as `?organization=<slug>` on every request (Biz answers 400 `invalid_access_request` without it). All three variables are required |
| `FYSO_DIST_BIZ_TOKEN_CMD` | A shell command that prints a fresh access token (`framework_access` scope). Run once per command; the token is never logged |

- **Publish:** the distribution repository is built exactly as in §2 in a local mirror, `.data/dist/biz-mirror` (a git repo with tags `vN`; on first use it is cloned from Biz's current bundle so versions keep counting). Recipients are the age keys from `GET /recipients` merged with `recipients:` in the yaml, plus the publisher's own. Nothing changed in files **and** recipients → nothing published; recipients changed → secrets are re-encrypted and a new version is published. The mirror is bundled (`git bundle create --all`) and sent with `PUT /setup` and the headers `X-Setup-Version`, `X-Setup-Sha256` and `X-Setup-Manifest` (base64 JSON summary without the file list: `framework`, `files_count`, `extensions`, `mcp_servers`, `bots`, `secrets`; names only, at most 8 KiB encoded, otherwise the publish fails locally; Biz's `manifest_too_large` is reported clearly). If Biz refuses the upload, the new version is forgotten locally so the next publish builds it again.
- **Client:** `dist:add biz`, `dist:update` and `dist:status` (and the `fyso-dist-update` workflow, which runs the same script) download `GET /setup`, verify the SHA-256 and unbundle it into `.data/dist/biz-source` (a git repo with the version tags). Copier installs from there. The tracked `.copier-answers.dist.yml` records the **relative** source `.data/dist/biz-source`, which is how an installation knows it came from Biz; the directory is refreshed before every update, so a fresh clone of the project works too.
- **Errors:** 401 token rejected, 403 no access or not an admin (`admin_required`), 404 no setup yet, 409 version conflict (Biz's current version is shown), 413 bundle over 50 MiB, a checksum mismatch aborts before anything changes.
- The recipients are the public keys members register in Biz (`mise run dist:key` prints one). Secret values never reach Biz in the clear.

**Secrets pending.** If the delivered secrets are not encrypted for this installation's key (it is not yet a recipient), `dist:add` / `dist:update` do not fail: everything else is installed, no secret is written, a warning is printed and `.data/dist/secrets-pending.json` (`{names, since}`, local, untracked) records it. `dist:status` prints `Secrets: pending ...` and `dist:plan --json` reports `"pending": true`. Once the publisher republishes with this key (it is registered in Biz, or listed in `recipients`), the next `dist:update` writes the secrets and removes the file.

## 7. dist:plan

`mise run dist:plan [repo|biz] [version] [--json]` shows what `dist:add` / `dist:update` would do and changes nothing (the distribution is fetched into a temporary directory that is deleted afterwards; with Biz it downloads the bundle). Once a distribution is installed its source is used; before that give the repository, or `biz` (the default when `FYSO_DIST_BIZ_URL` is set).

- **files.added / replaced / removed:** replaced files carry `local_edits`: `uncommitted` (working tree differs from `HEAD`, or untracked) and/or `committed` (`HEAD` differs from what the installed version delivered; on the first install any differing local file counts). These edits are lost on `add`/`update` (§3 keeps only the patch in `.data/dist/`). Extension port lines are ignored in the comparison: ports are rebound per installation. Removed = in the installed version's manifest, not in the new one, and present here.
- **secrets:** names that would be written (new or changed value). `decryptable: false` means this installation's key is not a recipient, so all names are listed and `pending` is `true`.
- **extensions, bots, mcp_servers:** what the project does not have yet (`extensions.removed`: delivered earlier and dropped now).
- **contents:** the full sets the incoming version carries (`extensions`, `mcp_servers`, `bots`), whether or not they exist locally. An item already here and identical to the setup is in `contents` but not in `added`, so a caller can tell it came with the distribution.

```json
{
  "mode": "update", "transport": "biz", "source": "biz",
  "current": "v1", "version": "v2", "up_to_date": false,
  "framework": {"published": "0.9.0", "local": "0.9.0"},
  "files": {
    "added": ["project/wiki/new.md"],
    "replaced": [{"path": "project/wiki/index.md", "local_edits": ["uncommitted"]}],
    "removed": ["project/bots/extra.md"]
  },
  "secrets": {"names": ["API_KEY"], "decryptable": true, "pending": false},
  "extensions": {"added": [], "removed": []},
  "bots": {"added": ["Soporte"]},
  "mcp_servers": {"added": []},
  "contents": {"extensions": ["wiki"], "mcp_servers": ["docs"], "bots": ["Ventas", "Soporte"]}
}
```

`mode` is `add` when nothing is installed; `transport` is `git` or `biz`. Tests: `tests/test_distribution.py` also runs a fake Biz HTTP server (publish → add → republish for a new recipient → update → plan accuracy and read-only-ness) and a git-transport plan regression.

## 8. Several publishers (Biz): publish on top of the latest

A **publisher** is a project with `repo: biz` in `project/distribution.yaml`; other projects are **members**. A publish is built from the publisher's whole project, so Biz refuses one that is not built on the latest version.

- `dist:publish` sends `X-Setup-Base: vN | none`, the version recorded in the tracked `.copier-answers.dist.yml` (`_commit`, source `.data/dist/biz-source`), or `none`. After a successful publish the publisher records itself as installed at the new version (the answers file is updated and committed on its own), so the next publish is based on it. The mirror is re-synchronised from Biz before every publish, so version numbers continue whoever published last.
- Biz answers `409 stale_base` when the base is not its current version. The command fails with a message containing `stale_base` and **exit code 3**: run `dist:update`, then publish again. If Biz has a setup and this project never installed one (base `none`), it fails with **exit code 5** and asks for `mise run dist:add biz` first.
- `dist:update [version]` (also `fyso-dist-update` fetch) on a publisher **merges** instead of replacing. Per file, base = the installed version, ours = the project's current files (committed and uncommitted), theirs = the latest (or given) version; only files that travel in a distribution (`project/**`, `state/bots/**`, extensions) take part. Text is merged with `git merge-file`; a file edited here and deleted there (or the reverse) conflicts. Secrets are not touched (a publisher owns them). No conflict: the merged files are written and committed together with the new answers file as `dist: merge vN` (**exit 0**; `already at vN` when nothing is newer). Then, as for members, the delivered bot memory is union-merged into `state/memory/` (left uncommitted for the next snapshot) and, when the stack runs, the apply step runs: `mise install` and reload if extensions changed, the merged team applied and re-exported, app access, connector preferences, extension hooks, and the merged memory loaded into OMB. Before the first start nothing is live, as today. A snapshot is taken first when the stack runs. Conflict: **nothing in the project changes**, `.data/dist/merge-conflicts.json` is written as `{"base":"v3","latest":"v4","files":["project/wiki/y.md"]}`, and the command exits with **code 4** and a message starting `merge_conflict`. The person resolves it with `dist:update [version] --ours <file>... --theirs <file>...` (options repeatable; use `--` after `mise run dist:update` if mise captures the flags): named files take that side (ours = keep the project's, theirs = the latest version's, whether or not they conflicted), every other file merges normally. It succeeds only when every conflicting file is named; otherwise exit 4 lists the rest and rewrites `merge-conflicts.json`. `dist:plan --json` `merge.conflicts` is the list to offer.
- `dist:plan --json` on a publisher adds `"merge": {"base":"v3","latest":"v4","conflicts":[files]}`, a dry run of the same merge (`null` when the installed version is not in the history). Members keep the replace behavior of §3.

Exit codes of `dist.sh`: 0 ok, 1 error, 3 `stale_base`, 4 `merge_conflict`, 5 publisher has not installed Biz's setup.
