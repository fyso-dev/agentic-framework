# Phase 4 panel plumbing

Implements `panel-contract.md` using native Dagu workflows, OMB CLI operations,
read-only Caddy files and a same-origin Dagu API proxy. The SPA is developed separately.

YAML conversion uses `npm:yaml` pinned to 2.8.1 through mise. This adds a small
parser rather than depending on the SPA's installation or OMB's private bundles.
Dagu receives its health-check port and basic-auth credentials as `FYSO_` variables;
step inheritance continues to use the existing prefix allowlist. Setup returns
only booleans, never credentials. This follows the existing bot MCP trust boundary.

Apply reuses the snapshot steps, validates a temporary rendered team file, writes
only the proposed source file, applies with OMB and commits only that source file.
Unchanged source skips an empty commit and reports the current commit.

## Verification

Isolated generated-project verification is pending below. No contract changes.
