#!/usr/bin/env bash
# Project distributions (D55, docs/distribution.md): one project publishes its configuration,
# documents and bot memory as a versioned Copier template; other projects install it and
# update from it. The distribution's files win; delivered memory merges with local memory.
#   dist.sh publish [version]       publisher: export committed files to project/distribution.yaml's repo
#   dist.sh add <repo> [version]    client: install a distribution
#   dist.sh update [version]        client: fetch, merge-memory, apply (fyso-dist-update runs these steps)
#   dist.sh status | key
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_ROOT FYSO_DATA
copier() { uvx --from copier==9.19.1 copier "$@"; }
dist() { node framework/scripts/dist.cjs "$@"; }
answers=.copier-answers.dist.yml
work="$FYSO_DATA/dist"
action=${1:-}; shift || true

# Bots and memory are live in OMB once the project has started; before the first start,
# git is enough because `up` restores both from it (restore.sh).
live() {
  stack_running && return 0
  [ ! -f "$FYSO_DATA/omb/.fyso-restored" ] || fail "start the project first (mise run up): its bots and memory are live in OpenMausBot"
  return 1
}

fetch() {  # fetch <add|update> [repo] [version]
  local mode=$1 repo=${2:-} version=${3:-}
  mkdir -p "$work"
  if live; then
    # Record what the bots learned before the distribution replaces their configuration.
    framework/scripts/snapshot.sh bots && framework/scripts/snapshot.sh memory && framework/scripts/snapshot.sh commit
  fi
  git rev-parse -q --verify HEAD > "$work/base" || : > "$work/base"
  # The distribution wins over local edits; keep uncommitted ones as a patch, never lost.
  if [ -s "$work/base" ] && [ -n "$(git status --porcelain -- project state extensions)" ]; then
    patch="$work/local-$(date -u +%Y%m%dT%H%M%SZ).patch"
    git diff HEAD -- project state extensions > "$patch"
    echo "local changes saved to ${patch#"$FYSO_ROOT"/}"
  fi
  if [ "$mode" = add ]; then
    copier copy --trust --defaults --overwrite ${version:+--vcs-ref "$version"} "$repo" .
  else
    copier recopy --trust --force --answers-file "$answers" ${version:+--vcs-ref "$version"} .
  fi
  dist prune "$(cat "$work/base")"
  dist secrets
}

merge_memory() {
  [ -f "$work/base" ] || fail "run 'dist.sh fetch' first"
  dist merge-memory "$(cat "$work/base")" > "$work/memory-bots"
  while IFS= read -r bot; do echo "memory merged: $bot"; done < "$work/memory-bots"
}

apply() {
  local file id name
  for file in .config/mise/conf.d/ext-*.toml; do [ ! -f "$file" ] || mise trust -q "$file"; done
  if live; then
    require_env FYSO_OMB_PORT
    MISE_YES=1 mise install >&2
    pc project update >&2
    pc process restart caddy >&2
    node framework/scripts/managed-mcp.cjs
    # Same source as restore.sh: the snapshot is the most complete picture of the bots.
    src=project/bots/team.yaml; [ ! -s state/bots/team.yaml ] || src=state/bots/team.yaml
    framework/scripts/bots.sh apply "$src"
    node framework/scripts/app-access.cjs restore
    node framework/scripts/connector-preferences.cjs restore
    framework/scripts/connect-extensions.sh
    if [ -s "$work/memory-bots" ]; then
      openmausbot bots --json --port "$FYSO_OMB_PORT" | node -e '
        let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
          for (const b of JSON.parse(s).bots) console.log(`${b.id}\t${b.name}`);
        })' | while IFS=$'\t' read -r id name; do
        grep -qxF -- "$name" "$work/memory-bots" || continue
        dst="$FYSO_DATA/omb/workspaces/$id"; saved="state/memory/$name"
        mkdir -p "$dst"
        [ ! -f "$saved/MEMORY.md" ] || cp "$saved/MEMORY.md" "$dst/MEMORY.md"
        [ ! -d "$saved/memory" ] || rsync -a "$saved/memory/" "$dst/memory/"
        echo "memory loaded: $name"
      done
    fi
  else
    echo "Bots and memory load on the first 'mise run up'."
  fi
  if [ -f mise.toml ]; then
    # Re-enter mise so variables of newly delivered extensions reach the generated files.
    mise exec -- node framework/scripts/mcp-config.cjs
    mise exec -- node framework/scripts/panel-data.cjs config
  fi
  commit
}

commit() {
  local paths=() path version
  shopt -s nullglob
  for path in project state extensions .config/mise/conf.d secrets.enc.yaml "$answers" .copier-answers.ext-*.yml; do
    if [ -e "$path" ] || git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then paths+=("$path"); fi
  done
  shopt -u nullglob
  git add -A -- "${paths[@]}"
  version=$(node -e 'console.log(require("./framework/scripts/extensions.cjs").read(process.argv[1])._commit||"")' "$answers")
  if git diff --cached --quiet; then echo "already at $version"; return; fi
  git commit -q -m "dist: $version" -m "Installed from $(node -e 'console.log(require("./framework/scripts/extensions.cjs").read(process.argv[1])._src_path||"")' "$answers")."
  echo "distribution $version installed ($(git rev-parse --short HEAD))"
}

case "$action" in
  publish) dist publish "$@" ;;
  add)
    [ "$#" -gt 0 ] || fail 'Usage: mise run dist:add <repo> [version]'
    [ ! -f "$answers" ] || fail "a distribution is already installed; use 'mise run dist:update'"
    repo=$1
    case $repo in /*|"~"/*|./*|../*)
      printf 'warning: %s is a path of this machine; it is saved in %s and fails check-paths (snapshots). Use the Git URL.\n' "$repo" "$answers" >&2 ;;
    esac
    fetch add "$repo" "${2:-}"; merge_memory; apply
    ;;
  update)
    [ -f "$answers" ] || fail "no distribution installed; use 'mise run dist:add <repo>'"
    fetch update "" "${1:-${VERSION:-}}"; merge_memory; apply
    ;;
  # The steps of fyso-dist-update (Dagu passes VERSION as an env var).
  fetch)
    [ -f "$answers" ] || fail "no distribution installed; use 'mise run dist:add <repo>'"
    fetch update "" "${1:-${VERSION:-}}"
    ;;
  merge-memory) merge_memory ;;
  apply) apply ;;
  status) dist status ;;
  key)
    key_file="${SOPS_AGE_KEY_FILE:-${MISE_SOPS_AGE_KEY_FILE:-$HOME/.config/mise/age.txt}}"
    [ -f "$key_file" ] || fail "no age key yet; run 'mise run setup'"
    echo "Public key of this installation (give it to the publisher to receive secrets):"
    age-keygen -y "$key_file"
    ;;
  *) fail 'Usage: dist.sh <publish|add|update|status|key>' ;;
esac
