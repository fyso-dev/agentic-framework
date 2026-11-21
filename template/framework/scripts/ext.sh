#!/usr/bin/env bash
# Lifecycle stays with Copier; only removal, catalog lookup and panel installs need glue.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
# Absolute: both scripts run Copier from a clean worktree of an older commit,
# which may not contain the GitHub credential helper yet.
auth="$(cd "$(dirname "$0")" && pwd)/github-auth.cjs"
action=${1:-}; shift || true
copier() { node "$auth" -- uvx --python 3.12.7 --from copier==9.19.1 copier "$@"; }
refresh() {
  local file
  for file in .config/mise/conf.d/ext-*.toml; do
    [ ! -f "$file" ] || mise trust "$file"
  done
  # Re-enter mise so newly installed extension variables reach panel generation.
  mise exec -- node framework/scripts/mcp-config.cjs
  mise exec -- node framework/scripts/panel-data.cjs config
}
# Load tools, processes and routes before a hook can contact its own service.
activate() {
  install_tools
  if stack_running; then
    pc project update >&2
    # The login authority reads app access at startup (D58); sessions survive the restart.
    pc process restart web-auth >&2
    pc process restart caddy >&2
    mise exec -- framework/scripts/connect-extensions.sh >&2
  fi
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
    [[ -n "${EXT_APPLY:-}" ]] || activate
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
    [[ -n "${EXT_APPLY:-}" ]] || activate
    ;;
  list) node framework/scripts/ext-lifecycle.cjs list ;;
  search) node framework/scripts/marketplace.cjs search "$@" ;;
  apply)
    # Panel install/upgrade (fyso-ext-install): one commit per change, then load
    # the new processes and routes into the running stack. Prints JSON.
    mode=${1:-${MODE:-}}; id=${2:-${ID:-}}
    [[ $mode =~ ^(add|update|remove)$ && $id =~ ^[a-z][a-z0-9-]{1,30}$ ]] || fail 'Usage: ext.sh apply <add|update|remove> <id>'
    answers=".copier-answers.ext-$id.yml"
    read_version() { node -e 'console.log(require("./framework/scripts/extensions.cjs").read(process.argv[1])._commit || "")' "$1"; }
    if [ "$mode" = remove ]; then
      # Panel uninstall (fyso-ext-remove): the same removal as `ext:remove`, then one
      # commit of only this extension's slots. Data in .data/ext/<id> and secrets stay.
      [ -e "$answers" ] || fail "$id is not installed"
      version=$(read_version "$answers")
      slots=("$answers" ".config/mise/conf.d/ext-$id.toml" "extensions/$id")
      while IFS= read -r file; do slots+=("$file"); done < <(node -e 'require("./framework/scripts/extensions.cjs").workflows(process.argv[1]).forEach(f=>console.log(f))' "$id")
      node framework/scripts/ext-lifecycle.cjs remove "$id" >&2
      refresh >&2
      tracked=(); for file in "${slots[@]}"; do [ -z "$(git ls-files -- "$file")" ] || tracked+=("$file"); done
      if [ "${#tracked[@]}" -gt 0 ]; then
        git add -A -- "${tracked[@]}" >&2
        git diff --cached --quiet -- "${tracked[@]}" || git commit -q -m "ext: remove $id ${version}" -- "${tracked[@]}" >&2
      fi
      # process-compose drops the processes of the removed fragment; Caddy and the login reload routes and access.
      activate
      node -e 'console.log(JSON.stringify({id:process.argv[1],mode:"remove",version:process.argv[2]||null,commit:process.argv[3]}))' \
        "$id" "$version" "$(git rev-parse --short HEAD)"
      exit 0
    fi
    changed=false
    if [ "$mode" = add ]; then
      changed=true
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
      from=$(read_version "$answers")
      # A running project always has uncommitted state (bot memory), and Copier refuses
      # to update a dirty tree. Upgrade in a clean worktree of HEAD, then fast-forward.
      wt=$(mktemp -d "${TMPDIR:-/tmp}/fyso-ext-update.XXXXXXXX")
      git worktree add -q --detach "$wt" HEAD >&2
      trap 'git worktree remove --force "$wt" >/dev/null 2>&1 || true' EXIT
      # A relative local source (../fyso-ext-foo) means the project root, not the worktree.
      src=$(node -e 'console.log(require("./framework/scripts/extensions.cjs").read(process.argv[1])._src_path)' "$answers")
      set_source() { node -e 'require("./framework/scripts/extensions.cjs").setSource(process.argv[1], process.argv[2])' "$1" "$2"; }
      if [[ $src == .* && -d $src ]]; then
        set_source "$wt/$answers" "$(cd "$src" && pwd)"
        git -C "$wt" commit -q -m "tmp: absolute extension source" -- "$answers" >&2
      fi
      # Update to the version the catalog offers (the panel showed it), as `add` does.
      # A source that is not the catalog's keeps Copier's choice: its newest release.
      ref=$(node framework/scripts/marketplace.cjs resolve "$id" 2>/dev/null) || ref=''
      if [ -n "$ref" ] && [ "${ref%%$'\t'*}" = "$src" ]; then ref=${ref#*$'\t'}; else ref=''; fi
      (cd "$wt" && copier update --trust --defaults --answers-file "$answers" ${ref:+--vcs-ref "$ref"} >&2)
      version=$(read_version "$wt/$answers")
      if [[ $src == .* && -d $src ]]; then
        set_source "$wt/$answers" "$src"
        git -C "$wt" reset -q --soft HEAD~1
      fi
      git -C "$wt" add -A >&2
      git -C "$wt" diff --cached --quiet || { git -C "$wt" commit -q -m "ext: update $id ${version}" >&2; changed=true; }
      git merge -q --ff-only "$(git -C "$wt" rev-parse HEAD)" >&2 \
        || fail "uncommitted changes in $id's files block the upgrade; commit or discard them"
      refresh >&2
    fi
    activate
    # `changed: false`: already up to date, nothing was committed; `commit` is then null.
    node -e 'const [id,mode,version,from,changed,commit]=process.argv.slice(1);console.log(JSON.stringify({id,mode,version:version||null,from:from||null,changed:changed==="true",commit:changed==="true"?commit:null}))' \
      "$id" "$mode" "$version" "${from:-}" "$changed" "$(git rev-parse --short HEAD)"
    ;;
  configured)
    # After the panel saved this extension's secrets (D50): restart its processes and run
    # its connect hook with the new values, refresh panel data, run its doctor. Prints JSON.
    id=${1:-}
    [[ $id =~ ^[a-z][a-z0-9-]{1,30}$ && -d extensions/$id ]] || fail 'Usage: ext.sh configured <id>'
    if stack_running; then
      if [ -f "extensions/$id/tinyauth.providers.yaml" ]; then
        pc process restart web-auth >&2
      fi
      if [ -f "extensions/$id/process.yaml" ]; then
        while IFS= read -r name; do
          [ -z "$name" ] || pc process restart "$name" >&2 || true
        done < <(node -e 'const p=require("./framework/scripts/extensions.cjs").read(process.argv[1]);console.log(Object.keys((p&&p.processes)||{}).join("\n"))' "extensions/$id/process.yaml")
      fi
      [ ! -f "extensions/$id/connect.sh" ] || framework/scripts/connect-extensions.sh >&2 || true
    fi
    node framework/scripts/panel-data.cjs config >&2
    missing=$(node -e 'console.log(JSON.stringify(require("./framework/scripts/extensions.cjs").missing(process.argv[1])))' "$id")
    check=none
    if [ -f "extensions/$id/doctor.sh" ]; then
      # Output stays out of the reply: a doctor may print account names or URLs.
      if framework/scripts/run-ext.sh "$id" -- bash "extensions/$id/doctor.sh" >/dev/null 2>&1; then check=ok; else check=failed; fi
    fi
    printf '{"missing":%s,"check":"%s"}\n' "$missing" "$check"
    ;;
  remove)
    reload_login=false
    if [[ ${1:-} =~ ^[a-z][a-z0-9-]{1,30}$ && -f extensions/$1/tinyauth.providers.yaml ]]; then
      reload_login=true
    fi
    node framework/scripts/ext-lifecycle.cjs remove "$@"
    refresh
    if [ "$reload_login" = true ] && stack_running; then
      pc process restart web-auth >&2
    fi
    ;;
  *) fail 'Usage: ext.sh <add|update|list|search|remove|apply|configured>' ;;
esac
