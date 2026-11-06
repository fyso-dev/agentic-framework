#!/usr/bin/env bash
# Gateway. The admin password is hashed at start; only the hash reaches Caddy.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_DATA FYSO_ROOT FYSO_ADMIN_USER FYSO_ADMIN_PASSWORD FYSO_HTTP_PORT
mkdir -p "$FYSO_DATA/caddy"
panel_root="$FYSO_ROOT/framework/panel-placeholder"
[ ! -d "$FYSO_ROOT/framework/panel/dist" ] || panel_root="$FYSO_ROOT/framework/panel/dist"
hash=$(caddy hash-password --plaintext "$FYSO_ADMIN_PASSWORD")
clean_exec \
  XDG_DATA_HOME="$FYSO_DATA/caddy" XDG_CONFIG_HOME="$FYSO_DATA/caddy" \
  FYSO_ROOT="$FYSO_ROOT" FYSO_DATA="$FYSO_DATA" FYSO_PANEL_ROOT="$panel_root" \
  FYSO_ADMIN_USER="$FYSO_ADMIN_USER" FYSO_ADMIN_HASH="$hash" \
  FYSO_BIND="${FYSO_BIND:-127.0.0.1}" FYSO_HTTP_PORT="$FYSO_HTTP_PORT" FYSO_CADDY_ADMIN_PORT="$FYSO_CADDY_ADMIN_PORT" \
  FYSO_DAGU_PORT="$FYSO_DAGU_PORT" FYSO_OMB_PORT="$FYSO_OMB_PORT" \
  caddy run --config Caddyfile --adapter caddyfile
