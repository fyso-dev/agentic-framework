# Confinement of agent processes (D93)

A project's agents must not leave the project folder. OpenMausBot (the bots and their
shells) and Dagu (workflow steps, `harness.run`) run inside an OS sandbox by default:
they read and write the project folder, and nothing else of the user's home.

## What a confined process can do

| | Allowed | Denied |
|---|---|---|
| Files | Read and write the project folder; read the toolchain (mise data, `PATH` entries in the home folder and the folders their links lead to) | Read the rest of the home folder, the project's siblings (other projects) and the shared age key; write anywhere else |
| Secrets | The project's own age key (`.data/confine/age.txt`), so `mise` and `sops` open this project's `secrets.enc.yaml` | The developer's or server's age key, which may open other projects |
| Engine logins | Read and write the credential file of each engine: `~/.claude/.credentials.json`, `~/.codex/auth.json`, `~/.pi/agent/auth.json` (linked into the private home) | The rest of those folders: history, sessions, settings |
| Local IPC | Unix sockets inside the project, this project's own sockets in `/tmp` (process-compose, remote MCP, connector setup, extension APIs) and Dagu's run sockets | Every other Unix socket (other projects, tmux, ssh-agent, the hub) |
| Network | Open: servers keep their ports, agents reach their providers | — |

Every confined process gets a private home, `.data/confine/home`: `HOME`, `TMPDIR`,
the XDG folders, mise's cache and state, and `CLAUDE_CONFIG_DIR`, `CODEX_HOME` and
`PI_CODING_AGENT_DIR` point there. Its `.gitconfig` carries only the user's git author
identity (`user.name`, `user.email`), so snapshots and `dev-task` commits keep working;
credential helpers, aliases and includes stay out. The caddy gateway, the web login, connector setup and
the remote MCP server run framework code only and stay unconfined; remote agents execute
through Dagu, which is confined.

## How

- `framework/scripts/confine.cjs` wraps a command with [Anthropic's sandbox-runtime](https://github.com/anthropics/sandbox-runtime)
  (`srt`, pinned in `mise.toml`) used as a library: Seatbelt on macOS, bubblewrap on Linux.
  Only the file system and local IPC are restricted (no `allowedDomains`, so no proxy and
  no network namespace).
- `lib.sh` `confined_exec` is `clean_exec` through `confine.cjs`; `run-omb.sh` and
  `run-dagu.sh` use it.
- `mise run up` checks the sandbox prerequisites and runs `project-key.cjs ensure`: it
  creates the project key if missing, adds its recipient to `.sops.yaml` and runs
  `sops updatekeys` with the admin key. Commit `.sops.yaml` and `secrets.enc.yaml` after
  the first start. A wiped `.data/` gets a new key; the old recipient stays listed and is
  harmless.
- `mise run doctor` proves the confinement on the host: the project is readable and
  writable, its siblings and the shared key are not, an outside Unix socket does not
  answer, a Dagu run socket opens, and the project key opens the secrets.
- macOS: sandbox-runtime leaves every network operation open when the network is not
  restricted, Unix sockets included. `confine.cjs` adds rules after `(allow network*)`
  that deny connecting to Unix sockets except the resolver, the project's own and
  Dagu's, and allow `kern.boottime` (Node's `os.uptime()`). If the profile is not the
  expected one (another sandbox-runtime version), the process does not start.
- Linux: sandbox-runtime's seccomp filter would block every Unix socket, which Dagu,
  OpenMausBot and the extensions need. It is turned off (`network.allowAllUnixSockets`); `/tmp`
  and the user's runtime folder are hidden instead and the project's own sockets are bound
  back.

## Configuration

In `mise.toml` `[env]` (or `mise.local.toml` for one machine):

```toml
FYSO_CONFINE = "strict"                  # default; "off" runs OMB and Dagu unconfined
FYSO_CONFINE_ALLOW_READ = "/data/shared" # extra folders, separated by ":"
FYSO_CONFINE_ALLOW_WRITE = "/data/out"
```

Linux needs `bubblewrap` and `socat` (`apt install bubblewrap socat`); on Ubuntu 24.04+
also `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`. Without them `up`
stops with the reason unless `FYSO_CONFINE=off`.

## Known limits

- **Linux is not verified yet.** The policy is built and unit-tested; no generated
  project has run confined on Linux. Abstract Unix sockets (Linux only) stay reachable.
- **Token refresh.** An engine that refreshes its login by replacing the credential file
  (instead of writing it in place) replaces the link in the private home: the project
  keeps the new token and the user's file keeps the old one. Claude Code was verified
  with a valid login, not across a refresh. For unattended projects prefer
  `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`) in `secrets.enc.yaml`.
- **macOS Keychain logins** (Claude Code without `.credentials.json`) are not reachable
  from the sandbox; use the token above.
- **Dagu run sockets** are always created in `/tmp/@dagu_*` (an abstract socket on Linux).
  A confined process can reach another project's Dagu run sockets there (status and stop
  of that run), not run commands through them.
- **Unix socket paths** are limited to about 104 characters on macOS. OpenMausBot puts
  its permission broker in `.data/omb/`; a project folder deeper than about 50 characters
  fails to start bots, confined or not.
- The extension processes, the remote MCP server and the panel's own services are not
  confined yet.

## Verification (2026-11-19, macOS 26 arm64)

Generated project from this branch (`port_base` 8700) next to a sibling folder:
`mise run up` created the project key and re-keyed the secrets; `mise run doctor` all
green including the confinement self-test. A Dagu workflow step run through the API
could not read the sibling, the shared age key or `~/Fyso`, could not reach the hub's
process-compose socket, opened the project's secrets and found Claude signed in;
`fyso-snapshot` committed through gitleaks. A bot turn reached Claude through OpenMausBot's
permission broker (the bot's `claude` descends from the sandboxed OMB). Unit tests:
`tests/confine.test.cjs`.
