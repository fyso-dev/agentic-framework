# Native teams and Biz work delivery

## Outcome and boundaries

- Outcome: a person can organize project agents into native OpenMausBot teams, import a Biz team, and route eligible Biz requests to a chosen project agent or room with visible work status.
- Delivery level: testable beta in an isolated generated project. The core hosts native team configuration; Biz-specific routing belongs in the Biz extension.
- Include the existing OAuth identity, explicit destination, protected human decisions, request progress and duplicate prevention. No new service, authentication redesign, production rollout or implicit access to unrelated instances.
- Existing work: framework branch `feat/native-teams`; Biz branch `feat/biz-agent-loop` at `102706c`. Preserve existing changes and running services.

## Critical integration and acceptance

The critical path is a real Biz request routed through the scheduled workflow to the intended OpenMausBot destination, processed using the project OAuth identity, and closed with progress. Repeated runs and uncertain delivery must not silently duplicate execution. The pinned OMB and Dagu versions and a generated isolated project are required; direct script tests alone are insufficient.

- [ ] Native team changes preserve bot identity and do not transfer permissions to a different bot.
- [ ] Biz import, protected proxy and configured dispatch work in the generated project; a request is processed through its real agent path.
- [ ] Duplicate and uncertain delivery behavior is verified; human decisions remain protected.
- [ ] Relevant regression checks and generated-project `mise run doctor` pass.
- [ ] Evidence, limitations and publication state are recorded.

## Checkpoint

2026-11-15 (review): `fyso-mcp.cjs` failed to parse because an apostrophe closed its single-quoted `fyso_bot_plan` description, so the platform MCP did not start and the framework CI regression step hung. Fixed; the CI regression suites (121 tests) and `check-paths` pass locally. Verified against OpenMausBot 0.1.141: `run` accepts `--send-id` and the global `--json`; `--bot`/`--channel` take native IDs literally, matching `biz-dispatch.json`. Open: scheduled end-to-end dispatch in a generated project, generated-project `mise run doctor`, evidence upload (`storage_no_configurado` on local Biz) and SonarCloud, which fails on every PR of these repositories. Moving a bot between teams still requires saving its app permissions again.
