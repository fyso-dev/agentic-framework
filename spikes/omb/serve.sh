#!/usr/bin/env bash
# Usage: serve.sh DATA_DIR LOGFILE  -> starts isolated OMB serve on 8504 in background, prints PID.
# Starts with a harmless marker and a FAKE placeholder CLAUDE_CODE_OAUTH_TOKEN-like var is NOT set here.
set -euo pipefail
source "$(dirname "$0")/env.sh"
DATA="$1"; LOG="$2"; mkdir -p "$DATA"
FYSO_SPIKE_MARKER=hello-123 nohup npx -y openmausbot@0.1.140 serve --port 8504 --data-dir "$DATA" --no-pair --no-open >"$LOG" 2>&1 &
echo $!
