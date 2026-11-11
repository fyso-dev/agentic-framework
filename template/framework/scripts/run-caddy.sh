#!/usr/bin/env bash
# Gateway. Web sessions protect the technical upstream credentials held by Caddy.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_DATA FYSO_ROOT FYSO_ADMIN_USER FYSO_ADMIN_PASSWORD FYSO_HTTP_PORT FYSO_OMB_PORT
require_env FYSO_WEB_DOMAIN FYSO_AUTH_PORT
web_scheme >/dev/null
[ "${FYSO_BIND:-127.0.0.1}" = 127.0.0.1 ] || fail "The gateway listens on loopback only. Remote access goes through a private forwarder or an HTTPS provider extension."
mkdir -p "$FYSO_DATA/caddy"
panel_root="$FYSO_ROOT/framework/panel-placeholder"
[ ! -d "$FYSO_ROOT/framework/panel/dist" ] || panel_root="$FYSO_ROOT/framework/panel/dist"
# Mint a native, project-scoped OMB session. Never serve or log its bearer token.
# Caddy starts only after OMB is healthy (process-compose dependency).
umask 077
openmausbot connect "http://127.0.0.1:$FYSO_OMB_PORT" --port "$FYSO_OMB_PORT" \
  --out "$FYSO_DATA/caddy/omb-session" --label "Fyso gateway" --force >/dev/null
omb_token=$(cat "$FYSO_DATA/caddy/omb-session")
[ -n "$omb_token" ] || fail "OpenMausBot did not issue a gateway session"
dagu_auth="Basic $(printf '%s:%s' "$FYSO_ADMIN_USER" "$FYSO_ADMIN_PASSWORD" | base64 | tr -d '\n')"
extension_env=()
while IFS= read -r line; do extension_env+=("$line"); done < <(ext_port_env)
clean_exec \
  ${extension_env[@]+"${extension_env[@]}"} \
  XDG_DATA_HOME="$FYSO_DATA/caddy" XDG_CONFIG_HOME="$FYSO_DATA/caddy" \
  FYSO_ROOT="$FYSO_ROOT" FYSO_DATA="$FYSO_DATA" FYSO_PANEL_ROOT="$panel_root" \
  FYSO_DAGU_AUTH="$dagu_auth" FYSO_AUTH_UPSTREAM="$(auth_upstream)" FYSO_WEB_DOMAIN="$FYSO_WEB_DOMAIN" \
  FYSO_WEB_SCHEME="$(web_scheme)" FYSO_WEB_PORT_SUFFIX="$(web_port_suffix)" \
  FYSO_BIND="${FYSO_BIND:-127.0.0.1}" FYSO_HTTP_PORT="$FYSO_HTTP_PORT" FYSO_CADDY_ADMIN_PORT="$FYSO_CADDY_ADMIN_PORT" \
  FYSO_CONNECTOR_SETUP_SOCKET="$(connector_setup_socket)" \
  FYSO_DAGU_PORT="$FYSO_DAGU_PORT" FYSO_OMB_PORT="$FYSO_OMB_PORT" FYSO_OMB_TOKEN="$omb_token" \
  caddy run --config Caddyfile --adapter caddyfile
