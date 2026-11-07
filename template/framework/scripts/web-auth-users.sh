#!/usr/bin/env bash
# Small CLI glue: native bcrypt users, encrypted using the existing SOPS file.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
export SOPS_AGE_KEY_FILE="${MISE_SOPS_AGE_KEY_FILE:-${SOPS_AGE_KEY_FILE:-$HOME/.config/mise/age.txt}}"
action=${1:-}; username=${2:-${FYSO_ADMIN_USER:-admin}}
case "$action" in init|add|remove) ;; *) fail "usage: web-auth:users <init|add|remove> [username]";; esac
[[ "$username" =~ ^[a-zA-Z][a-zA-Z0-9_.-]{1,63}$ ]] || fail "invalid username (2-64 ASCII letters, digits, dots, dashes or underscores)"
if [ "$action" = init ] && [ -n "${FYSO_AUTH_USERS:-}" ]; then exit 0; fi
stack_running && fail "stop this project's stack before changing web users; existing sessions will be invalidated"
entry=""
if [ "$action" != remove ]; then
  if [ "$action" = init ] && [ -n "${FYSO_INITIAL_PASSWORD_FILE:-}" ]; then
    password=$(head -n 1 "$FYSO_INITIAL_PASSWORD_FILE")
  elif [ -t 0 ]; then
    read -r -s -p "Password for $username (12-72 bytes): " password; printf '\n' >&2
    read -r -s -p "Repeat password: " repeated; printf '\n' >&2
    [ "$password" = "$repeated" ] || fail "passwords do not match"
  else
    fail "an interactive password is required; installers can provide FYSO_INITIAL_PASSWORD_FILE"
  fi
  bytes=$(printf '%s' "$password" | wc -c | tr -d ' ')
  [ "$bytes" -ge 12 ] && [ "$bytes" -le 72 ] || fail "password must contain 12-72 bytes"
  hash=$(printf '%s' "$password" | caddy hash-password --algorithm bcrypt --bcrypt-cost 12)
  unset password repeated
  entry="$username:$hash"
fi
printf '%s' "$entry" | node framework/scripts/web-auth-users.cjs "$action" "$username"
