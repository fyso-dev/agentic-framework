# GitHub feedback through Fyso Biz

## Scope

Testable beta. A signed-in person authorized by Biz can review a local
`fyso_feedback` page and submit it to the global AF GitHub repository.
The existing Biz extension provides the page and uses the person's
project-bound browser session. Biz checks the current assignment and
publishes to `fyso-dev/agentic-framework`. D75 continues to govern local
agent feedback capture.

## Coordinated changes

- [Fyso Business backend](https://github.com/fyso-dev/fyso-business/pull/631)
  owns authorization, the feedback ledger, and GitHub App writes.
- [Fyso Biz extension](https://github.com/fyso-dev/fyso-ext-biz/pull/17)
  owns the panel page, project-bound session, and local receipt.
- [Fyso Agentic Framework](https://github.com/fyso-dev/agentic-framework/pull/120)
  owns the instance feedback contract and gateway integration coverage.

Review the coordinated PRs and require green checks before merging. Workers
Builds automatically deploys the Biz backend after merge to `main`. Monitor
that build and verify the deployed revision. After the extension merge,
install or update from the reviewed Git revision in the target projects.
This rollout uses the existing deployment and extension update paths without
an additional release.

## Production activation

- Configure the GitHub App and apply the feedback migrations before enabling submissions.
  Follow the [Biz activation runbook](https://github.com/fyso-dev/fyso-business/blob/main/docs/runbooks/activacion-framework-feedback.md)
  for activation and for recovery before retrying an ambiguous GitHub write.
  During pre-merge review, use the [runbook at the reviewed Biz revision](https://github.com/fyso-dev/fyso-business/blob/8ab9246be56178990cf868b6a22058d041b097e1/docs/runbooks/activacion-framework-feedback.md).
- Install the updated Biz extension in a Biz-managed AF project. Grant
  `app:panel`, `page:extension:biz`, and `action:feedback:submit`
  to the appropriate project access level.
- Follow the [report submission instructions](agent-surface.md#instance-feedback-format).

## Isolated validation

Use a generated AF project with isolated ports and data, the coordinated
extension revision, and a local Biz fixture. Validate the backend separately
with an isolated database and simulated GitHub writes.

For the gateway fixture, use the [native binary settings](web-auth.md#native-installation-and-verification)
for `tests/test_web_auth_http.py`. Set `FYSO_TEST_BIZ_EXTENSION` to the generated
project root with managed access enabled. The installed extension must include
`extensions/biz/authorize.caddy` and `extensions/biz/panel-access.caddy` rendered
by the normal install, plus `extensions/biz/feedback.cjs` and the built feedback
page with its page declaration. Leave `FYSO_TEST_BIZ_ORIGIN` unset and select the
feedback case explicitly:

```sh
python3 tests/test_web_auth_http.py BizPolicyGateway.test_biz_feedback_revocation_blocks_submission
```

The fixture builds the panel inventory from the installed page declaration and
reads it through Caddy before opening the page. Confirm the selected case ran
and was not skipped.

- A signed-in authorized project member can preview and send an existing
  report. A revoked or denied member and a cross-origin request are rejected.
- Concurrent sends create a single issue. A subsequent request returns
  the stored receipt. Corrections with a published original add a comment
  to its issue.
- The generated project passes `mise run doctor`.

After deployment and activation, a controlled smoke from an authorized
Biz-managed instance confirms that the central repository receives an issue
and then a correction comment on that issue, with both receipts returned to
the instance.

## Checkpoint

On 2026-11-23, GitHub reported that the Framework checks passed and
[SonarCloud Code Analysis was cancelled](https://github.com/fyso-dev/agentic-framework/pull/120/checks?check_run_id=137792720029)
for AF revision `a8c9813`. The check reported an analysis failure without
annotations or a cause. Keep the merge pending until the SonarCloud background
task has been diagnosed and the required checks pass.

The framework gateway integration test passed with real Caddy and Tinyauth
and an isolated Biz fixture. Backend tests exercise the migration against
SQLite and simulate GitHub to verify concurrent sends, corrections and retries.
The generated project from framework revision `613abbc` passed
`mise run doctor` with the updated extension installed. The authenticated
feedback path used the separate Biz fixture. In the generated project, the
gateway reached ready and the Biz Partner post-start hook returned an error.
The Git snapshot was recorded after initializing the fixture repository, and
the hook still reported a fetch failure with the fixture Biz URL. A real
GitHub App submission remains pending.
