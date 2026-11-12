#!/usr/bin/env bash
# Small CLI glue: native bcrypt users, encrypted using the existing SOPS file.
#   web-auth-users.sh init                      first user, at setup
#   web-auth-users.sh add|remove [username]
#   web-auth-users.sh password [--new] [username]   show the stored password, or set a new one
# The login service only ever gets the bcrypt hash. The password itself is kept next to
# it in secrets.enc.yaml (D64) so the people who can already decrypt that file can read
# it again instead of resetting it. It is printed in this terminal only.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
export SOPS_AGE_KEY_FILE="${MISE_SOPS_AGE_KEY_FILE:-${SOPS_AGE_KEY_FILE:-$HOME/.config/mise/age.txt}}"
action=${1:-}; [ "$#" -eq 0 ] || shift
new=false; if [ "${1:-}" = --new ]; then new=true; shift; fi
username=${1:-${FYSO_ADMIN_USER:-admin}}
shared_login && fail "this project uses the shared login at $FYSO_AUTH_UPSTREAM: manage users and app permissions there"
case "$action" in init|add|remove|password) ;; *) fail "usage: web-auth:users <init|add|remove> [username] · web-auth:password [--new] [username]";; esac
[[ "$username" =~ ^[a-zA-Z][a-zA-Z0-9_.-]{1,63}$ ]] || fail "invalid username (2-64 ASCII letters, digits, dots, dashes or underscores)"
if [ "$action" = password ] && [ "$new" = false ]; then
  exec node framework/scripts/web-auth-users.cjs show "$username"
fi
if [ "$action" = init ] && [ -n "${FYSO_AUTH_USERS:-}" ]; then exit 0; fi

# Four groups of letters and digits that are easy to read aloud and type (about 79 bits).
generate() {
  node -e 'const c=require("node:crypto"),a="abcdefghjkmnpqrstuvwxyz23456789";
    process.stdout.write(Array.from({length:4},()=>Array.from({length:4},()=>a[c.randomInt(a.length)]).join("")).join("-"))'
}
password=""; generated=false; entry=""
if [ "$action" != remove ]; then
  if [ "$action" = init ] && [ -n "${FYSO_INITIAL_PASSWORD_FILE:-}" ]; then
    password=$(head -n 1 "$FYSO_INITIAL_PASSWORD_FILE")
  elif [ "$action" != password ] && [ -t 0 ]; then
    read -r -s -p "Password for $username (12-72 bytes; empty to generate one): " password; printf '\n' >&2
    if [ -n "$password" ]; then
      read -r -s -p "Repeat password: " repeated; printf '\n' >&2
      [ "$password" = "$repeated" ] || fail "passwords do not match"
    fi
  fi
  if [ -z "$password" ]; then password=$(generate); generated=true; fi
  bytes=$(printf '%s' "$password" | wc -c | tr -d ' ')
  [ "$bytes" -ge 12 ] && [ "$bytes" -le 72 ] || fail "password must contain 12-72 bytes"
  hash=$(printf '%s' "$password" | caddy hash-password --algorithm bcrypt --bcrypt-cost 12)
  entry="$username:$hash"
fi
# Changing credentials signs everyone out (the sessions file is removed), so the login
# service is stopped around the change; the rest of the project keeps running.
restart=false
if stack_running; then
  restart=true
  pc process stop web-auth >/dev/null
  trap 'pc process start web-auth >/dev/null || true' EXIT
fi
node_action=$action; [ "$action" != password ] || node_action=add
printf '%s\n%s' "$entry" "$password" | node framework/scripts/web-auth-users.cjs "$node_action" "$username"
if [ "$restart" = true ]; then
  trap - EXIT
  pc process start web-auth >/dev/null && echo "✓ Login service restarted."
fi
if [ "$generated" = true ]; then
  printf '\n  User      %s\n  Password  %s\n\n' "$username" "$password"
fi
[ "$action" = remove ] || echo "See it again: mise run web-auth:password${1:+ $username}"
unset password repeated
