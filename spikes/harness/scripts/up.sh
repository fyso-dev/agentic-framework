#!/bin/sh
# Start the isolated Dagu (server + scheduler) with a clean environment:
# only HOME/PATH/USER/LOGNAME/TERM/LANG are passed, so no API key or parent-agent
# variable can leak into harness steps. Auth must come from the CLI logins under $HOME.
set -eu
. "$(dirname "$0")/env.sh"
mkdir -p "$DAGU_HOME"
env -i HOME="$HOME" USER="${USER:-}" LOGNAME="${LOGNAME:-}" TERM="${TERM:-dumb}" LANG="${LANG:-en_US.UTF-8}" \
  PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  DAGU_HOME="$DAGU_HOME" DAGU_DAGS_DIR="$DAGU_DAGS_DIR" DAGU_HOST="$DAGU_HOST" DAGU_PORT="$DAGU_PORT" \
  DAGU_SCHEDULER_PORT="$DAGU_SCHEDULER_PORT" DAGU_WORKER_HEALTH_PORT="$DAGU_WORKER_HEALTH_PORT" \
  DAGU_COORDINATOR_PORT="$DAGU_COORDINATOR_PORT" DAGU_COORDINATOR_HEALTH_PORT="$DAGU_COORDINATOR_HEALTH_PORT" \
  DAGU_AUTH_MODE="$DAGU_AUTH_MODE" \
  nohup "$DAGU_BIN" start-all >"$DAGU_HOME/start-all.log" 2>&1 &
echo $! >"$DAGU_HOME/start-all.pid"
echo "dagu start-all pid $(cat "$DAGU_HOME/start-all.pid") on http://$DAGU_HOST:$DAGU_PORT"
