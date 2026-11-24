#!/usr/bin/env bash
# The department template is a valid omb-team/1 package, built by the framework's own
# validator: one teams: entry, five bots that ask before acting, no machine paths, and
# every skill file it names.
set -euo pipefail
command -v node >/dev/null || { echo "node missing: run mise install" >&2; exit 1; }
cd "${FYSO_ROOT:?}"
node -e '
  const t = require("./framework/scripts/team-template.cjs");
  const pkg = t.extensionPackage("pack-software-production", "produccion-software");
  // Same resolution as team-template.cjs: the yaml library ships with the pinned mise `yaml` CLI.
  const {createRequire} = require("node:module"), fs = require("node:fs"), {execFileSync} = require("node:child_process");
  const yaml = createRequire(fs.realpathSync(execFileSync("which", ["yaml"], {encoding: "utf8"}).trim()))("yaml");
  const team = yaml.parse(pkg.team);
  if (team.version !== 1) throw new Error("team.yaml: version must be 1");
  if (team.bots.length !== 5) throw new Error(`team.yaml: expected 5 bots, found ${team.bots.length}`);
  for (const bot of team.bots) {
    if (bot.approval !== "ask") throw new Error(`team.yaml: ${bot.name} must ask before acting`);
    if (!bot.soul || !bot.soul.trim()) throw new Error(`team.yaml: ${bot.name} has no soul`);
  }
  console.log(`software production department: ${pkg.departamento}, ${team.bots.length} bots, ${pkg.skills.length} skills`);
'

# GitHub Issues: an empty repository is an install that is not connected yet, not a failure.
# A configured one must be well formed and readable with the project's GitHub access.
github=extensions/pack-software-production/github.yaml
[[ -f $github ]] || { echo "github.yaml is missing" >&2; exit 1; }
repo=$(sed -n 's/^repo: "\(.*\)"$/\1/p' "$github")
if [[ -z $repo ]]; then
  echo "GitHub Issues: no repository set yet (edit $github, then run this check again)"
  exit 0
fi
[[ $repo =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "$github: repo must be owner/repo, got '$repo'" >&2; exit 1; }
node framework/scripts/github-auth.cjs check "gh:$repo"

