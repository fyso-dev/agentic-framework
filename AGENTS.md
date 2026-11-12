# AGENTS.md — Fyso Agentic Framework

Instructions for any coding agent (Claude Code, Codex, OpenCode, …) working in this repository.

This repo is the **Copier template** of the Fyso Agentic Framework (working name). Projects are generated from it and pull updates with `copier update`. Generated projects get their own `AGENTS.md` from `template/`. This file is for working on the framework itself.

## Start here

1. Read [docs/README.md](docs/README.md), the layered index. Read top-down as far as your task needs.
2. Check the phase status in Layer 4 before starting work. Do not jump ahead of the current phase.
3. Read the relevant section of [docs/PLAN.md](docs/PLAN.md) for the contract you are touching.

## The principle (non-negotiable)

> **Orchestrate existing software. Never reinvent the wheel. Always feel simple.**

- Before writing code, look for an existing tool, a native config format or a built-in feature that already does it: mise, process-compose, Caddy, Dagu, OpenMausBot, sops, Copier, gitleaks, gh, `Intl`…
- Custom code is limited to the **panel SPA** and **small glue scripts**. Anything else needs a decision recorded in the PLAN decisions log or in `docs/adr/`.
- Prefer native formats as-is (OMB team file, Dagu YAML, Caddyfile, process-compose YAML) over our own schemas or generators.
- When two options work, pick the one with fewer moving parts.

## Rules

- **Language:** code, comments, commits, PRs and docs are in **English**. UI copy goes through **i18n** (`i18next`, `locales/<lang>.json`, `es` default + `en`). Never hard-code UI strings.
- **Ownership (in `template/`):** `framework/**` belongs to the template. `project/**` and `state/**` belong to each generated project and are never overwritten by `copier update`. Do not put project-specific content in `framework/`.
- **Secrets:** never commit plaintext secrets. Use `sops` + `age` (`secrets.enc.yaml`). The panel never shows secret values, with one recorded exception: the remote MCP connection commands, on the person's explicit request (D65).
- **Versioning:** configuration lives in git. Nothing may hold configuration that cannot be rebuilt from the repo.
- **Isolation:** never connect to the user's own Dagu, OpenMausBot or herdr session. Use this project's data dirs (`.data/…`), its port block and a named herdr session ([PLAN §3.1](docs/PLAN.md#31-isolation-every-project-runs-its-own-instances)). Every `openmausbot` CLI call must target an explicit `--port`/`OPENMAUSBOT_URL`: without one it auto-discovers the user's desktop app on 8799.
- **No machine-specific paths:** never write absolute paths of a machine (home directories, Homebrew prefixes, temp dirs) in tracked files. Derive them from the script location, the git root or mise `config_root`, or take them from env vars. `scripts/check-paths.sh` must pass before every commit.
- **Pin versions** of every tool in `mise.toml`. Upgrade deliberately, never with `latest`.
- **Git flow:** work on a branch and merge through a PR. Never push to `main` directly. Do not commit, push or open PRs unless asked.
- **Docs stay current:** when you add a doc, take a decision or change a phase status, update `docs/README.md` in the same change. Record findings in Layer 5.

## Verifying work

Until Phase 1 exists there is nothing to run: verify claims against upstream docs and source, and record unknowns as Phase 0 spikes. From Phase 1 on, `mise run doctor` must be green before calling something done.
