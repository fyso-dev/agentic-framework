#!/usr/bin/env bash
# Live check of D55 on generated projects: publisher (not running) -> client (running stack).
# Works in .data/dist-check (gitignored) with its own age keys; never touches the user's key or
# services. Port blocks 29700 (client, started and left running) and 29720 (publisher, never started).
# Run from the repo, with the branch committed:
#   mise exec aqua:FiloSottile/age@1.3.2 aqua:getsops/sops@3.13.3 npm:openmausbot@0.1.141 core:node@24.15.0 -- \
#     bash artifacts/delivery-evidence/distribution/live-e2e.sh
set -euo pipefail
TEMPLATE=$(cd "$(dirname "$0")/../../.." && pwd)
S="$TEMPLATE/.data/dist-check"; mkdir -p "$S"; cd "$S"
step() { printf '\n=== %s\n' "$*"; }
copier() { uvx --from copier==9.19.1 copier "$@"; }

if [ -d cli ] && [ -f cli/mise.toml ]; then (cd cli && MISE_SOPS_AGE_KEY_FILE="$S/keys/cli.txt" mise run down >/dev/null 2>&1 || true); fi
rm -rf pub cli dist.git keys; mkdir keys
printf 'live-check-password-123\n' > keys/password
age-keygen -o keys/pub.txt 2>/dev/null; age-keygen -o keys/cli.txt 2>/dev/null
git init -q --bare -b main dist.git

init() {  # init <dir> <port> <key>
  copier copy --trust --defaults --vcs-ref HEAD -d "project_name=dist-$1" -d "port_base=$2" "$TEMPLATE" "$1" >/dev/null
  # A real project records the GitHub source; the fixture's local path would fail check-paths.
  sed -i '' "s|^_src_path: .*|_src_path: gh:fyso-dev/agentic-framework|" "$1/.copier-answers.yml"
  (cd "$1" && git init -q -b main && git add -A && git commit -q -m init \
    && export MISE_SOPS_AGE_KEY_FILE="$S/keys/$3.txt" SOPS_AGE_KEY_FILE="$S/keys/$3.txt" FYSO_INITIAL_PASSWORD_FILE="$S/keys/password" \
    && mise trust -q && MISE_YES=1 mise install -q && mise run -q setup >/dev/null && git add -A && git commit -q -m setup)
}
step "generate publisher (29720) and client (29700)"
init pub 29720 pub
init cli 29700 cli

cli() { (cd "$S/cli" && export MISE_SOPS_AGE_KEY_FILE="$S/keys/cli.txt" SOPS_AGE_KEY_FILE="$S/keys/cli.txt" && mise run -q "$@"); }
pub() { (cd "$S/pub" && export MISE_SOPS_AGE_KEY_FILE="$S/keys/pub.txt" SOPS_AGE_KEY_FILE="$S/keys/pub.txt" && mise run -q "$@"); }

step "client: start the stack"
cli up
client_key=$(cli dist:key | tail -1)

step "publisher: prepare v1 (wiki, MausBot memory, a secret for the client)"
(cd pub
  mkdir -p project/wiki state/memory/MausBot
  printf '# Acme\n\nPrices v1.\n' > project/wiki/acme.md
  printf -- '- Acme sells to retailers.\n' > state/memory/MausBot/MEMORY.md
  printf 'repo: %s\nsecrets: [ACME_API_TOKEN]\nrecipients: [%s]\n' "../dist.git" "$client_key" > project/distribution.yaml
  export SOPS_AGE_KEY_FILE="$S/keys/pub.txt"
  sops set secrets.enc.yaml '["ACME_API_TOKEN"]' '"acme-token-1"'
  git add -A && git commit -q -m "acme v1")
pub dist:publish

step "client: dist:add (live)"
cli dist:add ../dist.git
cli dist:status

step "client: MausBot learns something live; publisher prepares v2"
cd "$S/cli"; set -a; eval "$(MISE_SOPS_AGE_KEY_FILE="$S/keys/cli.txt" mise env -s bash 2>/dev/null)"; set +a
id=$(openmausbot bots --json --port "$FYSO_OMB_PORT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).bots.find(b=>b.name==="MausBot").id))')
live="$FYSO_DATA/omb/workspaces/$id/MEMORY.md"
echo "live memory after add:"; cat "$live"
printf -- '- Client fact: the warehouse is in Rosario.\n' >> "$live"
cd "$S/pub"
printf '# Acme\n\nPrices v2.\n' > project/wiki/acme.md
printf -- '- Acme sells to retailers.\n- Publisher fact: invoices go out on Mondays.\n' > state/memory/MausBot/MEMORY.md
git add -A && git commit -q -m "acme v2"
cd "$S"
pub dist:publish
cli dist:status

step "client: dist:update through the Dagu workflow"
cd "$S/cli"
run=$(curl -fsS -u "$FYSO_ADMIN_USER:$FYSO_ADMIN_PASSWORD" -H 'Content-Type: application/json' -d '{}' \
  "http://127.0.0.1:$FYSO_DAGU_PORT/api/v1/dags/fyso-dist-update/enqueue" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).dagRunId))')
echo "dag run $run"
for _ in $(seq 1 90); do
  st=$(curl -fsS -u "$FYSO_ADMIN_USER:$FYSO_ADMIN_PASSWORD" "http://127.0.0.1:$FYSO_DAGU_PORT/api/v1/dag-runs/fyso-dist-update/$run" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log((r.dagRunDetails||r).statusLabel||"")})')
  case $st in succeeded|failed|aborted) break ;; esac; sleep 2
done
echo "dag status: $st"
echo "--- live memory after update:"; cat "$live"
echo "--- wiki:"; cat project/wiki/acme.md
echo "--- secret:"; SOPS_AGE_KEY_FILE="$S/keys/cli.txt" sops decrypt --extract '["ACME_API_TOKEN"]' secrets.enc.yaml; echo
echo "--- git log:"; git log --format='%s' -6
echo "--- status:"; git status --short | head
cd "$S"
step "client: doctor"
cli doctor
