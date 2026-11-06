# Spike: OpenMausBot (env passthrough, team round-trip, memory restore)

- **Date:** 2026-11-05
- **Phase 0 items:** PLAN §10 #1, #6, #7
- **Status:** done. Throwaway scripts are in `spikes/omb/`. Runtime data stayed in `.data/` and is not committed.

## Setup

| Item | Value |
|---|---|
| OMB | `npx -y openmausbot@0.1.140` (pinned). Source read at tag `v0.1.140` = commit [`4b74b80`](https://github.com/milind-soni/OpenMausBot/tree/4b74b8044b9f562668a7333747ba9313c0d3ca38) |
| Node | OMB 0.1.140 declares `engines.node >= 24` ("Node 24+ is required"). The default `node` here is 22, so the scripts put a Node 24 bin directory (`NODE24_BIN`) first on `PATH` (it reports v26.5.0). **mise must pin Node ≥ 24.** |
| claude CLI | 2.1.318, subscription login (keychain) |
| Isolation | `serve --port 8504 --data-dir <wt>/.data/omb --no-pair --no-open`, `OMB_WEBHOOK_PORT=8505`, `OPENMAUSBOT_URL=http://127.0.0.1:8504`, `ALLOW_INSECURE_HTTP=true`, npm cache in `.data/npmcache`. Every CLI call goes through `spikes/omb/omb`, which adds `--port 8504` |
| Identity check | `doctor --json` → `server.environmentId` equals `<data-dir>/environment-id`. This is a reliable "is it my instance" check (see Implications) |

Scripts: `env.sh` (env), `omb` (pinned CLI wrapper), `serve.sh` (starts serve with the marker), `team.yaml` (2 bots), `snapshot-memory.sh` and `restore-memory.sh` (map memory by bot name).

---

## Q1. Does OMB pass env vars from `serve` to the `claude` child?

**Answer: yes.** It passes the whole parent environment, with a short denylist. `CLAUDE_CODE_OAUTH_TOKEN` survives on the default `claude` engine. It is stripped only on a *named Claude account* (an engine instance with its own `configDir`).

### Evidence

**Live test 1: harmless marker.** The server was started with `FYSO_SPIKE_MARKER=hello-123`. Bot `Spike Alpha` (`claude/claude-haiku-4-5`, `approval: full`) was asked to run `echo "marker=$FYSO_SPIKE_MARKER oauth=${CLAUDE_CODE_OAUTH_TOKEN:+set}${CLAUDE_CODE_OAUTH_TOKEN:-unset}"`:

```
$ spikes/omb/omb run "Spike Alpha" '…echo …' --timeout 5m
Done: Spike Alpha finished
marker=hello-123 oauth=unset
```

The env of the warm `claude` child, read with `ps -E` (names only):

```
== 91635 claude          (child of the serve node process, CLI 2.1.318)
FYSO_SPIKE_MARKER=hello-123
```

`CLAUDECODE` was set in the launching shell but is **absent** in the child, which matches the strip in the source below.

**Live test 2: `CLAUDE_CODE_OAUTH_TOKEN`, using a fake placeholder.** No real token was set or printed. Serve was restarted with `CLAUDE_CODE_OAUTH_TOKEN=fake-spike-not-a-real-token`, and a message was sent to `Spike Beta`:

```
== 95869 claude
FYSO_SPIKE_MARKER=hello-123
CLAUDE_CODE_OAUTH_TOKEN=fake-spike…(the fake placeholder)

Spike Beta: [error: Failed to authenticate. API Error: 401 Invalid bearer token, failed]
Spike Beta: [notice: Claude is signed out on this computer. Sign in again in Settings → AI to keep using it.]
```

So the variable reaches the child, and `claude` **uses it ahead of the keychain login**: a bad token breaks the turn instead of falling back. A restart without the variable restored normal operation with nothing else to fix.

**Source (v0.1.140):**
- [`server/drivers/claude.ts` L111–136](https://github.com/milind-soni/OpenMausBot/blob/4b74b8044b9f562668a7333747ba9313c0d3ca38/server/drivers/claude.ts#L111-L136), `claudeEnvironment()`: `env = { BASH_MAX_TIMEOUT_MS, ...source, PATH: augmentedPath(), … }`. `source` is `{ ...process.env, ...input.environment }` ([L782–783](https://github.com/milind-soni/OpenMausBot/blob/4b74b8044b9f562668a7333747ba9313c0d3ca38/server/drivers/claude.ts#L782-L783)). It then:
  - only `if (configDir)`, meaning a named account: deletes every `CLAUDE_CODE_OAUTH_*`, every `*_FILE_DESCRIPTOR` key, and the other `CLAUDE_ACCOUNT_ENV_KEYS` that the instance's own environment does not set. The list is at [L75–88](https://github.com/milind-soni/OpenMausBot/blob/4b74b8044b9f562668a7333747ba9313c0d3ca38/server/drivers/claude.ts#L75-L88). The comment says: "Subscription OAuth always comes from this account's own login, never the parent's."
  - always deletes `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT`.
  - always runs `stripWorkspaceCredentialEnv(env)`.
  - always deletes `ANTHROPIC_API_KEY` unless it was injected or set on the instance ("would flip a subscription login to pay-as-you-go").
- [`server/credential-env.ts` L5–56](https://github.com/milind-soni/OpenMausBot/blob/4b74b8044b9f562668a7333747ba9313c0d3ca38/server/credential-env.ts#L5-L56): the denylist. It holds other providers' keys (`XAI_API_KEY`, `MISTRAL_API_KEY`, `CEREBRAS_API_KEY`, `OPENCODE_API_KEY`, `COMPOSIO_API_KEY`, `BOX_TOKEN`, many `OMB_*`), plus every `OMB_CLOUD_*`, `OMB_LICENSE_KEY` and `OMB_INSTALLATION_CREDENTIAL`.
- The spawn at [L1337](https://github.com/milind-soni/OpenMausBot/blob/4b74b8044b9f562668a7333747ba9313c0d3ca38/server/drivers/claude.ts#L1337): `spawnCli(config.cli, args, { cwd, env, … })`. Per turn, OMB adds `OMB_HOOK_*` and `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`.

### Implications for PLAN.md
- §8 holds: exporting `CLAUDE_CODE_OAUTH_TOKEN` (decrypted from sops) into the `openmausbot serve` process in process-compose is enough for the **default** `claude` engine. Do **not** set up Claude as a named account with a `configDir`: OMB strips the parent's OAuth token there by design.
- A bad or expired token in env **wins over** a valid `claude /login`, and the bot shows "Claude is signed out". `mise run doctor` should run `claude auth status` with the *same* env that serve gets, and `auth` should not export an empty or stale value.
- The env passes through *wholesale*. Every secret in the serve env (Dagu creds, `GH_TOKEN`, …) is visible to bots, which have a shell. Give `serve` only the variables bots may see. Keep Caddy and Dagu secrets in their own process env.
- `ANTHROPIC_API_KEY` in the serve env is removed for Claude bots. API-key engines (`claudeApi`) must be configured with `engine set … --key-env`, as §8 already says.

**Confidence: high.** The live marker test, the `ps -E` check on the child, the fake-token 401, and the source all agree.

---

## Q2. Does the team file round-trip, and is `--dry-run` a usable preview?

**Answer: yes.** `apply` → `export` → `apply exported` prints `No changes.` Re-applying the original file also prints `No changes.` `--dry-run --json` gives a stable JSON document with a human-readable `plan[]` and counts. There is no separate `--json` flag for apply: `--json` is the CLI's global flag, and it works with `team apply --dry-run`.

### Evidence

Team file (`spikes/omb/team.yaml`): 2 bots, `model: claude/claude-haiku-4-5`, `approval: full`, `computer: "off"`, absolute `cwd` under `<wt>/.data/work/`, and a one-line `soul`. Valid models came from `omb models` / `doctor --json` (claude: `claude-fable-5-1`, `claude-fable-5`, `claude-opus-5-5`, `claude-opus-5`, `claude-sonnet-5-5`, `claude-sonnet-5` (default), `claude-haiku-5-5`, `claude-haiku-4-5`).

```
$ omb team apply spikes/omb/team.yaml
bot "Spike Alpha": create (claude/claude-haiku-4-5 · Full access · computer off)
bot "Spike Beta": create (claude/claude-haiku-4-5 · Full access · computer off)
Plan: 2 to create, 0 to change, 0 unchanged, 0 to delete.
Applied: 2 created, 0 changed, 0 deleted.

$ omb team export --out .data/rt/exported.yaml
Wrote .data/rt/exported.yaml: 0 teams, 3 bots, 0 rooms, 0 skills.

$ omb team apply .data/rt/exported.yaml
No changes.
{"event":"warning","warning":"bot \"MausBot\" has no computer set: on auto it may ask which computer to use, and nobody answers a headless run"}

$ omb team apply spikes/omb/team.yaml
No changes.
```

The exported file (trimmed). Notes: it adds a dated header comment, lists bots newest first, and **includes the default `MausBot`** (`chief: true`, `claude/claude-sonnet-5`, `approval: full`, no `computer`):

```yaml
# Written by openmausbot team export on 2026-11-06.
# Engine keys are placeholders (SET_ME): set them before applying this elsewhere.
version: 1
bots:
  - name: Spike Beta
    title: Spike bot B
    soul: You are a terse test bot used in an infrastructure spike. Answer in one line.
    model: claude/claude-haiku-4-5
    approval: full
    computer: off
    cwd: /…/spike-omb/.data/work/beta
  - name: Spike Alpha
    …
  - name: MausBot
    chief: true
    model: claude/claude-sonnet-5
    approval: full
```

Sample preview outputs:

```
$ omb team apply changed.yaml --dry-run          # model + approval changed
bot "Spike Alpha": update model claude/claude-haiku-4-5 → claude/claude-sonnet-5; approval Full access → Auto
bot "Spike Beta": update model claude/claude-haiku-4-5 → claude/claude-sonnet-5; approval Full access → Auto
Plan: 0 to create, 2 to change, 0 unchanged, 0 to delete.

$ omb team apply soul.yaml --dry-run             # one bot's soul edited
bot "Spike Alpha": update soul 1 line changed
Plan: 0 to create, 1 to change, 1 unchanged, 0 to delete.

$ omb team apply changed.yaml --dry-run --json
{
  "ok": true,
  "file": "/…/changed.yaml",
  "plan": [
    "bot \"Spike Alpha\": update model claude/claude-haiku-4-5 → claude/claude-sonnet-5; approval Full access → Auto",
    "bot \"Spike Beta\": update model claude/claude-haiku-4-5 → claude/claude-sonnet-5; approval Full access → Auto"
  ],
  "created": 0, "changed": 2, "unchanged": 0, "deleted": 0,
  "applied": false, "writes": 0, "warnings": []
}
```

- Two consecutive `--dry-run --json` runs gave byte-identical output.
- `--check` exits **6** when there are changes and 0 when there are none. `--dry-run` exits 0. Use `--check` as a CI or doctor drift gate.
- Warnings go to **stderr** as JSON lines (`{"event":"warning",…}`), not into stdout JSON. The `warnings` field in the JSON only carries file-level warnings.
- `--prune` deletes only inside a team that has `prune: true` ([`team-apply.ts` L321](https://github.com/milind-soni/OpenMausBot/blob/4b74b8044b9f562668a7333747ba9313c0d3ca38/server/headless/team-apply.ts#L321)). Bots without a team are reported as "not in file (kept)".
- Source: [`server/headless/team-apply.ts` L348–380](https://github.com/milind-soni/OpenMausBot/blob/4b74b8044b9f562668a7333747ba9313c0d3ca38/server/headless/team-apply.ts#L348-L380) (plan, then apply; `result` = `{ ok, file, plan, created, changed, unchanged, deleted, applied, writes, warnings }`). Schema: [`server/headless/team-file.ts`](https://github.com/milind-soni/OpenMausBot/blob/4b74b8044b9f562668a7333747ba9313c0d3ca38/server/headless/team-file.ts). Apply is **not atomic**: "a refused step stops the run … running it again carries on" (file header).

### Implications for PLAN.md
- §6 and §9 hold. The panel's "preview of changes" can run `team apply <file> --dry-run --json` inside a Dagu step and show `plan[]` as a list, with the counts as a summary. The `plan[]` entries are English prose for humans, not structured diffs. Show them verbatim. Do not parse them or try to translate them with i18n; translate only the surrounding labels.
- Capture stderr too, so warnings show in the preview.
- `team.yaml` should **list `MausBot` explicitly** (or whichever bot is chief). Otherwise every `export` adds it back and the git diff is noisy. Set `computer: off` on it to silence the headless warning.
- `export` output differs from a hand-written file: bots come newest first, the date comment changes, and `soul` comes back as one line. The snapshot DAG should not round-trip `team.yaml` through `export` blindly. Either `team.yaml` stays hand-owned and `export` is only used to detect drift (`--check`), or the panel accepts `export` as canonical. Decide in Phase 3.
- `cwd` is stored as an absolute path, so a cloned project on another path needs `cwd` rendered from the project root (a Copier variable or a `mise` task), not committed.
- Use `team apply --check` in `mise run doctor` for "bots applied".

**Confidence: high** for the round-trip and the dry-run format. **Medium** for long-term stability: the `plan[]` wording is not a documented contract and could change between OMB versions. Pin the version (§AGENTS: pin versions).

---

## Q3. Can memory be mapped and restored by bot name?

**Answer: yes.** Copying `MEMORY.md` + `memory/` from the old botId to the new botId (matched by name) on a fresh data dir worked. Both bots recalled their facts. No index or DB has to be rebuilt by hand: OMB re-indexes memory files by mtime and size on the next search.

### Evidence

**Where memory lives.** It is **not** in the bot's `cwd`. It lives under the data dir, keyed by botId:

```
.data/omb/workspaces/<botId>/MEMORY.md                 # first 200 lines loaded each session (MEMORY_MAX_LINES)
.data/omb/workspaces/<botId>/memory/log/YYYY-MM-DD.md  # daily turn log
.data/omb/workspaces/<botId>/memory/<topic>.md         # longer notes (none created in this spike)
.data/omb/memory-journal/<botId>.ndjson                # edit history with diffs (revert/audit); optional
.data/omb/messages.db : memory_files + memory_fts      # FTS index, derived from the files
.data/omb/bots/<botId>/{SOUL.md,history.ndjson}        # soul is restored by team apply, not by copy
```

After asking each bot to "use your memory tool", `MEMORY.md` held `- 2026-11-05 · from chat "…" · Spike Alpha codeword: PELICAN-42` (tool `mcp__agents__memory_update`).

**botId → name.** `omb bots --json` returns `{ bots: [{ id, name, title, section, chiefOfStaff, modelSelection, … }] }`. It does not include `cwd`. Names are unique in a workspace, and the team file uses them as its key (`was:` handles renames), so the name is the right join key. Neither `team export` nor `bots` shows a memory path; the path follows from `workspaces/<id>`. Source: `WORKSPACES_DIR = join(DATA_DIR, "workspaces")` ([`server/workspace.ts` L13](https://github.com/milind-soni/OpenMausBot/blob/4b74b8044b9f562668a7333747ba9313c0d3ca38/server/workspace.ts#L13)).

**Replication run:**

```
$ omb team export --out .data/rt/snapshot-team.yaml
$ spikes/omb/snapshot-memory.sh .data/omb .data/state/memory
snapshot Spike Beta <- 65c8b740-…   snapshot Spike Alpha <- 21d9ea09-…   snapshot MausBot <- 16415600-…
# stop serve; start serve on a NEW empty --data-dir .data/omb2 (new environmentId 475dcd59-…)
$ omb team apply .data/rt/snapshot-team.yaml
Plan: 2 to create, 0 to change, 1 unchanged, 0 to delete.
Applied: 2 created, 0 changed, 0 deleted.
$ spikes/omb/restore-memory.sh .data/state/memory .data/omb2      # while serve is running
restore Spike Alpha -> fe6b1d24-…   restore Spike Beta -> f8078cca-…   restore MausBot -> db2b7eff-…

$ omb run "Spike Alpha" 'Without using any tools … what is your spike codeword? …'
PELICAN-42                                    # from MEMORY.md loaded into the session, no tools
$ omb run "Spike Beta" 'Use your memory search tool to look up your spike codeword …'
WALRUS-17                                     # via mcp__agents__session_search (FTS over memory files)

$ sqlite3 .data/omb2/messages.db "select bot_id,path,bytes from memory_files"
fe6b1d24-…|MEMORY.md|128      fe6b1d24-…|memory/log/2026-11-05.md|407
f8078cca-…|MEMORY.md|128      f8078cca-…|memory/log/2026-11-05.md|440
```

The FTS index for the *new* botIds was built automatically. `syncMemoryIndex(botId)` compares files on disk with indexed rows by `bytes` and `mtime` and re-indexes the differences. It runs before each search ([`server/workspace.ts` L234–255](https://github.com/milind-soni/OpenMausBot/blob/4b74b8044b9f562668a7333747ba9313c0d3ca38/server/workspace.ts#L234-L255)). The new bots' workspace folders did not exist before the restore; OMB creates them lazily (`ensureWorkspace`, mode `0700`).

### Implications for PLAN.md
- §6 holds, with one path correction: the snapshot copies `.data/omb/workspaces/<botId>/{MEMORY.md,memory/}` → `state/memory/<bot-name>/`. `restore-memory` reverses it using `openmausbot bots --json` for id↔name. The two scripts in `spikes/omb/` are about 15 lines each and are a good base for `framework/scripts/`.
- Order in `up`: `serve` → wait for `doctor` → `team apply` → `restore-memory` → only then let bots take turns. A warm `claude` process loads `MEMORY.md` when it starts, so restoring after a bot has already run may not show until its next session.
- Skip `memory-journal/` (history only), `messages.db` (chat history and the derived index), `native/`, `events/` and `checkpoints/`. Conversations are **not** replicated. Say so in the docs: replicated = bots + memory + workflows, not chat history.
- `memory/log/*.md` lines quote the start of user messages (`from chat "…"`). They can hold sensitive text, so the snapshot's `gitleaks protect --staged` gate (§6 step 4) matters here. Consider snapshotting only `MEMORY.md` + `memory/<topic>.md` and leaving out `memory/log/` to keep git small.
- Folder names in `state/memory/<bot-name>/` contain spaces ("Spike Alpha"). The scripts quote paths. Slugging is optional, but the mapping must stay by exact name.

**Confidence: high** for the mechanism (live round-trip plus source). **Medium** for durability across OMB upgrades: the `workspaces/<botId>` layout is internal, not a documented API.

---

## Other findings
- **Node ≥ 24** is required by `openmausbot@0.1.140` (engines field and help text). Add it to `mise.toml`.
- `--port` on every CLI call works. `serve` also opens the webhook receiver on `OMB_WEBHOOK_PORT` (8505 seen listening). No other port in 8500–8509 was used.
- `doctor --json` has no data-dir field. Use `server.environmentId` == `cat <data-dir>/environment-id` as the "this is our instance" check in `mise run doctor` (§3.1).
- serve warns when `agent-browser` on `PATH` (Homebrew 0.21.1) is not the pinned 0.37.0. This doesn't matter with `computer: off`, but `openmausbot browser install` per data dir may be needed later.
- A newly created bot gets a Spanish greeting by default ("Hola, soy Spike Beta…"), probably from the system locale. The seed `MEMORY.md` header was also Spanish. This is harmless, but language could be pinned per project.
- Cost: 6 short Claude turns (haiku-4-5), one of which failed on purpose with the fake token.
