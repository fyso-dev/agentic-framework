#!/usr/bin/env bash
# Build unmodified Tinyauth with its locked upstream dependencies on macOS/Linux.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_DATA FYSO_TINYAUTH_VERSION FYSO_TINYAUTH_SHA256
# Resolve the project's tools before entering upstream source: shims otherwise
# discover the caller's global versions when mise runs tasks from nested folders.
# Resolve through mise itself: its script-task PATH may contain global shims.
go_bin=$(mise which go)
pnpm_bin=$(mise which pnpm)
go_root=$("$go_bin" env GOROOT)
destination="$FYSO_DATA/web-auth/bin"
if [ -x "$destination/tinyauth" ] && [ "$(cat "$destination/version" 2>/dev/null)" = "$FYSO_TINYAUTH_VERSION" ]; then exit 0; fi
umask 077
mkdir -p "$destination"
build=$(mktemp -d "$FYSO_DATA/web-auth/build.XXXXXX")
trap 'rm -rf "$build"' EXIT
curl --fail --silent --show-error --location --proto '=https' \
  "https://codeload.github.com/tinyauthapp/tinyauth/tar.gz/refs/tags/v$FYSO_TINYAUTH_VERSION" -o "$build/source.tar.gz"
node - "$build/source.tar.gz" "$FYSO_TINYAUTH_SHA256" <<'JS'
const fs = require('node:fs'), crypto = require('node:crypto');
if (crypto.createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex') !== process.argv[3]) {
  console.error('Tinyauth source checksum mismatch'); process.exit(1);
}
JS
mkdir "$build/source"
tar -xzf "$build/source.tar.gz" -C "$build/source" --strip-components=1
cd "$build/source/frontend"
"$pnpm_bin" install --frozen-lockfile
"$pnpm_bin" run build
cd ..
cp -R frontend/dist internal/assets/dist
CGO_ENABLED=0 GOTOOLCHAIN=local GOROOT="$go_root" "$go_bin" build -trimpath -ldflags "-X github.com/tinyauthapp/tinyauth/internal/model.Version=$FYSO_TINYAUTH_VERSION" \
  -o "$destination/tinyauth.new" ./cmd/tinyauth
mv "$destination/tinyauth.new" "$destination/tinyauth"
printf '%s\n' "$FYSO_TINYAUTH_VERSION" > "$destination/version"
