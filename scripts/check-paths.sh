#!/usr/bin/env bash
# Fail if tracked files contain machine-specific absolute paths.
# Paths must be derived (script location, git root, mise config_root) or come from env vars.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
pattern='/Users/[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+/|/private/tmp/|/var/folders/|/opt/homebrew/|C:\\Users\\'
if git grep -nIE "$pattern" -- . ':!scripts/check-paths.sh'; then
  echo "error: machine-specific absolute paths found (see above)." >&2
  exit 1
fi
echo "No machine-specific paths."
