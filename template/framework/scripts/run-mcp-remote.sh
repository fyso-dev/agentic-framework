#!/usr/bin/env bash
# Remote MCP endpoint (D63): the platform MCP server over HTTP on a private socket.
# Its tools need the project's whole mise environment, as when a desktop agent starts
# the stdio server, so it is read fresh: a token or an HTTPS provider added while the
# stack runs applies on the next restart of this process.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_HTTP_PORT
clean_exec mise exec -- node framework/scripts/fyso-mcp.cjs --http "$(mcp_socket)"
