#!/usr/bin/env bash
# The folder is writable, the tool answers, and the files site is never served without login.
set -euo pipefail
command -v node >/dev/null || { echo "node missing: run mise install" >&2; exit 1; }
dir="${FYSO_DATA:?}/ext/deliverables/files"
mkdir -p "$dir"
test -w "$dir" || { echo "$dir is not writable" >&2; exit 1; }
cd "${FYSO_ROOT:?}"
node extensions/deliverables/deliver.cjs list >/dev/null
# When the gateway runs, an unauthenticated request must not get the listing.
code=$(curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' \
  --header "Host: files.${FYSO_WEB_DOMAIN:?}:${FYSO_HTTP_PORT:?}" "http://127.0.0.1:${FYSO_HTTP_PORT}/" || true)
case "$code" in
  000) ;;   # gateway not running: nothing is exposed
  302|303|401|403) ;;
  *) echo "files site returned unexpected status $code" >&2; exit 1 ;;
esac
