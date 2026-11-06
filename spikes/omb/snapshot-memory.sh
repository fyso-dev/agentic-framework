#!/usr/bin/env bash
# snapshot-memory.sh DATA_DIR OUT_DIR : copy each bot's MEMORY.md + memory/ to OUT_DIR/<bot-name>/ (id->name from `bots --json`).
set -euo pipefail
DATA="$1"; OUT="$2"; HERE="$(dirname "$0")"
"$HERE/omb" bots --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const b of JSON.parse(s).bots) console.log(b.id+"\t"+b.name)})' |
while IFS=$'\t' read -r id name; do
  src="$DATA/workspaces/$id"; [ -d "$src" ] || continue
  dst="$OUT/$name"; mkdir -p "$dst"
  [ -f "$src/MEMORY.md" ] && cp -p "$src/MEMORY.md" "$dst/"
  [ -d "$src/memory" ] && cp -Rp "$src/memory" "$dst/"
  echo "snapshot $name <- $id"
done
