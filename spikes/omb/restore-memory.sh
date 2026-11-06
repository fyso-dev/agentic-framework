#!/usr/bin/env bash
# restore-memory.sh IN_DIR DATA_DIR : copy IN_DIR/<bot-name>/ into DATA_DIR/workspaces/<new botId>/ by name.
set -euo pipefail
IN="$1"; DATA="$2"; HERE="$(dirname "$0")"
"$HERE/omb" bots --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const b of JSON.parse(s).bots) console.log(b.id+"\t"+b.name)})' |
while IFS=$'\t' read -r id name; do
  src="$IN/$name"; [ -d "$src" ] || { echo "skip $name (no snapshot)"; continue; }
  dst="$DATA/workspaces/$id"; mkdir -p "$dst"; chmod 700 "$dst"
  cp -Rp "$src/." "$dst/"
  echo "restore $name -> $id"
done
