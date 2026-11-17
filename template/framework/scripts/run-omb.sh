#!/usr/bin/env bash
# OpenMausBot for this project only: own data dir and ports.
# Bots see this process's environment and have a shell, so it gets only the
# basics, the Dagu MCP address and credentials (read by .mcp.json), and secrets
# explicitly named BOT_* in secrets.enc.yaml (PLAN §3.1).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_ROOT FYSO_DATA FYSO_OMB_PORT FYSO_OMB_WEBHOOK_PORT FYSO_HTTP_PORT FYSO_DAGU_PORT FYSO_ADMIN_USER FYSO_ADMIN_PASSWORD
web_scheme >/dev/null
mkdir -p "$FYSO_DATA/omb" "$FYSO_DATA/npm-cache"
bot_env=()
while IFS='=' read -r name _; do
  [[ $name == BOT_* || $name == FYSO_EXT_*_PORT ]] && bot_env+=("$name=${!name}")
done < <(env)
# Self-hosted connected apps use OMB's native Composio support. The encrypted
# project secret is mapped only into this server, never inherited from the host.
# Process-compose can retain an old environment after a panel key update.
# Prefer the current encrypted project value on every native server start.
composio_secret=''
if [ -f secrets.enc.yaml ]; then
  for candidate in COMPOSIO_API_KEY FYSO_COMPOSIO_API_KEY; do
    if grep -q "^$candidate:" secrets.enc.yaml; then composio_secret="$candidate"; break; fi
  done
fi
if [ -n "$composio_secret" ]; then
  composio_key=$(SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-${MISE_SOPS_AGE_KEY_FILE:-$HOME/.config/mise/age.txt}}" \
    sops decrypt --extract "[\"$composio_secret\"]" secrets.enc.yaml)
  bot_env+=("COMPOSIO_API_KEY=$composio_key")
elif [ -n "${FYSO_COMPOSIO_API_KEY:-}" ]; then
  bot_env+=("COMPOSIO_API_KEY=$FYSO_COMPOSIO_API_KEY")
fi
# Resolve Pi before inserting the project wrapper; keep the resolved binary private
# to this OMB instance and do not alter the caller's PATH.
pi_exec=$(command -v pi || true)
clean_exec \
  FYSO_PI_EXEC="$pi_exec" \
  PATH="$FYSO_ROOT/framework/bin:$PATH" \
  ${bot_env[@]+"${bot_env[@]}"} \
  OMB_PORT="$FYSO_OMB_PORT" \
  FYSO_DAGU_PORT="$FYSO_DAGU_PORT" \
  DAGU_MCP_AUTH="Basic $(printf '%s:%s' "$FYSO_ADMIN_USER" "$FYSO_ADMIN_PASSWORD" | base64 | tr -d '\n')" \
  OMB_WEBHOOK_PORT="$FYSO_OMB_WEBHOOK_PORT" \
  OMB_PUBLIC_URL="$(web_origin omb)" \
  npm_config_cache="$FYSO_DATA/npm-cache" \
  openmausbot serve --port "$FYSO_OMB_PORT" --data-dir "$FYSO_DATA/omb" --no-pair --no-open
