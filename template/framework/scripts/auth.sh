#!/usr/bin/env bash
# Sign the engines in (PLAN §8). Uses only the official CLIs.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

if command -v claude >/dev/null; then
  if claude auth status >/dev/null 2>&1; then echo "✓ Claude signed in"
  else echo "→ Claude: run 'claude' and type /login (subscription), or put CLAUDE_CODE_OAUTH_TOKEN from 'claude setup-token' in secrets.enc.yaml"; fi
else
  echo "! Claude Code CLI not installed: https://claude.com/claude-code"
fi

if command -v codex >/dev/null; then
  codex login status >/dev/null 2>&1 && echo "✓ Codex signed in" || echo "→ Codex: run 'codex login --device-auth'"
fi

# API keys from secrets.enc.yaml, given to OpenMausBot's "Claude (API key)" engine only,
# so they never replace the subscription of claude/… bots.
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  stack_running || fail "start the project first ('mise run up') to register the API key"
  openmausbot engine set claude --key-env ANTHROPIC_API_KEY --only-claude-api --port "$FYSO_OMB_PORT" \
    && echo "✓ Anthropic API key registered for claudeApi/… bots"
fi
