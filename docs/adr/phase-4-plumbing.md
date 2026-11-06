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

Isolated generated-project verification is recorded below. No contract changes.

### Generated project run (2026-11-06, 01:58–02:02 UTC)

Generated with Copier 9.19.1 from implementation commit `475c30f`, initialized
Git, trusted the isolated mise configuration, installed the additional pinned
YAML package, ran setup and started the stack on block 8450–8459. Two corrections
were copied from the template into this test project before repeating the checks:
OMB exposes `instances` (not `engines`), and Dagu step IDs require underscores.
The setup parser also expands the existing `${FYSO_ROOT}` placeholders before
parsing, matching OMB's treatment of the native team file's flow mappings.

Trimmed curl/API evidence (basic auth and panel Host header used throughout):

```text
GET /config/project.json 200
{"name":"Plumbing test","slug":"plumbing-test","env":"local",
 "urls":{"dagu":"http://dagu.localhost:8450","omb":"http://127.0.0.1:8454"}}
GET /config/apps.json 200 (Dagu and OpenMausBot; Spanish text + English maps)
GET /config/team.yaml 200 (original team text)
GET /api/dagu/dags 200 (all four framework actions discovered)
HEAD /config/team.yaml 200
POST /config/team.yaml 405
POST /config/project.json 405
POST /config/apps.json 405
GET /config/missing.json 404
GET /nested/spa/route 200 (placeholder fallback)
```

All actions used `enqueue`, polling `dagRunDetails.statusLabel` and reading
lowercase JSON-string outputs from the outputs endpoint:

```text
fyso-setup-check succeeded
check: checkedAt=2026-11-06T02:00:02.145Z
       Claude signed in, Codex signed in
       bots={count:2,pending:0,ok:true}
       dagu={ok:true,botsConnected:2}
fyso-bots-plan succeeded
plan: created=0 changed=1 unchanged=2 deleted=0 writes=0
      Run Operator: claude/claude-haiku-4-5 → claude/claude-sonnet-5
fyso-bots-apply succeeded
apply: {created:0,changed:1,deleted:0,
        commit:"a404af76a64897fdc588b6abb22e858ece7e1528"}
git log: bots: update from panel
openmausbot bots --json --port 8454:
  Run Operator modelSelection={instanceId:"claude",model:"claude-sonnet-5"}
fyso-snapshot succeeded
result: committed b781749
```

The plan preserved the source file; apply rewrote it byte-for-byte to the proposed
text. An invalid YAML apply failed after all three snapshot steps succeeded;
the source file remained unchanged. No bot turns were made.

`mise run doctor` passed with the running stack, including subscription logins,
instance identity, gateway auth, Dagu API and matching bots. `mise run down`
completed. A second doctor confirmed all stack ports free; a redundant second
`down` reported the already removed socket. `scripts/check-paths.sh` passes.

No contract changes. The built SPA branch remains independently owned and its
real build output was not available in this checkout; the placeholder path was
verified live, while selection of `panel/dist` is implemented at gateway start.
