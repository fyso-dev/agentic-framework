#!/usr/bin/env bash
# Build "Fyso.app" and Fyso.dmg (D35, D85) into installer/macos/dist/: the menu bar app and
# `fyso` CLI (app/Fyso.swift, compiled with swiftc; no Xcode project) with the installer that
# creates instances bundled inside. EDITION=biz builds "Fyso Biz.app" / Fyso-Biz.dmg.
# Everything the app downloads at runtime is pinned here or in the template.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
DIST=dist
EDITION=${EDITION:-core}
case $EDITION in
  core) APP_NAME=Fyso; BUNDLE_ID=dev.fyso.app; DMG=Fyso.dmg ;;
  biz) APP_NAME="Fyso Biz"; BUNDLE_ID=dev.fyso.biz; DMG=Fyso-Biz.dmg ;;
  *) echo "EDITION must be core or biz" >&2; exit 1 ;;
esac
APP="$DIST/$APP_NAME.app"

# Pins. Change deliberately (AGENTS.md: never "latest").
MISE_VERSION=2026.11.2
DIALOG_VERSION=3.1.1                                  # swiftDialog, MIT; needs macOS 15+
DIALOG_DMG=swiftDialog-3.1.1-5000.dmg
DIALOG_SHA256=ace4b56ef3d7faefa260e1f95194499a20d7066cad3a57d4f8a7013558f36760

command -v mise >/dev/null || { echo "mise is required to build" >&2; exit 1; }
command -v swiftc >/dev/null || { echo "swiftc is required to build (xcode-select --install)" >&2; exit 1; }
rm -rf "$APP" "$DIST/$DMG"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$APP/Contents/Helpers" .cache

# swiftDialog, verified, copied out of its notarized dmg (no pkg, no admin rights).
cache=".cache/$DIALOG_DMG"
[ -f "$cache" ] || curl -fsSL -o "$cache" "https://github.com/swiftDialog/swiftDialog/releases/download/v$DIALOG_VERSION/$DIALOG_DMG"
echo "$DIALOG_SHA256  $cache" | shasum -a 256 -c - >/dev/null
mnt=$(mktemp -d); hdiutil attach -nobrowse -readonly -mountpoint "$mnt" "$cache" >/dev/null
cp -R "$mnt/Dialog.app" "$APP/Contents/Helpers/"; hdiutil detach -quiet "$mnt"

# The web login, built from its pinned source (D87; Helpers/tinyauth, a Mach-O to sign).
./build-tinyauth.sh "$APP"

# Pinned mise bootstrap, the workflow and the window's step titles.
mise generate install-script -V "$MISE_VERSION" > "$APP/Contents/Resources/mise-bootstrap.sh"
ids=$(python3 make-dag.py "$ROOT/template/mise.toml.jinja" "$APP/Contents/Resources/fyso-install.yaml")
# Keep copy in the same locale resources used by the runtime window.
cp -R locales "$APP/Contents/Resources/"
cp app/locales/*.json "$APP/Contents/Resources/locales/"   # menu bar app and CLI copy
for lang in es en; do
  (
    . "locales/$lang.sh"
    for sid in generate trust $ids setup git start; do
      key="STEP_$sid"
      printf '%s\t%s\n' "$sid" "${!key}"
    done
  ) > "$APP/Contents/Resources/steps.$lang.tsv"
done

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
sed "s|^REF=\"\${FYSO_REF:-main}\"|REF=\"\${FYSO_REF:-${INSTALLER_REF:-main}}\"|" fyso-installer.sh > "$APP/Contents/Resources/fyso-installer.sh"
chmod 755 "$APP/Contents/Resources/fyso-installer.sh"
# The executable: menu bar app without arguments, `fyso` CLI with them. Universal, macOS 15+
# (the floor swiftDialog 3.x already sets). A native Mach-O is also what signing needs (PR #65).
bin=$(mktemp -d)
for arch in arm64 x86_64; do
  swiftc -swift-version 5 -O -target "$arch-apple-macos15.0" app/Fyso.swift -o "$bin/fyso-$arch"
done
lipo -create "$bin/fyso-arm64" "$bin/fyso-x86_64" -output "$APP/Contents/MacOS/fyso"; rm -rf "$bin"
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleExecutable</key><string>fyso</string>
  <key>LSUIElement</key><true/>
  <key>FysoEdition</key><string>$EDITION</string>
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
# The mounted volume shows the logo, not the generic grey disk: .VolumeIcon.icns plus the
# volume root's "has custom icon" Finder flag (0x0400). hdiutil does not copy that flag from
# the source folder, so it is set on a writable image, then compressed.
cp "$R/Fyso.icns" "$stage/.VolumeIcon.icns"
rw="$(mktemp -d)/rw.dmg"; mnt=$(mktemp -d)
hdiutil create -quiet -volname "Fyso" -srcfolder "$stage" -ov -format UDRW "$rw"
hdiutil attach -quiet -nobrowse -mountpoint "$mnt" "$rw"
xattr -wx com.apple.FinderInfo "0000000000000000040000000000000000000000000000000000000000000000" "$mnt"
hdiutil detach -quiet "$mnt"
hdiutil convert -quiet "$rw" -format UDZO -ov -o "$DIST/$DMG"; rm -rf "$(dirname "$rw")"
rm -rf "$stage"
du -sh "$APP" "$DIST/$DMG"
