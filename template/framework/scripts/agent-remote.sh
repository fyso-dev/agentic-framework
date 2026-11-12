#!/usr/bin/env bash
# Connect an agent on another machine to this project's MCP (D63).
#   agent-remote.sh            print the address and the command for each client
#   agent-remote.sh --rotate   replace the token first (old connections stop working)
# The token is created here on first use and kept in secrets.enc.yaml. It is printed
# in this terminal only; the panel never shows it.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_PROJECT FYSO_WEB_DOMAIN FYSO_HTTP_PORT
[ "$(web_scheme)" = https ] || fail "Remote connection needs HTTPS. Install an HTTPS provider extension (for example: mise run ext:add netbird -- -d access=https) and start the project again."
[ -f secrets.enc.yaml ] || fail "secrets.enc.yaml is missing: run 'mise run setup' first"
token="${FYSO_MCP_TOKEN:-}"
if [ -z "$token" ] || [ "${1:-}" = --rotate ]; then
  token=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')
  # The value goes through stdin, never the command line.
  printf '"%s"' "$token" | SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-${MISE_SOPS_AGE_KEY_FILE:-$HOME/.config/mise/age.txt}}" \
    sops set --value-stdin secrets.enc.yaml '["FYSO_MCP_TOKEN"]'
  echo "✓ New token saved in secrets.enc.yaml (commit that file)."
  if stack_running; then pc process restart mcp-remote >/dev/null && echo "✓ Remote MCP restarted with the new token."
  else echo "  Start the project (mise run up) before connecting."; fi
fi
url="$(web_origin panel)/mcp"
name="fyso-$FYSO_PROJECT"
var="FYSO_$(printf '%s' "$FYSO_PROJECT" | tr 'a-z-' 'A-Z_')_MCP_TOKEN"
cat <<MSG

Remote MCP of this project: $url
Run one of these on the machine where your agent lives.

Claude Code
  claude mcp add --transport http --scope user $name $url --header "Authorization: Bearer $token"

Codex (the token stays in an environment variable; add the export to your shell profile)
  export $var=$token
  codex mcp add $name --url $url --bearer-token-env-var $var

Any other MCP client: streamable HTTP at the address above, with the header
  Authorization: Bearer $token

The token gives the project's platform tools (status, bots, extensions, files to
read), not Dagu's own tools. Whoever has it can use them: treat it as a password.
New token: mise run agent:remote -- --rotate
MSG
