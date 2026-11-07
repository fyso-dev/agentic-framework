#!/usr/bin/env bash
# OpenMausBot for this project only: own data dir and ports.
# Bots see this process's environment and have a shell, so it gets only the
# basics, the Dagu MCP address and credentials (read by .mcp.json), and secrets
# explicitly named BOT_* in secrets.enc.yaml (PLAN §3.1).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_DATA FYSO_OMB_PORT FYSO_OMB_WEBHOOK_PORT FYSO_HTTP_PORT FYSO_DAGU_PORT FYSO_ADMIN_USER FYSO_ADMIN_PASSWORD
mkdir -p "$FYSO_DATA/omb" "$FYSO_DATA/npm-cache"
bot_env=()
while IFS='=' read -r name _; do
  [[ $name == BOT_* || $name == FYSO_EXT_*_PORT ]] && bot_env+=("$name=${!name}")
done < <(env)
clean_exec \
  ${bot_env[@]+"${bot_env[@]}"} \
  OMB_PORT="$FYSO_OMB_PORT" \
  FYSO_DAGU_PORT="$FYSO_DAGU_PORT" \
  DAGU_MCP_AUTH="Basic $(printf '%s:%s' "$FYSO_ADMIN_USER" "$FYSO_ADMIN_PASSWORD" | base64 | tr -d '\n')" \
  OMB_WEBHOOK_PORT="$FYSO_OMB_WEBHOOK_PORT" \
  OMB_PUBLIC_URL="http://omb.localhost:$FYSO_HTTP_PORT" \
  npm_config_cache="$FYSO_DATA/npm-cache" \
  openmausbot serve --port "$FYSO_OMB_PORT" --data-dir "$FYSO_DATA/omb" --no-pair --no-open
