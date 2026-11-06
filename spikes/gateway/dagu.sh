#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
export DAGU_HOME="$PWD/.data/dagu" DAGU_DAGS_DIR="$PWD/spikes/gateway/dags"
export DAGU_HOST=127.0.0.1 DAGU_PORT=8601 DAGU_SCHEDULER_PORT=8602 DAGU_WORKER_HEALTH_PORT=8603
export DAGU_COORDINATOR_PORT=8606 DAGU_COORDINATOR_HEALTH_PORT=8607
export DAGU_PEER_INSECURE=true
export PATH="$PWD/.data/bin:$PATH"
exec .data/bin/dagu start-all
