#!/usr/bin/env bash
# Snapshot steps, run by the `fyso-snapshot` workflow (PLAN §6):
#   snapshot.sh bots     export the running bots    -> state/bots/team.yaml
#   snapshot.sh memory   copy each bot's memory     -> state/memory/<bot name>/
#   snapshot.sh commit   scan with gitleaks, commit (and push if a remote exists)
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_ROOT FYSO_DATA FYSO_OMB_PORT
omb() { openmausbot "$@" --port "$FYSO_OMB_PORT"; }
paths=(state project/workflows project/wiki)

case "${1:-}" in
  bots)
    node framework/scripts/export-bots.cjs
    echo "bots exported"
    ;;
  memory)
    omb bots --json | node -e '
      let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
        for (const b of JSON.parse(s).bots) console.log(`${b.id}\t${b.name}`);
      })' | while IFS=$'\t' read -r id name; do
      src="$FYSO_DATA/omb/workspaces/$id"
      dst="state/memory/$name"
      [ -d "$src" ] || continue
      mkdir -p "$dst"
      [ -f "$src/MEMORY.md" ] && cp "$src/MEMORY.md" "$dst/MEMORY.md"
      [ -d "$src/memory" ] && rsync -a --delete "$src/memory/" "$dst/memory/"
      echo "memory saved: $name"
    done
    node framework/scripts/portable-state.cjs state/memory
    ;;
  commit)
    git add -A -- "${paths[@]}"
    if git diff --cached --quiet -- "${paths[@]}"; then
      node framework/scripts/bot-versioning.cjs
      echo "no changes"; exit 0
    fi
    if ! gitleaks git --staged --no-banner --redact . >&2 || ! framework/scripts/check-paths.sh >&2; then
      git reset -q -- "${paths[@]}"
      fail "snapshot checks failed; nothing was committed (see the log above)"
    fi
    git commit -q -m "snapshot: $(date -u +%Y-%m-%dT%H:%MZ)" -- "${paths[@]}"
    if [ -n "$(git remote)" ]; then git push -q || echo "warning: push failed; the commit stays local" >&2; fi
    node framework/scripts/bot-versioning.cjs
    echo "committed $(git rev-parse --short HEAD)"
    ;;
  *) fail "usage: snapshot.sh <bots|memory|commit>" ;;
esac
