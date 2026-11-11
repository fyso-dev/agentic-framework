# Langfuse extension — local verification (2026-11-09)

Extension: `fyso-ext-langfuse` v0.1.0 (independent repository, D48). Framework: `origin/main` at `df58fa5` (no code change); rebased onto `2a43176`, whose `run-omb.sh` still passes only `BOT_*`, `FYSO_EXT_*_PORT` and Composio's key to bots.

## Unit and packaging

- `node --test tests/*.test.cjs` in the extension: 7/7 pass (URL rules, usage split, full mapping, sync against fake OMB/Langfuse servers, retries, refused redirects, check).
- `python3 -m unittest discover -s tests -p test_packaging.py`: 3/3 pass with Copier 9.19.1 (owned slots only, no install questions, `v0.1.0 → v0.1.1` update).

## Real OMB data

OMB 0.1.141's own trace service (`usage-trace/service.js`) was run over a copy of a local project's usage ledger and span files, and its `detail` output converted. Finding: Codex shell calls are recorded with the raw command line as the tool **name** (OMB redacts and clips only the detail). The exporter names any non-identifier tool `shell` and never sends details or titles.

## Generated project, end to end

1. Copier-generated project from this branch on port block 19400; `mise install`, `mise run setup` (existing developer age key).
2. A local HTTP server recorded requests and answered like Langfuse's `/api/public/projects` and `/api/public/otel/v1/traces`.
3. `mise run ext:add <local tagged repo> -- --vcs-ref v0.1.0`; test keys and `LANGFUSE_BASE_URL=http://127.0.0.1:<port>` written with `sops set`.
4. `mise run langfuse:check`: `authenticated … (project fyso-e2e)`.
5. The copied usage ledger, timestamps shifted to the last hour, seeded into `.data/omb/usage`; `mise run up`.
6. `mise run doctor`: **All checks passed**, including `extensions/langfuse/doctor.sh`.
7. OMB `/api/usage/traces` served 3 roots. Dagu `ext-langfuse-sync` (schedule `*/5 * * * *`) started through the API: `succeeded`.
8. Recorded: one `POST /api/public/otel/v1/traces` with `x-langfuse-ingestion-version: 4` and Basic auth, 9 spans: 3 agents, 4 generations (2 with usage, e.g. `{"input":305,"output":71,"input_cache_read":31744,"total":32120}`), 2 tools (`shell`, `memory_update`). No home path, command or file name in the payload.
9. `mise run langfuse:sync` again: `{"exported":0}`; state file mode 0600.
10. `mise run down`; port block free.

## Configuration simplified (same day)

The install questions (`langfuse_url`, `send_summaries`) were removed: configuration is only `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and optional `LANGFUSE_BASE_URL` (empty = Langfuse Cloud EU) in the encrypted secrets. Re-run on the same project:

1. `mise run ext:update langfuse -- --vcs-ref v0.2.0` from the answered v0.1.0 install: old answers and the `[env]` block removed, no question asked.
2. `LANGFUSE_BASE_URL` set to the recording server with `sops set`; `mise run langfuse:check` authenticated (mise redacts the URL in output, as a secret).
3. `mise run up`; `mise run doctor`: **All checks passed** (`extension ports and required secrets`, `extensions/langfuse/doctor.sh`).
4. Dagu `ext-langfuse-sync` started through the API: `succeeded`. Recorded one OTLP v4 POST with 9 spans (`MausBot`, `gpt-6.1-sol`, `memory_update`, `shell`); no home path and no `langfuse.observation.input` in the payload.
5. `mise run langfuse:sync` again: `{"exported":0}`; state file mode 0600. `mise run down`.

## Pending

- Acceptance and rendering by a real Langfuse instance (Cloud keys or self-hosted v4). The payload follows Langfuse's documented OTLP attribute mapping but has not been ingested by Langfuse yet.
- Catalog entry in `fyso-dev/fyso-extensions`. The repository is published privately at `fyso-dev/fyso-ext-langfuse`, tag `v0.1.0`; its CI passes and `copier copy --vcs-ref v0.1.0 gh:fyso-dev/fyso-ext-langfuse` installs with no questions.
