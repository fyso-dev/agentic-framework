#!/usr/bin/env bash
# Panel setup glue gets only this project's native ports and encryption context.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_ROOT FYSO_DATA FYSO_ADMIN_USER FYSO_ADMIN_PASSWORD FYSO_HTTP_PORT FYSO_OMB_PORT
web_scheme >/dev/null
clean_exec \
  FYSO_ROOT="$FYSO_ROOT" FYSO_DATA="$FYSO_DATA" FYSO_PROJECT="${FYSO_PROJECT:-}" \
  FYSO_ADMIN_USER="$FYSO_ADMIN_USER" FYSO_ADMIN_PASSWORD="$FYSO_ADMIN_PASSWORD" \
  FYSO_HTTP_PORT="$FYSO_HTTP_PORT" FYSO_OMB_PORT="$FYSO_OMB_PORT" \
  FYSO_CONNECTOR_SETUP_SOCKET="$(connector_setup_socket)" \
  FYSO_WEB_DOMAIN="${FYSO_WEB_DOMAIN:-localhost}" FYSO_WEB_SCHEME="$(web_scheme)" \
  SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-${MISE_SOPS_AGE_KEY_FILE:-$HOME/.config/mise/age.txt}}" \
  node framework/scripts/composio-setup.cjs
