# Install from the repository

> **On macOS there is also an installer app** (prototype): `installer/macos/build.sh` builds `Fyso Installer.app`, which does every step below in a friendly window. See [installer.md](installer.md).

## Requirements

- Git with a configured author name and email. Project initialization and native configuration snapshots create local commits.
- [mise](https://mise.jdx.dev) on `PATH` and [uv](https://docs.astral.sh/uv/) for `uvx`. The commands below use Copier 9.19.1, the verified generator version.
- GitHub access to the private `fyso-dev/agentic-framework` repository. GitHub CLI (`gh`) is useful for authentication; an existing authenticated Git setup also works.
- Claude Code and Codex installed and signed in on the host for their respective subscription-backed bots. The default team uses both providers. Check `claude --version`, `codex --version` and the provider's login before startup; the framework does not create subscription accounts or install these coding CLIs. A signed-in provider can still reject work because of its own quota or model availability.
- An unused block of ten ports. The default is 8400–8409. Each concurrent project needs a different block.

The complete local stack is verified on macOS. Other hosts and remote deployment are not certified by these checks. Docker is not required. The generated project pins Node, Dagu, OpenMausBot, Caddy, process-compose, sops, age, gitleaks, YAML CLI and GitHub CLI through mise. The panel assets are already built.

## 1. Authenticate and generate

For GitHub CLI authentication over HTTPS:

```sh
gh auth login
gh auth setup-git
```

Generate a **new project directory**, rather than running services from the template checkout:

```sh
uvx --from copier==9.19.1 copier copy --trust --vcs-ref=main \
  gh:fyso-dev/agentic-framework my-project
cd my-project
```

`main` contains the reviewed initial delivery. The explicit ref avoids silently selecting an older release. Only trust a template whose repository and revision you have reviewed: Copier can execute template tasks.

Copier asks for the project name, slug, first port and administrator name. With defaults, the login name is `admin` and the panel uses port 8400. For another instance, use an unused multiple of ten such as 8420. The startup script checks the project's ports before starting services.

For repeatable generation without prompts:

```sh
uvx --from copier==9.19.1 copier copy --trust --defaults --vcs-ref=main \
  --data project_name="My project" --data project_slug=my-project \
  --data port_base=8420 --data admin_user=admin \
  gh:fyso-dev/agentic-framework my-project
```

Run that alternative from the parent directory, not inside a project already generated above. Keep `.copier-answers.yml`: it records the template source, revision and answers required for updates.

## 2. Initialize Git, install and start

Inside the generated project:

```sh
git init -b main
git add .
git commit -m "chore: initialize Fyso project"
mise trust
mise install
mise run setup
mise run up
mise run doctor
```

If Git has no author configured, set `git config user.name` and `git config user.email` for this project before the first commit. `mise install` downloads the pinned native tools with signature verification enabled. `setup` creates an age key if absent, `.sops.yaml` and encrypted `secrets.enc.yaml`; rerunning it preserves existing files. Back up the age key securely. Do not commit the private key or plaintext secrets.

For a default project:

| Service | URL |
|---|---|
| Panel | http://panel.localhost:8400 |
| Dagu | http://dagu.localhost:8400 |
| OpenMausBot | http://omb.localhost:8400 |

All three use the chosen administrator name and initial password `admin`. OpenMausBot uses the gateway's native session: no browser pairing code is needed. The default network binding is loopback. For a different `port_base`, replace 8400 in these URLs. Change the password with `mise run secrets`; restart the stack with `mise run down` then `mise run up` to load changed credentials.

## 3. Verify the installation

`mise run doctor` must report all checks passed. Open the panel and confirm:

1. The setup checklist completes; engine authentication failures have actionable status.
2. The live bot list includes MausBot and the project bots. Changes made in native OpenMausBot appear within approximately five seconds. This discovery does not overwrite manual configuration drafts.
3. OpenMausBot and Dagu launch through the authenticated gateway.
4. Observability loads. A new project can have no usage yet; missing monetary information stays unknown. Collection runs every two minutes, with a manual refresh action.

Talk to **Bot Architect** in OpenMausBot to create or edit a bot, or to **Workflow Architect** for a Dagu workflow. Bot Architect uses native preview/apply and snapshots; ordinary bot conversation can consume the host provider's subscription allowance or configured API credit.

## Daily commands

```sh
mise run status
mise run logs omb
mise run logs dagu
mise run doctor
mise run snapshot
mise run down
mise run up
```

Snapshots version native bot definitions, imported skills and memory; **chat history and usage history remain in `.data/`**. Back up `.data/` separately if that history matters. If a generated project has a Git remote, snapshot commits attempt to push to its configured upstream. Add a project remote only when that replication behavior is intended; it must be your project's repository, not this template repository.

## Update an existing generated project

Commit the project's intended changes first and keep a backup. Stop its stack before changing framework files:

```sh
mise run down
uvx --from copier==9.19.1 copier update --trust --vcs-ref=main
# Inspect the diff and resolve any Copier conflicts before continuing.
mise trust
mise install
mise run up
mise run doctor
```

`framework/` is template-owned. `project/`, `state/`, `.sops.yaml` and `secrets.enc.yaml` are protected from overwrites; review changes to other generated files. Do not rerun `copy` over an existing project as a substitute for `update`. These commands describe the native Copier update path; comprehensive cross-version template lifecycle acceptance remains Phase 6 work.

## Clone an existing project on another machine

Clone **the generated project's repository**, install mise, and obtain authorized access to its encrypted secrets with the existing age recipient process. Do not expect `setup` with an unrelated new key to decrypt existing secrets. Then:

```sh
mise trust
mise install
mise run up
mise run doctor
```

A fresh `.data/` restores versioned bots and memory from `state/` when available. Chat and usage history require the separate runtime backup. Host CLI logins are local to that machine and must be authenticated there.

## Troubleshooting

| Symptom | Check |
|---|---|
| Private repository cannot be cloned | Repository membership and `gh auth status`; configure Git credentials with `gh auth setup-git` |
| `mise` or `uvx` not found | Install the prerequisites and reopen a shell with their binaries on `PATH` |
| SOPS cannot decrypt secrets | The age private key must match an authorized recipient; preserve the existing encrypted file |
| Ports already in use | Choose another block for a new project; do not stop unrelated OMB or Dagu instances |
| A bot cannot answer | `mise run doctor`, `mise run logs omb`, host provider login, quota and model availability |
| OpenMausBot asks for a pairing code | Use `http://omb.localhost:<port_base>` through Caddy, not the direct native port; inspect Caddy logs |
| No observability data yet | Generate a real conversation/run, wait for collection or use refresh; unknown cost is not zero spend |
| Gateway briefly unavailable after restart | Wait for Caddy startup, then rerun `mise run doctor`; inspect `mise run logs caddy` if it persists |

See the [documentation index](README.md) for contracts, phase status and recorded limitations.

## Recorded verification

The [repository installation proof](../artifacts/delivery-evidence/repository-install/README.md) records a real GitHub generation and first startup with all doctor checks passing. Native tools were already cached on the verification host; this does not certify empty-host downloads or remote deployment.

Native bot discovery labels committed project definitions, snapshot-only profiles and OpenMausBot-only bots separately. **Import and version** incorporates an existing native bot into project configuration and creates a local commit without changing its runtime profile. Apply/discard panel drafts and commit/discard pending changes to the project team before importing. A saved definition is not proof that subsequent native edits have been saved.
