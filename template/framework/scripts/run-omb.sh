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
# Self-hosted connected apps use OMB's native Composio support. The encrypted
# project secret is mapped only into this server, never inherited from the host.
# Process-compose can retain an old environment after a panel key update.
# Prefer the current encrypted project value on every native server start.
if [ -f secrets.enc.yaml ] && grep -q '^FYSO_COMPOSIO_API_KEY:' secrets.enc.yaml; then
  composio_key=$(SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-${MISE_SOPS_AGE_KEY_FILE:-$HOME/.config/mise/age.txt}}" \
    sops decrypt --extract '["FYSO_COMPOSIO_API_KEY"]' secrets.enc.yaml)
  bot_env+=("COMPOSIO_API_KEY=$composio_key")
elif [ -n "${FYSO_COMPOSIO_API_KEY:-}" ]; then
  bot_env+=("COMPOSIO_API_KEY=$FYSO_COMPOSIO_API_KEY")
fi
clean_exec \
  ${bot_env[@]+"${bot_env[@]}"} \
  OMB_PORT="$FYSO_OMB_PORT" \
  FYSO_DAGU_PORT="$FYSO_DAGU_PORT" \
  DAGU_MCP_AUTH="Basic $(printf '%s:%s' "$FYSO_ADMIN_USER" "$FYSO_ADMIN_PASSWORD" | base64 | tr -d '\n')" \
  OMB_WEBHOOK_PORT="$FYSO_OMB_WEBHOOK_PORT" \
  OMB_PUBLIC_URL="http://omb.$FYSO_WEB_DOMAIN:$FYSO_HTTP_PORT" \
  npm_config_cache="$FYSO_DATA/npm-cache" \
  openmausbot serve --port "$FYSO_OMB_PORT" --data-dir "$FYSO_DATA/omb" --no-pair --no-open
