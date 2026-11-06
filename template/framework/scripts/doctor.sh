#!/usr/bin/env bash
# Health checks (PLAN §8). Exit 1 if any check fails.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

failures=0
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }
bad()  { printf '  ✗ %s\n' "$*"; failures=$((failures + 1)); }

echo "Secrets"
if [ -n "${FYSO_ADMIN_PASSWORD:-}" ]; then
  ok "secrets.enc.yaml decrypted"
  [ "$FYSO_ADMIN_PASSWORD" = admin ] && warn "login is still admin / admin (fine locally; change it before exposing a server)"
else
  bad "secrets not loaded: run 'mise run setup', and check your age key"
fi

echo "Tools"
for t in dagu openmausbot caddy process-compose sops; do
  command -v "$t" >/dev/null && ok "$t" || bad "$t missing: run 'mise install'"
done

echo "Logins"
if command -v claude >/dev/null; then
  claude auth status >/dev/null 2>&1 && ok "claude signed in" \
    || bad "claude is not signed in (or CLAUDE_CODE_OAUTH_TOKEN is invalid): run 'claude' and /login"
else
  warn "claude CLI not installed (needed for Claude bots)"
fi
if command -v codex >/dev/null; then
  codex login status >/dev/null 2>&1 && ok "codex signed in" || warn "codex is not signed in (only needed for Codex bots)"
fi

echo "Isolation"
[ "${OPENMAUSBOT_URL:-}" = "http://127.0.0.1:$FYSO_OMB_PORT" ] \
  && ok "openmausbot CLI targets this project (:$FYSO_OMB_PORT)" \
  || bad "OPENMAUSBOT_URL does not point at this project's OpenMausBot"

if stack_running; then
  echo "Running stack"
  framework/scripts/health.sh dagu  && ok "Dagu answers on :$FYSO_DAGU_PORT"  || bad "Dagu does not answer"
  framework/scripts/health.sh omb   && ok "OpenMausBot answers on :$FYSO_OMB_PORT" || bad "OpenMausBot does not answer"
  env_id=$(openmausbot doctor --json --port "$FYSO_OMB_PORT" 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).server.environmentId||"")}catch{console.log("")}})')
  if [ -n "$env_id" ] && [ "$env_id" = "$(cat "$FYSO_DATA/omb/environment-id" 2>/dev/null)" ]; then
    ok "OpenMausBot is this project's instance (environment $env_id)"
  else
    bad "could not confirm OpenMausBot's instance (environment-id mismatch)"
  fi
  framework/scripts/health.sh caddy && ok "gateway asks for login on panel.localhost:$FYSO_HTTP_PORT" || bad "gateway not answering"
  code=$(curl -s -o /dev/null -w '%{http_code}' -u "$FYSO_ADMIN_USER:$FYSO_ADMIN_PASSWORD" \
    -H "Host: dagu.localhost:$FYSO_HTTP_PORT" "http://127.0.0.1:$FYSO_HTTP_PORT/api/v1/dags")
  [ "$code" = 200 ] && ok "Dagu API through the gateway with one login" || bad "Dagu through the gateway returned $code"
else
  echo "Ports (stack not running)"
  for p in $(block_ports); do port_in_use "$p" && bad "port $p is in use" || ok "port $p free"; done
fi

echo
[ "$failures" -eq 0 ] && echo "All checks passed." || { echo "$failures check(s) failed."; exit 1; }
