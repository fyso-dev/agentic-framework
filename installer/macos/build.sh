#!/usr/bin/env bash
# Build "Fyso Installer.app" and Fyso-Installer.dmg (D35) into installer/macos/dist/.
# Everything the app downloads at runtime is pinned here or in the template.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
DIST=dist
APP="$DIST/Fyso Installer.app"

# Pins. Change deliberately (AGENTS.md: never "latest").
MISE_VERSION=2026.11.2
DIALOG_VERSION=3.1.1                                  # swiftDialog, MIT; needs macOS 15+
DIALOG_DMG=swiftDialog-3.1.1-5000.dmg
DIALOG_SHA256=ace4b56ef3d7faefa260e1f95194499a20d7066cad3a57d4f8a7013558f36760

command -v mise >/dev/null || { echo "mise is required to build" >&2; exit 1; }
rm -rf "$DIST"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" .cache

# swiftDialog, verified, copied out of its notarized dmg (no pkg, no admin rights).
cache=".cache/$DIALOG_DMG"
[ -f "$cache" ] || curl -fsSL -o "$cache" "https://github.com/swiftDialog/swiftDialog/releases/download/v$DIALOG_VERSION/$DIALOG_DMG"
echo "$DIALOG_SHA256  $cache" | shasum -a 256 -c - >/dev/null
mnt=$(mktemp -d); hdiutil attach -nobrowse -readonly -mountpoint "$mnt" "$cache" >/dev/null
cp -R "$mnt/Dialog.app" "$APP/Contents/Resources/"; hdiutil detach -quiet "$mnt"

# Pinned mise bootstrap, the workflow and the window's step titles.
mise generate install-script -V "$MISE_VERSION" > "$APP/Contents/Resources/mise-bootstrap.sh"
ids=$(python3 make-dag.py "$ROOT/template/mise.toml.jinja" "$APP/Contents/Resources/fyso-install.yaml")
python3 - "$ids" > "$APP/Contents/Resources/steps.tsv" <<'EOF'
import sys
titles = {"generate": "Proyecto (plantilla Fyso)", "trust": "Configuración del proyecto", "git": "Repositorio git",
          "setup": "Claves y contraseñas", "start": "Arranque", "tool_dagu": "Dagu (flujos de trabajo)",
          "tool_openmausbot": "OpenMausBot (bots)", "tool_process_compose": "process-compose", "tool_caddy": "Caddy (acceso web)",
          "tool_sops": "sops (secretos)", "tool_age": "age (cifrado)", "tool_gitleaks": "gitleaks (seguridad)",
          "tool_node": "Node.js", "tool_yaml": "YAML", "tool_cli": "GitHub CLI"}
order = ["generate", "trust", *sys.argv[1].split(), "setup", "git", "start"]
for sid in order:
    print(f"{sid}\t{titles.get(sid, sid)}")
EOF

# Brand assets (same look as the panel), rendered from SVG with macOS's own tools.
R="$APP/Contents/Resources"; tmp=$(mktemp -d)
# qlmanage silently renders an invalid SVG as a blank image: validate first.
for f in assets/*.svg; do python3 -c 'import sys,xml.dom.minidom; xml.dom.minidom.parse(sys.argv[1])' "$f" || { echo "invalid SVG: $f" >&2; exit 1; }; done
render() { qlmanage -t -s "$2" -o "$tmp" "assets/$1.svg" >/dev/null 2>&1; mv "$tmp/$1.svg.png" "$R/$1.png"; }
render banner 1240 && sips -c 160 1240 "$R/banner.png" >/dev/null    # centre band only
render background 1240
render logo 1024
iconset="$tmp/Fyso.iconset"; mkdir "$iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$R/logo.png" --out "$iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$R/logo.png" --out "$iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$R/Fyso.icns"; rm -rf "$tmp"

# Template ref the app installs from (default main; e.g. INSTALLER_REF=my-branch to test a branch).
sed "s|^REF=\"\${FYSO_REF:-main}\"|REF=\"\${FYSO_REF:-${INSTALLER_REF:-main}}\"|" fyso-installer.sh > "$APP/Contents/MacOS/fyso-installer"
chmod 755 "$APP/Contents/MacOS/fyso-installer"
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Fyso Installer</string>
  <key>CFBundleDisplayName</key><string>Fyso Installer</string>
  <key>CFBundleIdentifier</key><string>dev.fyso.installer</string>
  <key>CFBundleExecutable</key><string>fyso-installer</string>
  <key>CFBundleIconFile</key><string>Fyso</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>15.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
EOF

# Drag-to-Applications disk image.
stage=$(mktemp -d); cp -R "$APP" "$stage/"; ln -s /Applications "$stage/Applications"
hdiutil create -quiet -volname "Fyso" -srcfolder "$stage" -ov -format UDZO "$DIST/Fyso-Installer.dmg"
rm -rf "$stage"
du -sh "$APP" "$DIST/Fyso-Installer.dmg"
