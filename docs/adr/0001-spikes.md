# ADR 0001 — Phase 0 spikes

Date: 2026-11-05 · Status: **accepted**

Phase 0 verified the unknowns of [PLAN §10](../PLAN.md#10-phases) before any product code. Four agents (2 Claude, 2 Codex) ran in parallel in isolated worktrees, each with its own port block and data dirs. None of them touched the user's own Dagu or OpenMausBot. Each spike report holds the commands, outputs and sources. The throwaway code is under `spikes/<topic>/`.

| Spike | Report | Agent |
|---|---|---|
| OpenMausBot | [spikes/omb.md](spikes/omb.md) | Claude |
| Dagu `harness.run` | [spikes/harness.md](spikes/harness.md) | Claude |
| Tooling, secrets, Git Sync | [spikes/tooling.md](spikes/tooling.md) | Codex |
| Gateway, MCP, panel pattern | [spikes/gateway.md](spikes/gateway.md) | Codex |

## Results

| # | Question | Answer | Consequence |
|---|---|---|---|
| 1 | Does OMB pass env vars to `claude`? | **Yes**, the whole serve env minus a denylist | The token works by env, but a bad token breaks bots with no fallback. `serve` gets only bot-visible secrets |
| 2 | Can mise pin every tool? | **Yes**, all 10 installed on macOS arm64 | Four needed signature checks disabled inside Codex's sandbox; re-verify in Phase 1. Linux checked from release assets only |
| 3 | Does `harness.run` run Claude/Codex on the subscription in a worktree? | **Yes** (Dagu v2.22.4) | `dev-task` is pure Dagu (D15 holds). Pitfalls: `working_dir` interpolation, refusal exits 0, the user's CLI config applies |
| 4 | Dagu MCP from a bot's `.mcp.json`; Dagu proxy auth behind Caddy | MCP **yes**; proxy auth **no** (paid SSO) | New D19: Dagu basic auth with Caddy's credentials, bound to localhost |
| 5 | OMB UI behind Caddy on a subdomain | **Yes** (page, API, SSE) | Pairing is still required; framing is denied, so OMB opens in a new tab (as planned) |
| 6 | `team export` → `apply` round-trip; dry-run as preview | **Yes**, `No changes.`; `--dry-run --json` is stable | The panel shows plan lines as-is (English prose). `--check` (exit 6) is the drift check |
| 7 | Restore memory by bot name | **Yes**, no rebuild needed | Order: apply → restore → turns. Chat history is not replicated. Daily logs need gitleaks |
| 8 | fnox vs sops | Both work through mise | New D20: **sops + age**; fnox later |
| 9 | Does Dagu Git Sync publish? | **Yes**, it commits and pushes UI edits | Not needed while DAGS_DIR is the repo; kept as an option |
| 10 | Panel with no backend | **Yes** | Caddy serves config read-only; the panel starts Dagu workflows with params and reads their outputs |

## Decisions taken

- **D19:** Dagu login = basic auth with the same credentials as Caddy, Dagu bound to `127.0.0.1`.
- **D20:** sops + age (resolves D16).
- **D21:** pinned, tested versions — Dagu `2.24.0`, OpenMausBot `0.1.140`, Node `24` — with a policy of releases at least a week old.

PLAN.md was updated in §1, §2, §3, §3.1, §6, §7, §8, §10 and §11.

## Carried into Phase 1

1. Re-run `mise install` with full signature verification, outside any sandbox. Pin mise itself.
2. Re-run `dev-task-mini` on Dagu `2.24.0` (it was tested on `2.22.4`) and recheck the `working_dir` behavior.
3. `doctor` checks: `environmentId` match, the Claude token is valid, the ports are free.
4. Delete the leftover Claude transcripts of the throwaway worktrees under `~/.claude/projects/` (user's home; the user decides).
