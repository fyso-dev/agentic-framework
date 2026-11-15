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

2026-11-15: The interrupted session reported a real native team plan/apply round trip and a Biz agent taking and closing a request through the proxy. Evidence upload failed with `storage_no_configurado`; a scheduled end-to-end dispatch has not been demonstrated. The framework branch contains uncommitted team changes. A name-only app-permission migration was removed; moving a bot currently requires saving its app permissions again. Twenty focused Node tests, five import tests and the panel build passed; the full suite and generated-project doctor remain pending. Biz `102706c` has a draft PR; its checkout now contains uncommitted dispatcher, Work tab and proxy changes. All 44 Biz tests pass and Dagu 2.24.0 validates the workflow. Tests cover explicitly assigned requests, reservations and uncertain sends; this does not establish actual delivery or bot completion. Current CI and runtime status must be verified before publication.
