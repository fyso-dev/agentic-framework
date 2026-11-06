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
sed "s|\${FYSO_ROOT}|$FYSO_ROOT|g" "$source_file" > "$rendered"
omb() { openmausbot "$@" --port "$FYSO_OMB_PORT"; }
case "$mode" in
  plan)  omb team apply "$rendered" --dry-run ;;
  apply) omb team apply "$rendered" ;;
  check) omb team apply "$rendered" --check || { code=$?; [ $code -eq 6 ] && fail "bots differ from project/bots/team.yaml (run 'mise run bots:plan')"; exit $code; } ;;
  *) fail "usage: bots.sh <plan|apply|check>" ;;
esac
