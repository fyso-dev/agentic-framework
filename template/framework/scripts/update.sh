#!/usr/bin/env bash
# Update this project to a newer framework revision (fyso-update). Prints JSON.
# REF: a tag, branch or commit of the template (default: Copier's latest tag,
# or HEAD when the template has none). SRC: another Copier source for this run
# only, such as a local clone when the host cannot read the template repo; the
# answers file keeps its own _src_path.
# A running project always has uncommitted state (bot memory), and Copier
# refuses to update a dirty tree: the update runs in a clean worktree of HEAD,
# is committed there as one commit and fast-forwarded into the project.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
ref=${REF:-}; src=${SRC:-}
[[ -z $ref || $ref =~ ^[A-Za-z0-9._/-]{1,100}$ ]] || fail "REF must be a tag, branch or commit"
answers=.copier-answers.yml
answer() { sed -n "s/^$1: //p" "$2"; }
from=$(answer _commit "$answers"); origin=$(answer _src_path "$answers")
base=$(git rev-parse HEAD)

wt=$(mktemp -d)
git worktree add -q --detach "$wt" HEAD >&2
trap 'git worktree remove --force "$wt" >/dev/null 2>&1 || true' EXIT
cd "$wt"
if [ -n "$src" ]; then
  # Copier reads the source from the answers file and needs a clean tree.
  sed -i.bak "s#^_src_path: .*#_src_path: $src#" "$answers" && rm -f "$answers.bak"
  git commit -q -m "tmp: template source for this update" -- "$answers" >&2
fi
uvx --from copier==9.19.1 copier update --trust --defaults --skip-answered ${ref:+--vcs-ref "$ref"} >&2
if [ -n "$src" ]; then
  sed -i.bak "s#^_src_path: .*#_src_path: $origin#" "$answers" && rm -f "$answers.bak"
fi
conflicts=$( { find . -name '*.rej' -not -path './.git/*'; \
  grep -rIlE '^(<<<<<<<|>>>>>>>) ' --exclude-dir=.git --exclude-dir=node_modules . || true; } | sort -u)
[ -z "$conflicts" ] || fail "the update conflicts with local changes; nothing was applied: $(echo $conflicts)"
to=$(answer _commit "$answers")
git reset -q --soft "$base"
git add -A
if git diff --cached --quiet; then
  node -e 'console.log(JSON.stringify({from:process.argv[1],to:process.argv[2],commit:null,changed:false}))' "$from" "$to"
  exit 0
fi
git commit -q -m "framework: update ${from} -> ${to}" >&2
commit=$(git rev-parse HEAD)
cd - >/dev/null
git merge -q --ff-only "$commit" >&2 \
  || fail "uncommitted changes in framework files block the update; commit or discard them"

# Tools, generated config and the new process and route fragments. Dagu itself is
# not restarted here (it runs this workflow): 'mise run down && mise run up' applies
# changes to the framework's own processes.
MISE_YES=1 mise install >&2
node framework/scripts/mcp-config.cjs >&2
node framework/scripts/panel-data.cjs config >&2
if stack_running; then
  pc project update >&2
  pc process restart caddy >&2
fi
node -e 'console.log(JSON.stringify({from:process.argv[1],to:process.argv[2],commit:process.argv[3],changed:true}))' \
  "$from" "$to" "$(git rev-parse --short HEAD)"
