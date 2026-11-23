# GitHub feedback through Fyso Biz

## Scope

Testable beta. A signed-in person authorized by Biz can review a local
`fyso_feedback` page and submit it to the global AF GitHub repository.
The existing Biz extension provides the page and uses the person's
project-bound browser session. Biz checks the current assignment and
publishes to `fyso-dev/agentic-framework`. D75 continues to govern local
agent feedback capture.

## Coordinated changes

- [Fyso Business backend](https://github.com/fyso-dev/fyso-business/tree/feat/af-feedback)
  owns authorization, the feedback ledger, and GitHub App writes.
- [Fyso Biz extension](https://github.com/fyso-dev/fyso-ext-biz/tree/feat/af-feedback)
  owns the panel page, project-bound session, and local receipt.

Review the coordinated PRs and require green checks before merging. Workers
Builds automatically deploys the Biz backend after merge to `main`. Monitor
that build and verify the deployed revision. After the extension merge,
install or update from the reviewed Git revision in the target projects.
This rollout uses the existing deployment and extension update paths without
an additional release.

## Production activation

- Install a GitHub App on `fyso-dev/agentic-framework` with repository
  permission **Issues: Read and write**. Set `AF_FEEDBACK_APP_ID`,
  `AF_FEEDBACK_INSTALLATION_ID`, and the PEM secret
  `AF_FEEDBACK_PRIVATE_KEY` in the Biz backend.
- Confirm Biz directory migration `0014_framework_feedback.sql` is applied
  before enabling submissions. The ledger stores the organization, project,
  report UUID and GitHub receipt.
- Install the updated Biz extension in a Biz-managed AF project. Grant
  `app:panel`, `page:extension:biz`, and `action:feedback:submit`
  to the appropriate project access level.
- Follow the [report submission instructions](agent-surface.md#instance-feedback-format).
  The extension saves the receipt under `.data/ext/biz/feedback/`.

## Isolated validation

Use a generated AF project with isolated ports and data, the coordinated
extension revision, and a local Biz fixture. Validate the backend separately
with an isolated database and simulated GitHub writes.

For the gateway fixture, use the [native binary settings](web-auth.md#native-installation-and-verification)
for `tests/test_web_auth_http.py`. Set `FYSO_TEST_BIZ_EXTENSION` to the generated
project root with the feedback-capable Biz extension installed and leave
`FYSO_TEST_BIZ_ORIGIN` unset. The fixture builds the panel inventory from the
installed page declaration and reads it through Caddy before opening the page.

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

If GitHub may have accepted a request whose response Biz could not persist,
the ledger retains a pending reservation. Before releasing it, an operator
must reconcile against GitHub using the `af-feedback` marker, the SHA-256
of `organization/project/report` with both UUIDs lowercased. If an
issue or comment exists, store its number and URL in the reservation. Clear
the reservation only after confirming the write did not occur.
