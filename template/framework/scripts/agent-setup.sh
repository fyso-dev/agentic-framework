#!/usr/bin/env bash
# Prepare this project for coding agents (D33): install Dagu's own authoring skill,
# pinned to the Dagu version of this project, for Claude Code and Codex. The MCP
# servers (dagu, fyso) already come from .mcp.json; DAGU_MCP_AUTH is set by mise.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
version=$(mise current aqua:dagucloud/dagu)
[ -n "$version" ] || fail 'Dagu is not installed; run mise install'
# skills 1.7.6 (vercel-labs/skills) copies the skill into .claude/skills and .agents/skills.
DISABLE_TELEMETRY=1 npx -y skills@1.7.6 add "dagucloud/dagu@v$version" --skill dagu \
  -a claude-code codex --copy -y
echo "Dagu skill v$version installed for Claude Code (.claude/skills/dagu) and Codex (.agents/skills/dagu)."
