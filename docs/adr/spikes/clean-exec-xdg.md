# Clean execution and isolated XDG state

Status: **candidate fix; independent review and generated-stack acceptance pending**.

`clean_exec` starts services with `env -i` to avoid leaking inherited values. A generated test project set private `XDG_STATE_HOME` and `XDG_CONFIG_HOME` before `mise run up`, but service children lost those variables. Subsequent `mise exec` can automatically trust its active config. During the test, global mise trust and tracking symlinks targeting the temporary project appeared; the responsible child was not conclusively identified. The symlinks were left untouched and the test stack was stopped. Do not claim that this lifecycle test left global state unchanged.

The candidate preserves the two XDG variables only when nonempty. Explicit assignments passed to `clean_exec` still win, such as Caddy's own `XDG_CONFIG_HOME`. All other arbitrary inherited variables remain filtered. This allows a caller to provide isolated mise state to child services; it does not grant trust itself or set a default path.

## Validation

Before the change, `node --test tests/clean-exec-xdg.test.cjs` failed two of three tests because the XDG paths were absent. After the change, all three passed: both XDG paths including spaces, unset behavior, explicit child override, and an unrelated secret canary.

An isolated Dagu 2.24.0 server, with its own data and loopback ports, ran a harmless stub from a workflow. It was launched through `clean_exec` with the project's existing Dagu passthrough prefixes. The original function dropped both XDG paths; the candidate preserved both, passed the intended project sentinel, and filtered an unrelated secret canary. No mise command was executed by this Dagu test. Reproduce with an explicit pinned binary:

```sh
FYSO_TEST_DAGU_BIN="$PINNED_DAGU_BIN" python3 -m unittest tests/test_clean_exec_dagu.py
```

The Dagu integration test is skipped unless `FYSO_TEST_DAGU_BIN` is supplied. It uses temporary files and loopback listeners and stops its own Dagu process. `PINNED_DAGU_BIN` must name a binary already available without changing global trust.

## Risks and limits

- `XDG_CONFIG_HOME` affects configuration discovery in tools other than mise, including agents and services. Explicit service-specific assignments take precedence, but compatibility must be checked for each affected process.
- `XDG_STATE_HOME` affects state locations for child tools when supplied. This is intentional for isolation and is a behavior change for callers that previously set it but whose values were discarded.
- This tests Dagu server-to-step propagation for one local workflow and the shell helper. It does not establish restart behavior, cross-platform behavior, secret decryption, generated project lifecycle, or all service-specific overrides.
- Do not run the full lifecycle again until the change has independent review and an isolation plan. Preserve unrelated projects and existing global mise state.
