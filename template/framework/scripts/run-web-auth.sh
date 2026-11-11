#!/usr/bin/env bash
# Native session authority. All browser credentials remain in this process.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
# Shared login (D61): nothing to run here. The process stays up so the stack's
# dependencies and readiness (health.sh asks the shared service) need no second shape.
if shared_login; then exec tail -f /dev/null; fi
require_env FYSO_DATA FYSO_ROOT FYSO_WEB_DOMAIN FYSO_HTTP_PORT FYSO_AUTH_PORT FYSO_AUTH_USERS
[ "${FYSO_BIND:-127.0.0.1}" = 127.0.0.1 ] || fail "HTTP web login is local-only. Remote HTTPS deployment is not configured."
[ -x "$FYSO_DATA/web-auth/bin/tinyauth" ] || fail "run 'mise run web-auth:install' first"
umask 077
mkdir -p "$FYSO_DATA/web-auth/runtime"
node "$FYSO_ROOT/framework/scripts/web-auth-config.cjs"
cd "$FYSO_DATA/web-auth/runtime"
clean_exec \
  TINYAUTH_CONFIGFILE="$FYSO_DATA/web-auth/runtime/config.yaml" \
  "$FYSO_DATA/web-auth/bin/tinyauth"
