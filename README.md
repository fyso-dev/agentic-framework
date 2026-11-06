# Fyso Agentic Framework

A Copier template for projects with OpenMausBot bots, durable Dagu workflows and a web panel behind one local gateway. Each project has its own instances, data directory and port block.

Includes conversational bot administration, a Workflow Architect, Builder workflows, native bot discovery and AI usage observability. The panel ships prebuilt; Node package installation is unnecessary for normal use.

**[Installation guide](docs/installation.md)** — prerequisites, generate a project, first startup, updates and recovery.

## Quick start

Requires Git, [mise](https://mise.jdx.dev), [uv](https://docs.astral.sh/uv/) and access to this private repository. Authenticate a supported coding CLI on the host to run bots; see the guide.

```sh
gh auth login
gh auth setup-git
uvx copier==9.19.1 copy --trust --vcs-ref=preview \
  gh:fyso-dev/agentic-framework my-project
cd my-project
git init -b main
git add .
git commit -m "chore: initialize Fyso project"
mise trust
mise install
mise run setup
mise run up
mise run doctor
```

With the default port, open **http://panel.localhost:8400**. The initial project login is `admin` / `admin`; change the password with `mise run secrets`. Custom administrator names use the name selected during generation.

`preview` is the published installation branch while the initial delivery PR awaits review. The framework is verified locally on macOS; server deployment and the full template lifecycle phase remain pending. No public hosting or external telemetry is required.

## Develop the framework

The repository is the template; generate a separate project to run it. Read [AGENTS.md](AGENTS.md) and the [layered documentation index](docs/README.md). Native tool versions are pinned in the generated `mise.toml`. Never point tests at another project's Dagu or OpenMausBot instance.

```sh
npm --prefix template/framework/panel ci
npm --prefix template/framework/panel run build
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -v
bash scripts/check-paths.sh
```

HTTP and mutating integration checks require explicit isolated-stack environment settings; without them those cases skip. The [delivery evidence](artifacts/delivery-evidence/) distinguishes local tests, real runtime checks and manual browser verification.
