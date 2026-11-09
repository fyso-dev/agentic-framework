# Composio workflow findings — 2026-11-09

Implemented under D42 as an optional framework adapter and native DAG example. No connector execution, OAuth configuration, external write, service restart or project bot modification was performed.

## Local evidence

- The four focused Node tests pass: explicit identity/version validation, exact REST request, HTTP/tool/transport failures without retries or provider-body leakage, missing-key rejection before network access.
- The full Node suite passes with the existing pinned YAML 2.8.1 dependency made available locally (the fresh worktree has no panel dependencies installed).
- Native `dagu validate` passes on pinned Dagu 2.24.0 with a separate temporary DAGU_HOME and DAG directory. The example uses `run`, supported by that version.
- `scripts/check-paths.sh` and `git diff --check` pass. New files were additionally inspected for portable paths.
- `mise run doctor` is unavailable at the template repository root (no generated mise configuration). A generated stack doctor and live Composio acceptance have **not** passed; runtime delivery remains pending.

## Acceptance still needed

Generate/update a disposable project, provision its own encrypted secret and age key, start its isolated stack, pass `mise run doctor`, then run an explicitly authorized read-only connector with the correct account/user/scopes/version. Verify real SOPS decryption and result handling in Dagu. Never use a user's unrelated Dagu/OMB session for this proof.

The adapter does not add automatic discovery or OAuth UI. Agents discover schemas through Composio's official catalog and author deterministic requests. Existing generated projects retain project-owned workflows and bot definitions on update; their customized agents must explicitly adopt the shared instructions.

## Review follow-up

Main was integrated without replacing existing contracts; the Composio decision is D42. The custom age-key path now crosses isolated Dagu startup as `FYSO_COMPOSIO_AGE_KEY_FILE`, including mise-over-SOPS precedence. A regression executes the real startup wrapper with a fake Dagu executable and confirms the key value is not passed. The updated full Node suite passes 58 tests (local socket tests require execution outside the restricted sandbox). Live connector acceptance remains pending.

Sonar follow-up: request-file reads are contained in `project/composio/` after resolving symlinks, with a traversal regression. The API endpoint remains fixed HTTPS, the slug is validated before interpolation, and the secret is sent only as `x-api-key`, never in a URL query. The process PATH comes from the framework’s pinned mise toolchain; no user-supplied executable path is accepted by the adapter. Updated suite: 59 Node tests pass.
