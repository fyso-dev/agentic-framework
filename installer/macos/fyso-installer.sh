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

mkdir -p "$WORK"
exec >>"$LOG" 2>&1
echo "=== $(date) Fyso Installer, source $SOURCE@$REF"

ui() { printf '%s\n' "$*" >> "$CMD"; }
item() { ui "listitem: index: $1, status: $2${3:+, statustext: $3}"; }   # wait|success|fail|error|pending
dialog_alive() { kill -0 "$DIALOG_PID" 2>/dev/null; }
fail() {   # index, short text, message for the person
  item "$1" fail "$2"
  echo "failed: ${TITLES[$1]:-step $1}: $2"
  ui "message: **No se pudo completar la instalación.**<br><br>$3<br><br>Al cerrar te abrimos el registro con el detalle técnico."
  ui "button1text: Cerrar"; ui "button1: enable"
  if [ "${FYSO_AUTO:-}" = 1 ]; then sleep 4; ui "quit:"; wait "$DIALOG_PID" 2>/dev/null; exit 1; fi
  wait "$DIALOG_PID" 2>/dev/null; open -e "$LOG"; exit 1
}

# ---------------------------------------------------------------- 1. Welcome form
default_name="Mi proyecto"
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
NAME=$default_name; FOLDER="$HOME/Fyso"; CHOICE="Claude Code"; ADMIN=admin; PASSWORD=admin; PORT=""
if [ "${FYSO_AUTO:-}" = 1 ]; then
  NAME=${FYSO_NAME:-$NAME}; FOLDER=${FYSO_FOLDER:-$FOLDER}; CHOICE=${FYSO_ENGINE:-$CHOICE}
  ADMIN=${FYSO_ADMIN:-$ADMIN}; PASSWORD=${FYSO_PASSWORD:-$PASSWORD}; PORT=${FYSO_PORT:-$(first_free_block)}
else
  # One clean form: name and engine as fields; the folder as text plus a button that opens
  # macOS's own folder picker (it has "New Folder"), so the layout stays two aligned rows.
  while :; do
    [ -n "$PORT" ] || PORT=$(first_free_block)
    answers=$("$DIALOG" "${STYLE[@]}" --title none \
      --message "### Nuevo proyecto\n\nVamos a crear tu proyecto **Fyso** en esta Mac: bots, flujos de trabajo y un panel para manejarlos. Descargamos solo lo necesario y te mostramos cada paso.\n\n**Se crea en** \`$(short "$FOLDER")\`\n\nUsuario y contraseña son para entrar al panel; por defecto \`admin\` / \`admin\`. El puerto es el primero libre: cada proyecto usa un bloque de 10 y no se pisan." \
      --textfield "Nombre del proyecto,value=$NAME,required" \
      --textfield "Usuario del panel,value=$ADMIN,required" \
      --textfield "Contraseña,secure,value=$PASSWORD,required" \
      --textfield "Puerto,value=$PORT,required,regex=^[1-9][0-9][0-9][0-9]?0$,regexerror=Usá un múltiplo de 10 (8400, 8410…)" \
      --selecttitle "Motor de IA que ya usás" --selectvalues "Claude Code,Codex" --selectdefault "$CHOICE" \
      --infobuttontext "Cambiar carpeta…" --button1text "Instalar" --button2text "Cancelar" \
      --width 620 --height 600 --moveable)
    rc=$?
    field() { printf '%s\n' "$answers" | sed -n "s/^\"*$1\"* : \"*\(.*[^\"]\)\"*$/\1/p" | head -1; }
    v=$(field "Nombre del proyecto"); [ -n "$v" ] && NAME=$v
    v=$(field "SelectedOption"); [ -n "$v" ] && CHOICE=$v
    v=$(field "Usuario del panel"); [ -n "$v" ] && ADMIN=$v
    v=$(field "Contraseña"); [ -n "$v" ] && PASSWORD=$v
    v=$(field "Puerto"); [ -n "$v" ] && PORT=$v
    case $rc in
      0) block_free "$PORT" && break
         "$DIALOG" "${STYLE[@]}" --title none --message "### Puerto en uso\n\nEl bloque \`$PORT\`–\`$((PORT+9))\` ya lo usa otro proyecto Fyso u otro programa. Te propongo el siguiente libre." --button1text "Volver" --width 520 --height 300
         PORT="" ;;
      3) PORT=""; start=$FOLDER; [ -d "$start" ] || start=$HOME   # the default folder may not exist yet
         picked=$(osascript -e "POSIX path of (choose folder with prompt \"Elegí dónde crear tu proyecto Fyso\" default location (POSIX file \"$start\"))" 2>/dev/null) \
           && FOLDER=${picked%/} ;;   # cancel keeps the previous folder
      *) exit 0 ;;
    esac
  done
fi
case $FOLDER in "~"*) FOLDER="$HOME${FOLDER#\~}" ;; esac
case $ADMIN in *[!A-Za-z0-9._-]*|"") ADMIN=admin ;; esac
mkdir -p "$FOLDER" || { "$DIALOG" "${STYLE[@]}" --title none --message "### Carpeta no válida\n\nNo pudimos crear \`$FOLDER\`." --button1text "Cerrar"; exit 1; }
ENGINE=claude; [ "$CHOICE" = "Codex" ] && ENGINE=codex
SLUG=$(printf '%s' "$NAME" | iconv -f utf-8 -t ascii//TRANSLIT 2>/dev/null | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9]\{1,\}/-/g; s/^-*//; s/-*$//' | cut -c1-31)
case $SLUG in [a-z]?*) ;; *) SLUG="fyso-$SLUG"; SLUG=${SLUG%-} ;; esac
DIR="$FOLDER/$SLUG"; n=2; while [ -e "$DIR" ]; do DIR="$FOLDER/$SLUG-$n"; n=$((n+1)); done
echo "name=$NAME slug=$SLUG dir=$DIR port=$PORT engine=$ENGINE"

# ---------------------------------------------------------------- 2. Progress window
# Items: fixed preparation steps, then the workflow steps (Resources/steps.tsv: id<TAB>title).
: > "$CMD"
TITLES=("Herramientas de Apple (git)" "mise" "Motor de instalación (Dagu)" "Cuenta de GitHub")
IDS=("" "" "" "")
while IFS=$'\t' read -r sid title; do IDS+=("$sid"); TITLES+=("$title"); done < "$RES/steps.tsv"
ENGINE_ITEM=${#TITLES[@]}; TITLES+=("Sesión de $( [ $ENGINE = codex ] && echo Codex || echo 'Claude Code')")
args=(); for t in "${TITLES[@]}"; do args+=(--listitem "$t"); done
"$DIALOG" "${STYLE[@]}" --title none \
  --message "### Instalando $NAME\n\nEn \`$(short "$DIR")\`" "${args[@]}" \
  --progress ${#TITLES[@]} --commandfile "$CMD" --button1text "Cancelar" \
  --width 620 --height 640 --moveable --ontop &
DIALOG_PID=$!
sleep 1
for i in "${!TITLES[@]}"; do item "$i" pending; done
done_count=0; step_done() { done_count=$((done_count+1)); ui "progress: $done_count"; }
cancelled() { dialog_alive || { echo "cancelled by the person"; [ -n "${DAGU_PID:-}" ] && kill "$DAGU_PID" 2>/dev/null; exit 130; }; }

# 2.1 Apple Command Line Tools (git, and the python3 used below)
item 0 wait "revisando…"
if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install >/dev/null 2>&1
  item 0 wait "aceptá la instalación en la ventana de Apple"
  ui "message: Apple está instalando sus herramientas de desarrollo. Aceptá en su ventana; seguimos solos cuando termine."
  until xcode-select -p >/dev/null 2>&1; do sleep 5; cancelled; done
fi
item 0 success; step_done
if [ -z "$(git config --global user.email 2>/dev/null)" ]; then GIT_NAME=$(id -F 2>/dev/null || whoami); GIT_EMAIL="$(whoami)@$(scutil --get LocalHostName 2>/dev/null || echo localhost).local"
else GIT_NAME=$(git config --global user.name); GIT_EMAIL=$(git config --global user.email); fi

# 2.2 mise, pinned (Resources/mise-bootstrap.sh is `mise generate install-script`)
item 1 wait "descargando…"; cancelled
MISE=$(command -v mise || true)
if [ -z "$MISE" ]; then
  MISE_INSTALL_PATH="$HOME/.local/bin/mise" sh "$RES/mise-bootstrap.sh" --version || fail 1 "error" "No pudimos descargar mise. Revisá tu conexión a internet."
  MISE="$HOME/.local/bin/mise"
fi
item 1 success; step_done

# 2.3 Dagu (runs the rest of the installation)
item 2 wait "descargando…"; cancelled
"$MISE" install "$DAGU_TOOL" || fail 2 "error" "No pudimos descargar Dagu. Revisá tu conexión a internet."
item 2 success; step_done

# 2.4 GitHub account: the framework repository is private
item 3 wait "revisando…"; cancelled
gh() { "$MISE" exec "$GH_TOOL" -- gh "$@"; }
case $SOURCE in
  gh:*)
    "$MISE" install "$GH_TOOL" || fail 3 "error" "No pudimos descargar GitHub CLI."
    if ! gh auth status -h github.com >/dev/null 2>&1; then
      out="$WORK/gh-login.out"; : > "$out"
      ( printf '\n' | gh auth login -h github.com -p https -w > "$out" 2>&1 ) & GH_PID=$!
      code=""; for _ in $(seq 1 30); do code=$(grep -oE '[A-Z0-9]{4}-[A-Z0-9]{4}' "$out" | head -1); [ -n "$code" ] && break; sleep 1; done
      item 3 wait "código $code"
      ui "message: Iniciá sesión en GitHub en la página que se abrió e ingresá este código:<br><br>## $code"
      while kill -0 $GH_PID 2>/dev/null; do sleep 2; cancelled; done
      wait $GH_PID || fail 3 "sin sesión" "No se completó el inicio de sesión en GitHub."
      ui "message: ### Instalando $NAME\\n\\nEn \`$(short "$DIR")\`"
    fi
    gh auth setup-git -h github.com
    repo=${SOURCE#gh:}
    gh repo view "$repo" --json name >/dev/null 2>&1 || fail 3 "sin acceso" "Tu cuenta de GitHub no tiene acceso a **$repo**. Pedile acceso a quien te invitó."
    item 3 success ;;
  *) item 3 success "no hace falta" ;;
esac
step_done

# ---------------------------------------------------------------- 3. The workflow
RUN="install-$(date +%Y%m%d%H%M%S)"
# The chosen password travels in a private file that setup reads; it never becomes a
# Dagu parameter (parameters are stored with the run) and is removed when we exit.
PASSWORD_FILE="$WORK/initial-password"
( umask 077; printf '%s\n' "$PASSWORD" > "$PASSWORD_FILE" ); trap 'rm -f "$PASSWORD_FILE"' EXIT
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
seen=""
apply_states() {
  while IFS=$'\t' read -r sid st err; do
    i=4; while [ $i -lt $ENGINE_ITEM ]; do [ "${IDS[$i]}" = "$sid" ] && break; i=$((i+1)); done
    [ $i -lt $ENGINE_ITEM ] || continue
    case $st in
      1) item $i wait "instalando…" ;;
      4) case " $seen " in *" $sid "*) ;; *) item $i success; step_done; seen="$seen $sid" ;; esac ;;
      2) item $i fail "falló"; FAILED_STEP=$i; FAILED_ERR=$err ;;
      3) item $i error "no se ejecutó" ;;
    esac
  done
}
FAILED_STEP=""
# Process substitution, not a pipe: apply_states must update this shell's variables.
while kill -0 $DAGU_PID 2>/dev/null; do apply_states < <(states); sleep 1; cancelled; done
wait $DAGU_PID; rc=$?
apply_states < <(states)
if [ $rc -ne 0 ] || [ -n "$FAILED_STEP" ]; then
  echo "step error: ${FAILED_ERR:-dagu exit $rc}"; tail -40 "$WORK/dagu.out"
  fail "${FAILED_STEP:-4}" "falló" "Falló el paso **${TITLES[${FAILED_STEP:-4}]}**. Probá de nuevo; si vuelve a fallar, mandanos el registro."
fi

# ---------------------------------------------------------------- 4. Coding engine session (optional)
item $ENGINE_ITEM wait "revisando…"
if [ $ENGINE = codex ]; then check="codex login status"; else check="claude auth status"; fi
if command -v "${check%% *}" >/dev/null 2>&1 && $check >/dev/null 2>&1; then item $ENGINE_ITEM success; step_done
else item $ENGINE_ITEM pending "iniciá sesión: $check"; step_done; fi

mkdir -p "$(dirname "$REGISTRY")"; printf '%s\t%s\n' "$PORT" "$DIR" >> "$REGISTRY"
ui "progress: complete"
# Report the login that really works (a template without the password handoff keeps admin).
login_ok() { curl -s -o /dev/null -w '%{http_code}' -u "$1:$2" "http://panel.localhost:$PORT/" | grep -q 200; }
if [ "$PASSWORD" != admin ] && login_ok "$ADMIN" "$PASSWORD"; then pwtext="la que elegiste"
elif login_ok "$ADMIN" admin; then pwtext="\`admin\` (cambiala con \`mise run secrets\`)"
else pwtext="la que elegiste (no pudimos comprobarla)"; fi
ui "message: ### ¡Listo!\\n\\nTu proyecto **$NAME** está corriendo.\\n\\n**Panel:** http://panel.localhost:$PORT\\n\\n**Usuario:** \`$ADMIN\` · **Contraseña:** $pwtext"
ui "button1text: Continuar"; ui "button1: enable"
if [ "${FYSO_AUTO:-}" = 1 ]; then sleep 4; ui "quit:"; fi
wait "$DIALOG_PID"

# ---------------------------------------------------------------- 5. Connect agents (D36)
# Offer the agents found on this Mac: desktop apps checked, Claude Code CLI as an option.
# Uses the project's own `agent:connect` (templates without it skip this screen).
connect_out=""
if [ -f "$DIR/framework/scripts/agent-connect.cjs" ]; then
  found=$("$MISE" -C "$DIR" exec -- node framework/scripts/agent-connect.cjs --list 2>/dev/null | awk -F'\t' '$2=="found"')
  if [ -n "$found" ]; then
    boxes=()
    while IFS=$'\t' read -r id _ kind label; do
      boxes+=(--checkbox "{\"label\":\"$label\",\"name\":\"$id\",\"checked\":$( [ "$kind" = desktop ] && echo true || echo false )}")
    done <<< "$found"
    if [ "${FYSO_AUTO:-}" = 1 ]; then picks=${FYSO_CONNECT:-}
    else
      out=$("$DIALOG" "${STYLE[@]}" --title none \
        --message "### Conectá tu asistente\n\nAsí podés manejar **$NAME** desde Claude o Codex: crear bots, instalar extensiones, revisar el estado. Agregamos el servidor \`fyso-$SLUG\` a cada uno; las apps de escritorio lo cargan al reiniciarse." \
        "${boxes[@]}" --button1text "Conectar y abrir panel" --button2text "Omitir" --width 620 --height 440 --moveable)
      [ $? -eq 0 ] && picks=$(printf '%s\n' "$out" | sed -n 's/^"*\([a-z-]*\)"* : "*true"*$/\1/p' | tr '\n' ' ')
    fi
    if [ -n "${picks// /}" ]; then
      connect_out=$("$MISE" -C "$DIR" run agent:connect $picks 2>&1); echo "$connect_out"
    fi
  fi
fi
[ "${FYSO_AUTO:-}" = 1 ] && { echo "done: http://panel.localhost:$PORT"; echo "connect: ${picks:-none}"; exit 0; }
if [ -n "$connect_out" ]; then
  "$DIALOG" "${STYLE[@]}" --title none --message "### Asistentes conectados\n\n$(printf '%s\n' "$connect_out" | grep -E '^[✓✗]' | sed 's/$/\\n/' | tr -d '\n')" \
    --button1text "Abrir panel" --width 560 --height 320 --moveable
fi
open "http://panel.localhost:$PORT"
