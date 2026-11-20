# Fyso Agentic Framework

A Copier template for projects with OpenMausBot bots, durable Dagu workflows and a web panel behind one local gateway. Each project has its own instances, data directory and port block.

Includes conversational bot administration, a Workflow Architect, Builder workflows, native bot discovery and AI usage observability. The panel ships prebuilt; Node package installation is unnecessary for normal use.

**[Installation guide](docs/installation.md)** — prerequisites, generate a project, first startup, updates and recovery.

## Quick start

Requires Git and [mise](https://mise.jdx.dev); mise runs the pinned [uv](https://docs.astral.sh/uv/) that provides `uvx`. Reading the template, catalogs and skills needs no GitHub account or GitHub CLI when the repositories are public; while this repository is private, authenticate Git for it first (for example `gh auth login && gh auth setup-git`). Authenticate a supported coding CLI on the host to run bots; see the guide.

```sh
mise exec aqua:astral-sh/uv@0.5.1 -- uvx --from copier==9.19.1 copier copy --trust --vcs-ref=main \
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

The initial delivery is merged into `main`, the installation branch. The framework is verified locally on macOS; server deployment and the full template lifecycle phase remain pending. No public hosting or external telemetry is required.

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

## License

Copyright (C) 2026 Fyso.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, version 3 (`AGPL-3.0-only`). It is distributed WITHOUT ANY WARRANTY; see [LICENSE](LICENSE) for the full text.

Projects generated from this template are owned by whoever generates them; the license applies to the framework itself.
