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
