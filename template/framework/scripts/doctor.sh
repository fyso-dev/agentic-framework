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

echo "Extensions"
node framework/scripts/extensions.cjs check && ok "extension ports and required secrets" || bad "extension configuration failed"
for check in extensions/*/doctor.sh; do
  [ -f "$check" ] || continue
  framework/scripts/run-ext.sh "$(basename "$(dirname "$check")")" -- bash "$check" \
    && ok "$check" || bad "$check failed"
done

echo "Tools"
for t in dagu openmausbot caddy process-compose sops; do
  command -v "$t" >/dev/null && ok "$t" || bad "$t missing: run 'mise install'"
done

echo "Connector setup"
curl -fsS -o /dev/null "http://127.0.0.1:${FYSO_CONNECTOR_SETUP_PORT:-$((FYSO_HTTP_PORT + 9))}/health" \
  && ok "Composio setup service" || bad "Composio setup service unavailable"

echo "Logins"
# Only engines a bot uses are required; at least one must be signed in (PLAN D32).
used=" $(node framework/scripts/panel-data.cjs engines 2>/dev/null | tr '\n' ' ')"
signed=0
login() { # <engine> <status command...>
  local engine=$1; shift
  if command -v "$engine" >/dev/null && "$@" >/dev/null 2>&1; then
    ok "$engine signed in"; signed=$((signed + 1))
  elif [[ $used == *" $engine "* ]]; then
    bad "$engine is not signed in but project/bots/team.yaml uses it: sign in, or move those bots to a signed-in engine"
  else
    warn "$engine is not signed in (optional: no bot uses it)"
  fi
}
login claude claude auth status
login codex codex login status
[ "$signed" -gt 0 ] || bad "no coding engine is signed in: run 'claude' and /login, or 'codex login --device-auth'"

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
  code=$(curl -s -o /dev/null -w '%{http_code}' -u "$FYSO_ADMIN_USER:$FYSO_ADMIN_PASSWORD" \
    -H "Host: omb.localhost:$FYSO_HTTP_PORT" -H 'Sec-Fetch-Site: same-origin' -H 'Sec-Fetch-Dest: empty' \
    "http://127.0.0.1:$FYSO_HTTP_PORT/api/bots")
  [ "$code" = 200 ] && ok "OpenMausBot browser access through the gateway" || bad "OpenMausBot browser access returned $code"
  framework/scripts/bots.sh check >/dev/null 2>&1 && ok "bots match project/bots/team.yaml" \
    || warn "bots differ from project/bots/team.yaml (tuned in OpenMausBot? the snapshot records it in state/bots/; 'mise run bots:plan' shows the difference)"
else
  echo "Ports (stack not running)"
  for p in $(block_ports); do port_in_use "$p" && bad "port $p is in use" || ok "port $p free"; done
fi

echo
[ "$failures" -eq 0 ] && echo "All checks passed." || { echo "$failures check(s) failed."; exit 1; }
