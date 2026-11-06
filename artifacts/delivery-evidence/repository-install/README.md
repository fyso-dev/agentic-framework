# Repository installation — 2026-11-06

Verified the published private repository `fyso-dev/agentic-framework`, ref `preview`, initial delivery commit `05a7aed`.

## Real repository generation and startup

Used a fresh disposable generated project with slug `repo-install-proof`, its own ports 19280–19289, an isolated age key in its ignored runtime directory, and no Git remote. The template repository and existing user project were not used as runtime data directories.

```sh
uvx --from copier==9.19.1 copier copy --trust --defaults --vcs-ref=preview \
  --data project_name="Repository install proof" \
  --data project_slug=repo-install-proof --data port_base=19280 \
  --data admin_user=admin gh:fyso-dev/agentic-framework <new-directory>
```

Then initialized Git on `main`, committed the generated project, and ran:

```sh
mise trust
mise install
mise run setup
mise run up
mise run doctor
```

Results:

- Copier 9.19.1 fetched the template from GitHub and generated the native configuration, prebuilt SPA and preserved workflow symlinks.
- All ten pinned tools resolved from the existing mise installation cache. This verifies the documented installation path, not fresh downloads on an empty host.
- Setup produced encrypted secrets and startup created four project bots alongside MausBot. No bot prompts were sent.
- Doctor: **all checks passed** — decryption, tool availability, existing host Claude/Codex logins, isolated OMB identity, authenticated gateways and native team agreement.
- The disposable stack was stopped after verification. Existing project services remained running.

The initial abbreviated `uvx copier==9.19.1` invocation was rejected by the installed uvx. The guide now uses the successfully executed `uvx --from copier==9.19.1 copier` form.

The local suite passed 13 Node checks and 11 Python checks; 12 opt-in integration cases skipped without their dedicated runtime flags. Dedicated native-roster HTTP acceptance previously passed against the user project. Staged changes and existing Git history passed gitleaks; path and whitespace checks passed. No remote CI result is claimed.

This is first-install acceptance on the existing macOS host. New-host tool downloads, cross-version lifecycle acceptance and server deployment remain outside this proof.
