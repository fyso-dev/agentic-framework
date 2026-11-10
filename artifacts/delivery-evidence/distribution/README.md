# Evidence — project distributions (D55)

Contract: [docs/distribution.md](../../../docs/distribution.md). Date: 2026-11-10.

## Automated (no stack)

`python3 -m unittest tests.test_distribution -v` → 3 tests OK (real git, Copier 9.19.1, SOPS 3.13.3, age 1.3.2, gitleaks 8.30.1): publish v1 → add → client edits → publish v2 → update → idempotent second update and publish; per-installation secrets refused; file routing unit test.

## Live (generated projects, running stack)

[`live-e2e.sh`](live-e2e.sh) generates a publisher (port block 29720, never started) and a client (29700, started) from this branch, each with its own age key.

| Step | Observed |
|---|---|
| Client `mise run up` | 5 bots created in its own OMB |
| Publisher v1: wiki page, MausBot memory, `ACME_API_TOKEN` for the client's key; `dist:publish` | gitleaks clean; `published v1 (12 files, secrets: ACME_API_TOKEN)` |
| Client `dist:add` (live) | snapshot first; Copier copy; `secrets received: ACME_API_TOKEN`; `memory merged: MausBot`; caddy reloaded; bots applied (`No changes.`); `memory loaded: MausBot`; commit `dist: v1`; `dist:status` v1 = latest |
| MausBot's live `MEMORY.md` gains a client fact; publisher v2 changes the wiki page and adds a memory line | `dist:status`: `Latest: v2 → mise run dist:update` |
| `fyso-dist-update` enqueued through the Dagu API | `succeeded` (fetch → merge_memory → apply) |
| Result | live OMB memory has all three lines (publisher v1, client fact, publisher v2); wiki = v2; token kept; commits `snapshot`, `dist: v2`; clean tree |
| `mise run doctor` | All checks passed |

Found and fixed while verifying: Dagu rejects dashes in step ids (`merge-memory` → `merge_memory`); Dagu steps start from a cleared environment, so the workflow now passes the project's age key path (`FYSO_COMPOSIO_AGE_KEY_FILE`, already exported by `run-dagu.sh`) to `mise exec`.

Fixture note: a project generated from a local template path records that path in `.copier-answers.yml`, which the pre-update snapshot rejects (check-paths); the script rewrites it to the GitHub source, as a real installation has. The client stack was stopped afterwards.
