#!/usr/bin/env bash
# Glue steps of the `fyso-dev-task` workflow (PLAN §7). Dagu runs the worktree
# and the coding agent with built-in actions; this script does the git checks
# around them. It always runs from the main checkout, so an agent cannot change
# the checks it is judged by. Env from the workflow: WT (worktree path), TASK,
# BRANCH, BASE, PROVIDER, DAG_RUN_ID.
#   dev-task.sh prepare   validate params, print the branch name (output)
#   dev-task.sh gate      stage everything; fail if the agent changed nothing
#   dev-task.sh check     project checks on the staged change
#   dev-task.sh commit    commit on the branch
#   dev-task.sh publish   push + PR only when requested; print the RESULT JSON
#   dev-task.sh cleanup   on failure: preserve the worktree for inspection
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_ROOT FYSO_DATA WT
# Never operate on an arbitrary path supplied by a caller.
case "$WT" in "$FYSO_DATA"/worktrees/*) ;; *) fail "WT must be inside FYSO_DATA/worktrees" ;; esac
[ "$WT" != "$FYSO_ROOT" ] || fail "WT must not be the project checkout"

wt() { git -C "$WT" "$@"; }
branch_of_wt() { wt branch --show-current; }

case "${1:-}" in
  gate|check|commit|publish)
    actual=$(branch_of_wt)
    expected="${BRANCH:-builder/$DAG_RUN_ID}"
    [ "$actual" = "$expected" ] || fail "candidate branch changed unexpectedly"
    case "$actual" in main|master|"$BASE") fail "refusing to modify a base branch" ;; esac
    ;;
esac

case "${1:-}" in
  prepare)
    [ -n "${TASK:-}" ] || fail "TASK is empty: describe the change to make"
    case "${PROVIDER:-}" in claude|codex) ;; *) fail "PROVIDER must be claude or codex (got '${PROVIDER:-}')" ;; esac
    case "${PUBLISH:-false}" in true|false) ;; *) fail "PUBLISH must be true or false" ;; esac
    git check-ref-format --branch "$BASE" >/dev/null || fail "invalid base branch"
    # Native identifiers become dedicated Dagu outputs; never parse TASK to correlate.
    for key in SOURCE_THREAD SOURCE_TURN; do
      value="${!key:-}"
      case "$value" in *[!a-zA-Z0-9_-]*) fail "$key contains invalid identifier characters" ;; esac
    done
    branch="${BRANCH:-}"
    [ -n "$branch" ] || branch="builder/$DAG_RUN_ID"
    case "$branch" in main|master|"$BASE") fail "choose a feature branch" ;; esac
    [ ! -e "$WT" ] || fail "worktree path already exists"
    git check-ref-format --branch "$branch" >/dev/null || fail "invalid branch name: $branch"
    git rev-parse --verify -q "refs/heads/$BASE" >/dev/null || fail "base branch '$BASE' does not exist"
    ! git rev-parse --verify -q "refs/heads/$branch" >/dev/null || fail "branch '$branch' already exists"
    mkdir -p "$(dirname "$WT")"
    printf 'branch=%s\n' "$branch" >> "$DAGU_OUTPUT_FILE"
    echo "branch $branch from $BASE, worktree $WT"
    ;;
  gate)
    # A denied permission still exits 0 (spike `harness`), so check the result.
    wt add -A
    n=$(wt diff --cached --name-only | wc -l | tr -d ' ')
    if [ "$n" -eq 0 ]; then
      echo "error: the agent changed nothing. Its answer:" >&2
      printf '%s\n' "${AGENT:-(none)}" >&2
      exit 1
    fi
    wt diff --cached --stat
    printf 'changed=%s\n' "$n" >> "$DAGU_OUTPUT_FILE"
    ;;
  check)
    candidate=$(wt write-tree)
    (cd "$WT" && "$FYSO_ROOT/framework/scripts/check-paths.sh")
    wt diff --cached --check
    (cd "$WT" && gitleaks git --staged --no-banner --redact .)
    # Optional project-owned verification, run against the candidate checkout.
    if [ -x "$FYSO_ROOT/project/check.sh" ]; then
      (cd "$WT" && "$FYSO_ROOT/project/check.sh")
    fi
    # Checks must not silently alter the candidate after staging.
    [ "$(wt write-tree)" = "$candidate" ] || fail "checks changed the staged candidate"
    wt diff --exit-code
    [ -z "$(wt ls-files --others --exclude-standard)" ] || fail "checks created unstaged files"
    echo "checks passed"
    ;;
  commit)
    title=$(printf '%s\n' "$TASK" | head -n1 | cut -c1-72)
    wt commit -q -m "$title" -m "$TASK" -m "Built by fyso-dev-task ($PROVIDER), run $DAG_RUN_ID."
    printf 'commit=%s\n' "$(wt rev-parse HEAD)" >> "$DAGU_OUTPUT_FILE"
    echo "committed $(wt rev-parse --short HEAD) on $(branch_of_wt)"
    ;;
  publish)
    branch=$(branch_of_wt)
    commit=$(wt rev-parse HEAD)
    changed=$(wt diff --name-only "$BASE...HEAD" | wc -l | tr -d ' ')
    pr=""
    if [ "${PUBLISH:-false}" = true ]; then
      command -v gh >/dev/null || fail "gh is required to publish"
      gh auth status >/dev/null 2>&1 || fail "gh is not authenticated"
      wt remote get-url origin >/dev/null || fail "origin is required to publish"
      wt push -q -u origin "$branch"
      body=$(mktemp "${TMPDIR:-/tmp}/fyso-dev-task.XXXXXXXX"); trap 'rm -f "$body"' EXIT
      wt log -1 --format=%b > "$body"
      pr=$(cd "$WT" && gh pr create --base "$BASE" --head "$branch" \
        --title "$(git log -1 --format=%s)" --body-file "$body")
      echo "pull request: $pr" >&2
    else
      echo "PUBLISH=false: the branch $branch stays local" >&2
    fi
    node -e 'const [b,c,n,p]=process.argv.slice(1);const r={branch:b,commit:c,changedFiles:+n};if(p)r.pr=p;console.log(JSON.stringify(r))' \
      "$branch" "$commit" "$changed" "$pr"
    ;;
  cleanup)
    # Preserve failed runs for inspection and recovery, including uncommitted work.
    [ ! -d "$WT" ] || echo "run failed; worktree preserved at $WT" >&2
    ;;
  *) fail "usage: dev-task.sh <prepare|gate|check|commit|publish|cleanup>" ;;
esac
