#!/bin/sh
# Stop the isolated Dagu by the PID up.sh recorded (never by name: the user runs their own Dagu).
set -eu
. "$(dirname "$0")/env.sh"
PIDFILE="$DAGU_HOME/start-all.pid"
[ -f "$PIDFILE" ] || { echo "no pidfile"; exit 0; }
PID="$(cat "$PIDFILE")"
kill "$PID" 2>/dev/null && echo "stopped $PID" || echo "pid $PID not running"
rm -f "$PIDFILE"
