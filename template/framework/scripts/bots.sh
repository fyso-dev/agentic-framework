#!/usr/bin/env bash
# Apply project/bots/team.yaml to this project's OpenMausBot.
#   bots.sh plan   show the changes (dry run)
#   bots.sh apply  apply them
#   bots.sh check  exit 1 if the running bots differ from the file (drift)
# An optional second argument applies another file (restore uses state/bots/team.yaml).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_ROOT FYSO_DATA FYSO_OMB_PORT
mode="${1:-plan}"
source_file="${2:-project/bots/team.yaml}"
rendered="$FYSO_DATA/team.rendered.yaml"
# Models an engine no longer offers make OMB reject the whole team (D37): move them to the
# engine's default before applying, and commit that change to the project file.
repair_models() {
  local changes
  changes=$(node framework/scripts/team-models.cjs "$1") || return 0
  [ -n "$changes" ] || return 0
  printf '%s\n' "$changes" >&2
  if [ "$1" = project/bots/team.yaml ] && git rev-parse --git-dir >/dev/null 2>&1; then
    git add -- "$1" && git commit -q -m "bots: replace models the engine no longer offers" -m "$changes" -- "$1" >&2 || true
  fi
}
case $mode in apply|repair) repair_models "$source_file" ;; esac
node framework/scripts/render-team.cjs "$source_file" > "$rendered"
omb() { openmausbot "$@" --port "$FYSO_OMB_PORT"; }
case "$mode" in
  plan)  omb team apply "$rendered" --dry-run ;;
  apply) omb team apply "$rendered" ;;
  check) omb team apply "$rendered" --check || { code=$?; [ $code -eq 6 ] && fail "bots differ from project/bots/team.yaml (run 'mise run bots:plan')"; exit $code; } ;;
  repair)  # used by up.sh on every start: never replays the whole declaration
    out="$FYSO_DATA/team-repair"
    node framework/scripts/team-models.cjs runtime "$rendered" "$out" >&2 || exit 0
    for f in "$out/models.yaml"; do
      [ ! -f "$f" ] || omb team apply "$f"
    done ;;
  *) fail "usage: bots.sh <plan|apply|check|repair>" ;;
esac
