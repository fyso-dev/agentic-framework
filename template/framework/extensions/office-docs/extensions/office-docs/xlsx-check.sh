#!/usr/bin/env bash
# Guard for ext-office-docs-xlsx: the workbook lands in this extension's output folder
# and the source is a data file inside the project. Parameters arrive as env vars.
set -euo pipefail
fail() { echo "error: $*" >&2; exit 1; }
name_ok='^[A-Za-z0-9][A-Za-z0-9._ -]{0,80}$'
sheet_ok='^[A-Za-z0-9][A-Za-z0-9._ -]{0,30}$'
[[ "${NAME:-}" =~ $name_ok ]] || fail "NAME: letters, digits, spaces, dots, dashes and underscores, without extension"
[[ "${SHEET:-}" =~ $sheet_ok ]] || fail "SHEET: up to 31 letters, digits, spaces, dots, dashes and underscores"
source=${SOURCE:-}
case "$source" in ""|/*|*..*) fail "SOURCE: a path relative to the project, without '..'" ;; *) ;; esac
case "$source" in *.csv|*.json|*.jsonl) ;; *) fail "SOURCE: a .csv, .json or .jsonl file" ;; esac
cd "${FYSO_ROOT:?}"
[[ -f "$source" && ! -L "$source" ]] || fail "SOURCE not found: $source"
# Resolve parent symlinks as well as the file itself before Dagu reads the input.
SOURCE="$source" node -e '
  const fs = require("node:fs"), path = require("node:path");
  const root = fs.realpathSync(process.env.FYSO_ROOT);
  const rel = path.relative(root, fs.realpathSync(process.env.SOURCE));
  if (rel.startsWith("..") || path.isAbsolute(rel) || /(^|[\\/])\./.test(rel) && !rel.startsWith(".data/ext/")) {
    console.error("error: SOURCE resolves outside the project or to private data"); process.exit(1);
  }
'
out="${FYSO_DATA:?}/ext/office-docs/out"
mkdir -p "$out"
# A fresh workbook every time: xlsx.write would otherwise write into the old one.
rm -f "$out/$NAME.xlsx"
