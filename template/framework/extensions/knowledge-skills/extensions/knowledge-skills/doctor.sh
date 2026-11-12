#!/usr/bin/env bash
# The gardener can read the wiki, and its workflow is in place.
set -euo pipefail
command -v node >/dev/null || { echo "node missing: run mise install" >&2; exit 1; }
cd "${FYSO_ROOT:?}"
[[ -d project/wiki ]] || { echo "project/wiki is missing" >&2; exit 1; }
node extensions/knowledge-skills/garden.cjs check >/dev/null
[[ -f project/workflows/ext-knowledge-skills-garden.yaml ]] \
  || { echo "project/workflows/ext-knowledge-skills-garden.yaml is missing" >&2; exit 1; }
