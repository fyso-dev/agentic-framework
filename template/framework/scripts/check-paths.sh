#!/usr/bin/env bash
# Fail if tracked (or staged) files contain machine-specific absolute paths.
# Paths must be derived (script location, git root, mise config_root) or come from env vars.
# Runs on the git checkout of the current directory, so `dev-task` uses it on its worktree.
# Optional pathspecs limit the scan to what a caller commits (the snapshot commits only
# its own paths; a template source recorded elsewhere must not block it).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
[ "$#" -gt 0 ] || set -- .
pattern='/Users/[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+/|/private/tmp/|/var/folders/|/opt/homebrew/|C:\\Users\\'
if git grep --cached -nIE "$pattern" -- "$@" ':!scripts/check-paths.sh' ':!framework/scripts/check-paths.sh' ':!template/framework/scripts/check-paths.sh'; then
  echo "error: machine-specific absolute paths found (see above)." >&2
  exit 1
fi
echo "No machine-specific paths."
