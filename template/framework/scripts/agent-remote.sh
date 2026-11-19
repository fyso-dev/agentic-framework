#!/usr/bin/env bash
# Connect an agent on another machine to this project's MCP (D63).
#   agent-remote.sh            print the address and the command for each client
#   agent-remote.sh --rotate   replace the token and the OAuth client secret first
#                              (old connections stop working)
#   agent-remote.sh --ensure   create what is missing and print JSON without secrets
#                              (the panel's "run" action, through Dagu)
# The token and the OAuth client secret (D90) are created here on first use and kept in
# secrets.enc.yaml. They are printed by this task in the terminal; the panel shows them
# only on request (D65), through the private setup adapter, never through Dagu.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_PROJECT FYSO_WEB_DOMAIN FYSO_HTTP_PORT
[ "$(web_scheme)" = https ] || fail "Remote connection needs HTTPS. Install an HTTPS provider extension (for example: mise run ext:add netbird -- -d access=https) and start the project again."
[ -f secrets.enc.yaml ] || fail "secrets.enc.yaml is missing: run 'mise run setup' first"
mode=${1:-}
case "$mode" in ''|--rotate|--ensure) ;; *) fail "usage: agent:remote [--rotate]";; esac
token="${FYSO_MCP_TOKEN:-}"
client_secret="${FYSO_MCP_CLIENT_SECRET:-}"
created=false
note() { if [ "$mode" = --ensure ]; then echo "$@" >&2; else echo "$@"; fi; }
# The value goes through stdin, never the command line.
store() {
  printf '"%s"' "$2" | SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-${MISE_SOPS_AGE_KEY_FILE:-$HOME/.config/mise/age.txt}}" \
    sops set --value-stdin secrets.enc.yaml "[\"$1\"]"
}
random_secret() { node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))'; }
if [ -z "$token" ] || [ "$mode" = --rotate ]; then
  token=$(random_secret)
  store FYSO_MCP_TOKEN "$token"
  created=true
  note "✓ New token saved in secrets.enc.yaml (commit that file)."
fi
# The OAuth client of the web login (D90): the secret people give Claude Desktop.
oauth_changed=false
# A shared login (D61) registers the client and keeps its secret in the hub.
if ! shared_login && { [ -z "$client_secret" ] || [ "$mode" = --rotate ]; }; then
  client_secret=$(random_secret)
  store FYSO_MCP_CLIENT_SECRET "$client_secret"
  oauth_changed=true created=true
  note "✓ New OAuth client secret saved in secrets.enc.yaml (commit that file)."
fi
if [ "$created" = true ]; then
  if stack_running; then
    pc process restart mcp-remote >/dev/null && note "✓ Remote MCP restarted."
    if [ "$oauth_changed" = true ]; then
      pc process restart web-auth >/dev/null && note "✓ Web login restarted with the OAuth client."
    fi
  else note "  Start the project (mise run up) before connecting."; fi
fi
if [ "$mode" = --ensure ]; then
  unset token client_secret
  node -e 'const [server, url, created] = process.argv.slice(1); console.log(JSON.stringify({mode: "remote", server, url, created: created === "true"}))' \
    "fyso-$FYSO_PROJECT" "$(web_origin panel)/mcp" "$created"
  exit 0
fi
FYSO_MCP_TOKEN="$token" FYSO_MCP_CLIENT_SECRET="$client_secret" FYSO_WEB_SCHEME="$(web_scheme)" node framework/scripts/agent-remote.cjs
