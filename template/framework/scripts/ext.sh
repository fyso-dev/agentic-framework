#!/usr/bin/env bash
# Lifecycle stays with Copier; only removal, catalog lookup and panel installs need glue.
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
    # `ext:add <id|src> [-- copier args]`. A bare id comes from the catalogs in
    # project/marketplaces.yaml, pinned to its latest tag (D31).
    [ "$#" -gt 0 ] || fail 'Usage: mise run ext:add <id|src> [-- copier args]'
    src=$1; shift
    [ "${1:-}" != -- ] || shift
    args=("$@")
    if [[ $src =~ ^[a-z][a-z0-9-]{1,30}$ ]] && [ ! -e "$src" ]; then
      line=$(node framework/scripts/marketplace.cjs resolve "$src") || exit 1
      src=${line%%$'\t'*}; ref=${line#*$'\t'}
      [[ " ${args[*]-} " == *" --vcs-ref "* ]] || [ -z "$ref" ] || args+=(--vcs-ref "$ref")
    fi
    # Copier saves the source in the answers file, which check-paths scans before every
    # snapshot: keep machine-specific paths out of it.
    case $src in "~"/*) src="$HOME/${src#"~/"}" ;; esac
    if [[ $src == /* ]]; then
      if [[ $src == "$PWD"/* ]]; then
        src=${src#"$PWD"/}
      else
        msg="$src is a path of this machine; it would be saved in .copier-answers.ext-*.yml and fail check-paths (snapshots). Publish the extension to git (gh:org/repo)."
        [ -z "${EXT_APPLY:-}" ] || fail "$msg"
        printf 'warning: %s\n' "$msg" >&2
      fi
    fi
    # First free port of the extension block, for templates that ask `extension_port`.
    if [[ " ${args[*]-} " != *"extension_port="* ]]; then
      used=" $(env | sed -n 's/^FYSO_EXT_[A-Z0-9_]*_PORT=//p' | tr '\n' ' ') "
      for port in $(seq $((FYSO_HTTP_PORT + 10)) $((FYSO_HTTP_PORT + 19))); do
        [[ $used == *" $port "* ]] || { args+=(-d "extension_port=$port"); break; }
      done
    fi
    copier copy --trust "$src" . ${args[@]+"${args[@]}"}
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
  search) node framework/scripts/marketplace.cjs search "$@" ;;
  apply)
    # Panel install/upgrade (fyso-ext-install): one commit per change, then load
    # the new processes and routes into the running stack. Prints JSON.
    mode=${1:-${MODE:-}}; id=${2:-${ID:-}}
    [[ $mode =~ ^(add|update)$ && $id =~ ^[a-z][a-z0-9-]{1,30}$ ]] || fail 'Usage: ext.sh apply <add|update> <id>'
    answers=".copier-answers.ext-$id.yml"
    read_version() { node -e 'console.log(require("./framework/scripts/extensions.cjs").read(process.argv[1])._commit || "")' "$1"; }
    if [ "$mode" = add ]; then
      [ ! -e "$answers" ] || fail "$id is already installed"
      EXT_APPLY=1 "$0" add "$id" -- --defaults >&2
      version=$(read_version "$answers")
      # Commit only this extension's slots (docs/extensions-contract.md §2), never other work.
      slots=("$answers" ".config/mise/conf.d/ext-$id.toml" "extensions/$id")
      while IFS= read -r file; do slots+=("$file"); done < <(node -e 'require("./framework/scripts/extensions.cjs").workflows(process.argv[1]).forEach(f=>console.log(f))' "$id")
      existing=(); for file in "${slots[@]}"; do [ ! -e "$file" ] || existing+=("$file"); done
      git add -- "${existing[@]}" >&2
      git diff --cached --quiet -- "${existing[@]}" || git commit -q -m "ext: add $id ${version}" -- "${existing[@]}" >&2
    else
      [ -e "$answers" ] || fail "$id is not installed"
      # A running project always has uncommitted state (bot memory), and Copier refuses
      # to update a dirty tree. Upgrade in a clean worktree of HEAD, then fast-forward.
      wt=$(mktemp -d)
      git worktree add -q --detach "$wt" HEAD >&2
      trap 'git worktree remove --force "$wt" >/dev/null 2>&1 || true' EXIT
      (cd "$wt" && copier update --trust --defaults --answers-file "$answers" >&2)
      version=$(read_version "$wt/$answers")
      git -C "$wt" add -A >&2
      git -C "$wt" diff --cached --quiet || git -C "$wt" commit -q -m "ext: update $id ${version}" >&2
      git merge -q --ff-only "$(git -C "$wt" rev-parse HEAD)" >&2 \
        || fail "uncommitted changes in $id's files block the upgrade; commit or discard them"
      refresh >&2
    fi
    MISE_YES=1 mise install >&2
    if stack_running; then
      pc project update >&2
      pc process restart caddy >&2
    fi
    node -e 'console.log(JSON.stringify({id:process.argv[1],mode:process.argv[2],version:process.argv[3]||null,commit:process.argv[4]}))' \
      "$id" "$mode" "$version" "$(git rev-parse --short HEAD)"
    ;;
  remove)
    node framework/scripts/ext-lifecycle.cjs remove "$@"
    refresh
    ;;
  *) fail 'Usage: ext.sh <add|update|list|search|remove|apply>' ;;
esac
