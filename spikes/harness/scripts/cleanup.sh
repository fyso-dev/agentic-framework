#!/bin/sh
# Remove the throwaway worktrees and branches created by dev-task-mini / failure-probes.
set -eu
WT="$(git rev-parse --show-toplevel)"
git -C "$WT" worktree list --porcelain | awk '/^worktree /{print $2}' | grep "^$WT/.data/wt/" | while read -r p; do
  git -C "$WT" worktree remove --force "$p" && echo "removed $p"
done
git -C "$WT" for-each-ref --format='%(refname:short)' 'refs/heads/spike/harness-tmp-*' | while read -r b; do
  git -C "$WT" branch -D "$b"
done
git -C "$WT" worktree prune
