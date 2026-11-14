#!/usr/bin/env bash
# Disposable Dagu queue-failure recovery with real browser and extension assets.
set -euo pipefail
: "${FYSO_TEST_DAGU_PORT:?Set a free five-port block on loopback}"
: "${FYSO_TEST_CHROME:?Set the Chromium executable}"
: "${FYSO_TEST_PANEL_ASSETS:?Set the built panel assets directory}"
work=$(mktemp -d)
export FYSO_503_ROOT="$work/fixture"
cleanup() {
  if [ -f "$FYSO_503_ROOT/dagu.pid" ]; then
    python3 - "$FYSO_503_ROOT/dagu.pid" <<'PY_CLEAN'
import os, signal, subprocess, sys, time
lines = open(sys.argv[1]).read().splitlines()
pid = int(lines[0])
if len(lines) != 2: raise SystemExit("Missing fixture process identity")
try:
    identity = subprocess.run(["ps", "-o", "lstart=", "-p", str(pid)], capture_output=True, text=True)
    if identity.returncode or identity.stdout.strip() != lines[1] or os.getpgid(pid) != pid: raise ProcessLookupError()
    os.killpg(pid, signal.SIGTERM)
    for _ in range(100):
        try: os.killpg(pid, 0)
        except ProcessLookupError: break
        time.sleep(.1)
    else:
        os.killpg(pid, signal.SIGKILL)
        for _ in range(50):
            try: os.killpg(pid, 0)
            except ProcessLookupError: break
            time.sleep(.1)
except ProcessLookupError: pass
PY_CLEAN
  fi
  rm -rf "$work"
}
trap cleanup EXIT
here=$(cd "$(dirname "$0")" && pwd)
python3 "$here/human-requests-503-setup.py"
node "$here/human-requests-503-browser.cjs"
