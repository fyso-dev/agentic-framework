#!/usr/bin/env bash
# The native features this extension relies on exist in the pinned tools.
set -euo pipefail
command -v dagu >/dev/null || { echo "dagu missing: run mise install" >&2; exit 1; }
command -v openmausbot >/dev/null || { echo "openmausbot missing: run mise install" >&2; exit 1; }
# This project's Dagu home, never the user's. No server is contacted.
# Read whole: grep -q would close the pipe early and fail the pipeline.
schema=$(DAGU_HOME="${FYSO_DATA:?}/dagu" dagu schema dag 2>/dev/null || true)
case "$schema" in
  *'"human.task"'*) ;;
  *) echo "this Dagu version has no human.task action" >&2; exit 1 ;;
esac
cd "${FYSO_ROOT:?}"
for name in ask notify; do
  test -f "project/workflows/ext-owner-loop-$name.yaml" \
    || { echo "project/workflows/ext-owner-loop-$name.yaml is missing" >&2; exit 1; }
done
