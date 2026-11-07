#!/usr/bin/env bash
# Readiness checks used by process-compose and doctor: health.sh <dagu|omb|web-auth|caddy>
set -euo pipefail
source "$(dirname "$0")/lib.sh"
case "${1:-}" in
  web-auth) curl -fsS -o /dev/null "http://127.0.0.1:$FYSO_AUTH_PORT/api/healthz" ;;
  dagu)  curl -fsS -o /dev/null -u "$FYSO_ADMIN_USER:$FYSO_ADMIN_PASSWORD" \
           "http://127.0.0.1:$FYSO_DAGU_PORT/api/v1/health" ;;
  omb)   curl -fsS -o /dev/null "http://127.0.0.1:$FYSO_OMB_WEBHOOK_PORT/health" ;;
  caddy) code=$(curl -s -o /dev/null -w '%{http_code}' \
           -H "Host: panel.$FYSO_WEB_DOMAIN:$FYSO_HTTP_PORT" "http://127.0.0.1:$FYSO_HTTP_PORT/")
         [ "$code" = 401 ] ;;
  *) fail "usage: health.sh <dagu|omb|web-auth|caddy>" ;;
esac
