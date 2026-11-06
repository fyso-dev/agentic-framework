# Shared helpers for framework scripts. Sourced, not executed.
# Scripts run through `mise run`, so FYSO_* variables and pinned tools are set.

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

require_env() {
  local v
  for v in "$@"; do
    [ -n "${!v:-}" ] || fail "$v is not set. Run this through mise (mise run …), and run 'mise run setup' once."
  done
}

# Run a command with a cleared environment: only the basics plus the
# variables given as NAME=value arguments before the command (PLAN §3.1).
clean_exec() {
  exec env -i \
    HOME="$HOME" USER="${USER:-}" LOGNAME="${LOGNAME:-}" \
    PATH="$PATH" LANG="${LANG:-en_US.UTF-8}" TERM="${TERM:-dumb}" \
    TMPDIR="${TMPDIR:-/tmp}" "$@"
}

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

block_ports() {
  echo "$FYSO_HTTP_PORT" "$FYSO_DAGU_PORT" "$FYSO_DAGU_SCHEDULER_PORT" \
    "$FYSO_DAGU_WORKER_HEALTH_PORT" "$FYSO_OMB_PORT" "$FYSO_OMB_WEBHOOK_PORT" \
    "$FYSO_DAGU_COORDINATOR_PORT" "$FYSO_DAGU_COORDINATOR_HEALTH_PORT" \
    "$FYSO_CADDY_ADMIN_PORT"
}

# Unix sockets have a ~104-char path limit on macOS, so keep it short.
PC_SOCKET="/tmp/fyso-$FYSO_PROJECT-$FYSO_HTTP_PORT.sock"
pc() { process-compose "$@" --unix-socket "$PC_SOCKET"; }
stack_running() { [ -S "$PC_SOCKET" ] && pc process list >/dev/null 2>&1; }
