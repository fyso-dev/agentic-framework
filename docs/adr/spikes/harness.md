# Spike: Dagu `harness.run` for the Builder's `dev-task`

Phase 0, question 3 ([PLAN §10](../../PLAN.md#phase-0--spikes-throwaway)). Date: 2026-11-05. Branch: `spike/harness`.

> Can Dagu's `harness.run` step run Claude Code and Codex on the machine's existing subscription logins, inside a given git worktree directory, and return the result?

## Answer

**Yes.** `dev-task` can be pure Dagu (D15 holds). There are four caveats, and `dev-task` must handle each one:

1. **"Succeeded" does not mean the task was done.** When an agent is denied a permission, it exits `0` and the step succeeds. `dev-task` needs a check step after the agent (diff not empty, project checks).
2. **The user's own CLI config is used by the agent.** Claude loads the user's MCP servers and plugins. Codex applies `~/.codex/config.toml`. In this run, the config's approvals reviewer let Codex write in a `read-only` sandbox. Pin the safety flags in the DAG.
3. **Agent progress is not live in Dagu.** Harness stdout is buffered and published only when the step ends. Only stderr streams while the step runs: Codex writes its trace there, Claude writes nothing.
4. **Dagu 2.22.4 does not resolve `${steps.<id>.outputs.path}` in step `working_dir`.** The value stays literal, with no warning. Rebuild the path from env (`${REPO}/.data/wt/<name>-${DAG_RUN_ID}`).

## Versions

| Item | Value |
|---|---|
| Dagu pinned and tested | **v2.22.4**, released 2026-10-26 (more than a week before this spike). Commit `fd5b679`. `dagu_2.22.4_darwin_arm64.tar.gz`, sha256 `b355002a…19e4`, matches `checksums.txt` |
| Executor introduced | v2.5.0: `feat: add harness executor for coding agent CLI orchestration` ([#1978](https://github.com/dagucloud/dagu/pull/1978), 2026-04-10). It used the legacy `type: harness` |
| `action: harness.run` form | In the shipped skill reference since at least v2.9.0 (2026-07-01). The `harnesses.md` text barely changes from v2.22.4 to v2.25.8, the latest release (only the managed OpenCode v2 note) |
| Claude Code | 2.1.318, `authMethod: claude.ai`, `subscriptionType: team` |
| Codex CLI | 0.166.0, "Logged in using ChatGPT" |
| Repo | `dagu-org/dagu` redirects to [`dagucloud/dagu`](https://github.com/dagucloud/dagu) |

Sources:

- [`skills/dagu/references/harnesses.md@v2.22.4`](https://github.com/dagucloud/dagu/blob/v2.22.4/skills/dagu/references/harnesses.md)
- [`README.md@v2.22.4` line 622](https://github.com/dagucloud/dagu/blob/v2.22.4/README.md#L622)
- [`internal/runtime/builtin/harness/provider.go@v2.22.4`](https://github.com/dagucloud/dagu/blob/v2.22.4/internal/runtime/builtin/harness/provider.go#L70-L71): `claude` → `claude -p <prompt>`; `codex` → `codex exec <prompt>`, with `skip-git-repo-check: true` by default
- [`internal/runtime/builtin/harness/harness.go@v2.22.4`](https://github.com/dagucloud/dagu/blob/v2.22.4/internal/runtime/builtin/harness/harness.go): exit mapping (L258–295), process env (L438), stdout spool (L1528)

## YAML (v2.22.4)

```yaml
- id: claude
  working_dir: ${REPO}/.data/wt/claude-${DAG_RUN_ID}
  action: harness.run
  with:
    provider: claude            # or codex, gemini, opencode, … or a custom `harnesses:` entry
    prompt: ${params.TASK}      # required
    model: haiku                # any other key becomes a CLI flag: key: v → --key v; true → --key
    permission-mode: acceptEdits
    allowed-tools: "Write,Read"
    max-turns: 5
  timeout_sec: 300
  output: CLAUDE_RESULT         # final stdout becomes a DAG output (claudeResult)
  stdout:
    artifact: claude.txt        # and a run artifact
```

- The reserved keys are `prompt`, `stdin`, `provider`, `fallback` and `managed`. Every other key is passed to the CLI as a flag.
- A DAG-level `harness:` block sets defaults for all harness steps.
- `fallback:` is an ordered list of providers to try when one fails.

## Evidence

The files are in `spikes/harness/`:

- `dev-task-mini.yaml`
- `failure-probes.yaml`
- `live-log.yaml`
- `scripts/{fetch-dagu,env,up,down,cleanup}.sh`

### Isolation

```text
$ scripts/up.sh          # env -i: only HOME, PATH, USER, LOGNAME, TERM, LANG and DAGU_* reach Dagu
dagu start-all pid 14522 on http://127.0.0.1:8411
$ lsof -nP -a -p 14522 -iTCP -sTCP:LISTEN     → 127.0.0.1:8416, 127.0.0.1:8411
$ lsof -nP -iTCP:50055 -iTCP:18083 -sTCP:LISTEN → dagu 3260 (the user's own Dagu, untouched)
```

`DAGU_HOME=<wt>/.data/dagu`, `DAGU_DAGS_DIR=<wt>/spikes/harness`, `DAGU_AUTH_MODE=none`. The binary is in `<wt>/.data/bin/`.

The step environment, captured by the `env_names` step (variable names only):

```text
_ BASE DAG_DOCS_DIR DAG_NAME … DAGU_PORT … HOME LANG PATH PWD REPO SHLVL TASK TERM USER
```

It contains no `ANTHROPIC_*`, `OPENAI_*`, `CLAUDE_*` or `CODEX_*` variable.

### End-to-end run (`dev-task-mini`, run `034scFjUQD5rxTmpHNLAoR`, started over REST)

```text
$ curl -X POST http://127.0.0.1:8411/api/v1/dags/dev-task-mini/start -d '{}'
22:17:07 running  wt_claude=succeeded wt_codex=succeeded claude=running codex=running
22:17:19 running  claude=succeeded proof_claude=succeeded codex=running
22:17:23 succeeded  (all 6 steps)

=== claude (stdout)  I created `HELLO.md` in the worktree root with the single line `hello from the harness spike` …
=== proof_claude     ?? HELLO.md
                     hello from the harness spike
=== codex (stdout)   Created `HELLO.md`.
=== proof_codex      ?? HELLO.md
                     hello from the harness spike
codex stderr: workdir: <wt>/.data/wt/codex-034scFjUQD5rxTmpHNLAoR · model: gpt-6.1-sol · approval: on-request · sandbox: workspace-write
```

Timing: Claude (haiku) took about 15 s, Codex about 20 s. The two ran in parallel.

`GET /api/v1/dag-runs/dev-task-mini/<id>/outputs` returned `claudeResult`, `codexResult`, `branch`, `path` and `commit`. The artifacts `claude.txt` and `codex.txt` were written under `.data/dagu/data/artifacts/…`.

**The first attempt failed in a misleading way.** That run (`034scAhl…`) used `working_dir: ${steps.wt_claude.outputs.path}`, and also `${params.REPO}` at DAG level. Both stayed literal:

- Dagu created directories named `${steps.wt_codex.outputs.path}` under the server's cwd and ran the agents there.
- Claude wrote `HELLO.md` into the parent repository.
- Both steps reported success; the proof steps then failed.

Source: DAG-level `working_dir` is env-expanded only ([`agent.go` `evaluateWorkingDir`](https://github.com/dagucloud/dagu/blob/v2.22.4/internal/runtime/agent/agent.go#L2284)). The step-level evaluator leaves the `steps.*` reference unresolved, with no warning. The `run:` steps in the same DAG did resolve `${steps.wt_claude.outputs.path}`. The stray files were removed.

### Auth and control

- **Subscription, no API key.** In `live-log`, Claude's `stream-json` init event showed `"apiKeySource": "none"`, `"model": "claude-haiku-5-5"` and `"permissionMode": "default"`. Codex reported "Logged in using ChatGPT".
- **How auth reaches the CLI.** Dagu builds the process env from its own environment plus the DAG env (`cmd.Env = runtime.AllEnvs(ctx)`). `HOME` is the only link the CLIs need:
  - Claude reads its login from the macOS keychain via the user session.
  - Codex reads `~/.codex/auth.json`.
  - Do not pass `bare: true` to Claude: it skips the keychain and the run fails with `Not logged in` (documented).
- **Model.** `model:` works for both (`--model`).
- **Non-interactive mode.** It is built in: `claude -p` and `codex exec`.
- **Permissions.** Claude takes `permission-mode`, `allowed-tools`, `disallowed-tools`, `max-turns` and `max-budget-usd`. Codex takes `sandbox: workspace-write|read-only` and `config: 'approval_policy="never"'`, which becomes `--config …`.
- **The user's CLI config is used by the agent.** The Claude init event listed the user's MCP servers (Datadog, Atlassian, Board, …) and plugins. `allowed-tools` only controls auto-approval, not which tools exist. Codex ran the user's hooks and skills.
- **Output and transcript.**
  - The final assistant text becomes the step stdout. It feeds `output:`, which becomes a DAG output (`/api/v1/dag-runs/<dag>/<id>/outputs`), and `stdout.artifact`.
  - stderr goes to the step `.err` log. For Codex that is the full trace: commands, hooks, token count.
  - The full Claude transcript stays in `~/.claude/projects/<encoded-worktree-path>/`. Codex with `ephemeral: true` saves no session.
  - `output-format: stream-json` + `verbose: true` puts the whole Claude event stream into the step stdout and the artifact.
- **Live progress.** Partial only. The run and step status (running → succeeded) update live in the API and UI. Step stdout stays empty until the step ends: the log API returned nothing for a running Claude `stream-json` step, then 36 lines at completion. That is because the harness spools stdout to a temp file and publishes it only on success, which makes fallback possible ([`harness.go` L258–270, L1528](https://github.com/dagucloud/dagu/blob/v2.22.4/internal/runtime/builtin/harness/harness.go#L258)). stderr is written through a tail writer as it arrives. Dagu has a live agent timeline only for managed OpenCode sessions.

### Failure behavior (`failure-probes`, run `034scK4raS6FtyPtcbKWKu`)

| Probe | Setup | Step status | `${step.exit_code}` | What happened |
|---|---|---|---|---|
| timeout | `timeout_sec: 3` | failed | **124** | `step timed out after 3.016s`. The process group was killed (no orphan `claude` left) |
| claude_denied | `permission-mode: default`, `allowed-tools: Read` | **succeeded** | **0** | "I couldn't create `HELLO.md`: the Write call was denied permission…". Headless mode cannot prompt, so it denies and exits 0 |
| codex_readonly | `sandbox: read-only` | succeeded | 0 | **The file was written anyway.** With `approval: on-request`, the user's `approvals_reviewer = "auto_review"` approved the escalation |
| codex_readonly_strict | `sandbox: read-only`, `config: 'approval_policy="never"'` | succeeded | 0 | "I can't create `STRICT.md` because this workspace is read-only." No file was written |
| bad_model | `model: no-such-model-xyz` | failed | **1** | Exit code passed through. The error message includes the stderr and stdout tails |

The table matches the documented mapping:

- Provider exit codes pass through.
- Setup and internal errors return `1`.
- A timeout returns `124`.
- `fallback:` runs only on failure and only while the context is still active.
- `retry_policy` and `continue_on` work as on any other step.

## Implications for PLAN.md

1. **D15 holds. Close the matching §11 risk.** `harness.run` covers the Builder's needs, so the "fall back to an OMB bot" path is not needed.
2. **Pin Dagu ≥ v2.22.4 in `mise.toml`** (`aqua:dagucloud/dagu`). v2.22.4 is the version tested here. The tooling spike pinned v2.25.8, released the same day as these tests. Its harness reference is unchanged except for the managed OpenCode v2 note. Re-run `dev-task-mini` on v2.25.8 before switching, mainly to check the `working_dir` issue.
3. **Change §7 `dev-task`:**
   - Step 1: use the native `git.worktree.add` action (`branch`, `create_branch`, `base`, `path`) instead of shelling out. `base` must be a branch name: `HEAD` was rejected in a linked worktree. Clean up with `git.worktree.remove` (`delete_branch`).
   - Step 2: set the agent's `working_dir` from env (`${REPO}/.data/wt/feat-<issue>-${DAG_RUN_ID}` or a param), not from `${steps.wt.outputs.path}`. DAG-level `working_dir` must use `${VAR}`, not `${params.VAR}`.
   - Step 2: pin the safety flags in the DAG:
     - Claude: `permission-mode: acceptEdits`, an explicit `allowed-tools`, `max-turns` or `max-budget-usd`.
     - Codex: `sandbox: workspace-write` and `config: 'approval_policy="never"'`.
     - Always set `timeout_sec`.
   - New step 2b: **a "did it do anything" gate.** Fail the run when `git status --porcelain` is empty or the agent reports a refusal, because a denied permission still exits `0`.
   - Step 3: project checks, as planned.
   - Step 4: `gh pr create` from the worktree.
4. **Isolation (§3.1).** Harness steps run with the user's CLI config: Claude's MCP servers, plugins and hooks, and Codex's hooks, skills and approvals reviewer. That is shared on purpose with the logins, but it is not reproducible. For the Builder, consider:
   - Claude: `strict-mcp-config` + `mcp-config`, and `setting-sources`.
   - Codex: `ignore-user-config`, but check first that auth survives it (not tested here).
   - Run Dagu with a clean env (`env -i …`, as `scripts/up.sh` does) so no API key or parent-agent variable leaks into steps.
5. **Observability (§9 and the Builder).** Use `output:` / `stdout.artifact` for the result. Use the step `.err` log for the live Codex trace. For a Claude timeline, use `output-format: stream-json` + `verbose: true`, which arrives at the end, or the transcript under `~/.claude/projects/`.
6. **Output name collisions.** Two `git.worktree.add` steps both publish `branch`, `path` and `commit` as DAG outputs, and the last one wins. Use one worktree per run, or read the values per step.

## Confidence

**High** on the core answer: both providers completed the task in their worktrees, started through the isolated server's REST API and checked with git. The run was repeated in the failure probes.

Medium on:

- **Live progress.** Taken from the source plus one Claude probe. Codex stderr liveness was not watched while running.
- **The `working_dir` bug.** Observed on v2.22.4 only; v2.25.8 was not tested.
- **The Codex read-only bypass.** It depends on this user's `approvals_reviewer` setting.

Not tested:

- Containerized harness steps.
- `fallback:` chains.
- Distributed workers.
- Codex `ignore-user-config` with ChatGPT auth.

## Cleanup

- The Dagu PID 14522 was stopped (`scripts/down.sh`).
- The 6 throwaway worktrees and `spike/harness-tmp-*` branches were removed (`scripts/cleanup.sh`).
- The stray literal-path directories and `HELLO.md` from the first run were removed.
- `.data/` is git-ignored.
- Claude transcripts for the throwaway worktrees remain under `~/.claude/projects/-Users-…-spike-harness--data-wt-*`.
