#!/usr/bin/env bash
# OMB does not pass FYSO_ROOT to bots; derive the project from this file's location.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec bash framework/scripts/run-ext.sh deliverables -- node extensions/deliverables/deliver.cjs mcp
