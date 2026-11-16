#!/bin/bash
# Fyso Installer for macOS (D35). The .app's executable.
#
# A friendly window (swiftDialog, bundled) shows each dependency installing. The work
# itself is a Dagu workflow (Resources/fyso-install.yaml) run with the Dagu CLI; this
# script maps each step's state to the window. Nothing of Dagu's UI is shown.
# Runs with macOS's bash 3.2 and a minimal PATH.
set -u

RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
DIALOG="$RES/Dialog.app/Contents/MacOS/Dialog"
WORK="$HOME/Library/Application Support/Fyso/installer"
LOG="$WORK/installer.log"
CMD="$WORK/dialog.cmd"
SOURCE="${FYSO_SOURCE:-gh:fyso-dev/agentic-framework}"   # overridable for tests
REF="${FYSO_REF:-main}"
DAGU_TOOL="aqua:dagucloud/dagu@2.24.0"
GH_TOOL="aqua:cli/cli@2.95.0"
# Apps start with a minimal PATH: take the person's login-shell PATH (Homebrew, npm, where
# claude/codex/mise live) instead of guessing install prefixes.
login_path=$("${SHELL:-/bin/zsh}" -lc 'printf %s "$PATH"' 2>/dev/null)
export PATH="$HOME/.local/bin:${login_path:-/usr/bin:/bin:/usr/sbin:/sbin}"
export MISE_YES=1
# The panel's look (framework/panel/src/styles.css, dark theme): its top bar as banner,
# --bg as background, white bold title, --mute message text.
STYLE=(--appearance dark --bannerimage "$RES/banner.png" --bannerheight 80 --background "$RES/background.png"
  --titlefont "colour=#ffffff,weight=bold,size=20,alignment=left" --messagefont "colour=#9c9ba5,size=14")

# UI copy comes from Resources/locales/<lang>.sh (es default, en), picked from macOS's first
# preferred language. t FORMAT ARGS… fills a printf format from those files.
lang=$(defaults read -g AppleLanguages 2>/dev/null | sed -n 's/^[^a-zA-Z]*\([a-zA-Z][a-zA-Z]\).*/\1/p' | head -1)
case ${FYSO_LANG:-$lang} in en*) UI_LANG=en ;; *) UI_LANG=es ;; esac
. "$RES/locales/$UI_LANG.sh"
t() { local f=$1; shift; printf "$f" "$@"; }

mkdir -p "$WORK"
# One installer at a time (they share the window's command file). A stale lock from a
# crashed run is taken over.
LOCK="$WORK/running.pid"
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK")" 2>/dev/null; then
  "$RES/Dialog.app/Contents/MacOS/Dialog" --title none --message "$(t "$L_BUSY")" --button1text "$B_OK" --width 480 --height 200
  exit 0
fi
echo $$ > "$LOCK"
cleanup() { rm -f "$LOCK" "${PASSWORD_FILE:-}"; [ -n "${DIALOG_PID:-}" ] && kill "$DIALOG_PID" 2>/dev/null; [ -n "${CONNECT_PID:-}" ] && kill "$CONNECT_PID" 2>/dev/null; true; }
trap cleanup EXIT
exec >>"$LOG" 2>&1
echo "=== $(date) Fyso Installer, source $SOURCE@$REF"

ui() { printf '%s\n' "$*" >> "$CMD"; }
item() { ui "listitem: index: $1, status: $2${3:+, statustext: $3}"; }   # wait|success|fail|error|pending
dialog_alive() { kill -0 "$DIALOG_PID" 2>/dev/null; }
fail() {   # index, short text, message for the person
  item "$1" fail "$2"; ui "progresstext: $P_FAILED"
  echo "failed: ${TITLES[$1]:-step $1}: $2"
  ui "message: $(t "$L_FAILED" "$3")"
  ui "button1text: $B_CLOSE"; ui "button1: enable"
  if [ "${FYSO_AUTO:-}" = 1 ]; then sleep 4; ui "quit:"; wait "$DIALOG_PID" 2>/dev/null; exit 1; fi
  wait "$DIALOG_PID" 2>/dev/null; open -e "$LOG"; exit 1
}

# ---------------------------------------------------------------- 0. Progress window, empty
# Opened first, empty, at the form's size and place; the form opens on top of it. Pressing
# "Instalar" closes the form and this window is already there: no gap between screens.
SIZE=(--width 620 --height 640 --position center)
: > "$CMD"
TITLES=("$T_APPLE" "$T_MISE" "$T_DAGU" "$T_GITHUB")
IDS=("" "" "" "")
while IFS=$'\t' read -r sid title; do IDS+=("$sid"); TITLES+=("$title"); done < "$RES/steps.$UI_LANG.tsv"
ENGINE_ITEM=${#TITLES[@]}; TITLES+=("$T_ENGINE_ANY")
"$DIALOG" "${STYLE[@]}" --title none --message " " --progress ${#TITLES[@]} --progresstext " " --commandfile "$CMD" \
  --button1text "$B_CANCEL" "${SIZE[@]}" --moveable &
DIALOG_PID=$!
sleep 1

# ---------------------------------------------------------------- 1. Welcome form
default_name=$DEFAULT_NAME
# FYSO_AUTO=1 (tests): skip the form, take FYSO_NAME / FYSO_FOLDER / FYSO_ENGINE, close at the end.
REGISTRY="$HOME/Library/Application Support/Fyso/projects.tsv"   # port<TAB>folder of installed projects
# swiftDialog splits field modifiers on commas: the port regex must not contain any.
# Port bases already taken, even by stopped projects: the registry, Fyso projects next to
# the chosen folder (installed by hand), and running stacks' sockets.
taken_ports() {
  [ -f "$REGISTRY" ] && while IFS=$'\t' read -r p d; do [ -d "$d" ] && echo "$p"; done < "$REGISTRY"
  for a in "$FOLDER"/*/.copier-answers.yml; do [ -f "$a" ] && sed -n 's/^port_base: *//p' "$a"; done
  for f in /tmp/fyso-*-*.sock; do [ -e "$f" ] && { f=${f##*-}; echo "${f%.sock}"; }; done
}
block_free() {   # $1: port base. Free = valid range, not taken by another project, nothing listening.
  [ "$1" -ge 1024 ] 2>/dev/null && [ $(($1 + 9)) -le 65535 ] || return 1
  case " $(taken_ports | tr '\n' ' ') " in *" $1 "*) return 1 ;; esac
  p=$1; while [ $p -lt $(($1+10)) ]; do lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1 && return 1; p=$((p+1)); done
}
first_free_block() { b=8400; while [ $b -lt 9900 ] && ! block_free $b; do b=$((b+10)); done; echo $b; }
short() { case $1 in "$HOME"/*) printf '~/%s' "${1#$HOME/}" ;; *) printf '%s' "$1" ;; esac; }
js() { local s; s=$(printf '%s' "$1" | tr -d '\000-\037'); s=${s//\\/\\\\}; printf '"%s"' "${s//\"/\\\"}"; }   # JSON string
# The person's own password, with a moderate policy: 12-72 bytes (what the login service's
# bcrypt accepts), no symbol rules, and not something trivially guessed. Prints the reason
# it is refused, or nothing. The value is never logged.
norm() { printf '%s' "$1" | iconv -f utf-8 -t ascii//TRANSLIT 2>/dev/null | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9'; }
password_problem() {   # password, user, project name
  local p=$1 bytes plain leet letters w rest
  bytes=$(printf '%s' "$p" | wc -c | tr -d ' ')
  [ "$bytes" -ge 12 ] || { printf '%s' "$PW_SHORT"; return; }
  [ "$bytes" -le 72 ] || { printf '%s' "$PW_LONG"; return; }
  [ "$(printf '%s' "$p" | fold -w1 | sort -u | wc -l | tr -d ' ')" -ge 5 ] || { printf '%s' "$PW_REPEATED"; return; }
  plain=$(norm "$p")
  # Symbols-only passwords have no letters or digits here: neither check applies to them.
  case $plain in ''|*[a-z]*) ;; *) printf '%s' "$PW_DIGITS"; return ;; esac
  # A keyboard or alphabet sequence, alone or with a few characters added (qwertyuiop12).
  for w in "$plain" "$(printf '%s' "$plain" | tr -d '0-9')" "$(printf '%s' "$plain" | tr -d 'a-z')"; do
    [ ${#w} -ge 6 ] && [ $(( ${#plain} - ${#w} )) -le 4 ] || continue
    case "01234567890123456789 98765432109876543210 abcdefghijklmnopqrstuvwxyz qwertyuiopasdfghjklzxcvbnm qwertzuiop azertyuiop 1qaz2wsx3edc4rfv5tgb6yhn7ujm" in
      *"$w"*) printf '%s' "$PW_SEQUENCE"; return ;;
    esac
  done
  # Common words, also written with digits for letters (p4ssw0rd), repeated or with digits
  # and symbols around them (Password2026!, adminadmin).
  leet=$(printf '%s' "$p" | tr 'A-Z@4310$57!' 'a-zaaeiossti' | tr -cd 'a-z')
  for letters in "$leet" "$(printf '%s' "$plain" | tr -d '0-9')"; do
    rest=$letters
    for w in password passwd contrasena clave admin administrador administrator root qwerty asdf zxcv \
             letmein welcome bienvenido iloveyou teamo secret secreto changeme cambiame fyso hola hello \
             monkey dragon football futbol abc xyz test prueba; do rest=${rest//$w/}; done
    # A common word with at most two letters left over (Passw0rd1 reads as "passwordi").
    [ ${#rest} -lt ${#letters} ] && [ ${#rest} -le 2 ] && { printf '%s' "$PW_COMMON"; return; }
  done
  for w in "$(norm "$2")" "$(norm "$3")"; do
    [ ${#w} -ge 4 ] && case " $plain $leet " in *"$w"*) printf '%s' "$PW_PERSONAL"; return ;; esac
  done
}
NAME=$default_name; FOLDER="$HOME/Fyso"; CHOICE="Claude Code"; ADMIN=admin; PASSWORD=""; PORT=""
if [ "${FYSO_AUTO:-}" = 1 ]; then
  NAME=${FYSO_NAME:-$NAME}; FOLDER=${FYSO_FOLDER:-$FOLDER}; CHOICE=${FYSO_ENGINE:-$CHOICE}
  ADMIN=${FYSO_ADMIN:-$ADMIN}; PASSWORD=${FYSO_PASSWORD:-$PASSWORD}; PORT=${FYSO_PORT:-$(first_free_block)}
  # Without FYSO_PASSWORD, setup generates a readable one (web-auth.md); a given one obeys the policy.
  if [ -n "$PASSWORD" ]; then problem=$(password_problem "$PASSWORD" "$ADMIN" "$NAME"); [ -z "$problem" ] || { echo "failed: password refused: $problem"; ui "quit:"; exit 1; }; fi
else
  # One clean form: name and engine as fields; the folder as text plus a button that opens
  # macOS's own folder picker (it has "New Folder"), so the layout stays two aligned rows.
  # Fields use swiftDialog's per-field JSON form: its comma form reads every token as a
  # possible keyword, so "name=name" named the project field ",value=" and the typed name
  # was lost, and a typed comma or "=" broke the field. The password is never passed in
  # (no secret in process arguments) and has no regex (swiftDialog logs failing values).
  while :; do
    [ -n "$PORT" ] || PORT=$(first_free_block)
    answers=$("$DIALOG" "${STYLE[@]}" --title none --json \
      --message "$(t "$L_FORM" "$(short "$FOLDER")")" \
      --textfield "{\"title\":$(js "$F_NAME"),\"name\":\"project\",\"value\":$(js "$NAME"),\"required\":true}" \
      --textfield "{\"title\":$(js "$F_ADMIN"),\"name\":\"admin\",\"value\":$(js "$ADMIN"),\"required\":true}" \
      --textfield "{\"title\":$(js "$F_PASSWORD"),\"name\":\"password\",\"secure\":true,\"confirm\":true,\"required\":true}" \
      --textfield "{\"title\":$(js "$F_PORT"),\"name\":\"port\",\"value\":$(js "$PORT"),\"required\":true,\"regex\":\"^[1-9][0-9]{2,3}0$\",\"regexerror\":$(js "$F_PORT_ERR")}" \
      --selecttitle "$F_ENGINE" --selectvalues "Claude Code,Codex,Pi (ChatGPT)" --selectdefault "$CHOICE" \
      --infobuttontext "$B_CHANGE_FOLDER" --button1text "$B_INSTALL" --button2text "$B_CANCEL" \
      "${SIZE[@]}" --ontop --moveable)
    rc=$?
    # Keys from "name" (and swiftDialog's SelectedOption), never the translated labels.
    field() { printf '%s' "$answers" | plutil -extract "$1" raw -o - - 2>/dev/null; }
    v=$(field project); [ -n "$v" ] && NAME=$v
    v=$(field SelectedOption); [ -n "$v" ] && CHOICE=$v
    v=$(field admin); [ -n "$v" ] && ADMIN=$v
    PASSWORD=$(field password)
    v=$(field port); [ -n "$v" ] && PORT=$v
    answers=""
    case $rc in
      0) problem=$(password_problem "$PASSWORD" "$ADMIN" "$NAME")
         if [ -n "$problem" ]; then
           "$DIALOG" "${STYLE[@]}" --title none --message "$(t "$L_PASSWORD_WEAK" "$problem")" --button1text "$B_BACK" --width 520 --height 300
           continue
         fi
         block_free "$PORT" && break
         "$DIALOG" "${STYLE[@]}" --title none --message "$(t "$L_PORT_BUSY" "$PORT" "$((PORT+9))")" --button1text "$B_BACK" --width 520 --height 300
         PORT="" ;;
      3) PORT=""; start=$FOLDER; [ -d "$start" ] || start=$HOME   # the default folder may not exist yet
         picked=$(osascript -e "POSIX path of (choose folder with prompt \"$F_FOLDER\" default location (POSIX file \"$start\"))" 2>/dev/null) \
           && FOLDER=${picked%/} ;;   # cancel keeps the previous folder
      *) ui "quit:"; exit 0 ;;
    esac
  done
fi
case $FOLDER in "~"*) FOLDER="$HOME${FOLDER#\~}" ;; esac
case $ADMIN in *[!A-Za-z0-9._-]*|"") ADMIN=admin ;; esac
mkdir -p "$FOLDER" || { "$DIALOG" "${STYLE[@]}" --title none --message "$(t "$L_BAD_FOLDER" "$FOLDER")" --button1text "$B_CLOSE"; exit 1; }
case "$CHOICE" in Codex|codex) ENGINE=codex ;; "Pi (ChatGPT)"|pi) ENGINE=pi ;; *) ENGINE=claude ;; esac
SLUG=$(printf '%s' "$NAME" | iconv -f utf-8 -t ascii//TRANSLIT 2>/dev/null | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9]\{1,\}/-/g; s/^-*//; s/-*$//' | cut -c1-31)
case $SLUG in [a-z]?*) ;; *) SLUG="fyso-$SLUG"; SLUG=${SLUG%-} ;; esac
# The slug names the project everywhere (FYSO_PROJECT, sockets, the fyso-<slug> MCP entry in
# desktop agents), so it must be unique among installed and running projects, not only the
# folder. A repeated name gets -2, -3… on both, within Copier's 31-character slug limit.
taken_slugs() {
  [ -f "$REGISTRY" ] && while IFS=$'\t' read -r _ d; do
    [ -f "$d/.copier-answers.yml" ] && sed -n 's/^project_slug: *//p' "$d/.copier-answers.yml"
  done < "$REGISTRY"
  for f in /tmp/fyso-*-*.sock; do [ -e "$f" ] && { f=${f#/tmp/fyso-}; echo "${f%-*}"; }; done
}
used_slugs=" $(taken_slugs | tr '\n' ' ') "
base=$SLUG; n=1; DIR="$FOLDER/$SLUG"
while [ -e "$DIR" ] || case $used_slugs in *" $SLUG "*) true ;; *) false ;; esac; do
  n=$((n+1)); suffix="-$n"; SLUG="$(printf '%s' "$base" | cut -c1-$((31 - ${#suffix})))$suffix"; DIR="$FOLDER/$SLUG"
done
echo "name=$NAME slug=$SLUG dir=$DIR port=$PORT engine=$ENGINE"

# ---------------------------------------------------------------- 2. Fill the progress window
case "$ENGINE" in codex) engine_title=Codex ;; pi) engine_title='Pi (ChatGPT)' ;; *) engine_title='Claude Code' ;; esac
TITLES[$ENGINE_ITEM]=$(t "$T_ENGINE" "$engine_title")
ui "message: $(t "$L_INSTALLING" "$NAME" "$(short "$DIR")")"
for t in "${TITLES[@]}"; do ui "listitem: add, title: $t, status: pending"; done
ui "activate:"
done_count=0; step_done() { done_count=$((done_count+1)); ui "progress: $done_count"; }
# The current step in words under the bar ("Descargando…", "Creando proyecto…").
shown=""; phase() { [ "$1" = "$shown" ] || { ui "progresstext: $1"; shown=$1; }; }
# Step timings go to the log ("timing: <step> <seconds>s") to see what makes the wait long.
INSTALL_START=$(date +%s); mark=$INSTALL_START
timing() { now=$(date +%s); echo "timing: $1 $((now - mark))s"; mark=$now; }
cancelled() { dialog_alive || { echo "cancelled by the person"; [ -n "${DAGU_PID:-}" ] && kill "$DAGU_PID" 2>/dev/null; exit 130; }; }

# 2.1 Apple Command Line Tools (git, and the python3 used below)
item 0 wait "$S_CHECKING"; phase "$P_CHECKING"
if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install >/dev/null 2>&1
  item 0 wait "$S_APPLE"
  ui "message: $L_APPLE"
  until xcode-select -p >/dev/null 2>&1; do sleep 5; cancelled; done
fi
item 0 success; step_done; timing apple
if [ -z "$(git config --global user.email 2>/dev/null)" ]; then GIT_NAME=$(id -F 2>/dev/null || whoami); GIT_EMAIL="$(whoami)@$(scutil --get LocalHostName 2>/dev/null || echo localhost).local"
else GIT_NAME=$(git config --global user.name); GIT_EMAIL=$(git config --global user.email); fi

# 2.2 mise, pinned (Resources/mise-bootstrap.sh is `mise generate install-script`)
item 1 wait "$S_DOWNLOADING"; phase "$(t "$P_DOWNLOADING" "$T_MISE")"; cancelled
MISE=$(command -v mise || true)
if [ -z "$MISE" ]; then
  MISE_INSTALL_PATH="$HOME/.local/bin/mise" sh "$RES/mise-bootstrap.sh" --version || fail 1 "$S_ERROR" "$E_MISE"
  MISE="$HOME/.local/bin/mise"
fi
item 1 success; step_done; timing mise

# 2.3 Dagu (runs the rest of the installation)
item 2 wait "$S_DOWNLOADING"; phase "$(t "$P_DOWNLOADING" "$T_DAGU")"; cancelled
"$MISE" install "$DAGU_TOOL" || fail 2 "$S_ERROR" "$E_DAGU"
item 2 success; step_done; timing dagu

# 2.4 GitHub account: the framework repository is private
item 3 wait "$S_CHECKING"; phase "$P_GITHUB"; cancelled
gh() { "$MISE" exec "$GH_TOOL" -- gh "$@"; }
case $SOURCE in
  gh:*)
    "$MISE" install "$GH_TOOL" || fail 3 "$S_ERROR" "$E_GH"
    if ! gh auth status -h github.com >/dev/null 2>&1; then
      out="$WORK/gh-login.out"; : > "$out"
      ( printf '\n' | gh auth login -h github.com -p https -w > "$out" 2>&1 ) & GH_PID=$!
      code=""; for _ in $(seq 1 30); do code=$(grep -oE '[A-Z0-9]{4}-[A-Z0-9]{4}' "$out" | head -1); [ -n "$code" ] && break; sleep 1; done
      item 3 wait "$(t "$S_CODE" "$code")"
      ui "message: $(t "$L_GH_CODE" "$code")"
      while kill -0 $GH_PID 2>/dev/null; do sleep 2; cancelled; done
      wait $GH_PID || fail 3 "$S_NO_SESSION" "$E_GH_LOGIN"
      ui "message: $(t "$L_INSTALLING" "$NAME" "$(short "$DIR")")"
    fi
    gh auth setup-git -h github.com
    repo=${SOURCE#gh:}
    gh repo view "$repo" --json name >/dev/null 2>&1 || fail 3 "$S_NO_ACCESS" "$(t "$E_NO_ACCESS" "$repo")"
    item 3 success ;;
  *) item 3 success "$S_NOT_NEEDED" ;;
esac
step_done; timing github

# ---------------------------------------------------------------- 3. The workflow
RUN="install-$(date +%Y%m%d%H%M%S)"
# The chosen password travels in a private file that setup reads; it never becomes a
# Dagu parameter (parameters are stored with the run) and is removed when we exit.
PASSWORD_FILE="$WORK/initial-password"
( umask 077; printf '%s\n' "$PASSWORD" > "$PASSWORD_FILE" )   # removed by cleanup
DAGU_HOME="$WORK/dagu"
"$MISE" exec "$DAGU_TOOL" -- dagu start -q --dagu-home "$DAGU_HOME" -r "$RUN" "$RES/fyso-install.yaml" -- \
  "DIR=$DIR" "NAME=$NAME" "SLUG=$SLUG" "PORT=$PORT" "ENGINE=$ENGINE" "SOURCE=$SOURCE" "REF=$REF" \
  "MISE=$MISE" "GIT_NAME=$GIT_NAME" "GIT_EMAIL=$GIT_EMAIL" "ADMIN=$ADMIN" "PASSWORD_FILE=$PASSWORD_FILE" > "$WORK/dagu.out" 2>&1 &
DAGU_PID=$!
# Read each step's state from the run's status file (4 ok, 1 running, 2 failed, 3 skipped, 0 not started).
states() {
  f=$(ls -t "$DAGU_HOME"/data/dag-runs/*/dag-runs/*/*/*/*"_$RUN"/*/status.jsonl 2>/dev/null | head -1)
  [ -n "$f" ] && tail -1 "$f" | /usr/bin/python3 -c 'import json,sys
d=json.loads(sys.stdin.read())
for n in d.get("nodes",[]):
    s=n.get("step",{}); print((s.get("id") or s.get("name"))+"\t"+str(n.get("status",0))+"\t"+(n.get("error") or "").replace("\t"," ").replace("\n"," ")[:120])'
}
# The run's step timings, from the same file (Dagu records when each step started and ended).
dagu_timings() {
  f=$(ls -t "$DAGU_HOME"/data/dag-runs/*/dag-runs/*/*/*/*"_$RUN"/*/status.jsonl 2>/dev/null | head -1)
  [ -n "$f" ] && tail -1 "$f" | /usr/bin/python3 -c 'import json,sys
from datetime import datetime as T
for n in json.loads(sys.stdin.read()).get("nodes",[]):
    a,b=n.get("startedAt") or "",n.get("finishedAt") or ""
    try: secs=(T.fromisoformat(b)-T.fromisoformat(a)).total_seconds()
    except ValueError: continue   # not started or not finished ("-")
    s=n.get("step",{}); print("timing: workflow/%s %ds" % (s.get("id") or s.get("name"), secs))'
}
# Words under the bar for the step that is running (the latest one when tools run in parallel).
step_phase() {
  case $1 in
    generate|trust|git) phase "$P_CREATING" ;;
    setup) phase "$P_KEYS" ;;
    start) phase "$P_STARTING" ;;
    *) phase "$(t "$P_DOWNLOADING" "$2")" ;;
  esac
}
seen=""
apply_states() {
  running=""
  while IFS=$'\t' read -r sid st err; do
    i=4; while [ $i -lt $ENGINE_ITEM ]; do [ "${IDS[$i]}" = "$sid" ] && break; i=$((i+1)); done
    [ $i -lt $ENGINE_ITEM ] || continue
    case $st in
      1) item $i wait "$S_INSTALLING"; running=$i ;;
      4) case " $seen " in *" $sid "*) ;; *) item $i success; step_done; seen="$seen $sid" ;; esac ;;
      2) item $i fail "$S_FAILED"; FAILED_STEP=$i; FAILED_ERR=$err ;;
      3) item $i error "$S_NOT_RUN" ;;
    esac
  done
  [ -z "$running" ] || step_phase "${IDS[$running]}" "${TITLES[$running]}"
}
FAILED_STEP=""
# Process substitution, not a pipe: apply_states must update this shell's variables.
while kill -0 $DAGU_PID 2>/dev/null; do apply_states < <(states); sleep 1; cancelled; done
wait $DAGU_PID; rc=$?
apply_states < <(states)
dagu_timings; timing workflow
if [ $rc -ne 0 ] || [ -n "$FAILED_STEP" ]; then
  echo "step error: ${FAILED_ERR:-dagu exit $rc}"; tail -40 "$WORK/dagu.out"
  fail "${FAILED_STEP:-4}" "$S_FAILED" "$(t "$E_STEP" "${TITLES[${FAILED_STEP:-4}]}")"
fi

# ---------------------------------------------------------------- 4. Coding engine session (optional)
item $ENGINE_ITEM wait "$S_CHECKING"; phase "$(t "$P_ENGINE" "$engine_title")"
if [ "$ENGINE" = pi ]; then
  check="mise exec -- pi auth login openai-codex"
  if (cd "$DIR" && mise exec -- pi auth check --provider openai-codex --no-refresh >/dev/null 2>&1); then item $ENGINE_ITEM success; step_done
  else item $ENGINE_ITEM pending "$(t "$S_LOGIN" "$check")"; step_done; fi
else
  if [ "$ENGINE" = codex ]; then check="codex login status"; else check="claude auth status"; fi
  if command -v "${check%% *}" >/dev/null 2>&1 && $check >/dev/null 2>&1; then item $ENGINE_ITEM success; step_done
  else item $ENGINE_ITEM pending "$(t "$S_LOGIN" "$check")"; step_done; fi
fi

timing engine; echo "timing: total $(( $(date +%s) - INSTALL_START ))s"; phase "$P_DONE"
mkdir -p "$(dirname "$REGISTRY")"; printf '%s\t%s\n' "$PORT" "$DIR" >> "$REGISTRY"
ui "progress: complete"
# The setup step validates and encrypts the chosen local-user password.
pwtext=$PW_CHOSEN
ui "message: $(t "$L_DONE" "$NAME" "http://panel.$SLUG-$PORT.localhost:$PORT" "$ADMIN" "$pwtext")"
# ---------------------------------------------------------------- 5. Connect agents (D36)
# Offer the agents found on this Mac: desktop apps checked, Claude Code CLI as an option.
# The connect screen opens underneath (same size and place) before "Continuar" is enabled,
# so closing the progress window reveals it with no gap. Needs the project's agent:connect.
boxes=(); found=""
if [ -f "$DIR/framework/scripts/agent-connect.cjs" ]; then
  found=$("$MISE" -C "$DIR" exec -- node framework/scripts/agent-connect.cjs --list 2>/dev/null | awk -F'\t' '$2=="found"')
  while IFS=$'\t' read -r id _ kind label; do
    case $id in claude-desktop) label=$A_CLAUDE_DESKTOP ;; codex) label=$A_CODEX ;; claude-code) label=$A_CLAUDE_CODE ;; esac
    [ -n "$id" ] && boxes+=(--checkbox "{\"label\":\"$label\",\"name\":\"$id\",\"checked\":$( [ "$kind" = desktop ] && echo true || echo false )}")
  done <<< "$found"
fi
CONNECT_OUT="$WORK/connect.out"; : > "$CONNECT_OUT"; CONNECT_PID=""
if [ ${#boxes[@]} -gt 0 ] && [ "${FYSO_AUTO:-}" != 1 ]; then
  "$DIALOG" "${STYLE[@]}" --title none \
    --message "$(t "$L_CONNECT" "$NAME" "$SLUG")" \
    ${boxes[@]+"${boxes[@]}"} --button1text "$B_CONNECT" --button2text "$B_SKIP" "${SIZE[@]}" --moveable > "$CONNECT_OUT" &
  CONNECT_PID=$!
  sleep 1; ui "activate:"   # keep the finished progress window in front
fi
if [ ${#boxes[@]} -gt 0 ]; then ui "button1text: $B_CONTINUE"; else ui "button1text: $B_OPEN_PANEL"; fi
ui "button1: enable"
if [ "${FYSO_AUTO:-}" = 1 ]; then sleep 4; ui "quit:"; fi
wait "$DIALOG_PID"

picks=""; connect_out=""
if [ "${FYSO_AUTO:-}" = 1 ]; then picks=${FYSO_CONNECT:-}
elif [ -n "$CONNECT_PID" ]; then
  wait "$CONNECT_PID" && picks=$(sed -n 's/^"*\([a-z-]*\)"* : "*true"*$/\1/p' "$CONNECT_OUT" | tr '\n' ' ')
fi
if [ -n "${picks// /}" ]; then
  connect_out=$("$MISE" -C "$DIR" run agent:connect $picks 2>&1); echo "$connect_out"
fi
[ "${FYSO_AUTO:-}" = 1 ] && { echo "done: http://panel.$SLUG-$PORT.localhost:$PORT"; echo "connect: ${picks:-none}"; exit 0; }
# ---------------------------------------------------------------- 6. Open the assistant
# Next step after connecting: open the desktop assistant with a new conversation about the
# project (agent:open: Codex in the project folder; Claude Desktop restarted to load the server).
open_panel() { open "http://panel.$SLUG-$PORT.localhost:$PORT"; }
case " $picks " in *" codex "*) primary=codex; plabel=Codex ;; *" claude-desktop "*) primary=claude-desktop; plabel=Claude ;; *) primary="" ;; esac
if [ -n "$primary" ]; then
  extra=(); case " $picks " in *" codex "*" claude-desktop "*|*" claude-desktop "*" codex "*) extra=(--infobuttontext "$(t "$B_OPEN" Claude)") ;; esac
  "$DIALOG" "${STYLE[@]}" --title none \
    --message "$(t "$L_READY" "$(printf '%s\n' "$connect_out" | grep -E '^[✓✗]' | sed 's/$/\\n/' | tr -d '\n')" "$plabel" "$NAME" "http://panel.$SLUG-$PORT.localhost:$PORT")" \
    --button1text "$(t "$B_OPEN" "$plabel")" --button2text "$B_OPEN_PANEL" ${extra[@]+"${extra[@]}"} "${SIZE[@]}" --moveable
  case $? in
    0) "$MISE" -C "$DIR" run agent:open "$primary" ;;
    3) "$MISE" -C "$DIR" run agent:open claude-desktop ;;
    *) open_panel ;;
  esac
else
  open_panel
fi
