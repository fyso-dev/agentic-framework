#!/usr/bin/env bash
# Rebuild the bots on a fresh OpenMausBot data dir (PLAN §6): apply the bots,
# then put each bot's saved memory back, matched by bot name.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_ROOT FYSO_DATA FYSO_OMB_PORT
omb() { openmausbot "$@" --port "$FYSO_OMB_PORT"; }

# The last snapshot is the most complete picture of the bots; without one, use the project file.
src=project/bots/team.yaml
[ -s state/bots/team.yaml ] && src=state/bots/team.yaml
echo "Applying bots from $src"
framework/scripts/bots.sh apply "$src"

omb bots --json | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    for (const b of JSON.parse(s).bots) console.log(`${b.id}\t${b.name}`);
  })' | while IFS=$'\t' read -r id name; do
  saved="state/memory/$name"
  [ -d "$saved" ] || continue
  dst="$FYSO_DATA/omb/workspaces/$id"
  mkdir -p "$dst"
  [ -f "$saved/MEMORY.md" ] && cp "$saved/MEMORY.md" "$dst/MEMORY.md"
  [ -d "$saved/memory" ] && rsync -a "$saved/memory/" "$dst/memory/"
  echo "memory restored: $name"
done
