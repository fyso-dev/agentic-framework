# Composio CLI browser login and native OMB setup

Date: 2026-11-08. Status: human login and project listing verified live; automatic OMB setup failed with CLI 0.6.0. The experiment was withdrawn by user request on 2026-11-09. The CLI is no longer a template dependency or panel option; manual API-key setup is the only supported method.

## Question and verdict

Can the panel replace manual project-key copying with the native Composio CLI browser login? **Not fully with the tested live account/version:** browser login and project listing work, but initialization exports a masked project key. Fixture-based feasibility did not establish authenticated live compatibility. The account must be able to read an existing key or create one for the selected project. The account/project selection must remain explicit; do not silently initialize the first available project in a multi-project installation.

## Version and isolation

The official `@composio/cli@0.6.0` macOS ARM64 release archive was downloaded to a private project data directory and verified against its published SHA-256 checksums. `composio version` returned `0.6.0`. No shell installer, plugin setup, skill install, personal cache or existing account credentials were used. The cache and session directories were explicit, telemetry was disabled, and login used `--no-skill-install`.

## Native sequence

1. `composio login --no-wait --no-skill-install` creates a pending browser login and returns a Composio dashboard URL.
2. The person signs in and authorizes that login in the browser.
3. `composio login --poll --no-skill-install` completes the cached login. Its user credential is not a substitute for OMB's project key.
4. Select the intended organization/project using the native CLI's project flow. `composio dev init` writes the selected native project configuration and resolves a project API key.
5. If session information includes a project key, initialization uses it. Otherwise it requests creation of a named project API key when permitted. The CLI writes `COMPOSIO_API_KEY` to its staging directory's `.env.local`.
6. The experimental panel adapter can privately import a usable, unmasked value through the existing SOPS/native-activation helper, verify actual persistence/activation, and clean up transient credential files. The CLI must remain isolated from personal config. Its native plaintext staging files are not project source or browser outputs.

`dev init --yes` is appropriate only when the desired project is already unambiguous. It is used with a single simulated project in the executable proof, not as a recommendation to choose a user's first project automatically.

## Executed verification

The actual pinned binary was run; the CLI implementation was not reimplemented.

| Check | Result | Boundary |
|---|---|---|
| Archive checksum and binary version | Passed | Official release 0.6.0 |
| `login --help` / `dev init --help` | Passed | Browser handoff, poll, no-skill-install and native initialization flags present |
| Real `login --no-wait --no-skill-install` | Passed | Production service issued a dashboard login URL and private pending-session file; no human consent completed and no user credential acquired |
| Existing project key | Passed | Real CLI, local backend fixture: `.env.local` contains the project key without creating another |
| Missing project key, creation permitted | Passed | Real CLI, local backend fixture: one key-creation call, project key written |
| Missing project key, creation denied | Passed as negative case | CLI exits 0 but writes no project key: the future adapter must reject this as incomplete |
| Human browser authorization | Passed live | User completed the official login; organization and project listing passed |
| Actual project-key import into OMB | Failed live | Session returned a masked project key; Auth Configs check rejected it with HTTP 401; no encrypted save or OMB activation occurred |
| CLI key-creation fallback route | Failed live | The route used by CLI 0.6.0 returned HTTP 200 HTML, not key material. Unsupported fallback calls were removed from the panel adapter |
| Existing manual setup preservation | Passed | Original encrypted file remained byte-identical and original instance doctor passed |

Run the repeatable fixture proof with an explicitly selected official CLI binary:

```sh
# Historical command; the executable test was removed with the experiment.
# FYSO_COMPOSIO_CLI_BIN="/path/to/pinned/composio" node tests/composio-cli-spike.cjs
```

The path above is a placeholder. The executable test requires version 0.6.0, creates its own private cache and project directories, uses generated credentials against a loopback HTTP fixture, and deletes them after completion. No real accounts or project keys are created by the fixture proof.

## Important implementation finding

A successful exit from `composio dev init` is insufficient. The CLI deliberately treats project-key retrieval/creation errors as warnings after writing project metadata. The panel must confirm a non-empty **project** key, verify its provider access, and require the encrypted-save/native-activation result before showing Connected.

## Evidence and upstream sources

- [Official pinned release](https://github.com/ComposioHQ/composio/releases/tag/%40composio/cli%400.6.0).
- [Login implementation](https://github.com/ComposioHQ/composio/blob/next/ts/packages/cli/src/commands/login/login.handler.ts) and [native developer init](https://github.com/ComposioHQ/composio/blob/next/ts/packages/cli/src/commands/init.cmd.ts). The inspected source was fetched using the exact `@composio/cli@0.6.0` ref; these navigable upstream links track next.
- [Authentication credential kinds](https://docs.composio.dev/reference/authenticating-to-composio).
- [Documented human login handoff](https://docs.composio.dev/docs/agent-setup/unattended-authentication#log-in-with-a-human).

The earlier positive verdict applied to the native binary against local backend fixtures. The live result above supersedes that verdict for this account and CLI version. A successful login must not be presented as successful OMB configuration.

The live trial used a second isolated generated instance, preserving the original instance's encrypted secret file. Broad CLI auth caches used solely for the trial are disposable project data, never source or browser results. Account names, IDs, keys and login URLs are omitted from this report.

At the time of the trial, the panel exposed the manual API-key method first and marked browser/CLI login as experimental. That alternative was subsequently removed. A masked, missing or mismatched key stops before SOPS/native mutation. No source commit, merge, external account connection or bot tool execution is claimed.
