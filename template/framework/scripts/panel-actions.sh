#!/usr/bin/env bash
# Panel actions use only native CLIs. Stdout is the JSON workflow output.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_ROOT FYSO_DATA FYSO_OMB_PORT
omb() { openmausbot "$@" --port "$FYSO_OMB_PORT"; }
# A private temporary file keeps previews away from versioned configuration.
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
team="$tmp/team.yaml"
if [ -n "${TEAM_B64:-}" ]; then
  node -e 'process.stdout.write(Buffer.from(process.env.TEAM_B64,"base64"))' > "$team"
else
  cp project/bots/team.yaml "$team"
fi
node framework/scripts/render-team.cjs "$team" "$FYSO_ROOT/project/bots" > "$tmp/rendered.yaml"
case "${1:-}" in
  plan) omb team apply "$tmp/rendered.yaml" --dry-run --json ;;
  apply)
    omb team apply "$tmp/rendered.yaml" --dry-run --json >&2
    cp "$team" project/bots/team.yaml
    omb team apply "$tmp/rendered.yaml" --json > "$tmp/apply.json"
    gitleaks dir project/bots --no-banner --redact >&2
    git add -- project/bots/team.yaml
    if ! git diff --cached --quiet -- project/bots/team.yaml; then
      git commit -q -m 'bots: update from panel' -- project/bots/team.yaml >&2
    fi
    node framework/scripts/bot-versioning.cjs
    node -e 'const fs=require("fs"),cp=require("child_process"),r=JSON.parse(fs.readFileSync(process.argv[1])); console.log(JSON.stringify({created:r.created,changed:r.changed,deleted:r.deleted,commit:cp.execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim()}))' "$tmp/apply.json"
    ;;
  check)
    export FYSO_CLAUDE_OK=false FYSO_CODEX_OK=false FYSO_DAGU_OK=false
    if command -v claude >/dev/null && claude auth status >/dev/null 2>&1; then FYSO_CLAUDE_OK=true; fi
    if command -v codex >/dev/null && codex login status >/dev/null 2>&1; then FYSO_CODEX_OK=true; fi
    if framework/scripts/health.sh dagu >/dev/null 2>&1; then FYSO_DAGU_OK=true; fi
    omb models --json > "$tmp/models.json"
    # A team OMB rejects (e.g. a model the engine no longer offers) is a check result,
    # not a crash: keep its JSON error so the panel can say which bot and why.
    omb team apply "$tmp/rendered.yaml" --dry-run --json > "$tmp/plan.json" || true
    node framework/scripts/panel-data.cjs check "$tmp/models.json" "$tmp/plan.json"
    ;;
  *) fail 'usage: panel-actions.sh <check|plan|apply>' ;;
esac
