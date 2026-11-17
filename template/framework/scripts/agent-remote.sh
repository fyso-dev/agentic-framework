#!/usr/bin/env bash
# Connect an agent on another machine to this project's MCP (D63).
#   agent-remote.sh            print the address and the command for each client
#   agent-remote.sh --rotate   replace the token first (old connections stop working)
#   agent-remote.sh --ensure   create the token if it is missing and print JSON without it
#                              (the panel's "run" action, through Dagu)
# The token is created here on first use and kept in secrets.enc.yaml. It is printed
# by this task in the terminal; the panel shows it only on request (D65), through the
# private setup adapter, never through Dagu.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_PROJECT FYSO_WEB_DOMAIN FYSO_HTTP_PORT
[ "$(web_scheme)" = https ] || fail "Remote connection needs HTTPS. Install an HTTPS provider extension (for example: mise run ext:add netbird -- -d access=https) and start the project again."
[ -f secrets.enc.yaml ] || fail "secrets.enc.yaml is missing: run 'mise run setup' first"
mode=${1:-}
case "$mode" in ''|--rotate|--ensure) ;; *) fail "usage: agent:remote [--rotate]";; esac
token="${FYSO_MCP_TOKEN:-}"
created=false
if [ -z "$token" ] || [ "$mode" = --rotate ]; then
  token=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')
  # The value goes through stdin, never the command line.
  printf '"%s"' "$token" | SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-${MISE_SOPS_AGE_KEY_FILE:-$HOME/.config/mise/age.txt}}" \
    sops set --value-stdin secrets.enc.yaml '["FYSO_MCP_TOKEN"]'
  created=true
  note() { if [ "$mode" = --ensure ]; then echo "$@" >&2; else echo "$@"; fi; }
  note "✓ New token saved in secrets.enc.yaml (commit that file)."
  if stack_running; then pc process restart mcp-remote >/dev/null && note "✓ Remote MCP restarted with the new token."
  else note "  Start the project (mise run up) before connecting."; fi
fi
if [ "$mode" = --ensure ]; then
  unset token
  node -e 'const [server, url, created] = process.argv.slice(1); console.log(JSON.stringify({mode: "remote", server, url, created: created === "true"}))' \
    "fyso-$FYSO_PROJECT" "$(web_origin panel)/mcp" "$created"
  exit 0
fi
FYSO_MCP_TOKEN="$token" FYSO_WEB_SCHEME="$(web_scheme)" node framework/scripts/agent-remote.cjs
