# Clean execution and isolated XDG state

Status: **accepted for beta**: the generated-stack lifecycle passed under a reviewed sandbox ([evidence](../../../artifacts/delivery-evidence/human-requests/pi-beta.md#full-lifecycle-acceptance)).

`clean_exec` starts services with `env -i` to avoid leaking inherited values. A generated test project set private `XDG_STATE_HOME` and `XDG_CONFIG_HOME` before `mise run up`, but service children lost those variables. Subsequent `mise exec` can automatically trust its active config. During the test, global mise trust and tracking symlinks targeting the temporary project appeared; the responsible child was not conclusively identified. The symlinks were left untouched and the test stack was stopped. Do not claim that this lifecycle test left global state unchanged.

The candidate preserves the two XDG variables only when nonempty. Explicit assignments passed to `clean_exec` still win, such as Caddy's own `XDG_CONFIG_HOME`. All other arbitrary inherited variables remain filtered. This allows a caller to provide isolated mise state to child services; it does not grant trust itself or set a default path.

## Validation

Before the change, `node --test tests/clean-exec-xdg.test.cjs` failed two of three tests because the XDG paths were absent. After the change, all three passed: both XDG paths including spaces, unset behavior, explicit child override, and an unrelated secret canary.

An isolated Dagu 2.24.0 server, with its own data and loopback ports, ran a harmless stub from a workflow. It was launched through `clean_exec` with the project's existing Dagu passthrough prefixes. The original function dropped both XDG paths; the candidate preserved both, passed the intended project sentinel, and filtered an unrelated secret canary. No mise command was executed by this Dagu test. Reproduce with an explicit pinned binary:

```sh
FYSO_TEST_DAGU_BIN="$PINNED_DAGU_BIN" python3 -m unittest tests/test_clean_exec_dagu.py
```

The Dagu integration test is skipped unless `FYSO_TEST_DAGU_BIN` is supplied. It uses temporary files and loopback listeners and stops its own Dagu process. `PINNED_DAGU_BIN` must name a binary already available without changing global trust.

An additional generated-project probe exposed a macOS Bash 3.2 regression: expanding the empty XDG array under `set -u` stopped the service before Dagu started. The shell test now runs `/bin/bash -u`; it reproduced that failure with both XDG variables unset, then passed after using an empty-array-safe expansion. This shell regression test alone does not establish a complete project startup.

An opt-in [sandbox boundary probe](../../../tests/test_pi_sandbox_boundary.py) uses fixture listeners and fake lock paths: the selected port and lock are writable, a second port and sibling path are refused, and an HTTPS-like wildcard allowance still denies loopback for both IPv4 and IPv6. DNS resolves using the system resolver's specific Unix socket without general outbound Unix or UDP access. It touches neither real credentials nor other project services. Run on macOS with `FYSO_TEST_PI_SANDBOX=1 FYSO_TEST_PI_DNS=1` and a selected `FYSO_TEST_NODE`. This tests individual rules, not the full lifecycle profile or indirect resolver behavior.

A later isolated extension-update fixture found the same bare `mktemp` behavior in `ext.sh apply update`. That worktree now uses an explicit template under `TMPDIR`; a temporary tagged source of the human-requests extension updated successfully, with an unrelated untracked file retained. This does not establish a published extension source or full lifecycle isolation.

A later macOS setup fixture exposed another isolation issue: bare `mktemp` selected the system's user temporary directory despite the fixture's `TMPDIR`. The setup script now supplies an explicit template under `TMPDIR`; with that change, a generated project completed its real `mise run setup` in a sandbox with a fixture-owned age identity and isolated mise state. This did not start services or run doctor. The sandbox denies direct writes outside the fixture, but that observation is not proof against indirect effects through system services.

## Risks and limits

- `XDG_CONFIG_HOME` affects configuration discovery in tools other than mise, including agents and services. Explicit service-specific assignments take precedence, but compatibility must be checked for each affected process.
- `XDG_STATE_HOME` affects state locations for child tools when supplied. This is intentional for isolation and is a behavior change for callers that previously set it but whose values were discarded.
- This tests Dagu server-to-step propagation for one local workflow and the shell helper. It does not establish restart behavior, cross-platform behavior, secret decryption, generated project lifecycle, or all service-specific overrides.
- Do not run the full lifecycle again until the change has independent review and an isolation plan. Preserve unrelated projects and existing global mise state.

## Pi beta isolation follow-up

The caller's `XDG_DATA_HOME`, `XDG_CACHE_HOME` and the explicit mise data, cache and state paths are now also preserved through `clean_exec`. Dagu's passthrough list includes only the three named mise path prefixes, not all `MISE_*` variables. The shell and real Dagu regression checks include unrelated-secret and age-key-path canaries. An additional sandboxed `mise exec` probe denied network and writes outside its temporary fixture; it passed with the paths isolated.

A generated project's setup and separately launched OpenMausBot and Dagu components ran inside restricted sandboxes. The Pi component required allowing its transient authentication, settings and trust lock directories to read the user's existing configuration. With DNS and HTTPS allowed, an authenticated Pi bot completed a fictional request, clarification and decision using those components; the full lifecycle, independent review and absence of indirect global-state effects are still not established.

## Proposed full-lifecycle isolation plan for independent review

1. Generate a disposable project and choose a free, dedicated ten-port block; inspect the process list and port ownership before starting anything. Do not use an existing project, Dagu server, OpenMausBot instance or Herdr session. All test requests and credentials other than the existing Pi login are fictional and fixture-owned.
2. Put the generated project, age identity, temporary files and XDG/mise state, cache, data and trust under one disposable directory. Preserve the user's actual home for Pi OAuth reads only. Record before-and-after names and targets of relevant global mise trust/tracking entries without modifying them; do not read or print credentials.
3. On macOS, launch the lifecycle inside a reviewed sandbox profile that denies writes outside the fixture, except the exact short-lived Pi authentication, trust and settings lock paths. Permit fixture ports on loopback and only the Unix sockets needed by the named fixture services. Permit DNS and HTTPS for the real model turn; do not allow outbound TCP to unrelated local service ports. Stop only processes started by the fixture, including on failure, and check that all fixture ports are released.
4. Run setup, start the full stack, run `mise run doctor`, exercise the authenticated panel and the bot request/clarification/decision path, then shut down that fixture. Record exit codes, service identities, test outcomes and any attempted sandbox denials without saving secrets. Compare global mise trust/tracking state after the shutdown.
5. Report failures and limitations instead of relaxing the sandbox silently. A successful isolated test is local evidence; it does not establish Windows/Linux behavior, absence of indirect system-service effects, or production readiness.

The candidate changes, sandbox allowances and this plan still require an independent reviewer before the full lifecycle is repeated.
