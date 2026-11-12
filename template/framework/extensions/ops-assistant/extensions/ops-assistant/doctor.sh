#!/usr/bin/env bash
# The scripts load, the cap settings are valid and both workflows are in place.
set -euo pipefail
command -v node >/dev/null || { echo "node missing: run mise install" >&2; exit 1; }
cd "${FYSO_ROOT:?}"
node -e '
  const {spend} = require("./extensions/ops-assistant/digest.cjs");
  const fs = require("node:fs");
  let config = {};
  try { config = JSON.parse(fs.readFileSync("project/observability.json", "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw new Error("project/observability.json is not valid JSON"); }
  spend({usage: {groups: []}}, config);
'
for name in digest spend-cap; do
  [[ -f "project/workflows/ext-ops-assistant-$name.yaml" ]] \
    || { echo "project/workflows/ext-ops-assistant-$name.yaml is missing" >&2; exit 1; }
done
