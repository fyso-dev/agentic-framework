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
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export MISE_YES=1

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
if [ "${FYSO_AUTO:-}" = 1 ]; then
  answers=$(printf 'Nombre del proyecto : %s\nCarpeta : %s\nSelectedOption : %s\n' "${FYSO_NAME:-$default_name}" "${FYSO_FOLDER:-$HOME/Fyso}" "${FYSO_ENGINE:-Claude Code}")
else
answers=$("$DIALOG" --title "Fyso" --icon "SF=shippingbox.fill,colour=#7C3AED" \
  --message "Vamos a crear tu proyecto **Fyso** en esta Mac: bots, flujos de trabajo y un panel para manejarlos.<br><br>Descargamos solo lo necesario y te mostramos cada paso." \
  --textfield "Nombre del proyecto,value=$default_name,required" \
  --textfield "Carpeta,value=$HOME/Fyso,required" \
  --selecttitle "Motor de IA que ya usás" --selectvalues "Claude Code,Codex" --selectdefault "Claude Code" \
  --button1text "Instalar" --button2text "Cancelar" --width 560 --height 420 --moveable) || exit 0
fi
field() { printf '%s\n' "$answers" | sed -n "s/^\"*$1\"* : \"*\(.*[^\"]\)\"*$/\1/p" | head -1; }
NAME=$(field "Nombre del proyecto"); FOLDER=$(field "Carpeta"); CHOICE=$(field "SelectedOption")
NAME=${NAME:-$default_name}; FOLDER=${FOLDER:-$HOME/Fyso}
case $FOLDER in "~"*) FOLDER="$HOME${FOLDER#\~}" ;; esac
ENGINE=claude; [ "$CHOICE" = "Codex" ] && ENGINE=codex
SLUG=$(printf '%s' "$NAME" | iconv -f utf-8 -t ascii//TRANSLIT 2>/dev/null | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9]\{1,\}/-/g; s/^-*//; s/-*$//' | cut -c1-31)
case $SLUG in [a-z]?*) ;; *) SLUG="fyso-$SLUG"; SLUG=${SLUG%-} ;; esac
DIR="$FOLDER/$SLUG"; n=2; while [ -e "$DIR" ]; do DIR="$FOLDER/$SLUG-$n"; n=$((n+1)); done
# First block of ten free ports from 8400 (each project owns one block, PLAN §3.1).
PORT=8400
while [ $PORT -lt 9900 ]; do
  busy=""; p=$PORT; while [ $p -lt $((PORT+10)) ]; do lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1 && busy=1; p=$((p+1)); done
  [ -z "$busy" ] && ! ls /tmp/fyso-*-"$PORT".sock >/dev/null 2>&1 && break
  PORT=$((PORT+10))
done
echo "name=$NAME slug=$SLUG dir=$DIR port=$PORT engine=$ENGINE"

# ---------------------------------------------------------------- 2. Progress window
# Items: fixed preparation steps, then the workflow steps (Resources/steps.tsv: id<TAB>title).
: > "$CMD"
TITLES=("Herramientas de Apple (git)" "mise" "Motor de instalación (Dagu)" "Cuenta de GitHub")
IDS=("" "" "" "")
while IFS=$'\t' read -r sid title; do IDS+=("$sid"); TITLES+=("$title"); done < "$RES/steps.tsv"
ENGINE_ITEM=${#TITLES[@]}; TITLES+=("Sesión de $( [ $ENGINE = codex ] && echo Codex || echo 'Claude Code')")
args=(); for t in "${TITLES[@]}"; do args+=(--listitem "$t"); done
"$DIALOG" --title "Instalando Fyso" --icon "SF=shippingbox.fill,colour=#7C3AED" \
  --message "Preparando **$NAME** en \`$DIR\`" "${args[@]}" \
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
      ui "message: Preparando **$NAME** en \`$DIR\`"
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
DAGU_HOME="$WORK/dagu"
"$MISE" exec "$DAGU_TOOL" -- dagu start -q --dagu-home "$DAGU_HOME" -r "$RUN" "$RES/fyso-install.yaml" -- \
  "DIR=$DIR" "NAME=$NAME" "SLUG=$SLUG" "PORT=$PORT" "ENGINE=$ENGINE" "SOURCE=$SOURCE" "REF=$REF" \
  "MISE=$MISE" "GIT_NAME=$GIT_NAME" "GIT_EMAIL=$GIT_EMAIL" > "$WORK/dagu.out" 2>&1 &
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

ui "progress: complete"
ui "message: **¡Listo!** Tu proyecto **$NAME** está corriendo.<br><br>Panel: http://panel.localhost:$PORT<br>Usuario: admin · contraseña: admin (cambiala después)."
ui "button1text: Abrir panel"; ui "button1: enable"
if [ "${FYSO_AUTO:-}" = 1 ]; then sleep 4; ui "quit:"; wait "$DIALOG_PID"; echo "done: http://panel.localhost:$PORT"; exit 0; fi
wait "$DIALOG_PID" && open "http://panel.localhost:$PORT"
