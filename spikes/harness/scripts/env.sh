#!/bin/sh
# Isolated Dagu environment for the harness spike (port block 8410-8419).
# Source it: . spikes/harness/scripts/env.sh
WT="$(cd "$(dirname "$0")/../../.." 2>/dev/null && pwd)"
[ -n "$WT" ] && [ -d "$WT/spikes/harness" ] || WT="$(git rev-parse --show-toplevel)"
export WT
export DAGU_BIN="$WT/.data/bin/dagu"
export DAGU_HOME="$WT/.data/dagu"
export DAGU_DAGS_DIR="$WT/spikes/harness"
export DAGU_HOST=127.0.0.1
export DAGU_PORT=8411
export DAGU_SCHEDULER_PORT=8412
export DAGU_WORKER_HEALTH_PORT=8413
export DAGU_COORDINATOR_PORT=8416
export DAGU_COORDINATOR_HEALTH_PORT=8417
export DAGU_AUTH_MODE=none
