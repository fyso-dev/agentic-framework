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
    "$FYSO_CADDY_ADMIN_PORT" "${FYSO_CONNECTOR_SETUP_PORT:-$((FYSO_HTTP_PORT + 9))}"
  local name
  while IFS='=' read -r name _; do
    [[ $name != FYSO_EXT_*_PORT ]] || printf '%s\n' "${!name}"
  done < <(env)
}

# Extension ports as NAME=value lines, read fresh from the project's mise config:
# a process restarted after `ext:add` still has the environment of `mise run up`.
ext_port_env() { mise exec -- env | sed -n '/^FYSO_EXT_[A-Z0-9_]*_PORT=/p'; }

# Unix sockets have a ~104-char path limit on macOS, so keep it short.
PC_SOCKET="/tmp/fyso-${FYSO_PROJECT:-unknown}-${FYSO_HTTP_PORT:-0}.sock"
pc() {
  local configs=(-f process-compose.yaml) file
  for file in project/apps/*/process.yaml extensions/*/process.yaml; do
    [ ! -f "$file" ] || configs+=(-f "$file")
  done
  # Only startup loads configuration. Client commands address that same server;
  # process-compose 1.124.0 rejects -f for process list/logs and down.
  if [ "${1:-}" = up ] || [ "${1:-} ${2:-}" = "project update" ]; then
    process-compose "${configs[@]}" "$@" --unix-socket "$PC_SOCKET"
  else
    process-compose "$@" --unix-socket "$PC_SOCKET"
  fi
}
stack_running() { [ -S "$PC_SOCKET" ] && pc process list >/dev/null 2>&1; }
