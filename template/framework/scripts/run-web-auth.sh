#!/usr/bin/env bash
# Native session authority. All browser credentials remain in this process.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
# Shared login (D61): nothing to run here. The process stays up so the stack's
# dependencies and readiness (health.sh asks the shared service) need no second shape.
if shared_login; then exec tail -f /dev/null; fi
# Users are read fresh: this process is restarted after a password change, and a
# restarted process still has the environment of `mise run up`.
FYSO_AUTH_USERS=$(mise exec -- printenv FYSO_AUTH_USERS 2>/dev/null || printf '%s' "${FYSO_AUTH_USERS:-}")
export FYSO_AUTH_USERS
# The remote MCP's OAuth client (D90) may be created while the stack runs (agent:remote).
FYSO_MCP_CLIENT_SECRET=$(mise exec -- printenv FYSO_MCP_CLIENT_SECRET 2>/dev/null || printf '%s' "${FYSO_MCP_CLIENT_SECRET:-}")
export FYSO_MCP_CLIENT_SECRET
require_env FYSO_DATA FYSO_ROOT FYSO_WEB_DOMAIN FYSO_HTTP_PORT FYSO_AUTH_PORT FYSO_AUTH_USERS
web_scheme >/dev/null
[ "${FYSO_BIND:-127.0.0.1}" = 127.0.0.1 ] || fail "The gateway listens on loopback only. Remote access goes through a private forwarder or an HTTPS provider extension."
[ -x "$FYSO_DATA/web-auth/bin/tinyauth" ] || fail "run 'mise run web-auth:install' first"
umask 077
mkdir -p "$FYSO_DATA/web-auth/runtime"
FYSO_WEB_SCHEME="$(web_scheme)" mise exec -- node "$FYSO_ROOT/framework/scripts/web-auth-config.cjs"
cd "$FYSO_DATA/web-auth/runtime"
clean_exec \
  TINYAUTH_CONFIGFILE="$FYSO_DATA/web-auth/runtime/config.yaml" \
  "$FYSO_DATA/web-auth/bin/tinyauth"
