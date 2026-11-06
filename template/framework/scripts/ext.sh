#!/usr/bin/env bash
# Lifecycle stays with Copier; only removal needs slot-aware glue.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
action=${1:-}; shift || true
copier() { uvx --from copier==9.19.1 copier "$@"; }
refresh() {
  local file
  for file in .config/mise/conf.d/ext-*.toml; do
    [ ! -f "$file" ] || mise trust "$file"
  done
  # Re-enter mise so newly installed extension variables reach panel generation.
  mise exec -- node framework/scripts/mcp-config.cjs
  mise exec -- node framework/scripts/panel-data.cjs config
}
case "$action" in
  add)
    [ "$#" -gt 0 ] || fail 'Usage: mise run ext:add <src> [-- copier args]'
    src=$1; shift
    [ "${1:-}" != -- ] || shift
    copier copy --trust "$src" . "$@"
    refresh
    ;;
  update)
    # `ext:update [ext] [-- copier args]`. Copier refuses to update a dirty tree,
    # so after an extension changes files the loop stops and asks for a commit.
    files=(.copier-answers.ext-*.yml)
    if [ "$#" -gt 0 ] && [[ $1 != -* ]]; then
      files=(".copier-answers.ext-$1.yml"); shift
      [ -f "${files[0]}" ] || fail "extension not installed: ${files[0]}"
    fi
    [ "${1:-}" != -- ] || shift
    for file in "${files[@]}"; do
      [ -f "$file" ] || continue
      copier update --trust --answers-file "$file" "$@"
      if [ -n "$(git status --porcelain)" ] && [ "$file" != "${files[${#files[@]}-1]}" ]; then
        refresh
        fail "updated ${file#.copier-answers.ext-}; commit the changes, then run 'mise run ext:update' again for the rest"
      fi
    done
    refresh
    ;;
  list) node framework/scripts/ext-lifecycle.cjs list ;;
  remove)
    node framework/scripts/ext-lifecycle.cjs remove "$@"
    refresh
    ;;
  *) fail 'Usage: ext.sh <add|update|list|remove>' ;;
esac
