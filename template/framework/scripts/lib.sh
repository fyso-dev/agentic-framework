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
  # A caller can isolate mise's configuration and auto-trust state using XDG.
  # Preserve only these paths, and let explicit NAME=value arguments override them.
  local xdg_vars=() name
  for name in XDG_STATE_HOME XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME MISE_DATA_DIR MISE_CACHE_DIR MISE_STATE_DIR; do
    [ -z "${!name:-}" ] || xdg_vars+=("$name=${!name}")
  done
  exec env -i \
    HOME="$HOME" USER="${USER:-}" LOGNAME="${LOGNAME:-}" \
    PATH="$PATH" LANG="${LANG:-en_US.UTF-8}" TERM="${TERM:-dumb}" \
    TMPDIR="${TMPDIR:-/tmp}" ${xdg_vars[@]+"${xdg_vars[@]}"} "$@"
}

# The age key that opens this developer's or server's secrets (setup.sh).
admin_age_key() { printf '%s' "${MISE_SOPS_AGE_KEY_FILE:-${SOPS_AGE_KEY_FILE:-$HOME/.config/mise/age.txt}}"; }

# Like clean_exec, but the command runs confined to this project's folder (D93,
# confine.cjs): it cannot read the home folder, other projects or the shared age key.
# FYSO_CONFINE=off runs it as clean_exec does. Same arguments: NAME=value…, then the command.
confined_exec() {
  local vars=()
  while [ $# -gt 0 ] && [[ $1 =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; do vars+=("$1"); shift; done
  [ $# -gt 0 ] || fail "confined_exec: no command"
  [ "${FYSO_CONFINE:-strict}" != off ] || clean_exec ${vars[@]+"${vars[@]}"} "$@"
  local keys=(--shared-key "$(admin_age_key)" --shared-key "$HOME/.config/mise/age.txt")
  clean_exec ${vars[@]+"${vars[@]}"} FYSO_CONFINE="${FYSO_CONFINE:-strict}" \
    node "$FYSO_ROOT/framework/scripts/confine.cjs" run \
    --root "$FYSO_ROOT" --data "$FYSO_DATA" --project "${FYSO_PROJECT:-}" --port "${FYSO_HTTP_PORT:-}" \
    "${keys[@]}" --allow-read "${FYSO_CONFINE_ALLOW_READ:-}" --allow-write "${FYSO_CONFINE_ALLOW_WRITE:-}" \
    -- "$@"
}

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

block_ports() {
  echo "$FYSO_HTTP_PORT" "$FYSO_DAGU_PORT" "$FYSO_DAGU_SCHEDULER_PORT" \
    "$FYSO_DAGU_WORKER_HEALTH_PORT" "$FYSO_OMB_PORT" "$FYSO_OMB_WEBHOOK_PORT" \
    "$FYSO_DAGU_COORDINATOR_PORT" "$FYSO_DAGU_COORDINATOR_HEALTH_PORT" \
    "$FYSO_CADDY_ADMIN_PORT" "${FYSO_AUTH_PORT:-$((FYSO_HTTP_PORT + 9))}"
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

# A private Unix socket avoids competing with web-auth for base + 9.
connector_setup_socket() { printf '/tmp/fyso-connectors-%s.sock\n' "$FYSO_HTTP_PORT"; }

# Remote MCP endpoint (D63), behind the gateway's /mcp route.
mcp_socket() { printf '/tmp/fyso-mcp-%s.sock\n' "$FYSO_HTTP_PORT"; }

# Web login this project trusts (D61): its own Tinyauth, or a shared one on this host.
# Process-compose retains its startup environment across process restarts. Read
# the current config so adopting/changing the hub does not keep a local authority.
configured_auth_upstream() {
  mise exec -- printenv FYSO_AUTH_UPSTREAM 2>/dev/null || printf '%s' "${FYSO_AUTH_UPSTREAM:-}"
}
auth_upstream() {
  local upstream; upstream=$(configured_auth_upstream)
  printf '%s' "${upstream:-127.0.0.1:$FYSO_AUTH_PORT}"
}
shared_login() { [ -n "$(configured_auth_upstream)" ]; }

# Public web addresses (D62). The gateway always listens on loopback HTTP; an HTTPS
# provider extension sets FYSO_WEB_SCHEME=https in its conf.d file, read fresh because
# a process restarted after `ext:add` still has the environment of `mise run up`.
web_scheme() {
  local scheme="${FYSO_WEB_SCHEME:-$(mise exec -- printenv FYSO_WEB_SCHEME 2>/dev/null || true)}"
  case "${scheme:-http}" in
    http|https) printf '%s' "${scheme:-http}" ;;
    *) fail "FYSO_WEB_SCHEME must be http or https, not \"$scheme\"" ;;
  esac
}
# A failure inside $(…) only ends that subshell: each helper stops on its own, and
# scripts call `web_scheme >/dev/null` once before using them as arguments.
web_port_suffix() {
  local scheme; scheme=$(web_scheme) || exit 1
  [ "$scheme" = https ] || printf ':%s' "$FYSO_HTTP_PORT"
}
web_origin() {
  local scheme suffix; scheme=$(web_scheme) || exit 1; suffix=$(web_port_suffix) || exit 1
  printf '%s://%s.%s%s' "$scheme" "$1" "$FYSO_WEB_DOMAIN" "$suffix"
}
