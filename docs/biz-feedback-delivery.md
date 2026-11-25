# GitHub feedback through Fyso Biz

## Scope

Testable beta. A signed-in person authorized by Biz can review a local
`fyso_feedback` page and submit it to the global AF GitHub repository.
The existing Biz extension provides the page and uses the person's
project-bound browser session. Biz checks the current assignment and
publishes to `fyso-dev/agentic-framework`. D75 continues to govern local
agent feedback capture. Deployment and publication are outside this beta.

## Setup

- Install a GitHub App on `fyso-dev/agentic-framework` with repository
  permission **Issues: Read and write**. Set `AF_FEEDBACK_APP_ID`,
  `AF_FEEDBACK_INSTALLATION_ID`, and the PEM secret
  `AF_FEEDBACK_PRIVATE_KEY` in the Biz backend.
- Apply Biz directory migration `0014_framework_feedback.sql` before
  enabling the backend route. The ledger stores the organization, project,
  report UUID and GitHub receipt.
- Install the updated Biz extension in a Biz-managed AF project. Grant
  `app:panel`, `page:extension:biz`, and `action:feedback:submit`
  to the appropriate project access level.
- Open **Report to Fyso**, load a report by its path or UUID, and review
  the content before sending. The extension saves the receipt under
  `.data/ext/biz/feedback/`. GitHub applies its repository visibility rules
  when the person follows the receipt URL.

## Acceptance

- A signed-in authorized project member can preview and send an existing
  report. A revoked or denied member and a cross-origin request are rejected.
- Concurrent sends create a single issue. A subsequent request returns
  the stored receipt. Corrections with a published original add a comment
  to its issue.
- The generated project passes `mise run doctor`. A controlled GitHub
  smoke confirms the App installation, issue and comment.

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

The Biz backend changes are based on `e7aab509` and the extension changes on
`166f6d5`. The active framework branch carries the gateway test and docs.
It declares panel extension API v3, so installation was verified against the
compatible API v5 baseline instead.

If GitHub may have accepted a request whose response Biz could not persist,
the ledger retains a pending reservation. Before releasing it, an operator
must reconcile against GitHub using the `af-feedback` marker, the SHA-256
of `organization/project/report` with both UUIDs lowercased. If an
issue or comment exists, store its number and URL in the reservation. Clear
the reservation only after confirming the write did not occur.
