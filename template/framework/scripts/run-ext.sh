#!/usr/bin/env bash
# Run an extension with only its declared environment.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
# Callers such as Dagu run with a cleared environment, so load the project's
# mise env (FYSO_EXT_*_PORT from conf.d, decrypted secrets) before filtering it.
exec mise exec -- node framework/scripts/extensions.cjs run "$@"
