#!/usr/bin/env bash
set -euo pipefail
command -v silverbullet >/dev/null
command -v mcp-server-filesystem >/dev/null
test -d "${FYSO_ROOT:?}/project/wiki"
curl --fail --silent --show-error --max-time 5 --output /dev/null \
  "http://127.0.0.1:${FYSO_EXT_SILVERBULLET_PORT:?}/.fs/index.md"
