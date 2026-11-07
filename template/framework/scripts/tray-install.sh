#!/usr/bin/env bash
# Show every running Fyso project in the macOS menu bar (D34): link the SwiftBar plugin
# framework/tray/fyso.10s.py into SwiftBar's plugin folder. One plugin lists all projects,
# so running this from any one project is enough.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
[ "$(uname -s)" = Darwin ] || fail 'the menu bar app is macOS only (SwiftBar).'
[ -d /Applications/SwiftBar.app ] || fail 'SwiftBar is not installed. Install it with: brew install --cask swiftbar, open it once and choose a plugin folder, then run mise run tray:install again.'
dir=$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null || true)
[ -n "$dir" ] && [ -d "$dir" ] || fail 'SwiftBar has no plugin folder yet. Open SwiftBar once, choose a plugin folder, then run mise run tray:install again.'
plugin="$PWD/framework/tray/fyso.10s.py"
chmod +x "$plugin"
ln -sfn "$plugin" "$dir/fyso.10s.py"
# Remember this project, so the menu can start it while it is stopped (others appear once they run).
"$plugin" register "$PWD" || echo "warning: could not remember this project for the Start action." >&2
open -g 'swiftbar://refreshallplugins'
echo "Fyso menu bar plugin linked into $dir. Every running project shows up there."
