#!/usr/bin/env bash
# Panel actions use native CLIs and APIs. Stdout is the JSON workflow output.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_ROOT FYSO_DATA FYSO_OMB_PORT
omb() { openmausbot "$@" --port "$FYSO_OMB_PORT"; }
# A private temporary file keeps previews away from versioned configuration.
tmp=$(mktemp -d "${TMPDIR:-/tmp}/fyso-panel.XXXXXXXX")
lock=
cleanup() {
  if [ -n "$lock" ]; then rmdir "$lock"; fi
  rm -rf "$tmp"
}
trap cleanup EXIT
team="$tmp/team.yaml"
if [ -n "${TEAM_B64:-}" ]; then
  node -e 'process.stdout.write(Buffer.from(process.env.TEAM_B64,"base64"))' > "$team"
else
  cp project/bots/team.yaml "$team"
fi
node framework/scripts/render-team.cjs "$team" "$FYSO_ROOT/project/bots" > "$tmp/rendered.yaml"
review_team() {
  # Bots an extension manages (managed-bots.cjs) must stay exactly as recorded.
  node framework/scripts/managed-bots.cjs check "$team" >&2 || fail 'the change touches a managed bot; change it at its source'
  cp project/bots/team.yaml "$tmp/current.yaml"
  if [ -n "${TEAM_BASE_B64:-}" ]; then
    node -e 'process.stdout.write(Buffer.from(process.env.TEAM_BASE_B64,"base64"))' > "$tmp/draft-base.yaml"
    cmp -s "$tmp/draft-base.yaml" "$tmp/current.yaml" || fail 'team declaration changed; review the saved draft before applying'
  fi
  node framework/scripts/render-team.cjs "$tmp/current.yaml" "$FYSO_ROOT/project/bots" > "$tmp/current.json"
  omb team apply "$tmp/rendered.yaml" --dry-run --json > "$tmp/plan.json"
  node framework/scripts/panel-bot-removal.cjs "$1" "$tmp/current.json" "$tmp/rendered.yaml" "$tmp/plan.json" "$tmp/removals.json" "$team"
}
case "${1:-}" in
  plan) review_team plan ;;
  apply)
    # Share Bot Architect's lock so both surfaces cannot change this team at once.
    mkdir -p "$FYSO_DATA/bot-architect"
    mkdir "$FYSO_DATA/bot-architect/.lock" || fail 'another bot change is in progress'
    lock="$FYSO_DATA/bot-architect/.lock"
    review_team apply >&2
    cp -R project/bots "$tmp/bots"
    cp "$team" "$tmp/bots/team.yaml"
    gitleaks dir "$tmp/bots" --no-banner --redact >&2
    cmp -s "$tmp/current.yaml" project/bots/team.yaml || fail 'team declaration changed; open a fresh preview'
    # OMB writes its error as the last JSON object on stdout, after any warning lines. It
    # applies section by section, so a failure can leave part of the change applied: the
    # next preview shows what is still pending.
    if ! omb team apply "$tmp/rendered.yaml" --json > "$tmp/apply.json"; then
      fail "OpenMausBot did not apply the change; open a fresh preview: $(node -e 'try { const t = require("fs").readFileSync(process.argv[1], "utf8").trim(), i = t.lastIndexOf("\n{"); const r = JSON.parse(i < 0 ? t : t.slice(i + 1)); console.log(String(r.error || "no details").slice(0, 300)); } catch { console.log("no details"); }' "$tmp/apply.json")"
    fi
    cmp -s "$tmp/current.yaml" project/bots/team.yaml || fail 'team declaration changed; open a fresh preview'
    node framework/scripts/panel-bot-removal.cjs delete "$tmp/removals.json"
    cmp -s "$tmp/current.yaml" project/bots/team.yaml || fail 'team declaration changed; open a fresh preview'
    cp "$team" project/bots/team.yaml
    git add -- project/bots/team.yaml
    if ! git diff --cached --quiet -- project/bots/team.yaml; then
      git commit -q -m 'bots: update from panel' -- project/bots/team.yaml >&2
    fi
    node framework/scripts/bot-versioning.cjs
    node -e 'const fs=require("fs"),cp=require("child_process"),r=JSON.parse(fs.readFileSync(process.argv[1])); console.log(JSON.stringify({created:r.created,changed:r.changed,deleted:r.deleted+JSON.parse(fs.readFileSync(process.argv[2])).length,commit:cp.execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim()}))' "$tmp/apply.json" "$tmp/removals.json"
    ;;
  check)
    export FYSO_CLAUDE_OK=false FYSO_CODEX_OK=false FYSO_PI_OK=false FYSO_DAGU_OK=false
    if command -v claude >/dev/null && claude auth status >/dev/null 2>&1; then FYSO_CLAUDE_OK=true; fi
    if command -v codex >/dev/null && codex login status >/dev/null 2>&1; then FYSO_CODEX_OK=true; fi
    if command -v pi >/dev/null && pi auth check --provider openai-codex --no-refresh >/dev/null 2>&1; then FYSO_PI_OK=true; fi
    if framework/scripts/health.sh dagu >/dev/null 2>&1; then FYSO_DAGU_OK=true; fi
    omb models --json > "$tmp/models.json"
    # A team OMB rejects (e.g. a model the engine no longer offers) is a check result,
    # not a crash: keep its JSON error so the panel can say which bot and why.
    omb team apply "$tmp/rendered.yaml" --dry-run --json > "$tmp/plan.json" || true
    # Extension Setup steps (D51): pending while a required secret is empty, then the
    # extension's own doctor decides. Dagu's cleared environment lacks the decrypted
    # secrets, so both read the project's mise environment.
    : > "$tmp/ext-setup.tsv"
    for file in extensions/*/setup.yaml; do
      [ -f "$file" ] || continue
      id=$(basename "$(dirname "$file")")
      if [ -n "$(mise exec -- node -e 'console.log(require("./framework/scripts/extensions.cjs").missing(process.argv[1]).join(","))' "$id")" ]; then state=pending
      elif [ -f "extensions/$id/doctor.sh" ] && ! framework/scripts/run-ext.sh "$id" -- bash "extensions/$id/doctor.sh" >/dev/null 2>&1; then state=failed
      else state=done; fi
      printf '%s\t%s\n' "$id" "$state" >> "$tmp/ext-setup.tsv"
    done
    node framework/scripts/panel-data.cjs check "$tmp/models.json" "$tmp/plan.json" "$tmp/ext-setup.tsv"
    ;;
  *) fail 'usage: panel-actions.sh <check|plan|apply>' ;;
esac
