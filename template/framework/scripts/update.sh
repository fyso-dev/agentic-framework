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
# Absolute: both scripts run Copier from a clean worktree of an older commit,
# which may not contain the GitHub credential helper yet.
auth="$(cd "$(dirname "$0")" && pwd)/github-auth.cjs"
ref=${REF:-}; src=${SRC:-}
[[ -z $ref || $ref =~ ^[A-Za-z0-9._/-]{1,100}$ ]] || fail "REF must be a tag, branch or commit"
# Inside the sandbox (a Dagu step, D93) Copier cannot run: git init and clone write
# .git/config and older templates hold .mcp.json, both forbidden to confined processes.
# The project's unconfined connector service runs this same script instead.
if [[ -n ${FYSO_CONFINED:-} ]]; then
  [[ -z $src ]] || fail "SRC needs a terminal: the update service only uses the project's own template source"
  exec node - "$(connector_setup_socket)" "$ref" <<'JS'
const http = require('node:http');
const [socketPath, ref] = process.argv.slice(2);
const auth = 'Basic ' + Buffer.from(`${process.env.FYSO_ADMIN_USER}:${process.env.FYSO_ADMIN_PASSWORD}`).toString('base64');
const request = http.request({socketPath, path:'/internal/framework-update', method:'POST',
  headers:{'Content-Type':'application/json', Authorization:auth}}, response => {
  let body = ''; response.setEncoding('utf8');
  response.on('data', chunk => { body += chunk; });
  response.on('end', () => {
    let data = {}; try { data = JSON.parse(body); } catch {}
    if (response.statusCode === 200) { process.stdout.write(`${JSON.stringify(data)}\n`); return; }
    process.stderr.write(`error: update failed (${data.error || response.statusCode})\n${data.detail || ''}\n`);
    process.exit(1);
  });
});
request.on('error', error => { process.stderr.write(`error: the update service is unavailable (${error.code || error.message}); run the update from a terminal\n`); process.exit(1); });
request.end(JSON.stringify({ref}));
JS
fi
answers=.copier-answers.yml
answer() {
  node - "$@" <<'JS'
const fs = require('node:fs');
const {createRequire} = require('node:module');
const {execFileSync} = require('node:child_process');
const yaml = createRequire(fs.realpathSync(execFileSync('which', ['yaml'], {encoding:'utf8'}).trim()))('yaml');
const [key, file, value] = process.argv.slice(2);
const answers = yaml.parseDocument(fs.readFileSync(file, 'utf8'));
if (answers.errors.length) throw answers.errors[0];
if (value === undefined) process.stdout.write(String(answers.get(key) ?? ''));
else {
  answers.set(key, value);
  fs.writeFileSync(file, answers.toString());
}
JS
}
from=$(answer _commit "$answers"); origin=$(answer _src_path "$answers")
# Resolve both saved and override local sources from the project, before cd.
src=${src:-$origin}
if [[ -d $src ]]; then src=$(cd "$src" && pwd); fi
base=$(git rev-parse HEAD)

wt=$(mktemp -d "${TMPDIR:-/tmp}/fyso-update.XXXXXXXX")
git worktree add -q --detach "$wt" HEAD >&2
trap 'git worktree remove --force "$wt" >/dev/null 2>&1 || true' EXIT
cd "$wt"
if [[ $src != "$origin" ]]; then
  # Copier reads the source from the answers file and needs a clean tree.
  answer _src_path "$answers" "$src"
  git commit -q -m "tmp: template source for this update" -- "$answers" >&2
fi
node "$auth" -- uvx --python 3.12.7 --from copier==9.19.1 copier update --trust --defaults --skip-answered ${ref:+--vcs-ref "$ref"} >&2
if [[ $src != "$origin" ]]; then
  answer _src_path "$answers" "$origin"
fi
# Copier writes conflict markers only into files it changed: scan those, never project
# content that merely quotes such a line (an email reply, a diff in a document).
conflicts=$( { find . -name '*.rej' -not -path './.git/*'; \
  git ls-files -z --modified --others --exclude-standard \
    | xargs -0 grep -IlE '^(<<<<<<<|>>>>>>>) ' /dev/null 2>/dev/null || true; } | sort -u)
[[ -z $conflicts ]] || fail "the update conflicts with local changes; nothing was applied: $(echo $conflicts)"
to=$(answer _commit "$answers")
git reset -q --soft "$base"
git add -A
commit=
if ! git diff --cached --quiet; then
  git commit -q -m "framework: update ${from} -> ${to}" >&2
  commit=$(git rev-parse HEAD)
fi
cd - >/dev/null
if [[ -n $commit ]]; then
  git merge -q --ff-only "$commit" >&2 \
    || fail "uncommitted changes in framework files block the update; commit or discard them"
  commit=$(git rev-parse --short HEAD)
fi

# Tools, generated config and the new process and route fragments. Dagu itself is
# not restarted here (it runs this workflow): 'mise run down && mise run up' applies
# changes to the framework's own processes.
# Always activate, including no-change retries after an earlier activation failure.
install_tools
node framework/scripts/mcp-config.cjs >&2
node framework/scripts/panel-data.cjs config >&2
if stack_running; then
  pc project update >&2
  pc process restart caddy >&2
fi
node -e 'console.log(JSON.stringify({from:process.argv[1],to:process.argv[2],commit:process.argv[3]||null,changed:!!process.argv[3]}))' \
  "$from" "$to" "$commit"
