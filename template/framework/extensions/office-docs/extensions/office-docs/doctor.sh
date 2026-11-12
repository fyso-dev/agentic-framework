#!/usr/bin/env bash
# Real conversions with the pinned tools; nothing is left behind.
set -euo pipefail
command -v pandoc >/dev/null || { echo "pandoc missing: run mise install" >&2; exit 1; }
command -v typst >/dev/null || { echo "typst missing: run mise install" >&2; exit 1; }
command -v dagu >/dev/null || { echo "dagu missing: run mise install" >&2; exit 1; }
tmp="${FYSO_DATA:?}/ext/office-docs/doctor.$$"
mkdir -p "$tmp"
trap 'rm -rf "$tmp"' EXIT
printf '%s\n' '---' 'title: Check' 'lang: es' '---' '' '# Check' '' 'Text.' > "$tmp/in.md"
pandoc "$tmp/in.md" -o "$tmp/out.docx"
pandoc "$tmp/in.md" -o "$tmp/out.pptx"
pandoc "$tmp/in.md" --pdf-engine=typst -V mainfont="Libertinus Serif" -V papersize=a4 -o "$tmp/out.pdf"
for kind in docx pptx pdf; do
  test -s "$tmp/out.$kind" || { echo "$kind was not written" >&2; exit 1; }
done
# Excel is Dagu's native xlsx.write; this project's Dagu home, never the user's.
# Read whole: grep -q would close the pipe early and fail the pipeline.
schema=$(DAGU_HOME="$FYSO_DATA/dagu" dagu schema dag 2>/dev/null || true)
case "$schema" in
  *'"xlsx.write"'*) ;;
  *) echo "this Dagu version has no xlsx.write action" >&2; exit 1 ;;
esac
test -f "${FYSO_ROOT:?}/project/workflows/ext-office-docs-xlsx.yaml" \
  || { echo "project/workflows/ext-office-docs-xlsx.yaml is missing" >&2; exit 1; }
