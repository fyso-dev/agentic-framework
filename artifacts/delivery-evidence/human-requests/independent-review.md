# Independent review packet: Pi beta isolation

Status: **lifecycle controller and profile reviewed and approved for one run; that run passed** ([evidence](pi-beta.md#full-lifecycle-acceptance)). The text below is the earlier review that required them. The reviewer inspected the isolation plan and the indicated implementation without starting services or changing files. The concrete full-lifecycle profile and fixture controller remain to be prepared and reviewed.

## Boundary and material changes

The intended result is a generated project whose Pi bot can use the project's Dagu server and resume the exact conversation that created a human request. Project data, ports and native OpenMausBot instances remain isolated. The current implementation is uncommitted: a review must include both `git diff` and untracked files listed by `git status --short`, including the new Pi launcher and scripts.

1. **Engine discovery and identity.** Inspect [the Pi launcher](../../../template/framework/bin/pi), [turn-origin adapter](../../../template/framework/scripts/pi-turn-origin.cjs), and [OMB startup](../../../template/framework/scripts/run-omb.sh). Pi's independent MCP and extension discovery are disabled. The adapter reads OMB 0.1.141's internal per-turn agents descriptor, validates and forwards only bot and thread identifiers; the descriptor may also hold a bearer token. Confirm failure behavior, secret handling, per-turn separation, permissions and whether reliance on this pinned internal format is acceptable for beta.
2. **Tool selection and scopes.** Inspect [Dagu scope guard](../../../template/framework/scripts/dagu-scope.cjs), [MCP server](../../../template/framework/scripts/fyso-mcp.cjs), [Dagu transport](../../../template/framework/scripts/dagu-mcp.cjs), and the [agent editor permission helper](../../../template/framework/panel/src/lib/connector-access.ts). Verify that structured results become text only after scope filtering, workspace labels cannot be supplied, default-denied operations remain denied, and explicit agent-tool denials are not widened. The Pi skill selection grants `agents:list_threads`, which exposes the agent's own conversations and threads it opened on other agents.
3. **Service environment and diagnostics.** Inspect [clean execution](../../../template/framework/scripts/lib.sh), [Dagu startup](../../../template/framework/scripts/run-dagu.sh), [native Dagu check](../../../template/framework/scripts/check-native-dagu.cjs), and [doctor](../../../template/framework/scripts/doctor.sh). Check the precise XDG/mise allow-list, Dagu prefix semantics, explicit age-key handling and child precedence. Doctor checks a team-owned exact project definition and a live native MCP probe; it does not establish per-bot model access.
4. **Full-lifecycle isolation.** Review the [proposed plan and outstanding restrictions](../../../docs/adr/spikes/clean-exec-xdg.md#proposed-full-lifecycle-isolation-plan-for-independent-review). In particular, require exact fixture port and Unix-socket ownership, safe cleanup of only fixture processes, real-home Pi lock paths without credential writes, and DNS/HTTPS rules that cannot reach unrelated local services. The individual-rule probe does not constitute a reviewed full-lifecycle sandbox. Dagu's generated per-run socket paths and scheduled jobs must be addressed before approving that run.

## Existing evidence and reproducible checks

- [Beta evidence and screenshots](pi-beta.md) distinguish the real Pi turn, authenticated browser test, their combined component test, and remaining gaps.
- With the pinned Node and YAML tools available, `node --test tests/pi-engine.test.cjs tests/check-native-dagu.test.cjs tests/fyso-mcp.test.cjs tests/clean-exec-xdg.test.cjs tests/bot-form-connectors.test.cjs` runs focused behavioral checks. Some tests use disposable loopback listeners.
- `FYSO_TEST_PI_SANDBOX=1 FYSO_TEST_PI_DNS=1 FYSO_TEST_NODE="$(command -v node)" python3 -m unittest tests.test_pi_sandbox_boundary` checks isolated macOS file, IPv4/IPv6 port and resolver rules with fake inputs. It does not start the stack or read authentication files.
- `npm run typecheck` in `template/framework/panel` checks the agent-form changes. `bash scripts/check-paths.sh` and `git diff --check` check tracked-path and whitespace conventions.

## Reviewer outcome

**Blocking for the full lifecycle:** the existing sandbox test covers individual rules, not a complete stack profile and controller. The reviewer requires an exact profile and fixture controller, independently reviewed before execution. They must:

- Check all fixture ports and the three fixed sockets (`fyso-<slug>-<http>`, `fyso-connectors-<http>`, and `fyso-mcp-<http>`) for prior ownership. The MCP server removes its socket before binding; an occupied path must abort the test.
- Restrict Dagu's dynamic sockets to anticipated run identifiers. Dagu removes its socket before binding, so an absence check alone has a time-of-check/time-of-use race that the controller and profile must address.
- Track and clean up only fixture-owned processes and descendants. Account for scheduled DAGs: snapshot may commit and push when a Git remote exists, so fixture Git configuration and the absence of remotes must be checked.
- Restrict writes and networking, including the exact Pi lock exceptions, and verify process, port and socket cleanup.

**Inspected without a blocking defect identified:** the Pi origin adapter validates identifiers and does not print the descriptor; Dagu run results are filtered before conversion to text; the label guard rejects `workspace`; and the permissions helper preserves explicit denials. This inspection is not an exhaustive security audit. Doctor checks the MCP definition and response, not actual access from a bot.

The previously observed real Pi flow remains valid within its documented component-test scope. An approval for a future lifecycle must identify the reviewed working-tree snapshot and exact isolation profile; relevant subsequent changes require reassessment. Do not run `mise run up`, a full installer lifecycle, or claim a green `mise run doctor` merely because the narrower checks pass.
