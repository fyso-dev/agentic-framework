#!/usr/bin/env bash
# Optional trusted extension connection hooks; project-owned bots remain intact.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
for hook in extensions/*/connect.sh; do
  [[ -f "$hook" ]] || continue
  id=$(basename "$(dirname "$hook")")
  if ! node -e 'process.exit(require("./framework/scripts/extensions.cjs").missing(process.argv[1]).length ? 1 : 0)' "$id"; then
    printf '%s: connection pending required secrets\n' "$id"
    continue
  fi
  node framework/scripts/extension-ready.cjs "$id" "$PC_SOCKET"
  framework/scripts/run-ext.sh "$id" -- bash "$hook"
done
