#!/usr/bin/env bash
# Start the project in the background and wait until the gateway answers.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_ADMIN_PASSWORD FYSO_DATA

if stack_running; then
  echo "Already running. 'mise run status' to inspect, 'mise run down' to stop."
  exit 0
fi

busy=()
for p in $(block_ports); do port_in_use "$p" && busy+=("$p"); done
[ ${#busy[@]} -eq 0 ] || fail "ports in use: ${busy[*]}. Another program (or project) uses this block; change port_base."

mkdir -p "$FYSO_DATA/logs"
pc up --detached --config process-compose.yaml >>"$FYSO_DATA/logs/up.log" 2>&1

printf 'Starting'
for _ in $(seq 1 120); do
  if framework/scripts/health.sh caddy 2>/dev/null; then
    printf ' ready.\n\n'
    # First start on a fresh data dir: create the bots from project/bots/team.yaml.
    marker="$FYSO_DATA/omb/.fyso-bots-applied"
    if [ ! -f "$marker" ]; then
      echo "Creating bots from project/bots/team.yaml…"
      framework/scripts/bots.sh apply && touch "$marker"
      echo
    fi
    cat <<MSG
  Panel        http://panel.localhost:$FYSO_HTTP_PORT     (user: $FYSO_ADMIN_USER)
  Dagu         http://dagu.localhost:$FYSO_HTTP_PORT
  OpenMausBot  http://127.0.0.1:$FYSO_OMB_PORT           (local, no pairing needed)

  mise run status · mise run logs <dagu|omb|caddy> · mise run doctor · mise run down
MSG
    exit 0
  fi
  printf '.'; sleep 2
done
printf '\n'
pc process list || true
fail "the stack did not become ready in 4 minutes. See .data/logs/ or 'mise run logs <name>'."
