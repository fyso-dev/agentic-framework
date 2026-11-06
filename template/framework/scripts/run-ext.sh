#!/usr/bin/env bash
# Run an extension with only its declared environment.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
exec node framework/scripts/extensions.cjs run "$@"
