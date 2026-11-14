#!/usr/bin/env bash
# Remote MCP endpoint (D63): the platform MCP server over HTTP on a private socket.
# Its tools need the project's whole mise environment, as when a desktop agent starts
# the stdio server, so it is read fresh: a token or an HTTPS provider added while the
# stack runs applies on the next restart of this process.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_HTTP_PORT
# Keep only the explicit key and tool-store locations needed by this nested mise.
mcp_env=()
[ -z "${MISE_SOPS_AGE_KEY_FILE:-}" ] || mcp_env+=("MISE_SOPS_AGE_KEY_FILE=$MISE_SOPS_AGE_KEY_FILE")
[ -z "${SOPS_AGE_KEY_FILE:-}" ] || mcp_env+=("SOPS_AGE_KEY_FILE=$SOPS_AGE_KEY_FILE")
[ -z "${MISE_DATA_DIR:-}" ] || mcp_env+=("MISE_DATA_DIR=$MISE_DATA_DIR")
clean_exec ${mcp_env[@]+"${mcp_env[@]}"} mise exec -- node framework/scripts/fyso-mcp.cjs --http "$(mcp_socket)"
